---
name: memory-saver
description: Memória local do workspace em markdown (pasta memoria/). Use quando o usuário pedir "instale o memory-saver neste workspace", "lembra disso", "guarda isso na memória", "revisa a memória", "status da memória", ou quando houver feedback, decisão, aprendizado, pendência ou referência que valha registrar num workspace que tem memoria/COMO-USAR.md. NÃO use para dependência de projeto nem para a memória automática nativa.
---

# memory-saver

A CLI fica em `{{MEMORY_JS}}`. Os comandos são `node "{{MEMORY_JS}}" <comando> [workspace]`.

## "Instale o memory-saver neste workspace"

1. Workspace padrão: a pasta atual. Confirme com o usuário.
2. Rode `init <workspace>` sem `--sim`: ele só mostra o que vai criar e se achou memória nativa para importar.
3. Mostre o plano. Com o OK, rode de novo com `--sim`. Se o usuário quiser importar a memória nativa encontrada, acrescente `--importar`. Para trazer de outra pasta de memória: `--importar-de "<pasta>"` ou `--importar-de "<pasta>=<escopo>"`.
4. Resuma o que foi criado e lembre que a memória passa a aparecer a partir da próxima sessão.

## "Lembra disso" ou /lembrar

Salve na hora seguindo `memoria/COMO-USAR.md`: procure entrada parecida antes de criar, use o frontmatter completo e avise em uma linha o que salvou e onde. Sem `memoria/` no workspace, ofereça instalar.

## "Revisa a memória"

Rode `revisar <workspace>`, mostre os achados agrupados e proponha as correções (status, `substituida_por`, `revisar_em`, frontmatter, duplicatas para juntar, dado sensível para tirar). Só altere com o OK do usuário, registrando em `## Histórico`.

## Outros

- `status <workspace>`: contagem por tipo e pendências vencidas.
- `stats <workspace>`: o que foi injetado e o que nunca casou com nenhum pedido.
- `indexar <workspace>`: refaz o `INDICE.md`.
