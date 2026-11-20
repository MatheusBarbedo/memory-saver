import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { userPromptSubmit } from "../src/hooks.js";
import { planejarInit } from "../src/instalador.js";
import { contextoDoArquivo } from "../src/contexto.js";
import { TETO_HOOK } from "../src/estados.js";
import { criarAmbiente, escrever, registro } from "./auxiliar.js";

let ambiente;
const SESSAO = "019a0000-1111-7222-8333-444455556666";

const transcriptClaude = (arquivo, tokens) => escrever(arquivo, [
  JSON.stringify({ type: "user", message: { role: "user", content: "oi" } }),
  JSON.stringify({ type: "assistant", message: { id: "a", usage: { input_tokens: 10, cache_read_input_tokens: 5, cache_creation_input_tokens: 5, output_tokens: 1 } } }),
  JSON.stringify({ type: "assistant", message: { id: "b", usage: { input_tokens: 1000, cache_read_input_tokens: tokens - 1500, cache_creation_input_tokens: 500, output_tokens: 300 } } }),
  JSON.stringify({ type: "assistant", isSidechain: true, message: { id: "c", usage: { input_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }),
  JSON.stringify({ type: "user", message: { role: "user", content: "tool" } }),
].join("\n") + "\n");

const rolloutCodex = (arquivo, tokens) => escrever(arquivo, [
  JSON.stringify({ type: "session_meta", payload: { id: SESSAO } }),
  JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: tokens * 9 }, last_token_usage: { input_tokens: 12 }, model_context_window: 475000 } } }),
  JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: tokens * 10 }, last_token_usage: { input_tokens: tokens, cached_input_tokens: tokens - 100 }, model_context_window: 475000 } } }),
  JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: null } }),
].join("\n") + "\n");

const iniciar = () => planejarInit(ambiente.workspace).aplicar();
const texto = saida => saida?.hookSpecificOutput.additionalContext ?? "";

beforeEach(() => { ambiente = criarAmbiente(); iniciar(); });
afterEach(() => fs.rmSync(ambiente.tmp, { recursive: true, force: true }));

test("Claude: 350k não avisa, 420k avisa e 720k insiste, pela última resposta do transcript", () => {
  const arquivo = path.join(ambiente.claude, "projects", "w", `${SESSAO}.jsonl`);
  const pedir = () => texto(userPromptSubmit({ cwd: ambiente.workspace, prompt: "seguir", session_id: SESSAO, transcript_path: arquivo }));
  transcriptClaude(arquivo, 350_000);
  assert.equal(pedir(), "");
  transcriptClaude(arquivo, 420_000);
  assert.match(pedir(), /^memory-saver: Contexto em ~420k\. Na próxima pausa natural, feche o passo, atualize o HANDOFF e o estado e proponha a troca com o bloco de retomada; se o dono já decidiu manter, só registre\.$/);
  transcriptClaude(arquivo, 720_000);
  assert.match(pedir(), /Contexto em ~720k\..*termine só o passo em andamento\.$/);
});

test("Codex: acha o rollout pelo session_id quando a entrada não traz transcript_path, e lê last_token_usage", () => {
  const arquivo = path.join(ambiente.codex, "sessions", "2026", "11", "20", `rollout-2026-11-20T08-00-00-${SESSAO}.jsonl`);
  escrever(path.join(ambiente.codex, "sessions", "2026", "11", "21", "rollout-2026-11-21T08-00-00-019a0000-0000-0000-0000-000000000000.jsonl"), "");
  const pedir = transcript_path => texto(userPromptSubmit({ cwd: ambiente.workspace, prompt: "seguir", session_id: SESSAO, transcript_path }));
  rolloutCodex(arquivo, 350_000);
  assert.equal(pedir(null), "");
  rolloutCodex(arquivo, 420_000);
  assert.match(pedir(null), /Contexto em ~420k\./);
  assert.doesNotMatch(pedir(null), /termine só/);
  rolloutCodex(arquivo, 720_000);
  assert.match(pedir(null), /Contexto em ~720k\..*termine só o passo em andamento\./);
  assert.match(pedir(arquivo), /Contexto em ~720k/);
  assert.match(pedir(path.join(ambiente.tmp, "nao-existe.jsonl")), /Contexto em ~720k/);
});

test("o aviso vem antes dos ponteiros e o total respeita o teto do hook", () => {
  const arquivo = path.join(ambiente.tmp, "t.jsonl");
  transcriptClaude(arquivo, 800_000);
  for (let i = 0; i < 40; i++) registro(ambiente.workspace, "decisoes", "app", `deploy-${i}`, { description: `Deploy do app ${"x".repeat(240)} ${i}`, type: "decision" }, `Deploy ${"y".repeat(400)}\n`);
  const saida = texto(userPromptSubmit({ cwd: ambiente.workspace, prompt: "deploy do app", session_id: SESSAO, transcript_path: arquivo }));
  assert.match(saida, /^memory-saver: Contexto em ~800k/);
  assert.match(saida, /Registros da memória ligados a este pedido/);
  assert.ok(saida.length <= TETO_HOOK + 80, `${saida.length}`);
});

test("cauda: transcript grande é lido só no fim e linha cortada no começo da cauda é ignorada", () => {
  const arquivo = path.join(ambiente.tmp, "grande.jsonl");
  const enchimento = JSON.stringify({ type: "user", message: { content: "z".repeat(1000) } });
  escrever(arquivo, Array.from({ length: 3000 }, () => enchimento).join("\n") + "\n");
  fs.appendFileSync(arquivo, JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 450_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) + "\n" + enchimento + "\n");
  assert.equal(contextoDoArquivo(arquivo), 450_000);
  escrever(path.join(ambiente.tmp, "vazio.jsonl"), enchimento + "\n");
  assert.equal(contextoDoArquivo(path.join(ambiente.tmp, "vazio.jsonl")), null);
});

test("fora de workspace com memória o aviso não sai", () => {
  const arquivo = path.join(ambiente.tmp, "t.jsonl");
  transcriptClaude(arquivo, 800_000);
  const fora = path.join(ambiente.tmp, "fora");
  fs.mkdirSync(fora, { recursive: true });
  assert.equal(userPromptSubmit({ cwd: fora, prompt: "seguir", session_id: SESSAO, transcript_path: arquivo }), null);
});
