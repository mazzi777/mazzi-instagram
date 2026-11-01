# SPEC: agente autônomo do Instagram @mazzisystems

Versão 1, 01/11/2026. Status: **aprovado pela Andressa em 01/11/2026**. Plano de implementação: `PLANO.md`.

O "funcionário" que cuida do @mazzisystems sozinho: decide o que postar e quando, produz (inclusive reels narrados), confere, publica, lê os resultados e ajusta a estratégia. Você não aprova post. Só recebe aviso quando algo quebra.

---

## 1. Resumo em 12 linhas

1. Roda no **GitHub Actions do próprio `mazzi-instagram`** (público: minutos ilimitados e grátis), com agendador próprio (cron). Nada roda na sua máquina nem numa sessão do Claude Code.
2. O cérebro é o **Claude Agent SDK** (TypeScript), autenticado com a **sua assinatura Pro** por um token de 1 ano (`claude setup-token`). Custo em dinheiro: **US$ 0**. O preço é o limite do Pro, que o agente divide com você. Por isso ele roda de madrugada e tem teto semanal.
3. O código manda no fluxo, e o Claude só decide e escreve dentro de etapas fechadas. **Publicar não é uma ferramenta do Claude**: só o código publica, e só depois que todas as checagens passam.
4. Reaproveita o publicador que já funciona (`publicar/publicar.mjs`: sem post duplicado, polling do container, issue em falha).
5. Reels narrados: roteiro (Claude) → voz **Edge TTS "Antonio"** (reserva: **Kokoro** voz masculina) → tempos por palavra com **Whisper** → montagem 9:16 no **Remotion** com legenda palavra a palavra → ffmpeg → validação técnica.
6. Carrossel, imagem e stories: HTML com a marca → Playwright → JPEG, como hoje.
7. As 8 checagens automáticas substituem a sua aprovação: fatos contra a base do produto, lista NUNCA, nota do gancho, legenda antes do "...mais", texto sem cara de IA, técnica, visual e repetição. Reprovou: regera até 2 vezes. Reprovou de novo: entra um post do **banco reserva**. Na dúvida, não posta.
8. Métricas de cada post entram no planejamento da semana seguinte. O objetivo é 70% conversa no WhatsApp e 30% alcance e autoridade.
9. Alertas só por **e-mail do GitHub** (issue), e só quando algo quebra.
10. Kill switch: `gh variable set AGENTE_PAUSADO -b true -R mazzi777/mazzi-instagram`.
11. Público: só clínica de estética/HOF e restaurante, porque é o que o sistema tem. A lista de ramos vem do código do aj-clinic, então ramo novo entra sozinho quando existir no sistema.
12. Fase 1 liga tudo isso. Fase 2 adiciona respostas a comentários e DMs.

---

## 2. Decisões da entrevista (01/11/2026)

| Tema | Decisão |
|---|---|
| Público | Só clínica e restaurante agora. O desenho já prevê novos ramos (seção 7.1). |
| Objetivo | Misto **70/30**: 70% das peças buscam conversa no WhatsApp (pedido de convite), 30% buscam alcance e autoridade. |
| Orçamento | **Tudo gratuito.** Nenhuma API paga, nenhum servidor pago. |
| Servidor | **GitHub Actions.** |
| Cérebro | Assinatura **Pro** via `CLAUDE_CODE_OAUTH_TOKEN`. |
| Voz | **Edge TTS `pt-BR-AntonioNeural`**. Se falhar, **Kokoro `pm_alex`** (masculina). Pronúncia "Mazzi" → "Mázi". |
| Alertas | E-mail via issue do GitHub. |
| Frequência | O agente decide numa faixa: 3 a 5 posts de feed por semana (pelo menos 1 reel e 1 carrossel) e stories em 3 a 5 dias. |
| Tom, público e marca | Já estão definidos em `guia/marca.md` e `guia/voz.md` (não perguntei de novo). |
| Suporte | WhatsApp +55 11 94980-3172 (regra da casa). |

### 2.1 Onde eu discordei, e o que ficou

- **Barbearia, consultório e "serviços"** ficaram de fora: o sistema só tem `VERTICALS = ['clinic', 'restaurant']` (`aj-clinic/packages/shared/src/permissions.ts`). Falar com quem o produto não atende seria prometer o que ele não faz.
- **"Teste grátis" não existe.** A conversão é "chama no WhatsApp (link na bio)" para pedir convite.
- **"Renovar o token de longa duração"**: o token atual da Meta é de **usuário do sistema, sem validade**. Ele não precisa ser renovado; precisa ser conferido todo dia, o que já é feito. Quem vence é o token do Claude (1 ano), e o agente avisa 30 dias antes (seção 9).
- **Edge TTS** é área cinzenta para uso comercial e pode parar sem aviso. Você escolheu mesmo assim, então ficou com reserva automática no Kokoro, que tem licença comercial (Apache-2.0).
- **Sobre a "skill de voz natural":** uma skill não cria voz. Ela só chama algum motor de voz, e a naturalidade vem do motor. Procurei no catálogo de plugins e não há nenhum de narração com voz natural e grátis. Entre os grátis, o Antonio do Edge é o mais natural que conheço. Há um terceiro candidato, o **Chatterbox Multilingual** (licença MIT, tem português). Não sei se ele roda rápido o bastante sem placa de vídeo, então ele entra como teste na Fase 1c: gero amostras das três vozes e você escuta, se quiser.
- **Mudança de regra da marca:** `guia/voz.md` e `guia/marca.md` dizem "reel sem narração" e "sem DM, sem responder comentário". Os reels narrados (Fase 1) e as respostas (Fase 2) mudam isso, e os dois guias serão atualizados junto com o código.

---

## 3. O que já existe e é reaproveitado

