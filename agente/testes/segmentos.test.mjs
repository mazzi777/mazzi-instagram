// Ramos do aj-clinic e política de divulgação (spa bloqueado por padrão).
// Fixtures INVENTADAS: imitam só a forma geral (uma lista de strings num .ts; seções "## " num
// changelog). Nomes, imports, comentários e textos foram escritos aqui; nada do aj-clinic (privado)
// é reproduzido neste repositório (público). Nenhum teste chama a Meta, o Claude ou o publicador,
// e nenhum grava a base real (os que passam pelo semanal usam um arquivo temporário).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lerProduto } from '../checagens/fatos.mjs';
import { palavrasProibidas } from '../checagens/nunca.mjs';
import { lerVerticals, descobrirVerticals, validarVerticals, ramosAtivos, filtrarCandidatas, atualizarBase, FONTES_VERTICALS } from '../base/atualizar.mjs';
import { SEGMENTOS, MOTIVO_BLOQUEIO, ramoLiberado, motivoBloqueio, separarSecoes, segmentosBloqueadosNoTexto, tirarEscopoBloqueado } from '../base/segmentos.mjs';
import { Agenda, Produto, validar } from '../lib/schemas.mjs';
import { passoBaseSemanal } from '../agente.mjs';

const produto = lerProduto();
const [VERT, PERM] = FONTES_VERTICALS;
const BLOQ = new RegExp(MOTIVO_BLOQUEIO.slice(0, 30));

// Arquivo "antigo" (lista junto de outras declarações) e "novo" (lista num arquivo próprio; o antigo
// deixa de declarar a lista). Conteúdo inventado.
const PERM_ANTIGO = `import { util } from './util';\nexport const PAPEIS = ['dono', 'equipe'] as const;\nexport const VERTICALS = ['clinic', 'restaurant'] as const;\n`;
const PERM_NOVO = `import { util } from './util';\nexport const PAPEIS = ['dono'] as const;\n`;
const VERT_NOVO = `// lista de ramos (fixture)\nexport const VERTICALS = [\n  'clinic',\n  'restaurant',\n  'spa',\n] as const;\n`;

// Changelog inventado.
const TITULO_SPA = 'Março de 2027 (2): ramo Spa';
const SECAO_SPA = `## ${TITULO_SPA}

- **Aulas em grupo** com lista de presença.
- **Vale-presente** com código para o cliente.
- **Painel de recursos** igual ao da clínica e do restaurante.`;
const TITULO_CLIN = 'Março de 2027 (3): lembrete com a logo da clínica';
const SECAO_CLINICA = `## ${TITULO_CLIN}

- A clínica pode pôr a logo no lembrete do WhatsApp.
- Igual ao que o spa vai ter depois,
  quando chegar a vez dele.`;
const TITULO_REST = 'Março de 2027 (4): caixa com Pix';
const SECAO_REST = `## ${TITULO_REST}

- O caixa do restaurante mostra o QR do Pix com o valor.`;
const NOVIDADES = `# Novidades\n\n${SECAO_SPA}\n\n${SECAO_CLINICA}\n\n${SECAO_REST}\n`;

