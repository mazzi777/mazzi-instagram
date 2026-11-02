// Correções da revisão antes de ligar em modo real (01/11/2026): semana alheia, semana alvo, G8 na rodada,
// base revalidada no publicador e seção "em homologação" na base.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { produzirPendentes, cobrirComReserva, agendaAlheia, criarRegistro } from '../orquestrador.mjs';
import { semanaAlvo } from '../agente.mjs';
import { filtrarCandidatas } from '../base/atualizar.mjs';
import { fatosForaDoAr } from '../../publicar/publicar.mjs';
import { lerProduto } from '../checagens/fatos.mjs';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const config = JSON.parse(readFileSync(path.join(RAIZ, 'agente', 'config.json'), 'utf8'));
const produto = lerProduto();
const tmp = () => mkdtempSync(path.join(tmpdir(), 'mazzi-corte-'));
const gravar = (f, d) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(d)); };
const SEMANA = '2026-11-02';
const item = { id: 'A', dia: SEMANA, horario: '11:40', tipo: 'carrossel', ramo: 'clinica', objetivo: 'conversa', conteudo: 'dor', tema: 't', angulo: 'um ângulo qualquer', fatos: ['clin.agenda'] };
const naoChama = { economico: () => false, pedir: async () => { throw new Error('não podia chamar o Claude'); }, juiz: () => async () => { throw new Error('não podia chamar o Claude'); } };

test('semana alvo: segunda seguinte, ou a pedida; a em curso só pedida na mão (de amanhã a domingo); nunca a passada', () => {
  assert.deepEqual(semanaAlvo('2026-11-01'), { semana: '2026-11-02', desde: '2026-11-02' });
  assert.deepEqual(semanaAlvo('2026-11-07'), { semana: '2026-11-09', desde: '2026-11-09' });
  assert.deepEqual(semanaAlvo('2026-11-01', '2026-11-09'), { semana: '2026-11-09', desde: '2026-11-09' });
  assert.deepEqual(semanaAlvo('2026-11-02', '2026-11-02'), { semana: '2026-11-02', desde: '2026-11-03' });
  assert.throws(() => semanaAlvo('2026-11-08', '2026-11-02'), /já começou/, 'domingo: não sobra dia');
  assert.throws(() => semanaAlvo('2026-11-10', '2026-11-02'), /já começou/, 'semana passada');
  assert.throws(() => semanaAlvo('2026-11-01', '2026-11-10'), /segunda-feira/);
});

test('assumir a semana: só se tudo da agenda antiga já saiu; ids novos pulam os antigos; plano não volta no tempo', async () => {
  const { assumirSemana } = await import('../orquestrador.mjs');
  const { idsDoPlano, regrasDoPlano } = await import('../etapas/planejar.mjs');
  const saida = tmp();
  const dir = path.join(saida, 'semanas', SEMANA);
  gravar(path.join(dir, 'agenda.json'), { semana: SEMANA, pecas: [{ id: 'A', dia: SEMANA }, { id: 'S1', dia: SEMANA }, { id: 'REEL', dia: '2026-11-04' }] });
  gravar(path.join(dir, 'publicado.json'), { A: { completo: true }, S1: { completo: true } });
  assert.throws(() => assumirSemana(saida, SEMANA, SEMANA), /REEL/);
  assert.equal(agendaAlheia(saida, SEMANA), true);
  gravar(path.join(dir, 'publicado.json'), { A: { completo: true }, S1: { completo: true }, REEL: { completo: true } });
  assert.equal(assumirSemana(saida, SEMANA, SEMANA), true);
  assert.equal(agendaAlheia(saida, SEMANA), false);
  const agenda = JSON.parse(readFileSync(path.join(dir, 'agenda.json'), 'utf8'));
  assert.equal(agenda.pecas.length, 3, 'as antigas ficam como histórico');
  assert.equal(assumirSemana(saida, SEMANA, SEMANA), false, 'já é do agente');

  const p = (dia, tipo) => ({ dia, horario: '11:40', tipo });
  const ids = idsDoPlano({ pecas: [p('2026-11-03', 'carrossel'), p('2026-11-03', 'stories'), p('2026-11-05', 'reel'), p('2026-11-06', 'stories')] }, new Set(['A', 'B', 'S1', 'REEL']));
  assert.deepEqual(ids.map((x) => x.id), ['C', 'S2', 'D', 'S3']);
  const plano = { pecas: [{ ...item, dia: '2026-11-02' }] };
  assert.match(regrasDoPlano(plano, { semana: SEMANA, config, produto, formatos: ['carrossel'], desde: '2026-11-03' }).join(), /fora do período 2026-11-03/);
});

