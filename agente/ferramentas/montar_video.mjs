// Monta o reel narrado: voz → alinhamento → trilha e edição (cenas, atos, transições, efeitos) → Remotion → ffmpeg.
// Devolve o MP4 final e os quadros para o juiz visual (G7), mais os motivos técnicos de reprovação (G6).
import { mkdtempSync, copyFileSync, mkdirSync, renameSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { narrar, juntarFalas } from './narrar.mjs';
import { alinhar } from './alinhar.mjs';
import { planejarEdicao, sorteio } from '../video/motion/roteiro.mjs';
import { ffmpeg, rodar, duracao } from './binarios.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
export const FPS = 30;
export const LUFS_ALVO = -14;

/** Loudness integrada (LUFS) pelo filtro ebur128 do ffmpeg. */
export function medirLoudness(arquivo) {
  const r = rodar(ffmpeg(), ['-hide_banner', '-nostats', '-i', arquivo, '-filter_complex', 'ebur128', '-f', 'null', '-']);
  const m = [...r.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1);
  return m ? parseFloat(m[1]) : NaN;
}

/** Renderiza a composição com o Remotion (bundle por reel, porque a pasta pública muda). */
export async function renderizar({ publico, props, saida }) {
  const { bundle } = await import('@remotion/bundler');
  const { selectComposition, renderMedia } = await import('@remotion/renderer');
  const serveUrl = await bundle({ entryPoint: path.join(AQUI, '..', 'video', 'raiz.jsx'), publicDir: publico });
  const composition = await selectComposition({ serveUrl, id: 'ReelMotion', inputProps: props });
  const tmp = `${saida}.parcial.mp4`;
  await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation: tmp, inputProps: props, crf: 18, pixelFormat: 'yuv420p', audioCodec: 'aac', concurrency: null });
  renameSync(tmp, saida); // só vira o nome final se terminou
}

/** Acabamento: H.264 High, yuv420p, 30 fps, AAC 48 kHz, loudness −14 LUFS, moov no início. */
export function acabar(entrada, saida) {
  const tmp = `${saida}.parcial.mp4`;
  rodar(ffmpeg(), ['-v', 'error', '-y', '-i', entrada,
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-crf', '21', '-preset', 'medium', '-g', '60',
    '-af', `loudnorm=I=${LUFS_ALVO}:TP=-1.5:LRA=11`, '-c:a', 'aac', '-ar', '48000', '-b:a', '128k', '-movflags', '+faststart', tmp]);
  renameSync(tmp, saida);
}

/** Seis quadros para o juiz visual: 0,5 s, o gancho, três no meio e o fim. */
/**
 * Instantes para o juiz visual: o meio de até 6 cenas, já com a animação de entrada pronta e longe das
 * transições (num quadro de cortina ou chicote, metade da tela aparece "cortada" de propósito).
 */
export function temposDosQuadros(cenas, fps = FPS) {
  const escolhidas = cenas.length <= 6 ? cenas : Array.from({ length: 6 }, (_, k) => cenas[Math.round((k * (cenas.length - 1)) / 5)]);
  return escolhidas.map((c) => +((c.de + Math.max(12, (c.ate - c.de) * 0.62)) / fps).toFixed(2)).map((t, i) => Math.min(t, (escolhidas[i].ate - 3) / fps));
}

