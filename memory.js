import path from "node:path";
import readline from "node:readline/promises";
import { rodarHook } from "./src/hooks.js";
import { desinstalarMaquina, instalarMaquina, planejarInit } from "./src/instalador.js";
import { acharMemoria } from "./src/memoria.js";
import { atualizarIndice } from "./src/indice.js";
import { revisar, stats, status } from "./src/relatorios.js";

const AJUDA = `Uso: node memory.js <comando>

  install                         registra os hooks e instala as skills (uma vez por máquina)
  uninstall                       remove hooks e skills; nunca apaga nenhuma pasta memoria/
  init [workspace]                cria memoria/ no workspace
       --importar                 importa a memória nativa encontrada para este workspace
       --importar-de <pasta>[=<escopo>]   importa de outra pasta de memória (pode repetir)
       --sim                      aplica sem perguntar
  status [workspace]              instalação, contagem por tipo e pendências vencidas
  indexar [workspace]             refaz o INDICE.md
  revisar [workspace]             aponta o que precisa de cuidado na memória
  stats [workspace]               o que foi injetado e o que nunca casou
  hook <evento>                   entrada dos hooks do Claude Code`;

function lerArgs(argv) {
  const opcoes = { sim: false, importar: false, importarDe: [] };
  const posicionais = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--sim") opcoes.sim = true;
    else if (argv[i] === "--importar") opcoes.importar = true;
    else if (argv[i] === "--importar-de") opcoes.importarDe.push(argv[++i]);
    else posicionais.push(argv[i]);
  }
  return { comando: posicionais[0], alvo: posicionais[1], opcoes };
}

async function confirmar(opcoes) {
  if (opcoes.sim) return true;
  if (!process.stdin.isTTY) {
    console.log("Nada foi gravado. Rode de novo com --sim para aplicar.");
    return false;
  }
  const leitor = readline.createInterface({ input: process.stdin, output: process.stdout });
  const resposta = await leitor.question("Aplicar? (s/N) ");
  leitor.close();
  return /^s/i.test(resposta.trim());
}

function memoriaOuErro(alvo) {
  const memoriaDir = acharMemoria(alvo ?? process.cwd());
  if (!memoriaDir) throw new Error(`Nenhuma memoria/ em ${path.resolve(alvo ?? process.cwd())} nem acima. Rode: node memory.js init`);
  return memoriaDir;
}

const imprimirLista = (titulo, itens) => {
  if (!itens.length) return;
  console.log(`\n${titulo} (${itens.length})`);
  for (const item of itens) console.log(`  ${item}`);
};

async function main(argv) {
  const { comando, alvo, opcoes } = lerArgs(argv);

  if (comando === "hook") return rodarHook(alvo);

  if (comando === "install") {
    const { settings, skills } = instalarMaquina();
    console.log(`Hooks registrados em ${settings}.`);
    for (const skill of skills) console.log(`Skill instalada: ${skill}`);
    console.log("Abra uma sessão nova do Claude Code para os hooks e as skills valerem.");
    return;
  }

  if (comando === "uninstall") {
    const { restaurados } = desinstalarMaquina();
    console.log("Hooks e skills do memory-saver removidos. Nenhuma pasta memoria/ foi tocada.");
    for (const workspace of restaurados) console.log(`Memória automática nativa devolvida ao normal em ${workspace}`);
    return;
  }

  if (comando === "init") {
    const plano = planejarInit(alvo ?? process.cwd(), opcoes);
    console.log(`\nMemória em ${plano.memoriaDir}`);
    for (const acao of plano.acoes) console.log(`  ${acao}`);
    for (const aviso of plano.avisos) console.log(`  aviso: ${aviso}`);
    if (!plano.acoes.length) {
      console.log("  Tudo já estava pronto.");
      return;
    }
    if (!(await confirmar(opcoes))) return;
    plano.aplicar();
    console.log("Pronto. A memória passa a aparecer na próxima sessão do Claude Code neste workspace.");
    return;
  }

  if (comando === "status") {
    const info = status(acharMemoria(alvo ?? process.cwd()));
    console.log(`memory-saver ${info.instalado ? "instalado nesta máquina" : "NÃO instalado nesta máquina (rode: node memory.js install)"}`);
    if (!info.memoria) return console.log("Nenhuma memoria/ neste workspace.");
    console.log(`Memória: ${info.memoria}`);
    console.log(`Entradas: ${info.total}  ${Object.entries(info.porTipo).map(([tipo, n]) => `${tipo}: ${n}`).join("  ")}`);
    console.log(`Status: ${Object.entries(info.porStatus).map(([nome, n]) => `${nome}: ${n}`).join("  ") || "nenhuma"}`);
    imprimirLista("Pendências vencidas", info.vencidas);
    if (info.aRevisar) console.log(`
${info.aRevisar} entrada(s) com revisão marcada que já chegou: rode revisar.`);
    imprimirLista("Frontmatter inválido", info.invalidas);
    return;
  }

  if (comando === "indexar") {
    const memoriaDir = memoriaOuErro(alvo);
    const { entradas, mudou } = atualizarIndice(memoriaDir, { forcar: true });
    console.log(`INDICE.md ${mudou ? "atualizado" : "já estava em dia"} (${entradas.length} entradas).`);
    return;
  }

  if (comando === "revisar") {
    const achados = revisar(memoriaOuErro(alvo));
    imprimirLista("Pendências vencidas", achados.vencidas);
    imprimirLista("Revisão marcada que já chegou (veja se ainda vale)", achados.aRevisar);
    imprimirLista("Possíveis duplicatas", achados.duplicatas);
    imprimirLista("Links quebrados", achados.linksQuebrados);
    imprimirLista("Substituída sem substituida_por", achados.substituidaSemDestino);
    imprimirLista("Frontmatter inválido", achados.invalidas);
    imprimirLista("Possível dado sensível", achados.sensiveis);
    imprimirLista("Vale fora deste workspace", achados.valeForaDaqui);
    if (!Object.values(achados).some(lista => lista.length)) console.log("Nada a revisar.");
    return;
  }

  if (comando === "stats") {
    const dados = stats(memoriaOuErro(alvo));
    console.log(`Prompts com ponteiros injetados: ${dados.prompts}`);
    imprimirLista("Mais injetadas", dados.injetadas.map(item => `${item.caminho}: ${item.vezes}x (última em ${item.ultima})`));
    imprimirLista("Nunca casaram com nenhum pedido (revise os assuntos ou se ainda valem)", dados.nunca);
    return;
  }

  console.log(AJUDA);
}

try {
  await main(process.argv.slice(2));
} catch (erro) {
  console.error(`Erro: ${erro.message}`);
  process.exitCode = 1;
}
