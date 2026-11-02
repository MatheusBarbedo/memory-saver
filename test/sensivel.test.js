import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectarSensivel, redigir } from "../src/sensivel.js";

const vetores = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "vetores-sensiveis.json"), "utf8"));
const CPF_E_CNPJ = [
  ["CPF 529.982.247-25", "CPF"],
  ["cnpj 11.222.333/0001-81", "CNPJ"],
];

test("credenciais falsas são achadas, com e sem caractere invisível no meio", () => {
  for (const credencial of vetores.credenciais) {
    assert.ok(detectarSensivel(`usei ${credencial} ontem`).length > 0, credencial);
    for (const invisivel of vetores.invisiveis) {
      const meio = Math.floor(credencial.length / 2);
      const camuflada = credencial.slice(0, meio) + invisivel + credencial.slice(meio);
      assert.ok(detectarSensivel(camuflada).length > 0, `${credencial} com ${JSON.stringify(invisivel)}`);
    }
  }
});

test("atribuições, URL com senha, CPF e CNPJ válidos são achados", () => {
  for (const texto of vetores.atribuicoes) assert.ok(detectarSensivel(texto).length > 0, texto);
  for (const [texto, tipo] of CPF_E_CNPJ) assert.ok(detectarSensivel(texto).some(achado => achado.tipo === tipo), texto);
});

test("chave privada é achada em todas as formas, com e sem END", () => {
  for (const bloco of vetores.blocos_de_chave_privada) assert.ok(detectarSensivel(bloco).some(achado => achado.tipo === "chave privada"), bloco);
});

test("falsos positivos do vetor não disparam", () => {
  for (const texto of vetores.falsos_positivos) assert.deepEqual(detectarSensivel(texto), [], texto);
});

test("redigir troca o segredo por marcador e preserva o resto", () => {
  const saida = redigir("antes sk-leak-0123456789abcdef0123 depois\n-----BEGIN PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\nfim");
  assert.match(saida, /antes \[REDACTED:chave de API\] depois/);
  assert.doesNotMatch(saida, /sk-leak|b3BlbnNz/);
  assert.match(saida, /fim$/);
});

test("canário: segredo plantado nunca aparece no que o memory-saver grava ou injeta", () => {
  const canario = "sk-canary-LEAK_ME_0123456789abcdef";
  assert.equal(redigir(`registro com ${canario}`).includes(canario), false);
  assert.ok(detectarSensivel(canario).length > 0);
});
