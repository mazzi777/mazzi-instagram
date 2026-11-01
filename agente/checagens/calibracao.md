# Calibração das notas (G3 gancho e G5 sem cara de IA)

Gerado por `npm run calibrar` em 2026-11-01. Limite em uso: nota >= 70 e nenhum critério < 55.

## G3: gancho

- Ganchos do `guia/log.md` (já publicados, escritos para a marca): 15
- Ganchos ruins de propósito: 20
- **AUC: 0.90** (0,5 = moeda; 1 = separa perfeitamente)
- Com nota >= 70: 6 de 15 bons e 0 de 20 ruins

O log mistura ganchos fortes com frases de abertura que não eram gancho (ex.: chamadas de convite); reprovar parte deles é esperado, e é o que o agente deve evitar daqui para frente.

| Nota | Veredito | Gancho do log |
|---|---|---|
| 94 | FORTE | Quantos orçamentos você mandou esse mês que ficaram sem resposta? |
| 87 | FORTE | Você cobra quem não respondeu o orçamento? |
| 85 | FORTE | O caixa não fechou de novo? |
| 85 | FORTE | Visualizou o orçamento e sumiu? |
| 82 | FORTE | Paciente faltou de novo? |
| 82 | FORTE | Caixa cheio no dia 30. Quanto disso é lucro? |
| 63 | OK | Pedido no telefone sem papel e caneta |
| 63 | OK | Pedido de delivery sem papel e caneta. |
| 62 | OK | O que mais te dá dor de cabeça no delivery? |
| 55 | OK | Pra quem chegou agora: o que é a Mazzi? |
| 51 | OK | Agenda no papel e caixa no caderno têm conserto. |
| 49 | FRACO | Cuidar do seu negócio não precisa ser complicado. |
| 33 | FRACO | Seu negócio. Organizado. |
| 30 | FRACO | Postei o passo a passo no feed. |
| 25 | FRACO | me responde aqui |

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
