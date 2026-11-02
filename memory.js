import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { rodarHook } from "./src/hooks.js";
import { desinstalarMaquina, instalarMaquina, planejarInit } from "./src/instalador.js";
import { acharMemoria } from "./src/memoria.js";
import { atualizarIndice } from "./src/indice.js";
import { lint, stats, status } from "./src/relatorios.js";
import { agruparMapa, ARQUIVO_MAPA, gerarMapa } from "./src/mapa.js";
import { aplicarMigracao, gerarPlanoMd, planejarMigracao, resumoDoPlano } from "./src/migrar.js";
import { gravarTexto } from "./src/estado.js";

const AJUDA = `Uso: node memory.js <comando>

  install                         registra os hooks e instala as skills (uma vez por máquina)
  uninstall                       remove hooks e skills; nunca apaga nenhuma pasta memoria/
  init [workspace]                cria memoria/ no workspace
       --importar                 importa a memória nativa encontrada para este workspace
       --importar-de <pasta>[=<escopo>]   importa de outra pasta de memória (pode repetir)
       --graphify                 liga o mapa do graphify na memória (instala o graphify se faltar; opcional)
       --sim                      aplica sem perguntar
  status [workspace]              instalação, contagem por tipo e contexto, vencidos e inválidos (somente leitura)
  lint [workspace]                duplicata, contradição, link [[...]] quebrado, YAML inválido, segredos (somente leitura)
  indexar [workspace]             refaz o INDICE.md
  mapa [workspace]                gera memoria/graphify-out/graph.json para o graphify
  migrar [workspace]              gera o plano para a estrutura tipo/contexto (não altera a memória)
       --saida <arquivo>          onde gravar o plano (padrão: plano-migracao.md na pasta atual)
       --aplicar                  executa a migração (peça antes de usar)
  stats [workspace]               o que foi injetado e o que nunca casou
  hook <evento>                   entrada dos hooks do Claude Code`;

function lerArgs(argv) {
  const opcoes = { sim: false, importar: false, importarDe: [], aplicar: false, saida: null, graphify: false };
  const posicionais = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--sim") opcoes.sim = true;
    else if (argv[i] === "--importar") opcoes.importar = true;
    else if (argv[i] === "--importar-de") opcoes.importarDe.push(argv[++i]);
    else if (argv[i] === "--aplicar") opcoes.aplicar = true;
    else if (argv[i] === "--graphify") opcoes.graphify = true;
    else if (argv[i] === "--saida") opcoes.saida = argv[++i];
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
    console.log(`Mapa do graphify: ${info.graphify ? "ligado (refeito a cada escrita)" : "desligado (para ligar: node memory.js init --graphify)"}`);
    console.log(`Registros: ${info.total} (ativos: ${info.ativos})  ${Object.entries(info.porPasta).map(([pasta, n]) => `${pasta}: ${n}`).join("  ")}`);
    console.log(`Contextos: ${Object.entries(info.porContexto).sort((a, b) => b[1] - a[1]).map(([contexto, n]) => `${contexto}: ${n}`).join("  ") || "nenhum"}`);
    imprimirLista("Pendências vencidas", info.vencidas);
    imprimirLista("Expirados", info.expiradas);
    imprimirLista("Frontmatter inválido", info.invalidas);
    return;
  }

  if (comando === "indexar") {
    const { entradas, mudou } = atualizarIndice(memoriaOuErro(alvo));
    console.log(`INDICE.md ${mudou ? "atualizado" : "já estava em dia"} (${entradas.length} registros).`);
    return;
  }

  if (comando === "lint") {
    const achados = lint(memoriaOuErro(alvo));
    imprimirLista("Frontmatter inválido", achados.invalidas);
    imprimirLista("Possíveis duplicatas", achados.duplicatas);
    imprimirLista("Nome repetido no mesmo tipo", achados.nomesRepetidos);
    imprimirLista("Possíveis contradições (a mais nova vence; a antiga ganha superseded_by)", achados.contradicoes);
    imprimirLista("Links [[...]] quebrados", achados.linksQuebrados);
    imprimirLista("superseded_by sem registro", achados.substituidaSemDestino);
    imprimirLista("Pendências vencidas", achados.vencidas);
    imprimirLista("Revisão marcada que já chegou (veja se ainda vale)", achados.aRevisar);
    imprimirLista("Expirados (candidatos a limpar)", achados.expiradas);
    imprimirLista("Possível dado sensível", achados.sensiveis);
    if (!Object.values(achados).some(lista => lista.length)) console.log("Nada a revisar.");
    return;
  }

  if (comando === "mapa") {
    const memoriaDir = memoriaOuErro(alvo);
    const grafo = gerarMapa(memoriaDir);
    console.log(`${path.join(memoriaDir, ARQUIVO_MAPA)} gerado (${grafo.nodes.length} nós, ${grafo.links.length} arestas).`);
    console.log(agruparMapa(memoriaDir) ? "graphify cluster-only rodou: GRAPH_REPORT.md e graph.html atualizados." : "graphify não encontrado: só o graph.json foi gerado. Para instalar: node memory.js init --graphify");
    return;
  }

  if (comando === "migrar") {
    const memoriaDir = memoriaOuErro(alvo);
    const plano = planejarMigracao(memoriaDir);
    const resumo = resumoDoPlano(plano);
    if (opcoes.aplicar) {
      const { aplicados, pulados } = aplicarMigracao(memoriaDir, plano);
      atualizarIndice(memoriaDir);
      gravarTexto(path.join(memoriaDir, "COMO-USAR.md"), fs.readFileSync(new URL("./templates/COMO-USAR.md", import.meta.url), "utf8"));
      console.log("COMO-USAR.md trocado pelo protocolo novo. Rode node memory.js install para atualizar as skills.");
      console.log(`Migração aplicada: ${aplicados.length} registro(s) convertido(s), ${resumo.ignorados + pulados.length} deixado(s) onde estavam.`);
      imprimirLista("Não gravados (origem preservada)", pulados);
      return;
    }
    const arquivo = path.resolve(opcoes.saida ?? "plano-migracao.md");
    gravarTexto(arquivo, gerarPlanoMd(plano, memoriaDir));
    console.log(`Plano gravado em ${arquivo}. Nada foi alterado na memória.`);
    console.log(`Convertidos: ${resumo.convertidos}  ignorados: ${resumo.ignorados}  duvidosos: ${resumo.duvidosos}`);
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
