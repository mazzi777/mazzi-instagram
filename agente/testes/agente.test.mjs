// Cérebro, plano e orquestrador com o Claude e a captura falsos (nenhum teste gasta a assinatura).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { criarCerebro, semanaIso, schemaParaClaude, ErroTeto, ErroToken, ErroLimite } from '../cerebro.mjs';
import { regrasDoPlano, idsDoPlano, planejarSemana } from '../etapas/planejar.mjs';
import { textoDaPeca, checarTexto } from '../etapas/escrever.mjs';
import { produzirPeca, produzirPendentes, criarRegistro, gravarNaAgenda } from '../orquestrador.mjs';
import { segundaSeguinte, segundaDa, avisosDeToken } from '../agente.mjs';
import { lerProduto } from '../checagens/fatos.mjs';
import { htmlSlide, htmlStory } from '../imagens/modelos.mjs';
import { checarDirecao, escolherFundos } from '../checagens/direcao.mjs';
import { checarRevisao } from '../checagens/editor.mjs';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const config = JSON.parse(readFileSync(path.join(RAIZ, 'agente', 'config.json'), 'utf8'));
const produto = lerProduto();
const SEMANA = '2026-11-16';
const tmp = () => mkdtempSync(path.join(tmpdir(), 'mazzi-agente-'));

function jpeg(largura, altura) {
  const b = Buffer.alloc(21);
  b.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  b.writeUInt16BE(altura, 7);
  b.writeUInt16BE(largura, 9);
  b.set([0xff, 0xd9], 19);
  return b;
}
const capturaFalsa = async (paginas) => paginas.map((p) => {
  mkdirSync(path.dirname(p.arquivo), { recursive: true });
  writeFileSync(p.arquivo, p.formato === 'story' ? jpeg(1080, 1920) : jpeg(1080, 1350));
  return p.arquivo;
});

// ---------- cérebro ----------

test('semana ISO', () => {
  assert.equal(semanaIso(new Date('2026-11-01T12:00:00Z')), '2026-W44');
  assert.equal(semanaIso(new Date('2026-11-02T12:00:00Z')), '2026-W45');
  assert.equal(semanaIso(new Date('2027-01-01T12:00:00Z')), '2026-W53');
});

test('cérebro: schema vai em draft-07 sem $schema (o Claude Code recusa o draft 2020-12)', () => {
  const j = schemaParaClaude(z.object({ a: z.string() }));
  assert.equal(j.$schema, undefined);
  assert.equal(j.type, 'object');
});

test('cérebro: valida a resposta, anota o uso e corta no teto', async () => {
  const saida = tmp();
  let chamadas = 0;
  const consultar = async (q) => { chamadas++; assert.equal(q.schemaJson.type, 'object'); return { ok: true, saida: { n: 1 }, custo: 3, entrada: 100, saidaTokens: 10 }; };
  const c = criarCerebro({ raiz: saida, config: { ...config, uso: { tetoSemanalUsd: 5, economicoEm: 0.5 } }, consultar, agora: () => new Date('2026-11-03T10:00:00Z') });
  const schema = z.object({ n: z.number() });
  assert.deepEqual(await c.pedir({ etapa: 'x', modelo: 'm', sistema: 's', prompt: 'p', schema }), { n: 1 });
  assert.equal(c.economico(), true);
  await c.pedir({ etapa: 'x', modelo: 'm', sistema: 's', prompt: 'p', schema });
  await assert.rejects(c.pedir({ etapa: 'x', modelo: 'm', sistema: 's', prompt: 'p', schema }), ErroTeto);
  assert.equal(chamadas, 2);
  const uso = JSON.parse(readFileSync(path.join(saida, 'uso', '2026-W45.json'), 'utf8'));
  assert.equal(uso.chamadas.length, 2);
});

test('cérebro: resposta fora do schema é erro; login e limite viram erros próprios', async () => {
  const pedir = (r) => criarCerebro({ raiz: tmp(), config, consultar: async () => r }).pedir({ etapa: 'x', modelo: 'm', sistema: 's', prompt: 'p', schema: z.object({ n: z.number() }) });
  await assert.rejects(pedir({ ok: true, saida: { n: 'um' }, custo: 0 }), /inválido/);
  await assert.rejects(pedir({ ok: false, erro: 'error_during_execution: 401 Invalid bearer token', custo: 0 }), ErroToken);
  await assert.rejects(pedir({ ok: false, erro: "You've hit your usage limit", custo: 0 }), ErroLimite);
});

// ---------- plano ----------

