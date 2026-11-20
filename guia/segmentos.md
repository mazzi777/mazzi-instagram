# Ramos (segmentos) que o agente pode divulgar

O agente só fala de um ramo do Mazzi quando **três** coisas valem ao mesmo tempo:

1. o ramo existe no código do aj-clinic (`VERTICALS`);
2. a **política de segmentos** (`agente/base/segmentos.mjs`) libera o ramo (`divulgar: true`);
3. a base do produto tem funções `no_ar` daquele ramo.

Existir no código, ter migration, documentação ou seção no `docs/NOVIDADES.md` **não libera nada**. O estado técnico (integrado, publicado no app) não é autorização para divulgar.

## Hoje

| Vertical no código | Ramo do agente | Divulga? |
|---|---|---|
| `clinic` | `clinica` | sim |
| `restaurant` | `restaurante` | sim |
| `spa` | — | **não**: bloqueado até a liberação explícita |
| qualquer outra | — | não (ramo desconhecido = bloqueado) |

## Como a lista de ramos é lida

- O workflow semanal clona o aj-clinic (branch padrão, só leitura) e o agente procura a lista nesta ordem:
  1. `packages/shared/src/verticals.ts` (versão atual);
  2. `packages/shared/src/permissions.ts` (versões anteriores).
- O leitor (`lerVerticals`) **não executa** o arquivo:
  - procura a declaração `VERTICALS = [ ... ]` e ignora comentários e o que estiver escrito dentro de strings;
  - aceita `export`, anotação de tipo, `as const`, quebras de linha, aspas simples ou duplas e vírgula no fim;
  - só aceita textos literais na lista.
- A lista precisa ser plausível: não vazia, ids simples (`a-z`, números e `_`) e sem repetição.
- **Se não der para ler** (arquivo sumiu, estrutura mudou, re-export, lista vazia ou malformada):
  - o agente **mantém os ramos que já usava**, sempre filtrados pela política;
  - **segura as novidades** (nenhuma seção nova é lida nem marcada como lida), porque um ramo novo poderia estar no changelog;
  - registra o problema como **erro da rodada** (`agente/erros.md`, que vira issue), sem copiar o conteúdo do arquivo;
  - segue a semana.
- Se a lista só deu para ler da fonte antiga (a nova quebrou), também vira alerta.

  Falha de leitura nunca libera ramo.
- **Se o passo inteiro da base falhar** (o Claude fora do ar, por exemplo):
  - o erro vai para a issue **só com o tipo**, porque a mensagem poderia trazer trecho do changelog;
  - a semana é produzida com a base anterior.

  Token, teto e limite do Claude param a rodada como antes.

## Como o changelog é filtrado

Cada seção do `docs/NOVIDADES.md` é olhada pelo **contexto**:

- **Seção que sai inteira** (não vai ao Claude e não fica marcada como lida, então é lida quando o ramo for liberado):
  - o título fala de um ramo bloqueado pelo nome (ex.: "ramo Spa", "Ramo: barbearia"). Sinais como "massagem" no título não tiram a seção: só valem no corpo;
  - o título diz "ramo X" e X não é ramo liberado (palavras genéricas como "ramo de cada negócio" não contam);
  - a seção está marcada como ainda não liberada ("não publicado", "não liberado", "em breve", "uso interno") no título, ou numa linha do corpo que seja só esse marcador ("(não publicado)", "Status: em breve"). Frase comum como "a consulta é em breve" não conta.
- **Seção de outro ramo que cita o spa:** sai só o que está **no escopo** da citação, e o resto segue normalmente. O texto é lido em blocos de Markdown, não em linhas soltas:
  - um título (`###` ou sublinhado com `---`) que cita: sai até o próximo título do mesmo nível;
  - um parágrafo que diz o **nome** do ramo (rótulo em negrito, frase de abertura, citação com `>`, HTML): sai ele e tudo o que vem depois (itens, parágrafos e subtítulos) até um **rótulo** de clínica ou restaurante ("Na clínica:", "**Restaurante**", "### Clínica"). Frase comparativa ("Como na clínica, ...") não fecha. Na dúvida, fica de fora;
  - parágrafo em que o nome do spa só aparece numa **enumeração de ramos** ("Valem para clínica, restaurante e spa:", "Na clínica ou no spa:"), ou que tem só um sinal ("massagem modeladora"): sai só ele, e os itens seguintes são julgados um a um. Se o nome do spa aparece de outro jeito, mesmo citando a clínica ("Para o spa (diferente da clínica):"), o escopo abre;
  - item-rótulo ("- Para o spa:"): sai com os subitens; se não tem subitens, os itens irmãos logo abaixo também saem;
  - um item que cita: sai com tudo o que pertence a ele, inclusive continuação sem recuo, parágrafo recuado depois de linha em branco e subitens.

  O registro conta quantos blocos foram aparados ("blocos aparados: N"), para ninguém perder novidade de clínica sem perceber.

  Essa seção fica marcada como lida. Quando o spa for liberado, o que saiu dela não é relido; se for o caso, repita no changelog.
