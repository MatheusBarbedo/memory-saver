# memory-saver

Memória local e organizada para o Claude Code, em markdown, dentro do próprio workspace.

O Claude registra aprendizados, decisões, feedbacks, documentação, pendências e referências em arquivos `.md` separados por tipo. Um índice central é gerado sozinho. E, em vez de esperar o Claude lembrar de consultar, hooks entregam a memória na hora: um resumo no começo da sessão e ponteiros para as entradas certas quando um assunto aparece no pedido.

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

```
<workspace>/
├─ CLAUDE.md             ganha uma linha: @memoria/COMO-USAR.md
└─ memoria/
   ├─ INDICE.md          gerado, nunca editado à mão
   ├─ COMO-USAR.md       protocolo de leitura e escrita para o Claude
   ├─ aprendizados/
   ├─ decisoes/
   ├─ feedback/
   ├─ documentacao/
   ├─ pendencias/
   └─ referencias/
```

Cada entrada é um arquivo com frontmatter:

```yaml
---
titulo: Banco de testes em memória
resumo: Testes de integração usam SQLite em memória, não o banco de desenvolvimento
tipo: decisao
assuntos: [testes, banco de dados, PROJ-142]
escopo: workspace
status: vigente
criado: 2026-03-02
atualizado: 2026-03-02
---

Testes de integração sobem um SQLite em memória por teste.

**Por quê:** o banco de desenvolvimento ficava sujo e os testes quebravam em sequência.
**Como aplicar:** fixture `banco_limpo` em todo teste que grava.
Alternativas descartadas: container por suíte (lento), transação com rollback (não cobre DDL).
```

- `assuntos` é o que traz a entrada de volta: palavras e IDs (como `PROJ-142`) que você vai usar ao voltar no assunto.
- Nada é apagado. Decisão revertida vira `substituida` com `substituida_por`; aprendizado que deixou de valer vira `obsoleta`; pendência feita vira `resolvida`. Toda alteração ganha uma linha em `## Histórico`.
- `vale_fora_daqui: true` marca o que parece valer em outros workspaces; o índice junta essas entradas numa seção própria.

O `INDICE.md` traz as pendências vencidas no topo, as entradas agrupadas por assunto e o que vale fora deste workspace.

## Como a memória chega ao Claude

| Momento | O que acontece |
|---|---|
| Início da sessão (inclusive depois de compactar) | Resumo curto: quantas entradas, assuntos, pendências vencidas e onde fica o índice |
| Cada pedido | Se o pedido cita um assunto ou um ID registrado, até 5 ponteiros `caminho - resumo`. Sem casamento, nada |
| Escrita em `memoria/` | O índice é refeito e o arquivo é verificado: CPF, CNPJ, token, chave de API, senha em string de conexão ou chave privada geram um aviso para o Claude remover |

Fora de um workspace com `memoria/`, os hooks ficam em silêncio. A memória automática nativa do Claude Code fica desligada no workspace (`autoMemoryEnabled: false` no `.claude/settings.local.json`), para tudo ir para um lugar só.

## Comandos

| Comando | O que faz |
|---|---|
| `install` / `uninstall` | Registra ou remove hooks e skills. `uninstall` nunca apaga nenhuma pasta `memoria/` |
| `init [workspace]` | Cria `memoria/`, liga o protocolo no `CLAUDE.md` e desliga a memória nativa no workspace. Idempotente: só completa o que falta |
| `init ... --importar` | Importa a memória nativa do Claude Code deste workspace (o original fica onde está) |
| `init ... --importar-de <pasta>[=<escopo>]` | Importa de outra pasta de memória, marcando o escopo. Pode repetir |
| `status [workspace]` | Instalação, contagem por tipo e pendências vencidas |
| `indexar [workspace]` | Refaz o `INDICE.md` |
| `revisar [workspace]` | Pendências vencidas, possíveis duplicatas, links quebrados, frontmatter inválido, possível dado sensível e o que vale fora daqui |
| `stats [workspace]` | O que foi injetado, quantas vezes, e o que nunca casou com nenhum pedido |

Na conversa: "lembra disso" ou `/lembrar` salva na hora; "revisa a memória" roda o `revisar` e propõe as correções.

## Git

O `init` não deixa nada aparecer como mudança no repositório do workspace: `memoria/` e o que mais ele criar entram no `.git/info/exclude` (nunca no `.gitignore`), e, se o `CLAUDE.md` da raiz for versionado, a linha vai para o `CLAUDE.local.md`.

Para versionar a memória depois, tire a linha `/memoria/` do bloco `# memory-saver` em `.git/info/exclude` e faça o commit normalmente. Como tudo é markdown com caminhos relativos e sem dado sensível, a pasta pode ir para o repositório do projeto ou para um repositório só dela.

## Estado da ferramenta

Cache do índice e estatísticas ficam em `~/.memory-saver/` (ou na pasta de `MEMORY_SAVER_HOME`), nunca no workspace.

## Testes

```
node --test "test/*.test.js"
```

## Combina com

[context-saver](https://github.com/MatheusBarbedo/context-saver): economiza token na saída de comandos que o Claude Code roda.
