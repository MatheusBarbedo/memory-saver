import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { lerFrontmatter } from "./frontmatter.js";

export const PASTA = "memoria";
export const TIPOS = {
  aprendizado: "aprendizados",
  decisao: "decisoes",
  feedback: "feedback",
  documentacao: "documentacao",
  pendencia: "pendencias",
  referencia: "referencias",
};
export const STATUS = ["vigente", "substituida", "resolvida", "obsoleta"];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function acharMemoria(inicio) {
  let atual = path.resolve(inicio);
  while (true) {
    const candidata = path.join(atual, PASTA);
    if (fs.existsSync(path.join(candidata, "COMO-USAR.md"))) return candidata;
    const pai = path.dirname(atual);
    if (pai === atual) return null;
    atual = pai;
  }
}

function listarMd(pasta) {
  if (!fs.existsSync(pasta)) return [];
  return fs.readdirSync(pasta, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(item => {
    const caminho = path.join(pasta, item.name);
    if (item.isDirectory()) return listarMd(caminho);
    return item.isFile() && item.name.endsWith(".md") ? [caminho] : [];
  });
}

export const relativo = (memoriaDir, arquivo) => path.relative(memoriaDir, arquivo).split(path.sep).join("/");

export const arquivosDeEntrada = memoriaDir => Object.values(TIPOS).flatMap(pasta => listarMd(path.join(memoriaDir, pasta)));

export function assinatura(memoriaDir) {
  const hash = crypto.createHash("sha1");
  for (const arquivo of arquivosDeEntrada(memoriaDir)) {
    const info = fs.statSync(arquivo);
    hash.update(`${relativo(memoriaDir, arquivo)}|${info.mtimeMs}|${info.size}\n`);
  }
  return hash.digest("hex");
}

export function validar(dados) {
  if (!dados) return ["sem frontmatter"];
  const erros = [];
  for (const campo of ["titulo", "resumo", "tipo", "status", "criado"]) if (!dados[campo] || typeof dados[campo] !== "string") erros.push(`falta ${campo}`);
  if (!Array.isArray(dados.assuntos) || dados.assuntos.length === 0) erros.push("falta assuntos");
  if (dados.tipo && !TIPOS[dados.tipo]) erros.push(`tipo inválido: ${dados.tipo}`);
  if (dados.status && !STATUS.includes(dados.status)) erros.push(`status inválido: ${dados.status}`);
  for (const campo of ["criado", "atualizado", "revisar_em"]) if (dados[campo] && !DATA.test(String(dados[campo]))) erros.push(`${campo} fora do formato AAAA-MM-DD`);
  if (dados.tipo === "pendencia" && !dados.revisar_em) erros.push("pendência sem revisar_em");
  if (dados.status === "substituida" && !dados.substituida_por) erros.push("substituida sem substituida_por");
  return erros;
}

export function lerEntradas(memoriaDir) {
  return arquivosDeEntrada(memoriaDir).map(arquivo => {
    const { dados, corpo } = lerFrontmatter(fs.readFileSync(arquivo, "utf8"));
    const erros = validar(dados);
    const d = dados ?? {};
    return {
      caminho: relativo(memoriaDir, arquivo),
      titulo: typeof d.titulo === "string" ? d.titulo : path.basename(arquivo, ".md"),
      resumo: typeof d.resumo === "string" ? d.resumo : "",
      tipo: d.tipo ?? null,
      status: d.status ?? null,
      assuntos: Array.isArray(d.assuntos) ? d.assuntos.map(String) : [],
      escopo: d.escopo ?? null,
      criado: d.criado ?? null,
      atualizado: d.atualizado ?? d.criado ?? null,
      revisar_em: d.revisar_em ?? null,
      substituida_por: d.substituida_por ?? null,
      vale_fora_daqui: d.vale_fora_daqui === true,
      erros,
      corpo,
    };
  });
}

export const vigentes = entradas => entradas.filter(entrada => entrada.erros.length === 0 && entrada.status === "vigente");
export const revisaoVencida = (entrada, dataHoje) =>
  entrada.erros.length === 0 && Boolean(entrada.revisar_em) && entrada.revisar_em <= dataHoje && entrada.status === "vigente";
export const pendenciaVencida = (entrada, dataHoje) => entrada.tipo === "pendencia" && revisaoVencida(entrada, dataHoje);