- **Candidata do Claude que sai:**
  - candidata que fala de um ramo bloqueado (pelo nome ou por sinais típicos dele, como "cabine" e "massagem") é recusada, mesmo rotulada como `comum`;
  - candidata cuja fonte não é uma das seções enviadas também é recusada.
- **Vertical nova no código sem linha na política:** o id costuma estar em inglês e o changelog em português, então o filtro não reconheceria as seções dela. Enquanto alguém não cria a linha dela (com os termos em português), **nenhuma seção nova é lida**, nem marcada como lida, e a rodada abre um alerta (issue). Clínica e restaurante seguem com a base que já tinham.

## Últimas barreiras: a peça e o publicador

- A lista NUNCA (`palavrasProibidas`) roda em toda peça (slides, legenda, gancho, `alt_text`) e no banco reserva.
- O validador do publicador (`publicar/validar.mjs`) faz a mesma checagem na legenda, no tema, no gancho e no `alt_text`, seja qual for o caminho da peça (agente, produtor manual, edição à mão).

As duas reprovam texto que cite o **nome** de um ramo bloqueado, também em hashtag. Na hashtag vale o termo sozinho ou com complemento típico de hashtag de setor (`#spa`, `#spabrasil`, `#dayspa`, `#bemestarspa`). Palavra que só começa ou termina igual não conta (`#spaghetti`, `#vespa`, `#caspa`).

A comparação é por palavra inteira, sem acento, sem diferença de maiúscula, sem caractere invisível e com largura normalizada: "espaço" e "spam" não contam. Os **sinais** ("massagem", "cabine") **não** reprovam peça, porque clínica de estética usa essas palavras ("massagem modeladora").

**Repositório público:** o motivo que vai para o registro, a issue e o prompt de correção é genérico ("cita um tipo de negócio que a Mazzi ainda não divulga"). O registro da base leva só contagens ("seções fora: 1"), nunca título de seção nem nome de ramo. Os testes usam fixtures inventadas.

**Limites conhecidos:**
- Uma seção sobre o spa que não use nenhum termo ou sinal dele, não diga "ramo ..." no título e não se marque como não liberada passaria pelo filtro do changelog. Por isso, no aj-clinic, novidade de ramo ainda não liberado deve ir numa seção com o ramo no título ou marcada "(não publicado)". As barreiras seguintes (fonte, candidata, lista NUNCA) continuam valendo.
- Grafias propositalmente disfarçadas (letras de outro alfabeto, "s.p.a", "dayspa" junto fora de hashtag) não são reconhecidas. O redator é o Claude seguindo as regras, não alguém tentando burlar.
- Seção de outro ramo que teve parte tirada fica marcada como lida: o que saiu não é relido quando o spa for liberado.
- Enumeração com negação ("Para o spa e a clínica não:") conta como enumeração de ramos e não abre escopo; a forma natural ("Para o spa, e não para a clínica:") abre.
- Abertura que só tem sinais ("Cabines e massagens:") não abre escopo, porque esses sinais também são de estética. Item-rótulo só abre escopo para os irmãos quando termina em dois-pontos ("- Para o spa:"); "- Para o spa" sem dois-pontos tira só ele.

## Como liberar um ramo no futuro (ex.: spa)

Só com decisão de quem responde pelo conteúdo e pela marca. É uma mudança de código revisada, nunca uma variável:

1. Em `agente/base/segmentos.mjs`: `ramo` (nome do ramo no agente) e `divulgar: true`.
2. Em `agente/lib/schemas.mjs`: o ramo novo em `RAMOS`.
3. Em `agente/base/produto.json`: o público do ramo em `publico` e as funções `no_ar` com fonte.
4. No guia de marca e nas regras: o que pode e o que não pode ser dito sobre o ramo.
5. Atualizar os testes que provam o bloqueio (`agente/testes/segmentos.test.mjs`) na mesma revisão. Eles passam a falhar de propósito, o que deixa a liberação visível na PR.

## Como testar o bloqueio

```bash
npm test
```

O arquivo que cobre os ramos e o bloqueio é `agente/testes/segmentos.test.mjs`. Nenhum teste chama a Meta, o Claude ou o publicador, e nenhum grava a base real.

## Ramo novo no aj-clinic (barbearia, oficina...)

Não quebra a rotina: o ramo fica bloqueado, as novidades ficam seguradas e a rodada alerta. Para destravar as novidades sem divulgar o ramo, ponha uma linha dele em `segmentos.mjs` com `divulgar: false` e os `termos` (e `sinais`) em português. Para divulgar, siga "Como liberar".
