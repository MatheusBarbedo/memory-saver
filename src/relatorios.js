import fs from "node:fs";
import path from "node:path";
import { arquivoStats, hoje, lerJson, pastaClaude } from "./estado.js";
import { lerEntradas, pendenciaVencida, revisaoVencida, TIPOS } from "./memoria.js";
import { atualizarIndice } from "./indice.js";
import { detectarSensivel } from "./sensivel.js";
import { normalizar } from "./casamento.js";
import { temHooks } from "./instalador.js";

export function status(memoriaDir) {
  const settings = lerJson(path.join(pastaClaude(), "settings.json"), {});
  const instalado = temHooks(settings) && fs.existsSync(path.join(pastaClaude(), "skills", "memory-saver", "SKILL.md"));
  if (!memoriaDir) return { instalado, memoria: null };
  const { entradas } = atualizarIndice(memoriaDir);
  const dataHoje = hoje();
  const porTipo = Object.fromEntries(Object.keys(TIPOS).map(tipo => [tipo, 0]));
  const porStatus = {};
  for (const entrada of entradas.filter(item => item.erros.length === 0)) {
    porTipo[entrada.tipo] += 1;
    porStatus[entrada.status] = (porStatus[entrada.status] ?? 0) + 1;
  }
  return {
    instalado,
    memoria: memoriaDir,
    total: entradas.length,
    porTipo,
    porStatus,
    vencidas: entradas.filter(item => pendenciaVencida(item, dataHoje)).map(item => `${item.caminho} (revisar em ${item.revisar_em})`),
    aRevisar: entradas.filter(item => !pendenciaVencida(item, dataHoje) && revisaoVencida(item, dataHoje)).length,
    invalidas: entradas.filter(item => item.erros.length).map(item => `${item.caminho}: ${item.erros.join("; ")}`),
  };
}

function linksQuebrados(memoriaDir, entrada) {
  const pastaEntrada = path.dirname(path.join(memoriaDir, entrada.caminho));
  const workspace = path.dirname(memoriaDir);
  const existe = alvo => [pastaEntrada, memoriaDir, workspace].some(base => fs.existsSync(path.resolve(base, decodeURI(alvo.split("#")[0]))));
  const quebrados = [];
  for (const [, alvo] of entrada.corpo.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^(https?:|mailto:|#)/i.test(alvo)) continue;
    if (!existe(alvo)) quebrados.push(alvo);
  }
  if (entrada.substituida_por && !existe(entrada.substituida_por)) quebrados.push(`substituida_por: ${entrada.substituida_por}`);
  return quebrados;
}

export function revisar(memoriaDir) {
  atualizarIndice(memoriaDir);
  const entradas = lerEntradas(memoriaDir);
  const dataHoje = hoje();
  const validas = entradas.filter(item => item.erros.length === 0);
  const grupos = new Map();
  for (const entrada of validas.filter(item => item.status === "vigente")) {
    for (const chave of [`titulo:${normalizar(entrada.titulo)}`, `resumo:${normalizar(entrada.resumo)}`, `assuntos:${entrada.tipo}:${entrada.assuntos.map(normalizar).sort().join("|")}`]) {
      if (!grupos.has(chave)) grupos.set(chave, new Set());
      grupos.get(chave).add(entrada.caminho);
    }
  }
  const duplicatas = [...new Set([...grupos.values()].filter(grupo => grupo.size > 1).map(grupo => [...grupo].sort().join(" e ")))];
  return {
    vencidas: validas.filter(item => pendenciaVencida(item, dataHoje)).map(item => `${item.caminho}: ${item.resumo} (revisar em ${item.revisar_em})`),
    aRevisar: validas.filter(item => !pendenciaVencida(item, dataHoje) && revisaoVencida(item, dataHoje)).map(item => `${item.caminho}: ${item.resumo.slice(0, 140)}`),
    duplicatas,
    linksQuebrados: entradas.flatMap(item => linksQuebrados(memoriaDir, item).map(alvo => `${item.caminho}: ${alvo}`)),
    substituidaSemDestino: entradas.filter(item => item.status === "substituida" && !item.substituida_por).map(item => item.caminho),
    invalidas: entradas.filter(item => item.erros.length).map(item => `${item.caminho}: ${item.erros.join("; ")}`),
    sensiveis: entradas.flatMap(item => detectarSensivel(fs.readFileSync(path.join(memoriaDir, item.caminho), "utf8")).map(achado => `${item.caminho}: ${achado.tipo} (linha ${achado.linha})`)),
    valeForaDaqui: validas.filter(item => item.vale_fora_daqui && item.status === "vigente").map(item => `${item.caminho}: ${item.resumo}`),
  };
}

export function stats(memoriaDir) {
  const { entradas } = atualizarIndice(memoriaDir);
  const dados = lerJson(arquivoStats(memoriaDir), { prompts: 0, injecoes: {} });
  const injetadas = Object.entries(dados.injecoes).sort((a, b) => b[1].vezes - a[1].vezes).map(([caminho, info]) => ({ caminho, ...info }));
  const nunca = entradas.filter(item => item.erros.length === 0 && item.status === "vigente" && !dados.injecoes[item.caminho]).map(item => item.caminho);
  return { prompts: dados.prompts, injetadas, nunca };
}