const itemPlano = (dia, tipo, extra = {}) => ({ dia, horario: tipo === 'stories' ? '07:40' : '11:40', tipo, ramo: 'clinica', objetivo: 'conversa', conteudo: 'dor', tema: `tema ${dia} ${tipo}`, angulo: 'um ângulo concreto qualquer', fatos: ['clin.agenda'], exploracao: false, ...extra });
const planoBom = () => ({
  porque: 'teste',
  pecas: [
    itemPlano('2026-11-16', 'carrossel'), itemPlano('2026-11-16', 'stories'),
    itemPlano('2026-11-18', 'imagem', { ramo: 'restaurante', fatos: ['rest.caixa'], objetivo: 'alcance' }), itemPlano('2026-11-18', 'stories'),
    itemPlano('2026-11-20', 'carrossel', { ramo: 'restaurante', fatos: ['rest.delivery.teclado'] }), itemPlano('2026-11-20', 'stories'),
  ],
});
const formatos = ['carrossel', 'imagem', 'stories'];

test('plano: o plano bom passa; ids saem em ordem', () => {
  assert.deepEqual(regrasDoPlano(planoBom(), { semana: SEMANA, config, produto, formatos }), []);
  assert.deepEqual(idsDoPlano(planoBom()).map((p) => p.id), ['S1', 'A', 'S2', 'B', 'S3', 'C']);
});

test('plano: regras quebradas viram motivos', () => {
  const p = planoBom();
  p.pecas.push(itemPlano('2026-11-16', 'imagem'), itemPlano('2026-11-25', 'reel', { fatos: ['fiscal.nfce'] }));
  const m = regrasDoPlano(p, { semana: SEMANA, config, produto, formatos }).join('\n');
  assert.match(m, /2 posts de feed no dia 2026-11-16/);
  assert.match(m, /reel ainda não está ligado/);
  assert.match(m, /fora do período/);
  assert.match(m, /fiscal\.nfce/);
});

test('plano: recusado volta com os motivos e passa na 2ª tentativa', async () => {
  const prompts = [];
  let n = 0;
  const cerebro = { pedir: async ({ prompt }) => { prompts.push(prompt); return n++ ? planoBom() : { ...planoBom(), pecas: planoBom().pecas.slice(0, 4) }; } };
  const r = await planejarSemana({ raiz: RAIZ, semana: SEMANA, config, produto, cerebro, formatos });
  assert.equal(r.tentativas, 2);
  assert.match(prompts[1], /RECUSADO/);
});

// ---------- texto e orquestrador ----------

const carrosselBom = {
  gancho: 'Paciente faltou de novo?',
  slides: [
    { tipo: 'capa', layout: 'bilhete', anotacoes: [{ texto: 'ligar pra Ana' }, { texto: 'confirmou?', riscado: true }], titulo: 'Paciente faltou de novo?', destaque: 'de novo?', texto: 'O horário vazio custa caro pra clínica.' },
    { tipo: 'estaca', layout: 'manchete', titulo: 'Horário vazio não volta', texto: 'Quem falta sem avisar deixa a agenda furada.' },
    { tipo: 'ideia', layout: 'passo', passo: 1, titulo: 'Lembrete com um toque', texto: 'Sai pronto pro WhatsApp com nome, dia e horário.', cartao: { titulo: 'amanhã', linhas: [{ rotulo: 'Consulta 14h', selo: 'Confirmou', tom: 'ok' }] } },
    { tipo: 'resumo', layout: 'lista', titulo: 'Resumo', itens: ['Mande o lembrete na véspera', 'Veja quem confirmou', 'Remarque quem pediu'] },
    { tipo: 'chamada', layout: 'chamada', titulo: 'Quer ver na sua agenda?', texto: 'Chama no WhatsApp, link na bio.' },
  ],
  legenda: 'Paciente faltou de novo?\n\nNa Mazzi o lembrete sai pronto pro WhatsApp com um toque, já com nome, dia e horário. Você vê quem confirmou.\n\nChama no WhatsApp (link na bio).\n\n#clinicadeestetica',
  alt_text: 'Capa escura com o texto: Paciente faltou de novo?',
};
const item = { id: 'A', dia: SEMANA, horario: '11:40', tipo: 'carrossel', ramo: 'clinica', objetivo: 'conversa', conteudo: 'dor', tema: 'paciente que falta', angulo: 'a véspera', fatos: ['clin.lembrete-1-clique'] };

test('texto da peça marca os cartões como EXEMPLO para o juiz', () => {
  assert.match(textoDaPeca('carrossel', carrosselBom), /\[CARTÃO EXEMPLO "amanhã": Consulta 14h = Confirmou\]/);
  assert.match(textoDaPeca('carrossel', carrosselBom), /LEGENDA:/);
});

