import fs from "node:fs";
import path from "node:path";
import { arquivoStats, hoje, lerJson, pastaClaude } from "./estado.js";
import { ativa, expirada, lerEntradas, pendenciaVencida, PASTAS, revisaoVencida } from "./memoria.js";
import { detectarSensivel } from "./sensivel.js";
import { normalizar, termos } from "./casamento.js";
import { temHooks } from "./instalador.js";
import { graphifyLigado } from "./mapa.js";

const LIMIAR_DUPLICATA = 0.5;
const LIMIAR_MESMO_ASSUNTO = 0.4;
const NEGACAO = new Set(["nunca", "nao", "evite", "jamais", "proibido"]);
const AFIRMACAO = new Set(["sempre", "use", "usar", "faca", "deve"]);
const MARCADORES = new Set([...NEGACAO, ...AFIRMACAO]);

export function status(memoriaDir) {
  const settings = lerJson(path.join(pastaClaude(), "settings.json"), {});
  const instalado = temHooks(settings) && fs.existsSync(path.join(pastaClaude(), "skills", "memory-saver", "SKILL.md"));
  if (!memoriaDir) return { instalado, memoria: null };
  const entradas = lerEntradas(memoriaDir);
  const dataHoje = hoje();
  const validas = entradas.filter(item => item.erros.length === 0);
  const porPasta = Object.fromEntries(PASTAS.map(pasta => [pasta, validas.filter(item => item.pasta === pasta).length]));
  const porContexto = {};
  for (const item of validas) porContexto[item.contexto ?? "geral"] = (porContexto[item.contexto ?? "geral"] ?? 0) + 1;
  return {
    instalado,
    memoria: memoriaDir,
    graphify: graphifyLigado(memoriaDir),
    total: entradas.length,
    ativos: validas.filter(item => ativa(item, dataHoje)).length,
    porPasta,
    porContexto,
    vencidas: validas.filter(item => pendenciaVencida(item, dataHoje)).map(item => `${item.id} (revisar em ${item.review})`),
    expiradas: validas.filter(item => expirada(item, dataHoje)).map(item => `${item.id} (expirou em ${item.expires})`),
    invalidas: entradas.filter(item => item.erros.length).map(item => `${item.id}: ${item.erros.join("; ")}`),
  };
}

const jaccard = (a, b) => {
  const uniao = new Set([...a, ...b]).size;
  if (!uniao) return 0;
  let comum = 0;
  for (const termo of a) if (b.has(termo)) comum += 1;
  return comum / uniao;
};

const polaridade = texto => {
  const palavras = normalizar(texto).trim().split(" ");
  const nega = palavras.some(palavra => NEGACAO.has(palavra));
  const afirma = palavras.some(palavra => AFIRMACAO.has(palavra));
  return nega ? -1 : afirma ? 1 : 0;
};

const pares = lista => lista.flatMap((a, i) => lista.slice(i + 1).map(b => [a, b]));
const comMarcadores = texto => new Set(termos(texto).filter(termo => !MARCADORES.has(termo)));

function linksQuebrados(entradas) {
  const existentes = new Set(entradas.flatMap(item => [item.name, path.posix.basename(item.caminho, ".md")]));
  return entradas.flatMap(item => [...item.corpo.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)]
    .map(([, alvo]) => alvo.trim())
    .filter(alvo => !existentes.has(alvo))
    .map(alvo => `${item.id}: [[${alvo}]]`));
}

export function lint(memoriaDir) {
  const entradas = lerEntradas(memoriaDir);
  const dataHoje = hoje();
  const validas = entradas.filter(item => item.erros.length === 0);
  const vigentes = validas.filter(item => ativa(item, dataHoje));
  const comTermos = vigentes.map(item => ({ item, conteudo: new Set(termos(`${item.description} ${item.corpo}`)), assunto: comMarcadores(item.description) }));
  const existentes = new Set(validas.flatMap(item => [item.name, path.posix.basename(item.caminho, ".md")]));
  const nomesRepetidos = [...Map.groupBy(validas.filter(item => !item.geral), item => `${item.pasta}:${item.name}`).values()].filter(grupo => grupo.length > 1).map(grupo => grupo.map(item => item.id).join(" e "));
  return {
    invalidas: entradas.filter(item => item.erros.length).map(item => `${item.id}: ${item.erros.join("; ")}`),
    duplicatas: pares(comTermos).filter(([a, b]) => jaccard(a.conteudo, b.conteudo) >= LIMIAR_DUPLICATA).map(([a, b]) => `${a.item.id} e ${b.item.id} (Jaccard ${jaccard(a.conteudo, b.conteudo).toFixed(2)})`),
    nomesRepetidos,
    contradicoes: pares(comTermos).filter(([a, b]) => polaridade(a.item.description) * polaridade(b.item.description) === -1 && jaccard(a.assunto, b.assunto) >= LIMIAR_MESMO_ASSUNTO).map(([a, b]) => `${a.item.id} x ${b.item.id}: "${a.item.description}" / "${b.item.description}"`),
    linksQuebrados: linksQuebrados(validas),
    substituidaSemDestino: validas.filter(item => item.superseded_by && !existentes.has(item.superseded_by)).map(item => `${item.id}: superseded_by ${item.superseded_by}`),
    vencidas: validas.filter(item => pendenciaVencida(item, dataHoje)).map(item => `${item.id}: ${item.description} (revisar em ${item.review})`),
    aRevisar: validas.filter(item => revisaoVencida(item, dataHoje)).map(item => `${item.id}: ${item.description.slice(0, 140)}`),
    expiradas: validas.filter(item => expirada(item, dataHoje)).map(item => `${item.id} (expirou em ${item.expires})`),
    sensiveis: [...new Set(entradas.map(item => item.caminho))].flatMap(caminho => detectarSensivel(fs.readFileSync(path.join(memoriaDir, caminho), "utf8")).map(achado => `${caminho}: ${achado.tipo} (linha ${achado.linha})`)),
  };
}

export function stats(memoriaDir) {
  const entradas = lerEntradas(memoriaDir);
  const dados = lerJson(arquivoStats(memoriaDir), { prompts: 0, injecoes: {} });
  const injetadas = Object.entries(dados.injecoes).sort((a, b) => b[1].vezes - a[1].vezes).map(([caminho, info]) => ({ caminho, ...info }));
  const dataHoje = hoje();
  const nunca = entradas.filter(item => ativa(item, dataHoje) && !dados.injecoes[item.id]).map(item => item.id);
  return { prompts: dados.prompts, injetadas, nunca };
}
