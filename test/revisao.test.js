import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { acharMemoria, lerEntradas } from "../src/memoria.js";
import { casar } from "../src/casamento.js";
import { aplicarMigracao, planejarMigracao } from "../src/migrar.js";
import { detectarSensivel } from "../src/sensivel.js";
import { criarAmbiente, escrever, registro, secaoGeral } from "./auxiliar.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let ambiente, workspace, memoria;

beforeEach(() => {
  ambiente = criarAmbiente();
  workspace = ambiente.workspace;
  memoria = path.join(workspace, "memoria");
  escrever(path.join(memoria, "COMO-USAR.md"), "protocolo\n");
});
afterEach(() => fs.rmSync(ambiente.tmp, { recursive: true, force: true }));

const velho = (pasta, nome, campos, corpo = "Texto.") =>
  escrever(path.join(memoria, pasta, `${nome}.md`), `---\n${Object.entries({ status: "vigente", criado: "2026-01-01", escopo: "workspace", assuntos: "[x]", ...campos }).map(([chave, valor]) => `${chave}: ${valor}`).join("\n")}\n---\n\n${corpo}\n`);

test("migrar: título geral repetido é desambiguado e a origem só é apagada se foi gravada", () => {
  secaoGeral(workspace, "feedback", "Regra comum", "2026-01-01", "Já existia.");
  velho("feedback", "a", { titulo: "Regra comum", resumo: "\"A\"", tipo: "feedback", vale_fora_daqui: "true" });
  velho("feedback", "b", { titulo: "Outra regra", resumo: "\"B\"", tipo: "feedback", vale_fora_daqui: "true" });
  velho("feedback", "c", { titulo: "Outra regra", resumo: "\"C\"", tipo: "feedback", vale_fora_daqui: "true", revisar_em: "2027-01-01" });
  const plano = planejarMigracao(memoria);
  assert.deepEqual(plano.itens.map(item => item.titulo), ["Regra comum [a]", "Outra regra", "Outra regra [c]"]);
  assert.ok(plano.itens[0].duvida && plano.itens[2].duvida);
  assert.match(plano.itens[2].secao.corpo, /Revisar em 2027-01-01/);
  const { aplicados, pulados } = aplicarMigracao(memoria, plano);
  assert.deepEqual([aplicados.length, pulados.length], [3, 0]);
  const ids = lerEntradas(memoria).map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(fs.existsSync(path.join(memoria, "feedback", "a.md")), false);

  velho("feedback", "d", { titulo: "Outra regra", resumo: "\"D\"", tipo: "feedback", vale_fora_daqui: "true" });
  const plano2 = planejarMigracao(memoria);
  plano2.itens[0].secao.titulo = "Outra regra";
  const resultado = aplicarMigracao(memoria, plano2);
  assert.deepEqual(resultado.pulados, ["feedback/d.md"]);
  assert.ok(fs.existsSync(path.join(memoria, "feedback", "d.md")));
});

test("migrar: encerrado sem contexto não vai para o README geral, destino existente não é sobrescrito, md- reaponta link", () => {
  fs.mkdirSync(path.join(workspace, "app", ".git"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "sem-git"));
  velho("aprendizados", "velha", { titulo: "Velha", resumo: "\"V\"", tipo: "aprendizado", status: "obsoleta", vale_fora_daqui: "true" });
  velho("aprendizados", "app-x", { titulo: "X", resumo: "\"X\"", tipo: "aprendizado" }, "Ver [[md-app-y]] e [[sem-git]].");
  velho("aprendizados", "app-y", { titulo: "Y", resumo: "\"Y\"", tipo: "aprendizado", escopo: "app" });
  registro(workspace, "aprendizados", "app", "app-x", { description: "existente", type: "project" }, "Não mexer.\n");
  const antes = fs.readFileSync(path.join(memoria, "aprendizados", "app", "app-x.md"), "utf8");
  const plano = planejarMigracao(memoria);
  const por = origem => plano.itens.find(item => item.origem === origem);
  assert.equal(por("aprendizados/velha.md").ignorado, true);
  assert.equal(por("aprendizados/app-x.md").ignorado, true);
  assert.match(por("aprendizados/app-x.md").duvida, /já existe/);
  assert.match(por("aprendizados/app-y.md").conteudo, /name: app-y/);
  aplicarMigracao(memoria, plano);
  assert.equal(fs.readFileSync(path.join(memoria, "aprendizados", "app", "app-x.md"), "utf8"), antes);
  assert.ok(fs.existsSync(path.join(memoria, "aprendizados", "velha.md")));
  assert.ok(fs.existsSync(path.join(memoria, "aprendizados", "app-x.md")));
  assert.equal(fs.existsSync(path.join(memoria, "aprendizados", "app-y.md")), false);
});

