// Ritmo do roteiro do reel. Porte para pt-BR do beats.py (skill ig-reel, licença MIT).
// Estima quanto tempo cada fala leva, empilha em tempos e aponta o que mata um reel na edição:
// gancho que passa de 3 s, batida longa demais parada na mesma tela, falas seguidas sem nada concreto,
// e duração fora da faixa. Estimativa por palavras/segundo; o tempo real vem do áudio (alinhar.mjs).
import { palavras, minusculas, concretos } from '../lib/texto.mjs';

export const JANELA_GANCHO = 3.0;
export const BATIDA_MAX = 4.0;
const SEQUENCIA_ABSTRATA = 3;
const PALAVRAS_POR_SEGUNDO = 2.65; // voz do Antonio, ~160 por minuto

const VAZIAS = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'e', 'ou', 'mas', 'se', 'de', 'do', 'da', 'dos', 'das', 'no', 'na',
  'nos', 'nas', 'em', 'pra', 'para', 'com', 'que', 'é', 'isso', 'esse', 'essa', 'você', 'seu', 'sua', 'eu', 'meu', 'minha',
  'não', 'só', 'já', 'tem', 'ter', 'foi', 'ser', 'tá', 'por', 'como', 'mais', 'muito', 'quando', 'ele', 'ela', 'a gente']);

/** falas: lista de strings (uma por batida). Devolve { totalSegundos, batidas[], notas[], falhas[] }. */
export function analisarBatidas(falas, { palavrasPorSegundo = PALAVRAS_POR_SEGUNDO, duracaoMin = 20, duracaoMax = 45 } = {}) {
  const linhas = falas.map((f) => f.trim()).filter(Boolean);
  if (!linhas.length) return { totalSegundos: 0, batidas: [], notas: [], falhas: ['roteiro vazio'] };
  let relogio = 0;
  const batidas = linhas.map((texto, i) => {
    const n = palavras(texto).length;
    const dur = n / palavrasPorSegundo;
    const b = { n: i + 1, inicio: +relogio.toFixed(2), dur: +dur.toFixed(2), palavras: n, texto, concretos: concretos(texto).total };
    relogio += dur;
    return b;
  });
  const total = relogio;
  const falhas = [];
  const notas = [];

  if (batidas[0].dur > JANELA_GANCHO) {
    falhas.push(`o gancho leva ${batidas[0].dur.toFixed(1)} s para ser dito (máximo ${JANELA_GANCHO} s): corte para até ${Math.floor(JANELA_GANCHO * palavrasPorSegundo)} palavras`);
  }
  if (batidas[0].concretos === 0) notas.push('a 1ª batida não tem nada concreto (objeto, nome ou número)');
  const longas = batidas.filter((b) => b.dur > BATIDA_MAX).map((b) => b.n);
  if (longas.length) falhas.push(`batida(s) ${longas.join(', ')} passam de ${BATIDA_MAX} s: divida a fala ou mude a tela no meio`);

  let seguidas = 0;
  for (const b of batidas) {
    seguidas = b.concretos === 0 ? seguidas + 1 : 0;
    if (seguidas === SEQUENCIA_ABSTRATA) notas.push(`${SEQUENCIA_ABSTRATA} batidas seguidas sem nada concreto, terminando na ${b.n}`);
  }

  const chave = (t) => new Set(minusculas(palavras(t)).filter((p) => !VAZIAS.has(p)));
  const primeira = chave(batidas[0].texto);
  const eco = [...chave(batidas.at(-1).texto)].filter((p) => primeira.has(p));
  notas.push(eco.length ? `fecha em laço: a última batida repete "${eco.slice(0, 3).join(', ')}" do gancho` : 'sem laço: a última batida não repete nenhuma palavra do gancho');

  if (total < duracaoMin) falhas.push(`${total.toFixed(1)} s de fala, abaixo de ${duracaoMin} s`);
  if (total > duracaoMax) falhas.push(`${total.toFixed(1)} s de fala, acima de ${duracaoMax} s: corte ~${Math.ceil((total - duracaoMax) * palavrasPorSegundo)} palavras`);

  return { totalSegundos: +total.toFixed(2), batidas, notas, falhas };
}

export function checarBatidas(falas, opcoes) {
  const r = analisarBatidas(falas, opcoes);
  return { ok: r.falhas.length === 0, motivos: r.falhas.map((f) => `roteiro: ${f}`), detalhe: r };
}
