// G8: não repetir gancho nem ângulo das últimas 6 semanas.
// Similaridade de Dice sobre trigramas de letras do texto normalizado (sem acento, sem pontuação):
// pega "O caixa não fechou de novo?" x "Caixa não fechou de novo" sem confundir temas diferentes.
import { readFileSync, existsSync } from 'node:fs';
import { dobrar } from '../lib/texto.mjs';

export const LIMITE_SIMILARIDADE = 0.6;
const JANELA_DIAS = 42;

function normalizar(texto) {
  return dobrar(texto).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function trigramas(texto) {
  const t = ` ${normalizar(texto)} `;
  const mapa = new Map();
  for (let i = 0; i < t.length - 2; i++) {
    const g = t.slice(i, i + 3);
    mapa.set(g, (mapa.get(g) ?? 0) + 1);
  }
  return mapa;
}

export function similaridade(a, b) {
  const ta = trigramas(a);
  const tb = trigramas(b);
  let comum = 0;
  let total = 0;
  for (const [g, n] of ta) { total += n; comum += Math.min(n, tb.get(g) ?? 0); }
  for (const n of tb.values()) total += n;
  return total ? (2 * comum) / total : 0;
}

/**
 * Ganchos já usados, do guia/log.md (linhas "- DD/MM/AAAA · ... · "gancho" ...") e do registro do agente.
 * Devolve [{ data: 'AAAA-MM-DD', gancho }].
 */
export function ganchosDoLog(textoLog) {
  const usados = [];
  for (const linha of textoLog.split('\n')) {
    const m = linha.match(/^- (\d{2})\/(\d{2})\/(\d{4}) ·/);
    if (!m) continue;
    const data = `${m[3]}-${m[2]}-${m[1]}`;
    for (const q of linha.matchAll(/"([^"]{6,})"/g)) usados.push({ data, gancho: q[1] });
  }
  return usados;
}

export function lerGanchosUsados(raiz) {
  const arquivo = `${raiz}/guia/log.md`;
  return existsSync(arquivo) ? ganchosDoLog(readFileSync(arquivo, 'utf8')) : [];
}

/** G8: compara com os ganchos das últimas 6 semanas (a contar de `hoje`). */
export function checarRepeticao(gancho, usados, { hoje, limite = LIMITE_SIMILARIDADE } = {}) {
  const desde = hoje ? new Date(Date.parse(`${hoje}T12:00:00Z`) - JANELA_DIAS * 86400000).toISOString().slice(0, 10) : '0000-00-00';
  const parecidos = usados
    .filter((u) => u.data >= desde)
    .map((u) => ({ ...u, sim: similaridade(gancho, u.gancho) }))
    .filter((u) => u.sim >= limite)
    .sort((a, b) => b.sim - a.sim);
  return {
    ok: parecidos.length === 0,
    motivos: parecidos.slice(0, 2).map((u) => `repete o gancho de ${u.data} ("${u.gancho}", ${Math.round(u.sim * 100)}% parecido)`),
  };
}
