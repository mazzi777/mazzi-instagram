// G5: texto sem cara de IA. Porte para pt-BR do detect.py (skill ig-human, licença MIT).
// Cinco critérios de 0 a 100 (maior = mais humano): variação das frases, concretude, palavras de IA,
// marcas tipográficas que o teclado do celular não produz, e voz (fala de gente, com pessoa).
// Não é um detector comercial (GPTZero etc.): pega os sinais que todos eles usam.
//
// Adaptações: a "contração" do inglês vira o coloquial do pt-BR (pra, tá, né); concretude conta os
// objetos do dia a dia do dono (número inventado é proibido na marca); o léxico é pt-BR (lexico-ia.json).
import { readFileSync } from 'node:fs';
import { palavras, minusculas, frases, concretos, escala, limitar, desvioPadrao, media, notaGeral } from '../lib/texto.mjs';

const LEXICO = JSON.parse(readFileSync(new URL('./lexico-ia.json', import.meta.url), 'utf8'));

const COLOQUIAL = new Set(['pra', 'pro', 'pros', 'pras', 'tá', 'tô', 'né', 'tava', 'cê', 'aí', 'daí', 'bora', 'tipo', 'beleza', 'olha', 'ó', 'num', 'numa', 'dum', 'duma', 'tão', 'vixe', 'opa']);
const PESSOAS = new Set(['eu', 'me', 'meu', 'minha', 'meus', 'minhas', 'nós', 'nosso', 'nossa', 'nossos', 'nossas', 'gente', 'você', 'vocês', 'seu', 'sua', 'seus', 'suas', 'te', 'cê']);
const CRITERIOS = ['VARIACAO', 'CONCRETO', 'PALAVRAS_IA', 'TIPOGRAFIA', 'VOZ'];

// \b do JavaScript não entende acento ("é" não é letra para ele); esta fronteira entende.
const FRONTEIRA = '(?:(?<=[\\p{L}\\p{N}])(?![\\p{L}\\p{N}])|(?<![\\p{L}\\p{N}])(?=[\\p{L}\\p{N}]))';

/** "(?i)abc" (sintaxe Python do léxico) → RegExp do JavaScript, com \b que entende acento. */
export function regexDoLexico(fonte) {
  let flags = 'gu';
  const corpo = fonte.replace(/^\(\?([im]+)\)/, (_, f) => { flags += f; return ''; }).replaceAll('\\b', FRONTEIRA);
  return new RegExp(corpo, flags);
}