| Peça | Onde | Uso no agente |
|---|---|---|
| Publicador pela API oficial | `publicar/publicar.mjs` | Continua sendo o único que publica. Ganha horário por peça, checagem do limite e a etiqueta de IA. |
| Validador da semana | `publicar/validar.mjs` | Vira a checagem técnica G6 e parte da G2. |
| Workflow diário com issue em falha | `.github/workflows/publicar.yml` | Ganha mais horários e a checagem do kill switch. |
| Marca, NUNCA, voz, rodízio | `guia/marca.md`, `guia/voz.md` | Viram regras carregadas pelo agente e testadas no código. |
| Histórico | `guia/log.md` | Fonte da checagem de repetição G8. |
| Kit Remotion da marca + narração | `MazziSystems/marketing/motion-graphics/` (local, fora do git) | Os componentes (fundos, texto cinético, cartões EXEMPLO, logo) e o `narracao.mjs` são copiados para `agente/video/`. |
| Scripts das skills `ig-*` | `.claude/plugin-instagram-agent/skills/` (licença MIT) | Portados para pt-BR (seção 8.2). |

**Fica para trás:** a rotina da nuvem "Mazzi Instagram semanal" (`trig_019Eus91BL21EhvWryEQ2Fkc`). Ela é desligada no corte da Fase 1, para não existirem dois produtores.

---

## 4. Arquitetura

```
                 GitHub Actions (repo público mazzi777/mazzi-instagram)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │  sáb 02:17  agente-semanal   métricas → plano da semana → produz a semana   │
 │  diário 03:17 agente-diario  métricas · produz/regera próximos 3 dias ·    │
 │                              tokens · reserva · heartbeat                   │
 │  07:40 11:40 18:40 20:40  publicar   (existente) peças do horário          │
 │  20:10      metricas-stories coleta stories antes de expirarem (24h)       │
 │  [Fase 2] a cada 15 min  comentarios / dms                                  │
 │                                                                             │
 │  Todos: 1º passo = kill switch (AGENTE_PAUSADO) · último = heartbeat        │
 └───────────┬───────────────────────────────┬───────────────────────────────┘
             │                               │
   ┌─────────▼─────────┐          ┌──────────▼──────────┐
   │ Orquestrador (JS) │──etapas─▶│ Cérebro: Agent SDK  │  Sonnet 5.5 escreve/planeja
   │ máquina de estado │◀─JSON────│ (assinatura Pro)    │  Haiku 5.5 julga
   │ por peça          │          │ só ferramentas de   │  sem Bash, sem Write livre,
   └──┬──────┬─────┬───┘          │ leitura + as nossas │  sem publicar
      │      │     │              └─────────────────────┘
      │      │     └──▶ Ferramentas (código): narrar · alinhar · montar_video ·
      │      │          montar_imagens · validar · buscar_broll · ler_metricas
      │      └──▶ Checagens G1–G8 → aprovado | regerar (≤2) | reserva | não posta
      └──▶ Git = banco de dados (agenda, base do produto, métricas, registro)
             │
             ▼
   publicar.mjs ──▶ API oficial da Meta (graph.facebook.com, v25.0) ──▶ @mazzisystems
   (mídia: raw.githubusercontent.com do commit exato)
```

### 4.1 Por que GitHub Actions

- Grátis de verdade em repositório público (minutos ilimitados), com agendador, segredos e logs. A publicação já roda lá.
- **Limitações que aceitamos:**
  - O cron atrasa em hora de pico, então os horários evitam a hora cheia (`:17`, `:40`).
  - Não é 24/7: na Fase 2 a resposta sai em até ~15–30 min, e não em segundos.
  - Em repositório público, o GitHub desliga workflows agendados depois de 60 dias sem atividade. Isso não acontece aqui porque o robô faz commit todo dia, e o heartbeat (seção 9) pega se acontecer.
- **Repositório público:** os logs de execução são públicos. Por isso o agente nunca imprime segredo, comentário de terceiro ou dado pessoal, e o registro guarda só ids e decisões (seção 10).

### 4.2 Por que o Agent SDK (a avaliação que você pediu)

| Opção | Custo | Prós | Contras | Veredito |
|---|---|---|---|---|
| **Claude Agent SDK** (TS) + token da assinatura | US$ 0 (usa o Pro) | Ferramentas próprias (MCP no processo), hooks, controle de ferramentas, JSON de saída, `total_cost_usd` e uso por chamada | Pesado (traz o binário do Claude Code); disputa limite com você | **Escolhido** |
| API da Claude (SDK `@anthropic-ai/sdk` + Tool Runner) | ~US$ 10–20/mês reais | Leve, sem limite de assinatura | Fere o "tudo grátis" | Plano B: troca só a credencial |
| `claude -p` (CLI) num script | US$ 0 | Simples | Sem ferramentas tipadas, menos controle | Descartado |
| Managed Agents (Anthropic hospeda) | Cobra API | Agendador e sandbox prontos | Beta, cobra, incerto para renderizar vídeo | Descartado |

- **O token é permitido?** A doc oficial do Claude Code diz que o `claude setup-token` gera um token de 1 ano "para pipelines de CI e scripts", ligado à assinatura Pro, Max ou Ultra. A restrição da doc do Agent SDK é para empresas que oferecem login do claude.ai **a clientes delas**. Aqui é você usando a sua própria conta no seu próprio CI. Se a Anthropic mudar essa regra, o plano B é uma chave de API, sem mudar código, só a credencial (custo na seção 14).
- **Por que o código manda e o Claude só decide:** com o modelo livre para chamar "publicar", um erro de julgamento vira post no ar. Aqui o Claude devolve JSON validado (zod) em cada etapa, as checagens são outra chamada (outro prompt, sem ver o raciocínio de quem escreveu) e a publicação é código determinístico.
  - Ferramentas que o Claude recebe: ler a base do produto, ler métricas, ler o log, `buscar_broll`, `nota_gancho`, `checar_legenda`, `checar_humano` (para ele se autocorrigir antes de entregar).
  - Ferramentas do Claude Code desligadas: Bash, Write, Edit, WebFetch livre.
