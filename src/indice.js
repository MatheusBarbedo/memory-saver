import path from "node:path";
import { gravarTexto, hoje, lerTexto } from "./estado.js";
import { ativa, expirada, fixadas, lerEntradas, PASTAS, pendenciaVencida } from "./memoria.js";

export const NOME_INDICE = "INDICE.md";

const notas = entrada => [
  entrada.tipo,
  entrada.pinned && "fixada",
  entrada.superseded_by && `substituída por ${entrada.superseded_by}`,
  entrada.expires && `expira ${entrada.expires}`,
].filter(Boolean).join(", ");

const linhaEntrada = entrada => `- [${entrada.secao ?? entrada.name}](${encodeURI(entrada.caminho)}) - ${entrada.description} (${notas(entrada)})`;

export function gerarIndice(entradas, dataHoje = hoje()) {
  const validas = entradas.filter(entrada => entrada.erros.length === 0);
  const vencidas = validas.filter(entrada => pendenciaVencida(entrada, dataHoje));
  const expiradas = validas.filter(entrada => expirada(entrada, dataHoje));
  const comProblema = entradas.filter(entrada => entrada.erros.length > 0);
  const fixas = fixadas(validas, dataHoje);
  const partes = [
    "# Índice da memória",
    "",
    "Gerado pelo memory-saver a partir do frontmatter dos registros e das seções dos README gerais. Não edite à mão: ele é refeito a cada mudança.",
    "",
    `Registros: ${validas.length} (ativos: ${validas.filter(entrada => ativa(entrada, dataHoje)).length}). Como registrar: [COMO-USAR.md](COMO-USAR.md).`,
    "",
    "## Pendências vencidas",
    "",
    ...(vencidas.length ? vencidas.map(entrada => `${linhaEntrada(entrada)} - revisar em ${entrada.review}`) : ["Nenhuma."]),
    "",
    "## Fixadas",
    "",
    ...(fixas.length ? fixas.map(linhaEntrada) : ["Nenhuma."]),
    "",
  ];
  for (const pasta of PASTAS) {
    const daPasta = validas.filter(entrada => entrada.pasta === pasta);
    partes.push(`## ${pasta}`, "");
    if (!daPasta.length) partes.push("Nenhum registro.", "");
    const contextos = [...new Set(daPasta.map(entrada => entrada.contexto ?? ""))].sort((a, b) => !a ? -1 : !b ? 1 : a.localeCompare(b, "pt-BR"));
    for (const contexto of contextos) {
      partes.push(`### ${contexto || "geral"}`, "", ...daPasta.filter(entrada => (entrada.contexto ?? "") === contexto).sort((a, b) => a.id.localeCompare(b.id)).map(linhaEntrada), "");
    }
  }
  partes.push("## Expirados (limpar)", "", ...(expiradas.length ? expiradas.map(linhaEntrada) : ["Nenhum."]), "");
  if (comProblema.length) partes.push("## Com problema", "", ...comProblema.map(entrada => `- ${entrada.id}: ${entrada.erros.join("; ")}`), "");
  return partes.join("\n");
}

export function atualizarIndice(memoriaDir) {
  const entradas = lerEntradas(memoriaDir);
  const texto = gerarIndice(entradas);
  const arquivo = path.join(memoriaDir, NOME_INDICE);
  const mudou = lerTexto(arquivo) !== texto;
  if (mudou) gravarTexto(arquivo, texto);
  return { entradas, mudou };
}
