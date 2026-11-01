// Narração do reel (SPEC 12). Uma fala por batida, na cadeia:
//   Edge TTS "pt-BR-AntonioNeural" (escolha da Andressa) → Kokoro "pm_alex" (licença Apache) → sem narração.
// A falha de um motor passa para o próximo sem intervenção. A pronúncia ("Mazzi" → "Mázi") vale só no áudio;
// a legenda usa o roteiro. Saída: um WAV 48 kHz mono por batida, sem silêncio nas pontas, + a duração de cada um.
import { mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpeg, rodar, duracao } from './binarios.mjs';

// Só o que a voz erra (ouvido nas amostras): o resto ela pronuncia bem sozinha.
export const PRONUNCIA = { Mazzi: 'Mázi', mazzisystems: 'Mázi Systems' };
const AQUI = path.dirname(fileURLToPath(import.meta.url));

/** Texto para o motor de voz: troca só as palavras do mapa, inteiras ("Mazzi" sim, "Mazzinho" não). */
export function textoFalado(texto, pronuncia = PRONUNCIA) {
  return Object.entries(pronuncia).reduce((t, [de, para]) => t.replace(new RegExp(`(?<![\\p{L}@])@?${de}(?![\\p{L}])`, 'gu'), para), texto);
}

/** MP3/WAV qualquer → WAV 48 kHz mono, cortando o silêncio do começo e do fim. */
function normalizarWav(entrada, saida) {
  rodar(ffmpeg(), ['-v', 'error', '-y', '-i', entrada, '-af',
    'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse',
    '-ar', '48000', '-ac', '1', saida]);
}

export const motorEdge = {
  nome: 'edge:pt-BR-AntonioNeural',
  async falar(textos, pasta) {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
    const tts = new MsEdgeTTS();
    await tts.setMetadata('pt-BR-AntonioNeural', OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const tmp = mkdtempSync(path.join(tmpdir(), 'mazzi-edge-'));
    try {
      return await Promise.all(textos.map(async (t, i) => {
        const dir = path.join(tmp, String(i));
        mkdirSync(dir);
        const { audioFilePath } = await tts.toFile(dir, t, { rate: '+4%' });
        const wav = path.join(pasta, `fala-${String(i).padStart(2, '0')}.wav`);
        normalizarWav(audioFilePath, wav);
        return wav;
      }));
    } finally {
      tts.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  },
};

export const motorKokoro = {
  nome: 'kokoro:pm_alex',
  async falar(textos, pasta) {
    const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    // Instala na primeira vez que for preciso (é raro: só quando o Edge falha).
    rodar(python, ['-m', 'pip', 'install', '-q', 'kokoro>=0.9', 'soundfile']);
    const tmp = mkdtempSync(path.join(tmpdir(), 'mazzi-kokoro-'));
    try {
      rodar(python, ['-X', 'utf8', '-I', path.join(AQUI, 'kokoro_tts.py'), tmp], { entrada: JSON.stringify(textos) });
      return textos.map((_, i) => {
        const wav = path.join(pasta, `fala-${String(i).padStart(2, '0')}.wav`);
        normalizarWav(path.join(tmp, `${i}.wav`), wav);
        return wav;
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
};

/**
 * Narra as falas. Devolve { motor, arquivos[], duracoes[] (s) } ou { motor: null } se nenhum motor funcionou
 * (o reel então reprova: sem narração não é reel narrado). `log` recebe o motivo de cada queda.
 */
export async function narrar(falas, pasta, { motores = [motorEdge, motorKokoro], log = () => {} } = {}) {
  mkdirSync(pasta, { recursive: true });
  const textos = falas.map((f) => textoFalado(f));
  for (const motor of motores) {
    try {
      for (const f of readdirSync(pasta).filter((n) => n.startsWith('fala-'))) rmSync(path.join(pasta, f));
      const arquivos = await motor.falar(textos, pasta);
      const duracoes = arquivos.map((a) => duracao(a));
      if (duracoes.some((d) => !(d > 0.3))) throw new Error('fala vazia ou curta demais');
      return { motor: motor.nome, arquivos, duracoes };
    } catch (e) {
      log(`voz ${motor.nome} falhou: ${e.message}`);
    }
  }
  return { motor: null, arquivos: [], duracoes: [] };
}

/** Junta as falas num WAV só, com uma pausa entre elas. Devolve os tempos (s) de início de cada fala. */
export function juntarFalas(arquivos, duracoes, saida, { pausa = 0.22 } = {}) {
  const inicios = [];
  let t = 0.15; // respiro antes da 1ª fala
  for (const d of duracoes) { inicios.push(+t.toFixed(3)); t += d + pausa; }
  const filtros = arquivos.map((_, i) => `[${i}:a]adelay=${Math.round(inicios[i] * 1000)}|${Math.round(inicios[i] * 1000)}[a${i}]`).join(';');
  const mix = `${arquivos.map((_, i) => `[a${i}]`).join('')}amix=inputs=${arquivos.length}:normalize=0,apad=pad_dur=0.6[out]`;
  rodar(ffmpeg(), ['-v', 'error', '-y', ...arquivos.flatMap((a) => ['-i', a]), '-filter_complex', `${filtros};${mix}`, '-map', '[out]', '-ar', '48000', '-ac', '1', saida]);
  return { inicios, total: +(t - pausa + 0.6).toFixed(3) };
}

