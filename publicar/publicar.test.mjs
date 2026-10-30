import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publicar, escolherPecas, hojeEmSaoPaulo, conferirConta } from './publicar.mjs';
import { validarSemana, validarLegenda, tamanhoJpeg } from './validar.mjs';

const SEMANA = '2026-11-09';
const TOKEN = 'TOKEN-SECRETO-123';
const IG = '1784';
const VIDEO_OK = () => ({ largura: 1080, altura: 1920, codec: 'h264', audio: true, duracao: 24 });
const LEGENDA_A = 'Paciente que falta.\n\nChama no WhatsApp (link na bio).';

function jpeg(largura, altura) {
  const b = Buffer.alloc(21);
  b.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  b.writeUInt16BE(altura, 7);
  b.writeUInt16BE(largura, 9);
  b.set([0xff, 0xd9], 19);
  return b;
}

function escreverSemana(raiz, semana, { publicado, mudar } = {}) {
  const dir = path.join(raiz, 'semanas', semana);
  mkdirSync(dir, { recursive: true });
  const nomes = (id, n) => Array.from({ length: n }, (_, i) => `${semana}-${id}-0${i + 1}.jpg`);
  const mais = (d) => { const x = new Date(`${semana}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
  const pecas = [
    { id: 'A', dia: mais(0), tipo: 'carrossel', arquivos: nomes('A', 3), legenda: LEGENDA_A, tema: 'clínica · paciente que falta', gancho: 'Ela marcou e sumiu?' },
    { id: 'S1', dia: mais(0), tipo: 'stories', arquivos: nomes('S1', 5) },
    { id: 'REEL', dia: mais(2), tipo: 'reel', arquivos: [`${semana}-REEL.mp4`], legenda: 'Caixa que não fecha. Chama no WhatsApp (link na bio).', capa_ms: 2500 },
    { id: 'S2', dia: mais(2), tipo: 'stories', arquivos: nomes('S2', 4) },
    { id: 'B', dia: mais(4), tipo: 'carrossel', arquivos: nomes('B', 2), legenda: 'Pedido que some. Chama no WhatsApp (link na bio).' },
    { id: 'S3', dia: mais(4), tipo: 'stories', arquivos: nomes('S3', 4) },
  ];
  for (const p of pecas) {
    for (const a of p.arquivos) {
      writeFileSync(path.join(dir, a), p.tipo === 'reel' ? 'mp4' : p.tipo === 'carrossel' ? jpeg(1080, 1350) : jpeg(1080, 1920));
    }
  }
  const agenda = { semana, pecas };
  mudar?.(agenda, dir);
  writeFileSync(path.join(dir, 'agenda.json'), JSON.stringify(agenda));
  if (publicado) writeFileSync(path.join(dir, 'publicado.json'), JSON.stringify(publicado));
  return dir;
}

function montar(opcoes) {
  const raiz = mkdtempSync(path.join(tmpdir(), 'mazzi-ig-'));
  mkdirSync(path.join(raiz, 'guia'));
  writeFileSync(path.join(raiz, 'guia', 'log.md'), '# Log\n\nTexto.\n\n- 30/10/2026 · PUBLICADO · antigo\n');
  const dir = escreverSemana(raiz, SEMANA, opcoes);
  return { raiz, dir };
}

const lerPublicado = (dir) => JSON.parse(readFileSync(path.join(dir, 'publicado.json'), 'utf8'));

/**
 * Meta falsa + raw do GitHub. Opções:
 *  status(id) → status_code de cada contêiner (padrão FINISHED)
 *  publish(n) → 'ok' | 'erro' | 'rede' para a n-ésima chamada de media_publish
 *  feed → posts devolvidos em GET /{ig}/media
 */
function metaFalsa({ status = () => 'FINISHED', publish = () => 'ok', feed = [], conta = 'ok', rawStatus = 200, prefixo = 'c' } = {}) {
  const chamadas = [];
  let n = 0;
  let publicacoes = 0;
  const fetch = async (url, opcoes = {}) => {
    const metodo = opcoes.method ?? 'GET';
    const corpo = opcoes.body ? Object.fromEntries(new URLSearchParams(opcoes.body.toString())) : null;
    chamadas.push({ url, metodo, corpo, headers: opcoes.headers });
    const json = (s, j) => ({ ok: s < 400, status: s, json: async () => j });
    if (url.startsWith('https://raw.githubusercontent.com/')) return { status: rawStatus };
    const u = new URL(url);
    const partes = u.pathname.split('/').filter(Boolean); // [v25.0, ...]
    if (metodo === 'POST' && u.pathname.endsWith('/media')) return json(200, { id: `${prefixo}${++n}` });
    if (metodo === 'POST' && u.pathname.endsWith('/media_publish')) {
      const r = publish(++publicacoes);
      if (r === 'rede') throw new TypeError('fetch failed');
      if (r === 'erro') return json(400, { error: { message: `Invalid token ${TOKEN}`, code: 190, fbtrace_id: 'abc' } });
      return json(200, { id: `m${++n}` });
    }
    if (metodo === 'GET' && partes.length === 2 && partes[1] === IG) {
      return conta === 'ok' ? json(200, { id: IG, username: 'mazzisystems' }) : json(401, { error: { message: 'Error validating access token', code: 190 } });
    }
    if (metodo === 'GET' && partes.length === 3 && partes[2] === 'media') return json(200, { data: feed });
    if (metodo === 'GET') return json(200, { status_code: status(partes.at(-1)) });
    return json(404, { error: { message: 'rota desconhecida' } });
  };
  const meta = () => chamadas.filter((c) => c.url.startsWith('https://graph.facebook.com/'));
  return {
    fetch,
    chamadas,
    meta,
    posts: () => meta().filter((c) => c.metodo === 'POST'),
    publicacoes: () => meta().filter((c) => c.url.endsWith('/media_publish')),
  };
}

const rodar = (raiz, hoje, extra = {}) => publicar({
  raiz, hoje, env: { META_TOKEN: TOKEN, IG_USER_ID: IG }, esperar: async () => {}, sondar: VIDEO_OK, log: () => {}, ...extra,
});

// ---------- validador ----------

test('validador aceita a semana montada e mede JPEG', () => {
  const { dir } = montar();
  assert.deepEqual(validarSemana(dir, { sondar: VIDEO_OK }), []);
  assert.deepEqual(tamanhoJpeg(jpeg(1080, 1350)), { largura: 1080, altura: 1350 });
});

test('validador pega medida errada, dia errado, peça faltando e palavra proibida', () => {
  const { dir } = montar({
    mudar: (agenda, d) => {
      writeFileSync(path.join(d, `${SEMANA}-A-01.jpg`), jpeg(1080, 1080));
      agenda.pecas.find((p) => p.id === 'B').dia = '2026-11-12';
      agenda.pecas.find((p) => p.id === 'REEL').legenda = 'Agora com NFC-e — e mais #a #b #c #d';
      agenda.pecas = agenda.pecas.filter((p) => p.id !== 'S3');
    },
  });
  const erros = validarSemana(dir, { sondar: VIDEO_OK }).join('\n');
  assert.match(erros, /A-01\.jpg é 1080x1080/);
  assert.match(erros, /B: dia 2026-11-12, esperado 2026-11-13/);
  assert.match(erros, /falta a peça S3/);
  assert.match(erros, /NFC-e/);
  assert.match(erros, /travessão/);
  assert.match(erros, /4 hashtags/);
});

test('legenda vazia e sobra de modelo são erro', () => {
  assert.match(validarLegenda('', 'x').join(), /vazia/);
  assert.match(validarLegenda('Reduziu {{número real}} faltas', 'x').join(), /modelo/);
});

// ---------- escolha das peças ----------

test('escolhe só as peças do dia ou atrasadas até 2 dias, sem as já publicadas', () => {
  const { raiz } = montar({ publicado: { A: { completo: true, ids: ['x'] } } });
  const ids = (hoje) => escolherPecas(raiz, hoje).escolhidas.map((e) => `${e.peca.id}${e.vencida ? '(vencida)' : ''}`);
  assert.deepEqual(ids('2026-11-08'), []);
  assert.deepEqual(ids('2026-11-09'), ['S1']);
  assert.deepEqual(ids('2026-11-11'), ['S1', 'REEL', 'S2']);
  assert.deepEqual(ids('2026-11-13'), ['S1(vencida)', 'REEL', 'S2', 'B', 'S3']);
});

test('agenda quebrada de outra semana não impede a de hoje (revisão: falha 3)', async () => {
  const { raiz, dir } = montar();
  mkdirSync(path.join(raiz, 'semanas', '2026-11-16'));
  writeFileSync(path.join(raiz, 'semanas', '2026-11-16', 'agenda.json'), '{ quebrado');
  const f = metaFalsa();
  const r = await rodar(raiz, '2026-11-09', { fetch: f.fetch });
  assert.deepEqual(r.publicadas.map((p) => p.peca), [`${SEMANA}/A`, `${SEMANA}/S1`]);
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0].mensagem, /agenda inválida/);
  assert.equal(lerPublicado(dir).A.completo, true);
});

test('pasta com "semana" diferente do nome é recusada', () => {
  const { raiz } = montar();
  escreverSemana(raiz, '2026-11-16', { mudar: (agenda) => { agenda.semana = SEMANA; } });
  const { erros } = escolherPecas(raiz, '2026-11-09');
  assert.match(erros[0].mensagem, /diferente da pasta 2026-11-16/);
});

test('id repetido na agenda sai uma vez só (revisão: falha 4)', async () => {
  const { raiz } = montar({ mudar: (agenda) => agenda.pecas.push({ ...agenda.pecas[0] }) });
  const f = metaFalsa();
  const r = await rodar(raiz, '2026-11-09', { fetch: f.fetch });
  assert.equal(f.publicacoes().filter((c) => c.corpo.creation_id === 'c4').length, 1);
  assert.equal(f.publicacoes().length, 1 + 5); // carrossel A + 5 quadros de S1
  assert.match(r.erros.map((e) => e.mensagem).join(), /id repetido/);
});

// ---------- publicação ----------

test('carrossel: contêiner por imagem, CAROUSEL com legenda, media_publish; token só no cabeçalho; URL pelo commit', async () => {
  const { raiz, dir } = montar();
  const f = metaFalsa();
  const r = await rodar(raiz, '2026-11-09', { alvo: `${SEMANA}/A`, fetch: f.fetch, env: { META_TOKEN: TOKEN, IG_USER_ID: IG, MIDIA_REF: 'abc123' } });
  assert.deepEqual(r.erros, []);
  const posts = f.posts();
  assert.equal(posts.length, 5); // 3 itens + pai + publicação
  assert.ok(posts.slice(0, 3).every((c) => c.corpo.is_carousel_item === 'true'));
  assert.equal(posts[0].corpo.image_url, `https://raw.githubusercontent.com/mazzi777/mazzi-instagram/abc123/semanas/${SEMANA}/${SEMANA}-A-01.jpg`);
  assert.equal(posts[3].corpo.media_type, 'CAROUSEL');
  assert.equal(posts[3].corpo.children, 'c1,c2,c3');
  assert.match(posts[3].corpo.caption, /Paciente que falta/);
  assert.equal(posts[4].corpo.creation_id, 'c4');
  for (const c of f.meta()) {
    assert.equal(c.headers.Authorization, `Bearer ${TOKEN}`);
    assert.ok(!c.url.includes(TOKEN) && !JSON.stringify(c.corpo ?? {}).includes(TOKEN));
  }
  assert.deepEqual(lerPublicado(dir).A, { em: lerPublicado(dir).A.em, via: 'api', ids: ['m5'], completo: true });
  const log = readFileSync(path.join(raiz, 'guia', 'log.md'), 'utf8');
  assert.match(log, /# Log\n\nTexto\.\n\n- 09\/11\/2026 · PUBLICADO · carrossel \(A, 3 arquivo\(s\)\) · clínica · paciente que falta · "Ela marcou e sumiu\?" · ids m5 · via API da Meta\n- 30\/10\/2026/);
});

test('resposta da Meta perdida no media_publish não duplica o post (revisão: falha 1)', async () => {
  const { raiz, dir } = montar();
  // 1ª rodada: a Meta publica, mas a resposta se perde (erro de rede)
  const f1 = metaFalsa({ publish: () => 'rede' });
  const r1 = await rodar(raiz, '2026-11-09', { alvo: `${SEMANA}/A`, fetch: f1.fetch });
  assert.match(r1.erros[0].mensagem, /fetch failed/);
  assert.equal(lerPublicado(dir).A.pendente, 'c4');
  assert.ok(!lerPublicado(dir).A.completo);
  // 2ª rodada: o contêiner pendente aparece como PUBLISHED → só registra, não publica de novo
  const f2 = metaFalsa({ status: (id) => (id === 'c4' ? 'PUBLISHED' : 'FINISHED') });
  const r2 = await rodar(raiz, '2026-11-09', { alvo: `${SEMANA}/A`, fetch: f2.fetch });
  assert.deepEqual(r2.erros, []);
  assert.equal(f2.publicacoes().length, 0);
  assert.equal(f2.posts().length, 0);
  assert.deepEqual(lerPublicado(dir).A.ids, ['contêiner c4']);
  assert.equal(lerPublicado(dir).A.completo, true);
});

test('pendente que ficou pronto mas não saiu é publicado com o mesmo contêiner', async () => {
  const { raiz, dir } = montar({ publicado: { A: { ids: [], via: 'api', pendente: 'c-antigo' } } });
  const f = metaFalsa();
  await rodar(raiz, '2026-11-09', { alvo: `${SEMANA}/A`, fetch: f.fetch });
  assert.deepEqual(f.publicacoes().map((c) => c.corpo.creation_id), ['c-antigo']);
  assert.equal(f.posts().length, 1); // nenhum contêiner novo
  assert.equal(lerPublicado(dir).A.completo, true);
});

test('pendente vencido (EXPIRED) é refeito com contêiner novo', async () => {
  const { raiz } = montar({ publicado: { A: { ids: [], via: 'api', pendente: 'c-velho' } } });
  const f = metaFalsa({ status: (id) => (id === 'c-velho' ? 'EXPIRED' : 'FINISHED') });
  const r = await rodar(raiz, '2026-11-09', { alvo: `${SEMANA}/A`, fetch: f.fetch });
  assert.deepEqual(r.erros, []);
  assert.deepEqual(f.publicacoes().map((c) => c.corpo.creation_id), ['c4']);
});

test('post de feed sem registro, mas com a mesma legenda no ar, não é publicado de novo', async () => {
  const { raiz, dir } = montar();
  const f = metaFalsa({ feed: [{ id: 'ig-999', caption: LEGENDA_A, timestamp: '2026-11-09T10:31:00+0000' }] });
  const r = await rodar(raiz, '2026-11-09', { alvo: `${SEMANA}/A`, fetch: f.fetch });
  assert.deepEqual(r.erros, []);
  assert.equal(f.posts().length, 0);
  assert.deepEqual(lerPublicado(dir).A.ids, ['ig-999']);
});

test('reel espera o vídeo ficar FINISHED antes de publicar', async () => {
  const { raiz } = montar();
  let consultas = 0;
  const f = metaFalsa({ status: () => (++consultas < 3 ? 'IN_PROGRESS' : 'FINISHED') });
  const r = await rodar(raiz, '2026-11-11', { alvo: `${SEMANA}/REEL`, fetch: f.fetch });
  assert.deepEqual(r.erros, []);
  const posts = f.posts();
  assert.equal(posts[0].corpo.media_type, 'REELS');
  assert.equal(posts[0].corpo.share_to_feed, 'true');
  assert.equal(posts[0].corpo.thumb_offset, '2500');
  assert.equal(consultas, 3);
  assert.ok(posts.at(-1).url.endsWith('/media_publish'));
});

test('reel que nunca fica pronto vira erro e não é publicado', async () => {
  const { raiz, dir } = montar();
  const f = metaFalsa({ status: () => 'IN_PROGRESS' });
  const r = await rodar(raiz, '2026-11-11', { alvo: `${SEMANA}/REEL`, fetch: f.fetch });
  assert.match(r.erros[0].mensagem, /não ficou pronto/);
  assert.equal(f.publicacoes().length, 0);
  assert.ok(!existsSync(path.join(dir, 'publicado.json')));
});

test('stories retomam do quadro seguinte quando a rodada anterior parou no meio', async () => {
  const { raiz, dir } = montar({ publicado: { S1: { ids: ['m-a', 'm-b'], via: 'api' } } });
  const f = metaFalsa();
  const r = await rodar(raiz, '2026-11-09', { alvo: `${SEMANA}/S1`, fetch: f.fetch });
  assert.deepEqual(r.erros, []);
  const stories = f.posts().filter((c) => c.corpo.media_type === 'STORIES').map((c) => c.corpo.image_url.split('/').pop());
  assert.deepEqual(stories, [`${SEMANA}-S1-03.jpg`, `${SEMANA}-S1-04.jpg`, `${SEMANA}-S1-05.jpg`]);
  assert.equal(lerPublicado(dir).S1.ids.length, 5);
  assert.equal(lerPublicado(dir).S1.completo, true);
});

test('quadro de story com resposta perdida não é repetido', async () => {
  const { raiz, dir } = montar();
  const f1 = metaFalsa({ publish: (n) => (n === 2 ? 'rede' : 'ok') });
  await rodar(raiz, '2026-11-09', { alvo: `${SEMANA}/S1`, fetch: f1.fetch });
  const meio = lerPublicado(dir).S1;
  assert.equal(meio.ids.length, 1);
  assert.equal(meio.pendente, 'c3');
  const f2 = metaFalsa({ prefixo: 'd', status: (id) => (id === 'c3' ? 'PUBLISHED' : 'FINISHED') });
  await rodar(raiz, '2026-11-09', { alvo: `${SEMANA}/S1`, fetch: f2.fetch });
  const stories = f2.posts().filter((c) => c.corpo.media_type === 'STORIES').map((c) => c.corpo.image_url.split('/').pop());
  assert.deepEqual(stories, [`${SEMANA}-S1-03.jpg`, `${SEMANA}-S1-04.jpg`, `${SEMANA}-S1-05.jpg`]);
  assert.deepEqual(lerPublicado(dir).S1.ids.slice(0, 2), ['m2', 'contêiner c3']);
  assert.equal(lerPublicado(dir).S1.completo, true);
});

test('simular confere tudo, não chama a Meta e não grava nada', async () => {
  const { raiz, dir } = montar();
  const f = metaFalsa();
  const r = await rodar(raiz, '2026-11-13', { simular: true, env: {}, fetch: f.fetch });
  assert.deepEqual(r.erros.map((e) => e.peca), [`${SEMANA}/A`, `${SEMANA}/S1`]); // vencidas: avisa, mas não grava
  assert.equal(r.publicadas.length, 4);
  assert.equal(f.meta().length, 0);
  assert.ok(!existsSync(path.join(dir, 'publicado.json')));
});

test('erro da Meta vira mensagem sem o token e a peça não é marcada como publicada', async () => {
  const { raiz, dir } = montar();
  const f = metaFalsa({ publish: () => 'erro' });
  const r = await rodar(raiz, '2026-11-09', { alvo: `${SEMANA}/A`, fetch: f.fetch });
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0].mensagem, /Meta 400: Invalid token \*\*\* \(code 190, trace abc\)/);
  assert.ok(!r.erros[0].mensagem.includes(TOKEN));
  assert.ok(!lerPublicado(dir).A.completo);
});

