import fs from "node:fs";
import path from "node:path";
import { gravarJson, lerJson, pastaEstado } from "./estado.js";
import { cercar, limpar } from "./resumo.js";

export const PASTA_ESTADO = "estado";
const LIMITE_ESTADO = 20000;
const MAXIMO_SESSOES = 200;

const normalizar = texto => String(texto).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function lerEstados(memoriaDir) {
  const raiz = path.join(memoriaDir, PASTA_ESTADO);
  if (!fs.existsSync(raiz)) return [];
  return fs.readdirSync(raiz).filter(nome => nome.endsWith(".md") && nome !== "README.md").sort().map(nome => {
    const texto = fs.readFileSync(path.join(raiz, nome), "utf8").replace(/^﻿/, "");
    const cabecalho = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    const termos = (cabecalho?.[1].match(/^termos:\s*(.+)$/m)?.[1] ?? "").split(",").map(termo => normalizar(termo.trim())).filter(Boolean);
    return { contexto: nome.slice(0, -3), termos, corpo: (cabecalho ? texto.slice(cabecalho[0].length) : texto).trim(), caminho: `${PASTA_ESTADO}/${nome}` };
  });
}

export const citaEstado = (prompt, estado) => {
  const texto = normalizar(prompt);
  return estado.termos.some(termo => new RegExp(`(^|[^\\p{L}\\p{N}])${termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "u").test(texto));
};

export const blocoDoEstado = (estado, pasta) =>
  `Estado do projeto ${limpar(estado.contexto)} (${pasta}/${estado.caminho}): o que já existe e funciona. Antes de planejar, diga o que vai reaproveitar daqui e faça só o que falta; se o pedido do dono mostrar que uma linha está velha ou faltando, corrija o arquivo.\n` +
  cercar([limpar(estado.corpo).slice(0, LIMITE_ESTADO)]);

const arquivoSessoes = () => path.join(pastaEstado(), "estados-injetados.json");

export function marcarInjetado(sessao, caminho) {
  if (!sessao) return true;
  const arquivo = arquivoSessoes();
  const sessoes = lerJson(arquivo, {});
  const ja = sessoes[sessao] ?? [];
  if (ja.includes(caminho)) return false;
  sessoes[sessao] = [...ja, caminho];
  const chaves = Object.keys(sessoes);
  for (const chave of chaves.slice(0, Math.max(0, chaves.length - MAXIMO_SESSOES))) delete sessoes[chave];
  gravarJson(arquivo, sessoes);
  return true;
}
