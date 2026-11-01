// Vídeo de fundo do reel (B-roll) do Pexels: grátis, uso comercial liberado, vertical.
// Regras (licença do Pexels e marca): nada de pessoa identificável sugerindo que usa ou recomenda a Mazzi
// (o termo de busca é de objeto/lugar e o juiz visual confere), e crédito "Vídeo: Pexels" na legenda.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const API = 'https://api.pexels.com/videos/search';

/** Escolhe o arquivo vertical mais próximo de 1080 de largura (sem passar de 1920 de altura). */
export function escolherArquivo(video) {
  const mp4 = (video.video_files ?? []).filter((f) => f.file_type === 'video/mp4' && f.height > f.width && f.height <= 1920 && f.width >= 540);
  return mp4.sort((a, b) => Math.abs(a.width - 1080) - Math.abs(b.width - 1080))[0] ?? null;
}

/** Busca e baixa um vídeo por termo. Devolve { arquivo, id, autor, url } ou null (sem chave, sem resultado ou erro). */
export async function buscarBroll(termo, pasta, nome, { chave = process.env.PEXELS_KEY, fetch = globalThis.fetch, usados = new Set(), log = () => {} } = {}) {
  if (!chave || !termo) return null;
  try {
    const url = `${API}?${new URLSearchParams({ query: termo, orientation: 'portrait', size: 'medium', per_page: '15' })}`;
    const r = await fetch(url, { headers: { Authorization: chave } });
    if (!r.ok) throw new Error(`Pexels ${r.status}`);
    const { videos = [] } = await r.json();
    for (const v of videos.filter((x) => x.duration >= 4 && !usados.has(x.id))) {
      const f = escolherArquivo(v);
      if (!f) continue;
      const bin = await fetch(f.link);
      if (!bin.ok) continue;
      mkdirSync(pasta, { recursive: true });
      const arquivo = path.join(pasta, nome);
      writeFileSync(arquivo, Buffer.from(await bin.arrayBuffer()));
      usados.add(v.id);
      return { arquivo, id: v.id, autor: v.user?.name ?? '', url: v.url };
    }
    log(`Pexels: nada vertical para "${termo}"`);
  } catch (e) {
    log(`Pexels falhou para "${termo}": ${e.message}`);
  }
  return null;
}

/** Põe "Vídeo: Pexels" antes das hashtags (que continuam no fim). */
export function creditarPexels(legenda) {
  if (/V[ií]deos?: Pexels/i.test(legenda)) return legenda;
  const m = legenda.match(/\n\s*((?:#[\p{L}\p{N}_]+\s*)+)$/u);
  if (!m) return `${legenda.trimEnd()}\n\nVídeo: Pexels`;
  return `${legenda.slice(0, m.index).trimEnd()}\n\nVídeo: Pexels\n\n${m[1].trim()}`;
}