/** Ids das estruturas de IA encontradas (para teste e relatório). */
export const estruturasIa = (texto) => ESTRUTURAS.filter((e) => (texto.match(e.re) ?? []).length).map((e) => e.id);
const ESTRUTURAS = LEXICO.estruturas.map((e) => ({ ...e, re: regexDoLexico(e.regex) }));
const TERMOS = [...LEXICO.palavras, ...LEXICO.frases].map((t) => ({
  termo: t, re: new RegExp(`(?<![\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu'),
}));

function variacao(texto) {
  const tamanhos = frases(texto).map((f) => f.split(/\s+/).length);
  if (tamanhos.length < 4) return [null, 'curto demais para julgar'];
  const cv = desvioPadrao(tamanhos) / media(tamanhos);
  return [escala(cv, 0.70, 0.22), `variação ${cv.toFixed(2)} em ${tamanhos.length} frases (ideal: 0,55+)`];
}

function concreto(texto) {
  const n = palavras(texto).length;
  if (n < 25) return [null, 'curto demais para julgar'];
  const c = concretos(texto);
  const densidade = (c.total * 100) / n;
  return [escala(densidade, 6.0, 0.5), `${c.total} marcador(es) concreto(s), ${densidade.toFixed(1)} a cada 100 palavras (ideal: 4+)`];
}

function palavrasIa(texto) {
  const n = palavras(texto).length;
  if (!n) return [null, 'vazio'];
  let total = 0;
  const achados = [];
  for (const { termo, re } of TERMOS) {
    const k = (texto.match(re) ?? []).length;
    if (k) { total += k; achados.push(termo); }
  }
  const densidade = (total * 100) / n;
  return [escala(densidade, 0, 4), `${total} termo(s) de IA, ${densidade.toFixed(1)} a cada 100 palavras${achados.length ? ` (${achados.slice(0, 4).join(', ')})` : ''}`];
}

function tipografia(texto) {
  const invisiveis = [...texto].filter((c) => /\p{Cf}/u.test(c)).length;
  const travessao = (texto.match(/—/g) ?? []).length;
  const curvas = (texto.match(/[‘’“”]/g) ?? []).length;
  const reticencias = (texto.match(/…/g) ?? []).length;
  const espacoDuro = (texto.match(/[\u00a0\u202f\u2009]/g) ?? []).length;
  const total = invisiveis * 4 + travessao * 2 + curvas + reticencias + espacoDuro;
  const porMil = (total * 1000) / Math.max(texto.length, 1);
  return [escala(porMil, 0, 12), `${invisiveis} invisível, ${travessao} travessão, ${curvas} aspas curvas, ${reticencias} reticências, ${espacoDuro} espaço duro`];
}

function voz(texto) {
  const ps = minusculas(palavras(texto));
  if (ps.length < 25) return [null, 'curto demais para julgar'];
  const por100 = 100 / ps.length;
  const coloquial = ps.filter((p) => COLOQUIAL.has(p)).length * por100;
  const pessoa = ps.filter((p) => PESSOAS.has(p)).length * por100;
  const marcas = ESTRUTURAS.filter((e) => (texto.match(e.re) ?? []).length).map((e) => e.id);
  const tamanhosLista = [...texto.matchAll(/^\s*[-*•]\s+(.+)$/gm)].map((m) => m[1].split(/\s+/).length);
  const uniforme = tamanhosLista.length >= 3 && desvioPadrao(tamanhosLista) < 1.6;
  let nota = escala(coloquial, 3, 0) * 0.35 + escala(pessoa, 8, 1) * 0.35 + limitar(100 - marcas.length * 22) * 0.30;
  if (uniforme) { nota -= 12; marcas.push('lista-uniforme'); }
  return [limitar(nota), `${coloquial.toFixed(1)} coloquiais e ${pessoa.toFixed(1)} pronomes de pessoa a cada 100 palavras, ${marcas.length} estrutura(s) de IA${marcas.length ? ` [${marcas.slice(0, 4).join(', ')}]` : ''}`];
}

/** { nota, veredito: PASSA|REVISAR|SINALIZADO, criterios } */
export function notaHumano(texto) {
  const criterios = { VARIACAO: variacao(texto), CONCRETO: concreto(texto), PALAVRAS_IA: palavrasIa(texto), TIPOGRAFIA: tipografia(texto), VOZ: voz(texto) };
  // Critério sem texto suficiente fica de fora (no original valia 50 e reprovava toda legenda curta).
  const notas = CRITERIOS.map((c) => criterios[c][0]).filter((n) => n !== null);
  const nota = notaGeral(notas);
  const veredito = nota >= 70 && Math.min(...notas) >= 55 ? 'PASSA' : nota >= 50 ? 'REVISAR' : 'SINALIZADO';
  return { nota: Math.round(nota), minimo: Math.round(Math.min(...notas)), veredito, criterios };
}

/** Checagem G5. Travessão, caractere invisível e sobra de modelo reprovam sozinhos (regra da marca). */
export function checarHumano(texto, { notaMinima = 70, criterioMinimo = 55 } = {}) {
  const r = notaHumano(texto);
  const motivos = [];
  if (r.nota < notaMinima) motivos.push(`texto com cara de IA: nota ${r.nota} (mínimo ${notaMinima})`);
  for (const c of CRITERIOS) if (r.criterios[c][0] !== null && r.criterios[c][0] < criterioMinimo) motivos.push(`cara de IA em ${c}: ${r.criterios[c][1]}`);
  if (texto.includes('—')) motivos.push('travessão (—): trocar por vírgula, ponto ou dois-pontos');
  if (/\p{Cf}/u.test(texto)) motivos.push('caractere invisível no texto');
  if (texto.includes('{{')) motivos.push('sobra de modelo {{...}}');
  return { ok: motivos.length === 0, nota: r.nota, motivos, detalhe: r };
}
