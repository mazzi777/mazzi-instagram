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


// ---------- Contador (anel + número) ----------
// Em 21/11 o juiz visual reprovou dois reels: "532g" em fonte fixa de 210 px estourava o anel e o rótulo encostava na
// borda. Aqui o tamanho de cada linha sai da CORDA do anel na altura em que ela fica: nada passa da borda interna.
export const ANEL = { cx: 540, cy: 820, raio: 250, traco: 38 };
const FOLGA = 26; // distância mínima entre o texto e a borda interna do anel
export const RAIO_UTIL = ANEL.raio - ANEL.traco / 2 - FOLGA;
// Larguras por letra (em "em") medidas por cima na Inter: algarismos 900 com -0,05 em, maiúsculas 800 com +0,08 em.
const LETRA_NUMERO = 0.62;
const LETRA_ROTULO = 0.78;
export const SELO_CONTADOR = { tamanho: 26, altura: 48, largura: 7 * 26 * 0.8 + 40 };

/** Meia corda útil do anel numa faixa vertical (a pior das duas bordas). */
export function meiaCorda(topo, base) {
  const dy = Math.max(Math.abs(topo - ANEL.cy), Math.abs(base - ANEL.cy));
  return dy >= RAIO_UTIL ? 0 : Math.sqrt(RAIO_UTIL ** 2 - dy ** 2);
}

function quebrar(texto, porLinha) {
  const linhas = [];
  for (const p of texto.split(/\s+/).filter(Boolean)) {
    const ult = linhas.at(-1);
    if (ult && (ult.length + 1 + p.length) <= porLinha) linhas[linhas.length - 1] = `${ult} ${p}`;
    else linhas.push(p);
  }
  return linhas;
}

/**
 * Tamanhos e posições do contador: rótulo (até 2 linhas), número (+ "/total") e selo EXEMPLO, empilhados no centro do
 * anel. Procura o maior número que cabe (de 200 a 56 px); devolve `cabe: false` só se nem o menor couber.
 */
export function layoutContador({ rotulo = '', valor, total, sufixo = '' }) {
  const numero = `${valor}${sufixo ?? ''}`;
  const totalTxt = total ? `/${total}` : '';
  for (let n = 200; n >= 56; n -= 4) {
    const nTotal = Math.round(n * 0.45);
    const largNumero = numero.length * LETRA_NUMERO * n + (totalTxt ? 8 + totalTxt.length * LETRA_NUMERO * nTotal : 0);
    for (const r of [32, 30, 28, 26, 24, 22]) {
      const porLinha = Math.floor(2 * RAIO_UTIL * 0.8 / (r * LETRA_ROTULO));
      const linhas = rotulo ? quebrar(rotulo.toUpperCase(), porLinha) : [];
      if (linhas.length > 2) continue;
      const altRotulo = linhas.length * Math.round(r * 1.15);
      const gap = 14;
      const altura = altRotulo + (linhas.length ? gap : 0) + n + gap + SELO_CONTADOR.altura;
      const topo = ANEL.cy - altura / 2;
      const caixas = [];
      let y = topo;
      for (const l of linhas) {
        caixas.push({ parte: 'rotulo', topo: y, base: y + Math.round(r * 1.15), largura: l.length * LETRA_ROTULO * r });
        y += Math.round(r * 1.15);
      }
      if (linhas.length) y += gap;
      // O corpo dos algarismos ocupa ~0,74 do tamanho; a caixa do número é a linha inteira (conservador).
      caixas.push({ parte: 'numero', topo: y, base: y + n, largura: largNumero });
      y += n + gap;
      caixas.push({ parte: 'selo', topo: y, base: y + SELO_CONTADOR.altura, largura: SELO_CONTADOR.largura });
      if (caixas.every((c) => c.largura / 2 <= meiaCorda(c.topo, c.base))) {
        return { cabe: true, numero: n, total: nTotal, rotulo: r, linhas, topo, altura, caixas };
      }
    }
  }
  return { cabe: false, numero: 56, total: 25, rotulo: 22, linhas: quebrar(rotulo.toUpperCase(), 14).slice(0, 2), topo: ANEL.cy - 120, altura: 240, caixas: [] };
}
