// Fase 1d: métricas (Meta falsa), nota e estratégia, banco reserva e relatório. Nenhum teste chama a Meta ou o Claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { criarMeta, coletar, lerColetas, publicados } from '../metricas.mjs';
import { notas, ajustar, resumoParaPlano, atualizarEstrategia, postsComMetricas } from '../estrategia.mjs';
import { guardar, situacao, motivosParaNaoUsar, criarReserva, lerReserva, pautasEvergreen } from '../reserva.mjs';
import { montarRelatorio, gravarRelatorio } from '../relatorio.mjs';
import { produzirPeca, cobrirComReserva, encherReserva, criarRegistro } from '../orquestrador.mjs';
import { avisosDaReserva } from '../agente.mjs';
import { lerProduto } from '../checagens/fatos.mjs';
import { dataMais } from '../../publicar/validar.mjs';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const config = JSON.parse(readFileSync(path.join(RAIZ, 'agente', 'config.json'), 'utf8'));
const produto = lerProduto();
const tmp = () => mkdtempSync(path.join(tmpdir(), 'mazzi-1d-'));
const gravar = (f, d) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, typeof d === 'string' ? d : JSON.stringify(d)); };

function jpeg(largura, altura) {
  const b = Buffer.alloc(21);
  b.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  b.writeUInt16BE(altura, 7);
  b.writeUInt16BE(largura, 9);
  b.set([0xff, 0xd9], 19);
  return b;
}

// ---------- Meta falsa ----------

/** fetch falso: `rotas(url)` devolve { status, corpo }. Guarda as URLs pedidas. */
function fetchFalso(rotas) {
  const pedidos = [];
  const f = async (url, opcoes) => {
    pedidos.push(url);
    assert.match(opcoes.headers.Authorization, /^Bearer /);
    const { status = 200, corpo } = rotas(new URL(url));
    return { ok: status < 400, status, json: async () => corpo };
  };
  f.pedidos = pedidos;
  return f;
}
const erroMeta = (code, message = 'erro') => ({ status: 400, corpo: { error: { code, message } } });

test('métricas: pedido junto ok devolve todas', async () => {
  const fetch = fetchFalso((u) => ({ corpo: { data: u.searchParams.get('metric').split(',').map((name) => ({ name, values: [{ value: 7 }] })) } }));
  const meta = criarMeta({ token: 't', igUserId: '1', fetch });
  const m = await meta.insights('123', 'REELS');
  assert.equal(m.reach, 7);
  assert.equal(m.ig_reels_avg_watch_time, 7);
  assert.equal(fetch.pedidos.length, 1);
});

test('métricas: métrica recusada cai para uma a uma; código 10 vira "<5"; token inválido sobe', async () => {
  const fetch = fetchFalso((u) => {
    const m = u.searchParams.get('metric');
    if (m.includes(',')) return erroMeta(100, 'metric not supported');
    if (m === 'replies') return erroMeta(10, '(#10) Not enough viewers for the media to show insights');
    if (m === 'navigation') return erroMeta(100, 'needs breakdown');
    return { corpo: { data: [{ name: m, total_value: { value: 3 } }] } };
  });
  const m = await criarMeta({ token: 't', igUserId: '1', fetch }).insights('9', 'STORY');
  assert.equal(m.reach, 3);
  assert.equal(m.replies, '<5');
  assert.equal(m.navigation, null);

  const morto = criarMeta({ token: 't', igUserId: '1', fetch: fetchFalso(() => erroMeta(190, 'Invalid OAuth access token')) });
  await assert.rejects(morto.insights('9', 'FEED'), (e) => e.codigo === 190);
  const semPermissao = criarMeta({ token: 't', igUserId: '1', fetch: fetchFalso(() => erroMeta(10, '(#10) Application does not have permission for this action')) });
  await assert.rejects(semPermissao.insights('9', 'STORY'), (e) => e.chave, 'falta de permissão não vira "<5"');
});

