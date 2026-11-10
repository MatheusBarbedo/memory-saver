import fs from "node:fs";
import path from "node:path";
import { gravarJson, lerJson, pastaEstado } from "./estado.js";
import { cercar, limpar } from "./resumo.js";

export const PASTA_ESTADO = "estado";
export const TETO_HOOK = 9500;
export const LIMITE_ESTADO = 7000;
const MAXIMO_SESSOES = 200;

const normalizar = texto => String(texto).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function lerEstados(memoriaDir) {
  const raiz = path.join(memoriaDir, PASTA_ESTADO);
  if (!fs.existsSync(raiz)) return [];
  return fs.readdirSync(raiz).filter(nome => nome.endsWith(".md") && nome !== "README.md").sort().map(nome => {
    const arquivo = path.join(raiz, nome);
    const texto = fs.readFileSync(arquivo, "utf8").replace(/^﻿/, "");
    const cabecalho = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    const termos = (cabecalho?.[1].match(/^termos:\s*(.+)$/m)?.[1] ?? "").split(",").map(termo => normalizar(termo.trim())).filter(Boolean);
    const corpo = (cabecalho ? texto.slice(cabecalho[0].length) : texto).trim();
    return { contexto: nome.slice(0, -3), termos, corpo, caminho: `${PASTA_ESTADO}/${nome}`, versao: `${PASTA_ESTADO}/${nome}@${fs.statSync(arquivo).mtimeMs}` };
  });
}

export const citaEstado = (prompt, estado) => {
  const texto = normalizar(prompt);
  return estado.termos.some(termo => new RegExp(`(^|[^\\p{L}\\p{N}])${termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "u").test(texto));
};

export function cortarPorLinha(texto, limite, aviso) {
  if (texto.length <= limite) return texto;
  const linhas = texto.split("\n");
  const cabem = [];
  let tamanho = 0;
  for (const linha of linhas) {
    if (tamanho + linha.length + 1 > limite) break;
    cabem.push(linha);
    tamanho += linha.length + 1;
  }
  return `${cabem.join("\n")}\n[${aviso}: ${linhas.length - cabem.length} linhas fora]`;
}

export const caminhosMortos = corpo =>
  [...new Set([...corpo.matchAll(/`([A-Za-z]:[\\/][^`*?<>|{}]+)`/g)].map(achado => achado[1].trim()))].filter(caminho => !fs.existsSync(caminho));

export function blocoDoEstado(estado, pasta) {
  const mortos = caminhosMortos(estado.corpo);
  const atencao = mortos.length ? `\nAtenção: caminhos citados no estado que não existem mais (confira e corrija a linha): ${mortos.map(limpar).join("; ")}` : "";
  return `Estado do projeto ${limpar(estado.contexto)} (${pasta}/${estado.caminho}): o que já existe e funciona. Antes de planejar, diga o que vai reaproveitar daqui e faça só o que falta; se o pedido do dono mostrar que uma linha está velha ou faltando, corrija a linha no arquivo.${atencao}\n` +
    cercar([cortarPorLinha(limpar(estado.corpo), LIMITE_ESTADO, `estado cortado, leia ${pasta}/${estado.caminho}`)]);
}

const arquivoSessoes = () => path.join(pastaEstado(), "estados-injetados.json");

export function esquecerSessao(sessao) {
  if (!sessao) return;
  const arquivo = arquivoSessoes();
  const sessoes = lerJson(arquivo, {});
  if (!(sessao in sessoes)) return;
  delete sessoes[sessao];
  gravarJson(arquivo, sessoes);
}

export function marcarInjetado(sessao, versao) {
  if (!sessao) return true;
  const arquivo = arquivoSessoes();
  const sessoes = lerJson(arquivo, {});
  const ja = sessoes[sessao] ?? [];
  if (ja.includes(versao)) return false;
  sessoes[sessao] = [...ja, versao];
  const chaves = Object.keys(sessoes);
  for (const chave of chaves.slice(0, Math.max(0, chaves.length - MAXIMO_SESSOES))) delete sessoes[chave];
  gravarJson(arquivo, sessoes);
  return true;
}
