import fs from "node:fs";
import path from "node:path";
import { cercar, limpar } from "./resumo.js";

export const ARQUIVO_HANDOFF = "HANDOFF.md";
const LIMITE_HANDOFF = 3000;

export function contextoDoHandoff(memoriaDir) {
  const arquivo = path.join(memoriaDir, ARQUIVO_HANDOFF);
  if (!fs.existsSync(arquivo)) return null;
  const bruto = limpar(fs.readFileSync(arquivo, "utf8")).trim();
  const conteudo = bruto.split(/^## .+$/m).slice(1).map(secao => secao.trim()).filter(Boolean).join("\n\n");
  if (!conteudo) return null;
  const trecho = conteudo.slice(0, LIMITE_HANDOFF);
  const linhas = trecho.split(/\r?\n/);
  if (conteudo.length > LIMITE_HANDOFF) linhas.push("[handoff truncado; consulte memoria/HANDOFF.md]");
  return `Handoff de outro agente (estado temporário; confirme antes de agir):\n${cercar(linhas)}`;
}
