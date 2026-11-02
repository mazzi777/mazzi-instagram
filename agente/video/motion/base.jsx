// Base do motion dos reels (v2): atos de cor, fundo vivo, câmera, rabisco à mão, ícones e legenda.
// Linguagem tirada dos fixados e das referências da Andressa (01/11/2026): plano contínuo, elementos que entram
// por partes no tempo da batida, 3D leve, desfoque de movimento, risco à mão na palavra-chave.
import React, { createContext, useContext } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing, staticFile } from 'remotion';
import { loadFont } from '@remotion/fonts';
import * as Lucide from 'lucide-react';
import { T, MARK_DARK, MARK_BLUE } from './logo.js';

for (const peso of [500, 700, 800, 900]) loadFont({ family: 'Inter', url: staticFile(`inter-${peso}.woff2`), weight: String(peso) });

export const COR = {
  grafite: '#111316', grafite2: '#1b1e23', papel: '#F3F1EC', papel2: '#E7E3DA', coral: '#FF7A50', coral2: '#FF9A76',
  azul: '#0A5CFC', azulFundo: '#0638B8', apagado: '#9a9890', cartao: '#1d2026', borda: '#2c3038', verde: '#6fd39a', amarelo: '#f2c46d',
};

// Cada ato tem fundo, cor do texto e cor de destaque. O agente alterna os atos para o reel não ficar "chapado".
export const ATOS = {
  escuro: { fundo: COR.grafite, texto: COR.papel, destaque: COR.coral, suave: '#c9c6bf', brilho: 'rgba(255,122,80,0.28)' },
  claro: { fundo: COR.papel, texto: COR.grafite, destaque: '#E8562A', suave: '#55534e', brilho: 'rgba(255,122,80,0.22)' },
  coral: { fundo: COR.coral, texto: COR.grafite, destaque: COR.papel, suave: '#3a1e14', brilho: 'rgba(255,255,255,0.25)' },
  azul: { fundo: COR.azulFundo, texto: '#FFFFFF', destaque: '#9FDBFF', suave: 'rgba(255,255,255,0.8)', brilho: 'rgba(0,184,253,0.35)' },
};

export const SAI = Easing.bezier(0.22, 1, 0.36, 1);
export const ENTRA_SAI = Easing.bezier(0.65, 0, 0.35, 1);
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
/** Interpolação com curva: de (a→b quadros) vai de v0 a v1. */
export const tw = (f, a, b, v0, v1, e = SAI) => interpolate(f, [a, b], [v0, v1], { ...CLAMP, easing: e });
export const mola = (f, fps, atraso = 0, cfg = { damping: 14, stiffness: 170, mass: 0.8 }) => spring({ frame: f - atraso, fps, config: cfg });

// Contexto da cena: ato, duração e as batidas da música (em quadros locais), para os elementos entrarem no tempo.
export const Cena = createContext({ ato: ATOS.escuro, nomeAto: 'escuro', duracao: 90, batidas: [0, 15, 30, 45, 60, 75], fps: 30 });
export const useCena = () => useContext(Cena);
/** Quadro (local) da n-ésima batida da cena; se acabarem, segue de 8 em 8 quadros. */
export function naBatida(n) {
  const { batidas } = useCena();
  if (n < batidas.length) return batidas[n];
  const ult = batidas.at(-1) ?? 0;
  return ult + (n - batidas.length + 1) * 8;
}

