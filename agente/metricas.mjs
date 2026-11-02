// Coleta das métricas (SPEC 11). Só a API da Meta; nenhum uso do Claude.
// - Cada post publicado (publicado.json de todas as semanas) é medido em D+1, D+3, D+7 e D+28.
// - Story some em 24 h (as métricas também): a rodada da noite mede os stories do dia.
// - A conta é medida por dia: alcance, visualizações, toques nos links do perfil (o WhatsApp da bio) e seguidores.
// Grava uma linha por coleta em metricas/AAAA-MM.jsonl. Valor < 5 em story volta erro 10 na Meta: vira "<5".
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { dataMais } from '../publicar/validar.mjs';

const GRAPH = 'https://graph.facebook.com/v25.0';
export const IDADES = [1, 3, 7, 28];
const METRICAS = {
  FEED: ['reach', 'views', 'saved', 'shares', 'likes', 'comments', 'profile_visits', 'follows', 'total_interactions'],
  REELS: ['reach', 'views', 'saved', 'shares', 'likes', 'comments', 'ig_reels_avg_watch_time', 'reels_skip_rate', 'total_interactions'],
  STORY: ['reach', 'views', 'replies', 'navigation', 'shares', 'profile_visits', 'follows', 'total_interactions'],
};
const CONTA = ['reach', 'views', 'profile_links_taps', 'follows_and_unfollows', 'accounts_engaged', 'total_interactions'];

export function criarMeta({ token, igUserId, fetch = globalThis.fetch }) {
  async function get(caminho, params) {
    const url = new URL(`${GRAPH}/${caminho}`);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok || corpo.error) {
      const e = new Error(`Meta ${r.status}: ${corpo.error?.message ?? 'sem mensagem'}`);
      e.codigo = corpo.error?.code;
      // Chave inválida (190) ou sem permissão (200, ou 10 que não é o "poucos espectadores" do story): para a rodada.
      e.chave = e.codigo === 190 || e.codigo === 200 || (e.codigo === 10 && !/viewer|espectador/i.test(e.message));
      throw e;
    }
    return corpo;
  }
  const valor = (m) => m.total_value?.value ?? m.values?.[0]?.value ?? null;
  return {
    midia: (id) => get(id, { fields: 'id,media_type,media_product_type,timestamp,permalink' }),
    /** Permissões concedidas à chave (para a conferência semanal). */
    async permissoes() {
      const { data = [] } = await get('me/permissions');
      return data.filter((p) => p.status === 'granted').map((p) => p.permission);
    },
    /** Métricas de um post; se o pedido junto falhar (métrica não suportada), pede uma a uma e pula a que falhar. */
    async insights(id, tipo) {
      const lista = METRICAS[tipo] ?? METRICAS.FEED;
      const out = {};
      try {
        const { data = [] } = await get(`${id}/insights`, { metric: lista.join(',') });
        for (const m of data) out[m.name] = valor(m);
        return out;
      } catch (e) {
        if (e.chave) throw e; // token: não adianta insistir
      }
      for (const nome of lista) {
        try {
          const { data = [] } = await get(`${id}/insights`, { metric: nome });
          out[nome] = data[0] ? valor(data[0]) : null;
        } catch (e) {
          if (e.chave) throw e;
          out[nome] = e.codigo === 10 ? '<5' : null;
        }
      }
      return out;
    },
    /** Totais da conta num dia (fuso de São Paulo), mais os toques por botão (WhatsApp, site...). */
    async conta(dia) {
      const since = Math.floor(Date.parse(`${dia}T03:00:00Z`) / 1000);
      const until = since + 86400;
      const out = {};
      for (const nome of CONTA) {
        try {
          const params = { metric: nome, period: 'day', metric_type: 'total_value', since, until };
          if (nome === 'profile_links_taps') params.breakdown = 'contact_button_type';
          const { data = [] } = await get(`${igUserId}/insights`, params);
          out[nome] = data[0] ? valor(data[0]) : null;
          const quebras = data[0]?.total_value?.breakdowns?.[0]?.results;
          if (quebras) out[`${nome}_por_botao`] = Object.fromEntries(quebras.map((q) => [q.dimension_values.join('/'), q.value]));
        } catch (e) {
          if (e.chave) throw e;
          out[nome] = null;
        }
      }
      return out;
    },
  };
}