test('checarTexto: peça boa passa com juízes limpos; fato inventado reprova', async () => {
  const juizMarca = async () => ({ problemas: [] });
  const juizFatos = async () => ({ afirmacoes: [{ trecho: 'lembrete', tipo: 'funcao', funcao_id: 'clin.lembrete-1-clique', em_exemplo: false }] });
  const ok = await checarTexto({ item, conteudo: carrosselBom, produto, juizFatos, juizMarca, usados: [], hoje: '2026-11-14', config });
  assert.equal(ok.ok, true, ok.motivos.join('; '));
  assert.deepEqual(ok.fatos, ['clin.lembrete-1-clique']);
  const ruim = await checarTexto({ item, conteudo: carrosselBom, produto, juizMarca, juizFatos: async () => ({ afirmacoes: [{ trecho: 'emite NFC-e', tipo: 'funcao', funcao_id: null, em_exemplo: false }] }), usados: [], hoje: '2026-11-14', config });
  assert.equal(ruim.ok, false);
});

const EDITOR_OK = () => ({ notas: { original: 8, humano: 8, marca: 9, novidade: 8, clareza: 9 }, cfm: [], sugestoes: [] });
function cerebroFalso({ conteudos, visual = () => ({ problemas: [] }), fatos = () => ({ afirmacoes: [] }), editor = EDITOR_OK }) {
  let n = 0;
  const pedidos = [];
  return {
    pedidos,
    economico: () => false,
    pedir: async (q) => { pedidos.push(q); return conteudos[Math.min(n++, conteudos.length - 1)]; },
    // G7 e G9b são uma chamada só (juiz:visual): checklist de imagem + notas do editor.
    juiz: (_schema, etapa) => async () => (etapa === 'juiz:visual' ? { ...editor(), ...visual() } : etapa === 'juiz:fatos' ? fatos() : { problemas: [] }),
  };
}

test('orquestrador: peça boa é aprovada, vira entrada da agenda e passa no validador do publicador', async () => {
  const saida = tmp();
  const registrar = criarRegistro(saida);
  const cerebro = cerebroFalso({ conteudos: [carrosselBom] });
  const r = await produzirPeca(item, { raiz: RAIZ, saida, semana: SEMANA, produto, config, cerebro, usados: [], hoje: '2026-11-14', registrar, capturar: capturaFalsa });
  assert.equal(r.status, 'aprovada');
  assert.equal(r.entrada.arquivos.length, 5);
  assert.equal(r.entrada.ia, false);
  assert.equal(r.entrada.horario, '11:40');
  const reg = readdirSync(path.join(saida, 'registro'));
  assert.equal(reg.length, 1);
});

test('orquestrador: reprovou, regera com os motivos; esgotou sem reserva, pula (na dúvida, não posta)', async () => {
  const saida = tmp();
  const ruim = { ...carrosselBom, gancho: 'Soluções inovadoras para o seu negócio', legenda: `Soluções inovadoras para o seu negócio\n\n${carrosselBom.legenda}` };
  const cerebro = cerebroFalso({ conteudos: [ruim, ruim, ruim] });
  const r = await produzirPeca(item, { raiz: RAIZ, saida, semana: SEMANA, produto, config, cerebro, usados: [], hoje: '2026-11-14', registrar: criarRegistro(saida), capturar: capturaFalsa });
  assert.equal(r.status, 'pulada');
  assert.equal(cerebro.pedidos.length, 3);
  assert.match(cerebro.pedidos[1].prompt, /REPROVADA/);
  assert.match(cerebro.pedidos[1].prompt, /SUA VERSÃO ANTERIOR/, 'a versão reprovada volta para corrigir só o apontado');
  assert.equal(existsSync(path.join(saida, 'semanas', SEMANA, `${SEMANA}-A-01.jpg`)), false, 'não deixa imagem de peça reprovada');
});

test('orquestrador: problema visual reprova e a 2ª tentativa passa; com reserva, usa a reserva', async () => {
  const saida = tmp();
  let v = 0;
  const cerebro = cerebroFalso({ conteudos: [carrosselBom], visual: () => (v++ ? { problemas: [] } : { problemas: [{ imagem: 2, problema: 'texto cortado' }] }) });
  const r = await produzirPeca(item, { raiz: RAIZ, saida, semana: SEMANA, produto, config, cerebro, usados: [], hoje: '2026-11-14', registrar: criarRegistro(saida), capturar: capturaFalsa });
  assert.equal(r.status, 'aprovada');
  assert.equal(r.entrada.tentativas, 2);

  const reserva = { pegar: async () => ({ origemId: 'R1', entrada: { ...r.entrada, id: 'A', origem: 'reserva' } }) };
  const sempreRuim = cerebroFalso({ conteudos: [carrosselBom], visual: () => ({ problemas: [{ imagem: 1, problema: 'quebrado' }] }) });
  const r2 = await produzirPeca(item, { raiz: RAIZ, saida, semana: SEMANA, produto, config, cerebro: sempreRuim, usados: [], hoje: '2026-11-14', registrar: criarRegistro(saida), capturar: capturaFalsa, reserva });
  assert.equal(r2.status, 'reserva');
});

