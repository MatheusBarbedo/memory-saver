import { expirada } from "./memoria.js";

export const LIMITE_PONTEIROS = 5;
const PESO_FORTE = 3;
const PESO_DESCRICAO = 2;
const PESO_CORPO = 1;
const FATOR_MINIMO = 0.55;
const FATOR_MAXIMO = 1.5;
const FRACAO_TERMO_RARO = 0.1;
const BONUS_CONTEXTO = 1.5;
const LIMITE_TERMOS_COM_UM_ACERTO = 2;
const ID = /^[a-z][a-z0-9]{1,9}-\d+$/;

const PARADAS = new Set("a o as os um uma uns umas de do da dos das em no na nos nas ao aos para pra por com sem sobre entre ate que se e ou mas nao sim ja mais menos muito muita como quando onde qual quais quem esse essa esses essas este esta estes estas isso isto aquilo eu me meu minha voce vc ele ela eles elas nos seu sua seus suas ser estar ter ha foi sao era vai vou faz fazer pode posso preciso quero favor ver the and for with".split(" "));

export const normalizar = texto => ` ${String(texto).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;

const raiz = termo => termo.length > 4 && termo.endsWith("s") ? termo.slice(0, -1) : termo;

export function termos(texto) {
  const base = String(texto).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const lista = [];
  for (const [composto] of base.matchAll(/[a-z0-9]+(?:-[a-z0-9]+)*/g)) {
    const partes = composto.split("-");
    for (const termo of partes.length > 1 ? [composto, ...partes] : partes) {
      if (termo.length >= 2 && !PARADAS.has(termo)) lista.push(raiz(termo));
    }
  }
  return lista;
}

export function autoridade(entrada) {
  let fator = 1;
  if (entrada.tipo === "decision") fator += 0.15;
  if (entrada.tipo === "feedback") fator += 0.12;
  if (/checkpoint/.test(entrada.name)) fator -= 0.15;
  if (entrada.pinned) fator += 0.08;
  fator = Math.min(FATOR_MAXIMO, Math.max(FATOR_MINIMO, fator));
  return entrada.superseded_by ? Math.min(fator, 0.65) : fator;
}

const caminhoSemReadme = entrada => entrada.caminho.replace(/\.md$/, "").replace(/\/README$/, "");

function indexar(entrada) {
  return {
    forte: new Set(termos(`${entrada.name} ${entrada.contexto ?? ""} ${caminhoSemReadme(entrada)} ${entrada.secao ?? ""}`)),
    descricao: new Set(termos(entrada.description)),
    corpo: new Set(termos(entrada.corpo)),
  };
}

export function casar(prompt, entradas, { limite = LIMITE_PONTEIROS, contexto = null, dataHoje = null } = {}) {
  const consulta = [...new Set(termos(prompt))];
  if (!consulta.length) return [];
  const candidatas = entradas.filter(entrada => entrada.erros.length === 0 && !(dataHoje && expirada(entrada, dataHoje)));
  const indices = candidatas.map(indexar);
  const total = candidatas.length;
  const frequencia = new Map();
  for (const termo of consulta) frequencia.set(termo, indices.filter(i => i.forte.has(termo) || i.descricao.has(termo) || i.corpo.has(termo)).length);
  const idf = termo => Math.log(1 + (total - frequencia.get(termo) + 0.5) / (frequencia.get(termo) + 0.5));
  const pontuadas = [];
  candidatas.forEach((entrada, posicao) => {
    const campos = indices[posicao];
    let soma = 0;
    let acertos = 0;
    let fortes = 0;
    let raroForte = false;
    for (const termo of consulta) {
      const peso = campos.forte.has(termo) ? PESO_FORTE : campos.descricao.has(termo) ? PESO_DESCRICAO : campos.corpo.has(termo) ? PESO_CORPO : 0;
      if (!peso) continue;
      acertos += 1;
      if (peso >= PESO_DESCRICAO) fortes += 1;
      if (peso === PESO_FORTE && (ID.test(termo) || (termo.length >= 4 && consulta.length <= LIMITE_TERMOS_COM_UM_ACERTO && frequencia.get(termo) / total <= FRACAO_TERMO_RARO))) raroForte = true;
      soma += peso * idf(termo);
    }
    if (!((acertos >= 2 && fortes >= 1) || raroForte)) return;
    pontuadas.push({ entrada, pontos: soma * autoridade(entrada) * (contexto !== null && entrada.contexto === contexto ? BONUS_CONTEXTO : 1) });
  });
  return pontuadas
    .sort((a, b) => b.pontos - a.pontos || String(b.entrada.modified ?? "").localeCompare(String(a.entrada.modified ?? "")) || a.entrada.id.localeCompare(b.entrada.id))
    .slice(0, limite)
    .map(({ entrada }) => entrada);
}
