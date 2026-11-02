import fs from "node:fs";
import path from "node:path";
import { escreverFrontmatter, lerFrontmatter } from "./frontmatter.js";
import { gravarTexto, hoje } from "./estado.js";
import { PASTAS, README, secoesDoReadme, slug } from "./memoria.js";

const TIPO_NOVO = { aprendizado: "project", decisao: "decision", feedback: "feedback", documentacao: "reference", pendencia: "pending", referencia: "reference" };
const PASTA_IGNORADA = /^(memoria|node_modules)$|^\./;
const STATUS_ENCERRADO = ["resolvida", "obsoleta"];
const PREFIXO_ANTIGO = /^(feedback|project|user|usuario|ref|reference|md)[-_]/;
const TITULO_DO_README = pasta => `# ${pasta.charAt(0).toUpperCase()}${pasta.slice(1)} gerais\n`;

function contextosConhecidos(memoriaDir, antigos) {
  const irmaos = fs.readdirSync(path.dirname(memoriaDir), { withFileTypes: true })
    .filter(item => item.isDirectory() && !PASTA_IGNORADA.test(item.name) && fs.existsSync(path.join(path.dirname(memoriaDir), item.name, ".git")))
    .map(item => slug(item.name));
  const escopos = antigos.map(antigo => String(antigo.dados?.escopo ?? "")).filter(escopo => escopo && !/^workspace/i.test(escopo)).map(slug);
  return new Set([...irmaos, ...escopos]);
}

function deduzirContexto({ dados, stem }, conhecidos) {
  const escopo = String(dados.escopo ?? "workspace").trim();
  if (!/^workspace/i.test(escopo)) {
    const contexto = slug(escopo);
    return { contexto, duvida: conhecidos.has(contexto) ? null : `escopo "${escopo}" não bate com nenhum repositório conhecido` };
  }
  const porTamanho = [...conhecidos].sort((a, b) => b.length - a.length);
  const exato = porTamanho.find(contexto => stem === contexto || stem.startsWith(`${contexto}-`));
  if (exato) return { contexto: exato, duvida: null };
  if (stem.endsWith("-projeto")) return { contexto: stem.slice(0, -"-projeto".length), duvida: "registro de projeto sem repositório conhecido com esse nome" };
  const peloAssunto = (Array.isArray(dados.assuntos) ? dados.assuntos : []).map(slug).find(assunto => conhecidos.has(assunto));
  if (peloAssunto) return { contexto: peloAssunto, duvida: "contexto deduzido só pelos assuntos" };
  const primeiro = stem.split("-")[0];
  const mesmoPrimeiro = [...conhecidos].filter(contexto => contexto.split("-")[0] === primeiro);
  if (mesmoPrimeiro.length === 1) return { contexto: mesmoPrimeiro[0], duvida: `contexto deduzido só pelo primeiro termo do nome (${primeiro})` };
  return { contexto: null, duvida: dados.vale_fora_daqui === true ? null : "sem contexto identificado e sem vale_fora_daqui: foi para o README do tipo" };
}

