import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publicar, escolherPecas, hojeEmSaoPaulo } from './publicar.mjs';
import { validarSemana, validarLegenda, tamanhoJpeg } from './validar.mjs';

const SEMANA = '2026-11-09';
const TOKEN = 'TOKEN-SECRETO-123';
const VIDEO_OK = () => ({ largura: 1080, altura: 1920, codec: 'h264', audio: true, duracao: 24 });

function jpeg(largura, altura) {
  const b = Buffer.alloc(21);
  b.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  b.writeUInt16BE(altura, 7);
  b.writeUInt16BE(largura, 9);
  b.set([0xff, 0xd9], 19);
  return b;
}

function montar({ publicado, mudar } = {}) {
  const raiz = mkdtempSync(path.join(tmpdir(), 'mazzi-ig-'));
  const dir = path.join(raiz, 'semanas', SEMANA);
  mkdirSync(dir, { recursive: true });
  mkdirSync(path.join(raiz, 'guia'));
  writeFileSync(path.join(raiz, 'guia', 'log.md'), '# Log\n\nTexto.\n\n- 30/10/2026 · PUBLICADO · antigo\n');
  const nomes = (id, n) => Array.from({ length: n }, (_, i) => `${SEMANA}-${id}-0${i + 1}.jpg`);
  const pecas = [
    { id: 'A', dia: '2026-11-09', tipo: 'carrossel', arquivos: nomes('A', 3), legenda: 'Paciente que falta.\n\nChama no WhatsApp (link na bio).', tema: 'clínica · paciente que falta', gancho: 'Ela marcou e sumiu?' },
    { id: 'S1', dia: '2026-11-09', tipo: 'stories', arquivos: nomes('S1', 5) },
    { id: 'REEL', dia: '2026-11-11', tipo: 'reel', arquivo: `${SEMANA}-REEL.mp4`, legenda: 'Caixa que não fecha. Chama no WhatsApp (link na bio).', capa_ms: 2500 },
    { id: 'S2', dia: '2026-11-11', tipo: 'stories', arquivos: nomes('S2', 4) },
    { id: 'B', dia: '2026-11-13', tipo: 'carrossel', arquivos: nomes('B', 2), legenda: 'Pedido que some. Chama no WhatsApp (link na bio).' },
    { id: 'S3', dia: '2026-11-13', tipo: 'stories', arquivos: nomes('S3', 4) },
  ];
  for (const p of pecas) {
    if (p.tipo === 'reel') writeFileSync(path.join(dir, p.arquivo), 'mp4');
    else for (const a of p.arquivos) writeFileSync(path.join(dir, a), p.tipo === 'carrossel' ? jpeg(1080, 1350) : jpeg(1080, 1920));
  }
  const agenda = { semana: SEMANA, pecas };
  mudar?.(agenda, dir);
  writeFileSync(path.join(dir, 'agenda.json'), JSON.stringify(agenda));
  if (publicado) writeFileSync(path.join(dir, 'publicado.json'), JSON.stringify(publicado));
  return { raiz, dir };
}

/** fetch falso da Meta + raw do GitHub. `status` decide o status_code de cada contêiner. */
function metaFalsa({ status = () => 'FINISHED', falharPublicacao = false, rawStatus = 200 } = {}) {
  const chamadas = [];
  let n = 0;
  const fetch = async (url, opcoes = {}) => {
    const metodo = opcoes.method ?? 'GET';
    const corpo = opcoes.body ? Object.fromEntries(new URLSearchParams(opcoes.body.toString())) : null;
    chamadas.push({ url, metodo, corpo, headers: opcoes.headers });
    const json = (s, j) => ({ ok: s < 400, status: s, json: async () => j });
    if (url.startsWith('https://raw.githubusercontent.com/')) return { status: rawStatus };
    const u = new URL(url);
    if (metodo === 'POST' && u.pathname.endsWith('/media')) return json(200, { id: `c${++n}` });
    if (metodo === 'POST' && u.pathname.endsWith('/media_publish')) {
      if (falharPublicacao) return json(400, { error: { message: `Invalid token ${TOKEN}`, code: 190, fbtrace_id: 'abc' } });
      return json(200, { id: `m${++n}` });
    }
    if (metodo === 'GET') return json(200, { status_code: status(u.pathname.split('/').pop()) });
    return json(404, { error: { message: 'rota desconhecida' } });
  };
  return { fetch, chamadas, meta: () => chamadas.filter((c) => c.url.startsWith('https://graph.facebook.com/')) };
}

