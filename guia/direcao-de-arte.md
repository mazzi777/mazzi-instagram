# Direção de arte do @mazzisystems

Criado em 12/11/2026. Vale junto com `guia/marca.md` (que vale mais em caso de conflito). O código cobra o que está marcado com **(código)**; o editor automático (G9b) cobra o resto.

## Por que mudou

Até a semana de 09/11 toda peça saía do mesmo molde: fundo grafite, título grande à esquerda, uma palavra em coral, rótulo em caixa alta em cima. Um por um, os posts eram limpos; no grid, eram o mesmo quadrado repetido. Esse molde (fundo quase preto com um acento vibrante, rótulo em caixa alta, palavra colorida no título) é também o visual que mais se associa a peça feita por IA.

O que contas boas de SaaS e de nicho fazem (pesquisa de 12/11/2026, fontes no fim): a marca fica fixa (cores, fonte, margens, posição do @), e o que varia é a **composição por tipo de conteúdo**. A capa é o rosto do grid; ela muda de composição e de fundo de uma peça para a outra. Cor secundária aparece numa parte das peças para dar ritmo, não em todas.

## O que é fixo

- Cores: grafite `#111316`, papel `#F3F1EC`, coral `#FF7A50`. Nada além disso (os tons dos selos de cartão são da interface).
- Fonte: Inter em tudo; **Caveat** só para o que é "escrito à mão" (anotação de caderno, lado "caderno" do comparativo, aspas da frase).
- Carrossel: "arrasta pro lado" no alto e, no rodapé, contador de progresso (barra fina + "03/07"), posto pelo código (referências de mercado de 12/11, `docs/referencias/analise-referencias-mercado.md` na pasta do projeto).
- `@mazzisystems` no rodapé de toda tela; "para clínicas" / "para restaurantes" em minúscula no topo (sem rótulo em caixa alta).
- Interface só em cartão ou conversa marcados **EXEMPLO** (o selo é posto pelo código, não tem como faltar).
- Margens: 120 px nas laterais do feed (o grid do perfil corta as bordas da capa 4:5); stories com texto entre y=250 e y=1600.

## Os 10 layouts

| Layout | Mostra | Bom para | Capa? | Fundos |
|---|---|---|---|---|
| `pergunta` | pergunta ou frase curta enorme, centralizada | a dor, a capa | sim | papel, coral, escuro |
| `manchete` | título grande à esquerda + texto curto | explicar uma ideia | sim | escuro, papel |
| `conversa` | bolhas de conversa EXEMPLO | orçamento, confirmação, pedido | sim | papel, escuro |
| `comparativo` | caderno (manuscrito, riscado) × o que a tela mostra | "como é hoje" × "como fica" | sim | escuro, papel |
| `cartao` | cartão de interface EXEMPLO grande e inclinado | mostrar a função | sim | escuro, papel, coral |
| `bilhete` | folha de caderno com anotações à mão | a dor do papel, da cabeça | sim | escuro, coral |
| `frase` | opinião em frase grande, com aspas | posição da marca, virada | sim | coral, papel |
| `passo` | número gigante vazado + título | **só** sequência de verdade | não | escuro, papel |
| `lista` | checklist marcado | o resumo que a pessoa printa | não | escuro, papel |
| `chamada` | o pedido, grande e sozinho | último slide | não | coral, papel, escuro |

Para ver todos: `node agente/ferramentas/vitrine.mjs <pasta>` (renderiza cada layout em cada fundo, sem Claude).

## Regras de variedade