test('orquestrador: produz os pendentes do plano, grava a agenda do agente e para no teto', async () => {
  const saida = tmp();
  const dir = path.join(saida, 'semanas', SEMANA);
  mkdirSync(dir, { recursive: true });
  const plano = { semana: SEMANA, pecas: [item, { ...item, id: 'B', dia: '2026-11-18' }] };
  writeFileSync(path.join(dir, 'plano.json'), JSON.stringify(plano));
  let n = 0;
  const cerebro = { ...cerebroFalso({ conteudos: [carrosselBom] }) };
  const pedirOriginal = cerebro.pedir;
  cerebro.pedir = async (q) => { if (n++ >= 1) throw new ErroTeto('teto'); return pedirOriginal(q); };
  const r = await produzirPendentes({ raiz: RAIZ, saida, semana: SEMANA, produto, config, cerebro, usados: [], hoje: '2026-11-14', registrar: criarRegistro(saida), capturar: capturaFalsa, desde: SEMANA, ate: '2026-11-22' });
  assert.deepEqual(r.feitas, [{ id: 'A', status: 'aprovada' }]);
  assert.ok(r.parou instanceof ErroTeto);
  const agenda = JSON.parse(readFileSync(path.join(dir, 'agenda.json'), 'utf8'));
  assert.equal(agenda.produtor, 'agente');
  assert.deepEqual(agenda.pecas.map((p) => p.id), ['A']);
});

test('orquestrador: limite do plano no meio de uma checagem para a rodada e deixa a peça pendente', async () => {
  const saida = tmp();
  const dir = path.join(saida, 'semanas', SEMANA);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'plano.json'), JSON.stringify({ semana: SEMANA, pecas: [item] }));
  const cerebro = { ...cerebroFalso({ conteudos: [carrosselBom] }), juiz: () => async () => { throw new ErroLimite("You've hit your 5-hour limit"); } };
  const r = await produzirPendentes({ raiz: RAIZ, saida, semana: SEMANA, produto, config, cerebro, usados: [], hoje: '2026-11-14', registrar: criarRegistro(saida), capturar: capturaFalsa, desde: SEMANA, ate: '2026-11-22' });
  assert.ok(r.parou instanceof ErroLimite);
  assert.deepEqual(r.feitas, []);
  const plano = JSON.parse(readFileSync(path.join(dir, 'plano.json'), 'utf8'));
  assert.equal(plano.pecas[0].situacao, undefined, 'fica pendente para a próxima rodada');
});

test('cérebro: erro lançado pelo SDK também é classificado (limite de 5 horas)', async () => {
  const c = criarCerebro({ raiz: tmp(), config, consultar: async () => { throw new Error("Claude Code returned an error result: You've hit your 5-hour limit · resets 4:20pm (UTC)"); } });
  await assert.rejects(c.pedir({ etapa: 'x', modelo: 'm', sistema: 's', prompt: 'p', schema: z.object({}) }), ErroLimite);
});

test('orquestrador: nunca mexe numa agenda da rotina', () => {
  const saida = tmp();
  mkdirSync(path.join(saida, 'semanas', SEMANA), { recursive: true });
  writeFileSync(path.join(saida, 'semanas', SEMANA, 'agenda.json'), JSON.stringify({ semana: SEMANA, pecas: [] }));
  assert.throws(() => gravarNaAgenda(saida, SEMANA, { id: 'A', dia: SEMANA }), /rotina/);
});

// ---------- datas, tokens e modelos ----------

test('datas: segunda seguinte e segunda da semana', () => {
  assert.equal(segundaSeguinte('2026-11-14'), '2026-11-16'); // sábado
  assert.equal(segundaSeguinte('2026-11-16'), '2026-11-23'); // segunda → a próxima
  assert.equal(segundaDa('2026-11-19'), '2026-11-16');
});

test('token do Claude: avisa 30 dias antes de vencer', () => {
  assert.deepEqual(avisosDeToken(config, '2026-11-20'), []);
  assert.match(avisosDeToken(config, '2027-10-10')[0].mensagem, /vence em/);
});