- **Modelos:** `claude-sonnet-5-5` planeja e escreve; `claude-haiku-5-5` julga (barato e rápido). Os dois são configuráveis em `agente/config.json`.

---

## 5. Componentes (pastas novas em `mazzi-instagram/`)

| Pasta / arquivo | Faz uma coisa |
|---|---|
| `agente/orquestrador.mjs` | Máquina de estado de cada peça: `planejada → roteiro → produzida → checada → aprovada → agendada → publicada`, ou então `reprovada → regerar \| reserva \| pulada`. Retoma de onde parou. |
| `agente/cerebro.mjs` | Única porta para o Claude. Chama o Agent SDK, valida a saída com zod, mede tokens e `total_cost_usd`, aplica o teto semanal e trata 401/limite. |
| `agente/etapas/planejar.mjs` | Calendário da semana: temas, formatos, dias e horários. |
| `agente/etapas/escrever.mjs` | Gancho, roteiro do reel, textos dos slides e stories, legenda. |
| `agente/ferramentas/narrar.mjs` | TTS com a cadeia Edge → Kokoro → sem narração, e o mapa de pronúncia. |
| `agente/ferramentas/alinhar.mjs` | Whisper (whisper.cpp, modelo `small`, pt) → tempo de cada palavra do roteiro conhecido. |
| `agente/video/` | Projeto Remotion: composição `ReelNarrado` + kit da marca. |
| `agente/imagens/` | Modelos HTML de carrossel, imagem e story + captura com Playwright. |
| `agente/checagens/` | G1–G8 (seção 8). Cada uma devolve `{ok, nota, motivos[]}`. |
| `agente/metricas.mjs` | Coleta os insights e calcula a nota de cada post. |
| `agente/estrategia.mjs` | Atualiza os pesos de formato, tema, gancho e horário. |
| `agente/reserva.mjs` | Mantém o banco evergreen (≥ 6 peças prontas). |
| `agente/base/` | Base de conhecimento do produto (seção 7). |
| `agente/relatorio.mjs` | Relatório semanal em `relatorios/AAAA-Www.md`. |
| `publicar/publicar.mjs` | Existente. Ganha: `horario`, `content_publishing_limit`, `is_ai_generated` e o kill switch. |

Stack: Node 22, ESM `.mjs` (como o publicador), `zod`, `@anthropic-ai/claude-agent-sdk`, `msedge-tts`, Remotion 4, Playwright, ffmpeg. Kokoro e Whisper rodam por linha de comando (Python e whisper.cpp), com cache no Actions.

---

## 6. Fluxos

### 6.1 Semanal (sábado 02:17, produz a semana de segunda a domingo seguinte)

1. Kill switch e teto de uso.
2. Coleta as métricas pendentes (seção 11) e lê `estrategia/estado.json`.
3. Atualiza a base do produto: lê `docs/NOVIDADES.md` e `VERTICALS` do aj-clinic (seção 7.2).
4. **Planejar** (Sonnet): devolve a agenda com 3 a 5 posts de feed e stories em 3 a 5 dias. Cada peça leva `tipo`, `tema`, `ramo`, `objetivo` (`conversa` ou `alcance`, na proporção 70/30), `dia`, `horario` (um dos 4 horários), o ângulo e a fonte (que fato da base ela usa).
   - Regras do plano, conferidas por código:
     - pelo menos 1 reel e 1 carrossel;
     - os dois ramos aparecem na semana;
     - no máximo 1 post de feed por dia;
     - um tema não repete o ângulo das últimas 6 semanas;
     - 20% das peças são exploração (formato, tema ou horário pouco testado).
5. Produz todas as peças (6.3), na ordem do dia de publicação.
6. Grava `semanas/SEMANA/agenda.json` (formato atual + campos novos), commit e push.
7. Garante que o banco reserva tem ≥ 6 peças válidas.
8. Gera o relatório da semana que terminou.

### 6.2 Diário (03:17)

1. Kill switch, checagem dos tokens (Meta, Claude, leitura do aj-clinic) e heartbeat.
2. Métricas: posts com D+1, D+3, D+7 e D+28; conta do dia anterior.
3. Para os próximos 3 dias: produz o que faltou e refaz o que foi reprovado ou ficou inválido (por exemplo, a base mudou e um fato saiu do ar).
4. Se o teto de uso chegou a 80%: modo econômico (sem regeração; stories viram reaproveitamento).

### 6.3 Produção de uma peça (o laço da qualidade)

```
escrever (Sonnet) ──▶ G1..G5 em texto ──falhou──▶ regerar com os motivos (máx. 2x)
        │ok                                              │ 3ª falha
        ▼                                                ▼
montar mídia ──▶ G6 técnica + G7 visual ──falhou──▶ remontar (máx. 2x) ──▶ reserva
        │ok                                                                  │ sem reserva válida
        ▼                                                                    ▼
aprovada → agenda.json                                        pulada (não posta) + registro
```

Os motivos de reprovação voltam como instrução para a próxima tentativa. Toda tentativa fica no registro: texto, notas e motivos.

### 6.4 Publicação (07:40, 11:40, 18:40 e 20:40)

É o `publicar.yml` atual, com quatro horários. A cada rodada, ele publica as peças com `dia == hoje` e `horario <=` agora que ainda não saíram. Antes de cada peça:

1. kill switch;
2. `GET /{ig-user-id}/content_publishing_limit` (a doc da Meta fala em 50 e em 100 por 24h; o agente lê o `quota_total` na hora e para com 5 de folga);
3. revalida a peça (G6 e as regras do NUNCA, porque a peça pode ter sido feita dias antes);
4. publica com o fluxo atual, que grava o pendente antes do `media_publish`.

Se a mídia da peça sumiu ou ficou inválida, usa a reserva do mesmo formato.

