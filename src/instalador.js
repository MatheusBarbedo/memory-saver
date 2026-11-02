import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { arquivoWorkspaces, gravarJson, gravarTexto, hoje, lerJson, lerTexto, normalizarCaminho, pastaClaude } from "./estado.js";
import { lerFrontmatter, escreverFrontmatter } from "./frontmatter.js";
import { PASTA, PASTAS, README, slug } from "./memoria.js";
import { atualizarIndice } from "./indice.js";
import { detectarSensivel } from "./sensivel.js";

const RAIZ_FERRAMENTA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paraBarra = caminho => caminho.split(path.sep).join("/");
const LINHA_IMPORT = `@${PASTA}/COMO-USAR.md`;
const INICIO_BLOCO = "# memory-saver inicio";
const FIM_BLOCO = "# memory-saver fim";
const SKILLS = ["memory-saver", "lembrar"];
const EVENTOS = [
  { evento: "SessionStart", matcher: "startup|resume|clear|compact", timeout: 10 },
  { evento: "UserPromptSubmit", timeout: 5 },
  { evento: "PostToolUse", matcher: "Write|Edit|MultiEdit", timeout: 10 },
];
const NOSSO_HOOK = /memory\.js"?\s+hook\s+(SessionStart|UserPromptSubmit|PostToolUse)\b/;

const arquivoSettings = () => path.join(pastaClaude(), "settings.json");

function git(cwd, ...args) {
  const resultado = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return resultado.status === 0 ? resultado.stdout.trim() : null;
}

