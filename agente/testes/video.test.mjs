// Reel em motion: pronúncia, alinhamento da legenda, edição (cenas, atos, transições, efeitos), trilha
// e o caminho do reel no orquestrador (com fakes: nenhum teste renderiza vídeo nem gasta a assinatura).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { textoFalado } from '../ferramentas/narrar.mjs';
import { casar } from '../ferramentas/alinhar.mjs';
import { escolherTrilha } from '../ferramentas/montar_video.mjs';
import { planejarEdicao, escolherAtos, escolherTransicoes, encaixar, gradeDeBatidas } from '../video/motion/roteiro.mjs';
import { produzirPeca, criarRegistro } from '../orquestrador.mjs';
import { CONTEUDO, regrasDaEdicao } from '../etapas/escrever.mjs';
import { lerProduto } from '../checagens/fatos.mjs';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const config = JSON.parse(readFileSync(path.join(RAIZ, 'agente', 'config.json'), 'utf8'));
const produto = lerProduto();
const tmp = () => mkdtempSync(path.join(tmpdir(), 'mazzi-video-'));

test('pronúncia: só o áudio troca "Mazzi" por "Mázi", palavra inteira e com @', () => {
  assert.equal(textoFalado('Na Mazzi, segue o @mazzisystems.'), 'Na Mázi, segue o Mázi Systems.');
  assert.equal(textoFalado('Mazzinho'), 'Mazzinho');
});

test('alinhamento: palavras do roteiro ganham o tempo do Whisper; "Mase" casa com "Mazzi"; o resto interpola', () => {
  const falas = ['O caixa não fechou?', 'Na Mazzi a sangria fica registrada.'];
  const ouvidas = [
    { p: 'O', i: 0.2, f: 0.3 }, { p: 'caixa', i: 0.3, f: 0.7 }, { p: 'não', i: 0.7, f: 0.9 }, { p: 'fechou?', i: 0.9, f: 1.4 },
    { p: 'Na', i: 1.8, f: 1.9 }, { p: 'Mase,', i: 1.9, f: 2.3 }, { p: 'a', i: 2.3, f: 2.4 }, { p: 'sangria', i: 2.4, f: 2.9 },
    { p: 'registrada.', i: 3.1, f: 3.8 },
  ];
  const r = casar(falas, [0.15, 1.75], [1.3, 2.1], ouvidas);
  assert.equal(r.palavras.length, 10);
  assert.deepEqual(r.palavras.map((p) => p.texto), ['O', 'caixa', 'não', 'fechou?', 'Na', 'Mazzi', 'a', 'sangria', 'fica', 'registrada.']);
  assert.ok(r.casado >= 0.9, `casado ${r.casado}`);
  const fica = r.palavras[8];
  assert.ok(fica.inicio >= 2.9 && fica.fim <= 3.1 + 1e-9, 'interpolada entre "sangria" e "registrada"');
  assert.ok(r.palavras.every((p, i, a) => i === 0 || p.inicio >= a[i - 1].inicio), 'tempos em ordem');
});

test('alinhamento: áudio que não bate com o roteiro fica abaixo do mínimo', () => {
  const r = casar(['O caixa não fechou de novo hoje'], [0.15], [2], [{ p: 'bom', i: 0.2, f: 0.5 }, { p: 'dia', i: 0.5, f: 0.9 }]);
  assert.ok(r.casado < 0.9);
});


const cenaBasica = [
  { cena: { tipo: 'gancho', simbolo: '?' } },
  { cena: { tipo: 'papel', rabiscos: ['sangria 14h ???', 'troco 50', 'não bateu'], cartao: { titulo: 'caixa', linhas: [{ rotulo: 'Sangria 14h', selo: 'ok', tom: 'ok' }] } } },
  { cena: { tipo: 'checklist', itens: ['Sangria registrada', 'Troco conferido', 'Diferença à vista'] } },
  { cena: { tipo: 'ato' } },
  { cena: { tipo: 'cartao', cartao: { titulo: 'fechamento', linhas: [{ rotulo: 'Diferença', selo: 'R$ 0', tom: 'ok' }] } } },
  { cena: { tipo: 'lista', itens: [{ icone: 'Wallet', rotulo: 'Caixa' }, { icone: 'Truck', rotulo: 'Delivery' }, { icone: 'Scale', rotulo: 'Balança' }] } },
  { cena: { tipo: 'orbita', icones: ['Wallet', 'Truck', 'Scale', 'Package'] } },
  { cena: { tipo: 'cartao', cartao: { linhas: [{ rotulo: 'x' }] } } },
];
const reelBom = {
  gancho: 'O caixa não fechou de novo?',
  batidas: [
    'O caixa não fechou de novo?', 'A sangria ficou num papel que ninguém achou.', 'E o troco do almoço saiu errado.', 'Mas tem jeito.',
    'Na Mazzi cada sangria fica registrada na hora.', 'Caixa, delivery e balança no mesmo lugar.', 'Tudo no seu computador e no celular.', 'Chama no WhatsApp, o link tá na bio.',
  ].map((fala, i) => ({ fala, tela: ['O caixa não fechou de novo?', 'No caderno', 'Troco errado', 'Mas tem jeito', 'Sangria na hora', 'Tudo junto', 'No celular também', 'Chama no WhatsApp'][i], destaque: i === 0 ? 'de novo?' : undefined, ...cenaBasica[i] })),
  legenda: 'O caixa não fechou de novo?\n\nNa Mazzi a sangria fica registrada na hora e o fechamento mostra a diferença do dia.\n\nChama no WhatsApp (link na bio).\n\n#restaurante',
};