test('peça inválida ou mídia fora do ar não chega na Meta', async () => {
  const invalida = montar({ mudar: (_, d) => writeFileSync(path.join(d, `${SEMANA}-A-02.jpg`), jpeg(800, 800)) });
  let f = metaFalsa();
  let r = await rodar(invalida.raiz, '2026-11-09', { alvo: `${SEMANA}/A`, fetch: f.fetch });
  assert.match(r.erros[0].mensagem, /validação[\s\S]*800x800/);
  assert.equal(f.posts().length, 0);

  const foraDoAr = montar();
  f = metaFalsa({ rawStatus: 404 });
  r = await rodar(foraDoAr.raiz, '2026-11-09', { alvo: `${SEMANA}/A`, fetch: f.fetch });
  assert.match(r.erros[0].mensagem, /não está pública \(404\)/);
  assert.equal(f.posts().length, 0);
});

test('peça vencida é registrada uma vez só e avisa como publicar na mão', async () => {
  const { raiz, dir } = montar({ publicado: { A: { completo: true, ids: ['x'] } } });
  const r = await rodar(raiz, '2026-11-12', { fetch: metaFalsa().fetch });
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0].mensagem, /venceu sem publicar[\s\S]*peca=2026-11-09\/S1/);
  assert.equal(lerPublicado(dir).S1.vencida, '2026-11-12');
  const r2 = await rodar(raiz, '2026-11-12', { fetch: metaFalsa().fetch });
  assert.equal(r2.erros.length, 0);
});

