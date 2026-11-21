// Missão de 21/11/2026 (depois da PR #24): duração do reel previsível e roteiro que antecipa o editor.
// A calibração usa medições REAIS da voz do pipeline (agente/checagens/calibracao-*.json); o limite final é conferido
// num MP4 de verdade medido pelo ffprobe. Nenhum teste chama o Claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { estimarVideo, estimarFala, RESPIRO, PAUSA, CAUDA, MARGEM_DURACAO } from '../lib/tempos.mjs';
import { checarBatidas, analisarBatidas } from '../checagens/batidas.mjs';
import { avisosDoRoteiro, ferramentaRoteiro, promptPeca } from '../etapas/escrever.mjs';
import { tarefaEditor } from '../checagens/editor.mjs';
import { validarPeca } from '../../publicar/validar.mjs';
import { ffmpeg, ffprobe, rodar } from '../ferramentas/binarios.mjs';
import { lerProduto } from '../checagens/fatos.mjs';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const ler = (rel) => readFileSync(path.join(RAIZ, rel), 'utf8');
const config = JSON.parse(ler('agente/config.json'));
const FALAS = JSON.parse(ler('agente/checagens/calibracao-voz.json'));
const { roteiros: ROTEIROS } = JSON.parse(ler('agente/checagens/calibracao-roteiros.json'));

// ---------- Frente A: duração ----------

test('duração 1: a estimativa por fala bate com a voz real medida (38 falas)', () => {
  assert.ok(FALAS.length >= 38);
  const erros = FALAS.map((l) => l.dur - estimarFala(l.fala));
  const rmse = Math.sqrt(erros.reduce((s, e) => s + e * e, 0) / erros.length);
  assert.ok(rmse < 0.3, `erro médio ${rmse.toFixed(3)} s`);
  assert.ok(erros.every((e) => Math.abs(e) < 0.8), `maior erro ${Math.max(...erros.map(Math.abs)).toFixed(2)} s`);
  // A conta antiga (2,65 palavras/s) estimava 29% a MAIS que a voz real nessas mesmas falas.
  const antigo = FALAS.reduce((s, l) => s + l.fala.split(/\s+/).length / 2.65, 0);
  const real = FALAS.reduce((s, l) => s + l.dur, 0);
  assert.ok(antigo > real * 1.15, `antiga ${antigo.toFixed(1)} s × real ${real.toFixed(1)} s`);
});

test('duração 2: o vídeo estimado fica a até ~1 s do áudio real nos roteiros inteiros medidos', () => {
  for (const r of ROTEIROS) {
    const est = estimarVideo(r.falas);
    assert.ok(Math.abs(est - r.real_total) <= 1.1, `${r.nome}: estimado ${est.toFixed(2)} × real ${r.real_total}`);
  }
  // O caso do R2 de 21/11: a conta antiga dizia "20 s de fala" e o áudio real tinha 17,7 s. Agora reprova antes.
  const curto = ROTEIROS.find((r) => r.real_total < 20);
  assert.ok(analisarBatidas(curto.falas).totalSegundos >= 20, 'a conta antiga deixava passar');
  assert.match(checarBatidas(curto.falas).motivos.join(), /vídeo estimado em .* abaixo de 21 s/);
  const bom = ROTEIROS.find((r) => r.real_total >= 21);
  assert.equal(checarBatidas(bom.falas).ok, true, checarBatidas(bom.falas).motivos.join('; '));
});

test('duração 3: folga de ~1 s; os limites de cima continuam na conta mais rígida', () => {
  assert.equal(MARGEM_DURACAO, 1);
  assert.equal(config.checagens.batidas.duracaoMin, 20, 'o mínimo de 20 s não mudou');
  // Um roteiro estimado entre 20 e 21 s reprova na estimativa (cai dentro da folga).
  const base = ['Tirou dinheiro do caixa e esqueceu?', 'A sangria das duas ficou no papel.', 'O troco do almoço saiu errado pro motoboy.',
    'No fechamento, a diferença aparece na tela.', 'Ali tá a sangria, com hora e valor.', 'Pagamento dividido entra certinho também.', 'Chama no WhatsApp, link na bio.'];
  const extras = ['Fechou?', 'E o Pix das três?', 'Tá registrado.', 'Sem recontar a gaveta.', 'No balcão ou no celular.'];
  let falas = [...base];
  for (const e of extras) { if (estimarVideo(falas) >= 20) break; falas = [...falas.slice(0, -1), e, falas.at(-1)]; }
  const est = estimarVideo(falas);
  assert.ok(est >= 20 && est < 21, `o roteiro de teste precisa cair na folga (estimado ${est.toFixed(2)})`);
  assert.ok(checarBatidas(falas).motivos.some((m) => /abaixo de 21 s/.test(m)), `estimado ${est.toFixed(2)}`);
  // Gancho e batida longa: mesma regra de antes (2,65 palavras/s, mais lenta que a voz real).
  assert.match(checarBatidas(['Hoje eu queria conversar com você sobre o caixa', ...base.slice(1)]).motivos.join(), /gancho/);
  assert.match(checarBatidas([base[0], 'Na Mazzi a sangria fica anotada e o fechamento mostra a diferença do dia sem recontar nada', ...base.slice(2)]).motivos.join(), /passam de 4 s/);
});