### 6.5 Horários

O agente escolhe entre os 4 horários fixos. Os pesos vêm das métricas por horário. O `online_followers` da Meta só existe com 100+ seguidores; até lá, valem os padrões: feed às 11:40 ou 18:40, stories às 07:40 e às 20:40.

---

## 7. Base de conhecimento do produto (contra invenção)

### 7.1 Formato

`agente/base/produto.json`, validado por schema:

```json
{
  "atualizado_em": "2026-11-01",
  "ramos": ["clinica", "restaurante"],
  "preco": { "texto": "gratuito por enquanto", "proibido": ["grátis para sempre", "valores futuros"] },
  "entrada": "por convite: chama no WhatsApp (link na bio)",
  "funcoes": [
    { "id": "rest.delivery.teclado", "ramo": "restaurante", "status": "no_ar",
      "fato": "Delivery pelo teclado: o telefone puxa o cliente, código curto por produto, 3 vias.",
      "fonte": "guia/marca.md#restaurante; NOVIDADES out/2026 (12)" },
    { "id": "fiscal.nfce", "ramo": "restaurante", "status": "proibido",
      "motivo": "em homologação" }
  ],
  "faq": [ { "pergunta": "Quanto custa?", "resposta": "Por enquanto é gratuito. ..." } ]
}
```

- **Fonte inicial:** a seção "O que está no ar" do `guia/marca.md`, o site público (`/`, `/clinicas`, `/restaurantes`, `llms.txt`) e a lista NUNCA.
- **Ramos:** o agente lê `VERTICALS` do aj-clinic. Um ramo só vira `ramos` quando existe no código **e** tem funções `no_ar` na base. Barbearia, quando entrar no sistema, entra sozinha no planejamento.

### 7.2 Atualização automática (sem você)

1. Toda semana, o agente lê `aj-clinic/docs/NOVIDADES.md` com uma deploy key só de leitura (segredo `AJ_CLINIC_DEPLOY_KEY`, vale só para o repo `aj-clinic`).
2. O Claude extrai as funções novas como candidatas. O código barra tudo que bate com a lista NUNCA (NFC-e, lembrete automático, nome de cliente…) ou com o padrão "em homologação / falta / pendente".
3. Candidata que passou vira `no_ar` com a fonte anotada (arquivo e linha) e aparece no relatório: "passei a divulgar: X". Você só lê; se não quiser, me diz e ela vira `proibido`.

---

## 8. Qualidade sem você

### 8.1 As checagens

| # | Checagem | Como | Passa se |
|---|---|---|---|
| G1 | **Fatos** | O juiz (Haiku) lista cada afirmação da peça e liga cada uma a um `funcoes[].id`. O código confere que todo id existe e está `no_ar`. | Nenhuma afirmação solta. Número só dentro de cartão "EXEMPLO". Nenhum preço, promoção, cliente, depoimento ou resultado. |
| G2 | **NUNCA e temas proibidos** | Regex atuais do `validar.mjs` + juiz semântico: concorrente, saúde ou resultado clínico/estético, promessa além da base, política, tema polêmico, medo e urgência falsos. | Zero ocorrência. Na dúvida, reprova. |
| G3 | **Gancho** | `nota_gancho` (porte pt-BR do `hookscore.py`). | Nota ≥ 70 e nenhum critério < 55 (o mesmo "STRONG" do original). |
| G4 | **Legenda antes do "...mais"** | Porte pt-BR do `caption.py`. | O gancho cabe inteiro nos primeiros ~125 caracteres; 1 chamada só; ≤ 3 hashtags e no fim; sem link; ≤ 2.200 caracteres. |
| G5 | **Sem cara de IA** | Porte pt-BR do `detect.py` + lista de palavras da marca + travessão, caractere invisível e `{{`. | Nota ≥ 70 e nenhum critério < 55. |
| G6 | **Técnica** | ffprobe + leitura de JPEG (seção 8.3). | Tudo dentro da spec. |
| G7 | **Visual** | O juiz recebe os slides ou 6 quadros do reel (0,5 s, gancho, meio, CTA, fim) e responde num checklist: texto cortado, sobreposição, erro de português, legibilidade, `@mazzisystems`, selo EXEMPLO nos cartões, nada parecido com print real. | Checklist sem falha. |
| G8 | **Repetição** | Código: gancho e ângulo comparados com `guia/log.md` e o registro das últimas 6 semanas (similaridade normalizada). | Similaridade < 0,6 com qualquer anterior. |

- **Regra geral:** qualquer checagem com erro de execução (juiz fora do ar, timeout) conta como **reprovada**. Na dúvida, não posta.
- **Calibração antes de valer:** as notas mínimas de G3 e G5 são calibradas na Fase 1a contra os ganchos já publicados (`guia/log.md`) e contra 20 ganchos ruins de propósito. Se o porte não separar bom de ruim, o limite muda e eu te mostro os números.

### 8.2 Porte das skills `ig-*` para pt-BR (precisa, não é detalhe)

Os scripts originais são para inglês e erram em português:

- a expressão de palavra é `[A-Za-z]`, que quebra "não" em "n" e "o";
- os números falados estão em inglês;
- a lista de palavras de IA está em inglês;
- "nome próprio" é detectado por letra maiúscula.

O porte vai para JS em `agente/checagens/` e inclui:

- Unicode (`\p{L}`);
- números por extenso em português;
- uma lista pt-BR de palavras com cara de IA: a da marca ("revolucione", "alavanque", "solução completa", "potencialize", "transforme seu negócio") mais as comuns ("no mundo de hoje", "é importante ressaltar", "em suma", "jornada", "desbloqueie");
- as chamadas em português ("chama no WhatsApp", "link na bio", "salva esse post").

