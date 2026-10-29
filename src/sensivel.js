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

const ehMarcador = valor => /^(<[^>]*>|\$\{?[\w.]+\}?|\*+|x+|\.\.\.|seu[_-]?\w*|sua[_-]?\w*|your[_-]?\w*|changeme|example|exemplo|placeholder)$/i.test(valor);

const REGRAS = [
  { tipo: "CPF", padrao: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g, valido: cpfValido },
  { tipo: "CNPJ", padrao: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{14}\b/g, valido: cnpjValido },
  { tipo: "chave privada", padrao: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g },
  { tipo: "chave de API", padrao: /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|gho_[A-Za-z0-9]{36}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|glpat-[A-Za-z0-9_-]{20,})\b/g },
  { tipo: "token", padrao: /\bBearer\s+([A-Za-z0-9._~+\/-]{20,}=*)/g, grupo: 1 },
  { tipo: "token", padrao: /\b(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|token|secret|client[_-]?secret)\b["']?\s*[:=]\s*["']?([A-Za-z0-9_\-.\/+=]{16,})/gi, grupo: 1 },
  { tipo: "senha em string de conexão", padrao: /\b(?:password|pwd|senha)\s*=\s*([^;'"\s]+)/gi, grupo: 1 },
  { tipo: "senha em URL", padrao: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:\/@]+:([^\s@\/]+)@/gi, grupo: 1 },
];

export function detectarSensivel(texto) {
  const achados = [];
  const linhas = String(texto).split(/\r?\n/);
  linhas.forEach((linha, indice) => {
    for (const regra of REGRAS) {
      for (const casamento of linha.matchAll(regra.padrao)) {
        const valor = regra.grupo ? casamento[regra.grupo] : casamento[0];
        if (!valor || ehMarcador(valor)) continue;
        if (regra.valido && !regra.valido(valor)) continue;
        achados.push({ tipo: regra.tipo, linha: indice + 1 });
      }
    }
  });
  const vistos = new Set();
  return achados.filter(achado => {
    const chave = `${achado.tipo}:${achado.linha}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}
