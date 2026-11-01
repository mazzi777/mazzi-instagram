// Decisões de edição do reel (código, não Claude): onde cada cena começa (no tempo da batida da música),
// que ato de cor e que transição ela usa, e onde entra cada efeito sonoro. Puro e testável.

export const FPS = 30;
export const SOBREPOR = 6; // quadros de transição de cada lado do corte
const TRANSICOES = ['chicote', 'zoom', 'mascara', 'cortina', 'corte'];
const ATO_PADRAO = { gancho: 'escuro', digitando: 'claro', lista: 'claro', cartao: 'escuro', papel: 'escuro', checklist: 'escuro', contador: 'escuro', celular: 'escuro', icone: 'claro', orbita: 'escuro', ato: 'coral', painel: 'escuro', fechamento: 'azul' };
const WHOOSH = { chicote: 'whoosh-1', zoom: 'whoosh-2', mascara: 'abre', cortina: 'whoosh-3', corte: 'impacto-3' };

/** Gerador pseudoaleatório pequeno e determinístico (o mesmo reel sempre sai igual). */
export function sorteio(semente) {
  let s = [...String(semente)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** Tempos (s) das batidas da música na linha do tempo do reel. A trilha começa num trecho que cai na batida. */
export function gradeDeBatidas(bpm, duracao) {
  const periodo = 60 / (bpm < 100 ? bpm * 2 : bpm); // música lenta: corta no meio-tempo também
  const tempos = [];
  for (let t = 0; t <= duracao + periodo; t += periodo) tempos.push(+t.toFixed(3));
  return tempos;
}

/** Puxa um corte para a batida mais próxima, se estiver a até `tolerancia` segundos. */
export function encaixar(t, grade, tolerancia = 0.22) {
  let melhor = t;
  let dist = tolerancia;
  for (const b of grade) { const d = Math.abs(b - t); if (d <= dist) { dist = d; melhor = b; } }
  return melhor;
}

/** Atos de cor: o padrão da cena, sem repetir o mesmo ato 3 vezes seguidas; o fechamento é sempre azul. */
export function escolherAtos(tipos) {
  const atos = [];
  tipos.forEach((tipo, i) => {
    let ato = ATO_PADRAO[tipo] ?? 'escuro';
    if (tipo !== 'fechamento' && tipo !== 'ato' && i >= 2 && atos[i - 1] === ato && atos[i - 2] === ato) ato = ato === 'claro' ? 'escuro' : 'claro';
    atos.push(ato);
  });
  if (tipos.length >= 5 && !atos.includes('claro')) { const k = tipos.findIndex((t, i) => i > 0 && !['fechamento', 'ato', 'papel'].includes(t)); if (k > 0) atos[k] = 'claro'; }
  return atos;
}

/** Transição de entrada de cada cena: sorteada sem repetir a anterior; ato de cor entra de cortina; fechamento de zoom. */
export function escolherTransicoes(tipos, semente) {
  const r = sorteio(semente);
  const out = [];
  tipos.forEach((tipo, i) => {
    if (i === 0) return out.push('corte');
    if (tipo === 'ato') return out.push('cortina');
    if (tipo === 'fechamento') return out.push('zoom');
    const opcoes = TRANSICOES.filter((t) => t !== out[i - 1]);
    out.push(opcoes[Math.floor(r() * opcoes.length)]);
  });
  return out;
}

/**
 * Monta as props da composição ReelMotion.
 * batidas: [{ cena: { tipo, ...dados }, tela, destaque }] (do redator); inicios/duracoes: da voz (s);
 * musica: { arquivo, bpm, inicio_energia } ou null; total: duração do reel (s).
 */
export function planejarEdicao({ batidas, inicios, duracoes, total, musica, ramo, semente }) {
  const grade = musica ? gradeDeBatidas(musica.bpm, total) : [];
  const tipos = batidas.map((b, i) => (i === batidas.length - 1 ? 'fechamento' : b.cena.tipo));
  const atos = escolherAtos(tipos);
  const transicoes = escolherTransicoes(tipos, semente);
  // A cena começa um pouco antes da fala (o olho chega antes do ouvido), puxada para a batida mais próxima.
  const cortes = inicios.map((t, i) => (i === 0 ? 0 : Math.max(0, encaixar(t - 0.12, grade))));
  const fimTotal = Math.ceil(total * FPS);
  const cenas = batidas.map((b, i) => {
    const de = Math.round(cortes[i] * FPS);
    const ate = i + 1 < batidas.length ? Math.round(cortes[i + 1] * FPS) : fimTotal;
    const local = grade.map((t) => Math.round(t * FPS) - de + SOBREPOR).filter((q) => q >= SOBREPOR && q < ate - de + SOBREPOR);
    return { de, ate, tipo: tipos[i], ato: atos[i], entrada: transicoes[i], saida: transicoes[i + 1] ?? null, batidasLocais: local, dados: { ...b.cena, tela: b.tela, destaque: b.destaque, ramo: i === 0 ? ramo : undefined } };
  });
  return { cenas, sfx: efeitos(cenas), duracaoFrames: fimTotal };
}

/** Efeitos sonoros: transição (whoosh), impacto no gancho, pop por item, tique no contador, glitch no ícone. */
export function efeitos(cenas) {
  const ev = [];
  const add = (quadro, arquivo, volume = 0.55) => ev.push({ quadro: Math.max(0, Math.round(quadro)), arquivo: `sfx/${arquivo}.ogg`, volume });
  const pops = ['pop-1', 'pop-2', 'pop-3'];
  cenas.forEach((c, i) => {
    const ini = c.de - SOBREPOR; // o quadro 0 local da cena
    const batida = (n) => ini + (c.batidasLocais[n] ?? (c.batidasLocais.at(-1) ?? SOBREPOR) + (n - c.batidasLocais.length + 1) * 8);
    if (i > 0) add(c.de - 4, WHOOSH[c.entrada], c.entrada === 'corte' ? 0.4 : 0.5);
    const d = c.dados;
    if (c.tipo === 'gancho') add(c.de + 8, 'impacto-1', 0.5);
    if (c.tipo === 'lista') (d.itens ?? []).forEach((_, k) => add(batida(k) + 4, pops[k % 3], 0.45));
    if (c.tipo === 'checklist') (d.itens ?? []).forEach((_, k) => add(batida(k) + 8, k === (d.itens.length - 1) ? 'confirma' : 'clique-1', 0.45));
    if (c.tipo === 'cartao') add(c.de + 14, 'vidro', 0.35);
    if (c.tipo === 'digitando') add(ini + 6 + Math.ceil((d.texto?.length ?? 10) * 1.6) + 16, 'clique-2', 0.55);
    if (c.tipo === 'contador') add(c.de + 10, 'rolagem', 0.4);
    if (c.tipo === 'celular') (d.mensagens ?? []).forEach((_, k) => add(batida(k * 2) + 8, 'pop-2', 0.45));
    if (c.tipo === 'icone') add(ini + Math.round((c.ate - c.de + 2 * SOBREPOR) * 0.55), 'glitch', 0.5);
    if (c.tipo === 'orbita') add(c.de + 6, 'subida', 0.35);
    if (c.tipo === 'ato') add(c.de + 2, 'impacto-2', 0.5);
    if (c.tipo === 'fechamento') add(c.de + 18, 'brilho', 0.45);
  });
  return ev.sort((a, b) => a.quadro - b.quadro);
}
