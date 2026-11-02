import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lerFrontmatter } from "./frontmatter.js";

export const PASTA = "memoria";
export const PASTAS = ["aprendizados", "decisoes", "feedback", "documentacao", "pendencias", "referencias"];
export const TIPOS = ["user", "feedback", "project", "reference", "decision", "pending"];
export const TIPO_DA_PASTA = { aprendizados: "project", decisoes: "decision", feedback: "feedback", documentacao: "reference", pendencias: "pending", referencias: "reference" };
export const README = "README.md";
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const MAXIMO_FIXADAS = 10;

export const slug = texto => String(texto).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const igual = (a, b) => path.relative(a, b) === "";
const dentroDe = (pasta, base) => {
  const rel = path.relative(base, pasta);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};

export function acharMemoria(inicio) {
  let atual = path.resolve(inicio);
  const temporaria = path.resolve(os.tmpdir());
  const teto = process.env.MEMORY_SAVER_TETO ? path.resolve(process.env.MEMORY_SAVER_TETO) : dentroDe(atual, temporaria) ? temporaria : null;
  while (true) {
    const candidata = path.join(atual, PASTA);
    if (fs.existsSync(path.join(candidata, "COMO-USAR.md"))) return candidata;
    const pai = path.dirname(atual);
    if (pai === atual || (teto && igual(atual, teto))) return null;
    atual = pai;
  }
}

export function contextoAberto(cwd) {
  let atual = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(atual, ".git"))) return slug(path.basename(atual));
    const pai = path.dirname(atual);
    if (pai === atual) return null;
    atual = pai;
  }
}

function listarMd(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(item => {
    const caminho = path.join(pasta, item.name);
    if (item.isDirectory()) return listarMd(caminho);
    return item.isFile() && item.name.endsWith(".md") ? [caminho] : [];
  });
}

export const relativo = (memoriaDir, arquivo) => path.relative(memoriaDir, arquivo).split(path.sep).join("/");

export function validar(dados, problemas = []) {
  if (!dados) return ["sem frontmatter"];
  const erros = [...problemas];
  for (const campo of ["name", "description"]) if (!dados[campo] || typeof dados[campo] !== "string") erros.push(`falta ${campo}`);
  const metadata = dados.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [...erros, "falta metadata"];
  if (!TIPOS.includes(metadata.type)) erros.push(metadata.type ? `metadata.type inválido: ${metadata.type}` : "falta metadata.type");
  if (!DATA.test(String(metadata.modified ?? ""))) erros.push(metadata.modified ? "metadata.modified fora do formato AAAA-MM-DD" : "falta metadata.modified");
  for (const campo of ["expires", "review"]) if (metadata[campo] && !DATA.test(String(metadata[campo]))) erros.push(`metadata.${campo} fora do formato AAAA-MM-DD`);
  if (metadata.pinned !== undefined && typeof metadata.pinned !== "boolean") erros.push("metadata.pinned precisa ser true ou false");
  return erros;
}

function registro(memoriaDir, arquivo, pasta, contexto, solto) {
  const { dados, corpo, problemas } = lerFrontmatter(lerTextoSeguro(arquivo) ?? "");
  const erros = validar(dados, problemas);
  if (solto) erros.push(`solto na raiz de ${pasta}/: mova para ${pasta}/<contexto>/ ou vire seção do README.md`);
  const d = dados ?? {};
  const m = d.metadata && typeof d.metadata === "object" && !Array.isArray(d.metadata) ? d.metadata : {};
  const caminho = relativo(memoriaDir, arquivo);
  return {
    id: caminho,
    caminho,
    pasta,
    contexto,
    geral: false,
    name: typeof d.name === "string" ? d.name : path.basename(arquivo, ".md"),
    description: typeof d.description === "string" ? d.description : "",
    tipo: m.type ?? null,
    modified: m.modified ?? null,
    pinned: m.pinned === true,
    expires: m.expires ?? null,
    superseded_by: m.superseded_by ?? null,
    review: m.review ?? null,
    erros,
    corpo,
  };
}

const CABECALHO_SECAO = /^## (.+?)(?: \((\d{4}-\d{2}-\d{2})\))?\s*$/;

export function secoesDoReadme(memoriaDir, pasta, texto) {
  const caminho = `${pasta}/${README}`;
  const partes = [];
  let cerca = false;
  for (const linha of texto.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(linha)) cerca = !cerca;
    if (!cerca && /^##(\s|$)/.test(linha)) partes.push({ cabecalho: linha, linhas: [] });
    else if (partes.length) partes.at(-1).linhas.push(linha);
  }
  const usados = new Map();
  return partes.map(({ cabecalho, linhas }, posicao) => {
    const [, titulo, data] = cabecalho.match(CABECALHO_SECAO) ?? [];
    const corpo = linhas.join("\n").trim();
    const nome = slug(titulo ?? "") || `secao-${posicao + 1}`;
    const repeticoes = (usados.get(nome) ?? 0) + 1;
    usados.set(nome, repeticoes);
    const unico = repeticoes > 1 ? `${nome}-${repeticoes}` : nome;
    return {
      id: `${caminho}#${unico}`,
      caminho,
      pasta,
      contexto: null,
      geral: true,
      secao: titulo ?? `seção ${posicao + 1}`,
      name: unico,
      description: (corpo.split(/\r?\n/).find(linha => linha.trim()) ?? titulo ?? "").trim(),
      tipo: TIPO_DA_PASTA[pasta],
      modified: data ?? null,
      pinned: false,
      expires: null,
      superseded_by: null,
      review: null,
      erros: titulo ? [] : [`cabeçalho de seção vazio ou inválido: "${cabecalho.trim()}"`],
      corpo,
    };
  });
}

const lerTextoSeguro = arquivo => {
  try { return fs.readFileSync(arquivo, "utf8"); } catch { return null; }
};

export function lerEntradas(memoriaDir) {
  return PASTAS.flatMap(pasta => {
    const raiz = path.join(memoriaDir, pasta);
    if (!fs.existsSync(raiz)) return [];
    return fs.readdirSync(raiz, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(item => {
      const caminho = path.join(raiz, item.name);
      if (item.isDirectory()) return listarMd(caminho).map(arquivo => registro(memoriaDir, arquivo, pasta, item.name, false));
      if (!item.isFile() || !item.name.endsWith(".md")) return [];
      if (item.name === README) return secoesDoReadme(memoriaDir, pasta, lerTextoSeguro(caminho) ?? "");
      return [registro(memoriaDir, caminho, pasta, null, true)];
    });
  });
}

export const expirada = (entrada, dataHoje) => Boolean(entrada.expires) && entrada.expires < dataHoje;
export const ativa = (entrada, dataHoje) => entrada.erros.length === 0 && !entrada.superseded_by && !expirada(entrada, dataHoje);
export const pendenciaVencida = (entrada, dataHoje) => ativa(entrada, dataHoje) && entrada.tipo === "pending" && Boolean(entrada.review) && entrada.review <= dataHoje;
export const revisaoVencida = (entrada, dataHoje) => ativa(entrada, dataHoje) && entrada.tipo !== "pending" && Boolean(entrada.review) && entrada.review <= dataHoje;
export const fixadas = (entradas, dataHoje) => entradas.filter(entrada => entrada.pinned && ativa(entrada, dataHoje)).slice(0, MAXIMO_FIXADAS);