const rodar = (raiz, hoje, extra = {}) => publicar({
  raiz, hoje, env: { META_TOKEN: TOKEN, IG_USER_ID: '1784' }, esperar: async () => {}, sondar: VIDEO_OK, log: () => {}, ...extra,
});

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

test('escolhe só as peças do dia ou atrasadas até 2 dias, sem as já publicadas', () => {
  const { raiz } = montar({ publicado: { A: { completo: true, ids: ['x'] } } });
  const ids = (hoje) => escolherPecas(raiz, hoje).map((e) => `${e.peca.id}${e.vencida ? '(vencida)' : ''}`);
  assert.deepEqual(ids('2026-11-08'), []);
  assert.deepEqual(ids('2026-11-09'), ['S1']);
  assert.deepEqual(ids('2026-11-11'), ['S1', 'REEL', 'S2']);
  assert.deepEqual(ids('2026-11-13'), ['S1(vencida)', 'REEL', 'S2', 'B', 'S3']);
});

test('carrossel: um contêiner por imagem, contêiner CAROUSEL com legenda, media_publish; token só no cabeçalho', async () => {
  const { raiz, dir } = montar();
  const f = metaFalsa();
  const r = await rodar(raiz, '2026-11-09', { alvo: `${SEMANA}/A`, fetch: f.fetch });
  assert.deepEqual(r.erros, []);
  const posts = f.meta().filter((c) => c.metodo === 'POST');
  assert.equal(posts.length, 5); // 3 itens + pai + publicação
  assert.ok(posts.slice(0, 3).every((c) => c.corpo.is_carousel_item === 'true' && c.corpo.image_url.endsWith('.jpg')));
  assert.equal(posts[0].corpo.image_url, `https://raw.githubusercontent.com/mazzi777/mazzi-instagram/main/semanas/${SEMANA}/${SEMANA}-A-01.jpg`);
  assert.equal(posts[3].corpo.media_type, 'CAROUSEL');
  assert.equal(posts[3].corpo.children, 'c1,c2,c3');
  assert.match(posts[3].corpo.caption, /Paciente que falta/);
  assert.equal(posts[4].corpo.creation_id, 'c4');
  for (const c of f.meta()) {
    assert.equal(c.headers.Authorization, `Bearer ${TOKEN}`);
    assert.ok(!c.url.includes(TOKEN) && !JSON.stringify(c.corpo ?? {}).includes(TOKEN));
  }
  const pub = JSON.parse(readFileSync(path.join(dir, 'publicado.json'), 'utf8'));
  assert.equal(pub.A.completo, true);
  assert.deepEqual(pub.A.ids, ['m5']);
  const log = readFileSync(path.join(raiz, 'guia', 'log.md'), 'utf8');
  assert.match(log, /# Log\n\nTexto\.\n\n- 09\/11\/2026 · PUBLICADO · carrossel \(A, 3 arquivo\(s\)\) · clínica · paciente que falta · "Ela marcou e sumiu\?" · ids m5 · via API da Meta\n- 30\/10\/2026/);
});

test('reel espera o vídeo ficar FINISHED antes de publicar', async () => {
  const { raiz } = montar();
  let consultas = 0;
  const f = metaFalsa({ status: () => (++consultas < 3 ? 'IN_PROGRESS' : 'FINISHED') });
  const r = await rodar(raiz, '2026-11-11', { alvo: `${SEMANA}/REEL`, fetch: f.fetch });
  assert.deepEqual(r.erros, []);
  const chamadas = f.meta();
  assert.equal(chamadas[0].corpo.media_type, 'REELS');
  assert.equal(chamadas[0].corpo.share_to_feed, 'true');
  assert.equal(chamadas[0].corpo.thumb_offset, '2500');
  assert.equal(chamadas.filter((c) => c.metodo === 'GET').length, 3);
  assert.ok(chamadas.at(-1).url.endsWith('/media_publish'));
});

test('reel que nunca fica pronto vira erro e não é publicado', async () => {
  const { raiz, dir } = montar();
  const f = metaFalsa({ status: () => 'IN_PROGRESS' });
  const r = await rodar(raiz, '2026-11-11', { alvo: `${SEMANA}/REEL`, fetch: f.fetch });
  assert.match(r.erros[0].mensagem, /não ficou pronto/);
  assert.ok(!f.meta().some((c) => c.url.endsWith('/media_publish')));
  assert.ok(!existsSync(path.join(dir, 'publicado.json')));
});

test('stories retomam do quadro seguinte quando a rodada anterior parou no meio', async () => {
  const { raiz, dir } = montar({ publicado: { S1: { ids: ['m-a', 'm-b'], via: 'api' } } });
  const f = metaFalsa();
  const r = await rodar(raiz, '2026-11-09', { fetch: f.fetch });
  assert.deepEqual(r.erros, []);
  const criados = f.meta().filter((c) => c.metodo === 'POST' && c.url.endsWith('/media'));
  // A (3 itens + pai) + S1 só os quadros 3, 4 e 5
  const stories = criados.filter((c) => c.corpo.media_type === 'STORIES').map((c) => c.corpo.image_url.split('/').pop());
  assert.deepEqual(stories, [`${SEMANA}-S1-03.jpg`, `${SEMANA}-S1-04.jpg`, `${SEMANA}-S1-05.jpg`]);
  const pub = JSON.parse(readFileSync(path.join(dir, 'publicado.json'), 'utf8'));
  assert.equal(pub.S1.ids.length, 5);
  assert.equal(pub.S1.completo, true);
});

test('simular confere tudo e não chama a Meta', async () => {
  const { raiz, dir } = montar();
  const f = metaFalsa();
  const r = await rodar(raiz, '2026-11-13', { simular: true, env: {}, fetch: f.fetch });
  assert.deepEqual(r.erros.map((e) => e.peca), [`${SEMANA}/A`, `${SEMANA}/S1`]); // vencidas: avisa, mas não grava
  assert.equal(r.publicadas.length, 4);
  assert.equal(f.meta().length, 0);
  assert.ok(!existsSync(path.join(dir, 'publicado.json')));
});

test('erro da Meta vira mensagem sem o token e a peça não é marcada', async () => {
  const { raiz, dir } = montar();
  const f = metaFalsa({ falharPublicacao: true });
  const r = await rodar(raiz, '2026-11-09', { alvo: `${SEMANA}/A`, fetch: f.fetch });
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0].mensagem, /Meta 400: Invalid token \*\*\* \(code 190, trace abc\)/);
  assert.ok(!r.erros[0].mensagem.includes(TOKEN));
  assert.ok(!existsSync(path.join(dir, 'publicado.json')));
});

