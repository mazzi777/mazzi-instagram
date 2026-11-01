# Instagram da Mazzi Systems (@mazzisystems) — guia da marca

Fonte da verdade da marca. Vale mais que qualquer resumo em prompt, skill ou memória.
Atualizado em 30/10/2026 (junta o guia antigo e as regras do prompt da rotina de 30/10).

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

- Fundo grafite `#111316`, texto `#F3F1EC`, destaque coral `#FF7A50`, fonte Inter.
- `@mazzisystems` em toda peça.
- Montar em HTML e capturar com Playwright.

| Formato | Medida | Regras |
|---|---|---|
| Carrossel | JPEG 1080×1350, qualidade 92, 5–8 slides | capa, problema, passos, resumo, chamada |
| Reel | MP4 1080×1920, 20–30 s, H.264 yuv420p, +faststart, áudio AAC silencioso | sem narração; texto animado, máx. 6 palavras por cartão, 1 cartão a cada 3 s; gancho no 1º, chamada no último; texto entre y=230 e y=1440 e fora dos 230 px da direita; quadros com Playwright a 30 fps + ffmpeg |
| Stories | JPEG 1080×1920, 4–5 quadros por dia | texto entre y=250 e y=1600; a API não aceita figurinhas: no lugar de enquete/pergunta, "Me responde aqui nesse story"; no lugar do link, "chama no WhatsApp, link na bio" |

Legenda: primeira linha forte, corpo curto, chamada única, até 3 hashtags.

## Rodízio de temas (N = semana ISO da semana publicada)

Clínica: 1 paciente que falta · 2 anamnese e termo no tablet · 3 orçamento pelo WhatsApp que vira agendamento e sinal · 4 antes e depois · 5 produto vencendo (lote e validade) · 6 pacotes de sessões e comissão.

Restaurante: 1 caixa que não fecha · 2 pedido de delivery que some · 3 delivery pelo teclado · 4 balança e preço do quilo por dia · 5 bebida que acaba sem ninguém ver · 6 quanto sobrou de verdade.

- Carrossel A (segunda) = Clínica tema (N mod 6) + 1.
- Carrossel B (sexta) = Restaurante tema (N mod 6) + 1.
- Reel (quarta) = Restaurante tema ((N + 3) mod 6) + 1 se N for par; Clínica, mesmo cálculo, se N for ímpar.
- Stories: S1 (segunda) clínica, S2 (quarta) restaurante, S3 (sexta) convite.

## Nomes dos arquivos

`semanas/AAAA-MM-DD/` com AAAA-MM-DD = segunda-feira da semana publicada:
`AAAA-MM-DD-A-01.jpg`, `AAAA-MM-DD-B-01.jpg`, `AAAA-MM-DD-REEL.mp4`, `AAAA-MM-DD-S1-01.jpg`, `S2`, `S3`.
