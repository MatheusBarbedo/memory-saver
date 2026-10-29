const ORDEM = ["titulo", "resumo", "tipo", "assuntos", "escopo", "status", "criado", "atualizado", "revisar_em", "substituida_por", "vale_fora_daqui"];

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

export function lerFrontmatter(texto) {
  const limpo = texto.replace(/^﻿/, "");
  const bloco = limpo.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!bloco) return { dados: null, corpo: limpo };
  const dados = {};
  const linhas = bloco[1].split(/\r?\n/);
  let lista = null;
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha.trim() || linha.trim().startsWith("#")) continue;
    const item = linha.match(/^\s*-\s+(.*)$/);
    if (item && lista) {
      dados[lista].push(escalar(item[1]));
      continue;
    }
    const par = linha.match(/^\s*([A-Za-z_][\w-]*):(?:\s+(.*))?$/);
    if (!par) continue;
    const [, chave, bruto = ""] = par;
    lista = null;
    if (/^[>|][-+]?$/.test(bruto.trim())) {
      const continuacao = [];
      while (i + 1 < linhas.length && /^\s+\S/.test(linhas[i + 1])) continuacao.push(linhas[++i].trim());
      dados[chave] = continuacao.join(" ");
    } else if (bruto.trim() === "") {
      dados[chave] = [];
      lista = chave;
    } else {
      dados[chave] = valor(bruto);
    }
  }
  return { dados, corpo: limpo.slice(bloco[0].length) };
}

const precisaAspas = texto => texto === "" || /[:#\[\]{},"']|^\s|\s$|^[-?!&*%@`>|]/.test(texto) || texto === "true" || texto === "false";
const formatarEscalar = item => typeof item === "boolean" ? String(item) : precisaAspas(String(item)) ? JSON.stringify(String(item)) : String(item);

export function escreverFrontmatter(dados) {
  const linhas = ORDEM
    .filter(chave => dados[chave] !== undefined && dados[chave] !== null && dados[chave] !== "")
    .map(chave => `${chave}: ${Array.isArray(dados[chave]) ? `[${dados[chave].map(formatarEscalar).join(", ")}]` : formatarEscalar(dados[chave])}`);
  return `---\n${linhas.join("\n")}\n---\n`;
}