test("migrar: só pastas irmãs com .git são contextos conhecidos, e ## dentro de cerca não vira seção", () => {
  fs.mkdirSync(path.join(workspace, "pasta-solta"));
  velho("feedback", "pasta-solta-regra", { titulo: "Regra", resumo: "\"R\"", tipo: "feedback", vale_fora_daqui: "true" }, "Antes\n\n```md\n## dentro da cerca\n```\n\n## Fora da cerca\n\nTexto.");
  const plano = planejarMigracao(memoria);
  assert.equal(plano.itens[0].geral, true);
  const corpo = plano.itens[0].secao.corpo;
  assert.ok(corpo.includes("\n## dentro da cerca\n"));
  assert.ok(corpo.includes("\n### Fora da cerca\n"));
  aplicarMigracao(memoria, plano);
  const secoes = lerEntradas(memoria).filter(item => item.geral);
  assert.deepEqual(secoes.map(item => item.secao), ["Regra"]);
});

test("README com cabeçalho vazio, cerca e título repetido não lança; hooks continuam respondendo JSON", () => {
  escrever(path.join(memoria, "feedback", "README.md"), "# Feedback gerais\n\n## \n\nSem título.\n\n## Igual (2026-01-01)\n\nUm.\n\n```\n## falso\n```\n\n## Igual (2026-01-02)\n\nDois.\n\n##\n");
  const entradas = lerEntradas(memoria).filter(item => item.geral);
  assert.deepEqual(entradas.map(item => item.id), ["feedback/README.md#secao-1", "feedback/README.md#igual", "feedback/README.md#igual-2", "feedback/README.md#secao-4"]);
  assert.equal(entradas.filter(item => item.erros.length).length, 2);
  for (const evento of ["SessionStart", "UserPromptSubmit", "PostToolUse"]) {
    const resultado = spawnSync(process.execPath, [path.join(RAIZ, "memory.js"), "hook", evento], { input: JSON.stringify({ cwd: workspace, prompt: "igual", tool_input: { file_path: path.join(memoria, "feedback", "README.md") } }), encoding: "utf8", env: process.env, cwd: workspace });
    assert.equal(resultado.status, 0);
    assert.doesNotThrow(() => JSON.parse(resultado.stdout));
  }
});

test("a busca de memoria/ não sobe acima do diretório temporário mesmo sem MEMORY_SAVER_TETO", () => {
  const teto = process.env.MEMORY_SAVER_TETO;
  delete process.env.MEMORY_SAVER_TETO;
  try {
    const fundo = path.join(ambiente.tmp, "a", "b");
    fs.mkdirSync(fundo, { recursive: true });
    fs.rmSync(memoria, { recursive: true });
    assert.equal(acharMemoria(fundo), null);
  } finally {
    process.env.MEMORY_SAVER_TETO = teto;
  }
});

test("contexto aberto é bônus, não ordenação absoluta: feedback geral forte continua no top 5", () => {
  secaoGeral(workspace, "feedback", "Commits em português", "2026-10-02", "Mensagem de commit sempre em português e sem citar ferramenta.");
  for (let i = 0; i < 7; i++) registro(workspace, "aprendizados", "app", `nota-${i}`, { description: `Nota ${i} sobre o commit do app`, type: "project" }, "Detalhe qualquer.\n");
  const entradas = lerEntradas(memoria);
  const ids = casar("mensagem de commit em português", entradas, { contexto: "app" }).map(item => item.id);
  assert.ok(ids.includes("feedback/README.md#commits-em-portugues"), ids.join());
});

test("segredos: senha, chave, PASS e PWD são achados; frase comum com token não", () => {
  for (const texto of ["senha: Abc12345", "chave = 9f8e7d6c5b", "DB_PASS=abc123xyz", "DB_PWD=abc123xyz"]) assert.ok(detectarSensivel(texto).length > 0, texto);
  assert.deepEqual(detectarSensivel("token: precisa renovar toda semana"), []);
});