- **(código)** Carrossel: pelo menos 3 layouts diferentes (4 se tiver 7 ou mais slides); o mesmo layout nunca em dois slides seguidos (exceto `passo`); último slide `chamada`; `passo`, `lista` e `chamada` não abrem.
- **(código)** Stories: pelo menos 2 layouts; nunca o mesmo 3 vezes seguidas.
- **(código)** A capa (carrossel e imagem) não repete o layout das 2 últimas capas do feed, nem o fundo delas (o fundo quem escolhe é o código).
- **(código)** Família da capa: `pergunta`, `manchete`, `frase` e `chamada` são "texto" (no grid, viram o mesmo quadrado de letra grande); `conversa`, `comparativo`, `cartao`, `bilhete`, `passo` e `lista` são "cena". Depois de 2 capas de texto, a próxima mostra uma cena. Isso veio do ensaio de 12/11: o editor apontou que capa `pergunta` depois de `manchete` "é a mesma capa".
- **(código)** Stories: pelo menos um quadro com cena; `passo` não existe nos stories.
- **(código)** Destaque colorido: o código mantém só os 2 primeiros (não reprova por isso).
- **(código)** Banco reserva: quando uma peça cai na reserva, vem primeiro a que não repete as 2 últimas capas e a que já tem o visual novo. As 8 peças da reserva feitas antes de 12/11 são do molde antigo; o banco se renova sozinho conforme o agente repõe.
- **(código)** Fundo: nada 3 vezes seguidas; coral no máximo 2 telas por peça; carrossel com pelo menos 2 fundos.
- **(código)** "pergunta" e "chamada" com até 9 palavras no título; texto de cada tela com até 32 palavras; destaque colorido em no máximo 2 slides.
- **(código)** Cada layout precisa do seu conteúdo: `conversa` com 2 a 4 mensagens, `comparativo` com os dois lados, `bilhete` com 2 a 4 anotações, `lista` com 3 a 5 itens, `cartao` com cartão, `passo` com número.

## O que o editor (G9b) olha

O editor está na mesma chamada do juiz visual (G7): uma chamada com imagens por tentativa. Ele julga só o que o redator escolhe (texto, ideia, layout, conteúdo dos cartões), nunca cor, fundo ou tamanho de letra. Nota de 0 a 10 em cada critério, com as imagens prontas e as últimas 10 peças do perfil na frente. **Passa** se nenhum critério ficar abaixo de 5 e no máximo um ficar abaixo de 7 (calibrado no ensaio de 12/11/2026, ver `agente/checagens/calibracao.md`):

1. **original**: tem ideia e composição próprias, ou serve para qualquer sistema de gestão?
2. **humano**: soa como gente que conhece o balcão e a recepção, ou como anúncio pronto?
3. **marca**: tom e visual da Mazzi.
4. **novidade**: traz algo que as últimas peças não trouxeram?
5. **clareza**: dá para entender em 3 segundos no celular?

Mais a lista de **ética médica (CFM)** nas peças de clínica: qualquer trecho que exista de verdade no texto reprova (o código confere o trecho).

## Escolher o layout pelo conteúdo (exemplos)

- "Visualizou o orçamento e sumiu?" → capa `conversa` (a cena do WhatsApp parado é a dor).
- "O caixa do caderno sempre bate" → capa `bilhete` (a própria anotação é a prova).
- "Lucro é o que sobra depois das compras" → `frase` no coral (é opinião).
- "Delivery no papel × no teclado" → `comparativo`.
- "Lote vencendo" → `cartao` com o selo de validade.

## Fontes da pesquisa (12/11/2026)

- Sked Social, guia de layouts de grid: capa como "rosto" do grid; capas próprias para reel em vez do quadro automático. https://skedsocial.com/blog/instagram-grid-layout
- Guias de grid coeso (socialk.it, Statusbrew): sistema fixo de marca + biblioteca pequena de layouts por tipo de conteúdo; cor secundária em 20 a 30% das peças. https://socialk.it/en/blog/instagram-feed-aesthetic-guide · https://statusbrew.com/insights/instagram-grid
- Guias de carrossel 2026: o 2º slide é um segundo gancho; 4:5 (1080×1350); um slide = uma ideia. https://dev.to/fermainpariz/how-to-create-instagram-carousel-posts-that-get-saved-and-shared-2026-guide-1jjm
- Publicidade médica: Resolução CFM 2.336/2023 (sem promessa de resultado, sem superlativo, antes e depois só educativo e sem identificar o paciente). https://portal.cfm.org.br/noticias/cfm-atualiza-resolucao-da-publicidade-medica
