# mazzi-instagram

Conteúdo e publicação automática do Instagram **@mazzisystems** (Mazzi Systems). Repositório público: aqui só entram peças de marketing feitas no modo demonstração, nunca dado de paciente ou cliente, nunca chave ou segredo.

## Como funciona

```
Seg 06:53         rotina do Claude (nuvem) produz a semana SEGUINTE → semanas/AAAA-MM-DD/ + agenda.json
Todo dia 07:30    GitHub Actions "Publicar no Instagram" → API oficial da Meta → @mazzisystems
                  → grava semanas/AAAA-MM-DD/publicado.json e uma linha em guia/log.md
```

| Caminho | O que é |
|---|---|
| `guia/marca.md` | guia da marca: o que pode e o que NUNCA pode, tom, visual, rodízio de temas |
| `guia/voz.md` | voice.md das skills do Instagram Agent |
| `guia/producao.md` | passo a passo da produção da semana |
| `guia/log.md` | histórico do que foi publicado |
| `guia/rotina-prompt.md` | prompt da rotina do Claude |
| `semanas/AAAA-MM-DD/` | mídias, `agenda.json` (do Claude) e `publicado.json` (só do Action) |
| `publicar/` | `validar.mjs`, `publicar.mjs` e testes (`node --test publicar/publicar.test.mjs`) |

## Na mão

- Conferir uma semana: `node publicar/validar.mjs semanas/AAAA-MM-DD`
- Publicar uma peça: Actions › Publicar no Instagram › Run workflow, com `peca` = `AAAA-MM-DD/ID` (comece com "simular" marcado).
- Falha: issue "Instagram: falha ao publicar" (o GitHub manda e-mail).

Segredos do Actions: `META_TOKEN`, `IG_USER_ID`.
