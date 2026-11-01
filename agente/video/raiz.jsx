// Entrada do Remotion: o reel em motion graphics (v2). A duração vem das props.
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { ReelMotion } from './motion/ReelMotion.jsx';

function Raiz() {
  return (
    <Composition
      id="ReelMotion"
      component={ReelMotion}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={900}
      defaultProps={{ cenas: [], palavras: [], audio: 'narracao.wav', musica: null, sfx: [], duracaoFrames: 900 }}
      calculateMetadata={({ props }) => ({ durationInFrames: props.duracaoFrames })}
    />
  );
}

registerRoot(Raiz);