test('peça digitada errado no modo manual é erro, não "nada para publicar"', async () => {
  const { raiz } = montar();
  const r = await rodar(raiz, '2026-11-09', { alvo: `${SEMANA}/XX`, fetch: metaFalsa().fetch });
  assert.match(r.erros[0].mensagem, /não encontrada/);
});

test('semana atual sem agenda vira aviso (a rotina não produziu)', async () => {
  const { raiz } = montar();
  const r = await rodar(raiz, '2026-11-17', { fetch: metaFalsa().fetch });
  assert.match(r.erros.map((e) => `${e.peca}: ${e.mensagem}`).join('\n'), /semanas\/2026-11-16: a semana atual não tem agenda/);
});

test('chave inválida ou ausente: avisa e não tenta publicar, mesmo sem peça no dia', async () => {
  const { raiz } = montar();
  const f = metaFalsa({ conta: 'invalida' });
  const r = await rodar(raiz, '2026-11-09', { fetch: f.fetch });
  assert.match(r.erros[0].mensagem, /Error validating access token/);
  assert.equal(f.posts().length, 0);
  const vazio = await rodar(raiz, '2026-11-08', { env: {}, fetch: metaFalsa().fetch });
  assert.match(vazio.erros[0].mensagem, /META_TOKEN/);
});