function tirarNossosHooks(settings) {
  if (!settings.hooks) return settings;
  for (const evento of Object.keys(settings.hooks)) {
    settings.hooks[evento] = settings.hooks[evento]
      .map(grupo => ({ ...grupo, hooks: (grupo.hooks ?? []).filter(hook => !NOSSO_HOOK.test(hook.command ?? "")) }))
      .filter(grupo => grupo.hooks.length > 0);
    if (settings.hooks[evento].length === 0) delete settings.hooks[evento];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return settings;
}

export const temHooks = settings => Object.values(settings.hooks ?? {}).some(grupos => grupos.some(grupo => (grupo.hooks ?? []).some(hook => NOSSO_HOOK.test(hook.command ?? ""))));

export function instalarMaquina(raizFerramenta = RAIZ_FERRAMENTA) {
  const memoryJs = paraBarra(path.join(raizFerramenta, "memory.js"));
  const settings = tirarNossosHooks(lerJson(arquivoSettings(), {}));
  settings.hooks ??= {};
  for (const { evento, matcher, timeout } of EVENTOS) {
    settings.hooks[evento] ??= [];
    settings.hooks[evento].push({ ...(matcher ? { matcher } : {}), hooks: [{ type: "command", command: `node "${memoryJs}" hook ${evento}`, timeout }] });
  }
  gravarJson(arquivoSettings(), settings);
  for (const skill of SKILLS) {
    const modelo = fs.readFileSync(path.join(raizFerramenta, "templates", "skills", skill, "SKILL.md"), "utf8");
    gravarTexto(path.join(pastaClaude(), "skills", skill, "SKILL.md"), modelo.replaceAll("{{MEMORY_JS}}", memoryJs));
  }
  return { settings: arquivoSettings(), skills: SKILLS.map(skill => path.join(pastaClaude(), "skills", skill)) };
}

export function desinstalarMaquina() {
  const texto = lerTexto(arquivoSettings());
  if (texto !== null) gravarJson(arquivoSettings(), tirarNossosHooks(JSON.parse(texto.replace(/^﻿/, ""))));
  for (const skill of SKILLS) fs.rmSync(path.join(pastaClaude(), "skills", skill), { recursive: true, force: true });
  const registro = lerJson(arquivoWorkspaces(), {});
  const restaurados = [];
  for (const [workspace, info] of Object.entries(registro)) {
    if (!info.settingsLocal) continue;
    const arquivo = path.join(workspace, ".claude", "settings.local.json");
    const atual = lerJson(arquivo);
    if (!atual || atual.autoMemoryEnabled !== false) continue;
    if (info.settingsLocal.tinha) atual.autoMemoryEnabled = info.settingsLocal.antes;
    else delete atual.autoMemoryEnabled;
    if (info.settingsLocal.criado && Object.keys(atual).length === 0) fs.rmSync(arquivo);
    else gravarJson(arquivo, atual);
    delete info.settingsLocal;
    restaurados.push(workspace);
  }
  gravarJson(arquivoWorkspaces(), registro);
  return { restaurados };
}

const codificar = caminho => path.resolve(caminho).replace(/[^A-Za-z0-9]/g, "-");
const mdsDe = pasta => fs.existsSync(pasta) ? fs.readdirSync(pasta).filter(nome => nome.endsWith(".md") && nome !== "MEMORY.md").sort() : [];

export function acharMemoriaNativa(workspace) {
  const projetos = path.join(pastaClaude(), "projects");
  if (!fs.existsSync(projetos)) return [];
  const codigo = codificar(workspace).toLowerCase();
  return fs.readdirSync(projetos)
    .filter(nome => nome.toLowerCase() === codigo || nome.toLowerCase().startsWith(codigo + "-"))
    .map(nome => ({ pasta: path.join(projetos, nome, "memory"), escopo: nome.length > codigo.length ? nome.slice(codigo.length + 1) : "workspace" }))
    .filter(origem => mdsDe(origem.pasta).length > 0);
}

function lerOrigemExplicita(texto) {
  const corte = texto.lastIndexOf("=");
  const [bruto, escopo] = corte > 2 ? [texto.slice(0, corte), texto.slice(corte + 1)] : [texto, "workspace"];
  const pasta = path.resolve(bruto);
  const memoria = fs.existsSync(path.join(pasta, "memory")) ? path.join(pasta, "memory") : pasta;
  return { pasta: memoria, escopo: escopo || "workspace" };
}

const PREFIXOS_NATIVOS = /^(feedback|project|projeto|user|usuario|reference|referencia|ref|md)[-_]+/i;
const NATIVO = { user: { pasta: "feedback", type: "user" }, feedback: { pasta: "feedback", type: "feedback" }, reference: { pasta: "referencias", type: "reference" }, project: { pasta: "aprendizados", type: "project" } };

export function converterNativa(texto, nomeArquivo, contextoPadrao, dataHoje) {
  const { dados, corpo } = lerFrontmatter(texto);
  const d = dados ?? {};
  const tipoNativo = String(d.type ?? d.metadata?.type ?? "project").toLowerCase();
  const { pasta, type } = NATIVO[tipoNativo] ?? NATIVO.project;
  const nome = typeof d.name === "string" && d.name.trim() ? d.name.trim() : path.basename(nomeArquivo, ".md");
  const primeiraLinha = corpo.split(/\r?\n/).map(linha => linha.trim()).find(linha => linha && !linha.startsWith("#")) ?? nome;
  const description = (typeof d.description === "string" && d.description.trim()) || primeiraLinha.slice(0, 200);
  const nomeDestino = slug(nome.replace(PREFIXOS_NATIVOS, "")) || slug(nome) || "entrada";
  return { pasta, contexto: contextoPadrao, nomeDestino, conteudo: `${escreverFrontmatter({ name: nomeDestino, description, metadata: { type, modified: dataHoje } })}\n${corpo.trim()}\n` };
}

function escolherArquivoImport(workspace) {
  const ehGit = git(workspace, "rev-parse", "--is-inside-work-tree") === "true";
  const versionado = ehGit && git(workspace, "ls-files", "--error-unmatch", "CLAUDE.md") !== null;
  return { arquivo: versionado ? "CLAUDE.local.md" : "CLAUDE.md", ehGit, versionado };
}

function exclusaoGit(workspace) {
  if (git(workspace, "rev-parse", "--is-inside-work-tree") !== "true") return null;
  const topo = git(workspace, "rev-parse", "--show-toplevel");
  const arquivo = git(workspace, "rev-parse", "--git-path", "info/exclude");
  if (!topo || !arquivo) return null;
  const relativo = paraBarra(path.relative(normalizarCaminho(topo), normalizarCaminho(workspace)));
  return { arquivo: path.resolve(workspace, arquivo), prefixo: relativo ? `/${relativo}` : "" };
}

function blocoExclusao(texto, linhas) {
  const base = texto ?? "";
  const inicio = base.indexOf(INICIO_BLOCO + "\n");
  const fim = inicio < 0 ? -1 : base.indexOf(FIM_BLOCO + "\n", inicio);
  const semBloco = inicio < 0 ? base : base.slice(0, inicio) + base.slice(fim < 0 ? base.length : fim + FIM_BLOCO.length + 1);
  const prefixo = semBloco.length && !semBloco.endsWith("\n") ? "\n" : "";
  return semBloco + prefixo + [INICIO_BLOCO, ...linhas, FIM_BLOCO].join("\n") + "\n";
}

export function planejarInit(workspaceBruto, { importar = false, importarDe = [] } = {}) {
  const workspace = path.resolve(workspaceBruto);
  const memoriaDir = path.join(workspace, PASTA);
  const dataHoje = hoje();
  const acoes = [];
  const avisos = [];
  const passos = [];
  const registro = lerJson(arquivoWorkspaces(), {});
  const chave = normalizarCaminho(workspace);
  const info = registro[chave] ?? { criados: [] };
  const criados = new Set(info.criados);

  for (const pasta of ["", ...PASTAS]) {
    const alvo = path.join(memoriaDir, pasta);
    if (fs.existsSync(alvo)) continue;
    acoes.push(`criar ${paraBarra(path.relative(workspace, alvo))}/`);
    passos.push(() => fs.mkdirSync(alvo, { recursive: true }));
  }
  for (const pasta of PASTAS) {
    const readme = path.join(memoriaDir, pasta, README);
    if (fs.existsSync(readme)) continue;
    acoes.push(`criar ${PASTA}/${pasta}/${README}`);
    passos.push(() => gravarTexto(readme, `# ${pasta.charAt(0).toUpperCase()}${pasta.slice(1)} gerais\n`));
  }
  const comoUsar = path.join(memoriaDir, "COMO-USAR.md");
  if (!fs.existsSync(comoUsar)) {
    acoes.push(`criar ${PASTA}/COMO-USAR.md`);
    passos.push(() => gravarTexto(comoUsar, fs.readFileSync(path.join(RAIZ_FERRAMENTA, "templates", "COMO-USAR.md"), "utf8")));
  }

  const importacao = escolherArquivoImport(workspace);
  const jaImporta = ["CLAUDE.md", "CLAUDE.local.md"].some(nome => (lerTexto(path.join(workspace, nome)) ?? "").split(/\r?\n/).includes(LINHA_IMPORT));
  if (!jaImporta) {
    const arquivo = path.join(workspace, importacao.arquivo);
    const atual = lerTexto(arquivo);
    if (atual === null) criados.add(importacao.arquivo);
    acoes.push(`${atual === null ? "criar" : "acrescentar em"} ${importacao.arquivo}: ${LINHA_IMPORT}`);
    passos.push(() => gravarTexto(arquivo, (atual ?? "") + (atual && !atual.endsWith("\n") ? "\n" : "") + LINHA_IMPORT + "\n"));
    if (importacao.versionado) avisos.push("O CLAUDE.md da raiz é versionado: não mexi nele, usei CLAUDE.local.md.");
  }

  const settingsLocal = path.join(workspace, ".claude", "settings.local.json");
  const settingsAtual = lerJson(settingsLocal);
  if (settingsAtual?.autoMemoryEnabled !== false) {
    const tinha = Boolean(settingsAtual) && "autoMemoryEnabled" in settingsAtual;
    info.settingsLocal = { criado: settingsAtual === null, tinha, antes: tinha ? settingsAtual.autoMemoryEnabled : undefined };
    if (settingsAtual === null) criados.add(".claude/settings.local.json");
    acoes.push("desligar a memória automática nativa em .claude/settings.local.json (autoMemoryEnabled: false)");
    passos.push(() => gravarJson(settingsLocal, { ...(settingsAtual ?? {}), autoMemoryEnabled: false }));
  }

  const encontradas = acharMemoriaNativa(workspace);
  const origens = [...(importar ? encontradas : []), ...importarDe.map(lerOrigemExplicita)];
  if (encontradas.length && !importar) avisos.push(`Memória nativa encontrada: ${encontradas.map(origem => `${origem.pasta} (${mdsDe(origem.pasta).length} arquivos)`).join(", ")}. Para importar, rode com --importar.`);
  const destinos = new Set();
  let importadas = 0;
  for (const origem of origens) {
    if (!fs.existsSync(origem.pasta)) {
      avisos.push(`Pasta de importação não existe: ${origem.pasta}`);
      continue;
    }
    for (const nomeArquivo of mdsDe(origem.pasta)) {
      const arquivoOrigem = path.join(origem.pasta, nomeArquivo);
      const contexto = slug(origem.escopo !== "workspace" ? origem.escopo : path.basename(workspace)) || "geral";
      const convertida = converterNativa(fs.readFileSync(arquivoOrigem, "utf8"), nomeArquivo, contexto, dataHoje);
      const pastaDestino = path.join(memoriaDir, convertida.pasta, convertida.contexto);
      let destino = path.join(pastaDestino, `${convertida.nomeDestino}.md`);
      for (let n = 2; destinos.has(normalizarCaminho(destino)); n++) destino = path.join(pastaDestino, `${convertida.nomeDestino}-${n}.md`);
      destinos.add(normalizarCaminho(destino));
      if (fs.existsSync(destino)) continue;
      const sensivel = detectarSensivel(convertida.conteudo);
      if (sensivel.length) avisos.push(`Possível dado sensível em ${paraBarra(path.relative(workspace, destino))}: ${sensivel.map(achado => `${achado.tipo} (linha ${achado.linha})`).join(", ")}`);
      importadas++;
      passos.push(() => gravarTexto(destino, convertida.conteudo));
    }
  }
  if (importadas) acoes.push(`importar ${importadas} memória(s) nativa(s) para ${PASTA}/ (o original fica onde está)`);

  const exclusao = exclusaoGit(workspace);
  if (exclusao) {
    const linhas = [`${exclusao.prefixo}/${PASTA}/`, ...[...criados].sort().map(item => `${exclusao.prefixo}/${item}`)];
    const atual = lerTexto(exclusao.arquivo);
    const novo = blocoExclusao(atual, linhas);
    if (novo !== atual) {
      acoes.push("acrescentar memoria/ e o que foi criado ao .git/info/exclude");
      passos.push(() => gravarTexto(exclusao.arquivo, novo));
    }
  }

  function aplicar() {
    for (const passo of passos) passo();
    registro[chave] = { ...info, criados: [...criados].sort() };
    gravarJson(arquivoWorkspaces(), registro);
    atualizarIndice(memoriaDir);
  }

  return { workspace, memoriaDir, acoes, avisos, encontradas, aplicar };
}