test('métricas: conta do dia pega os toques por botão (WhatsApp)', async () => {
  const fetch = fetchFalso((u) => {
    const m = u.searchParams.get('metric');
    assert.equal(u.searchParams.get('period'), 'day');
    if (m === 'profile_links_taps') {
      assert.equal(u.searchParams.get('breakdown'), 'contact_button_type');
      return { corpo: { data: [{ name: m, total_value: { value: 4, breakdowns: [{ results: [{ dimension_values: ['WHATSAPP'], value: 3 }, { dimension_values: ['DIRECTION'], value: 1 }] }] } }] } };
    }
    return { corpo: { data: [{ name: m, total_value: { value: 10 } }] } };
  });
  const c = await criarMeta({ token: 't', igUserId: '1', fetch }).conta('2026-11-10');
  assert.equal(c.profile_links_taps, 4);
  assert.deepEqual(c.profile_links_taps_por_botao, { WHATSAPP: 3, DIRECTION: 1 });
  // 00:00 de São Paulo = 03:00 UTC
  assert.equal(new URL(fetch.pedidos[0]).searchParams.get('since'), String(Date.parse('2026-11-10T03:00:00Z') / 1000));
});

/** Repositório falso com uma semana publicada: A (carrossel, 10/11), B (reel, 12/11), S1 (stories, 12/11). */
function repoPublicado() {
  const raiz = tmp();
  const s = path.join(raiz, 'semanas', '2026-11-09');
  gravar(path.join(s, 'agenda.json'), { semana: '2026-11-09', produtor: 'agente', pecas: [
    { id: 'A', dia: '2026-11-10', tipo: 'carrossel', ramo: 'clinica', objetivo: 'conversa', horario: '11:40', gancho: 'Paciente faltou?', arquivos: [] },
    { id: 'B', dia: '2026-11-12', tipo: 'reel', ramo: 'restaurante', objetivo: 'alcance', horario: '18:40', gancho: 'Caixa fechou?', arquivos: [] },
    { id: 'S1', dia: '2026-11-12', tipo: 'stories', ramo: 'comum', horario: '07:40', arquivos: [] },
  ] });
  gravar(path.join(s, 'publicado.json'), {
    A: { em: '2026-11-10T14:40:00Z', ids: ['111'], completo: true },
    B: { em: '2026-11-12T21:40:00Z', ids: ['222'], completo: true },
    S1: { em: '2026-11-12T10:40:00Z', ids: ['331', '332'], completo: true },
    C: { em: '2026-11-13T10:40:00Z', ids: ['contêiner 9'], completo: true },
  });
  return raiz;
}
const metaFalsa = () => {
  const chamadas = [];
  return {
    chamadas,
    insights: async (id, tipo) => { chamadas.push(`${id}:${tipo}`); return { reach: 100, profile_visits: 5, shares: 1 }; },
    conta: async (dia) => { chamadas.push(`conta:${dia}`); return { profile_links_taps: 2 }; },
  };
};

test('coleta: mede D+1/D+3 no dia certo, a conta de ontem, e não repete', async () => {
  const raiz = repoPublicado();
  assert.deepEqual(publicados(raiz).map((p) => p.peca), ['A', 'B', 'S1'], '"contêiner X" não tem id de post e fica de fora');
  const meta = metaFalsa();
  await coletar({ raiz, hoje: '2026-11-13', meta });
  // A: D+3 (13/11); B: D+1 (13/11). Stories ficam para a rodada da noite.
  assert.deepEqual(meta.chamadas.sort(), ['111:FEED', '222:REELS', 'conta:2026-11-12']);
  await coletar({ raiz, hoje: '2026-11-13', meta });
  assert.equal(meta.chamadas.length, 3, 'mesma idade, mesmo dia: não pede de novo');
  const linhas = lerColetas(raiz);
  assert.equal(linhas.length, 3);
  assert.ok(existsSync(path.join(raiz, 'metricas', '2026-11.jsonl')));

  const noite = metaFalsa();
  await coletar({ raiz, hoje: '2026-11-12', meta: noite, modo: 'stories' });
  assert.deepEqual(noite.chamadas.sort(), ['331:STORY', '332:STORY']);
});

test('coleta: token inválido para a rodada; outro erro fica na lista', async () => {
  const raiz = repoPublicado();
  const quebrada = { insights: async () => { const e = new Error('x'); e.codigo = 190; e.chave = true; throw e; }, conta: async () => ({}) };
  await assert.rejects(coletar({ raiz, hoje: '2026-11-13', meta: quebrada }), (e) => e.codigo === 190);
  const meia = { insights: async () => { const e = new Error('boom'); e.codigo = 1; throw e; }, conta: async () => ({}) };
  const r = await coletar({ raiz, hoje: '2026-11-13', meta: meia });
  assert.equal(r.erros.length, 2);
});

// ---------- nota e estratégia ----------

