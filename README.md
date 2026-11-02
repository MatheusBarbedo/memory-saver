# memory-saver

Memória local e organizada para o Claude Code, em markdown, dentro do próprio workspace.

O Claude registra aprendizados, decisões, feedbacks, documentação, pendências e referências em arquivos `.md`, organizados por tipo e, dentro dele, por contexto (projeto ou área). Um índice central é gerado sozinho. E, em vez de esperar o Claude lembrar de consultar, hooks entregam a memória na hora: um resumo em camadas no começo da sessão e ponteiros para os registros certos quando um assunto aparece no pedido.

- Node.js puro, zero dependências, sem `npm install`.
- Windows, Linux e macOS.
- Só markdown, caminhos relativos, nada específico da máquina: a pasta nasce pronta para ser versionada, se você quiser.

## Instalar

Uma vez por máquina, depois de clonar ou copiar este repositório:

```
node memory.js install
```

Isso registra os hooks no `~/.claude/settings.json` (sem mexer nos hooks de outras ferramentas) e instala as skills `memory-saver` e `lembrar`. Abra uma sessão nova do Claude Code.

Depois, em cada workspace onde quiser memória, peça ao Claude:

> instale o memory-saver neste workspace

Ele mostra o que vai criar e pede confirmação. Pelo terminal, o equivalente é `node memory.js init <workspace>` (mostra o plano) e `node memory.js init <workspace> --sim` (aplica).

## Como a memória se organiza

Tipo em cima, contexto dentro:

```
<workspace>/
├─ CLAUDE.md                 ganha uma linha: @memoria/COMO-USAR.md
└─ memoria/
   ├─ INDICE.md              gerado, agrupado por tipo e contexto; nunca editado à mão
   ├─ COMO-USAR.md           protocolo de leitura e escrita para o Claude
   ├─ aprendizados/
   │  ├─ README.md           o que vale em qualquer projeto, uma seção datada por item
   │  └─ meu-app/
   │     └─ meu-app-projeto.md
   ├─ decisoes/  feedback/  documentacao/  pendencias/  referencias/   mesma lógica
   └─ graphify-out/graph.json   gerado pelo comando mapa
```

- Contexto é o nome do repositório ou da área. O que vale em qualquer projeto não ganha pasta: vira uma seção `## <título> (AAAA-MM-DD)` no `README.md` do tipo.
- Nada fica solto na raiz do tipo além do `README.md`.

Cada registro é um arquivo com frontmatter (o mesmo formato de memória do claude-arsenal):

```markdown
---
name: banco-de-testes-em-memoria
description: "Testes de integração usam SQLite em memória, não o banco de desenvolvimento"
metadata:
  type: decision
  modified: 2026-03-02
---

Testes de integração sobem um SQLite em memória por teste.

**Why:** o banco de desenvolvimento ficava sujo e os testes quebravam em sequência.

**How to apply:** fixture `banco_limpo` em todo teste que grava. Ver [[perfil-dev]].
```

- `metadata.type`: `user`, `feedback`, `project`, `reference`, `decision` ou `pending`.
- Opcionais em `metadata`: `pinned: true` (sempre no resumo, no máximo 10), `expires: AAAA-MM-DD` (depois disso sai dos ponteiros e do resumo e é listado para limpar), `superseded_by: <name>` (substituído, nunca apagado) e `review: AAAA-MM-DD` (obrigatório em pendência).
- Valor com dois pontos exige aspas; bloco de frontmatter duplicado e chave repetida são erros.
- Links entre registros com `[[name]]`.

## Como a memória chega ao Claude

Todo hook responde JSON válido, termina com exit 0, nunca bloqueia e falha em silêncio.

| Momento | O que acontece |
|---|---|
| Início da sessão (inclusive depois de compactar) | Resumo em camadas com orçamento de 4000 caracteres (`MEMORY_SAVER_ORCAMENTO`, piso 1500, teto 20000): fixados primeiro, depois o contexto do repositório aberto; cada registro ganha ao menos a descrição, o que sobra aprofunda com um trecho; o que não coube aparece como omitido, por caminho |
| Cada pedido | Até 5 ponteiros `caminho - descrição`, casando nome, descrição, texto, pasta de contexto e caminho, com fator de autoridade entre 0.55 e 1.50 (decisão e feedback pesam mais, checkpoint menos). O contexto do repositório aberto, achado subindo até a raiz do git, tem prioridade. Sem casamento claro, nada |
| Escrita em `memoria/` | O índice é refeito e o arquivo é verificado: segredo ou frontmatter inválido geram um aviso para o Claude corrigir, sem bloquear |

Tudo o que é injetado vai dentro de uma cerca `memoria-historico-nao-confiavel`, com o aviso de que memória é dado, não instrução, e passa por redação de segredos antes de sair.

