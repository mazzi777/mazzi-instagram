// Calibração de G3 (gancho) e G5 (sem cara de IA): mede se as notas separam o bom do ruim de propósito
// e grava o resultado em agente/checagens/calibracao.md. Rodar de novo quando o log tiver mais ganchos:
//   npm run calibrar
import { readFileSync, writeFileSync } from 'node:fs';
import { notaGancho } from './gancho.mjs';
import { notaHumano } from './humano.mjs';
import { ganchosDoLog } from './repeticao.mjs';
import { lerProduto } from './fatos.mjs';

const raiz = new URL('../../', import.meta.url);

// Ganchos escritos ruins de propósito: cumprimento, preâmbulo, abstração, palavra de IA, sem nada concreto.
export const GANCHOS_RUINS = [
  'Oi gente, tudo bem com vocês?', 'Neste vídeo eu vou te mostrar uma coisa', 'Hoje vamos falar sobre gestão',
  'Soluções inovadoras para o seu negócio', 'Transforme sua gestão com tecnologia', 'Você sabia que existe um jeito melhor?',
  'Olha só que legal essa novidade', 'Bem-vindo ao nosso perfil!', 'Gestão eficiente é fundamental para o sucesso',
  'A tecnologia chegou para ficar', 'Descubra o poder da organização', 'Um sistema completo para você',
  'Seu negócio merece o melhor', 'Vamos conversar sobre produtividade hoje', 'Existem muitas formas de organizar uma empresa',
  'Para de rolar e presta atenção', 'Isso é muito importante para todos', 'Eficiência, praticidade e inovação',
  'Bom dia! Mais uma semana começando', 'Leve seu negócio para o próximo nível',
];

// Textos com cara de IA para G5 (o oposto do tom da marca).
export const TEXTOS_IA = [
  'No mundo de hoje, a gestão eficiente é fundamental para o sucesso de qualquer negócio. Nossa solução completa oferece ferramentas inovadoras que vão revolucionar a forma como você trabalha. Descubra como potencializar seus resultados e levar seu negócio ao próximo nível.',
  'É importante ressaltar que a organização é essencial. Com a nossa plataforma robusta e intuitiva, você otimiza processos, maximiza a produtividade e transforma a experiência dos seus clientes. Tudo em um só lugar, na palma da sua mão.',
  'Não é só um sistema, é uma verdadeira jornada de transformação. Imagine poder gerenciar tudo de forma simples e rápida. Agenda, financeiro e estoque. Chegou a hora de dar adeus às planilhas e abraçar a inovação.',
  'Em suma, a tecnologia faz toda a diferença. Seja para clínicas, seja para restaurantes, nossa ferramenta é a chave para uma gestão de excelência. Mais do que nunca, é crucial investir em eficiência e foco no que realmente importa.',
  'Você está pronto para elevar sua gestão? Nossa plataforma inovadora une praticidade, eficiência e segurança. Explore todas as funcionalidades e desbloqueie o potencial máximo do seu negócio com uma experiência única e personalizada.',
];

/** Área sob a curva: chance de um bom ter nota maior que um ruim (0,5 = moeda, 1 = perfeito). */
export function auc(bons, ruins) {
  let soma = 0;
  for (const b of bons) for (const r of ruins) soma += b > r ? 1 : b === r ? 0.5 : 0;
  return soma / (bons.length * ruins.length);
}

function separacao(bons, ruins, limite) {
  return { bonsPassam: bons.filter((n) => n >= limite).length, ruinsPassam: ruins.filter((n) => n >= limite).length };
}