test('roteiro de reel: schema aceita cenas da biblioteca e recusa cena inventada ou ícone fora da lista', () => {
  assert.equal(CONTEUDO.reel.safeParse(reelBom).success, true, JSON.stringify(CONTEUDO.reel.safeParse(reelBom).error?.issues?.[0]));
  const ruim = structuredClone(reelBom);
  ruim.batidas[1].cena = { tipo: 'explosao' };
  assert.equal(CONTEUDO.reel.safeParse(ruim).success, false);
  const iconeRuim = structuredClone(reelBom);
  iconeRuim.batidas[5].cena.itens[0].icone = 'Rocket';
  assert.equal(CONTEUDO.reel.safeParse(iconeRuim).success, false);
});

test('edição: começa no gancho, sem cena repetida seguida, 4+ tipos, mostra o produto', () => {
  assert.deepEqual(regrasDaEdicao(reelBom.batidas), []);
  const semGancho = [reelBom.batidas[1], ...reelBom.batidas.slice(2)];
  assert.match(regrasDaEdicao(semGancho).join(), /gancho/);
  const repetida = [reelBom.batidas[0], reelBom.batidas[2], reelBom.batidas[2], reelBom.batidas[1]];
  assert.match(regrasDaEdicao(repetida).join(), /repetida/);
  const pobre = [reelBom.batidas[0], reelBom.batidas[3], reelBom.batidas[0], reelBom.batidas[3]];
  assert.match(regrasDaEdicao(pobre).join('|'), /tipos de cena.*\|.*produto|produto/);
});

test('edição (código): cortes puxados para a batida, atos variados, transições sem repetir, fechamento azul de zoom', () => {
  assert.equal(encaixar(2.05, gradeDeBatidas(120, 10)), 2);
  assert.equal(encaixar(2.3, gradeDeBatidas(120, 10)), 2.5);
  assert.equal(encaixar(2.62, [0, 1.5, 3]), 2.62, 'longe da batida: fica onde está');
  const tipos = ['gancho', 'checklist', 'cartao', 'painel', 'contador', 'ato', 'cartao', 'fechamento'];
  const atos = escolherAtos(tipos);
  assert.equal(atos.at(-1), 'azul');
  assert.equal(atos[5], 'coral');
  assert.ok(atos.includes('claro'), 'pelo menos um ato claro');
  assert.ok(!atos.some((a, i) => i >= 2 && a === atos[i - 1] && a === atos[i - 2]), 'nunca 3 iguais seguidos');
  const tr = escolherTransicoes(tipos, 'x');
  assert.equal(tr[0], 'corte');
  assert.equal(tr[5], 'cortina');
  assert.equal(tr.at(-1), 'zoom');
  assert.ok(tr.every((t, i) => i === 0 || t !== tr[i - 1]));
  assert.deepEqual(escolherTransicoes(tipos, 'x'), tr, 'mesma semente, mesma edição');
});

test('edição (código): planejarEdicao monta cenas contínuas, fechamento no fim e efeitos em ordem', () => {
  const inicios = reelBom.batidas.map((_, i) => 0.15 + i * 3);
  const r = planejarEdicao({ batidas: reelBom.batidas, inicios, duracoes: inicios.map(() => 2.6), total: 24.4, musica: { bpm: 124 }, ramo: 'Restaurante', semente: '2026-11-23/B' });
  assert.equal(r.cenas[0].de, 0);
  assert.equal(r.cenas.at(-1).tipo, 'fechamento');
  assert.equal(r.cenas.at(-1).ate, r.duracaoFrames);
  r.cenas.forEach((c, i) => { if (i) assert.equal(c.de, r.cenas[i - 1].ate, 'sem buraco entre cenas'); });
  assert.equal(r.cenas[0].dados.ramo, 'Restaurante');
  assert.ok(r.sfx.length >= r.cenas.length, 'pelo menos um efeito por cena');
  assert.ok(r.sfx.every((e, i) => i === 0 || e.quadro >= r.sfx[i - 1].quadro));
  assert.ok(r.sfx.every((e) => /^sfx\/[a-z0-9-]+\.ogg$/.test(e.arquivo) && existsSync(path.join(RAIZ, 'agente', 'video', e.arquivo))), 'todo efeito existe');
});