O próprio autor avisa que o `hookscore` separa bem gancho bom de gancho ruim, mas **não prevê qual de dois ganchos bons vai melhor**. Por isso ele é piso de qualidade, não critério de escolha; quem escolhe são as métricas (seção 11). As skills `ig-plan`, `ig-reel`, `ig-carousel`, `ig-story`, `ig-caption` e `ig-human` entram como instrução nos prompts do planejador e do redator, com o texto do `SKILL.md` resumido e versionado em `agente/prompts/`.

### 8.3 Validação técnica (G6), conferida na doc da Meta em 01/11/2026

| Formato | Regra da Meta | Regra nossa (mais estreita) |
|---|---|---|
| Imagem e carrossel | JPEG, ≤ 8 MB, proporção de 4:5 a 1,91:1, largura até 1.440 px, sRGB; carrossel até 20 itens, cortado na proporção do 1º | 1080×1350, qualidade 92, 5 a 8 slides |
| Reel | MP4 ou MOV, moov no início, H.264 ou HEVC, progressivo, GOP fechado, 4:2:0; AAC ≤ 48 kHz; 23 a 60 fps; ≤ 1.920 px de largura; 3 s a 15 min; ≤ 300 MB; vídeo ≤ 25 Mbps; capa JPEG ≤ 8 MB | 1080×1920, H.264 High, yuv420p, 30 fps, `+faststart`, AAC 48 kHz, 20 a 45 s, ≤ 40 MB, loudness −14 LUFS ±2, capa 9:16 via `cover_url` |
| Story | Imagem JPEG ≤ 8 MB, 9:16; vídeo de 3 a 60 s, ≤ 100 MB | Imagem 1080×1920, 4 ou 5 quadros, texto entre y=250 e y=1600 |
| Legenda do reel | (não é da API: é queimada no vídeo) | Fonte ≥ 64 px, contraste ≥ 4,5:1 (WCAG AA) calculado sobre o fundo real do quadro; até 2 linhas e 6 palavras por vez; dentro de y=230–1440 e fora dos 230 px da direita |

Mais limites da API que o agente respeita: a API não aceita figurinha nem filtro e não tem a biblioteca de músicas do Instagram (então reel só com trilha nossa ou sem trilha); `alt_text` só vale para imagem e carrossel (o agente preenche); container expira em 24 h.

### 8.4 Etiqueta de IA (política da Meta)

- **Regra da Meta:** é obrigatório rotular conteúdo orgânico com "vídeo fotorrealista ou áudio de som realista criado ou alterado digitalmente". Quem não rotula pode ser penalizado.
- A API tem o parâmetro `is_ai_generated` (não vale para os filhos do carrossel; vale no container).
- **Decisão:**
  - todo **reel narrado** sai com `is_ai_generated=true`, porque a voz é sintética e realista;
  - peça com imagem fotorrealista gerada por IA também sai com `true`. O agente não gera esse tipo de imagem na Fase 1, mas a regra fica pronta;
  - carrossel, imagem e story feitos em HTML (gráfico, texto, cartão) saem com `false`;
  - vídeo de banco (Pexels) é filmagem real, então não muda a regra.

### 8.5 Banco reserva (evergreen)

- Peças **já renderizadas e aprovadas** em `reserva/<id>/`, de temas que não envelhecem (dores do dia a dia, "como funciona", passo a passo).
- Mínimo de 6 (2 de cada formato de feed + 2 conjuntos de stories). O agente repõe no semanal.
- Antes de usar, a peça passa de novo por G1, G2 e G6 contra a base **atual**. A mesma peça não volta ao ar em menos de 90 dias.
- Usar a reserva **não é alerta**: entra no relatório. Vira issue se o banco ficar com menos de 3 peças válidas ou se 2 horários seguidos ficarem sem post.

---

## 9. Para nunca parar em silêncio

| Risco | Como o agente pega | Aviso |
|---|---|---|
| Token da Meta inválido | `GET` da conta em toda rodada (já existe) + `debug_token` semanal (escopos: tem que ter `instagram_content_publish` e `instagram_manage_insights`) | Issue no mesmo dia |
| Token do Claude vencendo | Data de criação em `agente/config.json`; checa todo dia | Issue 30 dias antes; issue imediata se der 401 |
| Limite do Pro estourado | Erro de limite do SDK → tenta de novo no próximo horário; 2 falhas → modo reserva | Issue só se a peça do dia não tiver reserva |
| Teto de uso semanal | Soma do `total_cost_usd` equivalente por semana; 80% = econômico, 100% = só publica o que já está pronto | Issue ao bater 100% |
| Container com erro ou expirado | Polling a cada minuto por até 5 min na imagem (recomendação da Meta) e até 10 min no reel; `ERROR` ou `EXPIRED` → recria uma vez | Issue se falhar 2x |
| Limite de publicação | `content_publishing_limit` antes de cada peça | Issue se chegar perto (não deve acontecer: são ~1 a 2 posts por dia) |
| Post duplicado | Pendente gravado antes do `media_publish` + busca no feed pela legenda (já existe) | n/a |
| Retry | Rede ou 5xx: 3 tentativas com espera crescente; 4xx não repete (só registra e avisa) | Issue no 4xx |
| GitHub parado ou workflow desligado | **Heartbeat** no healthchecks.io (grátis, até 20 checagens, e-mail): todo workflow faz ping no fim; sem ping em 26 h = e-mail | E-mail do healthchecks |
| Mídia não pública | `HEAD` na URL raw antes de publicar (já existe) | Issue |
| Edge TTS fora do ar | Cai para o Kokoro sozinho | Só no relatório |

- **Kill switch:** a variável `AGENTE_PAUSADO` do repositório.
  - Pausar: `gh variable set AGENTE_PAUSADO -b true -R mazzi777/mazzi-instagram`. Também dá pelo site: Settings › Variables.
  - Voltar: o mesmo comando com `-b false`.
  - Pausado, nada produz e nada publica (nem reserva), mas o heartbeat continua com o status "pausado", para o silêncio não virar alarme.
  - Também existe `AGENTE_MODO=so_reserva`: publica só o banco reserva, sem usar o Claude.