test('duração 4: a margem não infla o vídeo: a montagem usa os mesmos respiro, pausa e cauda de antes', () => {
  assert.deepEqual([RESPIRO, PAUSA, CAUDA], [0.15, 0.22, 0.6]);
  const narrar = ler('agente/ferramentas/narrar.mjs');
  assert.match(narrar, /\{ pausa = PAUSA \}/);
  assert.match(narrar, /let t = RESPIRO;/);
  assert.match(narrar, /apad=pad_dur=\$\{CAUDA\}/);
  assert.doesNotMatch(narrar, /MARGEM/, 'a folga só existe na estimativa do roteiro, nunca no áudio');
  // Mesma conta do juntarFalas: respiro + falas + pausas + cauda.
  const durs = [1.4, 2.2, 1.9];
  const montagem = RESPIRO + durs.reduce((s, d) => s + d + PAUSA, 0) - PAUSA + CAUDA;
  assert.ok(Math.abs(montagem - (RESPIRO + durs.reduce((s, d) => s + d, 0) + PAUSA * 2 + CAUDA)) < 1e-9);
});

test('duração 5: o validador final continua reprovando um MP4 real abaixo de 20 s', (t) => {
  let bin;
  try { bin = ffmpeg(); process.env.FFPROBE ??= ffprobe(); } catch { return t.skip('sem ffmpeg nesta máquina'); }
  const dir = mkdtempSync(path.join(tmpdir(), 'mazzi-duracao-'));
  const semana = '2026-11-23';
  mkdirSync(dir, { recursive: true });
  const gerar = (nome, s) => rodar(bin, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x111316:s=1080x1920:r=30', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono',
    '-t', String(s), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, nome)]);
  gerar(`${semana}-R2.mp4`, 19.8);
  gerar(`${semana}-R3.mp4`, 20.5);
  const peca = (id) => ({ id, dia: semana, horario: '07:40', tipo: 'reel', arquivos: [`${semana}-${id}.mp4`], legenda: 'Teste de duração.\n\nChama no WhatsApp (link na bio).', gancho: 'Teste', ia: true, capa_ms: 1000 });
  const curto = validarPeca(dir, semana, peca('R2'), { agente: true });
  assert.ok(curto.some((m) => /com 19\.\d+s \(20 a 45\)/.test(m)), curto.join('; '));
  assert.ok(!validarPeca(dir, semana, peca('R3'), { agente: true }).some((m) => /\(20 a 45\)/.test(m)), 'com 20,5 s a duração passa');
});

// ---------- Frente B: o que o editor reprovou ----------

// Falas e telas copiadas das sugestões reais do editor em 21/11 (registro/2026-11-21.jsonl).
const R1_REPROVADO = [
  { fala: 'Paciente sumiu?', tela: 'Paciente sumiu?', cena: { tipo: 'gancho' } },
  { fala: 'A data do retorno ficou no caderno da recepção.', tela: 'No caderno', cena: { tipo: 'cartao', cartao: { linhas: [{ rotulo: 'Retornos' }] } } },
  { fala: 'Mas tem jeito.', tela: 'Mas tem jeito', cena: { tipo: 'ato' } },
  { fala: 'A lista mostra quem deveria voltar e quando.', tela: 'Quem deveria voltar', cena: { tipo: 'cartao', cartao: { linhas: [{ rotulo: 'Ana', selo: 'dia 28' }] } } },
  { fala: 'Cada linha traz o nome e o dia do retorno.', tela: 'Nome e dia', cena: { tipo: 'checklist', itens: ['Quem deveria voltar', 'Dia do retorno', 'Nome da paciente'] } },
  { fala: 'Chama no WhatsApp, link na bio.', tela: 'Chama no WhatsApp', cena: { tipo: 'celular', mensagens: [{ lado: 'negocio', texto: 'Oi!' }] } },
];
const R1_MELHOR = [
  { fala: 'Segunda, nove da manhã.', tela: 'Segunda, 9h', cena: { tipo: 'gancho' } },
  { fala: 'A Bia devia ter voltado em outubro e ninguém ligou.', tela: 'A Bia sumiu', cena: { tipo: 'papel', rabiscos: ['Bia: voltar 3 meses?', 'ligar pra Carla', 'retorno???'], cartao: { titulo: 'Retornos', linhas: [{ rotulo: 'Bia', selo: 'passou 5 dias' }] } } },
  { fala: 'Na lista de retornos ela aparece.', tela: 'A lista de retornos', cena: { tipo: 'cartao', cartao: { titulo: 'Retornos', linhas: [{ rotulo: 'Bia', selo: 'passou 5 dias' }] } } },
  { fala: 'Quem deveria voltar e quando.', tela: 'Quem e quando', cena: { tipo: 'contador', rotulo: 'Retornos da semana', valor: 6 } },
  { fala: 'Pra recepção, é abrir a lista e ligar pra quem passou da data.', tela: 'Abre e liga', cena: { tipo: 'celular', mensagens: [{ lado: 'negocio', texto: 'Oi, Bia! Bora marcar o retorno?' }] } },
  { fala: 'Quer ver a sua? Chama no WhatsApp.', tela: 'Chama no WhatsApp', cena: { tipo: 'cartao', cartao: { linhas: [{ rotulo: 'x' }] } } },
];