test('semana com agenda da rotina/Windsor: o agente não produz, não renderiza e não gasta reserva', async () => {
  const saida = tmp();
  const dir = path.join(saida, 'semanas', SEMANA);
  gravar(path.join(dir, 'agenda.json'), { semana: SEMANA, pecas: [{ id: 'A', dia: SEMANA, tipo: 'carrossel', arquivos: ['2026-11-02-A-01.jpg'] }] });
  writeFileSync(path.join(dir, '2026-11-02-A-01.jpg'), 'do windsor');
  gravar(path.join(dir, 'plano.json'), { semana: SEMANA, pecas: [item] });
  assert.equal(agendaAlheia(saida, SEMANA), true);
  const ctx = { raiz: RAIZ, saida, semana: SEMANA, produto, config, cerebro: naoChama, usados: [], hoje: SEMANA, registrar: criarRegistro(saida) };
  const r = await produzirPendentes({ ...ctx, desde: SEMANA, ate: SEMANA });
  assert.deepEqual(r, { feitas: [], parou: null, alheia: true }, 'não é erro: o diário passa pelas semanas antigas todo dia');
  let pegou = false;
  const c = await cobrirComReserva({ ...ctx, reserva: { pegar: async () => { pegou = true; return null; } }, desde: SEMANA, ate: SEMANA });
  assert.deepEqual(c, { cobertas: [], descobertas: [] });
  assert.equal(pegou, false);
  assert.equal(readFileSync(path.join(dir, '2026-11-02-A-01.jpg'), 'utf8'), 'do windsor');
  assert.equal(agendaAlheia(tmp(), SEMANA), false, 'sem agenda ainda: é do agente');
});

test('G8 dentro da rodada: o gancho aprovado entra nos usados da próxima peça', async () => {
  const saida = tmp();
  const semana = '2026-11-09';
  gravar(path.join(saida, 'semanas', semana, 'plano.json'), { semana, pecas: [{ ...item, dia: semana }] });
  const usados = [];
  const entrada = { id: 'A', dia: semana, horario: '11:40', tipo: 'carrossel', gancho: 'Paciente faltou de novo?', arquivos: [] };
  const ctx = { raiz: RAIZ, saida, semana, produto, config, cerebro: naoChama, usados, hoje: semana, registrar: criarRegistro(saida), soReserva: true, reserva: { pegar: async () => ({ origemId: 'r', entrada }) } };
  await produzirPendentes({ ...ctx, desde: semana, ate: semana });
  assert.deepEqual(usados, [{ data: semana, gancho: 'Paciente faltou de novo?' }]);
});

test('publicador: peça do agente com função que saiu do ar na base não publica', () => {
  const raiz = tmp();
  gravar(path.join(raiz, 'agente', 'base', 'produto.json'), { funcoes: [{ id: 'clin.agenda', status: 'no_ar' }, { id: 'fiscal.nfce', status: 'proibido' }] });
  assert.deepEqual(fatosForaDoAr(raiz, { fatos: ['clin.agenda'] }), []);
  assert.deepEqual(fatosForaDoAr(raiz, { fatos: ['clin.agenda', 'fiscal.nfce', 'clin.sumiu'] }), ['fiscal.nfce', 'clin.sumiu']);
  assert.deepEqual(fatosForaDoAr(tmp(), { fatos: ['fiscal.nfce'] }), [], 'sem base (testes antigos): não bloqueia');
  assert.deepEqual(fatosForaDoAr(raiz, {}), []);
});