- **Alertas:** uma issue por tipo de problema. Se já houver uma aberta, ela ganha um comentário (o GitHub manda e-mail nos dois casos). Quando o problema some, o agente comenta "resolvido" e fecha a issue.

---

## 10. Modelo de dados (o git é o banco)

O git é grátis, guarda histórico, é auditável e já é o que o publicador usa. Tudo é JSON validado por schema zod. **Nada com dado pessoal de terceiro entra no repositório**, porque ele é público.

| Arquivo | Conteúdo |
|---|---|
| `agente/config.json` | Modelos, limites, tetos, horários, data do token do Claude, N de regerações (2) |
| `agente/base/produto.json` | Seção 7 |
| `estrategia/estado.json` | Pesos por formato, tema, ramo, tipo de gancho, objetivo e horário, com contagem de amostras |
| `semanas/AAAA-MM-DD/agenda.json` | Formato atual + `horario`, `objetivo`, `ramo`, `ia` (bool), `origem` (`agente` \| `reserva`), `fatos` (ids da base), `alt_text`, `tentativas` |
| `semanas/AAAA-MM-DD/publicado.json` | Existente (só o publicador escreve) |
| `metricas/AAAA-MM.jsonl` | Uma linha por coleta: `{media_id, peca, coletado_em, idade_h, metricas{...}}` + linhas da conta (`profile_links_taps` por botão, `follows_and_unfollows`, `reach`, `views`) |
| `reserva/<id>/` | Mídias + `peca.json` + `usada_em[]` |
| `registro/AAAA-MM-DD.jsonl` | Cada decisão: plano, tentativa, notas G1–G8, motivos, publicação, erro. Sem segredo e sem dado de terceiro. |
| `uso/AAAA-Www.json` | Tokens e `total_cost_usd` equivalente por etapa |
| `relatorios/AAAA-Www.md` | Relatório semanal |

- **Tamanho do repositório:** cerca de 25 MB por semana de mídia, ou ~1,3 GB por ano. O GitHub recomenda manter o repositório abaixo de alguns GB.
  - Medidas: reel com CRF 23 (~6 a 10 MB) e slides em JPEG 92.
  - O relatório mostra o tamanho do repositório. Ao passar de 1 GB, as mídias novas vão para um bucket público no Backblaze B2 (os 10 GB grátis que você já tem). Isso já fica previsto como opção de hospedagem no publicador (`MIDIA_BASE_URL`).

---

## 11. Métricas e ajuste da estratégia

**O que é coletado** (conferido na doc da Meta em 01/11/2026):

- **Feed e carrossel:**
  - `reach`, `views`, `saved`, `shares`, `likes`, `comments`;
  - `profile_visits`, `follows`, `total_interactions`.
- **Reel:**
  - `reach`, `views`, `saved`, `shares`, `likes`, `comments`;
  - `ig_reels_avg_watch_time` e `reels_skip_rate`; este último a Meta marca como "estimado, em desenvolvimento", então entra com peso pequeno.
- **Story:**
  - `reach`, `views`, `replies`, `navigation`;
  - `profile_visits`, `follows`, `link_clicks`.
  - A Meta só guarda as métricas de story por 24 h, por isso a coleta das 20:10. Valor menor que 5 dá erro 10 e é gravado como "<5".
- **Conta** (diário):
  - `profile_links_taps` por `contact_button_type`: é o melhor sinal de "foi para o WhatsApp";
  - `follows_and_unfollows`, `reach`, `views`.
- **Atrasos:** os dados podem atrasar até 48 h. `impressions` foi descontinuado, então usamos `views`.

**Nota de cada post.** É normalizada pela mediana móvel das últimas 8 peças do mesmo formato, para comparar com o próprio perfil e não com números absolutos:

- **conversa (70%):** `profile_visits`, `follows`, `shares` e o `profile_links_taps` do dia, dividido entre os posts do dia;
- **alcance (30%):** `reach`, `views`, `saved` e o tempo médio assistido (no reel).

**Ajuste:**

- Pesos multiplicativos por dimensão (formato, tema, tipo de gancho, horário, ramo), atualizados no sábado.
- Mudança máxima de ±20% por semana, para não reagir a acaso.
- Uma dimensão só muda com ≥ 4 amostras.
- 20% de exploração fixa.
- O que funcionou ganha espaço; o que flopou perde, mas nunca some de vez (piso de 10%).

**Honestidade:** com perfil pequeno o sinal é fraco e muito ruidoso. Nas primeiras 4 a 6 semanas, o agente quase não muda nada além dos horários. O relatório diz isso com todas as letras em vez de inventar tendência.

**Relatório semanal** (`relatorios/AAAA-Www.md`, você lê se quiser e não precisa responder):

- o que saiu e o que foi para a reserva;
- o que reprovou e por quê;
- top 3 e bottom 3 posts;
- o que muda no plano da semana seguinte;
- as funções novas que o agente passou a divulgar;
- o uso do Pro e o tamanho do repositório.

---

## 12. Reels narrados: ferramentas e por quê