const post = (dia, tipo, conversa, alcance, extra = {}) => ({ chave: `${dia}/A`, dia, idade: 7, tipo, ramo: 'clinica', objetivo: 'conversa', horario: '11:40', conteudo: 'dor', gancho: `g${dia}`, m: {}, conversa, alcance, ...extra });

test('nota: 1,0 é o normal do formato; o dobro de conversa pesa 70%', () => {
  const ps = [post('2026-10-01', 'carrossel', 10, 100), post('2026-10-02', 'carrossel', 10, 100), post('2026-10-03', 'carrossel', 10, 100), post('2026-10-04', 'carrossel', 20, 100)];
  const n = notas(ps);
  assert.equal(n[2].nota, 1);
  assert.equal(n[3].nota, 1.7);
});

test('nota: postsComMetricas usa a coleta mais madura e divide os toques do dia', async () => {
  const raiz = repoPublicado();
  gravar(path.join(raiz, 'metricas', '2026-11.jsonl'), [
    { coletado_em: '2026-11-11T12:00:00Z', media_id: '111', idade_d: 1, metricas: { reach: 50, profile_visits: 1 } },
    { coletado_em: '2026-11-13T12:00:00Z', media_id: '111', idade_d: 3, metricas: { reach: 80, profile_visits: 2, follows: 1, saved: '<5' } },
    { coletado_em: '2026-11-11T12:00:00Z', media_id: 'conta', dia: '2026-11-10', metricas: { profile_links_taps: 2 } },
  ].map((l) => JSON.stringify(l)).join('\n'));
  const [a] = postsComMetricas(raiz);
  assert.equal(a.idade, 3);
  assert.equal(a.alcance, 80, '"<5" conta como zero');
  assert.equal(a.conversa, 2 + 2 * 1 + 3 * 2);
});

test('estratégia: menos de 4 amostras não mexe; mexe no máximo 20%; piso de 0,1', () => {
  const hoje = '2026-11-14';
  const bons = [1, 2, 3, 4].map((i) => ({ ...post(`2026-11-0${i}`, 'reel', 0, 0), nota: 3 }));
  const ruins = [5, 6, 7, 8].map((i) => ({ ...post(`2026-11-0${i}`, 'carrossel', 0, 0), nota: 0.01 }));
  const poucos = [{ ...post('2026-11-09', 'imagem', 0, 0), nota: 9 }];
  const neutros = [10, 11, 12, 13].map((i) => ({ ...post(`2026-10-${i}`, 'stories', 0, 0), nota: 1 }));
  const { estado, mudancas } = ajustar({ pesos: {}, amostras: {} }, [...bons, ...ruins, ...poucos, ...neutros], hoje);
  assert.equal(estado.pesos.tipo.reel, 1.2);
  assert.equal(estado.pesos.tipo.carrossel, 0.8);
  assert.equal(estado.pesos.tipo.imagem, 1, 'uma amostra só não muda nada');
  assert.ok(mudancas.some((m) => m.dimensao === 'tipo' && m.valor === 'reel'));
  let e = estado;
  for (let i = 0; i < 20; i++) e = ajustar(e, [...bons, ...ruins, ...neutros], hoje).estado;
  assert.equal(e.pesos.tipo.carrossel, 0.1, 'o que flopa perde espaço, mas não some');
  assert.ok(e.pesos.tipo.reel <= 3, 'o peso vai na direção da nota relativa, sem crescer sem fim');
});

test('estratégia: com menos de 12 posts maduros (D+3) de 3 semanas não mexe em nada', () => {
  const verdes = Array.from({ length: 12 }, (_, i) => ({ ...post(`2026-11-${10 + (i % 3)}`, 'reel', 0, 0), idade: 1, nota: i }));
  assert.deepEqual(ajustar({ pesos: {}, amostras: {} }, verdes, '2026-11-14').mudancas, []);
  const umaSemana = Array.from({ length: 12 }, (_, i) => ({ ...post('2026-11-10', i % 2 ? 'reel' : 'carrossel', 0, 0), nota: i % 2 ? 3 : 0.1 }));
  assert.deepEqual(ajustar({ pesos: {}, amostras: {} }, umaSemana, '2026-11-14').mudancas, []);
});

