# Plano de implementação: agente autônomo do Instagram (Fase 0 e Fase 1)

Base: `SPEC.md` (aprovado pela Andressa em 01/11/2026). Cada tarefa entra com teste antes do código (`node --test`). Nenhum teste gasta o Pro nem publica de verdade: a Meta e o cérebro são mocks.

Regras para todas as tarefas:
- Node 22, ESM `.mjs`, no estilo de `publicar/` (comentário curto em português, funções exportadas e testáveis, `fetch`, `esperar` e `agora` injetados).
- Toda saída do Claude passa por schema zod antes de ser usada.
- Segredo e texto de terceiro nunca vão para log, registro ou commit.
- Ao fim de cada bloco: `node --test` verde + commit. O push em `main` só acontece quando o bloco não muda o que vai ao ar (ou depois do ensaio).

## Fase 0: preparo (com a Andressa)

| # | Tarefa | Quem | Pronto quando |
|---|---|---|---|
| 0.1 | Chave só de leitura do `aj-clinic` (deploy key) → segredo `AJ_CLINIC_DEPLOY_KEY` | Clou | ✅ 01/11/2026 (substitui o PAT do SPEC: não vence e não precisa de login) |
| 0.2 | `claude setup-token` → segredo `CLAUDE_CODE_OAUTH_TOKEN`; data em `agente/config.json` | Andressa aprova no navegador | ✅ 01/11/2026, testado (`testar-claude.yml`). Vence ~01/11/2027. |
| 0.3 | Novo token da Meta com os escopos de publicar, insights, comentários e mensagens → `META_TOKEN` | Andressa logada no Gerenciador de Negócios | ✅ 01/11/2026, sem validade, testado (`testar-meta.yml`): 7 permissões + insights e comentários lendo. DM do Instagram não pode ser atribuída a usuário do sistema pelo ativo do Instagram: resolver pela Página na Fase 2. |
| 0.4 | Chave do Pexels → `PEXELS_KEY` | Andressa cria a conta (2 min) | só antes da 1c |
| 0.5 | Vigia do heartbeat: healthchecks.io (conta da Andressa), check "Agente do Instagram", 1 dia + 3 h de tolerância, aviso por e-mail → segredo `HEARTBEAT_URL` | Andressa criou a conta; Clou configurou | ✅ 01/11/2026, 1º sinal recebido |

## Fase 1a: base do produto e checagens ✅ 01/11/2026

Feito: `agente/lib/` (texto pt-BR, schemas), `agente/base/` (produto.json + atualizar.mjs), `agente/checagens/` (gancho, legenda, humano, batidas, nunca, fatos, repeticao, calibrar), 26 testes novos, calibração em `agente/checagens/calibracao.md` (G3 AUC 0,90 com 0 de 20 ruins passando; G5 AUC 1,00). Decisões da Andressa no caminho: nunca falar de preço; clínica inclui odontologia.

1. `agente/lib/schemas.mjs`: schemas zod de `produto.json`, `agenda.json` estendida, `estado.json`, registro e uso. Testes com exemplos válidos e inválidos.
2. `agente/base/produto.json` inicial, a partir de `guia/marca.md` (no ar + NUNCA), do site público e da `faq`. Teste: todo `no_ar` tem `fonte`; nenhum `no_ar` bate com a lista NUNCA.
3. `agente/base/atualizar.mjs`: lê `NOVIDADES.md` e `VERTICALS` (clone raso com a deploy key), gera candidatas e aplica o filtro NUNCA/"homologação". O Claude entra só na extração, e é mockado no teste.
4. Porte pt-BR para `agente/checagens/`:
   - `gancho.mjs` (hookscore);
   - `legenda.mjs` (caption);
   - `humano.mjs` (detect, com a lista pt-BR);
   - `batidas.mjs` (beats, com ~2,6 palavras/s de pt-BR).
   - Testes: casos do original traduzidos + casos da marca.
5. Calibração (`agente/checagens/calibrar.mjs`): ganchos do `guia/log.md` + 20 ganchos ruins de propósito → curva e limite. O resultado vai para `agente/checagens/calibracao.md`. Os limites de G3 e G5 em `config.json` vêm daqui.
6. G1 (fatos: juiz mockado + ligação a ids), G2 (regex do `validar.mjs` reaproveitada + juiz semântico mockado) e G8 (similaridade com o log). Testes de reprovação obrigatórios: NFC-e, lembrete automático, cliente citado, número sem EXEMPLO, promessa estética, concorrente, "grátis para sempre", travessão, `{{`.