export function calibrar() {
  const log = readFileSync(new URL('guia/log.md', raiz), 'utf8');
  const bons = [...new Set(ganchosDoLog(log).map((g) => g.gancho))];
  const g = (lista) => lista.map((t) => ({ t, ...notaGancho(t) }));
  const gb = g(bons);
  const gr = g(GANCHOS_RUINS);

  const produto = lerProduto();
  const textosHumanos = produto.faq.map((f) => f.resposta).concat(produto.funcoes.filter((f) => f.fato).map((f) => f.fato));
  const hb = textosHumanos.map((t) => notaHumano(t).nota);
  const hr = TEXTOS_IA.map((t) => notaHumano(t).nota);

  return {
    gancho: { bons: gb, ruins: gr, auc: auc(gb.map((x) => x.nota), gr.map((x) => x.nota)), em70: separacao(gb.map((x) => x.nota), gr.map((x) => x.nota), 70) },
    humano: { bons: hb, ruins: hr, auc: auc(hb, hr), em70: separacao(hb, hr, 70) },
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const r = calibrar();
  const linha = (x) => `| ${x.nota} | ${x.veredito} | ${x.t} |`;
  const md = `# Calibração das notas (G3 gancho e G5 sem cara de IA)

Gerado por \`npm run calibrar\` em ${new Date().toISOString().slice(0, 10)}. Limite em uso: nota >= 70 e nenhum critério < 55.

## G3: gancho

- Ganchos do \`guia/log.md\` (já publicados, escritos para a marca): ${r.gancho.bons.length}
- Ganchos ruins de propósito: ${r.gancho.ruins.length}
- **AUC: ${r.gancho.auc.toFixed(2)}** (0,5 = moeda; 1 = separa perfeitamente)
- Com nota >= 70: ${r.gancho.em70.bonsPassam} de ${r.gancho.bons.length} bons e ${r.gancho.em70.ruinsPassam} de ${r.gancho.ruins.length} ruins

O log mistura ganchos fortes com frases de abertura que não eram gancho (ex.: chamadas de convite); reprovar parte deles é esperado, e é o que o agente deve evitar daqui para frente.

| Nota | Veredito | Gancho do log |
|---|---|---|
${r.gancho.bons.sort((a, b) => b.nota - a.nota).map(linha).join('\n')}

| Nota | Veredito | Gancho ruim de propósito |
|---|---|---|
${r.gancho.ruins.sort((a, b) => b.nota - a.nota).map(linha).join('\n')}

## G5: sem cara de IA

- Textos humanos (respostas do FAQ e fatos da base, escritos à mão): ${r.humano.bons.length}; notas de ${Math.min(...r.humano.bons)} a ${Math.max(...r.humano.bons)}
- Textos com cara de IA: ${r.humano.ruins.length}; notas ${r.humano.ruins.join(', ')}
- **AUC: ${r.humano.auc.toFixed(2)}**
- Com nota >= 70: ${r.humano.em70.bonsPassam} de ${r.humano.bons.length} humanos e ${r.humano.em70.ruinsPassam} de ${r.humano.ruins.length} de IA

Os humanos que ficam abaixo de 70 são fatos da base escritos como descrição de catálogo, sem falar com ninguém (critério VOZ). Numa legenda isso é defeito de verdade, então o limite fica: legenda tem que falar com a pessoa.

## Limite do que isto mede

O autor do hookscore original avisa: a nota separa gancho bom de gancho ruim, mas não prevê qual de dois bons vai melhor. Aqui ela é piso de qualidade; quem escolhe entre ganchos bons são as métricas (seção 11 do SPEC).
`;
  writeFileSync(new URL('calibracao.md', import.meta.url), md);
  console.log(`gancho: AUC ${r.gancho.auc.toFixed(2)}, bons >=70: ${r.gancho.em70.bonsPassam}/${r.gancho.bons.length}, ruins >=70: ${r.gancho.em70.ruinsPassam}/${r.gancho.ruins.length}`);
  console.log(`humano: AUC ${r.humano.auc.toFixed(2)}, humanos >=70: ${r.humano.em70.bonsPassam}/${r.humano.bons.length}, IA >=70: ${r.humano.em70.ruinsPassam}/${r.humano.ruins.length}`);
}
