// Entrada do Remotion: uma composição só, com a duração vinda das props.
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { ReelNarrado } from './ReelNarrado.jsx';

function Raiz() {
  return (
    <Composition
      id="ReelNarrado"
      component={ReelNarrado}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={900}
      defaultProps={{ batidas: [], palavras: [], ramo: 'comum', audio: 'narracao.wav', duracaoFrames: 900 }}
      calculateMetadata={({ props }) => ({ durationInFrames: props.duracaoFrames })}
    />
  );
}

registerRoot(Raiz);