test('conferir a chave lê a conta pelo cabeçalho, sem publicar', async () => {
  const f = metaFalsa();
  const conta = await conferirConta({ env: { META_TOKEN: TOKEN, IG_USER_ID: IG }, fetch: f.fetch });
  assert.equal(conta.username, 'mazzisystems');
  assert.equal(f.meta().length, 1);
  assert.ok(!f.meta()[0].url.includes(TOKEN));
  await assert.rejects(conferirConta({ env: {}, fetch: f.fetch }), /META_TOKEN/);
});

test('hoje é calculado no fuso de São Paulo', () => {
  assert.equal(hojeEmSaoPaulo(new Date('2026-11-09T02:30:00Z')), '2026-11-08');
  assert.equal(hojeEmSaoPaulo(new Date('2026-11-09T10:30:00Z')), '2026-11-09');
});

test('semanas futuras: só as que ainda têm peça por publicar', async () => {
  const { semanasFuturas } = await import('./validar.mjs');
  const { raiz } = montar();
  escreverSemana(raiz, '2026-11-02', { publicado: Object.fromEntries(['A', 'S1', 'REEL', 'S2', 'B', 'S3'].map((id) => [id, { completo: true }])) });
  escreverSemana(raiz, '2026-10-26');
  assert.deepEqual(semanasFuturas(raiz, '2026-11-04'), [SEMANA]);
});