test('estratégia: post de mais de 8 semanas não conta; o semanal rodado 2x não ajusta 2x', () => {
  const velhos = [1, 2, 3, 4].map((i) => ({ ...post(`2026-08-0${i}`, 'reel', 0, 0), nota: 5 }));
  const { estado } = ajustar({ pesos: {}, amostras: {} }, velhos, '2026-11-14');
  assert.equal(estado.pesos.tipo?.reel, undefined);

  const raiz = tmp();
  gravar(path.join(raiz, 'estrategia', 'estado.json'), { atualizado_em: '2026-11-14', pesos: { tipo: { reel: 1.5 } }, amostras: {} });
  const r = atualizarEstrategia(raiz, '2026-11-15');
  assert.equal(r.estado.pesos.tipo.reel, 1.5);
  assert.match(r.resumo, /Ainda pouco dado/);
});

test('estratégia: com dado suficiente o resumo lista melhores, piores e pesos', () => {
  const ps = Array.from({ length: 9 }, (_, i) => ({ ...post(`2026-11-0${i + 1}`, 'carrossel', 0, 0), nota: i / 4 }));
  const txt = resumoParaPlano({ pesos: { tipo: { carrossel: 1.1 } }, amostras: { tipo: { carrossel: 9 } } }, ps);
  assert.match(txt, /Melhores/);
  assert.match(txt, /carrossel 1.1 \(9\)/);
});

// ---------- banco reserva ----------

const HOJE = '2026-11-14';
const SEMANA = '2026-11-16';

/** Banco com um carrossel evergreen (5 slides) guardado. */
function bancoComCarrossel(extra = {}) {
  const banco = tmp();
  const origem = tmp();
  const arquivos = [1, 2, 3, 4, 5].map((i) => `2026-11-09-R1-0${i}.jpg`);
  for (const a of arquivos) writeFileSync(path.join(origem, a), jpeg(1080, 1350));
  const entrada = {
    id: 'R1', dia: '2026-11-09', horario: '07:40', tipo: 'carrossel', arquivos, tema: 'clinica · a clínica num lugar só', gancho: 'Agenda, ficha e orçamento no mesmo lugar?',
    ramo: 'clinica', objetivo: 'conversa', ia: false, origem: 'agente', fatos: ['clin.agenda'], tentativas: 1,
    legenda: 'Agenda, ficha e orçamento no mesmo lugar?\n\nNa Mazzi a agenda, a ficha com fotos e o orçamento ficam juntos.\n\nChama no WhatsApp (link na bio).', ...extra,
  };
  guardar(banco, entrada, origem, { rid: 'r-carrossel', hoje: '2026-11-01' });
  return banco;
}

test('reserva: guarda, conta o que falta para o mínimo e não guarda dia/horário', () => {
  const banco = bancoComCarrossel();
  const [r] = lerReserva(banco);
  assert.equal(r.dia, undefined);
  assert.deepEqual(r.usada_em, []);
  const st = situacao(banco, { produto, hoje: HOJE });
  assert.equal(st.total, 1);
  assert.deepEqual(st.faltam.sort(), ['carrossel', 'reel', 'reel', 'stories', 'stories']);
});

test('reserva: revalida contra a base atual, palavras proibidas e a regra dos 90 dias', () => {
  const [r] = lerReserva(bancoComCarrossel());
  assert.deepEqual(motivosParaNaoUsar(r, { produto, hoje: HOJE }), []);
  assert.match(motivosParaNaoUsar({ ...r, usada_em: ['2026-10-01'] }, { produto, hoje: HOJE }).join(), /90 dias/);
  assert.deepEqual(motivosParaNaoUsar({ ...r, usada_em: ['2026-08-01'] }, { produto, hoje: HOJE }), []);
  assert.match(motivosParaNaoUsar({ ...r, fatos: ['fiscal.nfce'] }, { produto, hoje: HOJE }).join(), /não está mais no ar/);
  assert.ok(motivosParaNaoUsar({ ...r, legenda: 'A partir de R$ 99 por mês' }, { produto, hoje: HOJE }).length > 0);
});

