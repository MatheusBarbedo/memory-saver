import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { escreverFrontmatter } from "../src/frontmatter.js";
import { lerEntradas } from "../src/memoria.js";
import { gerarIndice } from "../src/indice.js";
import { casar } from "../src/casamento.js";
import { detectarSensivel } from "../src/sensivel.js";
import { postToolUse, sessionStart, userPromptSubmit } from "../src/hooks.js";
import { desinstalarMaquina, instalarMaquina, planejarInit } from "../src/instalador.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let tmp, claude, workspace;

const escrever = (arquivo, texto) => {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, texto, "utf8");
};
const git = (cwd, ...args) => spawnSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" });
const entrada = (pasta, nome, dados, corpo = "Fato.\n") =>
  escrever(path.join(workspace, "memoria", pasta, `${nome}.md`), escreverFrontmatter({ status: "vigente", criado: "2026-01-01", ...dados }) + "\n" + corpo);

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

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "memory-saver-teste-"));
  claude = path.join(tmp, "claude");
  workspace = path.join(tmp, "workspace");
  process.env.CLAUDE_CONFIG_DIR = claude;
  process.env.MEMORY_SAVER_HOME = path.join(tmp, "estado");
  fs.mkdirSync(workspace, { recursive: true });
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

test("init é idempotente, fica fora do git e usa CLAUDE.local.md quando o CLAUDE.md é versionado", () => {
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
  for (const pasta of ["aprendizados", "decisoes", "feedback", "documentacao", "pendencias", "referencias"]) assert.ok(fs.existsSync(path.join(workspace, "memoria", pasta)));
  assert.equal(git(workspace, "status", "--porcelain", "--untracked-files=all").stdout.trim(), "");
});

test("init nunca sobrescreve entrada existente", () => {
  iniciar();
  entrada("decisoes", "minha", { titulo: "Minha", resumo: "r", tipo: "decisao", assuntos: ["x"] }, "original\n");
  const antes = fs.readFileSync(path.join(workspace, "memoria", "decisoes", "minha.md"), "utf8");
  fs.writeFileSync(path.join(workspace, "memoria", "COMO-USAR.md"), "meu protocolo\n", "utf8");
  iniciar();
  assert.equal(fs.readFileSync(path.join(workspace, "memoria", "decisoes", "minha.md"), "utf8"), antes);
  assert.equal(fs.readFileSync(path.join(workspace, "memoria", "COMO-USAR.md"), "utf8"), "meu protocolo\n");
});

