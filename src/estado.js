import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export const pastaEstado = () => process.env.MEMORY_SAVER_HOME || path.join(os.homedir(), ".memory-saver");
export const pastaClaude = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");

export const lerTexto = arquivo => fs.existsSync(arquivo) ? fs.readFileSync(arquivo, "utf8") : null;

export function gravarTexto(arquivo, texto) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const temporario = `${arquivo}.${process.pid}.tmp`;
  fs.writeFileSync(temporario, texto, "utf8");
  fs.renameSync(temporario, arquivo);
}

export function lerJson(arquivo, padrao = null) {
  const texto = lerTexto(arquivo);
  if (texto === null) return padrao;
  try { return JSON.parse(texto.replace(/^﻿/, "")); } catch { return padrao; }
}

export const gravarJson = (arquivo, valor) => gravarTexto(arquivo, JSON.stringify(valor, null, 2) + "\n");

export const normalizarCaminho = caminho => {
  const resolvido = path.resolve(caminho);
  return process.platform === "win32" ? resolvido.toLowerCase() : resolvido;
};

const chaveDe = memoriaDir => crypto.createHash("sha1").update(normalizarCaminho(memoriaDir)).digest("hex").slice(0, 16);

export const arquivoStats = memoriaDir => path.join(pastaEstado(), "stats", `${chaveDe(memoriaDir)}.json`);
export const arquivoWorkspaces = () => path.join(pastaEstado(), "workspaces.json");

export function hoje(data = new Date()) {
  const doisDigitos = numero => String(numero).padStart(2, "0");
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

export function registrarInjecao(memoriaDir, caminhos) {
  const arquivo = arquivoStats(memoriaDir);
  const stats = lerJson(arquivo, { memoria: memoriaDir, prompts: 0, injecoes: {} });
  stats.prompts += 1;
  for (const caminho of caminhos) {
    const atual = stats.injecoes[caminho] ?? { vezes: 0, ultima: null };
    stats.injecoes[caminho] = { vezes: atual.vezes + 1, ultima: hoje() };
  }
  gravarJson(arquivo, stats);
}
