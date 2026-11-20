import fs from "node:fs";
import path from "node:path";
import { pastaCodex } from "./estado.js";

export const LIMITE_AVISO = 400_000;
export const LIMITE_INSISTE = 700_000;
const CAUDAS = [512 * 1024, 4 * 1024 * 1024];

function lerCauda(arquivo, bytes) {
  const descritor = fs.openSync(arquivo, "r");
  try {
    const tamanho = fs.fstatSync(descritor).size;
    const inicio = Math.max(0, tamanho - bytes);
    const buffer = Buffer.alloc(tamanho - inicio);
    fs.readSync(descritor, buffer, 0, buffer.length, inicio);
    const linhas = buffer.toString("utf8").split(/\r?\n/);
    return { linhas: inicio > 0 ? linhas.slice(1) : linhas, inteiro: inicio === 0 };
  } finally {
    fs.closeSync(descritor);
  }
}

function usoDaLinha(linha) {
  if (!linha.includes('"usage"') && !linha.includes('"token_count"')) return null;
  let item;
  try { item = JSON.parse(linha); } catch { return null; }
  if (item?.type === "assistant" && !item.isSidechain && item.message?.usage) {
    const uso = item.message.usage;
    const total = (uso.input_tokens ?? 0) + (uso.cache_read_input_tokens ?? 0) + (uso.cache_creation_input_tokens ?? 0);
    return total > 0 ? total : null;
  }
  if (item?.type === "event_msg" && item.payload?.type === "token_count") {
    const total = item.payload.info?.last_token_usage?.input_tokens;
    return Number.isFinite(total) && total > 0 ? total : null;
  }
  return null;
}

export function contextoDoArquivo(arquivo) {
  for (const bytes of CAUDAS) {
    const { linhas, inteiro } = lerCauda(arquivo, bytes);
    for (let i = linhas.length - 1; i >= 0; i--) {
      const uso = usoDaLinha(linhas[i]);
      if (uso !== null) return uso;
    }
    if (inteiro) return null;
  }
  return null;
}

const pastasDecrescentes = pasta => {
  try { return fs.readdirSync(pasta, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name).sort().reverse(); } catch { return []; }
};

export function acharRolloutCodex(sessionId, home = pastaCodex()) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId ?? "")) return null;
  const base = path.join(home, "sessions");
  const final = `-${sessionId.toLowerCase()}.jsonl`;
  for (const ano of pastasDecrescentes(base)) {
    for (const mes of pastasDecrescentes(path.join(base, ano))) {
      for (const dia of pastasDecrescentes(path.join(base, ano, mes))) {
        const pasta = path.join(base, ano, mes, dia);
        let nomes = [];
        try { nomes = fs.readdirSync(pasta); } catch { continue; }
        const achado = nomes.find(nome => nome.startsWith("rollout-") && nome.toLowerCase().endsWith(final));
        if (achado) return path.join(pasta, achado);
      }
    }
  }
  return null;
}

export function contextoDaSessao(entrada) {
  const indicado = typeof entrada.transcript_path === "string" && entrada.transcript_path && fs.existsSync(entrada.transcript_path) ? entrada.transcript_path : null;
  const ler = arquivo => { try { return arquivo ? contextoDoArquivo(arquivo) : null; } catch { return null; } };
  return ler(indicado) ?? ler(acharRolloutCodex(entrada.session_id));
}

export function avisoDeContexto(entrada) {
  const tokens = contextoDaSessao(entrada);
  if (tokens === null || tokens < LIMITE_AVISO) return null;
  const base = `memory-saver: Contexto em ~${Math.round(tokens / 1000)}k. Na próxima pausa natural, feche o passo, atualize o HANDOFF e o estado e proponha a troca com o bloco de retomada; se o dono já decidiu manter, só registre.`;
  return tokens >= LIMITE_INSISTE ? `${base} Passou de ${LIMITE_INSISTE / 1000}k: termine só o passo em andamento.` : base;
}
