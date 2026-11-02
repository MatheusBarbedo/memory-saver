import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gravarTexto } from "./estado.js";
import { lerEntradas } from "./memoria.js";

export const PASTA_MAPA = "graphify-out";
export const ARQUIVO_MAPA = path.join(PASTA_MAPA, "graph.json");
const MEMORY_JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "memory.js");
const INSTALADORES = [["uv", ["tool", "install", "graphifyy"]], ["python", ["-m", "uv", "tool", "install", "graphifyy"]], ["py", ["-m", "uv", "tool", "install", "graphifyy"]]];
const SEM_JANELA = { windowsHide: true };

export const graphifyLigado = memoriaDir => fs.existsSync(path.join(memoriaDir, PASTA_MAPA));

export function acharGraphify() {
  const candidatos = process.env.MEMORY_SAVER_GRAPHIFY ? [process.env.MEMORY_SAVER_GRAPHIFY] : ["graphify", path.join(os.homedir(), ".local", "bin", process.platform === "win32" ? "graphify.exe" : "graphify")];
  return candidatos.find(candidato => !spawnSync(candidato, ["--help"], { stdio: "ignore", ...SEM_JANELA }).error) ?? null;
}

export function instalarGraphify() {
  for (const [comando, args] of INSTALADORES) {
    if (spawnSync(comando, args, { stdio: "inherit", ...SEM_JANELA }).status === 0) return acharGraphify();
  }
  return null;
}

export function agruparMapa(memoriaDir) {
  const graphify = acharGraphify();
  if (!graphify) return false;
  return spawnSync(graphify, ["cluster-only", "."], { cwd: memoriaDir, env: { ...process.env, GRAPHIFY_BACKEND: "none" }, stdio: "ignore", ...SEM_JANELA }).status === 0;
}

export function refazerMapaEmSegundoPlano(memoriaDir) {
  const filho = spawn(process.execPath, [MEMORY_JS, "mapa", path.dirname(memoriaDir)], { detached: true, stdio: "ignore", ...SEM_JANELA });
  filho.on("error", () => {});
  filho.unref();
}

export function gerarMapa(memoriaDir) {
  const entradas = lerEntradas(memoriaDir).filter(entrada => entrada.erros.length === 0);
  const nos = new Map();
  const arestas = [];
  const no = (id, label, source_file, extra = {}) => {
    if (!nos.has(id)) nos.set(id, { id, label, file_type: "document", source_file, ...extra });
    return id;
  };
  const ligar = (source, target, relation, source_file) => arestas.push({ source, target, relation, confidence: "EXTRACTED", source_file });

  const porNome = new Map();
  for (const entrada of entradas) {
    const id = no(`registro:${entrada.id}`, entrada.secao ?? entrada.name, entrada.caminho, { descricao: entrada.description, tipo: entrada.tipo, pasta: entrada.pasta, contexto: entrada.contexto ?? "geral" });
    ligar(id, no(`contexto:${entrada.contexto ?? "geral"}`, `contexto ${entrada.contexto ?? "geral"}`, "memoria", { file_type: "concept" }), "pertence_a", entrada.caminho);
    ligar(id, no(`tipo:${entrada.pasta}`, `tipo ${entrada.pasta}`, "memoria", { file_type: "concept" }), "pertence_a", entrada.caminho);
    for (const chave of [entrada.name, path.posix.basename(entrada.caminho, ".md")]) if (!porNome.has(chave)) porNome.set(chave, id);
  }
  for (const entrada of entradas) {
    const origem = `registro:${entrada.id}`;
    for (const [, alvo] of entrada.corpo.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
      const destino = porNome.get(alvo.trim());
      if (destino && destino !== origem) ligar(origem, destino, "cita", entrada.caminho);
    }
    const substituta = entrada.superseded_by && porNome.get(entrada.superseded_by);
    if (substituta) ligar(origem, substituta, "substituida_por", entrada.caminho);
  }

  const grafo = { directed: true, multigraph: false, graph: {}, nodes: [...nos.values()], links: arestas };
  gravarTexto(path.join(memoriaDir, ARQUIVO_MAPA), JSON.stringify(grafo, null, 2) + "\n");
  return grafo;
}
