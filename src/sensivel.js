const somenteDigitos = texto => texto.replace(/\D/g, "");

function cpfValido(texto) {
  const d = somenteDigitos(texto);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const digito = tamanho => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

function cnpjValido(texto) {
  const d = somenteDigitos(texto);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const digito = tamanho => {
    const pesos = tamanho === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((total, peso, i) => total + Number(d[i]) * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(12) === Number(d[12]) && digito(13) === Number(d[13]);
}

const INVISIVEIS = /[\u00ad\u034f\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\u3164\ufe00-\ufe0f\ufeff\uffa0]|[\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/gu;
export const semInvisiveis = texto => String(texto).replace(INVISIVEIS, "");

const ehMarcador = valor => /^(<[^>]*>|\$\{?[\w.]+\}?|\*+|x+|\.\.\.|seu[_-]?\w*|sua[_-]?\w*|your[_-]?\w*|changeme|example|exemplo|placeholder)$/i.test(valor);

const valorComPinta = valor => /[\d@!#$%^&*+\/=]/.test(valor) || valor.length >= 12;

const QUEBRA =String.raw`(?:\r?\n|\\n)`;
const CABECALHO_CHAVE_PRIVADA = String.raw`-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----`;
const CORPO_CHAVE = String.raw`(?:[ \t]*(?:[A-Za-z][A-Za-z-]*: [^\n\\]*)?${QUEBRA})*[ \t]*[A-Za-z0-9+/=]{16,}`;

const REGRAS = [
  { tipo: "chave privada", padrao: new RegExp(`${CABECALHO_CHAVE_PRIVADA}${QUEBRA}${CORPO_CHAVE}`, "g") },
  { tipo: "CPF", padrao: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g, valido: cpfValido },
  { tipo: "CNPJ", padrao: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{14}\b/g, valido: cnpjValido },
  { tipo: "chave de API", padrao: /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|(?:sk|rk)_live_[A-Za-z0-9]{16,}|(?:AKIA|ASIA)[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|xapp-[A-Za-z0-9-]{10,}|EAA[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{20,})\b/g },
  { tipo: "token", padrao: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g },
  { tipo: "token", padrao: /\b\d{8,10}:[A-Za-z0-9_-]{35,}\b/g },
  { tipo: "token", padrao: /\bBearer\s+([A-Za-z0-9._~+\/-]{20,}=*)/g, grupo: 1 },
  { tipo: "token", padrao: /\b(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|token|secret|client[_-]?secret|password|passwd|senha|chave)\b["']?\s*[:=]\s*["']?([A-Za-z0-9_\-.\/+=@!#$%^&*]{6,})/gi, grupo: 1, valido: valorComPinta },
  { tipo: "token", padrao: /\b[A-Z][A-Z0-9_]*_(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|CREDENTIALS?)\s*[=:]\s*(\S+)/g, grupo: 1 },
  { tipo: "senha em string de conexão", padrao: /\b(?:password|pwd|senha)\s*=\s*([^;'"\s]+)/gi, grupo: 1 },
  { tipo: "senha em URL", padrao: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:\/@]+:([^\s@\/]+)@/gi, grupo: 1 },
];

function acharTrechos(textoLimpo) {
  const trechos = [];
  for (const regra of REGRAS) {
    for (const casamento of textoLimpo.matchAll(regra.padrao)) {
      const valor = regra.grupo ? casamento[regra.grupo] : casamento[0];
      if (!valor || ehMarcador(valor)) continue;
      if (regra.valido && !regra.valido(valor)) continue;
      const inicio = regra.grupo ? casamento.index + casamento[0].lastIndexOf(valor) : casamento.index;
      trechos.push({ tipo: regra.tipo, inicio, fim: inicio + valor.length });
    }
  }
  return trechos;
}

export function detectarSensivel(texto) {
  const limpo = semInvisiveis(texto);
  const vistos = new Set();
  return acharTrechos(limpo)
    .map(({ tipo, inicio }) => ({ tipo, linha: limpo.slice(0, inicio).split("\n").length }))
    .filter(achado => {
      const chave = `${achado.tipo}:${achado.linha}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
}

export function redigir(texto) {
  let limpo = semInvisiveis(texto);
  const trechos = acharTrechos(limpo).sort((a, b) => b.inicio - a.inicio);
  let limite = Infinity;
  for (const { tipo, inicio, fim } of trechos) {
    if (fim > limite) continue;
    limpo = `${limpo.slice(0, inicio)}[REDACTED:${tipo}]${limpo.slice(fim)}`;
    limite = inicio;
  }
  return limpo;
}
