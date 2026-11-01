// Legenda sincronizada (SPEC 12): o Whisper ouve a narração e diz QUANDO cada palavra foi falada;
// as palavras mostradas vêm do roteiro (então "Mazzi" nunca aparece como "Mazi").
// Casamento por programação dinâmica entre as palavras do roteiro e as ouvidas; palavra sem par ganha
// tempo interpolado dentro da própria batida (cujo início e fim já sabemos pelo áudio de cada fala).
// Se menos de 90% das palavras casarem, o reel reprova (legenda fora de sincronia é pior que nenhuma).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { rodar, ffmpeg } from './binarios.mjs';
import { similaridade } from '../checagens/repeticao.mjs';
import { dobrar } from '../lib/texto.mjs';
import { textoFalado } from './narrar.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const MINIMO_CASADO = 0.9;

const limpar = (p) => dobrar(p).replace(/[^a-z0-9]/g, '');
// Pelo som: o Whisper escreve "Mase" para "Mázi". z/s/ç, ss, e/i no fim e h mudo contam como iguais.
const soar = (p) => limpar(p).replace(/ss/g, 's').replace(/z/g, 's').replace(/^h/, '').replace(/e$/, 'i').replace(/o$/, 'u');
const tokens = (texto) => texto.split(/\s+/).filter((p) => limpar(p));

function parecidas(roteiro, ouvida) {
  const a = limpar(roteiro);
  const b = limpar(ouvida);
  if (!a || !b) return false;
  if (a === b || limpar(textoFalado(roteiro)) === b || soar(roteiro) === soar(ouvida) || soar(textoFalado(roteiro)) === soar(ouvida)) return true;
  return (a.length > 3 || b.length > 3) && similaridade(a, b) >= 0.7;
}

/** Palavras ouvidas pelo Whisper: [{ p, i, f }] em segundos. */
export function ouvir(audio) {
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  try {
    rodar(python, ['-c', 'import faster_whisper']);
  } catch {
    rodar(python, ['-m', 'pip', 'install', '-q', 'faster-whisper']);
  }
  const tmp = mkdtempSync(path.join(tmpdir(), 'mazzi-whisper-'));
  try {
    const cru = path.join(tmp, 'audio.f32');
    rodar(ffmpeg(), ['-v', 'error', '-y', '-i', audio, '-ac', '1', '-ar', '16000', '-f', 'f32le', cru]);
    return JSON.parse(rodar(python, ['-X', 'utf8', '-I', path.join(AQUI, 'alinhar.py'), cru]).stdout);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * falas: textos das batidas; inicios/duracoes: de cada fala no áudio final (s); ouvidas: saída do Whisper.
 * Devolve { palavras: [{ texto, batida, inicio, fim }], casado (0..1) }.
 */
export function casar(falas, inicios, duracoes, ouvidas) {
  const roteiro = falas.flatMap((f, b) => tokens(f).map((texto) => ({ texto, batida: b })));
  const n = roteiro.length;
  const m = ouvidas.length;
  // LCS com tolerância (custo 0 se parecidas): tabela de tamanho n×m, pequena para 20–45 s de fala.
  const t = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i][j] = parecidas(roteiro[i].texto, ouvidas[j].p) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  const tempo = new Array(n).fill(null);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (parecidas(roteiro[i].texto, ouvidas[j].p) && t[i][j] === t[i + 1][j + 1] + 1) { tempo[i] = ouvidas[j]; i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) i++; else j++;
  }
  const casadas = tempo.filter(Boolean).length;

  // Sem par: interpola entre os vizinhos casados da mesma batida (ou as pontas da batida).
  const palavras = roteiro.map((r, i) => ({ texto: r.texto, batida: r.batida, inicio: tempo[i]?.i, fim: tempo[i]?.f }));
  for (let b = 0; b < falas.length; b++) {
    const idx = palavras.map((p, i) => (p.batida === b ? i : -1)).filter((i) => i >= 0);
    const ini = inicios[b];
    const fim = inicios[b] + duracoes[b];
    let k = 0;
    while (k < idx.length) {
      if (palavras[idx[k]].inicio !== undefined) { k++; continue; }
      let e = k;
      while (e < idx.length && palavras[idx[e]].inicio === undefined) e++;
      const de = k > 0 ? palavras[idx[k - 1]].fim : ini;
      const ate = e < idx.length ? palavras[idx[e]].inicio : fim;
      const passo = Math.max(0.05, (ate - de) / (e - k));
      for (let x = k; x < e; x++) Object.assign(palavras[idx[x]], { inicio: +(de + passo * (x - k)).toFixed(3), fim: +(de + passo * (x - k + 1)).toFixed(3) });
      k = e;
    }
  }
  return { palavras, casado: n ? casadas / n : 0 };
}

/** Alinha e confere o mínimo. Devolve { palavras, casado, motivos[] }. */
export function alinhar(audio, falas, inicios, duracoes, { ouvirFn = ouvir } = {}) {
  const r = casar(falas, inicios, duracoes, ouvirFn(audio));
  const motivos = r.casado < MINIMO_CASADO ? [`legenda: só ${Math.round(r.casado * 100)}% das palavras casaram com o áudio (mínimo ${MINIMO_CASADO * 100}%)`] : [];
  return { ...r, motivos };
}