/** Tudo que foi publicado: [{ semana, peca, tipo, dia, ids[], publicadoEm }] a partir de agenda + publicado.json. */
export function publicados(raiz) {
  const base = path.join(raiz, 'semanas');
  if (!existsSync(base)) return [];
  const out = [];
  for (const semana of readdirSync(base).sort()) {
    const fp = path.join(base, semana, 'publicado.json');
    if (!existsSync(fp)) continue;
    const pub = JSON.parse(readFileSync(fp, 'utf8'));
    const fa = path.join(base, semana, 'agenda.json');
    const agenda = existsSync(fa) ? JSON.parse(readFileSync(fa, 'utf8')) : { pecas: [] };
    for (const [peca, r] of Object.entries(pub)) {
      if (!r.completo) continue;
      const info = agenda.pecas.find((p) => p.id === peca) ?? {};
      const ids = (r.ids ?? []).filter((x) => /^\d+$/.test(x)); // "contêiner X" (sem id do post) não dá para medir
      if (ids.length) out.push({ semana, peca, tipo: info.tipo ?? null, dia: (r.em ?? '').slice(0, 10) || info.dia, ids, info });
    }
  }
  return out;
}

const mes = (iso) => iso.slice(0, 7);
function lerColetas(raiz) {
  const pasta = path.join(raiz, 'metricas');
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta).filter((f) => f.endsWith('.jsonl')).flatMap((f) => readFileSync(path.join(pasta, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
}
function gravar(raiz, linha) {
  const pasta = path.join(raiz, 'metricas');
  mkdirSync(pasta, { recursive: true });
  appendFileSync(path.join(pasta, `${mes(linha.coletado_em)}.jsonl`), `${JSON.stringify(linha)}\n`);
}

/**
 * Uma rodada de coleta. modo "dia": posts que completaram D+1/D+3/D+7/D+28 e a conta de ontem;
 * modo "stories": stories publicados hoje (antes de sumirem). Devolve { coletados, erros[] }.
 */
export async function coletar({ raiz, hoje, meta, modo = 'dia', log = () => {} }) {
  const ja = lerColetas(raiz);
  const feito = new Set(ja.map((c) => `${c.media_id}|${c.idade_d ?? 'conta'}|${c.dia ?? ''}`));
  const erros = [];
  let coletados = 0;
  const agora = `${hoje}T12:00:00Z`;
  for (const p of publicados(raiz)) {
    const ehStory = p.tipo === 'stories';
    if ((modo === 'stories') !== ehStory) continue;
    const idades = ehStory ? (p.dia === hoje || dataMais(p.dia, 1) === hoje ? [0] : []) : IDADES.filter((d) => dataMais(p.dia, d) <= hoje && dataMais(p.dia, d) >= dataMais(hoje, -2)).slice(-1); // atrasou: só a idade mais madura
    for (const idade of idades) {
      for (const id of p.ids) {
        if (feito.has(`${id}|${idade}|`)) continue;
        try {
          const tipo = ehStory ? 'STORY' : p.tipo === 'reel' ? 'REELS' : 'FEED';
          const valores = await meta.insights(id, tipo);
          gravar(raiz, { coletado_em: agora, media_id: id, semana: p.semana, peca: p.peca, tipo: p.tipo, idade_d: idade, metricas: valores });
          coletados++;
        } catch (e) {
          if (e.chave || e.codigo === 190) throw e;
          erros.push(`${p.semana}/${p.peca} (${id}): ${e.message}`);
        }
      }
    }
  }
  if (modo === 'dia') {
    const ontem = dataMais(hoje, -1);
    if (!feito.has(`conta|conta|${ontem}`)) {
      gravar(raiz, { coletado_em: agora, media_id: 'conta', dia: ontem, metricas: await meta.conta(ontem) });
      coletados++;
    }
  }
  log(`métricas (${modo}): ${coletados} coleta(s)${erros.length ? `, ${erros.length} erro(s)` : ''}`);
  return { coletados, erros };
}

export { lerColetas };
