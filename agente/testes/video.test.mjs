// Reel narrado: pronúncia, alinhamento da legenda, Pexels e o caminho do reel no orquestrador (com fakes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { textoFalado } from '../ferramentas/narrar.mjs';
import { casar } from '../ferramentas/alinhar.mjs';
import { escolherArquivo, creditarPexels, buscarBroll } from '../ferramentas/broll.mjs';
import { checarLegenda } from '../checagens/legenda.mjs';
import { produzirPeca, criarRegistro } from '../orquestrador.mjs';
import { CONTEUDO } from '../etapas/escrever.mjs';
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

test('Pexels: arquivo vertical mais perto de 1080; crédito antes das hashtags', async () => {
  const v = { video_files: [
    { file_type: 'video/mp4', width: 2160, height: 3840, link: 'a' },
    { file_type: 'video/mp4', width: 1080, height: 1920, link: 'b' },
    { file_type: 'video/mp4', width: 1920, height: 1080, link: 'c' },
    { file_type: 'video/mp4', width: 720, height: 1280, link: 'd' },
  ] };
  assert.equal(escolherArquivo(v).link, 'b');
  const l = creditarPexels('O caixa não fechou de novo?\n\nNa Mazzi a sangria fica registrada na hora, o troco também, e o fechamento mostra a diferença do dia.\n\nChama no WhatsApp (link na bio).\n\n#restaurante #caixa');
  assert.match(l, /Vídeo: Pexels\n\n#restaurante #caixa$/);
  assert.equal(checarLegenda(l).ok, true, checarLegenda(l).motivos.join());
  assert.equal(await buscarBroll('kitchen', tmp(), 'x.mp4', { chave: '' }), null, 'sem chave, sem vídeo de banco (não é erro)');
});

test('Pexels: busca vertical, baixa e não repete o mesmo vídeo', async () => {
  const chamadas = [];
  const fetch = async (url, opcoes) => {
    chamadas.push({ url, auth: opcoes?.headers?.Authorization });
    if (url.startsWith('https://api.pexels.com')) {
      return { ok: true, json: async () => ({ videos: [{ id: 7, duration: 10, user: { name: 'Ana' }, url: 'p', video_files: [{ file_type: 'video/mp4', width: 1080, height: 1920, link: 'https://v/7.mp4' }] }] }) };
    }
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  const usados = new Set();
  const r = await buscarBroll('cash register', tmp(), 'b.mp4', { chave: 'K', fetch, usados });
  assert.equal(r.id, 7);
  assert.match(chamadas[0].url, /orientation=portrait/);
  assert.equal(chamadas[0].auth, 'K');
  assert.equal(await buscarBroll('cash register', tmp(), 'c.mp4', { chave: 'K', fetch, usados }), null);
});

const reelBom = {
  gancho: 'O caixa não fechou de novo?',
  batidas: [
    { fala: 'O caixa não fechou de novo?', tela: 'O caixa não fechou?', broll: 'cash register' },
    { fala: 'A sangria ficou num papel que ninguém achou.', tela: 'A sangria sumiu' },
    { fala: 'E o troco do almoço saiu errado sem ninguém ver.', tela: 'O troco errado' },
    { fala: 'Na Mazzi cada sangria fica registrada na hora.', tela: 'Sangria na hora' },
    { fala: 'No fechamento você vê a diferença do dia.', tela: 'A diferença aparece' },
    { fala: 'E de onde ela veio, sem recontar nota.', tela: 'Sem recontar nota' },
    { fala: 'Pagamento dividido também entra certinho.', tela: 'Pagamento dividido' },
    { fala: 'Quer ver no seu restaurante?', tela: 'No seu restaurante' },
    { fala: 'Chama no WhatsApp, o link tá na bio.', tela: 'Chama no WhatsApp' },
  ],
  legenda: 'O caixa não fechou de novo?\n\nNa Mazzi a sangria fica registrada na hora e o fechamento mostra a diferença do dia.\n\nChama no WhatsApp (link na bio).\n\n#restaurante',
};

test('roteiro de reel: schema aceita o bom', () => {
  assert.equal(CONTEUDO.reel.safeParse(reelBom).success, true);
  assert.equal(CONTEUDO.reel.safeParse({ ...reelBom, batidas: reelBom.batidas.slice(0, 3) }).success, false);
});

function cerebroFalso(conteudo, visual = () => ({ problemas: [] })) {
  return {
    economico: () => false,
    pedir: async () => conteudo,
    juiz: (_s, etapa) => async (_t, _x, imagens) => (etapa === 'juiz:visual' ? (assert.equal(imagens.length, 6), visual()) : etapa === 'juiz:fatos' ? { afirmacoes: [] } : { problemas: [] }),
  };
}

test('orquestrador (reel): aprovado sai com etiqueta de IA, capa e crédito do Pexels', async () => {
  const saida = tmp();
  const semana = '2026-11-16';
  const item = { id: 'R1', dia: '2026-11-18', horario: '18:40', tipo: 'reel', ramo: 'restaurante', objetivo: 'conversa', conteudo: 'dor', tema: 'caixa', angulo: 'a sangria que sumiu', fatos: ['rest.caixa'] };
  const montar = async ({ destino }) => {
    mkdirSync(path.dirname(destino), { recursive: true });
    writeFileSync(destino, 'mp4');
    return { arquivo: destino, quadros: [1, 2, 3, 4, 5, 6].map((n) => `q${n}.jpg`), motor: 'edge:pt-BR-AntonioNeural', broll: [{ id: 1 }], motivos: [] };
  };
  const sondar = () => ({ largura: 1080, altura: 1920, codec: 'h264', audio: true, duracao: 26 });
  const r = await produzirPeca(item, { raiz: RAIZ, saida, semana, produto, config, cerebro: cerebroFalso(reelBom), usados: [], hoje: '2026-11-14', registrar: criarRegistro(saida), montarReel: montar, sondar });
  assert.equal(r.status, 'aprovada', JSON.stringify(r.motivos));
  assert.equal(r.entrada.ia, true);
  assert.equal(r.entrada.capa_ms, 1000);
  assert.deepEqual(r.entrada.arquivos, ['2026-11-16-R1.mp4']);
  assert.match(r.entrada.legenda, /Vídeo: Pexels/);
});

test('orquestrador (reel): voz que falhou ou legenda fora de sincronia reprova; esgotou, pula', async () => {
  const saida = tmp();
  const item = { id: 'R1', dia: '2026-11-18', horario: '18:40', tipo: 'reel', ramo: 'restaurante', objetivo: 'conversa', conteudo: 'dor', tema: 'caixa', angulo: 'a sangria que sumiu', fatos: ['rest.caixa'] };
  let n = 0;
  const montar = async () => (n++ % 2 ? { motivos: ['voz: nenhum motor de voz funcionou (Edge e Kokoro)'] } : { arquivo: path.join(saida, 'x.mp4'), quadros: [], motivos: ['legenda: só 70% das palavras casaram'] });
  const r = await produzirPeca(item, { raiz: RAIZ, saida, semana: '2026-11-16', produto, config, cerebro: cerebroFalso(reelBom), usados: [], hoje: '2026-11-14', registrar: criarRegistro(saida), montarReel: montar, sondar: () => ({ largura: 1080, altura: 1920, codec: 'h264', audio: true, duracao: 26 }) });
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
