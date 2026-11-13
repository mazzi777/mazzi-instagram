# Instagram da Mazzi Systems (@mazzisystems) — guia da marca

Fonte da verdade da marca. Vale mais que qualquer resumo em prompt, skill ou memória.
Atualizado em 01/11/2026 (corte para o agente autônomo: reel narrado, etiqueta de IA, frequência em faixa).

## Regra principal

Tudo vai ao ar **sem revisão humana** (decisão da Andressa, 30/10/2026). O Claude produz; o GitHub Actions deste repositório publica pela API oficial da Meta, a partir de `semanas/AAAA-MM-DD/agenda.json`. Sem DM. Sem responder nem apagar comentários. Por isso nada pode depender de `{{número real}}` ou de revisão.

## O que é a Mazzi

Sistema de gestão online para **clínicas de estética/harmonização** e **restaurantes pequenos** (self-service por quilo, marmitex, delivery). Funciona no computador e no celular. Cada cliente usa com o próprio logo e as próprias cores.

- **Preço:** **nunca falar de preço** (decisão da Andressa, 01/11/2026). Nada de "grátis", "gratuito", valor, promoção ou desconto. Se o assunto for preço: "chama no WhatsApp que a gente te explica".
- **Como entrar:** não há cadastro aberto. A pessoa chama no WhatsApp (link na bio) e recebe convite.
- **Suporte:** só pelo WhatsApp.

## Clínicas

Estética, harmonização (HOF) e também **odontologia** (decisão de 01/11/2026: o site já atende dentistas). O foco continua em estética/HOF; odonto aparece de vez em quando.

## O que está no ar (pode divulgar)

**Restaurante**
- Caixa: abertura, vendas, pagamento dividido, sangria, fechamento com diferença.
- Delivery pelo teclado: o telefone puxa o cliente, código curto por produto, troco, talher, 2 vias + via da cozinha, número do pedido do dia, conferência ("faltou o nº 4?").
- Balança do self-service com tela para o cliente e preço do quilo por dia da semana.
- Estoque opcional: bebidas baixam sozinhas, custo médio, fornecedores, alerta de mínimo.
- Relatórios de vendas, compras e lucro bruto aproximado (vendas menos compras; **não** há custo por prato).

**Clínica**
- Agenda, pacientes, fichas com histórico.
- Anamnese e termo assinados com o dedo no tablet, com alertas (alergia, anticoagulante).
- Orçamento enviado pelo WhatsApp: a clínica marca como aprovado, abre a agenda preenchida e registra o sinal.
- Lembrete de consulta no WhatsApp **em 1 clique**, com link para o paciente confirmar ou remarcar.
- Antes e depois lado a lado.
- Estoque com lote e validade.
- Pacotes de sessões e comissões.

**Comum:** equipe com cargos e permissões, auditoria, backup diário.

## NUNCA

- Anunciar **NFC-e / nota fiscal** (em homologação).
- Falar de **lembrete automático pela Meta** (não está ligado; só o de 1 clique).
- Citar **AJ Clinic, João XXIII Grill** ou qualquer cliente, nem mostrar a marca deles.
- Inventar **número, resultado, depoimento ou cliente**. Valores só dentro de cartões de interface marcados **"EXEMPLO"**.
- Usar **print do sistema** ou qualquer dado que pareça real (LGPD). Interface só em cartões feitos em HTML, marcados "EXEMPLO".
- Prometer **resultado de procedimento estético**. O foco é a gestão da clínica.
- Deixar `{{...}}` de modelo em qualquer peça.

## Público

- Donas e donos de clínicas de estética/harmonização pequenas (agenda de papel, planilha, WhatsApp solto).
- Donos de restaurantes pequenos (pedido no papel, caixa no caderno).

## Tom

Português do Brasil, informal e direto, frases curtas. Dor concreta + a função que resolve. Nada de "revolucione", "solução completa", "alavanque". **Uma chamada por post:** "chama no WhatsApp (link na bio)". Detalhes de voz em `guia/voz.md`.

## Visual

- Cores: grafite `#111316`, papel `#F3F1EC` e coral `#FF7A50`, usados também como **fundo** (desde 12/11/2026: o grid não é mais todo escuro). Fonte Inter; Caveat só no que é "escrito à mão".
- 10 layouts (pergunta, manchete, conversa, comparativo, cartão, bilhete, frase, passo, lista, chamada) e regras de variedade: **`guia/direcao-de-arte.md`**. A capa nunca repete o layout das 2 últimas capas do feed.
- `@mazzisystems` em toda peça.
- Montar em HTML e capturar com Playwright.

| Formato | Medida | Regras |
|---|---|---|
| Carrossel | JPEG 1080×1350, qualidade 92, 5–8 slides | capa, problema, passos, resumo, chamada |
| Imagem única | JPEG 1080×1350 | um recado só, com cartão de exemplo |
| Reel | MP4 1080×1920, 20–45 s, H.264 yuv420p, +faststart, AAC 48 kHz, −14 LUFS | **narrado** (voz sintética pt-BR "Antonio"; "Mazzi" se fala "Mázi"), legenda palavra a palavra, motion graphics (cenas, atos de cor, transições, efeitos) e trilha de fundo baixinha sem Content ID; gancho na 1ª cena, chamada na última. Por ter voz sintética realista, sai com a etiqueta de IA da Meta (`is_ai_generated`) |
| Stories | JPEG 1080×1920, 1 conjunto por dia | texto entre y=250 e y=1600; a API não aceita figurinhas: no lugar de enquete/pergunta, "Me responde aqui nesse story"; no lugar do link, "chama no WhatsApp, link na bio" |

Legenda: primeira linha forte, corpo curto, chamada única, até 3 hashtags.

## Frequência (desde 01/11/2026, quem decide é o agente, dentro da faixa)

- 3 a 5 posts de feed por semana (no máximo 1 por dia), com pelo menos 1 reel e 1 carrossel, e os dois ramos aparecendo.
- Stories em 3 a 5 dias da semana.
- Cerca de 70% dos posts com objetivo "conversa" (levar ao WhatsApp) e 30% "alcance". Cerca de 20% é exploração (formato, tema ou horário pouco testado).
- Horários: 07:40, 11:40, 18:40 ou 20:40 (Brasília).

## Temas que funcionam (lista de partida, não rodízio fixo)

Clínica: paciente que falta · anamnese e termo no tablet · orçamento pelo WhatsApp que vira agendamento e sinal · antes e depois · produto vencendo (lote e validade) · pacotes de sessões e comissão.

Restaurante: caixa que não fecha · pedido de delivery que some · delivery pelo teclado · balança e preço do quilo por dia · bebida que acaba sem ninguém ver · quanto sobrou de verdade.

O agente não repete gancho nem ângulo das últimas 6 semanas e puxa as funções novas da base do produto.

## Nomes dos arquivos

`semanas/AAAA-MM-DD/` com AAAA-MM-DD = segunda-feira da semana publicada. Semanas do agente (`produtor: "agente"`): ids A, B, C... para o feed e S1, S2... para os stories, arquivos `AAAA-MM-DD-<id>-01.jpg` ou `AAAA-MM-DD-<id>.mp4`. Semanas antigas da rotina usavam A, B, REEL, S1–S3.
