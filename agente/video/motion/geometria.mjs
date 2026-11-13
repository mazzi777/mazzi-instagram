// Geometria das cenas hub e encaixe (Node e Remotion leem daqui; o teste confere os limites).
// Área útil das cenas: x de 96 a 850 e y até 1180 (a legenda da voz começa em 1236). As cenas novas calculam a
// geometria aqui, e um teste confere que nada passa desses limites (revisão adversarial de 12/11: encaixe e hub
// invadiam a legenda).
export const AREA = { esq: 96, dir: 850, base: 1180 };
export function geometriaHub(n) {
  const cx = (AREA.esq + AREA.dir) / 2;
  const cy = 860;
  const pos = Array.from({ length: n }, (_, i) => {
    const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(ang) * 250, y: cy + Math.sin(ang) * 200 };
  });
  // Cada módulo: ícone de 110 a partir de y-70, rótulo de ~40 embaixo; 240 de largura.
  const caixa = { esq: Math.min(...pos.map((p) => p.x - 120)), dir: Math.max(...pos.map((p) => p.x + 120)), topo: Math.min(...pos.map((p) => p.y - 70)), base: Math.max(...pos.map((p) => p.y + 92)) };
  return { cx, cy, pos, caixa };
}
export function geometriaEncaixe(n) {
  const topo = 580;
  const fimCaixa = AREA.base - 116; // sobra para o contador (80 px + folga) acima da legenda
  const alt = Math.min(180, Math.floor((fimCaixa - topo - 52 - 20 * (n - 1)) / n));
  const baseCaixa = topo + 52 + n * alt + 20 * (n - 1);
  const letra = alt >= 150 ? [46, 62] : alt >= 110 ? [40, 54] : [36, 46];
  return { topo, alt, baseCaixa, contadorTopo: baseCaixa + 16, contadorBase: baseCaixa + 16 + 96, letra };
}