test('modelos: o selo EXEMPLO sai sempre no cartão e o texto é escapado', () => {
  const html = htmlSlide({ tipo: 'ideia', titulo: '<b>x</b>', cartao: { linhas: [{ rotulo: 'a' }] } }, { ramo: 'clinica', numero: 2, total: 5 });
  assert.match(html, /EXEMPLO/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(html, /@mazzisystems/);
  assert.match(htmlStory({ titulo: 'Oi' }, { ramo: 'restaurante' }), /@mazzisystems/);
  const resumo = htmlSlide({ tipo: 'resumo', titulo: 'Resumo', itens: ['1. Abra o caixa', '2) Feche'] }, { ramo: 'restaurante', numero: 5, total: 6 });
  assert.match(resumo, /<span class="caixa"><\/span><span>Abra o caixa<\/span>/);
  assert.match(resumo, /<span class="caixa"><\/span><span>Feche<\/span>/);
  // Todo layout com interface (cartão, conversa) leva o selo; peça sem layout escolhido cai no desenho de antes.
  assert.match(htmlSlide({ tipo: 'ideia', layout: 'conversa', titulo: 'Oi', conversa: [{ lado: 'negocio', texto: 'a' }, { lado: 'cliente', texto: 'b' }] }, { ramo: 'clinica', numero: 2, total: 5 }), /EXEMPLO/);
  assert.match(htmlSlide({ tipo: 'capa', titulo: 'Oi' }, { ramo: 'clinica', numero: 1, total: 5 }), /data-layout="manchete" data-fundo="escuro"/);
});

test('direção de arte (G9a): reprova molde repetido, capa igual às últimas e layout sem o que mostrar', () => {
  const telas = (layouts) => ({ slides: layouts.map((l, i) => ({ tipo: i ? 'ideia' : 'capa', layout: l, titulo: 'Título curto', itens: ['a', 'b', 'c'], passo: 1, cartao: { linhas: [{ rotulo: 'x' }] } })) });
  assert.deepEqual(checarDirecao('carrossel', telas(['pergunta', 'manchete', 'passo', 'lista', 'chamada'])), []);
  const mesmo = checarDirecao('carrossel', telas(['manchete', 'manchete', 'manchete', 'manchete', 'chamada']));
  assert.ok(mesmo.some((m) => /só 2 layouts/.test(m)), mesmo.join('; '));
  assert.ok(mesmo.some((m) => /repetido nos slides 1 e 2/.test(m)));
  const capas = [{ layout: 'pergunta', fundo: 'papel' }, { layout: 'manchete', fundo: 'escuro' }];
  assert.ok(checarDirecao('carrossel', telas(['pergunta', 'manchete', 'passo', 'lista', 'chamada']), { capas }).some((m) => /repete uma das 2 últimas capas/.test(m)));
  assert.ok(checarDirecao('imagem', { layout: 'conversa', titulo: 'Sumiu?' }).some((m) => /sem 2 a 4 mensagens/.test(m)));
  assert.ok(checarDirecao('carrossel', telas(['lista', 'manchete', 'passo', 'pergunta', 'chamada'])).some((m) => /não serve de capa/.test(m)));
  assert.ok(checarDirecao('stories', { quadros: [1, 2, 3, 4].map(() => ({ layout: 'pergunta', titulo: 'Oi' })) }).some((m) => /um layout só/.test(m)));
  assert.ok(checarDirecao('stories', { quadros: ['pergunta', 'manchete', 'frase', 'chamada'].map((layout) => ({ layout, titulo: 'Oi' })) }).some((m) => /nenhum quadro dos stories mostra uma cena/.test(m)));
  // Depois de 2 capas só de texto grande (o molde antigo conta como manchete), a capa precisa mostrar uma cena.
  const texto2 = [{ layout: 'manchete', fundo: 'escuro' }, { layout: 'manchete', fundo: 'escuro' }];
  assert.ok(checarDirecao('carrossel', telas(['pergunta', 'manchete', 'passo', 'lista', 'chamada']), { capas: texto2 }).some((m) => /precisa mostrar uma cena/.test(m)));
  assert.deepEqual(checarDirecao('carrossel', telas(['cartao', 'manchete', 'passo', 'lista', 'chamada']), { capas: texto2 }), []);
  // Fundos: a capa foge das últimas capas, nada 3x seguido, coral no máximo 2x, carrossel com pelo menos 2 fundos.
  const fundos = escolherFundos(['pergunta', 'manchete', 'manchete', 'passo', 'lista', 'frase', 'chamada'].map((layout) => ({ layout })), { capas: [{ fundo: 'papel' }, { fundo: 'coral' }] });
  assert.equal(fundos[0], 'escuro');
  fundos.forEach((f, i) => { if (i >= 2) assert.ok(!(f === fundos[i - 1] && f === fundos[i - 2]), fundos.join(',')); });
  assert.ok(fundos.filter((f) => f === 'coral').length <= 2, fundos.join(','));
  assert.ok(new Set(fundos).size >= 2);
});

test('revisão final (G7 + G9b): calibração das notas, CFM só com trecho real, erro do juiz reprova', async () => {
  const notas = (n) => ({ original: n, humano: n, marca: n, novidade: n, clareza: n });
  const it = { tipo: 'carrossel', ramo: 'clinica', objetivo: 'conversa', tema: 't' };
  const limites = config.checagens.editor;
  const rev = (resposta, extra = {}) => checarRevisao([], { juiz: async () => ({ problemas: [], sugestoes: [], cfm: [], ...resposta }), texto: 'A ficha avisa a alergia. Resultado natural garantido.', item: it, limites, ...extra });
  assert.equal((await rev({ notas: notas(8) })).ok, true);
  // Calibração do ensaio de 12/11: um critério morno (6) passa; dois reprovam; qualquer um abaixo de 5 reprova.
  assert.equal((await rev({ notas: { ...notas(7), novidade: 6 } })).ok, true);
  const dois = await rev({ notas: { ...notas(8), original: 6, humano: 6 }, sugestoes: [{ criterio: 'humano', imagem: 1, motivo: '"falta 30 dias" sem concordância' }] });
  assert.equal(dois.ok, false);
  assert.match(dois.motivos.join('\n'), /editor \(humano 6\/10, imagem 1\): "falta 30 dias"/);
  assert.equal((await rev({ notas: { ...notas(9), original: 4 } })).ok, false);
  // Problema de imagem (G7) reprova sozinho, com nota boa.
  assert.match((await rev({ notas: notas(9), problemas: [{ imagem: 2, problema: 'texto cortado' }] })).motivos[0], /visual \(imagem 2\): texto cortado/);
  // CFM: só trecho que existe no texto; "nenhum problema" e paráfrase não reprovam; restaurante ignora.
  assert.match((await rev({ notas: notas(9), cfm: [{ trecho: 'resultado natural garantido', motivo: 'promessa' }] })).motivos[0], /ética médica \(CFM\)/);
  assert.equal((await rev({ notas: notas(9), cfm: [{ trecho: 'Nenhum problema encontrado', motivo: 'ok' }] })).ok, true);
  assert.equal((await rev({ notas: notas(9), cfm: [{ trecho: 'resultado natural garantido', motivo: 'x' }] }, { item: { ...it, ramo: 'restaurante' } })).ok, true);
  const falhou = await checarRevisao([], { juiz: async () => { throw new Error('timeout'); }, texto: 'x', item: it, limites });
  assert.match(falhou.motivos[0], /na dúvida, não posta/);
});

test('orquestrador: o editor reprova a peça genérica nas 3 tentativas e ela cai no banco reserva', async () => {
  const saida = tmp();
  const generico = () => ({ notas: { original: 3, humano: 5, marca: 8, novidade: 4, clareza: 8 }, cfm: [], sugestoes: [{ criterio: 'original', imagem: 1, motivo: 'poderia ser de qualquer sistema' }] });
  const cerebro = cerebroFalso({ conteudos: [carrosselBom], editor: generico });
  const reserva = { pegar: async () => ({ origemId: 'R9', entrada: { id: 'A', origem: 'reserva' } }) };
  const r = await produzirPeca(item, { raiz: RAIZ, saida, semana: SEMANA, produto, config, cerebro, usados: [], hoje: '2026-11-14', registrar: criarRegistro(saida), capturar: capturaFalsa, reserva, capas: [] });
  assert.equal(r.status, 'reserva');
  assert.equal(cerebro.pedidos.length, 3, 'regera 2 vezes antes de desistir');
  assert.match(cerebro.pedidos[1].prompt, /editor \(original 3\/10/);
  const linhas = readdirSync(path.join(saida, 'registro')).flatMap((f) => readFileSync(path.join(saida, 'registro', f), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
  assert.ok(linhas.some((l) => l.tipo === 'reserva' && /R9/.test(l.detalhe)));
  assert.ok(linhas.some((l) => l.notas?.editor_original === 3), 'as notas do editor ficam no registro');
});

test('orquestrador: a capa repetida reprova antes de renderizar (sem gastar navegador nem juiz)', async () => {
  const saida = tmp();
  let capturas = 0;
  const cerebro = cerebroFalso({ conteudos: [carrosselBom] });
  const r = await produzirPeca(item, { raiz: RAIZ, saida, semana: SEMANA, produto, config, cerebro, usados: [], hoje: '2026-11-14', registrar: criarRegistro(saida), capturar: async (...a) => { capturas++; return capturaFalsa(...a); }, capas: [{ layout: 'bilhete', fundo: 'escuro' }] });
  assert.equal(r.status, 'pulada');
  assert.equal(capturas, 0);
  assert.match(cerebro.pedidos[1].prompt, /repete uma das 2 últimas capas/);
  assert.match(cerebro.pedidos[0].prompt, /últimas capas do feed usaram os layouts: bilhete/);
});

test('diagramação: texto que não cabe é medido na própria página e vira problema (precisa de navegador)', async (t) => {
  const { capturar, paginasDaPeca } = await import('../imagens/capturar.mjs');
  const pasta = tmp();
  const enorme = { titulo: 'Título '.repeat(30), texto: 'Texto muito comprido que não cabe. '.repeat(40), cartao: { linhas: [{ rotulo: 'a' }, { rotulo: 'b' }, { rotulo: 'c' }] } };
  let r;
  try {
    r = await capturar(paginasDaPeca({ semana: SEMANA, id: 'I1', tipo: 'imagem', ramo: 'clinica', conteudo: enorme, pasta }));
  } catch (e) {
    t.skip(`sem navegador para o teste: ${e.message.split('\n')[0]}`);
    return;
  }
  assert.match(r.problemas.join(), /não coube|saiu da área/);
  const ok = await capturar(paginasDaPeca({ semana: SEMANA, id: 'I2', tipo: 'imagem', ramo: 'clinica', conteudo: { titulo: 'Caixa fechou certo?', texto: 'Curto.' }, pasta }));
  assert.deepEqual(ok.problemas, []);
});

test('reserva: prefere a peça cuja capa não repete as 2 últimas do feed, e a de visual novo', async () => {
  const { repeteCapa } = await import('../reserva.mjs');
  const capas = [{ layout: 'manchete', fundo: 'escuro' }, { layout: 'manchete', fundo: 'escuro' }];
  assert.equal(repeteCapa({ tipo: 'carrossel' }, capas), 1, 'peça antiga sem visual = manchete no escuro');
  assert.equal(repeteCapa({ tipo: 'carrossel', visual: { layout: 'conversa', fundo: 'papel' } }, capas), 0);
  assert.equal(repeteCapa({ tipo: 'stories' }, capas), 0, 'stories não entram na regra de capa');
});

test('modelos: a pílula da chamada não repete o pedido que o título já faz', () => {
  const html = (titulo) => htmlSlide({ tipo: 'chamada', layout: 'chamada', titulo }, { ramo: 'clinica', numero: 6, total: 6, objetivo: 'conversa' });
  assert.match(html('Chama no WhatsApp'), /class="pilula">link na bio/);
  assert.doesNotMatch(html('Chama no WhatsApp (link na bio)'), /class="pilula"/);
  const selo = htmlSlide({ tipo: 'ideia', layout: 'cartao', titulo: 'x', cartao: { titulo: 'Exemplo · Agenda', linhas: [{ rotulo: 'a' }] } }, { ramo: 'clinica', numero: 2, total: 5 });
  assert.match(selo, />EXEMPLO · Agenda</);
  assert.doesNotMatch(selo, /EXEMPLO · Exemplo/);
});

test('reserva: gancho repetido das últimas semanas vai para o fim da fila, depois capa repetida', async () => {
  const { ordenarReserva } = await import('../reserva.mjs');
  const it = { ramo: 'clinica' };
  const usados = [{ data: '2026-11-11', gancho: 'O caixa não fechou de novo?' }];
  const capas = [{ layout: 'manchete', fundo: 'escuro' }, { layout: 'manchete', fundo: 'escuro' }];
  const pecas = [
    { rid: 'repete-gancho', tipo: 'carrossel', gancho: 'O caixa não fechou de novo hoje?', visual: { layout: 'conversa', fundo: 'papel' } },
    { rid: 'molde-antigo', tipo: 'carrossel', gancho: 'Paciente sumiu depois do orçamento?' },
    { rid: 'nova', tipo: 'carrossel', gancho: 'Quem confere o troco do motoboy?', visual: { layout: 'bilhete', fundo: 'coral' } },
  ];
  assert.deepEqual(ordenarReserva(pecas, { item: it, capas, usados, hoje: '2026-11-14' }).map((p) => p.rid), ['nova', 'molde-antigo', 'repete-gancho']);
  // Paráfrase que os trigramas do G8 não pegam (achado do ig-revisor): por isso o editor vê o histórico inteiro.
  const { checarRepeticao } = await import('../checagens/repeticao.mjs');
  assert.equal(checarRepeticao('Agenda num lugar, ficha em outro, termo sumiu?', [{ data: '2026-11-11', gancho: 'Agenda, ficha e termo em lugares diferentes?' }], { hoje: '2026-11-14' }).ok, true);
});

test('reel: cenas hub e encaixe e pílulas como variação da lista (referências de 12/11)', async () => {
  const { CONTEUDO, regrasDaEdicao } = await import('../etapas/escrever.mjs');
  const b = (cena) => ({ fala: 'uma fala curta aqui', tela: 'tela curta', cena });
  const batidas = [
    b({ tipo: 'gancho' }),
    b({ tipo: 'hub', modulos: [{ icone: 'Wallet', rotulo: 'Caixa' }, { icone: 'Truck', rotulo: 'Delivery' }, { icone: 'Scale', rotulo: 'Balança' }] }),
    b({ tipo: 'encaixe', pecas: [{ icone: 'Calendar', rotulo: 'Agenda' }, { icone: 'Send', rotulo: 'Orçamento' }] }),
    b({ tipo: 'lista', estilo: 'pilulas', itens: [{ icone: 'Phone', rotulo: 'Telefone puxa' }, { icone: 'Printer', rotulo: 'Via da cozinha' }] }),
    b({ tipo: 'ato' }), b({ tipo: 'cartao', cartao: { linhas: [{ rotulo: 'x' }] } }),
  ];
  assert.equal(CONTEUDO.reel.safeParse({ gancho: 'Caixa não fechou?', batidas, legenda: 'Caixa não fechou? Chama no WhatsApp (link na bio).' }).success, true);
  assert.deepEqual(regrasDaEdicao(batidas), []);
  const muitas = regrasDaEdicao([batidas[0], b({ tipo: 'lista', estilo: 'pilulas', itens: [1, 2, 3, 4].map((k) => ({ icone: 'Phone', rotulo: `item ${k}` })) }), ...batidas.slice(1)]);
  assert.ok(muitas.some((m) => /pílulas com 4 itens/.test(m)));
  const { CENAS, ATO_PADRAO } = await import('../video/motion/cenas.jsx').catch(() => ({ CENAS: null }));
  if (CENAS) { assert.ok(CENAS.hub && CENAS.encaixe); assert.ok(ATO_PADRAO.hub && ATO_PADRAO.encaixe); }
});

test('achados do ig-revisor no ensaio final: dinheiro fora do EXEMPLO, story sem "link na bio", selo duplicado, reserva repetindo tema', async () => {
  // 1) valor solto no caderno reprova na direção de arte (cartão EXEMPLO pode)
  const bilhete = { layout: 'bilhete', titulo: 'Caixa no caderno', anotacoes: [{ texto: 'sobrou R$ 50?', riscado: true }, { texto: 'fechou?' }] };
  assert.ok(checarDirecao('stories', { quadros: [bilhete, { layout: 'cartao', titulo: 'x', cartao: { linhas: [{ rotulo: 'Diferença', selo: 'R$ 20' }] } }] }).some((m) => /valor em dinheiro fora de cartão EXEMPLO/.test(m)));
  assert.ok(!checarDirecao('stories', { quadros: [{ ...bilhete, anotacoes: [{ texto: 'sobrou ou faltou?' }, { texto: 'fechou?' }] }, { layout: 'cartao', titulo: 'x', cartao: { linhas: [{ rotulo: 'Diferença', selo: 'R$ 20' }] } }] }).some((m) => /dinheiro/.test(m)));
  // 2) story que manda pro WhatsApp ganha "link na bio"; "me responde aqui" não
  assert.match(htmlStory({ layout: 'chamada', titulo: 'Chama no WhatsApp' }, { ramo: 'clinica' }), /class="pilula">link na bio/);
  assert.doesNotMatch(htmlStory({ layout: 'chamada', titulo: 'Me responde aqui nesse story' }, { ramo: 'clinica' }), /class="pilula"/);
  // 3) "EXEMPLO" no começo ou no fim do título do cartão não duplica o selo
  for (const t of ['Anamnese · Exemplo', 'Exemplo: Anamnese', 'Anamnese (exemplo)']) {
    const h = htmlSlide({ tipo: 'ideia', layout: 'cartao', titulo: 'x', cartao: { titulo: t, linhas: [{ rotulo: 'a' }] } }, { ramo: 'clinica', numero: 2, total: 5 });
    assert.match(h, />EXEMPLO · Anamnese</, t);
  }
  // 4) reserva com o tema ou as funções da semana vai para o fim da fila
  const { ordenarReserva } = await import('../reserva.mjs');
  const pecas = [
    { rid: 'mesmo-tema', tipo: 'carrossel', gancho: 'Quem confere a ficha?', tema: 'clinica · a clínica num lugar só', fatos: ['clin.agenda'] },
    { rid: 'outro', tipo: 'carrossel', gancho: 'Quem confere o troco do motoboy?', tema: 'restaurante · delivery', fatos: ['rest.delivery.teclado'] },
  ];
  const recentes = [{ dia: '2026-11-11', tema: 'clinica · a clínica num lugar só', fatos: ['clin.agenda'] }];
  assert.deepEqual(ordenarReserva(pecas, { item: { ramo: 'clinica' }, hoje: '2026-11-16', recentes }).map((p) => p.rid), ['outro', 'mesmo-tema']);
});
