import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { casar } from "../src/casamento.js";
import { lerEntradas } from "../src/memoria.js";
import { userPromptSubmit } from "../src/hooks.js";
import { criarAmbiente, escrever, registro, secaoGeral } from "./auxiliar.js";

let ambiente;
beforeEach(() => {
  ambiente = criarAmbiente();
  escrever(path.join(ambiente.workspace, "memoria", "COMO-USAR.md"), "protocolo\n");
  const w = ambiente.workspace;
  registro(w, "decisoes", "jogo-cartas", "jogo-troca-do-2-clara", { description: "Trocar o 2 de paus pela versão clara para melhorar a leitura da carta", type: "decision" }, "O 2 escuro sumia no fundo verde da mesa.\n");
  registro(w, "feedback", "app-loja", "validar-antes-de-entregar", { description: "Validar com screenshot real antes de dizer que a entrega está pronta", type: "feedback" });
  registro(w, "aprendizados", "app-loja", "scan-de-loja", { description: "Scan da loja de presentes confunde o ícone de gift com item comum", type: "project" });
  registro(w, "aprendizados", "app-loja", "nomes-de-pacote", { description: "Nomes dos pacotes de cartas seguem a lista oficial", type: "project" }, "As cartas do pacote vêm do dump do jogo.\n");
  registro(w, "referencias", "estudio", "painel-de-metricas", { description: "O painel de métricas do estudio fica no Looker, aba retenção", type: "reference" });
  registro(w, "decisoes", "ferramentas", "orquestrador-porta-unica", { description: "kit-orquestrador é a porta única do catálogo de skills", type: "decision" });
  registro(w, "pendencias", "jogo-cartas", "trailer-gameplay", { description: "Gravar o trailer de gameplay do baralho", type: "pending", review: "2026-12-01" });
  registro(w, "aprendizados", "estudio", "controle-touch", { description: "O controle touch do jogador usa arraste relativo, não joystick fixo", type: "project" });
  registro(w, "aprendizados", "canal-video", "layout-calibracao", { description: "A calibração do layout vertical dos shorts muda a cada episódio", type: "project" });
  registro(w, "documentacao", "estudio", "tendencias", { description: "Tendências de jogos hipercasuais em 2026", type: "reference" });
  registro(w, "decisoes", "financas-app", "banco-de-dados", { description: "O banco de dados do financas-app é SQLite local", type: "decision" });
  registro(w, "feedback", "estudio", "forma-de-trabalhar", { description: "No estudio, prototipar antes de polir", type: "feedback" });
  secaoGeral(w, "feedback", "Sem travessão em textos", "2026-10-01", "Nunca usar travessão em texto gerado.");
  secaoGeral(w, "feedback", "Commits em português", "2026-10-02", "Mensagem de commit sempre em português, sem citar IA.");
});
afterEach(() => fs.rmSync(ambiente.tmp, { recursive: true, force: true }));

const POSITIVOS = [
  ["por que trocamos o 2 de paus no jogo de cartas", "decisoes/jogo-cartas/jogo-troca-do-2-clara.md"],
  ["antes de entregar o scan preciso validar com screenshot", "feedback/app-loja/validar-antes-de-entregar.md"],
  ["o scan da loja pega gift errado", "aprendizados/app-loja/scan-de-loja.md"],
  ["onde fica o painel de métricas de retenção", "referencias/estudio/painel-de-metricas.md"],
  ["como o orquestrador escolhe as skills", "decisoes/ferramentas/orquestrador-porta-unica.md"],
  ["me lembra do trailer de gameplay", "pendencias/jogo-cartas/trailer-gameplay.md"],
  ["escreve o texto sem travessão", "feedback/README.md#sem-travessao-em-textos"],
  ["monta a mensagem do commit", "feedback/README.md#commits-em-portugues"],
  ["como funciona o controle touch", "aprendizados/estudio/controle-touch.md"],
];
const HARD_NEGATIVES = [
  "qual o melhor banco de imagens gratuito",
  "preciso de uma receita de bolo de chocolate",
  "o scan do OCR do cupom fiscal falhou",
  "qual a cor da carta de copas",
];

test("eval de ponteiros: hit@5 total, separando perda por filtro de perda por ranking", () => {
  const entradas = lerEntradas(path.join(ambiente.workspace, "memoria"));
  let hits = 0;
  const perdaPorFiltro = [];
  const perdaPorRanking = [];
  for (const [pergunta, esperado] of POSITIVOS) {
    const todas = casar(pergunta, entradas, { limite: 100 }).map(item => item.id);
    if (!todas.includes(esperado)) perdaPorFiltro.push(pergunta);
    else if (todas.indexOf(esperado) >= 5) perdaPorRanking.push(pergunta);
    else hits += 1;
  }
  assert.deepEqual(perdaPorFiltro, []);
  assert.deepEqual(perdaPorRanking, []);
  assert.equal(hits / POSITIVOS.length, 1);
});

test("eval de ponteiros: hard negatives (assunto parecido sem resposta) não geram ponteiro", () => {
  const entradas = lerEntradas(path.join(ambiente.workspace, "memoria"));
  for (const pergunta of HARD_NEGATIVES) assert.deepEqual(casar(pergunta, entradas).map(item => item.id), [], pergunta);
});

test("eval de ponteiros: o contexto do repositório aberto vem primeiro e o custo injetado fica pequeno", () => {
  const entradas = lerEntradas(path.join(ambiente.workspace, "memoria"));
  const empate = "estudio jogo cartas prototipar trailer controle";
  const ordem = casar(empate, entradas, { contexto: "jogo-cartas" });
  assert.equal(ordem[0].contexto, "jogo-cartas");
  for (const [pergunta] of POSITIVOS) {
    const saida = userPromptSubmit({ cwd: ambiente.workspace, prompt: pergunta });
    assert.ok(saida.hookSpecificOutput.additionalContext.length / 4 < 500, pergunta);
  }
});

test("registro expirado não gera ponteiro e o substituído carrega o aviso", () => {
  const w = ambiente.workspace;
  registro(w, "decisoes", "ferramentas", "velha-regra-de-commit", { description: "Antiga regra sobre commit manual", type: "decision", expires: "2020-01-01" });
  registro(w, "decisoes", "ferramentas", "regra-de-commit-substituida", { description: "Regra de commit com revisão manual substituída", type: "decision", superseded_by: "commits-em-portugues" });
  const saida = userPromptSubmit({ cwd: w, prompt: "regra de commit com revisão manual" }).hookSpecificOutput.additionalContext;
  assert.doesNotMatch(saida, /velha-regra-de-commit/);
  assert.match(saida, /regra-de-commit-substituida\.md \(substituída por commits-em-portugues\)/);
});