O verificador de segredos cobre CPF e CNPJ válidos, chave privada (PEM, PGP, OpenSSH, com ou sem END), tokens de GitHub, OpenAI, Stripe, AWS, Google, Slack, Facebook e Telegram, JWT, `Bearer`, atribuições `api_key`, `token`, `secret`, `password`, constantes `*_KEY|TOKEN|SECRET|PASSWORD`, senha em string de conexão e em URL. Ignora caracteres invisíveis usados para esconder o segredo e aceita falso positivo.

Fora de um workspace com `memoria/`, os hooks respondem `{}`. A memória automática nativa do Claude Code fica desligada no workspace (`autoMemoryEnabled: false` no `.claude/settings.local.json`), para tudo ir para um lugar só.

## Comandos

| Comando | O que faz |
|---|---|
| `install` / `uninstall` | Registra ou remove hooks e skills. `uninstall` nunca apaga nenhuma pasta `memoria/` |
| `init [workspace]` | Cria `memoria/` com os tipos e seus `README.md`, liga o protocolo no `CLAUDE.md` e desliga a memória nativa no workspace. Idempotente |
| `init ... --importar` / `--importar-de <pasta>[=<escopo>]` | Importa a memória nativa do Claude Code (ou de outra pasta) para tipo/contexto. O original fica onde está |
| `init ... --graphify` | Opcional: liga o mapa do graphify (`graphifyy` no PyPI) na memória. Instala o CLI se faltar (`uv tool install graphifyy`), gera o mapa e, daí em diante, o hook de escrita refaz o mapa em segundo plano. Sem LLM (`GRAPHIFY_BACKEND=none`) |
| `status [workspace]` | Somente leitura: instalação, contagem por tipo e contexto, pendências vencidas, expirados e inválidos |
| `lint [workspace]` | Somente leitura: duplicata por Jaccard >= 0.5, contradição por inversão de negação, link `[[...]]` quebrado, YAML inválido, `superseded_by` sem registro, pendências vencidas, expirados e dado sensível |
| `indexar [workspace]` | Refaz o `INDICE.md` |
| `mapa [workspace]` | Gera `memoria/graphify-out/graph.json` (registros, contextos, tipos e seções dos README gerais; arestas `[[links]]`, registro para contexto e tipo, `superseded_by`) e, com o graphify instalado, roda o `cluster-only` (relatório e `graph.html`) para o `query`, `path` e `explain` |
| `migrar [workspace]` | Lê a estrutura antiga (arquivos soltos por tipo, frontmatter com `titulo`, `resumo`, `assuntos`...) e grava só um plano em markdown (`--saida <arquivo>`, padrão `plano-migracao.md`): origem, destino tipo/contexto, conversão do frontmatter e os casos duvidosos. `--aplicar` executa |
| `stats [workspace]` | O que foi injetado, quantas vezes, e o que nunca casou com nenhum pedido |

Na conversa: "lembra disso" ou `/lembrar` salva na hora; "revisa a memória" roda o `lint` e propõe as correções.

## Migrar da estrutura antiga

`node memory.js migrar <workspace>` não muda nada na memória. O contexto vem do campo `escopo`; no escopo `workspace` ele é deduzido pelo nome do arquivo (prefixo de um repositório vizinho, sufixo `-projeto`), pelos assuntos e pelo primeiro termo do nome. O que é regra geral (`vale_fora_daqui`) vira seção datada do `README.md` do tipo. Os casos incertos aparecem na seção "Duvidosos" do plano. Status `resolvida` e `obsoleta` viram `expires`, `substituida_por` vira `superseded_by`, `revisar_em` vira `review`, o `## Histórico` sai e os links relativos viram `[[name]]`. O `--aplicar` também troca o `COMO-USAR.md` da memória pelo protocolo novo; rode `install` de novo para atualizar as skills.

## Git

O `init` não deixa nada aparecer como mudança no repositório do workspace: `memoria/` e o que mais ele criar entram no `.git/info/exclude` (nunca no `.gitignore`), e, se o `CLAUDE.md` da raiz for versionado, a linha vai para o `CLAUDE.local.md`.

Para versionar a memória depois, tire a linha `/memoria/` do bloco `# memory-saver` em `.git/info/exclude` e faça o commit normalmente. Deixe `memoria/graphify-out/` fora do git: é gerado.

## Estado da ferramenta

Estatísticas ficam em `~/.memory-saver/` (ou na pasta de `MEMORY_SAVER_HOME`), nunca no workspace. Toda escrita do memory-saver é atômica (arquivo temporário e rename). `MEMORY_SAVER_TETO` limita até onde a busca de `memoria/` sobe (usado nos testes).

## Testes

```
node --test "test/*.test.js"
```

Os testes usam pastas temporárias e nunca tocam o `~/.claude` nem um workspace real. Inclui o verificador de segredos com vetores e falsos positivos no estilo do ai-memory, o teste canário e um eval pequeno de ponteiros com hard negatives, que separa a perda por filtro da perda por ranking.

## Combina com

[context-saver](https://github.com/MatheusBarbedo/context-saver): economiza token na saída de comandos que o Claude Code roda.
