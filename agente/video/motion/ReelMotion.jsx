// Reel em motion graphics (v2): cenas da biblioteca com transições no corte, trilha, efeitos e a legenda da voz.
// As decisões de edição chegam prontas em `cenas` e `sfx` (roteiro.mjs); aqui só se desenha.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { Cena, ATOS, Legenda, tw, ENTRA_SAI } from './base.jsx';
import { CENAS } from './cenas.jsx';
import { SOBREPOR } from './roteiro.mjs';

const T = SOBREPOR;

/** Entrada e saída da cena conforme a transição (dura 2×T quadros, centrada no corte). */
function Transicao({ entrada, saida, duracao, children }) {
  const f = useCurrentFrame();
  const e = tw(f, 0, 2 * T, 0, 1, ENTRA_SAI); // 0 → 1 na entrada
  const s = tw(f, duracao - 2 * T, duracao, 0, 1, ENTRA_SAI); // 0 → 1 na saída
  let estilo = {};
  if (entrada === 'chicote' && e < 1) estilo = { transform: `translateX(${(1 - e) * 1080}px)`, filter: `blur(${(1 - e) * 24}px)` };
  if (entrada === 'zoom' && e < 1) estilo = { transform: `scale(${1.5 - 0.5 * e})`, opacity: e, filter: `blur(${(1 - e) * 18}px)` };
  if (entrada === 'mascara' && e < 1) estilo = { clipPath: `circle(${e * 120}% at 50% 46%)` };
  if (entrada === 'cortina' && e < 1) estilo = { clipPath: `polygon(0 0, ${e * 200}% 0, ${e * 200 - 60}% 100%, 0 100%)` };
  if (entrada === 'corte') estilo = { transform: `scale(${interpolate(f, [T, T + 6], [1.06, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})` };
  if (s > 0 && saida === 'chicote') estilo = { ...estilo, transform: `translateX(${-s * 1080}px)`, filter: `blur(${s * 24}px)` };
  if (s > 0 && saida === 'zoom') estilo = { ...estilo, transform: `scale(${1 + s * 0.6})`, opacity: 1 - s, filter: `blur(${s * 18}px)` };
  return <AbsoluteFill style={estilo}>{children}</AbsoluteFill>;
}

export function ReelMotion({ cenas, palavras, audio, musica, sfx, duracaoFrames }) {
  return (
    <AbsoluteFill style={{ background: '#111316', fontFamily: 'Inter, sans-serif' }}>
      {cenas.map((c, i) => {
        const de = Math.max(0, c.de - T);
        const ate = Math.min(duracaoFrames, c.ate + T);
        const Componente = CENAS[c.tipo];
        const duracao = ate - de;
        return (
          <Sequence key={i} from={de} durationInFrames={Math.max(1, duracao)}>
            <Cena.Provider value={{ ato: ATOS[c.ato], nomeAto: c.ato, duracao, batidas: c.batidasLocais, fps: 30 }}>
              <Transicao entrada={c.entrada} saida={c.saida} duracao={duracao}>
                <Componente {...c.dados} />
              </Transicao>
            </Cena.Provider>
          </Sequence>
        );
      })}
      <Legenda palavras={palavras} />
      <Audio src={staticFile(audio)} />
      {musica ? (
        <Audio src={staticFile(musica.arquivo)} startFrom={Math.round(musica.inicio * 30)}
          volume={(f) => interpolate(f, [0, 8, duracaoFrames - 30, duracaoFrames], [0, musica.volume, musica.volume, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
      ) : null}
      {sfx.map((e, i) => (
        <Sequence key={`s${i}`} from={e.quadro} durationInFrames={45}>
          <Audio src={staticFile(e.arquivo)} volume={e.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