test('reserva: pega para o lugar da peça, renomeia as mídias, passa no validador e marca o uso', async () => {
  const banco = bancoComCarrossel();
  const saida = tmp();
  const item = { id: 'B', dia: '2026-11-18', horario: '11:40', ramo: 'clinica' };
  const r = await criarReserva({ raiz: banco, saida, produto }).pegar({ tipo: 'carrossel', item, semana: SEMANA, hoje: HOJE });
  assert.equal(r.origemId, 'r-carrossel');
  assert.equal(r.entrada.id, 'B');
  assert.equal(r.entrada.dia, '2026-11-18');
  assert.equal(r.entrada.origem, 'reserva');
  assert.deepEqual(r.entrada.arquivos, [1, 2, 3, 4, 5].map((i) => `${SEMANA}-B-0${i}.jpg`));
  for (const a of r.entrada.arquivos) assert.ok(existsSync(path.join(saida, 'semanas', SEMANA, a)));
  assert.deepEqual(lerReserva(banco)[0].usada_em, [HOJE]);
  const de_novo = await criarReserva({ raiz: banco, saida, produto }).pegar({ tipo: 'carrossel', item, semana: SEMANA, hoje: HOJE });
  assert.equal(de_novo, null, 'usada hoje: só volta em 90 dias');
});

test('reserva: no ensaio não gasta a vez; formato errado não serve; stories não ocupam feed', async () => {
  const banco = bancoComCarrossel();
  const item = { id: 'B', dia: '2026-11-18', horario: '11:40', ramo: 'clinica' };
  const r = await criarReserva({ raiz: banco, saida: tmp(), produto, marcar: false }).pegar({ tipo: 'carrossel', item, semana: SEMANA, hoje: HOJE });
  assert.ok(r);
  assert.deepEqual(lerReserva(banco)[0].usada_em, []);
  assert.equal(await criarReserva({ raiz: banco, saida: tmp(), produto }).pegar({ tipo: 'stories', item: { ...item, id: 'S1' }, semana: SEMANA, hoje: HOJE }), null);
});

test('reserva: mídia quebrada não entra e não deixa arquivo na semana', async () => {
  const banco = bancoComCarrossel();
  writeFileSync(path.join(lerReserva(banco)[0].pasta, '2026-11-09-R1-03.jpg'), jpeg(1080, 1080));
  const saida = tmp();
  const r = await criarReserva({ raiz: banco, saida, produto }).pegar({ tipo: 'carrossel', item: { id: 'B', dia: '2026-11-18', horario: '11:40' }, semana: SEMANA, hoje: HOJE });
  assert.equal(r, null);
  assert.deepEqual(readdirSync(path.join(saida, 'semanas', SEMANA)), []);
});

test('reserva: pautas evergreen só usam funções no ar', () => {
  const noAr = new Set(produto.funcoes.filter((f) => f.status === 'no_ar').map((f) => f.id));
  for (const p of pautasEvergreen(produto)) for (const f of p.fatos) assert.ok(noAr.has(f), f);
});

// ---------- orquestrador com o banco ----------

const capturaFalsa = async (paginas) => paginas.map((p) => {
  mkdirSync(path.dirname(p.arquivo), { recursive: true });
  writeFileSync(p.arquivo, p.formato === 'story' ? jpeg(1080, 1920) : jpeg(1080, 1350));
  return p.arquivo;
});
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
const cerebroFalso = (conteudo) => ({ economico: () => false, pedir: async () => conteudo, juiz: () => async () => ({ problemas: [], afirmacoes: [], notas: { original: 8, humano: 8, marca: 8, novidade: 8, clareza: 8 }, cfm: [], sugestoes: [] }) });

test('encherReserva: produz o formato que falta e guarda a peça aprovada no banco', async () => {
  const banco = tmp();
  const saida = tmp();
  const feitas = await encherReserva({ banco, maximo: 1, raiz: RAIZ, saida, semana: SEMANA, produto, config, cerebro: cerebroFalso(carrosselBom), usados: [], hoje: HOJE, registrar: criarRegistro(saida), capturar: capturaFalsa });
  assert.deepEqual(feitas, [{ tipo: 'carrossel', status: 'aprovada' }]);
  const [r] = lerReserva(banco);
  assert.equal(r.tipo, 'carrossel');
  assert.equal(r.arquivos.length, 5);
  assert.ok(r.arquivos.every((a) => existsSync(path.join(r.pasta, a))));
  assert.equal(existsSync(path.join(saida, 'semanas')), false, 'nada da reserva vai para a semana');
});