/** Fundo vivo: cor do ato, luz que passeia, anéis finos, grão e vinheta. */
export function Fundo() {
  const f = useCurrentFrame();
  const { ato, nomeAto } = useCena();
  const deriva = Math.sin(f / 45) * 60;
  return (
    <AbsoluteFill style={{ background: ato.fundo, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', width: 1500, height: 1500, left: -420 + deriva, top: 120 - deriva / 2, borderRadius: '50%', background: `radial-gradient(circle, ${ato.brilho}, transparent 62%)`, filter: 'blur(30px)' }} />
      <div style={{ position: 'absolute', width: 1000, height: 1000, left: 520 - deriva, top: 1100, borderRadius: '50%', background: `radial-gradient(circle, ${ato.brilho}, transparent 65%)`, filter: 'blur(40px)', opacity: 0.7 }} />
      {[1500, 1100].map((t, i) => (
        <div key={t} style={{ position: 'absolute', width: t, height: t, left: 540 - t / 2 + (i ? -deriva : deriva) / 2, top: 900 - t / 2, borderRadius: '50%', border: `2px solid ${nomeAto === 'claro' ? 'rgba(17,19,22,0.06)' : 'rgba(255,255,255,0.06)'}` }} />
      ))}
      <Grao />
      <AbsoluteFill style={{ boxShadow: `inset 0 0 260px ${nomeAto === 'claro' ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.55)'}` }} />
    </AbsoluteFill>
  );
}

/** Grão de filme (muda de lugar a cada 2 quadros: dá vida sem pesar). */
export function Grao() {
  const f = useCurrentFrame();
  const off = Math.floor(f / 2) % 7;
  return (
    <AbsoluteFill style={{ opacity: 0.07, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
      <svg width="1080" height="1920" aria-hidden="true">
        <filter id={`g${off}`}><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={off} /></filter>
        <rect width="1080" height="1920" filter={`url(#g${off})`} />
      </svg>
    </AbsoluteFill>
  );
}

/** Câmera que respira: aproxima devagar a cena inteira e, se pedido, treme no impacto. */
export function Camera({ children, tremerEm = [] }) {
  const f = useCurrentFrame();
  const { duracao } = useCena();
  const zoom = interpolate(f, [0, Math.max(1, duracao)], [1, 1.045], CLAMP);
  const tremor = tremerEm.reduce((t, q) => {
    const d = f - q;
    return d >= 0 && d < 8 ? t + Math.sin(d * 2.6) * (8 - d) * 1.6 : t;
  }, 0);
  return <AbsoluteFill style={{ transform: `scale(${zoom}) translate(${tremor}px, ${tremor * 0.6}px)` }}>{children}</AbsoluteFill>;
}

/** Risco à mão (traço que se desenha) em volta ou embaixo de uma palavra. */
export function Rabisco({ inicio, largura = 520, altura = 150, cor, tipo = 'circulo', estilo }) {
  const f = useCurrentFrame();
  const p = tw(f, inicio, inicio + 12, 0, 1, ENTRA_SAI);
  const d = tipo === 'circulo'
    ? 'M30 88 C 40 20, 330 4, 382 52 C 412 84, 300 128, 170 124 C 70 121, 12 100, 28 64 C 40 38, 120 22, 210 20'
    : 'M10 40 C 90 22, 200 30, 300 26 C 340 24, 370 30, 392 22 M40 62 C 140 50, 260 56, 380 46';
  return (
    <svg viewBox="0 0 400 140" aria-hidden="true" style={{ position: 'absolute', width: largura, height: altura, overflow: 'visible', ...estilo }} fill="none">
      <path d={d} stroke={cor} strokeWidth={tipo === 'circulo' ? 7 : 6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
    </svg>
  );
}

/** Ícone da biblioteca Lucide (licença ISC) por nome. Nome desconhecido vira um brilho. */
export function Icone({ nome, tamanho = 64, cor = 'currentColor', traco = 2.2 }) {
  const C = Lucide[nome] ?? Lucide.Sparkles;
  return <C size={tamanho} color={cor} strokeWidth={traco} aria-hidden="true" />;
}
export { ICONES } from './icones.mjs';

/**
 * Quantas linhas um texto ocupa (estimativa por quebra de palavra, conservadora: ~0,6 em por letra na Inter
 * pesada). Serve para o conteúdo da cena não ficar por cima de um título que quebrou em mais linhas.
 */
export function linhasEstimadas(texto, tamanho, largura, porLetra = 0.6) {
  const cabe = largura / (tamanho * porLetra);
  let linhas = 1;
  let atual = 0;
  for (const p of texto.split(/\s+/).filter(Boolean)) {
    const n = p.length + (atual ? 1 : 0);
    if (atual && atual + n > cabe) { linhas++; atual = p.length; } else atual += n;
  }
  return linhas;
}

/** O maior tamanho da lista em que o texto cabe em `maxLinhas`. */
export function tamanhoQueCabe(texto, largura, tamanhos, maxLinhas = 2) {
  return tamanhos.find((t) => linhasEstimadas(texto, t, largura) <= maxLinhas) ?? tamanhos.at(-1);
}

/** Texto grande com a palavra de destaque colorida (as palavras entram uma a uma, no tempo das batidas). */
export function TituloCinetico({ texto, destaque, tamanho, inicio = 0, passo = 4, estilo, sublinhar }) {
  const f = useCurrentFrame();
  const { ato } = useCena();
  const palavras = texto.split(/\s+/);
  const iDest = destaque ? palavras.findIndex((p) => destaque.split(/\s+/).some((d) => p.toLowerCase().startsWith(d.toLowerCase().replace(/[?!.,]/g, '')))) : -1;
  const tam = tamanho ?? (texto.length > 32 ? 92 : texto.length > 20 ? 112 : 136);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: `0 ${tam * 0.24}px`, fontWeight: 900, fontSize: tam, lineHeight: 1.0, letterSpacing: '-0.045em', color: ato.texto, ...estilo }}>
      {palavras.map((p, i) => {
        const q = inicio + i * passo;
        const v = tw(f, q, q + 7, 0, 1);
        const desfoque = (1 - v) * 14;
        const eDestaque = iDest >= 0 && i >= iDest && i < iDest + (destaque?.split(/\s+/).length ?? 1);
        // Marca-texto ATRÁS da palavra, do tamanho real dela e dentro da própria linha: não corta letra nem invade
        // a linha de cima ou de baixo (o círculo antigo era desenhado por cima, com largura estimada, e cortava).
        const marcar = eDestaque && sublinhar;
        const m = marcar ? tw(f, q + 8, q + 16, 0, 1, ENTRA_SAI) : 0;
        return (
          <span key={i} style={{ position: 'relative', display: 'inline-block', opacity: v, transform: `translateY(${(1 - v) * 40}px) scale(${1.12 - 0.12 * v})`, filter: `blur(${desfoque}px)`, color: eDestaque ? ato.destaque : undefined }}>
            {p}
            {/* Marca e a mesma palavra em grafite aparecem pela MESMA janela que corre da esquerda para a direita:
                a letra escura anda junto com a marca, então nunca fica cor sobre a mesma cor. */}
            {marcar ? (
              <span aria-hidden="true" style={{ position: 'absolute', left: '-0.08em', right: '-0.08em', top: 0, bottom: 0, clipPath: `inset(-0.1em ${(1 - m) * 100}% -0.1em 0)` }}>
                <span style={{ position: 'absolute', left: 0, right: 0, top: '0.1em', bottom: 0, borderRadius: '0.12em', background: ato.destaque, transform: 'rotate(-1.2deg)' }} />
                <span style={{ position: 'absolute', left: '0.08em', top: 0, whiteSpace: 'nowrap', color: COR.grafite }}>{p}</span>
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/** Rótulo do ramo no topo (dentro da área segura: y ≥ 230). */
export function Rotulo({ texto }) {
  const f = useCurrentFrame();
  const { ato } = useCena();
  return (
    <div style={{ position: 'absolute', left: 96, top: 236, display: 'flex', alignItems: 'center', gap: 14, opacity: tw(f, 0, 8, 0, 1) }}>
      <div style={{ width: 14, height: 14, borderRadius: 7, background: ato.destaque }} />
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '0.08em', color: ato.texto, textTransform: 'uppercase', opacity: 0.85 }}>{texto}</div>
    </div>
  );
}

/** Legenda da voz, palavra por palavra (pílula escura: legível em qualquer ato). */
export function Legenda({ palavras }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const atual = palavras.findLastIndex((p) => p.inicio <= t);
  if (atual < 0 || t > palavras[palavras.length - 1].fim + 0.4) return null;
  const batida = palavras[atual].batida;
  const daBatida = palavras.map((p, i) => ({ ...p, i })).filter((p) => p.batida === batida);
  const trechos = [];
  for (let k = 0; k < daBatida.length; k += 5) trechos.push(daBatida.slice(k, k + 5));
  const trecho = trechos.find((tr) => tr.some((p) => p.i === atual)) ?? trechos[0];
  return (
    <div style={{ position: 'absolute', left: 96, top: 1236, width: 754, fontSize: 60, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.01em', fontFamily: 'Inter, sans-serif' }}>
      <span style={{ background: 'rgba(17,19,22,0.86)', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', padding: '6px 16px', borderRadius: 14 }}>
        {trecho.map((p) => {
          const ativo = p.i === atual;
          // A palavra da vez sobe um pouco (não cresce de lado: crescer cobria o espaço e grudava as palavras).
          const y = ativo ? tw(f, Math.round(p.inicio * fps), Math.round(p.inicio * fps) + 4, -10, 0) : 0;
          return <span key={p.i} style={{ display: 'inline-block', marginRight: 16, transform: `translateY(${y}px)`, color: ativo ? COR.coral : COR.papel, opacity: p.i <= atual ? 1 : 0.72 }}>{p.texto}</span>;
        })}
      </span>
    </div>
  );
}

/** Marca oficial da Mazzi (os mesmos traços do app), para órbita e fechamento. */
export function MarcaMazzi({ tamanho = 160, cor = '#FFFFFF', degrade = ['#9FDBFF', '#FFFFFF'] }) {
  return (
    <svg viewBox="0 0 1270 1064" width={tamanho} height={tamanho * (1064 / 1270)} aria-hidden="true">
      <defs><linearGradient id="mz-marca" x1="1" y1="1" x2="0.35" y2="0"><stop offset="0" stopColor={degrade[0]} /><stop offset="1" stopColor={degrade[1]} /></linearGradient></defs>
      <g transform={T}><path fill={cor} d={MARK_DARK} /></g>
      <g transform={T}><path fill="url(#mz-marca)" d={MARK_BLUE} /></g>
    </svg>
  );
}