test('trilha: escolhe do catálogo sem Content ID, sem repetir as evitadas; sem catálogo, sem trilha', () => {
  const dir = tmp();
  writeFileSync(path.join(dir, 'catalogo.json'), JSON.stringify({ faixas: [
    { id: 'a', arquivo: 'a.mp3', content_id: false, clima: 'energetico' }, { id: 'b', arquivo: 'b.mp3', content_id: true, clima: 'energetico' }, { id: 'c', arquivo: 'c.mp3', content_id: false, clima: 'groove' },
  ] }));
  for (const f of ['a.mp3', 'b.mp3', 'c.mp3']) writeFileSync(path.join(dir, f), 'x');
  for (let k = 0; k < 10; k++) assert.notEqual(escolherTrilha({ dir, semente: `s${k}` }).id, 'b');
  assert.equal(escolherTrilha({ dir, semente: 's', evitar: ['a'] }).id, 'c');
  assert.equal(escolherTrilha({ dir: tmp(), semente: 's' }), null);
});

function cerebroFalso(conteudo, visual = () => ({ problemas: [] })) {
  return {
    economico: () => false,
    pedir: async () => conteudo,
    juiz: (_s, etapa) => async (_t, _x, imagens) => (etapa === 'juiz:visual' ? (assert.equal(imagens.length, 6), visual()) : etapa === 'juiz:fatos' ? { afirmacoes: [] } : { problemas: [] }),
  };
}
const itemReel = { id: 'B', dia: '2026-11-25', horario: '18:40', tipo: 'reel', ramo: 'restaurante', objetivo: 'conversa', conteudo: 'dor', tema: 'caixa', angulo: 'a sangria que sumiu', fatos: ['rest.caixa'] };
const sondar = () => ({ largura: 1080, altura: 1920, codec: 'h264', audio: true, duracao: 26 });

test('orquestrador (reel): aprovado sai com etiqueta de IA e capa; a montagem recebe semana e id', async () => {
  const saida = tmp();
  let recebido;
  const montar = async ({ destino, item }) => {
    recebido = item;
    mkdirSync(path.dirname(destino), { recursive: true });
    writeFileSync(destino, 'mp4');
    return { arquivo: destino, quadros: [1, 2, 3, 4, 5, 6].map((n) => `q${n}.jpg`), motor: 'edge:pt-BR-AntonioNeural', motivos: [] };
  };
  const r = await produzirPeca(itemReel, { raiz: RAIZ, saida, semana: '2026-11-23', produto, config, cerebro: cerebroFalso(reelBom), usados: [], hoje: '2026-11-21', registrar: criarRegistro(saida), montarReel: montar, sondar });
  assert.equal(r.status, 'aprovada', JSON.stringify(r.motivos));
  assert.equal(r.entrada.ia, true);
  assert.equal(r.entrada.capa_ms, 1000);
  assert.deepEqual(r.entrada.arquivos, ['2026-11-23-B.mp4']);
  assert.equal(recebido.semana, '2026-11-23');
});

test('orquestrador (reel): voz que falhou ou legenda fora de sincronia reprova; esgotou, pula', async () => {
  const saida = tmp();
  let n = 0;
  const montar = async () => (n++ % 2 ? { motivos: ['voz: nenhum motor de voz funcionou (Edge e Kokoro)'] } : { arquivo: path.join(saida, 'x.mp4'), quadros: [], motivos: ['legenda: só 70% das palavras casaram'] });
  const r = await produzirPeca(itemReel, { raiz: RAIZ, saida, semana: '2026-11-23', produto, config, cerebro: cerebroFalso(reelBom), usados: [], hoje: '2026-11-21', registrar: criarRegistro(saida), montarReel: montar, sondar });
  assert.equal(r.status, 'pulada');
  assert.match(r.motivos.join(), /voz|legenda/);
});

test('redator: "\n" escrito como texto vira quebra de linha de verdade em toda a peça', async () => {
  const { limparTexto } = await import('../etapas/escrever.mjs');
  const r = limparTexto({ legenda: 'Gancho?\n\nCorpo.\n#tag', batidas: [{ fala: 'a\nb' }], n: 3 });
  assert.equal(r.legenda, 'Gancho?\n\nCorpo.\n#tag');
  assert.equal(r.batidas[0].fala, 'a\nb');
  assert.equal(r.n, 3);
});

test('juiz visual: quadros no meio das cenas, longe dos cortes (nada de pegar transição pela metade)', async () => {
  const { temposDosQuadros } = await import('../ferramentas/montar_video.mjs');
  const cenas = [[0, 90], [90, 150], [150, 260], [260, 330], [330, 420], [420, 500], [500, 590], [590, 680]].map(([de, ate]) => ({ de, ate }));
  const t = temposDosQuadros(cenas);
  assert.equal(t.length, 6);
  for (const s of t) {
    const q = s * 30;
    const c = cenas.find((x) => q >= x.de && q < x.ate);
    assert.ok(c, `quadro ${s}s dentro de uma cena`);
    assert.ok(q - c.de >= 12 && c.ate - q >= 3, `quadro ${s}s longe do corte`);
  }
  assert.equal(temposDosQuadros(cenas.slice(0, 3)).length, 3);
});