| Etapa | Ferramenta | Por quê |
|---|---|---|
| Roteiro | Sonnet 5.5 + prompt com `ig-reel` | Sai em JSON de batidas: `{fala, tela, cartao?, broll?}` com 20 a 45 s. O `beats` (portado) confere: gancho ≤ 3 s, nenhuma batida > 4 s, nada abstrato 3 vezes seguidas. |
| Voz | Edge TTS `pt-BR-AntonioNeural` → Kokoro `pm_alex` → sem narração | Escolha sua. O mapa de pronúncia ("Mazzi" → "Mázi") vale só para o áudio; a legenda mostra "Mazzi". A falha de um motor passa para o próximo sem intervenção. |
| Tempo de cada palavra | whisper.cpp (`small`, pt, CPU) | O Kokoro não dá tempo por palavra em português. O Whisper dá nos dois motores, com um código só. Como sabemos o texto, o Whisper só fornece os **tempos**: as palavras da legenda vêm do roteiro, então erro de transcrição ("Mazi") nunca aparece. Se o alinhamento não fechar (≥ 90% das palavras casadas), o reel reprova. |
| Imagem de apoio | Cartões de interface em código (selo EXEMPLO) + vídeo de banco do **Pexels** (API grátis, vertical, 200 pedidos por hora) | Grátis e com uso comercial liberado. Regras: sem pessoa identificável sugerindo que usa ou recomenda a Mazzi (a licença proíbe insinuar endosso) e crédito "Vídeo: Pexels" no fim da legenda. Imagem gerada por IA fica fora da Fase 1, porque nenhuma opção boa é grátis. |
| Montagem | **Remotion 4** (licença grátis para empresa com até 3 funcionários) | Você já tem o kit da marca nele: fundos, texto cinético, cartões, logo, curvas. Dá legenda palavra a palavra com destaque, ritmo e cortes por código, e renderiza no Linux do Actions. FFmpeg puro com legenda ASS seria mais leve, mas perderia a identidade visual. |
| Acabamento | ffmpeg | `loudnorm` −14 LUFS, H.264 High yuv420p, 30 fps, AAC 48 kHz, `+faststart`, capa JPEG do quadro do gancho. |
| Trilha | Trilha própria (`gen-audio.mjs`) baixinha ou nenhuma | Música de gravadora nunca, porque a API não acessa a biblioteca do Instagram e copyright derruba o post. |

---

## 13. Riscos

| Risco | Chance | Impacto | Mitigação |
|---|---|---|---|
| O agente come o seu limite do Pro | Média | Você fica sem Claude no dia | Roda de madrugada; teto semanal (padrão: o equivalente a US$ 8 por semana); modo econômico; você pode baixar o teto em `config.json` |
| A Anthropic restringe o token da assinatura em automação | Baixa | O cérebro para | O agente cai sozinho em modo reserva; o plano B é uma chave de API (~US$ 10–20/mês) sem mudar código |
| Edge TTS para | Média | Reel com voz pior | Kokoro automático |
| Fato errado no ar | Baixa | Promessa falsa | G1 com base fechada; juiz separado; na dúvida, não posta |
| A Meta acha o perfil "automatizado demais" | Baixa | Alcance menor | Só API oficial; ritmo humano (≤ 1 feed por dia); sem ação em massa; etiqueta de IA correta |
| Conta do Facebook do Matheus com problema | Baixa | A chave da Meta para | Já é uma decisão sua; a checagem diária avisa no mesmo dia |
| Pedido malicioso escondido em issue ou comentário (Fase 2) | Média | O agente faz o que não deve | O agente só lê issues do próprio robô; o comentário é dado, nunca instrução; quem responde não tem ferramenta nenhuma e a resposta passa por G1/G2 |
| Repositório público expõe algo | Baixa | Vazamento | Nada de segredo ou dado de terceiro no git ou no log; teste automático que procura token no log e no diff |
| Repositório grande demais | Certa a longo prazo | Lento | Seção 10 (B2 ao passar de 1 GB) |
| Cron do GitHub atrasa | Certa (minutos) | Post fora do minuto exato | Horários fora da hora cheia; a tolerância é o próprio horário |
| Nota de gancho em pt-BR descalibrada | Média | Reprova bom e aprova fraco | Calibração na Fase 1a, com os números no relatório |
| A Mazzi passa de 3 funcionários | Baixa agora | Licença do Remotion | Avisar; licença de empresa ou trocar para FFmpeg puro |

---

## 14. Custo

**Dinheiro: US$ 0 por mês.**

- GitHub Actions público, Edge TTS, Kokoro, Whisper, Remotion (até 3 funcionários), Pexels e healthchecks.io são grátis.
- O Claude vem da assinatura Pro que você já paga.

**Uso do Pro**, estimado em "equivalente de API" (o Agent SDK devolve `total_cost_usd` em cada chamada; preços Sonnet 5.5 US$ 2/10 e Haiku 5.5 US$ 0,10/0,50 por milhão de tokens):

| Peça | Tokens (entrada / saída, com 1,5 tentativa em média) | Equivalente |
|---|---|---|
| Plano da semana | ~60k / 12k | ~US$ 0,25 |
| Carrossel (texto + 3 juízes + visual de 8 slides) | ~45k / 8k | ~US$ 0,20 |
| Reel (roteiro + juízes + 6 quadros) | ~50k / 10k | ~US$ 0,25 |
| Stories do dia (4 ou 5 quadros) | ~15k / 3k | ~US$ 0,06 |
| Relatório + base + estratégia | ~40k / 8k | ~US$ 0,15 |
| Fase 2: resposta a um comentário | ~6k / 0,5k | ~US$ 0,01 |

- **Por post de feed:** ~US$ 0,20–0,30 equivalente. **Por semana**, com 4 posts de feed e 4 dias de stories: ~US$ 1,5–2,5. **Por mês:** ~US$ 6–10.
- O harness do Claude Code acrescenta contexto próprio. Ele cai bastante com cache e com o prompt de sistema enxuto, mas conto ~2× por segurança: **~US$ 12–20 por mês equivalente**.
- O teto padrão (US$ 8 por semana equivalente) dá folga para isso. Se um dia virar chave de API, esse passa a ser o custo real.
- **Medida real:** o relatório da 1ª semana traz o número medido. Se o Pro apertar, eu baixo o teto e mexo no modelo do redator.

---

## 15. Plano em fases

### Fase 0: preparo (você só faz login, ~15 min; eu guio e faço o resto)

