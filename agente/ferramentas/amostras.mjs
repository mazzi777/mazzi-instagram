// Amostras das vozes para a Andressa comparar (SPEC 2.1): o mesmo texto no Antonio (Edge) e no Kokoro (pm_alex).
// Uso: node agente/ferramentas/amostras.mjs <pasta>   → <pasta>/antonio.wav, <pasta>/kokoro.wav
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { narrar, juntarFalas, motorEdge, motorKokoro } from './narrar.mjs';

export const TEXTO_AMOSTRA = [
  'O caixa não fechou de novo?',
  'A sangria ficou num papel que ninguém achou.',
  'Na Mazzi, cada sangria fica registrada na hora.',
  'No fechamento, você vê a diferença do dia e de onde ela veio.',
  'Quer ver no seu restaurante? Chama no WhatsApp, o link tá na bio.',
];

const pasta = path.resolve(process.argv[2] ?? 'amostras');
mkdirSync(pasta, { recursive: true });
for (const [nome, motor] of [['antonio', motorEdge], ['kokoro', motorKokoro]]) {
  const v = await narrar(TEXTO_AMOSTRA, path.join(pasta, `falas-${nome}`), { motores: [motor], log: console.log });
  if (!v.motor) { console.log(`${nome}: não gerou`); continue; }
  juntarFalas(v.arquivos, v.duracoes, path.join(pasta, `${nome}.wav`));
  console.log(`${nome}: ok (${v.duracoes.reduce((a, b) => a + b, 0).toFixed(1)} s de fala)`);
}
