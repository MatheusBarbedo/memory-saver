# Memória deste workspace

Este workspace guarda a memória em `memoria/`, em markdown. Tudo que seria memória vai para cá: **não use a memória automática nativa do Claude Code neste workspace**.

## Ler

- No começo da sessão você recebe um resumo: quantas entradas, os assuntos e as pendências vencidas.
- Quando um pedido cita um assunto registrado, você recebe ponteiros (`caminho - resumo`). Leia os que forem relevantes antes de agir.
- O mapa completo está em `memoria/INDICE.md`. Ele é gerado: nunca edite à mão.

## Quando salvar

| Situação | Tipo | Pasta |
|---|---|---|
| A pessoa corrigiu ou confirmou um jeito de trabalhar | `feedback` | `feedback/` |
| Uma decisão foi tomada, com o porquê | `decisao` | `decisoes/` |
| Algo custou investigar e vai voltar | `aprendizado` | `aprendizados/` |
| Algo ficou para depois | `pendencia` (com `revisar_em`) | `pendencias/` |
| Onde fica um recurso (link, painel, documento, pasta) | `referencia` | `referencias/` |
| Explicação longa que vale guardar | `documentacao` | `documentacao/` |

## Quando não salvar

- O que já está no código, no README ou no histórico do git.
- Detalhe que só importa à conversa atual.
- Dado sensível: senha, token, chave, CPF, CNPJ, dado pessoal. Registre só onde o dado fica, nunca o dado.

## Como salvar

1. Antes de criar, procure entrada com assunto parecido (no `INDICE.md` ou com busca em `memoria/`). Se existir, atualize em vez de duplicar.
2. Um arquivo por entrada, com nome curto em minúsculas e hífens, na pasta do tipo. Exemplo: `memoria/decisoes/banco-de-testes-em-memoria.md`.
3. Frontmatter:

```yaml
---
titulo: <título curto>
resumo: <uma linha, aparece no índice e nos ponteiros>
tipo: aprendizado | decisao | feedback | documentacao | pendencia | referencia
assuntos: [<palavras e IDs pelos quais o assunto vai ser citado>]
escopo: workspace | <pasta ou repo dentro do workspace>
status: vigente | substituida | resolvida | obsoleta
criado: AAAA-MM-DD
atualizado: AAAA-MM-DD
revisar_em: AAAA-MM-DD
substituida_por: <caminho da entrada nova>
vale_fora_daqui: true | false
---
```

- Obrigatórios: `titulo`, `resumo`, `tipo`, `assuntos`, `status`, `criado`.
- `revisar_em` é obrigatório em pendência. `substituida_por` é obrigatório quando o status é `substituida`.
- `assuntos` é o que faz a memória aparecer na hora certa: use as palavras que a pessoa vai usar ao voltar no assunto, inclusive IDs como `ABC-123`. Assunto de mais de uma palavra casa quando aparece inteiro no pedido.
- `vale_fora_daqui: true` quando a entrada parece valer em outros workspaces (uma preferência geral da pessoa, por exemplo).
- Caminhos sempre relativos ao workspace. Nada específico desta máquina.

4. Corpo: o fato, direto.
   - Em `decisao` e `feedback`, inclua as linhas **Por quê:** e **Como aplicar:**.
   - Em `decisao`, inclua também as alternativas descartadas.

5. Ao alterar uma entrada existente, atualize `atualizado` e acrescente uma linha em `## Histórico` no fim do arquivo, com a data e o que mudou. É o desfazer de quem não tem git.

6. Avise a pessoa em uma linha o que salvou ou alterou, e onde.

## Nunca apagar

- Decisão revertida: `status: substituida` e `substituida_por` apontando para a nova.
- Aprendizado que deixou de valer: `status: obsoleta`.
- Pendência feita: `status: resolvida`.

Se o retorno de uma escrita avisar de possível dado sensível, remova o dado na hora.