test('editorial 1: os avisos do roteiro acham o que o editor reprovou no R1 (virada vazia, manual, caderno só falado, lista repetida)', () => {
  const a = avisosDoRoteiro(R1_REPROVADO).join(' | ');
  assert.match(a, /batida 3: virada vazia/);
  assert.match(a, /batida 5: fala de manual/);
  assert.match(a, /batida 2: a fala cita "caderno" mas nenhuma cena perto mostra/);
  assert.match(a, /batida 5: a lista repete o que a batida 4/);
  assert.deepEqual(avisosDoRoteiro(R1_MELHOR), [], 'a versão em cena única não gera aviso');
});

test('editorial 2: cadência igual vira aviso (o G4 dispensa variação no reel, o editor não)', () => {
  const iguais = ['Seu caixa fechou errado hoje?', 'A sangria sumiu no papel.', 'O troco saiu errado ontem.', 'A Mazzi registra a sangria.', 'O fechamento mostra a diferença.', 'Chama no WhatsApp agora.']
    .map((fala, i) => ({ fala, tela: 'x', cena: { tipo: ['gancho', 'papel', 'cartao', 'contador', 'celular', 'cartao'][i], rabiscos: ['a', 'b', 'c'], cartao: { linhas: [{ rotulo: 'x' }] } } }));
  assert.match(avisosDoRoteiro(iguais).join(), /falas todas do mesmo tamanho/);
  assert.match(tarefaEditor('reel'), /cadência de robô \(frases todas\s+do mesmo tamanho\)/, 'o editor cobra variação');
  const prompt = promptPeca({ id: 'R1', tipo: 'reel', ramo: 'clinica', objetivo: 'conversa', conteudo: 'ensina', tema: 't', angulo: 'a', fatos: ['clin.retornos'] }, [], null, { produto: lerProduto(), config });
  assert.match(prompt, /Varie o tamanho das falas/);
});

test('editorial 3: o prompt das cenas não sugere mais a vitrine de recursos nem a virada vazia', () => {
  const p = promptPeca({ id: 'R1', tipo: 'reel', ramo: 'restaurante', objetivo: 'conversa', conteudo: 'ensina', tema: 't', angulo: 'a', fatos: ['rest.balanca'] }, [], null, { produto: lerProduto(), config });
  assert.doesNotMatch(p, /Roteiro-modelo de reel de produto/);
  assert.doesNotMatch(p, /na virada \("mas tem jeito"\)/);
  assert.doesNotMatch(p, /Bom para "tudo que dá pra fazer"/);
  assert.match(p, /O reel é UMA cena do começo ao fim/);
  assert.match(p, /nunca virada vazia/);
  assert.match(p, /rest\.balanca: A balança do self-service/, 'só a função da base, com o texto da base');
});

test('editorial 4: medir_roteiro devolve motivos (reprovam) e avisos (não reprovam) separados, com o vídeo estimado', async () => {
  const r = JSON.parse((await ferramentaRoteiro({ config }).handler({ batidas: R1_REPROVADO })).content[0].text);
  assert.equal(typeof r.video_estimado_s, 'number');
  assert.ok(r.avisos_do_editor.length >= 4);
  assert.ok(!r.motivos.some((m) => /virada vazia|fala de manual/.test(m)), 'aviso não vira reprovação no código');
  assert.ok(r.motivos.some((m) => /abaixo de 21 s/.test(m)), 'o R1 curto de 6 batidas não passa na duração');
});
