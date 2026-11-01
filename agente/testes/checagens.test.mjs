import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notaGancho, checarGancho } from '../checagens/gancho.mjs';
import { analisarLegenda, checarLegenda } from '../checagens/legenda.mjs';
import { notaHumano, checarHumano, estruturasIa } from '../checagens/humano.mjs';
import { analisarBatidas, checarBatidas } from '../checagens/batidas.mjs';
import { palavrasProibidas, checarNunca } from '../checagens/nunca.mjs';
import { similaridade, ganchosDoLog, checarRepeticao } from '../checagens/repeticao.mjs';
import { palavras, concretos } from '../lib/texto.mjs';

const CTA = 'Chama no WhatsApp (link na bio).';

test('palavras: acento não quebra a palavra e R$ com milhar é uma só', () => {
  assert.deepEqual(palavras('Não perdeu o orçamento'), ['Não', 'perdeu', 'o', 'orçamento']);
  assert.deepEqual(palavras('Custou R$ 1.200 ontem'), ['Custou', 'R$ 1200', 'ontem']);
});

test('concretos: objeto do dia a dia conta, nome próprio no meio da frase conta, início de frase não', () => {
  const c = concretos('Paciente faltou e o WhatsApp ficou sem resposta');
  assert.ok(c.objetos.includes('paciente'));
  assert.ok(c.proprios.includes('WhatsApp'));
  assert.ok(!c.proprios.includes('Paciente'));
});

test('gancho: os ganchos bons já publicados passam como FORTE', () => {
  for (const g of ['Paciente faltou de novo?', 'O caixa não fechou de novo?', 'Visualizou o orçamento e sumiu?',
    'Quantos orçamentos você mandou esse mês que ficaram sem resposta?', 'Caixa cheio no dia 30. Quanto disso é lucro?']) {
    assert.equal(notaGancho(g).veredito, 'FORTE', g);
    assert.equal(checarGancho(g).ok, true, g);
  }
});

test('gancho: cumprimento, preâmbulo, abstração e emoji reprovam', () => {
  for (const g of ['Oi gente, hoje vou mostrar uma novidade', 'Neste vídeo eu vou falar sobre gestão',
    'Soluções inovadoras para o seu negócio crescer', 'Seu negócio. Organizado.', 'Caixa fechou certinho 🎉']) {
    const r = checarGancho(g);
    assert.equal(r.ok, false, g);
    assert.ok(r.motivos.length > 0);
  }
});

test('legenda boa: gancho inteiro antes do "...mais", uma chamada, hashtags no fim', () => {
  const legenda = `Paciente faltou de novo e o horário ficou vazio?\n\nNa Mazzi o lembrete sai pronto para o WhatsApp com um toque.\n\n${CTA}\n\n#clinicadeestetica #harmonizacaofacial`;
  const r = checarLegenda(legenda);
  assert.equal(r.ok, true, r.motivos.join('; '));
  assert.equal(r.detalhe.chamadas.length, 1);
});

test('legenda: primeira linha longa, link, duas chamadas, 4 hashtags e hashtag no topo reprovam', () => {
  const longa = `${'Agenda de papel '.repeat(10)}\n${CTA}`;
  assert.match(checarLegenda(longa).motivos.join(), /primeira linha/);
  assert.match(checarLegenda(`Caixa não fechou?\nVeja em mazzisystems.onrender.com\n${CTA}`).motivos.join(), /links/);
  assert.match(checarLegenda(`Caixa não fechou?\n${CTA} Salva esse post.`).motivos.join(), /chamadas/);
  assert.match(checarLegenda(`Caixa não fechou?\n${CTA}\n#a #b #c #d`).motivos.join(), /hashtags/);
  assert.match(checarLegenda(`#restaurante caixa não fechou?\n${CTA}`).motivos.join(), /primeira linha/);
  assert.match(checarLegenda(`Caixa não fechou?\n${CTA}`.replace('?', '? 😅🔥')).motivos.join(), /emoji/);
});

test('legenda: o "...mais" corta em 125 caracteres', () => {
  const r = analisarLegenda(`${'a'.repeat(200)}\n${CTA}`);
  assert.equal(r.visivel.length, 125);
});

test('humano: texto de gente passa, texto de IA reprova', () => {
  const gente = 'Sabe aquele dia que o caixa não bate? Pois é. Aqui a sangria fica anotada na hora, o troco também. '
    + 'No fim do dia você vê a diferença e de onde ela veio, sem caderno. Tá cansado de recontar nota? Eu também estaria. '
    + 'Chama no WhatsApp que a gente te mostra como fica no seu restaurante, com o seu logo.';
  const ia = 'No mundo de hoje, é fundamental otimizar processos. Nossa solução completa e inovadora vai revolucionar sua gestão. '
    + 'Descubra como potencializar resultados de forma eficiente. Não é só um sistema, é uma jornada de transformação. '
    + 'Eficiência, praticidade e inovação. Tudo em um só lugar, na palma da sua mão.';
  assert.equal(checarHumano(gente).ok, true, checarHumano(gente).motivos.join('; '));
  const r = checarHumano(ia);
  assert.equal(r.ok, false);
  assert.ok(notaHumano(ia).nota < notaHumano(gente).nota);
});

