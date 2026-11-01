// Monta o reel narrado: voz → alinhamento → vídeo de banco → Remotion → acabamento no ffmpeg.
// Devolve o MP4 final e os quadros para o juiz visual (G7), mais os motivos técnicos de reprovação (G6).
import { mkdtempSync, copyFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { narrar, juntarFalas } from './narrar.mjs';
import { alinhar } from './alinhar.mjs';
import { buscarBroll } from './broll.mjs';
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
  const composition = await selectComposition({ serveUrl, id: 'ReelNarrado', inputProps: props });
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
export function extrairQuadros(video, pasta) {
  const d = duracao(video);
  const tempos = [0.5, 1.6, d * 0.35, d * 0.55, d * 0.75, Math.max(0.5, d - 0.8)];
  return tempos.map((t, i) => {
    const f = path.join(pasta, `quadro-${i + 1}.jpg`);
    rodar(ffmpeg(), ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', video, '-frames:v', '1', '-q:v', '3', f]);
    return f;
  });
}

/**
 * roteiro: { batidas: [{ fala, tela, destaque?, cartao?, broll? }] }, item: { ramo }.
 * Devolve { arquivo, quadros, motor, casado, loudness, duracao, broll[], motivos[] }.
 * Etapas injetáveis para teste: { narrarFn, alinharFn, brollFn, renderFn, acabarFn }.
 */
export async function montarReel({ roteiro, item, destino, log = () => {}, ...fns }) {
  const trabalho = mkdtempSync(path.join(tmpdir(), 'mazzi-reel-'));
  const publico = path.join(trabalho, 'publico');
  mkdirSync(publico, { recursive: true });
  const motivos = [];
  try {
    for (const peso of [500, 700, 800]) copyFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${peso}-normal.woff2`), path.join(publico, `inter-${peso}.woff2`));

    const falas = roteiro.batidas.map((b) => b.fala);
    const voz = await (fns.narrarFn ?? narrar)(falas, path.join(trabalho, 'falas'), { log });
    if (!voz.motor) return { motivos: ['voz: nenhum motor de voz funcionou (Edge e Kokoro)'], trabalho };
    const { inicios, total } = juntarFalas(voz.arquivos, voz.duracoes, path.join(publico, 'narracao.wav'));

    const alinhado = (fns.alinharFn ?? alinhar)(path.join(publico, 'narracao.wav'), falas, inicios, voz.duracoes);
    motivos.push(...alinhado.motivos);

    const usados = new Set();
    const broll = [];
    const batidas = [];
    for (const [i, b] of roteiro.batidas.entries()) {
      let arquivo = null;
      if (b.broll) {
        const r = await (fns.brollFn ?? buscarBroll)(b.broll, publico, `broll-${i}.mp4`, { usados, log });
        if (r) { arquivo = path.basename(r.arquivo); broll.push(r); }
      }
      batidas.push({ inicio: inicios[i], tela: b.tela, destaque: b.destaque, cartao: b.cartao, broll: arquivo });
    }
    const duracaoFrames = Math.ceil(total * FPS);
    const props = { batidas, palavras: alinhado.palavras, ramo: item.ramo, audio: 'narracao.wav', duracaoFrames };

    const bruto = path.join(trabalho, 'bruto.mp4');
    await (fns.renderFn ?? renderizar)({ publico, props, saida: bruto });
    mkdirSync(path.dirname(destino), { recursive: true });
    (fns.acabarFn ?? acabar)(bruto, destino);

    const loudness = (fns.loudnessFn ?? medirLoudness)(destino);
    if (!(Math.abs(loudness - LUFS_ALVO) <= 2)) motivos.push(`áudio: loudness ${loudness} LUFS (alvo ${LUFS_ALVO} ±2)`);
    const quadros = (fns.quadrosFn ?? extrairQuadros)(destino, trabalho);
    return { arquivo: destino, quadros, motor: voz.motor, casado: alinhado.casado, loudness, duracao: total, broll, motivos, trabalho };
  } catch (e) {
    rmSync(trabalho, { recursive: true, force: true });
    throw e;
  }
}