test('base: seção "em homologação" barra a função mesmo se a paráfrase do Claude esconder isso', () => {
  const c = { id: 'rest.nota-caixa', ramo: 'restaurante', fato: 'Emite a nota do cliente direto no caixa.', fonte: 'Nota no caixa' };
  assert.equal(filtrarCandidatas([c], produto, { 'Nota no caixa': 'Primeira versão, em homologação na SEFAZ.' }).aprovadas.length, 0);
  const ok = { id: 'clin.falta-aviso', ramo: 'clinica', fato: 'Mostra na agenda quem faltou 3 vezes.', fonte: 'Aviso de faltas' };
  assert.equal(filtrarCandidatas([ok], produto, { 'Aviso de faltas': 'Paciente que falta 3 vezes ganha um aviso na agenda.' }).aprovadas.length, 1, '"falta" do texto não barra');
});

test('limparPeca: apaga só as mídias da peça (slides que sobraram e .parcial), não as de outra', async () => {
  const { limparPeca } = await import('../orquestrador.mjs');
  const dir = tmp();
  for (const f of ['2026-11-09-A-01.jpg', '2026-11-09-A-08.jpg', '2026-11-09-A1-01.jpg', '2026-11-09-B.mp4', '2026-11-09-B.mp4.parcial.mp4', 'agenda.json']) writeFileSync(path.join(dir, f), 'x');
  limparPeca(dir, '2026-11-09', 'A');
  limparPeca(dir, '2026-11-09', 'B');
  assert.deepEqual(readdirSync(dir).sort(), ['2026-11-09-A1-01.jpg', 'agenda.json']);
});

test('revalidarAgenda: mídia sumida ou função fora do ar tira a peça da agenda para refazer; publicada não mexe', async () => {
  const { revalidarAgenda } = await import('../orquestrador.mjs');
  const raiz = tmp();
  gravar(path.join(raiz, 'agente', 'base', 'produto.json'), { funcoes: [{ id: 'clin.agenda', status: 'no_ar' }, { id: 'clin.velha', status: 'proibido' }] });
  const semana = '2026-11-09';
  const dir = path.join(raiz, 'semanas', semana);
  const jpg = () => { const b = Buffer.alloc(21); b.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]); b.writeUInt16BE(1920, 7); b.writeUInt16BE(1080, 9); b.set([0xff, 0xd9], 19); return b; };
  const story = (id, fatos) => ({ id, dia: '2026-11-10', horario: '07:40', tipo: 'stories', arquivos: [`${semana}-${id}-01.jpg`], fatos });
  mkdirSync(dir, { recursive: true });
  for (const id of ['S1', 'S2', 'S4']) writeFileSync(path.join(dir, `${semana}-${id}-01.jpg`), jpg());
  gravar(path.join(dir, 'agenda.json'), { semana, produtor: 'agente', pecas: [story('S1', ['clin.agenda']), story('S2', ['clin.velha']), story('S3', ['clin.agenda']), story('S4', ['clin.velha'])] });
  gravar(path.join(dir, 'plano.json'), { semana, pecas: ['S1', 'S2', 'S3', 'S4'].map((id) => ({ id, situacao: 'aprovada' })) });
  gravar(path.join(dir, 'publicado.json'), { S4: { completo: true } });
  const r = revalidarAgenda({ raiz, semana, desde: '2026-11-09', ate: '2026-11-12', registrar: () => {} });
  assert.deepEqual(r.map((x) => x.id), ['S2', 'S3']);
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'agenda.json'), 'utf8')).pecas.map((p) => p.id), ['S1', 'S4']);
  const plano = JSON.parse(readFileSync(path.join(dir, 'plano.json'), 'utf8')).pecas;
  assert.deepEqual(plano.map((p) => p.situacao), ['aprovada', undefined, undefined, 'aprovada']);
  assert.equal(existsSync(path.join(dir, `${semana}-S2-01.jpg`)), false);
});
