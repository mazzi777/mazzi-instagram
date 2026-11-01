// Reel narrado da Mazzi (1080×1920, 30 fps). Visual da marca: grafite, coral, Inter.
// Área segura do Instagram: todo texto entre y=230 e y=1440 e fora dos 230 px da direita (botões do app).
// Movimento: a frase da tela entra em 300 ms (sobe 24 px e aparece, curva que desacelera); a legenda acende
// palavra por palavra no tempo da fala. Nada quica, nada gira: quem trabalha é a legenda.
import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import { loadFont } from '@remotion/fonts';

const COR = { fundo: '#111316', texto: '#F3F1EC', coral: '#FF7A50', apagado: '#9a9890', cartao: '#1d2026', borda: '#2c3038' };
const TONS = { ok: ['#1f3a2b', '#6fd39a'], aviso: ['#3d3220', '#f2c46d'], ruim: ['#40211f', '#f08a80'], neutro: ['#262a31', '#c9c6bf'] };
const ROTULO = { clinica: 'Clínica', restaurante: 'Restaurante', comum: 'Mazzi Systems' };
const SAI = Easing.bezier(0.22, 1, 0.36, 1);
const ESQ = 96;
const LARGURA = 1080 - ESQ - 230;

for (const peso of [500, 700, 800]) loadFont({ family: 'Inter', url: staticFile(`inter-${peso}.woff2`), weight: String(peso) });

function Entrada({ children, atraso = 0 }) {
  const f = useCurrentFrame() - atraso;
  const p = interpolate(f, [0, 9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: SAI });
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>{children}</div>;
}

function Titulo({ texto, destaque }) {
  const i = destaque ? texto.lastIndexOf(destaque) : -1;
  const partes = i < 0 ? [texto] : [texto.slice(0, i), <span key="d" style={{ color: COR.coral }}>{destaque}</span>, texto.slice(i + destaque.length)];
  const tam = texto.length > 34 ? 88 : texto.length > 22 ? 100 : 116;
  return <div style={{ fontSize: tam, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.03, color: COR.texto }}>{partes}</div>;
}

function Cartao({ cartao }) {
  return (
    <div style={{ background: COR.cartao, border: `2px solid ${COR.borda}`, borderRadius: 28, padding: '30px 34px 12px', marginTop: 44 }}>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.14em', color: '#8b8f97', marginBottom: 8 }}>
        EXEMPLO{cartao.titulo ? ` · ${cartao.titulo.toUpperCase()}` : ''}
      </div>
      {cartao.linhas.map((l, i) => {
        const [fundo, cor] = TONS[l.tom ?? 'neutro'];
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, padding: '16px 0', borderTop: i ? `2px solid ${COR.borda}` : 'none', fontSize: 34, color: COR.texto }}>
            <span>{l.rotulo}</span>
            {l.selo ? <span style={{ fontSize: 28, fontWeight: 700, padding: '6px 20px', borderRadius: 999, background: fundo, color: cor, whiteSpace: 'nowrap' }}>{l.selo}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Legenda: o trecho (até 6 palavras) que contém a palavra falada agora; ela em coral. */
function Legenda({ palavras, fps }) {
  const t = useCurrentFrame() / fps;
  const atual = palavras.findLastIndex((p) => p.inicio <= t);
  if (atual < 0 || t > palavras[palavras.length - 1].fim + 0.4) return null;
  const batida = palavras[atual].batida;
  const daBatida = palavras.map((p, i) => ({ ...p, i })).filter((p) => p.batida === batida);
  const trechos = [];
  for (let k = 0; k < daBatida.length; k += 6) trechos.push(daBatida.slice(k, k + 6));
  const trecho = trechos.find((tr) => tr.some((p) => p.i === atual)) ?? trechos[0];
  return (
    <div style={{ position: 'absolute', left: ESQ, top: 1190, width: LARGURA, fontSize: 64, fontWeight: 700, lineHeight: 1.18, letterSpacing: '-0.01em' }}>
      <span style={{ background: 'rgba(17,19,22,0.82)', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', padding: '4px 14px', borderRadius: 12 }}>
        {trecho.map((p) => (
          <span key={p.i} style={{ color: p.i === atual ? COR.coral : COR.texto, opacity: p.i <= atual ? 1 : 0.72 }}>{p.texto} </span>
        ))}
      </span>
    </div>
  );
}

function Batida({ b, ramo }) {
  return (
    <AbsoluteFill>
      {b.broll ? (
        <AbsoluteFill>
          <OffthreadVideo src={staticFile(b.broll)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(17,19,22,0.82) 0%, rgba(17,19,22,0.62) 45%, rgba(17,19,22,0.9) 100%)' }} />
        </AbsoluteFill>
      ) : null}
      <div style={{ position: 'absolute', left: ESQ, top: 250, width: LARGURA }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '0.08em', color: COR.coral, textTransform: 'uppercase' }}>{ROTULO[ramo] ?? ''}</div>
        <div style={{ fontSize: 28, fontWeight: 500, color: COR.apagado, marginTop: 8 }}>@mazzisystems</div>
      </div>
      <div style={{ position: 'absolute', left: ESQ, top: 420, width: LARGURA }}>
        <Entrada><Titulo texto={b.tela} destaque={b.destaque} /></Entrada>
        {b.cartao ? <Entrada atraso={6}><Cartao cartao={b.cartao} /></Entrada> : null}
      </div>
    </AbsoluteFill>
  );
}

export function ReelNarrado({ batidas, palavras, ramo, audio, duracaoFrames }) {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: COR.fundo, fontFamily: 'Inter, sans-serif' }}>
      {batidas.map((b, i) => {
        const de = Math.round(b.inicio * fps);
        const ate = i + 1 < batidas.length ? Math.round(batidas[i + 1].inicio * fps) : duracaoFrames;
        return <Sequence key={i} from={de} durationInFrames={Math.max(1, ate - de)}><Batida b={b} ramo={ramo} /></Sequence>;
      })}
      <Legenda palavras={palavras} fps={fps} />
      <Audio src={staticFile(audio)} />
    </AbsoluteFill>
  );
}