test('cobrirComReserva e modo só reserva: o que falta sai do banco; sem banco, fica sem post', async () => {
  const banco = bancoComCarrossel();
  const saida = tmp();
  const dir = path.join(saida, 'semanas', SEMANA);
  const itens = [
    { id: 'A', dia: SEMANA, horario: '11:40', tipo: 'carrossel', ramo: 'clinica', objetivo: 'conversa', conteudo: 'dor', tema: 't', angulo: 'um ângulo qualquer', fatos: ['clin.agenda'] },
    { id: 'S1', dia: SEMANA, horario: '07:40', tipo: 'stories', ramo: 'clinica', objetivo: 'conversa', conteudo: 'dor', tema: 't', angulo: 'um ângulo qualquer', fatos: ['clin.agenda'] },
  ];
  gravar(path.join(dir, 'plano.json'), { semana: SEMANA, pecas: itens });
  const ctx = { raiz: RAIZ, saida, semana: SEMANA, produto, config, usados: [], hoje: SEMANA, registrar: criarRegistro(saida), reserva: criarReserva({ raiz: banco, saida, produto }) };
  const r = await cobrirComReserva({ ...ctx, desde: SEMANA, ate: SEMANA });
  assert.deepEqual(r, { cobertas: ['A'], descobertas: ['S1'] });
  const agenda = JSON.parse(readFileSync(path.join(dir, 'agenda.json'), 'utf8'));
  assert.equal(agenda.pecas[0].origem, 'reserva');
  const plano = JSON.parse(readFileSync(path.join(dir, 'plano.json'), 'utf8'));
  assert.deepEqual(plano.pecas.map((p) => p.situacao), ['reserva', 'pulada']);

  const so = await produzirPeca(itens[1], { ...ctx, soReserva: true, cerebro: { juiz: () => { throw new Error('não pode chamar o Claude'); } } });
  assert.equal(so.status, 'pulada');
});

test('avisos: 2 horários seguidos sem post viram aviso', () => {
  const saida = tmp();
  const seg = '2026-11-16';
  gravar(path.join(saida, 'semanas', seg, 'plano.json'), { semana: seg, pecas: [
    { id: 'A', dia: seg, horario: '11:40', situacao: 'aprovada' },
    { id: 'S1', dia: '2026-11-17', horario: '07:40', situacao: 'pulada' },
    { id: 'B', dia: '2026-11-17', horario: '11:40', situacao: 'pulada' },
  ] });
  const avisos = avisosDaReserva({ saida, hoje: seg, produto, banco: tmp() });
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].mensagem, /S1 e B/);
  assert.equal(avisosDaReserva({ saida, hoje: '2026-11-18', produto, banco: tmp() }).length, 0, 'o que já passou não avisa');
});

// ---------- relatório ----------

test('relatório: junta o que saiu, a reserva, reprovações, honestidade com pouco dado, uso e tamanho', () => {
  const raiz = repoPublicado();
  const reg = path.join(raiz, 'registro');
  gravar(path.join(reg, '2026-11-12.jsonl'), [
    { em: '2026-11-12T06:00:00Z', tipo: 'aprovada', peca: '2026-11-16/A' },
    { em: '2026-11-12T06:01:00Z', tipo: 'reprovada', peca: '2026-11-16/B', motivos: ['gancho fraco (nota 40)'] },
    { em: '2026-11-12T06:02:00Z', tipo: 'reserva', peca: '2026-11-16/B', detalhe: 'usou a reserva r1' },
    { em: '2026-11-12T06:03:00Z', tipo: 'base', detalhe: 'adicionadas: clin.nova; recusadas: 0; ramos sem base: nenhum' },
  ].map((l) => JSON.stringify(l)).join('\n'));
  const f = gravarRelatorio({ saida: raiz, raiz, hoje: '2026-11-14', semanaIso: '2026-W46', reserva: { total: 2, por: { carrossel: 1, reel: 1, stories: 0 }, faltam: ['carrossel', 'reel', 'stories', 'stories'] }, gasto: 1.234 });
  const t = readFileSync(f, 'utf8');
  assert.ok(f.endsWith(path.join('relatorios', '2026-W46.md')));
  assert.match(t, /07\/11 a 13\/11/);
  assert.match(t, /10\/11 carrossel: Paciente faltou\?/);
  assert.match(t, /gancho fraco/);
  assert.match(t, /banco reserva: 1 \(2026-11-16\/B\)/);
  assert.match(t, /Só 0 post\(s\) com métrica/);
  assert.match(t, /clin\.nova/);
  assert.match(t, /US\$ 1\.23/);
  assert.match(t, /MB/);
  assert.equal(montarRelatorio({ semanaIso: 'x', de: '2026-01-01', ate: '2026-01-07', raiz: tmp() }).includes('Nada publicado'), true);
});

test('relatório: o período é de 7 dias terminando ontem', () => {
  assert.equal(dataMais('2026-11-14', -7), '2026-11-07');
});
