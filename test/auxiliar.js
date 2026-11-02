import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { escreverFrontmatter } from "../src/frontmatter.js";

export const escrever = (arquivo, texto) => {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, texto, "utf8");
};

export function criarAmbiente() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "memory-saver-teste-"));
  const ambiente = { tmp, claude: path.join(tmp, "claude"), workspace: path.join(tmp, "workspace") };
  process.env.CLAUDE_CONFIG_DIR = ambiente.claude;
  process.env.MEMORY_SAVER_HOME = path.join(tmp, "estado");
  process.env.MEMORY_SAVER_TETO = tmp;
  fs.mkdirSync(ambiente.workspace, { recursive: true });
  return ambiente;
}

export const registro = (workspace, pasta, contexto, nome, { description, type, modified = "2026-01-01", ...metadata }, corpo = "Fato.\n") =>
  escrever(path.join(workspace, "memoria", pasta, ...(contexto ? [contexto] : []), `${nome}.md`), `${escreverFrontmatter({ name: nome, description, metadata: { type, modified, ...metadata } })}\n${corpo}`);

export const secaoGeral = (workspace, pasta, titulo, data, corpo) => {
  const arquivo = path.join(workspace, "memoria", pasta, "README.md");
  const atual = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, "utf8") : `# ${pasta} gerais\n`;
  escrever(arquivo, `${atual}\n## ${titulo} (${data})\n\n${corpo}\n`);
};