export function extrairQuadros(video, pasta, tempos) {
  const d = duracao(video);
  tempos ??= [0.5, 1.6, d * 0.35, d * 0.55, d * 0.75, Math.max(0.5, d - 0.8)];
  return tempos.map((t, i) => {
    const f = path.join(pasta, `quadro-${i + 1}.jpg`);
    rodar(ffmpeg(), ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', video, '-frames:v', '1', '-q:v', '3', f]);
    return f;
  });
}

/** Trilha do reel: do catálogo (repositório privado mazzi-trilhas), sem repetir as últimas usadas. */
export function escolherTrilha({ dir = process.env.TRILHAS_DIR, semente, evitar = [], clima } = {}) {
  if (!dir || !existsSync(path.join(dir, 'catalogo.json'))) return null;
  const { faixas } = JSON.parse(readFileSync(path.join(dir, 'catalogo.json'), 'utf8'));
  let opcoes = faixas.filter((f) => !f.content_id && existsSync(path.join(dir, f.arquivo)) && !evitar.includes(f.id));
  if (clima) opcoes = opcoes.filter((f) => f.clima === clima).concat(opcoes.filter((f) => f.clima !== clima));
  if (!opcoes.length) return null;
  const r = sorteio(semente);
  const f = opcoes[Math.floor(r() * Math.min(opcoes.length, clima ? Math.max(3, opcoes.filter((x) => x.clima === clima).length) : opcoes.length))];
  return { ...f, caminho: path.join(dir, f.arquivo) };
}

/**
 * roteiro: { batidas: [{ fala, tela, destaque?, cena }] }, item: { id, ramo, semana }.
 * Devolve { arquivo, quadros, motor, casado, loudness, duracao, trilha, motivos[] }.
 * Etapas injetáveis para teste: { narrarFn, alinharFn, renderFn, acabarFn, loudnessFn, quadrosFn, trilha }.
 */
export async function montarReel({ roteiro, item, destino, log = () => {}, ...fns }) {
  const trabalho = mkdtempSync(path.join(tmpdir(), 'mazzi-reel-'));
  const publico = path.join(trabalho, 'publico');
  mkdirSync(path.join(publico, 'sfx'), { recursive: true });
  const motivos = [];
  try {
    for (const peso of [500, 700, 800, 900]) copyFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${peso}-normal.woff2`), path.join(publico, `inter-${peso}.woff2`));
    copyFileSync(require.resolve('@fontsource/caveat/files/caveat-latin-600-normal.woff2'), path.join(publico, 'caveat-600.woff2'));
    const pastaSfx = path.join(AQUI, '..', 'video', 'sfx');
    for (const f of readdirSync(pastaSfx).filter((n) => n.endsWith('.ogg'))) copyFileSync(path.join(pastaSfx, f), path.join(publico, 'sfx', f));

    const falas = roteiro.batidas.map((b) => b.fala);
    const voz = await (fns.narrarFn ?? narrar)(falas, path.join(trabalho, 'falas'), { log });
    if (!voz.motor) return { motivos: ['voz: nenhum motor de voz funcionou (Edge e Kokoro)'], trabalho };
    const { inicios, total } = juntarFalas(voz.arquivos, voz.duracoes, path.join(publico, 'narracao.wav'));

    const alinhado = (fns.alinharFn ?? alinhar)(path.join(publico, 'narracao.wav'), falas, inicios, voz.duracoes);
    motivos.push(...alinhado.motivos);

    const semente = `${item.semana ?? ''}/${item.id ?? ''}`;
    const trilha = fns.trilha !== undefined ? fns.trilha : escolherTrilha({ semente, clima: item.ramo === 'clinica' ? 'groove' : 'energetico' });
    let musica = null;
    if (trilha) {
      copyFileSync(trilha.caminho, path.join(publico, 'trilha.mp3'));
      musica = { arquivo: 'trilha.mp3', inicio: Math.min(trilha.inicio_energia, Math.max(0, trilha.duracao - total - 2)), volume: 0.16, bpm: trilha.bpm };
    } else log('sem trilha (catálogo indisponível): o reel sai só com voz e efeitos');

    const edicao = planejarEdicao({ batidas: roteiro.batidas, inicios, duracoes: voz.duracoes, total, musica, ramo: rotuloRamo(item.ramo), semente });
    const props = { cenas: edicao.cenas, palavras: alinhado.palavras, audio: 'narracao.wav', musica, sfx: edicao.sfx, duracaoFrames: edicao.duracaoFrames };

    const bruto = path.join(trabalho, 'bruto.mp4');
    await (fns.renderFn ?? renderizar)({ publico, props, saida: bruto });
    mkdirSync(path.dirname(destino), { recursive: true });
    (fns.acabarFn ?? acabar)(bruto, destino);

    const loudness = (fns.loudnessFn ?? medirLoudness)(destino);
    if (!(Math.abs(loudness - LUFS_ALVO) <= 2)) motivos.push(`áudio: loudness ${loudness} LUFS (alvo ${LUFS_ALVO} ±2)`);
    const quadros = (fns.quadrosFn ?? extrairQuadros)(destino, trabalho, temposDosQuadros(edicao.cenas));
    return { arquivo: destino, quadros, motor: voz.motor, casado: alinhado.casado, loudness, duracao: total, trilha: trilha?.id ?? null, cenas: edicao.cenas.map((c) => `${c.tipo}/${c.ato}/${c.entrada}`), motivos, trabalho };
  } catch (e) {
    rmSync(trabalho, { recursive: true, force: true });
    throw e;
  }
}

const rotuloRamo = (r) => ({ clinica: 'Clínica', restaurante: 'Restaurante' }[r] ?? 'Mazzi Systems');
