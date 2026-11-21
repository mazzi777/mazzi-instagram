// Tempos do reel narrado: uma fonte só para a montagem (narrar.mjs/juntarFalas) e para a estimativa do roteiro
// (checagens/batidas.mjs). Antes eram dois números soltos e a estimativa errava para MAIS: em 21/11 um roteiro que
// passou como "20 s de fala" virou um vídeo de 19,8 s e o validador final reprovou.

// Montagem (juntarFalas): respiro antes da 1ª fala, pausa entre falas e cauda no fim (apad).
export const RESPIRO = 0.15;
export const PAUSA = 0.22;
export const CAUDA = 0.6;

// Duração de cada fala na voz real (Edge TTS pt-BR-AntonioNeural, rate +4%): medida em 21/11/2026 com 38 falas no
// estilo dos roteiros (agente/checagens/calibracao-voz.json), por mínimos quadrados:
//   dur ≈ 0,327 + 0,132 × sílabas + 0,359 × pausas de pontuação no meio da fala (vírgula, "?" antes do fim...)
// Erro médio 0,22 s (só por sílaba: 0,30 s; por palavra: 0,34 s). Com 20 falas curtas o primeiro ajuste errava 2,6 s
// num roteiro de falas longas com vírgula: por isso a pontuação entrou e a amostra cresceu.
export const FALA_FIXO = 0.327;
export const FALA_POR_SILABA = 0.132;
export const FALA_POR_PAUSA = 0.359;

// Folga de segurança da estimativa: o roteiro só passa se o vídeo estimado tiver pelo menos o mínimo + 1 s.
// O mínimo REAL (20 s) continua no validador do publicador, que mede o MP4 (publicar/validar.mjs).
export const MARGEM_DURACAO = 1.0;

/** Sílabas aproximadas (grupos de vogais), sem acento; número escrito conta pelo jeito falado aproximado. */
export function silabas(texto) {
  const t = String(texto).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const vogais = (t.match(/[aeiouy]+/g) ?? []).length;
  // Algarismos são lidos por extenso ("532" = quinhentos e trinta e dois): ~2 sílabas por algarismo.
  const digitos = (t.match(/\d/g) ?? []).length;
  return vogais + digitos * 2;
}

/** Pausas de pontuação no meio da fala (a do fim não conta: a pausa entre falas é a da montagem). */
export function pausasInternas(texto) {
  const t = String(texto).trim().replace(/[.!?…]+$/u, '');
  return (t.match(/[,;:?!.…]+/g) ?? []).length;
}

/** Segundos que a voz leva para dizer uma fala (estimativa calibrada). */
export const estimarFala = (texto) => FALA_FIXO + FALA_POR_SILABA * silabas(texto) + FALA_POR_PAUSA * pausasInternas(texto);

/** Duração estimada do VÍDEO: respiro + falas + pausas + cauda (a mesma conta do juntarFalas). */
export function estimarVideo(falas) {
  const lista = falas.map((f) => String(f).trim()).filter(Boolean);
  if (!lista.length) return 0;
  return RESPIRO + lista.reduce((s, f) => s + estimarFala(f), 0) + PAUSA * (lista.length - 1) + CAUDA;
}
