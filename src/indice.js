import fs from "node:fs";
import path from "node:path";
import { arquivoCache, gravarJson, gravarTexto, hoje, lerJson, lerTexto } from "./estado.js";
import { assinatura, lerEntradas, pendenciaVencida } from "./memoria.js";

export const NOME_INDICE = "INDICE.md";

const linhaEntrada = entrada => `- [${entrada.titulo}](${encodeURI(entrada.caminho)}) - ${entrada.resumo} (${entrada.tipo}, ${entrada.status})`;

export function gerarIndice(entradas, dataHoje = hoje()) {
  const validas = entradas.filter(entrada => entrada.erros.length === 0);
  const vencidas = validas.filter(entrada => pendenciaVencida(entrada, dataHoje));
  const porAssunto = new Map();
  for (const entrada of validas) {
    for (const assunto of entrada.assuntos) {
      const chave = assunto.trim().toLowerCase();
      if (!chave) continue;
      if (!porAssunto.has(chave)) porAssunto.set(chave, { nome: assunto.trim(), entradas: [] });
      porAssunto.get(chave).entradas.push(entrada);
    }
  }
  const foraDaqui = validas.filter(entrada => entrada.vale_fora_daqui && entrada.status === "vigente");
  const comProblema = entradas.filter(entrada => entrada.erros.length > 0);

  const partes = [
    "# Índice da memória",
    "",
    "Gerado pelo memory-saver a partir do frontmatter das entradas. Não edite à mão: ele é refeito a cada mudança.",
    "",
    `Entradas: ${validas.length} (vigentes: ${validas.filter(entrada => entrada.status === "vigente").length}). Como registrar: [COMO-USAR.md](COMO-USAR.md).`,
    "",
    "## Pendências vencidas",
    "",
    ...(vencidas.length ? vencidas.map(entrada => `- [${entrada.titulo}](${encodeURI(entrada.caminho)}) - ${entrada.resumo} (revisar em ${entrada.revisar_em})`) : ["Nenhuma."]),
    "",
    "## Por assunto",
    "",
  ];
  const assuntos = [...porAssunto.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (!assuntos.length) partes.push("Nenhuma entrada ainda.", "");
  for (const { nome, entradas: lista } of assuntos) {
    partes.push(`### ${nome}`, "", ...lista.sort((a, b) => a.caminho.localeCompare(b.caminho)).map(linhaEntrada), "");
  }
  partes.push("## Vale fora deste workspace", "", ...(foraDaqui.length ? foraDaqui.map(linhaEntrada) : ["Nenhuma."]), "");
  if (comProblema.length) partes.push("## Com problema no frontmatter", "", ...comProblema.map(entrada => `- ${entrada.caminho}: ${entrada.erros.join("; ")}`), "");
  return partes.join("\n");
}

const resumir = entrada => {
  const { corpo, ...resto } = entrada;
  return resto;
};

export function atualizarIndice(memoriaDir, { forcar = false } = {}) {
  const arquivoIndice = path.join(memoriaDir, NOME_INDICE);
  const assinaturaAtual = assinatura(memoriaDir);
  const cache = lerJson(arquivoCache(memoriaDir));
  const dataHoje = hoje();
  if (!forcar && cache?.assinatura === assinaturaAtual && cache.data === dataHoje && fs.existsSync(arquivoIndice)) {
    return { entradas: cache.entradas, mudou: false };
  }
  const entradas = lerEntradas(memoriaDir).map(resumir);
  const texto = gerarIndice(entradas, dataHoje);
  const mudou = lerTexto(arquivoIndice) !== texto;
  if (mudou) gravarTexto(arquivoIndice, texto);
  gravarJson(arquivoCache(memoriaDir), { memoria: memoriaDir, assinatura: assinaturaAtual, data: dataHoje, entradas });
  return { entradas, mudou };
}

export function entradasEmCache(memoriaDir) {
  const cache = lerJson(arquivoCache(memoriaDir));
  if (cache && cache.assinatura === assinatura(memoriaDir)) return cache.entradas;
  return atualizarIndice(memoriaDir).entradas;
}
