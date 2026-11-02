import path from "node:path";
import { gravarTexto } from "./estado.js";
import { lerEntradas } from "./memoria.js";

export const ARQUIVO_MAPA = path.join("graphify-out", "graph.json");

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