function semHistorico(corpo) {
  const linhas = corpo.split(/\r?\n/);
  const inicio = linhas.findIndex(linha => /^## Histórico\s*$/.test(linha));
  if (inicio < 0) return corpo.trim();
  const fim = linhas.findIndex((linha, i) => i > inicio && /^## /.test(linha));
  return [...linhas.slice(0, inicio), ...(fim < 0 ? [] : linhas.slice(fim))].join("\n").trim();
}

function paraSecao(corpo) {
  let cerca = false;
  return corpo.replace(/^# .*\r?\n+/, "").split("\n").map(linha => {
    if (/^\s*(```|~~~)/.test(linha)) cerca = !cerca;
    return !cerca && /^#{2,5} /.test(linha) ? `#${linha}` : linha;
  }).join("\n");
}

function resolverLink(nome, alvos) {
  if (alvos.has(nome)) return alvos.get(nome);
  const limpo = nome.replace(PREFIXO_ANTIGO, "").replaceAll("_", "-");
  if (alvos.has(limpo)) return alvos.get(limpo);
  const candidatos = [...alvos.keys()].filter(stem => stem.endsWith(`-${limpo}`));
  return candidatos.length === 1 ? alvos.get(candidatos[0]) : null;
}

function ajustarLinks(corpo, alvos) {
  return corpo
    .replace(/\[([^\]]+)\]\((?:[^)\s]*\/)?([\w-]+)\.md(?:#[^)]*)?\)/g, (todo, texto, stem) => alvos.has(stem) ? `${texto} ([[${alvos.get(stem)}]])` : todo)
    .replace(/\[\[([^\]|#]+)\]\]/g, (todo, nome) => {
      const destino = resolverLink(nome.trim(), alvos);
      return destino ? `[[${destino}]]` : todo;
    });
}

const titulosDoReadme = (memoriaDir, pasta) => {
  const arquivo = path.join(memoriaDir, pasta, README);
  return fs.existsSync(arquivo) ? secoesDoReadme(memoriaDir, pasta, fs.readFileSync(arquivo, "utf8")).map(secao => secao.secao) : [];
};

export function planejarMigracao(memoriaDir) {
  const antigos = [];
  for (const pasta of PASTAS) {
    const raiz = path.join(memoriaDir, pasta);
    if (!fs.existsSync(raiz)) continue;
    for (const item of fs.readdirSync(raiz, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!item.isFile() || !item.name.endsWith(".md") || item.name === README) continue;
      const { dados, corpo } = lerFrontmatter(fs.readFileSync(path.join(raiz, item.name), "utf8"));
      antigos.push({ pasta, arquivo: item.name, stem: item.name.slice(0, -3), dados: dados ?? {}, corpo });
    }
  }
  const conhecidos = contextosConhecidos(memoriaDir, antigos);
  const usados = new Set();
  const titulos = new Map(PASTAS.map(pasta => [pasta, new Set(titulosDoReadme(memoriaDir, pasta).map(titulo => titulo.toLowerCase()))]));
  const slugs = new Map(PASTAS.map(pasta => [pasta, new Set([...titulos.get(pasta)].map(slug))]));
  const itens = antigos.map(antigo => {
    const { dados, pasta, stem } = antigo;
    const origem = `${pasta}/${antigo.arquivo}`;
    if (!dados.titulo || !dados.resumo || dados.metadata) return { ...antigo, origem, ignorado: true, duvida: "frontmatter fora do formato antigo: não será convertido" };
    const { contexto, duvida: duvidaContexto } = deduzirContexto(antigo, conhecidos);
    const geral = contexto === null;
    if (geral && STATUS_ENCERRADO.includes(dados.status)) return { ...antigo, origem, ignorado: true, duvida: `status ${dados.status} sem contexto identificado: defina o contexto à mão (não vai para o README geral)` };
    if (!geral) {
      let destino = `${pasta}/${contexto}/${stem}.md`;
      for (let n = 2; usados.has(destino); n++) destino = `${pasta}/${contexto}/${stem}-${n}.md`;
      usados.add(destino);
      if (fs.existsSync(path.join(memoriaDir, destino))) return { ...antigo, origem, contexto, geral, destino, ignorado: true, duvida: "o destino já existe no disco: não será sobrescrito" };
      return { ...antigo, origem, contexto, geral, duvida: duvidaContexto, destino, nomeNovo: path.posix.basename(destino, ".md") };
    }
    let titulo = String(dados.titulo);
    let duvida = duvidaContexto;
    if (titulos.get(pasta).has(titulo.toLowerCase()) || slugs.get(pasta).has(slug(titulo))) {
      titulo = `${titulo} [${stem}]`;
      duvida = duvida ?? "título de seção repetido: desambiguado com o nome do arquivo";
    }
    titulos.get(pasta).add(titulo.toLowerCase());
    slugs.get(pasta).add(slug(titulo));
    return { ...antigo, origem, contexto, geral, duvida, titulo, destino: `${pasta}/${README}`, nomeNovo: slug(titulo) };
  });

  const convertiveis = itens.filter(item => !item.ignorado);
  const alvos = new Map(convertiveis.map(item => [item.stem, item.nomeNovo]));
  for (const item of convertiveis) {
    const { dados } = item;
    const conversao = ["titulo e resumo viram name e description"];
    const corpoLimpo = semHistorico(item.corpo);
    if (corpoLimpo !== item.corpo.trim()) conversao.push("## Histórico removido");
    const corpo = ajustarLinks(corpoLimpo, alvos);
    if (corpo !== corpoLimpo) conversao.push("links relativos e [[links]] reapontados");
    const modified = dados.atualizado ?? dados.criado ?? hoje();
    if (item.geral) {
      const revisao = dados.revisar_em ? `\n\nRevisar em ${dados.revisar_em}.` : "";
      if (revisao) conversao.push("revisar_em vai para o corpo da seção");
      item.secao = { titulo: item.titulo, data: modified, corpo: `${dados.resumo}\n\n${paraSecao(corpo)}${revisao}`.trim() };
      conversao.push("vira seção datada do README do tipo");
    } else {
      const ehPerfil = item.pasta === "feedback" && /(^|-)perfil(-|$)/.test(item.stem);
      const metadata = { type: ehPerfil ? "user" : TIPO_NOVO[dados.tipo] ?? "project", modified };
      if (dados.revisar_em) { metadata.review = dados.revisar_em; conversao.push("revisar_em vira metadata.review"); }
      if (dados.substituida_por) { metadata.superseded_by = path.posix.basename(String(dados.substituida_por), ".md"); conversao.push("substituida_por vira metadata.superseded_by"); }
      if (STATUS_ENCERRADO.includes(dados.status)) { metadata.expires = modified; conversao.push(`status ${dados.status} vira metadata.expires`); }
      item.conteudo = `${escreverFrontmatter({ name: item.nomeNovo, description: dados.resumo, metadata })}\n${corpo}\n`;
    }
    item.conversao = conversao;
  }
  return { itens };
}

export function resumoDoPlano({ itens }) {
  const validos = itens.filter(item => !item.ignorado);
  const porContexto = {};
  for (const item of validos) porContexto[item.contexto ?? "geral"] = (porContexto[item.contexto ?? "geral"] ?? 0) + 1;
  return { total: itens.length, convertidos: validos.length, ignorados: itens.length - validos.length, porContexto, duvidosos: itens.filter(item => item.duvida).length };
}

export function gerarPlanoMd(plano, memoriaDir) {
  const resumo = resumoDoPlano(plano);
  const linhasContexto = Object.entries(resumo.porContexto).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([contexto, n]) => `- ${contexto}: ${n}`);
  const duvidosos = plano.itens.filter(item => item.duvida);
  const geral = resumo.porContexto.geral ?? 0;
  return [
    "# Plano de migração da memória",
    "",
    `Origem: \`${memoriaDir}\`. Este arquivo é só um plano: nada foi movido nem alterado. Para executar, rode \`node memory.js migrar <workspace> --aplicar\`. Itens ignorados não são tocados.`,
    "",
    `Registros lidos: ${resumo.total}. Convertidos: ${resumo.convertidos} (${resumo.convertidos - geral} para pastas de contexto, ${geral} para seções de README geral). Ignorados: ${resumo.ignorados}. Duvidosos: ${resumo.duvidosos}.`,
    "",
    "## Contagem por contexto",
    "",
    ...linhasContexto,
    "",
    "## Duvidosos (conferir antes de aplicar)",
    "",
    ...(duvidosos.length ? duvidosos.map(item => `- \`${item.origem}\` -> \`${item.destino ?? "(fica onde está)"}\`${item.ignorado ? " (ignorado)" : ""}: ${item.duvida}`) : ["Nenhum."]),
    "",
    "## Movimentações",
    "",
    "| Origem | Destino | Conversão do frontmatter |",
    "|---|---|---|",
    ...plano.itens.map(item => `| \`${item.origem}\` | ${item.destino && !item.ignorado ? `\`${item.destino}\`${item.geral ? ` (seção "${item.titulo.replaceAll("|", "\\|")}")` : ""}` : "-"} | ${item.ignorado ? "não convertido" : item.conversao.join("; ")} |`),
    "",
  ].join("\n");
}

export function aplicarMigracao(memoriaDir, plano) {
  const aplicados = [];
  const pulados = [];
  const secoesPorPasta = new Map();
  for (const item of plano.itens.filter(item => !item.ignorado)) {
    if (item.geral) {
      if (!secoesPorPasta.has(item.pasta)) secoesPorPasta.set(item.pasta, []);
      secoesPorPasta.get(item.pasta).push(item);
    } else if (fs.existsSync(path.join(memoriaDir, item.destino))) {
      pulados.push(item.origem);
    } else {
      gravarTexto(path.join(memoriaDir, item.destino), item.conteudo);
      aplicados.push(item.origem);
    }
  }
  for (const [pasta, itens] of secoesPorPasta) {
    const arquivo = path.join(memoriaDir, pasta, README);
    let texto = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, "utf8") : TITULO_DO_README(pasta);
    const existentes = new Set(secoesDoReadme(memoriaDir, pasta, texto).map(secao => secao.secao.toLowerCase()));
    for (const item of itens.sort((a, b) => a.secao.data.localeCompare(b.secao.data))) {
      if (existentes.has(item.secao.titulo.toLowerCase())) {
        pulados.push(item.origem);
        continue;
      }
      existentes.add(item.secao.titulo.toLowerCase());
      texto = `${texto.replace(/\s*$/, "")}\n\n## ${item.secao.titulo} (${item.secao.data})\n\n${item.secao.corpo}\n`;
      aplicados.push(item.origem);
    }
    gravarTexto(arquivo, texto);
  }
  for (const origem of aplicados) fs.rmSync(path.join(memoriaDir, origem));
  return { aplicados, pulados };
}
