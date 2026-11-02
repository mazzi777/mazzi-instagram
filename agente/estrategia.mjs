// Nota de cada post e ajuste da estratégia (SPEC 11). Código puro, sem Claude.
// - Nota = 70% conversa (visitas ao perfil, seguidores, compartilhamentos, toques no link da bio do dia)
//          + 30% alcance (alcance, salvamentos, tempo assistido no reel),
//   cada parte dividida pela mediana das últimas 8 peças do mesmo formato (o perfil contra ele mesmo).
// - Pesos por dimensão (formato, ramo, objetivo, horário, tipo de conteúdo): andam na direção de
//   (nota média do grupo ÷ nota média geral) dos posts das últimas 8 semanas, no máximo ±20% por semana,
//   só com 4+ amostras, e nunca abaixo de 0,1 (o que flopou perde espaço, mas não some).
// Com perfil pequeno o sinal é fraco: o resumo diz isso em vez de inventar tendência.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { publicados, lerColetas } from './metricas.mjs';
import { dataMais } from '../publicar/validar.mjs';

export const DIMENSOES = ['tipo', 'ramo', 'objetivo', 'horario', 'conteudo'];
const MIN_AMOSTRAS = 4;
const PISO = 0.1;
const VARIACAO = 0.2;
const JANELA_DIAS = 56;

const n = (v) => (typeof v === 'number' ? v : 0); // "<5" e null contam como 0
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0; };

function ramoDe(p) {
  if (p.info.ramo) return p.info.ramo;
  const t = `${p.info.tema ?? ''}`.toLowerCase();
  return t.includes('clín') || t.includes('clin') ? 'clinica' : t.includes('restaur') ? 'restaurante' : 'comum';
}

/** Linha por post com as métricas da coleta mais madura (D+7 > D+3 > D+1; story: a do dia). */
export function postsComMetricas(raiz) {
  const coletas = lerColetas(raiz);
  const conta = new Map(coletas.filter((c) => c.media_id === 'conta').map((c) => [c.dia, c.metricas]));
  const lista = publicados(raiz);
  const porDia = new Map();
  for (const p of lista) if (p.tipo !== 'stories') porDia.set(p.dia, (porDia.get(p.dia) ?? 0) + 1);
  return lista.map((p) => {
    const minhas = coletas.filter((c) => p.ids.includes(c.media_id) && (c.idade_d ?? 0) <= 7);
    if (!minhas.length) return null;
    const idade = Math.max(...minhas.map((c) => c.idade_d ?? 0));
    const soma = {};
    for (const c of minhas.filter((x) => (x.idade_d ?? 0) === idade)) for (const [k, v] of Object.entries(c.metricas)) soma[k] = n(soma[k]) + n(v);
    const taps = p.tipo === 'stories' ? 0 : n(conta.get(p.dia)?.profile_links_taps) / Math.max(1, porDia.get(p.dia) ?? 1);
    return {
      chave: `${p.semana}/${p.peca}`, dia: p.dia, idade, tipo: p.tipo ?? 'desconhecido', ramo: ramoDe(p), objetivo: p.info.objetivo ?? 'conversa',
      horario: p.info.horario ?? '07:40', conteudo: p.info.conteudo ?? 'desconhecido', gancho: p.info.gancho ?? '', m: soma,
      conversa: n(soma.profile_visits) + 2 * n(soma.follows) + 1.5 * n(soma.shares) + 3 * taps + n(soma.replies),
      alcance: n(soma.reach) + 3 * n(soma.saved) + (p.tipo === 'reel' ? n(soma.ig_reels_avg_watch_time) / 1000 * 10 : 0),
    };
  }).filter(Boolean);
}

/** Nota de cada post contra a mediana das últimas 8 do mesmo formato (1,0 = normal do perfil). */
export function notas(posts) {
  const ordem = [...posts].sort((a, b) => a.dia.localeCompare(b.dia));
  return ordem.map((p, i) => {
    const anteriores = ordem.slice(0, i + 1).filter((x) => x.tipo === p.tipo).slice(-8);
    const base = anteriores.length >= 3 ? anteriores : ordem.filter((x) => x.tipo === p.tipo);
    const mc = mediana(base.map((x) => x.conversa)) || 1;
    const ma = mediana(base.map((x) => x.alcance)) || 1;
    return { ...p, nota: +(0.7 * (p.conversa / mc) + 0.3 * (p.alcance / ma)).toFixed(3) };
  });
}