test("indexador agrupa por assunto, mostra pendência vencida e o que vale fora, e não cai com frontmatter inválido", () => {
  iniciar();
  entrada("decisoes", "banco", { titulo: "Banco de testes", resumo: "SQLite em memória", tipo: "decisao", assuntos: ["banco de dados", "testes"] });
  entrada("feedback", "commits", { titulo: "Commits em pt-BR", resumo: "mensagens em português", tipo: "feedback", assuntos: ["git"], vale_fora_daqui: true });
  entrada("pendencias", "migrar", { titulo: "Migrar CI", resumo: "trocar pipeline", tipo: "pendencia", assuntos: ["testes"], revisar_em: "2000-01-01" });
  escrever(path.join(workspace, "memoria", "aprendizados", "quebrada.md"), "---\ntitulo: sem resto\n---\ncorpo\n");
  escrever(path.join(workspace, "memoria", "aprendizados", "sem-frontmatter.md"), "só texto\n");
  const indice = gerarIndice(lerEntradas(path.join(workspace, "memoria")), "2026-10-29");
  const secao = nome => indice.split(`## ${nome}`)[1].split("\n## ")[0];
  assert.match(secao("Pendências vencidas"), /Migrar CI/);
  assert.match(secao("Por assunto"), /### testes\n\n- \[Banco de testes\]\(decisoes\/banco\.md\) - SQLite em memória \(decisao, vigente\)\n- \[Migrar CI\]/);
  assert.match(secao("Por assunto"), /### banco de dados/);
  assert.match(secao("Vale fora deste workspace"), /Commits em pt-BR/);
  assert.doesNotMatch(secao("Vale fora deste workspace"), /Banco/);
  assert.match(secao("Com problema no frontmatter"), /quebrada\.md: falta resumo/);
  assert.match(secao("Com problema no frontmatter"), /sem-frontmatter\.md: sem frontmatter/);
});

const vigente = (caminho, assuntos, extra = {}) => ({ caminho, titulo: caminho, resumo: `resumo ${caminho}`, status: "vigente", assuntos, erros: [], atualizado: "2026-01-01", ...extra });

test("casamento ignora acento e maiúscula, casa assunto composto e ID, respeita teto de 5 e silêncio", () => {
  const entradas = [
    vigente("a.md", ["autenticação"]),
    vigente("b.md", ["banco de dados"]),
    vigente("c.md", ["PROJ-123"]),
    vigente("d.md", ["deploy"], { status: "obsoleta" }),
    vigente("e.md", ["deploy"], { erros: ["falta resumo"] }),
    vigente("f.md", ["banco"]),
  ];
  assert.deepEqual(casar("Como funciona a AUTENTICACAO?", entradas).map(e => e.caminho), ["a.md"]);
  assert.deepEqual(casar("trocar o Banco de Dados", entradas).map(e => e.caminho), ["b.md", "f.md"]);
  assert.deepEqual(casar("o banco caiu", entradas).map(e => e.caminho), ["f.md"]);
  assert.deepEqual(casar("veja o card proj-123 hoje", entradas).map(e => e.caminho), ["c.md"]);
  assert.deepEqual(casar("fazer deploy", entradas), []);
  assert.deepEqual(casar("nada a ver com nada", entradas), []);
  const muitas = Array.from({ length: 8 }, (_, i) => vigente(`m${i}.md`, ["cache"]));
  assert.equal(casar("limpa o cache", muitas).length, 5);
});

test("detector de dado sensível acha o que importa e ignora marcador", () => {
  const positivos = [
    ["CPF 529.982.247-25", "CPF"],
    ["cnpj 11.222.333/0001-81", "CNPJ"],
    ["-----BEGIN RSA PRIVATE KEY-----", "chave privada"],
    ["OPENAI=sk-proj-abcdefghijklmnopqrstuvwxyz123456", "chave de API"],
    ["AKIAABCDEFGHIJKLMNOP", "chave de API"],
    ["Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abcdefghijk", "token"],
    ["api_key = \"abcd1234efgh5678ijkl\"", "token"],
    ["Server=db;User Id=app;Password=Sup3rSecreta;", "senha em string de conexão"],
    ["postgres://app:minhasenha@localhost/db", "senha em URL"],
  ];
  for (const [texto, tipo] of positivos) assert.ok(detectarSensivel(texto).some(achado => achado.tipo === tipo), `${tipo}: ${texto}`);
  const negativos = [
    "CPF 123.456.789-00",
    "Password=<SENHA>;",
    "api_key = ${API_KEY}",
    "token: curto",
    "postgres://app:${SENHA}@localhost/db",
    "o arquivo de chave fica em ~/.ssh/id_rsa",
    "versão 2026-10-29 e ticket ABC-123",
  ];
  for (const texto of negativos) assert.deepEqual(detectarSensivel(texto), [], texto);
});

test("hooks ficam em silêncio fora de workspace com memória", () => {
  assert.equal(sessionStart({ cwd: workspace }), null);
  assert.equal(userPromptSubmit({ cwd: workspace, prompt: "qualquer coisa" }), null);
  assert.equal(postToolUse({ cwd: workspace, tool_name: "Write", tool_input: { file_path: path.join(workspace, "a.md") } }), null);
  for (const evento of ["SessionStart", "UserPromptSubmit", "PostToolUse"]) {
    const resultado = spawnSync(process.execPath, [path.join(RAIZ, "memory.js"), "hook", evento], { input: JSON.stringify({ cwd: workspace, prompt: "oi", tool_input: { file_path: path.join(workspace, "x.md") } }), encoding: "utf8", env: process.env });
    assert.equal(resultado.status, 0);
    assert.equal(resultado.stdout, "");
  }
});

test("hooks entregam resumo e ponteiros e avisam dado sensível depois da escrita", () => {
  iniciar();
  entrada("decisoes", "banco", { titulo: "Banco", resumo: "usar SQLite nos testes", tipo: "decisao", assuntos: ["banco de dados"] });
  entrada("pendencias", "ci", { titulo: "CI", resumo: "migrar pipeline", tipo: "pendencia", assuntos: ["pipeline"], revisar_em: "2000-01-01" });
  const sub = path.join(workspace, "src");
  fs.mkdirSync(sub);
  const inicio = sessionStart({ cwd: sub, source: "compact" }).hookSpecificOutput.additionalContext;
  assert.match(inicio, /2 entrada\(s\) vigente\(s\) em \.\.\/memoria\//);
  assert.match(inicio, /Pendências vencidas: \.\.\/memoria\/pendencias\/ci\.md/);
  assert.match(inicio, /Assuntos: .*banco de dados/);
  assert.ok(inicio.length <= 2000);
  const ponteiros = userPromptSubmit({ cwd: workspace, prompt: "Vamos mexer no banco de dados" }).hookSpecificOutput.additionalContext;
  assert.match(ponteiros, /- memoria\/decisoes\/banco\.md - usar SQLite nos testes/);

  const nova = path.join(workspace, "memoria", "referencias", "api.md");
  escrever(nova, escreverFrontmatter({ titulo: "API", resumo: "chave da API", tipo: "referencia", assuntos: ["api"], status: "vigente", criado: "2026-01-01" }) + "\nchave: ghp_abcdefghijklmnopqrstuvwxyz0123456789\n");
  const aviso = postToolUse({ cwd: workspace, tool_name: "Write", tool_input: { file_path: nova } });
  assert.equal(aviso.decision, "block");
  assert.match(aviso.reason, /chave de API/);
  assert.match(fs.readFileSync(path.join(workspace, "memoria", "INDICE.md"), "utf8"), /referencias\/api\.md/);
});

test("init importa a memória nativa encontrada e a de outra pasta, sem apagar o original", () => {
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

  const memoria = path.join(workspace, "memoria");
  const entradas = lerEntradas(memoria);
  assert.deepEqual(entradas.filter(e => e.erros.length).map(e => e.caminho), []);
  const perfil = entradas.find(e => e.caminho === "feedback/app-perfil.md");
  assert.equal(perfil.vale_fora_daqui, true);
  assert.equal(perfil.escopo, "app");
  const estado = entradas.find(e => e.tipo === "aprendizado");
  assert.equal(estado.caminho, "aprendizados/app-estado-do-deploy.md");
  assert.ok(estado.revisar_em);
  assert.ok(estado.assuntos.includes("deploy"));
  const painel = entradas.find(e => e.tipo === "referencia");
  assert.equal(painel.escopo, "legado");
  assert.match(painel.corpo, /## Histórico/);
  assert.ok(fs.existsSync(path.join(nativa, "user-perfil.md")));
  assert.ok(fs.existsSync(path.join(antiga, "reference-painel.md")));

  const foto = fotografar(workspace);
  iniciar({ importar: true, importarDe: [`${path.dirname(antiga)}=legado`] });
  assert.deepEqual(fotografar(workspace), foto);
});
