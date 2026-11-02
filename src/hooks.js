import fs from "node:fs";
import path from "node:path";
import { hoje, normalizarCaminho, registrarInjecao } from "./estado.js";
import { acharMemoria, contextoAberto, lerEntradas, PASTA, PASTAS } from "./memoria.js";
import { atualizarIndice } from "./indice.js";
import { casar } from "./casamento.js";
import { cercar, limpar, montarResumo } from "./resumo.js";
import { detectarSensivel } from "./sensivel.js";
import { graphifyLigado, refazerMapaEmSegundoPlano } from "./mapa.js";

const paraBarra = caminho => caminho.split(path.sep).join("/");
const contexto = (evento, texto) => ({ hookSpecificOutput: { hookEventName: evento, additionalContext: texto } });

export function sessionStart(entrada) {
  const cwd = entrada.cwd ?? process.cwd();
  const memoriaDir = acharMemoria(cwd);
  if (!memoriaDir) return null;
  const { entradas } = atualizarIndice(memoriaDir);
  const pasta = paraBarra(path.relative(cwd, memoriaDir)) || PASTA;
  return contexto("SessionStart", montarResumo(entradas, { pasta, contexto: contextoAberto(cwd), dataHoje: hoje() }));
}

export function userPromptSubmit(entrada) {
  if (!entrada.prompt) return null;
  const cwd = entrada.cwd ?? process.cwd();
  const memoriaDir = acharMemoria(cwd);
  if (!memoriaDir) return null;
  const achadas = casar(entrada.prompt, lerEntradas(memoriaDir), { contexto: contextoAberto(cwd), dataHoje: hoje() });
  if (!achadas.length) return null;
  registrarInjecao(memoriaDir, achadas.map(item => item.id));
  const pasta = paraBarra(path.relative(cwd, memoriaDir)) || PASTA;
  const linhas = achadas.map(item => `- ${pasta}/${limpar(item.caminho)}${item.geral ? ` (seção "${limpar(item.secao)}")` : ""}${item.superseded_by ? ` (substituída por ${limpar(item.superseded_by)})` : ""} - ${limpar(item.description).replace(/\s+/g, " ").slice(0, 256)}`);
  return contexto("UserPromptSubmit", `Registros da memória ligados a este pedido (leia o que for relevante antes de agir):\n${cercar(linhas)}`);
}

export function postToolUse(entrada) {
  const arquivo = entrada.tool_input?.file_path ?? entrada.tool_response?.filePath;
  if (!arquivo) return null;
  const absoluto = path.resolve(entrada.cwd ?? process.cwd(), arquivo);
  const memoriaDir = acharMemoria(path.dirname(absoluto));
  if (!memoriaDir) return null;
  const relativo = path.relative(normalizarCaminho(memoriaDir), normalizarCaminho(absoluto));
  if (relativo.startsWith("..") || path.isAbsolute(relativo)) return null;
  if (!PASTAS.includes(relativo.split(path.sep)[0]) || !absoluto.endsWith(".md")) return null;
  const { entradas } = atualizarIndice(memoriaDir);
  if (graphifyLigado(memoriaDir)) refazerMapaEmSegundoPlano(memoriaDir);
  if (!fs.existsSync(absoluto)) return null;
  const nome = paraBarra(path.relative(path.dirname(memoriaDir), absoluto));
  const avisos = [];
  const invalida = entradas.find(item => item.caminho === paraBarra(relativo) && item.erros.length);
  if (invalida) avisos.push(`frontmatter inválido em ${nome}: ${invalida.erros.join("; ")}`);
  const achados = detectarSensivel(fs.readFileSync(absoluto, "utf8"));
  if (achados.length) avisos.push(`possível dado sensível em ${nome}: ${achados.map(achado => `${achado.tipo} (linha ${achado.linha})`).join(", ")}. A memória não guarda dado sensível: remova ou troque por um marcador como <TOKEN> e registre só onde o dado fica`);
  return avisos.length ? contexto("PostToolUse", `memory-saver: ${avisos.join(". ")}.`) : null;
}

const TRATADORES = { SessionStart: sessionStart, UserPromptSubmit: userPromptSubmit, PostToolUse: postToolUse };
const AVISO_QUEBRADO = "memory-saver: não consegui ler a memória deste workspace; rode: node memory.js status";

export function rodarHook(evento) {
  let saida = {};
  try {
    const tratador = TRATADORES[evento];
    if (tratador) {
      const texto = fs.readFileSync(0, "utf8");
      let payload = {};
      try { payload = texto.trim() ? JSON.parse(texto) : {}; } catch { payload = null; }
      if (payload) {
        try { saida = tratador(payload) ?? {}; } catch { saida = evento === "SessionStart" ? { systemMessage: AVISO_QUEBRADO } : {}; }
      }
    }
  } catch {
    saida = {};
  }
  process.stdout.write(JSON.stringify(saida));
}
