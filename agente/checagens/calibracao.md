# Calibração das notas (G3 gancho e G5 sem cara de IA)

Gerado por `npm run calibrar` em 2026-11-12. Limite em uso: nota >= 70 e nenhum critério < 55.

## G3: gancho

- Ganchos do `guia/log.md` (já publicados, escritos para a marca): 25
- Ganchos ruins de propósito: 20
- **AUC: 0.92** (0,5 = moeda; 1 = separa perfeitamente)
- Com nota >= 70: 15 de 25 bons e 0 de 20 ruins

O log mistura ganchos fortes com frases de abertura que não eram gancho (ex.: chamadas de convite); reprovar parte deles é esperado, e é o que o agente deve evitar daqui para frente.

| Nota | Veredito | Gancho do log |
|---|---|---|
| 95 | FORTE | Não achou o cadastro da Mazzi? Chama no WhatsApp |
| 94 | FORTE | Quantos orçamentos você mandou esse mês que ficaram sem resposta? |
| 87 | FORTE | Você cobra quem não respondeu o orçamento? |
| 85 | FORTE | Esqueceu de trocar o preço do quilo de novo? |
| 85 | FORTE | Caixa que sempre bate: alguém conferiu de verdade? |
| 85 | FORTE | O caixa não fechou de novo? |
| 85 | FORTE | Visualizou o orçamento e sumiu? |
| 84 | FORTE | Foto de paciente no seu WhatsApp pessoal? |
| 82 | FORTE | Agenda, ficha e termo em lugares diferentes? |
| 82 | FORTE | A recepção vê a comissão de todo mundo? |
| 82 | FORTE | Paciente faltou de novo? |
| 82 | FORTE | Caixa cheio no dia 30. Quanto disso é lucro? |
| 81 | FORTE | Seu cliente vê o logo de quem no sistema? |
| 79 | FORTE | Quem devia voltar este mês e ninguém chamou? |
| 79 | FORTE |  e o horário ficou vazio? |
| 63 | OK | Pedido no telefone sem papel e caneta |
| 63 | OK | Pedido de delivery sem papel e caneta. |
| 62 | OK | O que mais te dá dor de cabeça no delivery? |
| 55 | OK | Pra quem chegou agora: o que é a Mazzi? |
| 51 | OK | Agenda no papel e caixa no caderno têm conserto. |
| 49 | FRACO | Cuidar do seu negócio não precisa ser complicado. |
| 33 | FRACO | Seu negócio. Organizado. |
| 30 | FRACO | Postei o passo a passo no feed. |
| 25 | FRACO | me responde aqui |
| 23 | FRACO | Ela disse  |

| Nota | Veredito | Gancho ruim de propósito |
|---|---|---|
| 47 | FRACO | Bom dia! Mais uma semana começando |
| 41 | FRACO | Olha só que legal essa novidade |
| 38 | FRACO | Soluções inovadoras para o seu negócio |
| 38 | FRACO | Transforme sua gestão com tecnologia |
| 38 | FRACO | Um sistema completo para você |
| 38 | FRACO | Seu negócio merece o melhor |
| 38 | FRACO | Leve seu negócio para o próximo nível |
| 34 | FRACO | Você sabia que existe um jeito melhor? |
| 30 | FRACO | Gestão eficiente é fundamental para o sucesso |
| 30 | FRACO | A tecnologia chegou para ficar |
| 30 | FRACO | Descubra o poder da organização |
| 28 | FRACO | Eficiência, praticidade e inovação |
| 22 | FRACO | Para de rolar e presta atenção |
| 20 | FRACO | Hoje vamos falar sobre gestão |
| 20 | FRACO | Vamos conversar sobre produtividade hoje |
| 20 | FRACO | Existem muitas formas de organizar uma empresa |
| 20 | FRACO | Isso é muito importante para todos |
| 19 | FRACO | Oi gente, tudo bem com vocês? |
| 17 | FRACO | Bem-vindo ao nosso perfil! |
| 13 | FRACO | Neste vídeo eu vou te mostrar uma coisa |

## G5: sem cara de IA

- Textos humanos (respostas do FAQ e fatos da base, escritos à mão): 29; notas de 62 a 100
- Textos com cara de IA: 5; notas 26, 32, 31, 21, 25
- **AUC: 1.00**
- Com nota >= 70: 24 de 29 humanos e 0 de 5 de IA

Os humanos que ficam abaixo de 70 são fatos da base escritos como descrição de catálogo, sem falar com ninguém (critério VOZ). Numa legenda isso é defeito de verdade, então o limite fica: legenda tem que falar com a pessoa.

## Limite do que isto mede

O autor do hookscore original avisa: a nota separa gancho bom de gancho ruim, mas não prevê qual de dois bons vai melhor. Aqui ela é piso de qualidade; quem escolhe entre ganchos bons são as métricas (seção 11 do SPEC).

## G9b: editor (revisão final), ensaio de 12/11/2026

Primeiro ensaio real (Actions, pauta da semana de 09/11, regra antiga: nota >= 7 em todos os 5 critérios). Notas do editor nas 4 avaliações que chegaram a ele:

| Peça | original | humano | marca | novidade | clareza | Motivo principal |
|---|---|---|---|---|---|---|
| A carrossel | 7 | 7 | 7 | 6 | 7 | capa de texto grande igual às últimas |
| S1 stories | 7 | 7 | 8 | 7 | 7 | aprovada |
| S2 stories | 7 | 7 | 8 | 6 | 7 | de novo abre só com texto |
| C imagem | 6 | 6 | 8 | 7 | 8 | pergunta retórica e erro de concordância ("falta 30 dias") |

- O editor usa uma faixa estreita (6 a 8). Exigir 7 em tudo reprovou 3 de 4, quase sempre por um único 6 em "novidade".
- O que ele aponta é real: capa repetida no grid e erro de português que o juiz visual deixou passar.
- **Regra nova:** reprova se algum critério < 5 ou se 2 ou mais critérios < 7. Com ela, A e S2 passariam (um 6 só) e C reprovaria (dois 6, com o erro de concordância). A capa repetida, que era o motivo de A e S2, passou a ser cobrada pelo código (família da capa, G9a), antes de gastar o juiz.
- Prompt: régua explícita (5 morno, 7 bom, 9 ótimo) e sem "prefira reprovar".
- Rever com mais dados: o relatório semanal traz as notas do editor no registro (`editor_*`).

### Ajuste depois dos ensaios 5 a 7 e do ig-revisor (12/11/2026)

- Pisos por critério: clareza, humano e novidade >= 6 (os outros >= 5); no máximo 1 critério abaixo de 7.
- O ig-revisor reprovou duas peças que o editor tinha deixado passar com 6: um story que repetia o ÂNGULO ("o documento que some") com outro tema, e uma imagem com a legenda contando outra história. A régua do prompt agora diz que ângulo repetido vale 5 ou menos em novidade e legenda que contradiz a tela vale 4 ou menos em clareza.
