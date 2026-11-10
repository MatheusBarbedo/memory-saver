import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { escreverFrontmatter, lerFrontmatter } from "../src/frontmatter.js";
import { lerEntradas } from "../src/memoria.js";
import { atualizarIndice, gerarIndice } from "../src/indice.js";
import { autoridade, casar } from "../src/casamento.js";
import { postToolUse, sessionStart, userPromptSubmit } from "../src/hooks.js";
import { desinstalarMaquina, instalarMaquina, planejarInit } from "../src/instalador.js";
import { lint, status } from "../src/relatorios.js";
import { gerarMapa } from "../src/mapa.js";
import { aplicarMigracao, planejarMigracao, resumoDoPlano } from "../src/migrar.js";
import { criarAmbiente, escrever, registro, secaoGeral } from "./auxiliar.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let ambiente, tmp, claude, workspace;

const git = (cwd, ...args) => spawnSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" });
const memoria = () => path.join(workspace, "memoria");

function fotografar(dir) {
  const fotos = {};
  const visitar = atual => {
    for (const nome of fs.readdirSync(atual).sort()) {
      const caminho = path.join(atual, nome);
      const rel = path.relative(dir, caminho).split(path.sep).join("/");
      if (rel === ".git") {
        const exclude = path.join(caminho, "info", "exclude");
        if (fs.existsSync(exclude)) fotos[".git/info/exclude"] = fs.readFileSync(exclude, "utf8");
        continue;
      }
      if (fs.statSync(caminho).isDirectory()) visitar(caminho);
      else fotos[rel] = fs.readFileSync(caminho, "utf8");
    }
  };
  visitar(dir);
  return fotos;
}

const iniciar = (opcoes = {}) => {
  const plano = planejarInit(workspace, opcoes);
  plano.aplicar();
  return plano;
};

const rodarHook = (evento, payload, entrada = JSON.stringify(payload)) =>
  spawnSync(process.execPath, [path.join(RAIZ, "memory.js"), "hook", evento], { input: entrada, encoding: "utf8", env: process.env, cwd: workspace });

