import fs from "node:fs";
import path from "node:path";
import { hoje, normalizarCaminho, registrarInjecao } from "./estado.js";
import { acharMemoria, PASTA, pendenciaVencida, TIPOS } from "./memoria.js";
import { atualizarIndice, entradasEmCache, NOME_INDICE } from "./indice.js";
import { casar } from "./casamento.js";
import { detectarSensivel } from "./sensivel.js";

const TETO_RESUMO = 2000;
const paraBarra = caminho => caminho.split(path.sep).join("/");
const contexto = (evento, texto) => ({ hookSpecificOutput: { hookEventName: evento, additionalContext: texto } });

export function sessionStart(entrada) {
  const memoriaDir = acharMemoria(entrada.cwd ?? process.cwd());
  if (!memoriaDir) return null;
  const { entradas } = atualizarIndice(memoriaDir);
  const dataHoje = hoje();
  const validas = entradas.filter(item => item.erros.length === 0);
  const vigentes = validas.filter(item => item.status === "vigente");
  const contagem = new Map();
  for (const item of vigentes) for (const assunto of item.assuntos) contagem.set(assunto, (contagem.get(assunto) ?? 0) + 1);
  const assuntos = [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([assunto]) => assunto);
  const vencidas = validas.filter(item => pendenciaVencida(item, dataHoje));
  const pasta = paraBarra(path.relative(entrada.cwd ?? process.cwd(), memoriaDir)) || PASTA;
  const linhas = [
    `Memória deste workspace (memory-saver): ${vigentes.length} entrada(s) vigente(s) em ${pasta}/. Índice: ${pasta}/${NOME_INDICE}. Protocolo de escrita: ${pasta}/COMO-USAR.md. Não use a memória automática nativa aqui.`,
  ];
  if (vencidas.length) linhas.push(`Pendências vencidas: ${vencidas.slice(0, 5).map(item => `${pasta}/${item.caminho} (${item.resumo.slice(0, 120)})`).join("; ")}${vencidas.length > 5 ? `; e mais ${vencidas.length - 5} no índice` : ""}`);
  const problemas = entradas.length - validas.length;
  if (problemas) linhas.push(`${problemas} entrada(s) com frontmatter inválido; veja o fim do índice.`);
  let listaAssuntos = "";
  for (const assunto of assuntos) {
    const proximo = listaAssuntos ? `${listaAssuntos}, ${assunto}` : assunto;
    if (linhas.join("\n").length + proximo.length + 40 > TETO_RESUMO) {
      listaAssuntos += ", ...";
      break;
    }
    listaAssuntos = proximo;
  }
  if (listaAssuntos) linhas.push(`Assuntos: ${listaAssuntos}`);
  return contexto("SessionStart", linhas.join("\n").slice(0, TETO_RESUMO));
}

export function userPromptSubmit(entrada) {
  if (!entrada.prompt) return null;
  const cwd = entrada.cwd ?? process.cwd();
  const memoriaDir = acharMemoria(cwd);
  if (!memoriaDir) return null;
  const achadas = casar(entrada.prompt, entradasEmCache(memoriaDir));
  if (!achadas.length) return null;
  registrarInjecao(memoriaDir, achadas.map(item => item.caminho));
  const pasta = paraBarra(path.relative(cwd, memoriaDir)) || PASTA;
  const linhas = achadas.map(item => `- ${pasta}/${item.caminho} - ${item.resumo}`);
  return contexto("UserPromptSubmit", `Memória do workspace ligada a este pedido (leia o que for relevante antes de agir):\n${linhas.join("\n")}`);
}

export function postToolUse(entrada) {
  const arquivo = entrada.tool_input?.file_path ?? entrada.tool_response?.filePath;
  if (!arquivo) return null;
  const absoluto = path.resolve(entrada.cwd ?? process.cwd(), arquivo);
  const memoriaDir = acharMemoria(path.dirname(absoluto));
  if (!memoriaDir) return null;
  const relativo = path.relative(normalizarCaminho(memoriaDir), normalizarCaminho(absoluto));
  if (relativo.startsWith("..") || path.isAbsolute(relativo)) return null;
  const pastaDoTipo = relativo.split(path.sep)[0];
  if (!Object.values(TIPOS).includes(pastaDoTipo) || !absoluto.endsWith(".md")) return null;
  atualizarIndice(memoriaDir);
  if (!fs.existsSync(absoluto)) return null;
  const achados = detectarSensivel(fs.readFileSync(absoluto, "utf8"));
  if (!achados.length) return null;
  const lista = achados.map(achado => `${achado.tipo} (linha ${achado.linha})`).join(", ");
  return {
    decision: "block",
    reason: `memory-saver: possível dado sensível em ${paraBarra(path.relative(path.dirname(memoriaDir), absoluto))}: ${lista}. A memória não guarda dado sensível: remova ou troque por um marcador como <TOKEN> e registre só onde o dado fica.`,
  };
}

const TRATADORES = { SessionStart: sessionStart, UserPromptSubmit: userPromptSubmit, PostToolUse: postToolUse };

export function rodarHook(evento) {
  const tratador = TRATADORES[evento];
  if (!tratador) return;
  try {
    const texto = fs.readFileSync(0, "utf8");
    const saida = tratador(texto.trim() ? JSON.parse(texto) : {});
    if (saida) process.stdout.write(JSON.stringify(saida));
  } catch {
    return;
  }
}