export function lerEstado(raiz) {
  const f = path.join(raiz, 'estrategia', 'estado.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { atualizado_em: null, pesos: {}, amostras: {} };
}

/** Um passo de ajuste (rodada semanal). Devolve { estado, mudancas[] }. */
export function ajustar(estado, comNota, hoje) {
  const novo = structuredClone(estado);
  const mudancas = [];
  const media = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const recentes = comNota.filter((p) => p.dia >= dataMais(hoje, -JANELA_DIAS));
  const geral = media(recentes.map((p) => p.nota)) || 1;
  for (const d of DIMENSOES) {
    novo.pesos[d] ??= {};
    novo.amostras[d] ??= {};
    const grupos = Object.groupBy(recentes, (p) => p[d]);
    for (const [valor, ps] of Object.entries(grupos)) {
      novo.amostras[d][valor] = ps.length;
      const antes = novo.pesos[d][valor] ?? 1;
      if (ps.length < MIN_AMOSTRAS) { novo.pesos[d][valor] = antes; continue; }
      const alvo = media(ps.map((p) => p.nota)) / geral;
      const depois = +Math.max(PISO, Math.min(antes * (1 + VARIACAO), Math.max(antes * (1 - VARIACAO), alvo))).toFixed(3);
      novo.pesos[d][valor] = depois;
      if (Math.abs(depois - antes) >= 0.02) mudancas.push({ dimensao: d, valor, antes, depois, amostras: ps.length });
    }
  }
  novo.atualizado_em = hoje;
  return { estado: novo, mudancas };
}

/** Texto para o planejador (entra no prompt da semana). */
export function resumoParaPlano(estado, comNota) {
  if (comNota.length < 8) {
    return `Ainda pouco dado (${comNota.length} post(s) medidos): não tire conclusão de métrica. Mantenha a variedade e explore formatos e horários.`;
  }
  const top = [...comNota].sort((a, b) => b.nota - a.nota).slice(0, 3);
  const pior = [...comNota].sort((a, b) => a.nota - b.nota).slice(0, 3);
  const linhaPeso = (d) => Object.entries(estado.pesos[d] ?? {}).map(([v, p]) => `${v} ${p} (${estado.amostras[d]?.[v] ?? 0})`).join(', ');
  return [
    `Melhores (nota; 1,0 = normal do perfil): ${top.map((p) => `${p.tipo} "${p.gancho}" ${p.nota}`).join(' | ')}`,
    `Piores: ${pior.map((p) => `${p.tipo} "${p.gancho}" ${p.nota}`).join(' | ')}`,
    ...DIMENSOES.map((d) => `Peso por ${d} (amostras): ${linhaPeso(d) || 'sem dado'}`),
    'Use os pesos para dar mais espaço ao que funcionou, sem zerar o resto (20% continua exploração).',
  ].join('\n');
}

/** Rodada completa: notas (das publicações reais em `raiz`), ajuste, grava <saida>/estrategia/estado.json. */
export function atualizarEstrategia(raiz, hoje, saida = raiz) {
  const comNota = notas(postsComMetricas(raiz));
  const atual = lerEstado(saida);
  // Uma vez por semana: rodar o semanal de novo (à mão) não pode empurrar os pesos duas vezes.
  const { estado, mudancas } = atual.atualizado_em && dataMais(atual.atualizado_em, 6) > hoje ? { estado: atual, mudancas: [] } : ajustar(atual, comNota, hoje);
  mkdirSync(path.join(saida, 'estrategia'), { recursive: true });
  writeFileSync(path.join(saida, 'estrategia', 'estado.json'), `${JSON.stringify(estado, null, 2)}\n`);
  return { estado, mudancas, comNota, resumo: resumoParaPlano(estado, comNota) };
}
