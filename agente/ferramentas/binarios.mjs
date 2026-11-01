// Onde estão o ffmpeg e o ffprobe: no GitHub, os do sistema (apt); no PC, o ffmpeg-static e o ffprobe do Remotion.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const noPath = (nome) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [nome], { encoding: 'utf8' }).status === 0;

export function ffmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  if (noPath('ffmpeg')) return 'ffmpeg';
  return require('ffmpeg-static');
}

export function ffprobe() {
  if (process.env.FFPROBE) return process.env.FFPROBE;
  if (noPath('ffprobe')) return 'ffprobe';
  const pacote = `@remotion/compositor-${process.platform}-${process.arch}${process.platform === 'win32' ? '-msvc' : ''}`;
  const exe = path.join(path.dirname(require.resolve(`${pacote}/package.json`)), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  if (existsSync(exe)) return exe;
  throw new Error('ffprobe não encontrado (instale o ffmpeg ou defina FFPROBE)');
}

/** Roda e devolve a saída; erro vira exceção com o stderr. */
export function rodar(bin, args, { entrada } = {}) {
  const r = spawnSync(bin, args, { encoding: 'utf8', input: entrada, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${path.basename(bin)} falhou: ${(r.stderr || r.error?.message || '').split('\n').slice(-6).join(' ').trim()}`);
  return r;
}

export function duracao(arquivo) {
  return parseFloat(rodar(ffprobe(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arquivo]).stdout);
}