test('peça inválida ou mídia fora do ar não chega na Meta', async () => {
  const invalida = montar({ mudar: (_, d) => writeFileSync(path.join(d, `${SEMANA}-A-02.jpg`), jpeg(800, 800)) });
  let f = metaFalsa();
  let r = await rodar(invalida.raiz, '2026-11-09', { alvo: `${SEMANA}/A`, fetch: f.fetch });
  assert.match(r.erros[0].mensagem, /validação[\s\S]*800x800/);
  assert.equal(f.meta().length, 0);

  const foraDoAr = montar();
  f = metaFalsa({ rawStatus: 404 });
  r = await rodar(foraDoAr.raiz, '2026-11-09', { alvo: `${SEMANA}/A`, fetch: f.fetch });
  assert.match(r.erros[0].mensagem, /não está pública \(404\)/);
  assert.equal(f.meta().length, 0);
});

test('peça vencida é registrada uma vez só e avisa como publicar na mão', async () => {
  const { raiz, dir } = montar({ publicado: { A: { completo: true, ids: ['x'] } } });
  const f = metaFalsa();
  const r = await rodar(raiz, '2026-11-12', { fetch: f.fetch });
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0].mensagem, /venceu sem publicar[\s\S]*peca=2026-11-09\/S1/);
  const pub = JSON.parse(readFileSync(path.join(dir, 'publicado.json'), 'utf8'));
  assert.equal(pub.S1.vencida, '2026-11-12');
  const r2 = await rodar(raiz, '2026-11-12', { fetch: metaFalsa().fetch });
  assert.equal(r2.erros.length, 0);
});

test('sem segredos, não tenta publicar', async () => {
  const { raiz } = montar();
  const r = await rodar(raiz, '2026-11-09', { env: {}, fetch: metaFalsa().fetch });
  assert.match(r.erros[0].mensagem, /META_TOKEN/);
  // ...mas sem nada para publicar no dia, não reclama (não abre issue à toa)
  const vazio = await rodar(raiz, '2026-11-08', { env: {}, fetch: metaFalsa().fetch });
  assert.deepEqual(vazio, { publicadas: [], erros: [] });
});

test('hoje é calculado no fuso de São Paulo', () => {
  assert.equal(hojeEmSaoPaulo(new Date('2026-11-09T02:30:00Z')), '2026-11-08');
  assert.equal(hojeEmSaoPaulo(new Date('2026-11-09T10:30:00Z')), '2026-11-09');
});