## Fase 1b: cérebro, plano e peças de imagem ✅ 01/11/2026

Feito e testado de verdade no GitHub em modo ensaio (`ensaio/`, que o publicador não lê), semana de 16/11:
plano com as regras cobradas, 5 de 7 peças aprovadas, 2 puladas por motivo justo. Uso: ~US$ 1,90 equivalente
nas 5 rodadas de ajuste. Ajustes que o ensaio pediu: juízes com o tom da marca e a base, nota humana calibrada
para frases curtas, limite do Pro para a rodada (não pula), transbordo medido na página, juiz visual com Sonnet,
texto de bastidor barrado, numeração do resumo. O agente segue em ensaio (variável AGENTE_MODO=ensaio) até o corte.


1. `agente/cerebro.mjs`: wrapper do Agent SDK.
   - Configuração: modelo por etapa, ferramentas do Claude Code desligadas, ferramentas nossas por MCP no processo.
   - Saída: JSON por schema.
   - Uso: soma do `total_cost_usd` por semana, com teto, modo econômico e corte.
   - Erros: 401 vira alerta do token, limite vira tentar depois.
   - Testes com um SDK falso.
2. `agente/etapas/planejar.mjs` + regras do plano conferidas por código (seção 6.1 do SPEC). Teste: um plano que viola as regras é rejeitado e pedido de novo.
3. `agente/etapas/escrever.mjs` (carrossel, imagem, stories, legenda, `alt_text`) + laço de regeração com motivos (máx. 2) → reserva → pulada.
4. `agente/imagens/`: modelos HTML (carrossel 1080×1350, story 1080×1920, imagem) com a marca + captura Playwright + G6 (reaproveita `validar.mjs`) + G7 (juiz visual mockado).
5. `agente/orquestrador.mjs`: máquina de estado por peça, retomável, com registro em `registro/*.jsonl`.
6. Publicador:
   - `horario` por peça;
   - `content_publishing_limit` com `quota_total` lido na hora;
   - `is_ai_generated`;
   - `alt_text`;
   - revalidação antes de publicar;
   - kill switch e `AGENTE_MODO=so_reserva`.
   - Testes novos no `publicar.test.mjs` (os atuais continuam passando).
7. Workflows:
   - `agente-semanal.yml` (sáb 02:17), `agente-diario.yml` (03:17);
   - `publicar.yml` com 4 horários;
   - 1º passo de todos: kill switch; último: heartbeat;
   - todos com `concurrency` para não rodarem dois ao mesmo tempo sobre o mesmo git.
8. `guia/marca.md` e `guia/voz.md` atualizados (reel narrado, etiqueta de IA, faixa de frequência).

## Fase 1c: reels narrados ✅ 01/11/2026