const tmp = () => mkdtempSync(path.join(tmpdir(), 'mazzi-ajclinic-'));
function cloneFalso(arquivos) {
  const dir = tmp();
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), conteudo);
  }
  return dir;
}
async function comClone(dir, fn) {
  const anterior = process.env.AJ_CLINIC_DIR;
  process.env.AJ_CLINIC_DIR = dir;
  try {
    return await fn();
  } finally {
    if (anterior === undefined) delete process.env.AJ_CLINIC_DIR;
    else process.env.AJ_CLINIC_DIR = anterior;
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- descoberta de VERTICALS
test('verticals: lê a estrutura nova (arquivo próprio) e a antiga (junto de outras declarações)', () => {
  assert.deepEqual(descobrirVerticals({ [VERT]: VERT_NOVO, [PERM]: PERM_NOVO }), { verticals: ['clinic', 'restaurant', 'spa'], fonte: VERT, problemas: [] });
  assert.deepEqual(descobrirVerticals({ [VERT]: null, [PERM]: PERM_ANTIGO }).verticals, ['clinic', 'restaurant']);
  assert.equal(descobrirVerticals({ [PERM]: PERM_ANTIGO }).fonte, PERM);
});

test('verticals: formatação diferente (quebra de linha, aspas, comentário, tipo, vírgula no fim)', () => {
  const ts = `export const VERTICALS: readonly string[] = [\n  "clinic", // a primeira\n  /* restaurante */ 'restaurant',\n  'spa',\n] as const;`;
  assert.deepEqual(lerVerticals(ts), ['clinic', 'restaurant', 'spa']);
  assert.deepEqual(lerVerticals("VERTICALS=['clinic','restaurant']"), ['clinic', 'restaurant']);
  // Import e uso do nome não são a declaração; a declaração vem depois.
  assert.deepEqual(lerVerticals(`import { VERTICALS } from './v';\nif (x === VERTICALS) {}\nconst VERTICALS = ['clinic'];`), ['clinic']);
  // "VERTICALS = [...]" dentro de uma string não é a declaração.
  assert.deepEqual(lerVerticals(`const s = 'VERTICALS = ["clinic"]';\nexport const VERTICALS = ['clinic', 'restaurant'];`), ['clinic', 'restaurant']);
  assert.deepEqual(lerVerticals(`const a = "it's"; // VERTICALS = ['x']\nexport const VERTICALS = ['clinic'];`), ['clinic']);
});

test('verticals: ausente, vazio, malformado ou estrutura inesperada não lançam na descoberta e não liberam nada', () => {
  for (const [caso, arquivos] of [
    ['nenhum arquivo', {}],
    ['clone sem os arquivos', { [VERT]: null, [PERM]: null }],
    ['sem declaração', { [PERM]: PERM_NOVO }],
    ['lista vazia', { [VERT]: 'export const VERTICALS = [] as const;' }],
    ['spread', { [VERT]: "export const VERTICALS = [...OUTROS, 'spa'] as const;" }],
    ['variável', { [VERT]: 'export const VERTICALS = LISTA;' }],
    ['congelada', { [VERT]: "export const VERTICALS = Object.freeze(['clinic']);" }],
    ['re-export', { [VERT]: "export { VERTICALS } from './outro';" }],
    ['sem fechar', { [VERT]: "export const VERTICALS = ['clinic', 'rest" }],
    ['item estranho', { [VERT]: "export const VERTICALS = ['clinic', 'DROP TABLE'] as const;" }],
    ['repetido', { [VERT]: "export const VERTICALS = ['clinic', 'clinic'] as const;" }],
  ]) {
    const r = descobrirVerticals(arquivos);
    assert.equal(r.verticals, null, caso);
    assert.ok(r.problemas.length, caso);
  }
  assert.throws(() => validarVerticals([]), /vazio/);
  assert.throws(() => lerVerticals('nada aqui'), /VERTICALS/);
});

test('verticals: o parser nunca executa o arquivo (código no arquivo não roda)', () => {
  globalThis.__executou = false;
  const ts = "globalThis.__executou = true;\nexport const VERTICALS = ['clinic', 'restaurant'] as const;";
  assert.deepEqual(lerVerticals(ts), ['clinic', 'restaurant']);
  assert.equal(globalThis.__executou, false);
});

test('verticals: arquivo novo quebrado cai no antigo; os dois quebrados = sem lista; erro sem copiar conteúdo', () => {
  const r = descobrirVerticals({ [VERT]: 'export const VERTICALS = OUTRA;', [PERM]: PERM_ANTIGO });
  assert.deepEqual(r.verticals, ['clinic', 'restaurant']);
  assert.match(r.problemas[0], /estrutura inesperada/);
  assert.equal(descobrirVerticals({ [VERT]: 'x', [PERM]: PERM_NOVO }).verticals, null);
  const priv = descobrirVerticals({ [VERT]: "export const VERTICALS = ['clinic', 'NOME-PRIVADO'] as const;" });
  assert.doesNotMatch(priv.problemas.join(' '), /NOME-PRIVADO/);
  assert.match(priv.problemas.join(' '), /posição 2/);
});

// ---------------------------------------------------------------- política (gate do spa)
test('política: spa bloqueado por padrão, sem configuração nenhuma', () => {
  assert.equal(SEGMENTOS.spa.divulgar, false);
  assert.equal(ramoLiberado('spa'), null);
  assert.equal(motivoBloqueio('spa'), MOTIVO_BLOQUEIO);
  assert.equal(motivoBloqueio('clinic'), null);
  assert.equal(ramoLiberado('clinic'), 'clinica');
  assert.equal(ramoLiberado('restaurant'), 'restaurante');
  // Ramo desconhecido também não libera; nem nome de propriedade herdada.
  for (const v of ['barbershop', 'toString', '__proto__', 'constructor']) assert.equal(ramoLiberado(v), null, v);
  assert.ok(Object.isFrozen(SEGMENTOS) && Object.isFrozen(SEGMENTOS.spa) && Object.isFrozen(SEGMENTOS.spa.termos) && Object.isFrozen(SEGMENTOS.spa.sinais));
  // O motivo público não nomeia o ramo (registro e issue são públicos).
  assert.doesNotMatch(MOTIVO_BLOQUEIO, /spa/i);
});

test('política: spa em VERTICALS não vira ramo; clínica e restaurante seguem', () => {
  assert.deepEqual(ramosAtivos(produto, ['clinic', 'restaurant', 'spa']), { ativos: ['clinica', 'restaurante'], semBase: ['spa'] });
});

test('política: liberação só é explícita (política de teste, não a de produção)', () => {
  const liberada = { ...SEGMENTOS, spa: { ...SEGMENTOS.spa, ramo: 'clinica', divulgar: true } };
  assert.equal(ramoLiberado('spa', liberada), 'clinica');
  assert.equal(SEGMENTOS.spa.divulgar, false, 'a de produção continua bloqueada');
  // Valor "parecido" com sim não libera: só o booleano true.
  for (const v of ['true', 1, 'sim', {}]) assert.equal(ramoLiberado('spa', { spa: { ...SEGMENTOS.spa, ramo: 'clinica', divulgar: v } }), null, String(v));
});

test('política: termos por palavra inteira, sem acento, invisível, largura total e hashtag de setor', () => {
  for (const t of ['Agenda do SPA', 'day  spa', 'ＳＰＡ', 's\u200bpa', 'Spás', '#spa', '#dayspa', '#SpaDay', '#spabrasil', '#bemestarspa', '#spaurbano', '#spasp']) {
    assert.deepEqual(segmentosBloqueadosNoTexto(t), ['spa'], t);
  }
  // Palavras que só começam ou terminam igual não contam (restaurante usa várias).
  for (const t of ['o espaço da clínica', 'espaçamento', 'spam', 'Spaço Gourmet', '#caspa', '#espaco', '#spaghetti', '#spaghettibolonhesa', '#spanakopita', '#SPAtula', '#vespa', '#cabelocrespa', '']) {
    assert.deepEqual(segmentosBloqueadosNoTexto(t), [], t);
  }
});

test('política: sinais do ramo (massagem, cabine) só valem no changelog e nas candidatas, não reprovam peça de clínica', () => {
  for (const t of ['Massagem modeladora e drenagem na agenda da clínica', 'Cabine de bronzeamento', 'Sala ou cabine do procedimento']) {
    assert.deepEqual(segmentosBloqueadosNoTexto(t), [], t);
    assert.deepEqual(palavrasProibidas(t), [], t);
    assert.deepEqual(segmentosBloqueadosNoTexto(t, SEGMENTOS, { comSinais: true }), ['spa'], t);
  }
});

// ---------------------------------------------------------------- changelog por contexto
test('changelog: seção do spa sai inteira (mesmo citando clínica e restaurante); as outras seguem', () => {
  const corpo = (sec) => sec.split('\n').slice(2).join('\n');
  const secoes = [
    { titulo: TITULO_SPA, texto: corpo(SECAO_SPA) },
    { titulo: TITULO_CLIN, texto: corpo(SECAO_CLINICA) },
    { titulo: TITULO_REST, texto: corpo(SECAO_REST) },
  ];
  const { liberadas, bloqueadas } = separarSecoes(secoes);
  assert.deepEqual(bloqueadas.map((b) => b.titulo), [TITULO_SPA]);
  assert.equal(bloqueadas[0].motivo, MOTIVO_BLOQUEIO);
  assert.deepEqual(liberadas.map((s) => s.titulo), [TITULO_CLIN, TITULO_REST]);
  // A seção da clínica não é bloqueada por citar o spa: só o ITEM que cita sai (com a linha de continuação).
  assert.match(liberadas[0].texto, /logo no lembrete/);
  assert.doesNotMatch(liberadas[0].texto, /spa|quando chegar a vez/i);
  assert.equal(liberadas[0].linhasRemovidas, 1);
  assert.equal(liberadas[1].linhasRemovidas, 0);
});

test('changelog: o escopo de uma citação ao spa sai inteiro (subtítulo, item-pai, rótulo, frase de abertura)', () => {
  const casos = {
    subtitulo: '- Agenda mais rápida.\n\n### Spa\n- Aulas em grupo.\n- Vale-presente.\n#### Detalhes\n- Código do vale.\n\n### Clínica\n- Logo no lembrete.',
    itemPai: '- Agenda mais rápida.\n- Para o spa:\n  - Aulas em grupo.\n  - Vale-presente.\n- Logo no lembrete.',
    rotulo: '- Agenda mais rápida.\n\n**Spa**\n- Aulas em grupo.\n- Vale-presente.\n\n**Clínica**\n- Logo no lembrete.',
    abertura: 'Para o spa (tipo de negócio novo):\n- Aulas em grupo.\n- Vale-presente.\n\nPara a clínica:\n- Logo no lembrete.',
    continuacao: '- Aulas em grupo, para\n  quem usa o spa.\n- Logo no lembrete.',
    rotuloComTexto: '**Spa**\nAulas em grupo com lista de presença e Vale-presente.\n\n**Clínica**\nLogo no lembrete.',
    paragrafoQuebrado: 'Novidade para spas:\nAgora dá para marcar Aulas em grupo e vender Vale-presente.\n\nNa clínica: Logo no lembrete.',
    continuacaoSemRecuo: '- **Spa:** Aulas em grupo,\nimpedindo Vale-presente duplicado.\n- Logo no lembrete.',
    sublinhado: 'Spa\n---\n- Aulas em grupo.\n- Vale-presente.\n\nClínica\n---\n- Logo no lembrete.',
    citacao: '> Spa\n> - Aulas em grupo.\n> - Vale-presente.\n\nNa clínica:\n- Logo no lembrete.',
    html: '<details><summary>Spa</summary>\nAulas em grupo e Vale-presente.\n</details>\n\n### Clínica\n- Logo no lembrete.',
    paragrafosSeguidos: 'Para o spa:\n\nAulas em grupo.\n\nVale-presente.\n\n### Restaurante e clínica\n- Logo no lembrete.',
    itemSoltoComContinuacao: '- Spa: Aulas em grupo\n\n  Vale-presente com código.\n\n      Código do vale\n\n- Logo no lembrete.',
    rotuloComSubtitulo: '**Spa** (novo):\n#### Agenda\n- Aulas em grupo\n- Vale-presente\n\n### Clínica\n- Logo no lembrete.',
  };
  for (const [caso, texto] of Object.entries(casos)) {
    const r = tirarEscopoBloqueado(texto);
    assert.doesNotMatch(r.texto, /Aulas em grupo|Vale-presente|Código do vale|spa/i, caso);
    assert.match(r.texto, /Logo no lembrete/, caso);
    assert.ok(r.removidos >= 1, caso);
  }
});

test('changelog: depois de um bloco que cita o spa, o que vem sem rótulo próprio também sai (na dúvida, fora)', () => {
  const r = tirarEscopoBloqueado('**Spa**\nAulas em grupo.\n\n- Vale-presente.\n- Logo no lembrete.\n\n### Restaurante\n- QR do Pix.');
  assert.doesNotMatch(r.texto, /Aulas|Vale-presente|Logo no lembrete/);
  assert.match(r.texto, /QR do Pix/);
});

test('changelog: "ramo X" / "Ramo: X" sem liberação sai; títulos genéricos com "ramo" não', () => {
  for (const t of ['Dezembro de 2026: ramo barbearia', 'Ramo: barbearia']) assert.equal(separarSecoes([{ titulo: t, texto: '- Encaixe.' }]).bloqueadas.length, 1, t);
  for (const t of ['Dezembro de 2026: fonte do ramo de cada negócio', 'Dezembro de 2026: ramo restaurante ganha balança', 'Por ramo e por unidade', 'Ramos de atividade no cadastro',
    'Ramo estética', 'Restaurante: escolha do ramo no convite', 'Convite com o ramo certo', 'Cada ramo com sua cor']) {
    assert.equal(separarSecoes([{ titulo: t, texto: '- x' }]).bloqueadas.length, 0, t);
  }
});

test('changelog: seção marcada como não liberada sai inteira, cite o ramo ou não', () => {
  for (const titulo of ['Abril de 2027: aulas e pacotes (não publicado)', 'Abril de 2027: novidades em breve', 'Abril de 2027: recursos (não liberado)']) {
    assert.equal(separarSecoes([{ titulo, texto: '- Aulas em grupo na agenda.' }]).bloqueadas.length, 1, titulo);
  }
  // No corpo, só uma linha que seja o próprio marcador tira a seção; frase comum de clínica não.
  for (const marcador of ['(não publicado)', '**Status: em breve**', '> Uso interno', 'Ainda não publicado.']) {
    assert.equal(separarSecoes([{ titulo: 'Abril de 2027: agenda', texto: `${marcador}\n- Aulas na agenda.` }]).bloqueadas.length, 1, marcador);
  }
  for (const frase of ['- A consulta é em breve: o lembrete avisa.', '- O sistema não divulga dados do paciente.', '- Orçamento não publicado fica como rascunho.']) {
    assert.equal(separarSecoes([{ titulo: 'Abril de 2027: clínica', texto: frase }]).bloqueadas.length, 0, frase);
  }
  const { aprovadas } = filtrarCandidatas([{ id: 'comum.aulas', ramo: 'comum', fato: 'Aulas em grupo escolhidas na agenda.', fonte: 'Abril (não publicado): x' }], produto, { 'Abril (não publicado): x': '- Aulas.' });
  assert.deepEqual(aprovadas, []);
});

test('candidatas: fonte que não é uma das seções enviadas é recusada (ex.: seção bloqueada sem o nome do ramo)', () => {
  const secoes = { 'Abril: Pix': '- QR do Pix no caixa.' };
  const { aprovadas, recusadas } = filtrarCandidatas([
    { id: 'comum.aulas2', ramo: 'comum', fato: 'Aulas em grupo na agenda.', fonte: 'Abril: aulas e pacotes' },
    { id: 'rest.pix-qr4', ramo: 'restaurante', fato: 'O caixa mostra o QR do Pix com o valor da venda.', fonte: 'Abril: Pix' },
  ], produto, secoes);
  assert.deepEqual(aprovadas.map((a) => a.id), ['rest.pix-qr4']);
  assert.match(recusadas[0].motivo, /fonte fora/);
});

test('candidatas: função do spa é recusada mesmo rotulada como comum ou clínica (termo ou sinal)', () => {
  const { aprovadas, recusadas } = filtrarCandidatas([
    { id: 'comum.spa-aulas', ramo: 'comum', fato: 'O spa marca aulas em grupo na agenda.', fonte: 'Nov 2026: aulas' },
    { id: 'clin.cabines', ramo: 'clinica', fato: 'Agenda com cabines por horário.', fonte: 'Nov 2026: cabines' },
    { id: 'rest.pix-qr2', ramo: 'restaurante', fato: 'O caixa mostra o QR do Pix com o valor da venda.', fonte: 'Nov 2026: pix' },
  ], produto);
  assert.deepEqual(aprovadas.map((a) => a.id), ['rest.pix-qr2']);
  assert.ok(recusadas.length === 2 && recusadas.every((r) => r.motivo === MOTIVO_BLOQUEIO));
});

// ---------------------------------------------------------------- passo completo da base
test('base: estrutura atual (lista no arquivo novo + seção do spa) não para a semana, não manda a seção do spa ao Claude e nada do spa entra', async () => {
  let enviado = '';
  const extrair = async (_tarefa, texto) => {
    enviado = texto;
    // O Claude "erra" de propósito: rotula como comum uma coisa da seção do spa.
    return { funcoes: [
      { id: 'comum.aulas', ramo: 'comum', fato: 'Aulas em grupo com lista de presença.', fonte: TITULO_SPA },
      { id: 'clin.logo-lembrete', ramo: 'clinica', fato: 'A clínica pode pôr a logo no lembrete do WhatsApp.', fonte: TITULO_CLIN },
      { id: 'rest.pix-qr3', ramo: 'restaurante', fato: 'O caixa do restaurante mostra o QR do Pix com o valor.', fonte: TITULO_REST },
    ] };
  };
  const r = await atualizarBase({ produto, novidadesMd: NOVIDADES, arquivos: { [VERT]: VERT_NOVO, [PERM]: PERM_NOVO }, extrair, hoje: '2026-11-21' });
  assert.doesNotMatch(enviado, /spa|Aulas em grupo|Vale-presente|Painel de recursos/i, 'a seção do spa nem chega ao Claude');
  assert.match(enviado, /logo no lembrete/);
  assert.match(enviado, /QR do Pix/);
  // A candidata da seção do spa é recusada (a fonte cita o ramo e não está entre as seções enviadas).
  assert.deepEqual(r.adicionadas.map((a) => a.id).sort(), ['clin.logo-lembrete', 'rest.pix-qr3']);
  assert.deepEqual(r.produto.ramos, ['clinica', 'restaurante']);
  assert.equal(r.fonteVerticals, VERT);
  assert.equal(r.bloqueados.length, 1);
  assert.deepEqual(r.secoesBloqueadas.map((s) => s.titulo), [TITULO_SPA]);
  // A seção bloqueada não fica como lida (quando o spa for liberado, ela é lida).
  assert.ok(!r.produto.novidades_vistas.includes(TITULO_SPA));
  assert.ok(r.produto.novidades_vistas.includes(TITULO_REST));
  assert.ok(!JSON.stringify(r.produto.funcoes).match(/(?<![\p{L}])spa(?![\p{L}])/iu), 'nada do spa nas funções');
  validar(Produto, r.produto);

  // Rodada seguinte: a seção do spa continua de fora e não gasta o Claude.
  let chamou = false;
  await atualizarBase({ produto: r.produto, novidadesMd: NOVIDADES, arquivos: { [VERT]: VERT_NOVO }, extrair: async () => { chamou = true; return { funcoes: [] }; }, hoje: '2026-11-28' });
  assert.equal(chamou, false);
});

test('base: sem lista de ramos confiável, mantém os ramos anteriores, segura as novidades e alerta (não para, não libera)', async () => {
  let chamou = false;
  const r = await atualizarBase({ produto, novidadesMd: `# N\n\n${SECAO_REST}`, arquivos: { [VERT]: 'quebrado', [PERM]: PERM_NOVO }, extrair: async () => { chamou = true; return { funcoes: [] }; }, hoje: '2026-11-21' });
  assert.equal(chamou, false, 'novidades seguradas: um ramo novo poderia estar no changelog');
  assert.ok(!r.produto.novidades_vistas.includes(TITULO_REST));
  assert.match(r.alertas[0], /novidades seguradas/);
  assert.deepEqual(r.produto.ramos, produto.ramos);
  assert.equal(r.fonteVerticals, null);
  assert.match(r.alertas[0], /ramos do aj-clinic não lidos/);
  // Sem lista, um ramo que a política (de teste) não libera cai, mesmo estando na base anterior.
  const soClinica = { ...SEGMENTOS, restaurant: { ...SEGMENTOS.restaurant, divulgar: false } };
  const r2 = await atualizarBase({ produto, novidadesMd: '# N', arquivos: {}, extrair: async () => ({ funcoes: [] }), hoje: '2026-11-21', politica: soClinica });
  assert.deepEqual(r2.produto.ramos, ['clinica']);
});

test('base: aj-clinic na estrutura antiga continua igual a hoje', async () => {
  const r = await atualizarBase({ produto, novidadesMd: `# N\n\n${SECAO_REST}`, arquivos: { [VERT]: null, [PERM]: PERM_ANTIGO }, extrair: async () => ({ funcoes: [] }), hoje: '2026-11-21' });
  assert.deepEqual(r.produto.ramos, ['clinica', 'restaurante']);
  assert.equal(r.fonteVerticals, PERM);
  assert.deepEqual(r.alertas, []);
  assert.deepEqual(r.bloqueados, []);
});

test('base: ramo novo no código sem linha na política segura as novidades e alerta (o changelog fala dele em português)', async () => {
  let chamou = false;
  const md = '# N\n\n## Abril de 2027: barbearias ganham encaixe por cadeira\n- Encaixe por cadeira.\n\n## Abril de 2027: Pix\n- QR do Pix no caixa.';
  const r = await atualizarBase({ produto, novidadesMd: md, arquivos: { [VERT]: "export const VERTICALS = ['clinic', 'restaurant', 'barbershop'] as const;" }, extrair: async () => { chamou = true; return { funcoes: [] }; }, hoje: '2027-04-01' });
  assert.equal(chamou, false, 'nenhuma seção nova vai ao Claude');
  assert.deepEqual(r.adicionadas, []);
  assert.ok(!r.produto.novidades_vistas.some((t) => /barbearias|Pix/.test(t)), 'nada fica como lido: é lido depois da decisão');
  assert.deepEqual(r.produto.ramos, ['clinica', 'restaurante']);
  assert.ok(r.alertas.some((a) => /ramo\(s\) novo\(s\)/.test(a)));
  assert.doesNotMatch(r.alertas.join(' '), /barbershop/, 'o alerta (issue pública) não nomeia o ramo');
});

// ---------------------------------------------------------------- passo do semanal
test('semanal: falha na base (Claude fora) vira erro visível, sem a mensagem crua, e a semana segue com a base anterior', async () => {
  const antes = readFileSync(new URL('../base/produto.json', import.meta.url), 'utf8');
  const dir = cloneFalso({ 'docs/NOVIDADES.md': NOVIDADES, [VERT]: VERT_NOVO, [PERM]: PERM_NOVO });
  await comClone(dir, async () => {
    const erros = [];
    const log = [];
    const cerebro = { config: { modelos: { juiz: 'm' } }, pedir: async () => { throw new Error('falha com trecho privado do changelog'); } };
    const r = await passoBaseSemanal({ produto, cerebro, hoje: '2026-11-21', registrar: () => {}, erros, log, arquivoBase: path.join(dir, 'produto.json') });
    assert.equal(r.produto, produto, 'base anterior');
    assert.deepEqual(r.novidades, []);
    assert.equal(erros.length, 1);
    assert.doesNotMatch(JSON.stringify(erros) + log.join(' '), /trecho privado/);
    assert.match(log.join('\n'), /a semana segue com a base anterior/);
  });
  assert.equal(readFileSync(new URL('../base/produto.json', import.meta.url), 'utf8'), antes, 'a base real não muda');
});

test('semanal: lista ilegível vira alerta na lista de erros (issue), e a base segue', async () => {
  const dir = cloneFalso({ 'docs/NOVIDADES.md': '# N', [PERM]: PERM_NOVO });
  await comClone(dir, async () => {
    const erros = [];
    const cerebro = { config: { modelos: { juiz: 'm' } }, pedir: async () => ({ funcoes: [] }) };
    const r = await passoBaseSemanal({ produto, cerebro, hoje: '2026-11-21', registrar: () => {}, erros, log: [], arquivoBase: path.join(dir, 'produto.json') });
    assert.deepEqual(r.produto.ramos, produto.ramos);
    assert.equal(erros.length, 1);
    assert.match(erros[0].mensagem, /ramos do aj-clinic não lidos/);
  });
});

test('semanal: token, teto e limite na base param a rodada como antes (não viram erro duplicado)', async () => {
  const dir = cloneFalso({ 'docs/NOVIDADES.md': NOVIDADES, [VERT]: VERT_NOVO });
  await comClone(dir, async () => {
    const parar = Object.assign(new Error('teto simulado'), { parar: true });
    const cerebro = { config: { modelos: { juiz: 'm' } }, pedir: async () => { throw parar; } };
    const erros = [];
    await assert.rejects(passoBaseSemanal({ produto, cerebro, hoje: '2027-04-01', registrar: () => {}, erros, log: [], arquivoBase: path.join(dir, 'produto.json') }), /teto simulado/);
    assert.equal(erros.length, 0);
  });
});

test('semanal: o registro (público) não leva título de seção nem nome de ramo bloqueado', async () => {
  const dir = cloneFalso({ 'docs/NOVIDADES.md': NOVIDADES, [VERT]: VERT_NOVO });
  const registros = [];
  await comClone(dir, async () => {
    const cerebro = { config: { modelos: { juiz: 'm' } }, pedir: async () => ({ funcoes: [] }) };
    const erros = [];
    await passoBaseSemanal({ produto, cerebro, hoje: '2027-04-01', registrar: (x) => registros.push(x), erros, log: [], arquivoBase: path.join(dir, 'produto.json') });
    assert.deepEqual(erros, []);
  });
  const texto = JSON.stringify(registros);
  assert.match(texto, /seções fora: 1/);
  assert.doesNotMatch(texto, /spa|Março de 2027 \(2\)/i);
});

// ---------------------------------------------------------------- até a publicação
test('publicação: peça do spa não passa (ramo fora da agenda e texto barrado na lista NUNCA, com motivo público genérico)', () => {
  const peca = { id: 'A', dia: '2026-11-23', tipo: 'carrossel', arquivos: ['2026-11-23-A-01.jpg'], legenda: 'x', tema: 't', gancho: 'g',
    horario: '11:40', objetivo: 'conversa', ia: false, origem: 'agente', fatos: [] };
  assert.throws(() => validar(Agenda, { semana: '2026-11-23', pecas: [{ ...peca, ramo: 'spa' }] }), /ramo/);
  assert.ok(palavrasProibidas('Seu spa com salas organizadas e pacotes no controle.').some((m) => BLOQ.test(m)));
  assert.ok(palavrasProibidas('Agenda do Day Spa sem confusão. #spabrasil').length);
  assert.ok(palavrasProibidas('Agenda da clínica. #spabrasil').some((m) => BLOQ.test(m)));
  assert.deepEqual(palavrasProibidas('A agenda da clínica com espaço para encaixe.'), []);
  assert.ok(palavrasProibidas('spa').every((m) => !/spa/i.test(m)), 'o motivo não nomeia o ramo');
});

test('publicador: o último portão também barra ramo bloqueado (peça feita por qualquer caminho)', async () => {
  const { textoProibido, validarLegenda } = await import('../../publicar/validar.mjs');
  assert.ok(textoProibido('Agenda do seu spa sem confusão.', 'X').some((m) => m.includes(MOTIVO_BLOQUEIO)));
  assert.ok(textoProibido('Caixa do restaurante #spabrasil', 'X').length);
  assert.deepEqual(textoProibido('Spaghetti do dia no caixa do restaurante #spaghetti', 'X'), []);
  assert.deepEqual(textoProibido('Massagem modeladora na agenda da clínica', 'X'), []);
  if (validarLegenda) assert.ok(validarLegenda('Agenda do day spa organizada. #gestao', 'X').length);
});

test('candidatas: fonte com espaço ou maiúscula diferente do título continua valendo', () => {
  const { aprovadas } = filtrarCandidatas([{ id: 'rest.pix-qr5', ramo: 'restaurante', fato: 'O caixa mostra o QR do Pix com o valor da venda.', fonte: '  abril:   PIX ' }], produto, { 'Abril: Pix': '- QR do Pix.' });
  assert.deepEqual(aprovadas.map((a) => a.id), ['rest.pix-qr5']);
});

test('base: lista lida da fonte alternativa (a preferida quebrada) vira alerta', async () => {
  const r = await atualizarBase({ produto, novidadesMd: '# N', arquivos: { [VERT]: 'export const VERTICALS = OUTRA;', [PERM]: PERM_ANTIGO }, extrair: async () => ({ funcoes: [] }), hoje: '2026-11-21' });
  assert.equal(r.fonteVerticals, PERM);
  assert.match(r.alertas.join(' '), /fonte preferida deu problema/);
});

test('changelog: sinal do ramo no TÍTULO não tira a seção de clínica inteira (só o termo tira)', () => {
  const { bloqueadas, liberadas } = separarSecoes([{ titulo: 'Abril de 2027: massagem modeladora na agenda da clínica', texto: '- Agenda com massagem modeladora.\n- Logo no lembrete.' }]);
  assert.equal(bloqueadas.length, 0);
  // No corpo, o sinal tira o item.
  assert.doesNotMatch(liberadas[0].texto, /massagem/);
  assert.match(liberadas[0].texto, /Logo no lembrete/);
});

test('candidatas: fonte com caixa diferente ainda passa pela conferência de "não pronta" da seção', () => {
  const secoes = { 'Abril: comanda no celular': '- Comanda por mesa no celular do garçom (em teste no piloto).' };
  const { aprovadas, recusadas } = filtrarCandidatas([{ id: 'rest.comanda', ramo: 'restaurante', fato: 'Comanda por mesa no celular do garçom.', fonte: 'abril:  COMANDA no celular' }], produto, secoes);
  assert.deepEqual(aprovadas, []);
  assert.match(recusadas[0].motivo, /não estar pronta/);
});

test('publicador: alt_text também passa pelo último portão', async () => {
  const { validarPeca } = await import('../../publicar/validar.mjs');
  const peca = { id: 'A', dia: '2026-11-23', tipo: 'carrossel', arquivos: [], legenda: 'Agenda da clínica sem confusão. #gestao', tema: 'agenda', gancho: 'Agenda cheia?', horario: '11:40', alt_text: 'Capa com a agenda de um day spa.' };
  const erros = validarPeca(tmp(), '2026-11-23', peca, { agente: true });
  assert.ok(erros.some((e) => e.includes('(alt_text)') && e.includes(MOTIVO_BLOQUEIO)), erros.join(' | '));
});


test('revisão 5: frase comparativa não fecha o escopo do spa; só rótulo de ramo liberado fecha', () => {
  for (const [caso, texto] of Object.entries({
    comparativa: 'Para o spa:\n\n- Aulas em grupo\n\nComo na clínica, Vale-presente com código.\n- Roupão',
    clinicaENovo: 'Para o spa:\n- Aulas em grupo\n\nClínica e o novo ramo também:\n- Vale-presente',
    itemRotuloIrmaos: '- Para o spa:\n- Aulas em grupo\n- Vale-presente',
  })) {
    assert.equal(tirarEscopoBloqueado(texto).texto, '', caso);
  }
  // Rótulos que fecham: "Na clínica:", "**Restaurante**", "### Restaurante e clínica".
  assert.match(tirarEscopoBloqueado('Para o spa:\n- Aulas\n\n**Restaurante**\n- QR do Pix.').texto, /QR do Pix/);
});

test('revisão 5: citação mista (spa junto de clínica/restaurante) ou sinal não apagam a seção', () => {
  assert.equal(tirarEscopoBloqueado('Valem para clínica, restaurante e spa:\n- Botões de 44 px\n- Semana em lista').texto, '- Botões de 44 px\n- Semana em lista');
  assert.equal(tirarEscopoBloqueado('Protocolo de massagem modeladora na ficha.\n\n- Termo assinado\n- Fotos antes e depois').texto, '- Termo assinado\n- Fotos antes e depois');
  assert.equal(tirarEscopoBloqueado('- Agenda mais rápida.\n- Para o spa:\n  - Aulas.\n- Logo no lembrete.').texto, '- Agenda mais rápida.\n- Logo no lembrete.');
  assert.deepEqual(segmentosBloqueadosNoTexto('Agenda do dayspa'), ['spa']);
  assert.equal(separarSecoes([{ titulo: 'Abril', texto: '**Status:** em breve\n- Aulas' }]).bloqueadas.length, 1);
});

test('revisão 6: abertura do spa que cita outro ramo de passagem abre escopo; só enumeração de ramos não abre', () => {
  for (const [caso, texto] of Object.entries({
    diferenteDaClinica: 'Para o spa (diferente da clínica):\n- Aulas em grupo\n- Vale-presente',
    aoContrario: 'No spa, ao contrário do restaurante, agora há:\n- Aulas em grupo',
    rotuloComparativo: '**Spa** (o que muda em relação à clínica)\n\n- Aulas em grupo',
    citacao: '> Spa, como a clínica, ganhou:\n\n- Aulas em grupo',
    itemComparativo: '- Spa (não vale para a clínica):\n- Aulas em grupo',
  })) {
    assert.equal(tirarEscopoBloqueado(texto).texto, '', caso);
  }
  for (const texto of ['Valem para clínica, restaurante e spa:\n- Botões de 44 px', 'Para clínica e spa:\n- Botões de 44 px', 'Na clínica ou no spa:\n- Botões de 44 px']) {
    assert.equal(tirarEscopoBloqueado(texto).texto, '- Botões de 44 px', texto);
  }
  // Enumeração mista, mas o nome volta fora dela: abre escopo.
  assert.equal(tirarEscopoBloqueado('Para clínica e spa, e no spa também:\n- Aulas em grupo').texto, '');
});

test('revisão 6: rótulo de clínica em HTML fecha o escopo do spa', () => {
  assert.match(tirarEscopoBloqueado('<h3>Spa</h3>\n- Aulas\n\n<h3>Clínica</h3>\n- Ficha nova').texto, /Ficha nova/);
});

test('revisão 7: aviso de "não pronta" num trecho aparado continua valendo para as candidatas da seção', async () => {
  for (const abertura of ['Para clínica e spa (na clínica, em homologação):', 'Para clínica e spa (em teste no piloto):', 'Massagem modeladora e cabines (em homologação):']) {
    const md = `# N\n\n## Abril de 2027: agenda\n\n${abertura}\n- Reserva de horário sem choque na agenda.`;
    let enviado = '';
    const r = await atualizarBase({ produto, novidadesMd: md, arquivos: { [VERT]: VERT_NOVO }, hoje: '2027-04-01',
      extrair: async (_t, x) => { enviado = x; return { funcoes: [{ id: 'clin.horario-sem-choque', ramo: 'clinica', fato: 'Reserva de horário sem choque na agenda.', fonte: 'Abril de 2027: agenda' }] }; } });
    assert.doesNotMatch(enviado, /homologa|piloto|spa/i, abertura);
    assert.deepEqual(r.adicionadas, [], abertura);
    assert.match(r.recusadas[0].motivo, /não estar pronta/, abertura);
  }
});