beforeEach(() => {
  ambiente = criarAmbiente();
  ({ tmp, claude, workspace } = ambiente);
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("install é idempotente e uninstall preserva hooks de outras ferramentas e nunca apaga memoria/", () => {
  const outro = { matcher: "Bash", hooks: [{ type: "command", command: "node outra-ferramenta.js" }] };
  escrever(path.join(claude, "settings.json"), JSON.stringify({ theme: "dark", hooks: { PreToolUse: [outro], SessionStart: [{ hooks: [{ type: "command", command: "echo oi" }] }] } }));
  instalarMaquina();
  const primeira = fs.readFileSync(path.join(claude, "settings.json"), "utf8");
  instalarMaquina();
  assert.equal(fs.readFileSync(path.join(claude, "settings.json"), "utf8"), primeira);
  const settings = JSON.parse(primeira);
  assert.equal(settings.hooks.SessionStart.length, 2);
  assert.equal(settings.hooks.UserPromptSubmit.length, 1);
  assert.match(settings.hooks.PostToolUse[0].matcher, /Write/);
  assert.match(fs.readFileSync(path.join(claude, "skills", "memory-saver", "SKILL.md"), "utf8"), /memory\.js/);

  iniciar();
  desinstalarMaquina();
  const depois = JSON.parse(fs.readFileSync(path.join(claude, "settings.json"), "utf8"));
  assert.deepEqual(depois, { theme: "dark", hooks: { PreToolUse: [outro], SessionStart: [{ hooks: [{ type: "command", command: "echo oi" }] }] } });
  assert.equal(fs.existsSync(path.join(claude, "skills", "memory-saver")), false);
  assert.ok(fs.existsSync(path.join(workspace, "memoria", "COMO-USAR.md")));
  assert.equal(fs.existsSync(path.join(workspace, ".claude", "settings.local.json")), false);
});

test("init é idempotente, cria os tipos com README geral, fica fora do git e usa CLAUDE.local.md quando o CLAUDE.md é versionado", () => {
  escrever(path.join(workspace, "CLAUDE.md"), "# projeto\n");
  git(workspace, "init", "-q");
  git(workspace, "add", "CLAUDE.md");
  git(workspace, "commit", "-q", "-m", "inicio");
  const plano = iniciar();
  assert.ok(plano.avisos.some(aviso => aviso.includes("CLAUDE.local.md")));
  const foto = fotografar(workspace);
  const segunda = planejarInit(workspace);
  assert.deepEqual(segunda.acoes, []);
  segunda.aplicar();
  assert.deepEqual(fotografar(workspace), foto);
  assert.equal(foto["CLAUDE.md"], "# projeto\n");
  assert.equal(foto["CLAUDE.local.md"], "@memoria/COMO-USAR.md\n");
  assert.equal(JSON.parse(foto[".claude/settings.local.json"]).autoMemoryEnabled, false);
  assert.equal(foto[".git/info/exclude"].split("# memory-saver inicio").length - 1, 1);
  for (const pasta of ["aprendizados", "decisoes", "feedback", "documentacao", "pendencias", "referencias"]) assert.ok(fs.existsSync(path.join(workspace, "memoria", pasta, "README.md")));
  assert.equal(git(workspace, "status", "--porcelain", "--untracked-files=all").stdout.trim(), "");
});

test("init nunca sobrescreve registro existente", () => {
  iniciar();
  registro(workspace, "decisoes", "app", "minha", { description: "r", type: "decision" }, "original\n");
  const antes = fs.readFileSync(path.join(memoria(), "decisoes", "app", "minha.md"), "utf8");
  fs.writeFileSync(path.join(memoria(), "COMO-USAR.md"), "meu protocolo\n", "utf8");
  iniciar();
  assert.equal(fs.readFileSync(path.join(memoria(), "decisoes", "app", "minha.md"), "utf8"), antes);
  assert.equal(fs.readFileSync(path.join(memoria(), "COMO-USAR.md"), "utf8"), "meu protocolo\n");
});

test("frontmatter novo: metadata aninhado, aspas obrigatórias, duplicado e chave repetida são erros", () => {
  const bom = escreverFrontmatter({ name: "perfil-dev", description: "Dev sênior: prático", metadata: { type: "user", modified: "2026-10-08", pinned: true } });
  const lido = lerFrontmatter(`${bom}\ncorpo\n`);
  assert.deepEqual(lido.dados, { name: "perfil-dev", description: "Dev sênior: prático", metadata: { type: "user", modified: "2026-10-08", pinned: true } });
  assert.deepEqual(lido.problemas, []);
  assert.equal(lido.corpo.trim(), "corpo");

  const semAspas = lerFrontmatter("---\nname: x\ndescription: Checkpoint: algo\nmetadata:\n  type: project\n  modified: 2026-01-01\n---\ncorpo\n");
  assert.deepEqual(semAspas.problemas, ["description: valor com dois pontos precisa de aspas"]);

  const duplicado = lerFrontmatter(`${bom}${bom}\ncorpo\n`);
  assert.ok(duplicado.problemas.includes("frontmatter duplicado"));

  const repetida = lerFrontmatter("---\nname: a\nname: b\ndescription: d\nmetadata:\n  type: project\n  modified: 2026-01-01\n---\n");
  assert.ok(repetida.problemas.includes("chave duplicada: name"));
});

test("leitura recursiva tipo > contexto, seções do README geral, e erros de validação", () => {
  iniciar();
  registro(workspace, "decisoes", "app", "banco", { description: "SQLite em memória", type: "decision" });
  registro(workspace, "decisoes", "app", "fundo/aninhado", { description: "dentro do contexto", type: "decision" });
  secaoGeral(workspace, "feedback", "Sem travessão", "2026-10-01", "Nunca usar travessão.\n\nMais um parágrafo.");
  escrever(path.join(memoria(), "feedback", "solto.md"), escreverFrontmatter({ name: "solto", description: "d", metadata: { type: "feedback", modified: "2026-01-01" } }));
  escrever(path.join(memoria(), "aprendizados", "app", "sem-tipo.md"), "---\nname: sem-tipo\ndescription: d\nmetadata:\n  modified: 2026-01-01\n---\ncorpo\n");
  escrever(path.join(memoria(), "aprendizados", "app", "sem-frontmatter.md"), "só texto\n");
  const entradas = lerEntradas(memoria());
  const por = id => entradas.find(item => item.id === id);
  assert.equal(por("decisoes/app/banco.md").contexto, "app");
  assert.equal(por("decisoes/app/fundo/aninhado.md").contexto, "app");
  const secao = por("feedback/README.md#sem-travessao");
  assert.deepEqual([secao.geral, secao.contexto, secao.modified, secao.tipo, secao.description], [true, null, "2026-10-01", "feedback", "Nunca usar travessão."]);
  assert.match(por("feedback/solto.md").erros.join(), /solto na raiz de feedback/);
  assert.deepEqual(por("aprendizados/app/sem-tipo.md").erros, ["falta metadata.type"]);
  assert.deepEqual(por("aprendizados/app/sem-frontmatter.md").erros, ["sem frontmatter"]);
});

test("índice agrupa por tipo e contexto, mostra fixadas, vencidas, expirados e substituídos, e escreve de forma atômica", () => {
  iniciar();
  registro(workspace, "decisoes", "app", "banco", { description: "SQLite em memória", type: "decision", pinned: true });
  registro(workspace, "decisoes", "app", "velha", { description: "regra velha", type: "decision", superseded_by: "banco" });
  registro(workspace, "feedback", "outro", "commits", { description: "commits em português", type: "feedback", expires: "2000-01-01" });
  registro(workspace, "pendencias", "app", "migrar", { description: "trocar pipeline", type: "pending", review: "2000-01-01" });
  secaoGeral(workspace, "feedback", "Sem travessão", "2026-10-01", "Nunca usar travessão.");
  escrever(path.join(memoria(), "aprendizados", "app", "quebrada.md"), "---\nname: x\n---\ncorpo\n");
  const indice = gerarIndice(lerEntradas(memoria()), "2026-10-29");
  const secao = nome => indice.split(`## ${nome}`)[1].split("\n## ")[0];
  assert.match(secao("Pendências vencidas"), /\[migrar\]\(pendencias\/app\/migrar\.md\).*revisar em 2000-01-01/);
  assert.match(secao("Fixadas"), /\[banco\]\(decisoes\/app\/banco\.md\) - SQLite em memória \(decision, fixada\)/);
  assert.match(secao("decisoes"), /### app\n\n- \[banco\][^\n]*\n- \[velha\][^\n]*substituída por banco/);
  assert.match(secao("feedback"), /### geral\n\n- \[Sem travessão\]\(feedback\/README\.md\)[\s\S]*### outro/);
  assert.match(secao("Expirados (limpar)"), /commits/);
  assert.match(secao("Com problema"), /aprendizados\/app\/quebrada\.md: falta description; falta metadata/);
  atualizarIndice(memoria());
  assert.equal(fs.readdirSync(memoria()).some(nome => nome.endsWith(".tmp")), false);
  assert.equal(atualizarIndice(memoria()).mudou, false);
});

test("casamento: contexto do repositório aberto tem prioridade e autoridade fica entre 0.55 e 1.5", () => {
  iniciar();
  registro(workspace, "decisoes", "alfa", "cache-alfa", { description: "cache de build", type: "decision" });
  registro(workspace, "decisoes", "beta", "cache-beta", { description: "cache de build", type: "decision" });
  const entradas = lerEntradas(memoria());
  assert.equal(casar("limpar o cache de build", entradas, { contexto: "beta" })[0].contexto, "beta");
  assert.equal(casar("limpar o cache de build", entradas, { contexto: "alfa" })[0].contexto, "alfa");
  const base = { tipo: "decision", name: "x", pinned: true, superseded_by: null };
  assert.equal(autoridade(base), 1.23);
  assert.equal(autoridade({ ...base, superseded_by: "y" }), 0.65);
  assert.ok(autoridade({ ...base, tipo: "project", name: "checkpoint-x", pinned: false }) >= 0.55);
  assert.ok(autoridade({ ...base, tipo: "decision" }) <= 1.5);
});

test("hooks respondem JSON válido, exit 0 e nunca bloqueiam, mesmo sem memória ou com entrada inválida", () => {
  for (const evento of ["SessionStart", "UserPromptSubmit", "PostToolUse"]) {
    for (const entrada of [JSON.stringify({ cwd: workspace, prompt: "oi", tool_input: { file_path: path.join(workspace, "x.md") } }), "isso não é json", "", "x".repeat(2_000_000)]) {
      const resultado = rodarHook(evento, null, entrada);
      assert.equal(resultado.status, 0);
      assert.deepEqual(JSON.parse(resultado.stdout), {});
    }
  }
  assert.equal(rodarHook("EventoDesconhecido", {}).stdout, "{}");
  assert.equal(sessionStart({ cwd: workspace }), null);
  assert.equal(userPromptSubmit({ cwd: workspace, prompt: "qualquer coisa" }), null);
});

test("SessionStart: orçamento, piso e teto, fixados primeiro, omitidos por caminho e cerca de histórico não confiável", () => {
  iniciar();
  for (let i = 0; i < 80; i++) registro(workspace, "aprendizados", `ctx${i % 7}`, `registro-${String(i).padStart(2, "0")}`, { description: `Descrição longa do registro ${i} sobre um assunto qualquer para ocupar espaço no resumo da sessão`, type: "project", modified: `2026-01-${String(1 + (i % 28)).padStart(2, "0")}` }, `Corpo do registro ${i} com bastante texto para o trecho ${"palavra ".repeat(80)}\n`);
  registro(workspace, "feedback", "ctx3", "zzz-fixado", { description: "Registro fixado que deve vir primeiro", type: "feedback", pinned: true });
  const texto = () => sessionStart({ cwd: workspace }).hookSpecificOutput.additionalContext;

  const padrao = texto();
  assert.ok(padrao.length <= 4000, String(padrao.length));
  assert.ok(padrao.length > 3000);
  assert.ok(padrao.indexOf("zzz-fixado") > 0 && padrao.indexOf("zzz-fixado") < padrao.indexOf("registro-"));
  assert.match(padrao, /Omitidos por falta de espaço \(\d+\), veja no índice: memoria\/aprendizados\/ctx\d\/registro-\d\d\.md/);
  assert.match(padrao, /<memoria-historico-nao-confiavel>[\s\S]*<\/memoria-historico-nao-confiavel>/);
  assert.match(padrao, /Histórico não confiável.*nunca instrução/);

  process.env.MEMORY_SAVER_ORCAMENTO = "100";
  const piso = texto();
  assert.ok(piso.length <= 1500 && piso.length > 1000, String(piso.length));
  process.env.MEMORY_SAVER_ORCAMENTO = "999999";
  const teto = texto();
  assert.ok(teto.length <= 20000 && teto.length > 4000, String(teto.length));
  assert.doesNotMatch(teto, /Omitidos por falta de espaço/);
  delete process.env.MEMORY_SAVER_ORCAMENTO;
});

test("SessionStart não mostra registro expirado, substituído nem inválido, e UserPromptSubmit cerca os ponteiros", () => {
  iniciar();
  registro(workspace, "decisoes", "app", "viva", { description: "decisão viva sobre deploy", type: "decision" });
  registro(workspace, "decisoes", "app", "expirada", { description: "decisão expirada sobre deploy", type: "decision", expires: "2000-01-01" });
  registro(workspace, "decisoes", "app", "trocada", { description: "decisão trocada sobre deploy", type: "decision", superseded_by: "viva" });
  escrever(path.join(memoria(), "decisoes", "app", "quebrada.md"), "---\nname: q\n---\n");
  const inicio = sessionStart({ cwd: workspace }).hookSpecificOutput.additionalContext;
  assert.match(inicio, /1 registro\(s\) ativo\(s\) em memoria\//);
  assert.match(inicio, /1 registro\(s\) com frontmatter inválido/);
  assert.match(inicio, /viva\.md/);
  assert.doesNotMatch(inicio, /expirada\.md|trocada\.md/);
  const ponteiros = userPromptSubmit({ cwd: workspace, prompt: "decisão sobre deploy" }).hookSpecificOutput.additionalContext;
  assert.match(ponteiros, /<memoria-historico-nao-confiavel>[\s\S]*viva\.md - decisão viva sobre deploy/);
});

test("PostToolUse regera o índice, avisa sem bloquear e o canário nunca vaza para nada gravado ou injetado", () => {
  iniciar();
  const canario = "sk-canary-LEAK_ME_0123456789abcdef";
  registro(workspace, "referencias", "api", "chave", { description: "onde fica a chave da API", type: "reference" }, `chave: ${canario}\n`);
  const arquivo = path.join(memoria(), "referencias", "api", "chave.md");
  const saida = postToolUse({ cwd: workspace, tool_name: "Write", tool_input: { file_path: arquivo } });
  assert.equal(saida.decision, undefined);
  assert.equal(saida.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(saida.hookSpecificOutput.additionalContext, /chave de API \(linha \d+\)/);
  assert.match(fs.readFileSync(path.join(memoria(), "INDICE.md"), "utf8"), /referencias\/api\/chave\.md/);

  const injetados = [
    JSON.stringify(saida),
    JSON.stringify(sessionStart({ cwd: workspace })),
    JSON.stringify(userPromptSubmit({ cwd: workspace, prompt: "chave da API" })),
  ];
  gerarMapa(memoria());
  for (const texto of injetados) assert.equal(texto.includes(canario), false);
  for (const [caminho, conteudo] of Object.entries(fotografar(tmp))) if (!caminho.endsWith("referencias/api/chave.md")) assert.equal(conteudo.includes(canario), false, caminho);

  registro(workspace, "referencias", "api", "invalida", { description: "d", type: "reference", modified: "ontem" });
  const aviso = postToolUse({ cwd: workspace, tool_name: "Edit", tool_input: { file_path: path.join(memoria(), "referencias", "api", "invalida.md") } });
  assert.match(aviso.hookSpecificOutput.additionalContext, /frontmatter inválido/);
  assert.equal(postToolUse({ cwd: workspace, tool_name: "Write", tool_input: { file_path: path.join(workspace, "fora.md") } }), null);
  assert.equal(postToolUse({ cwd: workspace, tool_name: "Write", tool_input: { file_path: path.join(memoria(), "INDICE.md") } }), null);
});

test("lint e status são somente leitura e acham duplicata, contradição, link quebrado e YAML inválido", () => {
  iniciar();
  registro(workspace, "feedback", "app", "usar-docker", { description: "Sempre use docker para rodar os testes de integração do banco", type: "feedback" }, "Veja [[nao-existe]] e [[usar-docker]].\n");
  registro(workspace, "feedback", "app", "evitar-docker", { description: "Nunca use docker para rodar os testes de integração do banco", type: "feedback" });
  registro(workspace, "aprendizados", "app", "cache-a", { description: "Cache de build do pipeline invalida a cada merge", type: "project" }, "O cache de build do pipeline invalida a cada merge na main.\n");
  registro(workspace, "aprendizados", "app", "cache-b", { description: "Cache de build do pipeline invalida a cada merge", type: "project" }, "O cache de build do pipeline invalida a cada merge na main.\n");
  escrever(path.join(memoria(), "decisoes", "app", "yaml.md"), "---\nname: y\ndescription: Quebra: sem aspas\nmetadata:\n  type: decision\n  modified: 2026-01-01\n---\n");
  const antes = fotografar(tmp);
  const achados = lint(memoria());
  const info = status(memoria());
  assert.deepEqual(fotografar(tmp), antes);
  assert.ok(achados.duplicatas.some(linha => linha.includes("cache-a.md e aprendizados/app/cache-b.md")));
  assert.ok(achados.contradicoes.some(linha => linha.includes("usar-docker.md x feedback/app/evitar-docker.md") || linha.includes("evitar-docker.md x feedback/app/usar-docker.md")));
  assert.deepEqual(achados.linksQuebrados, ["feedback/app/usar-docker.md: [[nao-existe]]"]);
  assert.match(achados.invalidas.join(), /yaml\.md: description: valor com dois pontos precisa de aspas/);
  assert.equal(info.total, 5);
  assert.equal(info.porContexto.app, 4);
  assert.equal(info.invalidas.length, 1);
});

test("mapa gera graph.json no formato do graphify só com registros, sem nós de tipo nem de contexto", () => {
  iniciar();
  registro(workspace, "decisoes", "app", "banco", { description: "SQLite em memória", type: "decision" }, "Ver [[perfil]].\n");
  registro(workspace, "feedback", "app", "perfil", { description: "perfil do dev", type: "user" });
  registro(workspace, "decisoes", "app", "velha", { description: "regra velha", type: "decision", superseded_by: "banco" });
  secaoGeral(workspace, "feedback", "Sem travessão", "2026-10-01", "Nunca usar travessão.");
  gerarMapa(memoria());
  const grafo = JSON.parse(fs.readFileSync(path.join(memoria(), "graphify-out", "graph.json"), "utf8"));
  assert.deepEqual([grafo.directed, grafo.multigraph], [true, false]);
  const ids = grafo.nodes.map(no => no.id);
  for (const id of ["registro:decisoes/app/banco.md", "registro:feedback/README.md#sem-travessao"]) assert.ok(ids.includes(id), id);
  assert.ok(ids.every(id => id.startsWith("registro:")));
  assert.equal(grafo.nodes.find(no => no.id === "registro:feedback/README.md#sem-travessao").contexto, "geral");
  const tem = (source, target, relation) => grafo.links.some(aresta => aresta.source === source && aresta.target === target && aresta.relation === relation && aresta.confidence === "EXTRACTED");
  assert.ok(tem("registro:decisoes/app/banco.md", "registro:feedback/app/perfil.md", "cita"));
  assert.ok(tem("registro:decisoes/app/velha.md", "registro:decisoes/app/banco.md", "substituida_por"));
});

test("mapa liga registros que dividem termos raros e ignora termos comuns", () => {
  iniciar();
  registro(workspace, "decisoes", "infra", "docker-wsl", { description: "Docker roda no WSL", type: "decision" }, "Containers do Postgres no Ubuntu.\n");
  registro(workspace, "decisoes", "api", "persistencia", { description: "API usa Postgres", type: "decision" }, "Testcontainers sobe Postgres no Docker.\n");
  for (let i = 0; i < 40; i += 1) registro(workspace, "feedback", "geral", `regra-${i}`, { description: `regra número ${i} do projeto`, type: "feedback" }, "Projeto segue a regra.\n");
  const grafo = gerarMapa(memoria());
  const termo = grafo.links.filter(aresta => aresta.relation === "divide_termos");
  const par = termo.find(aresta => [aresta.source, aresta.target].sort().join("|") === "registro:decisoes/api/persistencia.md|registro:decisoes/infra/docker-wsl.md");
  assert.ok(par);
  assert.equal(par.confidence, "INFERRED");
  assert.ok(par.termos.includes("postgre"));
  assert.ok(termo.every(aresta => !aresta.termos.includes("projeto") && !aresta.termos.includes("regra")));
});

test("migrar: o plano não altera a memória; --aplicar converte, move, remove o Histórico e cria seções datadas", () => {
  fs.mkdirSync(path.join(workspace, "app-loja", ".git"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "jogo-cartas", ".git"), { recursive: true });
  const velho = (pasta, nome, campos, corpo) => escrever(path.join(memoria(), pasta, `${nome}.md`), `---\n${Object.entries({ status: "vigente", criado: "2026-01-01", ...campos }).map(([chave, valor]) => `${chave}: ${valor}`).join("\n")}\n---\n\n${corpo}\n`);
  escrever(path.join(memoria(), "COMO-USAR.md"), "protocolo\n");
  velho("aprendizados", "app-loja-scan", { titulo: "Scan", resumo: "\"Scan da loja\"", tipo: "aprendizado", assuntos: "[scan]", escopo: "app-loja", atualizado: "2026-03-03" }, "Texto do scan. Ver [outro](../decisoes/jogo-troca.md).\n\n## Histórico\n\n- 2026-03-03: importada.");
  velho("decisoes", "jogo-troca", { titulo: "Troca do 2", resumo: "\"Trocar o 2\"", tipo: "decisao", assuntos: "[jogo-cartas, carta]", escopo: "workspace" }, "Decisão.");
  velho("decisoes", "antiga", { titulo: "Antiga", resumo: "\"Antiga\"", tipo: "decisao", assuntos: "[x]", escopo: "app-loja", status: "substituida", substituida_por: "decisoes/jogo-troca.md" }, "Velha.");
  velho("feedback", "sem-travessao", { titulo: "Sem travessão", resumo: "\"Nunca usar travessão\"", tipo: "feedback", assuntos: "[texto]", escopo: "workspace", vale_fora_daqui: "true", atualizado: "2026-10-01" }, "# Sem travessão\n\nNunca.\n\n## Por quê\n\nPreferência.");
  velho("feedback", "perfil-dev", { titulo: "Perfil dev", resumo: "\"Dev sênior\"", tipo: "feedback", assuntos: "[perfil]", escopo: "workspace", vale_fora_daqui: "true" }, "Dev.");
  velho("pendencias", "app-loja-lembrar", { titulo: "Lembrar", resumo: "\"Lembrar de algo\"", tipo: "pendencia", assuntos: "[x]", escopo: "app-loja", revisar_em: "2026-12-01" }, "Pendente.");
  velho("referencias", "solta-sem-dono", { titulo: "Solta", resumo: "\"Algo\"", tipo: "referencia", assuntos: "[x]", escopo: "workspace" }, "Sem dono.");
  escrever(path.join(memoria(), "aprendizados", "quebrado.md"), "sem frontmatter\n");

  const antes = fotografar(workspace);
  const plano = planejarMigracao(memoria());
  assert.deepEqual(fotografar(workspace), antes);
  const resumo = resumoDoPlano(plano);
  assert.deepEqual([resumo.total, resumo.convertidos, resumo.ignorados], [8, 7, 1]);
  assert.deepEqual(resumo.porContexto, { "app-loja": 3, "jogo-cartas": 1, geral: 3 });
  const duvidosos = plano.itens.filter(item => item.duvida).map(item => item.origem).sort();
  assert.deepEqual(duvidosos, ["aprendizados/quebrado.md", "decisoes/jogo-troca.md", "referencias/solta-sem-dono.md"]);

  const saida = path.join(tmp, "plano.md");
  const cli = spawnSync(process.execPath, [path.join(RAIZ, "memory.js"), "migrar", workspace, "--saida", saida], { encoding: "utf8", env: process.env });
  assert.equal(cli.status, 0);
  assert.match(cli.stdout, /Convertidos: 7  ignorados: 1  duvidosos: 3/);
  assert.match(fs.readFileSync(saida, "utf8"), /\| `aprendizados\/app-loja-scan\.md` \| `aprendizados\/app-loja\/app-loja-scan\.md` \|/);
  assert.deepEqual(fotografar(workspace), antes);

  aplicarMigracao(memoria(), plano);
  const entradas = lerEntradas(memoria());
  assert.deepEqual(entradas.filter(item => item.erros.length && !item.id.includes("quebrado")).map(item => `${item.id}: ${item.erros}`), []);
  const por = id => entradas.find(item => item.id === id);
  const scan = por("aprendizados/app-loja/app-loja-scan.md");
  assert.deepEqual([scan.name, scan.description, scan.tipo, scan.modified], ["app-loja-scan", "Scan da loja", "project", "2026-03-03"]);
  assert.doesNotMatch(scan.corpo, /Histórico/);
  assert.match(scan.corpo, /\[outro\]\(\.\.\/decisoes\/jogo-troca\.md\)|outro \(\[\[jogo-troca\]\]\)/);
  assert.equal(por("decisoes/app-loja/antiga.md").superseded_by, "jogo-troca");
  assert.equal(por("feedback/perfil-dev.md"), undefined);
  assert.equal(por("pendencias/app-loja/app-loja-lembrar.md").review, "2026-12-01");
  const geral = por("feedback/README.md#sem-travessao");
  assert.deepEqual([geral.modified, geral.description], ["2026-10-01", "Nunca usar travessão"]);
  assert.match(geral.corpo, /### Por quê/);
  assert.equal(fs.existsSync(path.join(memoria(), "aprendizados", "app-loja-scan.md")), false);
  assert.ok(fs.existsSync(path.join(memoria(), "aprendizados", "quebrado.md")));
  assert.equal(por("feedback/README.md#perfil-dev").modified, "2026-01-01");
});

test("init --graphify liga o mapa e o hook de escrita o refaz em segundo plano", async () => {
  process.env.MEMORY_SAVER_GRAPHIFY = process.execPath;
  const plano = planejarInit(workspace, { graphify: true });
  assert.ok(plano.acoes.some(acao => /ligar o mapa do graphify/.test(acao)));
  plano.aplicar();
  const grafo = path.join(memoria(), "graphify-out", "graph.json");
  assert.ok(fs.existsSync(grafo));
  assert.ok(!planejarInit(workspace, { graphify: true }).acoes.some(acao => /graphify/.test(acao)));
  assert.equal(status(memoria()).graphify, true);

  registro(workspace, "decisoes", "app", "banco-novo", { description: "\"Banco novo\"", type: "decision" });
  postToolUse({ cwd: workspace, tool_name: "Write", tool_input: { file_path: path.join(memoria(), "decisoes", "app", "banco-novo.md") } });
  let refeito = false;
  for (let i = 0; i < 50 && !refeito; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    refeito = fs.readFileSync(grafo, "utf8").includes("banco-novo");
  }
  assert.ok(refeito);
});

test("migrar: escopo geral vence a dedução pelo nome e não vira contexto", () => {
  fs.mkdirSync(path.join(workspace, "app-loja", ".git"), { recursive: true });
  escrever(path.join(memoria(), "feedback", "app-loja-regra.md"), "---\ntitulo: Regra\nresumo: \"Vale em todo projeto\"\ntipo: feedback\nescopo: geral\nstatus: vigente\ncriado: 2026-01-01\n---\n\nTexto.\n");
  const [item] = planejarMigracao(memoria()).itens;
  assert.deepEqual([item.geral, item.duvida, item.destino], [true, null, "feedback/README.md"]);
});

test("init importa a memória nativa encontrada e a de outra pasta para tipo/contexto, sem apagar o original", () => {
  const codigo = path.resolve(workspace).replace(/[^A-Za-z0-9]/g, "-");
  const nativa = path.join(claude, "projects", `${codigo}-app`, "memory");
  escrever(path.join(nativa, "MEMORY.md"), "- índice\n");
  escrever(path.join(nativa, "user-perfil.md"), "---\nname: user-perfil\ndescription: Dev sênior que prefere pt-BR\nmetadata:\n  type: user\n---\n\nPrefere respostas curtas.\n");
  escrever(path.join(nativa, "project-estado.md"), "---\nname: project-estado-do-deploy\ndescription: Deploy manual às sextas\ntype: project\n---\n\nDeploy é manual.\n");
  const antiga = path.join(tmp, "antiga", "memory");
  escrever(path.join(antiga, "reference-painel.md"), "---\nname: painel-de-logs\ndescription: Onde ficam os logs\nmetadata:\n  type: reference\n---\n\nNo painel X.\n");

  const semImportar = planejarInit(workspace);
  assert.ok(semImportar.avisos.some(aviso => aviso.includes("--importar")));
  const plano = iniciar({ importar: true, importarDe: [`${path.dirname(antiga)}=legado`] });
  assert.ok(plano.acoes.some(acao => acao.includes("importar 3")));

  const entradas = lerEntradas(memoria());
  assert.deepEqual(entradas.filter(item => item.erros.length).map(item => item.id), []);
  const perfil = entradas.find(item => item.id === "feedback/app/perfil.md");
  assert.deepEqual([perfil.tipo, perfil.description], ["user", "Dev sênior que prefere pt-BR"]);
  assert.equal(entradas.find(item => item.id === "aprendizados/app/estado-do-deploy.md").tipo, "project");
  assert.equal(entradas.find(item => item.id === "referencias/legado/painel-de-logs.md").tipo, "reference");
  assert.ok(fs.existsSync(path.join(nativa, "user-perfil.md")));
  assert.ok(fs.existsSync(path.join(antiga, "reference-painel.md")));

  const foto = fotografar(workspace);
  iniciar({ importar: true, importarDe: [`${path.dirname(antiga)}=legado`] });
  assert.deepEqual(fotografar(workspace), foto);
});

test("Estado do projeto: entra inteiro no início da sessão do repo e uma vez por sessão quando o pedido cita um termo", () => {
  iniciar();
  const repo = path.join(workspace, "meu-app");
  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  escrever(path.join(memoria(), "estado", "meu-app.md"), "---\ntermos: app, checkout\n---\n# Estado do meu-app\n| Capacidade | Onde |\n| Checkout pronto | src/checkout.js |\n");
  escrever(path.join(memoria(), "estado", "porto.md"), "---\ntermos: ffbe, Cecil, vision\n---\n# Estado do porto\nO Studio builda em 5 s.\n");

  const inicio = sessionStart({ cwd: repo, session_id: "s1" }).hookSpecificOutput.additionalContext;
  assert.match(inicio, /Estado do projeto meu-app \(\.\.\/memoria\/estado\/meu-app\.md\)/);
  assert.match(inicio, /Checkout pronto \| src\/checkout\.js/);
  assert.doesNotMatch(inicio, /Studio builda/);
  assert.equal(lerEntradas(memoria()).some(entrada => entrada.caminho.startsWith("estado")), false);

  const pedido = prompt => userPromptSubmit({ cwd: repo, session_id: "s1", prompt })?.hookSpecificOutput.additionalContext ?? "";
  assert.doesNotMatch(pedido("ajusta o checkout"), /Estado do projeto meu-app/);
  assert.match(pedido("o cecil precisa do LB"), /Estado do projeto porto[\s\S]*O Studio builda em 5 s/);
  assert.doesNotMatch(pedido("e a vision do cecil?"), /Estado do projeto porto/);
  assert.doesNotMatch(pedido("visionário"), /Estado do projeto porto/);
  assert.match(userPromptSubmit({ cwd: repo, session_id: "s2", prompt: "FFBE" }).hookSpecificOutput.additionalContext, /Estado do projeto porto/);
});
