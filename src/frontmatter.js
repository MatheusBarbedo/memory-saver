const ORDEM_METADATA = ["type", "modified", "pinned", "expires", "superseded_by", "review"];

function escalar(bruto) {
  const texto = bruto.trim();
  if (/^".*"$/.test(texto)) {
    try { return JSON.parse(texto); } catch { return texto.slice(1, -1); }
  }
  if (/^'.*'$/.test(texto)) return texto.slice(1, -1).replace(/''/g, "'");
  if (texto === "true") return true;
  if (texto === "false") return false;
  return texto;
}

function valor(bruto) {
  const texto = bruto.trim();
  if (texto.startsWith("[") && texto.endsWith("]")) {
    return (texto.slice(1, -1).match(/"(?:[^"\\]|\\.)*"|'[^']*'|[^,]+/g) ?? []).map(escalar).filter(item => item !== "");
  }
  return escalar(texto);
}

const recuo = linha => linha.length - linha.trimStart().length;
const SEM_ASPAS_COM_DOIS_PONTOS = bruto => !/^["'\[{>|]/.test(bruto) && /:(\s|$)/.test(bruto);
const FRONTMATTER_DUPLICADO = /^\s*---\r?\n(?:[ \t]*[A-Za-z_][\w-]*:[^\n]*\r?\n)+\s*---/;

export function lerFrontmatter(texto) {
  const limpo = texto.replace(/^﻿/, "");
  const bloco = limpo.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!bloco) return { dados: null, corpo: limpo, problemas: [] };
  const corpo = limpo.slice(bloco[0].length);
  const problemas = FRONTMATTER_DUPLICADO.test(corpo) ? ["frontmatter duplicado"] : [];
  const dados = {};
  const linhas = bloco[1].split(/\r?\n/);
  let alvo = dados;
  let lista = null;
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha.trim() || linha.trim().startsWith("#")) continue;
    if (recuo(linha) === 0) alvo = dados;
    const item = linha.match(/^\s*-\s+(.*)$/);
    if (item && lista) {
      alvo[lista].push(escalar(item[1]));
      continue;
    }
    const par = linha.match(/^\s*([A-Za-z_][\w-]*):(?:\s+(.*))?$/);
    if (!par) continue;
    const [, chave, bruto = ""] = par;
    if (Object.hasOwn(alvo, chave)) problemas.push(`chave duplicada: ${chave}`);
    lista = null;
    if (/^[>|][-+]?$/.test(bruto.trim())) {
      const continuacao = [];
      while (i + 1 < linhas.length && /^\s+\S/.test(linhas[i + 1])) continuacao.push(linhas[++i].trim());
      alvo[chave] = continuacao.join(" ");
    } else if (bruto.trim() === "") {
      const proxima = linhas.slice(i + 1).find(seguinte => seguinte.trim());
      if (recuo(linha) === 0 && proxima && recuo(proxima) > 0 && /^\s+[A-Za-z_][\w-]*:/.test(proxima)) {
        alvo[chave] = {};
        alvo = alvo[chave];
      } else {
        alvo[chave] = [];
        lista = chave;
      }
    } else {
      if (SEM_ASPAS_COM_DOIS_PONTOS(bruto.trim())) problemas.push(`${chave}: valor com dois pontos precisa de aspas`);
      alvo[chave] = valor(bruto);
    }
  }
  return { dados, corpo, problemas };
}

const precisaAspas = texto => texto === "" || /[:#\[\]{},"']|^\s|\s$|^[-?!&*%@`>|]/.test(texto) || texto === "true" || texto === "false";
const formatarEscalar = item => typeof item === "boolean" ? String(item) : precisaAspas(String(item)) ? JSON.stringify(String(item)) : String(item);

export function escreverFrontmatter({ name, description, metadata }) {
  const linhasMetadata = ORDEM_METADATA
    .filter(chave => metadata[chave] !== undefined && metadata[chave] !== null && metadata[chave] !== "")
    .map(chave => `  ${chave}: ${formatarEscalar(metadata[chave])}`);
  return `---\nname: ${formatarEscalar(name)}\ndescription: ${JSON.stringify(String(description))}\nmetadata:\n${linhasMetadata.join("\n")}\n---\n`;
}
