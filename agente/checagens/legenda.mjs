// G4: legenda antes do "...mais". Porte para pt-BR do caption.py (skill ig-caption, licença MIT).
// O feed mostra ~125 caracteres e esconde o resto atrás de um toque: quase toda legenda que falha, falha ali.
//
// Mais estreito que o original, pelas regras da marca (guia/marca.md): no máximo 3 hashtags (o Instagram
// aceita 5), uma chamada só, sem link (legenda não é clicável) e no máximo 1 emoji.
import { palavras, concretos, HASHTAG_RE, EMOJI_RE } from '../lib/texto.mjs';

export const LIMITE = 2200;
export const CORTE = 125;
const MAX_HASHTAGS = 3;
const MAX_EMOJI = 1;

const LINK_RE = /https?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|com\.br|br|io|net|org|app)(?:\/\S*)?/giu;

// Grupos de chamada. "chama no WhatsApp (link na bio)" é UMA chamada, por isso os dois ficam no mesmo grupo.
const CHAMADAS = [
  [/chama(?: a gente)? no whats(?:app)?|link na bio|me chama|chama a gente/iu, 'WhatsApp / link na bio'],
  [/\bsalv[ae] (?:esse|este|o) post|\bsalv[ae] (?:pra|para) depois|\bguarda esse/iu, 'salvar'],
  [/\bcompartilh[ae]|\bmanda (?:pra|para|esse post)/iu, 'compartilhar'],
  [/\bcomenta\b|\bcomente\b|\bme conta\b|\bconta aqui\b|\bresponde aqui\b|\bme responde\b/iu, 'comentar'],
  [/\bsegue (?:a gente|o perfil|a mazzi)|\bsiga (?:a gente|o perfil)/iu, 'seguir'],
];

function janelaVisivel(texto, corte) {
  const plano = texto.replace(/\n+/g, ' ').trim();
  return plano.length <= corte ? plano : plano.slice(0, corte);
}

/** Analisa a legenda: { veredito: PRONTA|REVISAR|CORRIGIR, visivel, checagens: [{checagem, status, detalhe}] }. */
export function analisarLegenda(bruto, { corte = CORTE } = {}) {
  const texto = bruto.trim();
  const chars = [...texto].length;
  const primeira = (texto.split('\n')[0] ?? '').trim();
  const tags = [...texto.matchAll(HASHTAG_RE)].map((m) => m[1]);
  const links = texto.match(LINK_RE) ?? [];
  const emojis = texto.match(EMOJI_RE) ?? [];
  const visivel = janelaVisivel(texto, corte);
  const chamadas = CHAMADAS.filter(([re]) => re.test(texto)).map(([, nome]) => nome);
  const checagens = [];
  const add = (checagem, status, detalhe) => checagens.push({ checagem, status, detalhe });

  add('TAMANHO', chars > LIMITE ? 'FALHA' : 'OK', `${chars} / ${LIMITE} caracteres`);

  if (!primeira) add('PRIMEIRA LINHA', 'FALHA', 'a legenda abre com linha em branco');
  else if (/^[#@]/.test(primeira)) add('PRIMEIRA LINHA', 'FALHA', 'abre com hashtag ou menção, no único lugar que vale uma frase');
  else if ([...primeira].length > corte) add('PRIMEIRA LINHA', 'FALHA', `${[...primeira].length} caracteres: o gancho é cortado no "...mais" (máximo ${corte})`);
  else add('PRIMEIRA LINHA', 'OK', `${[...primeira].length} caracteres, aparece inteira`);

  const c = concretos(visivel);
  add('GANCHO CONCRETO', c.total ? 'OK' : 'AVISO', c.total ? `${c.total} marcador(es) concreto(s) antes do "...mais"` : 'nada concreto antes do "...mais"');

  if (tags.length > MAX_HASHTAGS) add('HASHTAGS', 'FALHA', `${tags.length} hashtags (máximo ${MAX_HASHTAGS} pela marca)`);
  else add('HASHTAGS', 'OK', `${tags.length} hashtag(s)${tags.length ? `: ${tags.join(' ')}` : ''}`);

  if (tags.some((t) => visivel.includes(t))) add('LUGAR DAS HASHTAGS', 'FALHA', 'hashtag antes do "...mais", gastando o espaço do gancho');
  else if (tags.length && !/(?:^|\n)\s*(?:#[\p{L}\p{N}_]+\s*)+$/u.test(texto)) add('LUGAR DAS HASHTAGS', 'FALHA', 'hashtags fora do fim da legenda');
  else add('LUGAR DAS HASHTAGS', 'OK', tags.length ? 'hashtags no fim' : 'sem hashtags');

  add('LINKS', links.length ? 'FALHA' : 'OK', links.length ? `${links.length} link(s): legenda não é clicável, link vai na bio` : 'sem link no texto');

  if (chamadas.length === 1) add('UMA CHAMADA', 'OK', `uma chamada: ${chamadas[0]}`);
  else if (!chamadas.length) add('UMA CHAMADA', 'FALHA', 'nenhuma chamada: decida para que serve o post');
  else add('UMA CHAMADA', 'FALHA', `${chamadas.length} chamadas (${chamadas.join(', ')}): duas chamadas valem por nenhuma`);

  add('EMOJI', emojis.length > MAX_EMOJI ? 'FALHA' : 'OK', `${emojis.length} emoji(s) (máximo ${MAX_EMOJI} pela marca)`);

  const falhas = checagens.filter((x) => x.status === 'FALHA').length;
  const avisos = checagens.filter((x) => x.status === 'AVISO').length;
  return {
    veredito: falhas ? 'CORRIGIR' : avisos ? 'REVISAR' : 'PRONTA',
    visivel, caracteres: chars, palavras: palavras(texto).length, hashtags: tags, chamadas, checagens,
  };
}

/** Checagem G4: passa sem nenhuma FALHA (aviso não reprova). */
export function checarLegenda(texto, opcoes) {
  const r = analisarLegenda(texto, opcoes);
  const motivos = r.checagens.filter((x) => x.status === 'FALHA').map((x) => `legenda, ${x.checagem.toLowerCase()}: ${x.detalhe}`);
  return { ok: motivos.length === 0, motivos, detalhe: r };
}
