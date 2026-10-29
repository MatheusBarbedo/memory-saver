export const LIMITE_PONTEIROS = 5;

export const normalizar = texto => ` ${String(texto).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;

const ID = /\b[a-z][a-z0-9]{1,9}-\d+\b/gi;
export const extrairIds = texto => [...new Set((String(texto).match(ID) ?? []).map(id => id.toUpperCase()))];

export function casar(prompt, entradas, limite = LIMITE_PONTEIROS) {
  const textoPrompt = normalizar(prompt);
  if (textoPrompt.trim() === "") return [];
  const ids = extrairIds(prompt).map(normalizar);
  const pontuadas = [];
  for (const entrada of entradas) {
    if (entrada.status !== "vigente" || entrada.erros?.length) continue;
    let pontos = 0;
    for (const assunto of entrada.assuntos) {
      const termo = normalizar(assunto);
      if (termo.trim() && textoPrompt.includes(termo)) pontos += termo.trim().split(" ").length;
    }
    if (ids.length) {
      const onde = normalizar(`${entrada.titulo} ${entrada.assuntos.join(" ")} ${entrada.caminho}`);
      for (const id of ids) if (onde.includes(id)) pontos += 10;
    }
    if (pontos > 0) pontuadas.push({ entrada, pontos });
  }
  return pontuadas
    .sort((a, b) => b.pontos - a.pontos || String(b.entrada.atualizado ?? "").localeCompare(String(a.entrada.atualizado ?? "")) || a.entrada.caminho.localeCompare(b.entrada.caminho))
    .slice(0, limite)
    .map(({ entrada }) => entrada);
}