1. **Token do Claude:** você roda `claude setup-token` no seu PC e aprova no navegador. Eu gravo o segredo `CLAUDE_CODE_OAUTH_TOKEN` com `gh secret set` sem mostrar o valor.
2. **Novo token da Meta**, com os escopos de uma vez para não refazer na Fase 2: `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `instagram_manage_comments`, `instagram_manage_messages` e o que a doc pedir para DM. Você entra no Gerenciador de Negócios (conta do Matheus), eu conduzo pelo navegador. O token atual não tem `instagram_manage_insights`, e **sem ele não há métricas**.
3. ~~PAT só de leitura do `aj-clinic`~~ → trocado por uma **deploy key só de leitura** (não vence, só vale para o `aj-clinic` e não precisou de login), no segredo `AJ_CLINIC_DEPLOY_KEY`. Feito em 01/11/2026.
4. Conta grátis no healthchecks.io → segredo `HEARTBEAT_URL`.
5. Chave grátis do Pexels → segredo `PEXELS_KEY`.

### Fase 1: o agente liga a publicação real sozinho

- **1a. Base e checagens:**
  - `produto.json`;
  - porte pt-BR de hookscore, caption, detect e beats, com calibração;
  - G1–G8;
  - testes.
- **1b. Cérebro e feed:**
  - `cerebro.mjs` com teto e tratamento de erro;
  - plano semanal;
  - carrossel, imagem e stories;
  - agenda estendida;
  - publicador com horário, limite e `is_ai_generated`;
  - kill switch e heartbeat.
- **1c. Reels narrados:**
  - TTS (Edge → Kokoro);
  - Whisper;
  - `ReelNarrado` no Remotion;
  - G6/G7 de vídeo;
  - amostras das vozes (Antonio, Kokoro e o teste do Chatterbox).
- **1d. Métricas, estratégia, reserva e relatório.**
- **Corte:**
  1. 1 semana em **modo ensaio**: produz tudo, simula a publicação e não publica;
  2. eu te mostro o ensaio;
  3. desligo a rotina da nuvem e ligo de verdade.
  - **Atenção:** a rotina atual produz a semana de 09/11 amanhã (02/11) e segue até o corte, então não há buraco.
- **Evidência ao fim da fase:**
  - testes passando;
  - os vídeos e slides gerados no ensaio;
  - o log das rotinas;
  - o 1º relatório;
  - revisão do diff contra este SPEC por um subagente (`mazzi-revisor` ou `adversarial-review`).

### Fase 2: comentários e DMs

- **Comentários:**
  - polling a cada 15 min (`GET /{media-id}/comments` dos posts dos últimos 14 dias). A Meta recomenda webhook, mas webhook exige um servidor sempre ligado, então começamos com polling;
  - o Claude classifica: pergunta comum, elogio, reclamação, suporte técnico, reembolso, spam/ofensa, outro;
  - pergunta comum: o redator responde só com a `faq` e as `funcoes` da base, passa por G1/G2/G5 e publica a resposta (`POST /{comment-id}/replies`);
  - reclamação, suporte, reembolso: resposta curta e neutra, "Chama a gente no WhatsApp (link na bio) que a gente resolve por lá";
  - spam e ofensa: não responde (sem apagar nada, como decidido em 30/10);
  - outro: não responde.
- **DMs:**
  - polling das conversas; a doc da Meta exige que o cliente escreva primeiro, e a janela de resposta é de 24 h;
  - **1ª mensagem avisa que é atendimento automático** (a Meta recomenda e algumas leis exigem);
  - mesma triagem dos comentários; suporte, reclamação e reembolso vão para o WhatsApp.
- **Privacidade:** o texto de comentário e DM nunca vai para o git nem para o log. Fica só id, categoria e decisão. O usuário vira hash.
- **A conferir no início da Fase 2:** o endpoint de conversas por polling e o escopo exato de DM no login com Facebook. A página oficial desse fluxo deu 404 hoje; a do login pelo Instagram exige webhook. Se o polling de DM não existir nesse fluxo, a saída grátis é um Cloudflare Worker (plano grátis) que recebe o webhook e acorda o Actions. Eu te digo antes de começar.
- **Evidência:** testes com mocks, log de uma semana de triagem em modo ensaio, revisão por subagente.

### Testes (as duas fases)

- `node --test` com **mocks da API da Meta**: o `fetch` falso é injetado como nos testes atuais. Cenários:
  - container `IN_PROGRESS` → `FINISHED`;
  - `ERROR`;
  - `EXPIRED`;
  - limite estourado;
  - token 190;
  - 5xx com retry;
  - pendente já publicado;
  - insights vazios e erro 10 de story.
- **Mock do cérebro:** respostas gravadas em `agente/testes/fixtures/`. Nenhum teste gasta o Pro.
- **Checagens:** casos que devem passar e que devem reprovar (NFC-e, travessão, número sem EXEMPLO, promessa estética, cliente citado, concorrente).
- **Vídeo:** um reel de 5 s renderizado no CI passa pelo G6. Um vídeo quebrado de propósito precisa reprovar.
- **Semana simulada:** `PUBLICAR_HOJE` + `--simular` de ponta a ponta.
- **Segurança:** o teste procura padrões de token no log e nos arquivos do commit.

---

## 16. O que eu preciso de você

Só os logins da Fase 0. Mais nada no dia a dia.

## 17. Fica decidido por mim (fale se discordar)

- **Hospedagem de mídia:** continua no raw do GitHub, com o B2 ao passar de 1 GB.
- **Horários:** 4 fixos (07:40, 11:40, 18:40, 20:40). Plano no sábado 02:17, produção diária às 03:17.
- **N de regerações:** 2 (3 tentativas no total).
- **Relatório:** fica só no repositório, sem e-mail. Se quiser receber por e-mail toda semana, viro ele numa issue que já nasce fechada.
- **Teto padrão:** o equivalente a US$ 8 por semana do Pro.