Feito e testado no GitHub em ensaio (semana de 23/11): o agente planejou, escreveu, narrou com o Antonio, alinhou a
legenda com o Whisper, montou no Remotion e aprovou um reel de 26,7 s (H.264 1080×1920, AAC 48 kHz, 1,3 MB,
is_ai_generated). Amostras de voz: Antonio e Kokoro geradas; o Chatterbox quebrou na instalação (dependência de
marca d'água) e ficou de fora. Ajustes que o ensaio pediu: "
" escrito como texto, régua do gancho explicada ao
redator, regeração que corrige só o apontado, juiz visual que entende a legenda palavra por palavra, variação
entre frases fora da narração. Falta: a chave do Pexels (vídeo de banco); sem ela o reel sai com fundo grafite.
Guias (`marca.md`/`voz.md`: reel narrado e etiqueta de IA) mudam no corte, para não confundir a rotina atual.


1. `agente/ferramentas/narrar.mjs`: Edge TTS `pt-BR-AntonioNeural` → Kokoro `pm_alex` (Python, cache do pip no Actions) → sem narração; mapa de pronúncia. Teste com motores falsos (falha do 1º cai no 2º).
2. `agente/ferramentas/alinhar.mjs`: whisper.cpp `small` pt (binário e modelo em cache) → tempos casados com o roteiro (≥ 90% ou reprova). Teste com um áudio curto de amostra.
3. `agente/video/`: Remotion `ReelNarrado` (legenda palavra a palavra, cartões EXEMPLO, B-roll Pexels, trilha própria baixa) + ffmpeg final (loudnorm −14, yuv420p, 30 fps, `+faststart`) + capa.
4. G6 de vídeo (ffprobe + loudness + contraste e área segura da legenda) e G7 em 6 quadros. Teste: um reel de 5 s no CI passa; um vídeo quebrado de propósito reprova.
5. Amostras das vozes (Antonio, Kokoro, Chatterbox se rodar em CPU) para a Andressa ouvir, se quiser.

## Fase 1c+: reels em motion graphics ✅ 01/11/2026

Pedido da Andressa depois de ver o 1º reel ("muito parado"): motion editado, a partir dos fixados, de um storyboard
no Claude Design (https://claude.ai/artifact/WTDvw3PCxNh6ekojRVoW6V) e de 7 referências que ela mandou.
Biblioteca de 13 cenas (`agente/video/motion/`), edição em código (cortes na batida, atos de cor, transições,
efeitos), efeitos CC0 da Kenney no repositório, 12 trilhas do Pixabay sem Content ID no repositório PRIVADO
`mazzi777/mazzi-trilhas` (deploy key só de leitura `TRILHAS_DEPLOY_KEY`). Pexels saiu. Reel do ensaio de 23/11
aprovado no GitHub (20,6 s, 5 MB). Render de um reel: ~5 a 6 min.

## Fase 1d: métricas, estratégia, reserva e relatório ✅ código 01/11/2026 (falta a rodada real no GitHub)

1. `agente/metricas.mjs`: coletas D+1/D+3/D+7/D+28 (atrasou até 2 dias: só a idade mais madura), stories às 20:10 (comando `stories`, sem Claude), conta diária com `profile_links_taps` por botão. Erro 10 de story com poucos espectadores vira "<5"; erro de chave ou de permissão para a rodada e vira issue.
2. `agente/estrategia.mjs`: nota normalizada (70% conversa, 30% alcance) pela mediana das últimas 8 do formato; pesos andam na direção da nota relativa das últimas 8 semanas, ±20% por semana, ≥ 4 amostras, piso de 0,1, uma vez por semana. Com menos de 8 posts medidos o planejador recebe "ainda pouco dado".
3. `agente/reserva.mjs`: banco real em `reserva/` (2 carrosséis/imagens, 2 reels, 2 stories). Antes de usar: base atual, palavras proibidas, valor em reais, arquivos e o validador do publicador; 90 dias entre usos; no ensaio não gasta a vez. O semanal repõe até 2 por semana pelo mesmo laço de qualidade. Sem Claude (limite do plano ou `AGENTE_MODO=so_reserva`), o que é do dia sai do banco; issue só se ficar sem post, se 2 horários seguidos ficarem vazios ou se o banco (depois de cheio) cair abaixo de 3.
4. `agente/relatorio.mjs` → `relatorios/AAAA-Www.md` (7 dias até ontem), gerado no semanal.
5. Testes: `agente/testes/metricas.test.mjs` (21, Meta falsa). Suíte toda: 115.

## Corte ✅ 01/11/2026 (a Andressa pediu para ligar sem a semana de ensaio)

1. Rotina da nuvem `trig_019Eus91BL21EhvWryEQ2Fkc` desligada (não apagada). `AGENTE_MODO` removido: modo real.
2. Revisão adversarial por subagente contra o SPEC. Corrigido antes de ligar: semana alheia (rotina/Windsor) nunca é tocada, semanal nunca planeja semana começada (entrada `semana` para adiantar), métricas sempre com a data real, diário replaneja de sexta a domingo se o semanal falhou, G8 dentro da rodada, publicador não publica peça com função fora do ar, seção "em homologação" barra a função, heartbeat só depois de guardar.
3. Campos novos testados na Meta sem publicar (`testar-parametros.yml`): `alt_text`, `is_ai_generated` e `content_publishing_limit` (cota 100/24 h) aceitos. A etiqueta de IA só dá para confirmar no 1º reel publicado.
4. Semana 09/11 produzida em modo real: 6 peças do agente aprovadas + reel B do banco reserva (o reel original reprovou 3x no juiz de fatos). Achado na conferência: a legenda do reel grudava palavras ("Tácobrada?O") → corrigido, e o juiz visual ganhou a regra.
5. Pendências menores da revisão, feitas no mesmo dia: o diário confere de novo as peças dos próximos 3 dias (mídia sumida ou função fora do ar → refaz), sobras de tentativa reprovada são apagadas, o publicador solta no máximo 1 post de feed por dia, limite do Pro no semanal não vira issue (o diário continua), conferência semanal das permissões da chave da Meta, issue fecha sozinha com "resolvido" quando a rodada seguinte passa, e o agente avisa se o publicador ficar mais de 30 h sem rodar (um vigia só no healthchecks). `AGENTE_MODO=so_reserva` não é freio do publicador: para parar tudo, `AGENTE_PAUSADO=true`.