test('humano: travessão, caractere invisível e {{ reprovam mesmo com nota boa', () => {
  assert.match(checarHumano('Caixa fechado — sem diferença.').motivos.join(), /travessão/);
  assert.match(checarHumano('Caixa​ fechado.').motivos.join(), /invisível/);
  assert.match(checarHumano('Olá {{nome}}').motivos.join(), /modelo/);
});

test('humano: estruturas de IA em português são achadas (fronteira de palavra com acento)', () => {
  assert.deepEqual(estruturasIa('Não é só um sistema, é uma jornada.'), ['nao-e-so']);
  assert.deepEqual(estruturasIa('Não apenas organiza a agenda, mas também lembra o paciente.'), ['nao-apenas']);
  assert.ok(estruturasIa('Agenda, caixa e estoque.').includes('trinca'));
  assert.deepEqual(estruturasIa('O caixa fechou certo hoje.'), []);
});

test('humano: texto curto não reprova só por ser curto', () => {
  assert.equal(checarHumano('Me responde aqui nesse story.').ok, true);
});

test('batidas: roteiro bom de ~25 s passa; gancho longo, batida longa e duração fora reprovam', () => {
  const bom = ['O caixa não fechou de novo?', 'A sangria ficou num papel que sumiu.', 'O troco saiu errado e ninguém viu.',
    'Na Mazzi, cada sangria fica anotada na hora.', 'O fechamento mostra a diferença do dia.', 'E de onde ela veio, sem recontar nota.',
    'Pagamento dividido também entra certinho.', 'Funciona no computador e no celular.', 'Com o logo do seu restaurante.',
    'Seu caixa fechando sem mistério.', 'Chama no WhatsApp, link na bio.', 'E o caixa fecha de novo amanhã.'];
  const r = checarBatidas(bom);
  assert.equal(r.ok, true, r.motivos.join('; '));
  assert.match(r.detalhe.notas.join(), /laço/);

  assert.match(checarBatidas(['Hoje eu queria conversar um pouco com você sobre gestão de caixa no restaurante', ...bom.slice(1)]).motivos.join(), /gancho/);
  assert.match(checarBatidas([bom[0], 'Na Mazzi cada sangria fica anotada na hora e o fechamento mostra a diferença e de onde ela veio sem ninguém recontar nota nenhuma', ...bom.slice(2)]).motivos.join(), /passam de/);
  assert.match(checarBatidas(bom.slice(0, 3)).motivos.join(), /abaixo/);
  assert.deepEqual(analisarBatidas([]).falhas, ['roteiro vazio']);
});

test('nunca (palavras): o que é proibido reprova', () => {
  const casos = {
    'Agora com NFC-e no caixa': /NFC-e/,
    'Lembrete automático no WhatsApp': /lembrete automático/,
    'Usado pela AJ Clinic': /cliente/,
    'Teste grátis por 30 dias': /preço/,
    'Gratuito por enquanto': /preço/,
    'Sem desconto nenhum': /preço/,
    'Rejuvenesce 10 anos': /saúde/,
    'Resultado garantido no procedimento': /saúde/,
    'Na eleição do ano que vem': /política/,
    'O melhor sistema do Brasil': /superlativo/,
    'Caixa fechado — sem diferença': /travessão/,
    'O foco aqui é o passo depois do sim.': /bastidor/,
    'Neste post vamos falar de caixa': /bastidor/,
  };
  for (const [texto, esperado] of Object.entries(casos)) {
    assert.match(palavrasProibidas(texto).join(' | '), esperado, texto);
  }
});

test('nunca (palavras): uso normal da língua não é falso positivo', () => {
  for (const t of ['Delivery sem dor de cabeça', 'O preço do quilo muda por dia da semana', 'Procura o lote na ficha',
    'A nota da balança tem código de barras', 'O botão fica à esquerda da tela', 'Prato partido no meio']) {
    assert.deepEqual(palavrasProibidas(t), [], t);
  }
});

test('nunca (juiz): problema do juiz reprova; erro do juiz reprova; sem juiz reprova', async () => {
  const limpo = 'Seu caixa fecha sem mistério. Chama no WhatsApp.';
  assert.equal((await checarNunca(limpo, { juiz: async () => ({ problemas: [] }) })).ok, true);
  const comProblema = await checarNunca(limpo, { juiz: async () => ({ problemas: [{ regra: 1, trecho: 'x', motivo: 'ironiza concorrente' }] }) });
  assert.match(comProblema.motivos.join(), /concorrente/);
  assert.equal((await checarNunca(limpo, { juiz: async () => { throw new Error('timeout'); } })).ok, false);
  assert.equal((await checarNunca(limpo)).ok, false);
});

test('repetição: mesmo gancho com outra pontuação é repetido; tema diferente não', () => {
  assert.ok(similaridade('O caixa não fechou de novo?', 'Caixa nao fechou de novo') >= 0.6);
  assert.ok(similaridade('O caixa não fechou de novo?', 'Paciente faltou de novo?') < 0.6);
  const usados = ganchosDoLog('- 31/10/2026 · PUBLICADO · reel (AV3) · avulso · "O caixa não fechou de novo?" · ids 1\n- 01/08/2026 · x · "Paciente sumiu sem avisar"');
  assert.equal(usados.length, 2);
  assert.equal(checarRepeticao('Caixa não fechou de novo', usados, { hoje: '2026-11-09' }).ok, false);
  assert.equal(checarRepeticao('Paciente sumiu sem avisar', usados, { hoje: '2026-11-09' }).ok, true, 'fora da janela de 6 semanas');
});
