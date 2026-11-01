// Publica no Instagram @mazzisystems as peças do dia, a partir de semanas/*/agenda.json,
// pela API oficial da Meta (Instagram Graph API). Roda no GitHub Actions (publicar.yml), todo dia.
//
// Uso: node publicar/publicar.mjs [--peca AAAA-MM-DD/ID] [--simular] [--conferir]
// Ambiente: META_TOKEN, IG_USER_ID, GITHUB_REPOSITORY, MIDIA_REF (commit das mídias),
//           PUBLICAR_HOJE (opcional, AAAA-MM-DD)
//
// Nunca publicar duas vezes: antes de cada media_publish o contêiner fica gravado como "pendente"
// em publicado.json; numa rodada seguinte, o pendente é conferido na Meta (PUBLISHED = já saiu)
// em vez de criar outro. Post de feed sem registro também é procurado no feed pela legenda.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerAgenda, validarPeca, dataMais } from './validar.mjs';

const GRAPH = 'https://graph.facebook.com/v25.0';
const ATRASO_MAXIMO_DIAS = 2;
// A partir desta semana, cada semana precisa ter agenda (antes era o Windsor).
const PRIMEIRA_SEMANA_API = '2026-11-09';

export function hojeEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

/** "HH:MM" agora em São Paulo (peça do agente sai a partir do próprio horário). */
export function horaEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(agora);
}

// Folga no limite de publicação da Meta (a doc fala em 50 e em 100 por 24 h: o número é lido na hora).
const FOLGA_LIMITE = 5;

function segundaDa(iso) {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return dataMais(iso, -((dia + 6) % 7));
}

function lerJson(arquivo, padrao) {
  return existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : padrao;
}

/** Peças a publicar agora. Uma agenda quebrada vira erro só daquela semana; as outras seguem. */
export function escolherPecas(raiz, hoje, alvo, hora = '23:59') {
  const base = path.join(raiz, 'semanas');
  const escolhidas = [];
  const erros = [];
  if (!existsSync(base)) return { escolhidas, erros };
  for (const nome of readdirSync(base).sort()) {
    const dir = path.join(base, nome);
    if (!existsSync(path.join(dir, 'agenda.json'))) continue;
    let agenda;
    let publicado;
    try {
      agenda = lerAgenda(dir);
      publicado = lerJson(path.join(dir, 'publicado.json'), {});
      if (agenda.semana !== nome) throw new Error(`"semana" ${agenda.semana} diferente da pasta ${nome}`);
    } catch (e) {
      erros.push({ peca: `semanas/${nome}`, mensagem: `agenda inválida, nada desta semana sai até corrigir: ${e.message}` });
      continue;
    }
    const vistos = new Set();
    for (const peca of agenda.pecas) {
      const chave = `${agenda.semana}/${peca.id}`;
      if (vistos.has(peca.id)) {
        erros.push({ peca: chave, mensagem: 'id repetido na agenda; só a primeira ocorrência é considerada' });
        continue;
      }
      vistos.add(peca.id);
      const registro = publicado[peca.id];
      if (alvo) {
        if (chave === alvo && !registro?.completo) escolhidas.push({ semana: agenda.semana, dir, peca, vencida: false });
        continue;
      }
      if (registro?.completo || registro?.vencida || peca.dia > hoje) continue;
      if (peca.dia === hoje && peca.horario && peca.horario > hora) continue;
      escolhidas.push({ semana: agenda.semana, dir, peca, vencida: peca.dia < dataMais(hoje, -ATRASO_MAXIMO_DIAS) });
    }
  }
  return { escolhidas, erros };
}

export function criarCliente({ token, igUserId, fetch, esperar }) {
  async function graph(metodo, caminho, params) {
    const url = new URL(`${GRAPH}/${caminho}`);
    const opcoes = { method: metodo, headers: { Authorization: `Bearer ${token}` } };
    if (metodo === 'GET') for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
    else opcoes.body = new URLSearchParams(Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]));
    const resposta = await fetch(url.toString(), opcoes);
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok || corpo.error) {
      const e = corpo.error ?? {};
      throw new Error(`Meta ${resposta.status}: ${e.message ?? 'sem mensagem'} (code ${e.code ?? '?'}${e.error_subcode ? `/${e.error_subcode}` : ''}, trace ${e.fbtrace_id ?? '?'})`);
    }
    return corpo;
  }

  const status = async (id) => (await graph('GET', id, { fields: 'status_code' })).status_code;

  async function esperarPronto(id, { limiteMs, intervaloMs }) {
    for (let gasto = 0; ; gasto += intervaloMs) {
      const s = await status(id);
      if (s === 'FINISHED') return;
      if (s === 'ERROR' || s === 'EXPIRED') throw new Error(`contêiner ${id} terminou com ${s}`);
      if (gasto >= limiteMs) throw new Error(`contêiner ${id} não ficou pronto em ${limiteMs / 1000}s (último status: ${s})`);
      await esperar(intervaloMs);
    }
  }

  return {
    graph,
    status,
    esperarPronto,
    conta: () => graph('GET', igUserId, { fields: 'id,username' }),
    container: async (params) => (await graph('POST', `${igUserId}/media`, params)).id,
    publicarContainer: async (id) => (await graph('POST', `${igUserId}/media_publish`, { creation_id: id })).id,
    /** { usado, total } do limite de publicação nas últimas 24 h. */
    limite: async () => {
      const { data = [] } = await graph('GET', `${igUserId}/content_publishing_limit`, { fields: 'quota_usage,config' });
      return { usado: data[0]?.quota_usage ?? 0, total: data[0]?.config?.quota_total ?? 50 };
    },
    /** Post do feed com esta legenda nos últimos 7 dias (id) ou null. */
    acharNoFeed: async (legenda, hoje) => {
      const { data = [] } = await graph('GET', `${igUserId}/media`, { fields: 'id,caption,timestamp', limit: 25 });
      const desde = dataMais(hoje, -7);
      const achado = data.find((m) => (m.caption ?? '').trim() === legenda.trim() && (m.timestamp ?? '').slice(0, 10) >= desde);
      return achado?.id ?? null;
    },
  };
}

/** Confere a chave sem publicar: devolve { id, username } da conta. */
export async function conferirConta({ env, fetch = globalThis.fetch }) {
  if (!env.META_TOKEN || !env.IG_USER_ID) throw new Error('faltam os segredos META_TOKEN e/ou IG_USER_ID');
  return criarCliente({ token: env.META_TOKEN, igUserId: env.IG_USER_ID, fetch, esperar: async () => {} }).conta();
}

const IMAGEM = { limiteMs: 60_000, intervaloMs: 3_000 };
const VIDEO = { limiteMs: 300_000, intervaloMs: 10_000 };

function inserirNoLog(raiz, linha) {
  const arquivo = path.join(raiz, 'guia', 'log.md');
  if (!existsSync(arquivo)) return;
  const linhas = readFileSync(arquivo, 'utf8').split('\n');
  const i = linhas.findIndex((l) => l.startsWith('- '));
  linhas.splice(i === -1 ? linhas.length : i, 0, linha);
  writeFileSync(arquivo, linhas.join('\n'));
}

function dataBR(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/**
 * Publica um contêiner sem nunca publicar duas vezes. `pendente` é o contêiner gravado numa rodada
 * anterior que não terminou. `gravarPendente(id)` precisa salvar em disco ANTES do media_publish.
 * Devolve o id do post (ou "contêiner X" quando a Meta confirma que saiu mas não dá o id).
 */
async function publicarUmaVez(meta, { pendente, criar, espera, gravarPendente }) {
  if (pendente) {
    const s = await meta.status(pendente);
    if (s === 'PUBLISHED') return `contêiner ${pendente}`;
    if (s === 'FINISHED') return meta.publicarContainer(pendente);
    // EXPIRED, ERROR ou ainda processando: começa de novo com um contêiner novo.
  }
  const id = await criar();
  await meta.esperarPronto(id, espera);
  gravarPendente(id);
  return meta.publicarContainer(id);
}

export async function publicar({
  raiz, hoje, alvo = null, simular = false, env = {}, fetch = globalThis.fetch,
  esperar = (ms) => new Promise((r) => setTimeout(r, ms)), sondar, log = console.log, agora = () => new Date(), hora,
}) {
  // Kill switch: pausado, não publica nada (nem reserva, nem a semana da rotina).
  // (O modo ensaio do agente não passa por aqui: no ensaio o agente grava em ensaio/, que o publicador não lê.)
  if (env.AGENTE_PAUSADO === 'true') {
    log('Agente pausado (AGENTE_PAUSADO=true): nada é publicado.');
    return { publicadas: [], erros: [], pausado: true };
  }
  const token = env.META_TOKEN;
  const igUserId = env.IG_USER_ID;
  const repo = env.GITHUB_REPOSITORY || 'mazzi777/mazzi-instagram';
  const ref = env.MIDIA_REF || 'main';
  const ocultar = (texto) => (token ? String(texto).split(token).join('***') : String(texto));

  const { escolhidas, erros } = escolherPecas(raiz, hoje, alvo, hora ?? horaEmSaoPaulo(agora()));
  const resultado = { publicadas: [], erros: [...erros] };

  if (alvo && !escolhidas.length && !erros.length) {
    resultado.erros.push({ peca: alvo, mensagem: 'peça não encontrada ou já publicada (confira o nome: AAAA-MM-DD/ID)' });
  }
  const semanaAtual = segundaDa(hoje);
  if (!alvo && semanaAtual >= PRIMEIRA_SEMANA_API && !existsSync(path.join(raiz, 'semanas', semanaAtual, 'agenda.json'))) {
    resultado.erros.push({ peca: `semanas/${semanaAtual}`, mensagem: 'a semana atual não tem agenda.json: a rotina de segunda não produziu (ou não subiu) a semana' });
  }

  const meta = criarCliente({ token, igUserId, fetch, esperar });
  if (!simular) {
    // Toda rodada confere a chave, mesmo sem nada para publicar: chave quebrada vira aviso no mesmo dia.
    try {
      if (!token || !igUserId) throw new Error('faltam os segredos META_TOKEN e/ou IG_USER_ID no repositório');
      await meta.conta();
    } catch (e) {
      resultado.erros.push({ peca: 'chave da Meta', mensagem: ocultar(e.message) });
      return resultado;
    }
  }

  for (const { semana, dir, peca, vencida } of escolhidas) {
    const onde = `${semana}/${peca.id}`;
    const arquivoPublicado = path.join(dir, 'publicado.json');
    const publicado = lerJson(arquivoPublicado, {});
    const salvar = () => writeFileSync(arquivoPublicado, `${JSON.stringify(publicado, null, 2)}\n`);
    if (publicado[peca.id]?.completo) continue;

    if (vencida) {
      if (!simular) {
        publicado[peca.id] = { ...publicado[peca.id], vencida: hoje };
        salvar();
      }
      resultado.erros.push({ peca: onde, mensagem: `venceu sem publicar (dia ${peca.dia}, hoje ${hoje}). Não sai sozinha; para publicar mesmo assim, rode o workflow com peca=${onde}.` });
      continue;
    }

    try {
      const agente = lerAgenda(dir).produtor === 'agente';
      const problemas = validarPeca(dir, semana, peca, { ...(sondar ? { sondar } : {}), agente });
      if (problemas.length) throw new Error(`não passou na validação:\n${problemas.map((e) => `  - ${e}`).join('\n')}`);

      const urls = peca.arquivos.map((a) => `https://raw.githubusercontent.com/${repo}/${ref}/semanas/${semana}/${a}`);
      for (const url of urls) {
        const r = await fetch(url, { method: 'HEAD' });
        if (r.status !== 200) throw new Error(`mídia não está pública (${r.status}): ${url}`);
      }

      if (simular) {
        log(`[simular] ${onde}: ${peca.tipo} com ${urls.length} arquivo(s) pronto(s) para publicar`);
        resultado.publicadas.push({ peca: onde, simulado: true });
        continue;
      }

      const { usado, total } = await meta.limite();
      if (usado >= total - FOLGA_LIMITE) throw new Error(`limite de publicação da Meta quase no fim (${usado} de ${total} nas últimas 24 h): fica para a próxima rodada`);

      const registro = { ids: [], ...publicado[peca.id], via: 'api' };
      // Etiqueta de IA (política da Meta, SPEC 8.4): só vai quando a peça declara ia: true.
      const ia = peca.ia === true ? { is_ai_generated: true } : {};
      const gravarPendente = (id) => {
        registro.pendente = id;
        publicado[peca.id] = registro;
        salvar();
      };

      if (peca.tipo === 'stories') {
        // Um quadro por vez; registro.ids guarda os quadros que já saíram, e a próxima rodada continua dali.
        for (let i = registro.ids.length; i < urls.length; i++) {
          if (i > 0) await esperar(10_000);
          const idPost = await publicarUmaVez(meta, {
            pendente: registro.pendente,
            criar: () => meta.container({ media_type: 'STORIES', image_url: urls[i] }),
            espera: IMAGEM,
            gravarPendente,
          });
          registro.ids.push(idPost);
          delete registro.pendente;
          publicado[peca.id] = registro;
          salvar();
        }
      } else {
        const noFeed = registro.pendente ? null : await meta.acharNoFeed(peca.legenda, hoje);
        if (noFeed) {
          log(`${onde}: já estava no feed (${noFeed}); só registrando`);
          registro.ids = [noFeed];
        } else {
          const alt = peca.alt_text ? { alt_text: peca.alt_text } : {};
          const criar = peca.tipo === 'carrossel'
            ? async () => {
              const filhos = [];
              for (const [i, url] of urls.entries()) {
                const id = await meta.container({ image_url: url, is_carousel_item: true, ...(i === 0 ? alt : {}) });
                await meta.esperarPronto(id, IMAGEM);
                filhos.push(id);
              }
              return meta.container({ media_type: 'CAROUSEL', children: filhos.join(','), caption: peca.legenda, ...ia });
            }
            : peca.tipo === 'imagem'
              ? () => meta.container({ image_url: urls[0], caption: peca.legenda, ...alt, ...ia })
              : () => meta.container({
                media_type: 'REELS', video_url: urls[0], caption: peca.legenda, share_to_feed: true, thumb_offset: peca.capa_ms ?? 0, ...ia,
              });
          registro.ids = [await publicarUmaVez(meta, {
            pendente: registro.pendente, criar, espera: peca.tipo === 'reel' ? VIDEO : IMAGEM, gravarPendente,
          })];
        }
      }

      publicado[peca.id] = { em: agora().toISOString(), via: 'api', ids: registro.ids, completo: true };
      salvar();
      const extra = [peca.tema, peca.gancho && `"${peca.gancho}"`].filter(Boolean).join(' · ');
      inserirNoLog(raiz, `- ${dataBR(hoje)} · PUBLICADO · ${peca.tipo} (${peca.id}, ${urls.length} arquivo(s)) · ${extra || 'sem tema'} · ids ${registro.ids.join(', ')} · via API da Meta`);
      resultado.publicadas.push({ peca: onde, ids: registro.ids });
      log(`${onde}: publicado (${registro.ids.join(', ')})`);
    } catch (e) {
      resultado.erros.push({ peca: onde, mensagem: ocultar(e.message) });
      log(`${onde}: FALHOU`);
    }
  }
  return resultado;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const iPeca = args.indexOf('--peca');
  const alvo = iPeca >= 0 ? args[iPeca + 1] : null;
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sair = (erros) => {
    const texto = erros.map((e) => `### ${e.peca}\n\n${e.mensagem}`).join('\n\n');
    writeFileSync(path.join(raiz, 'publicar', 'erros.md'), `${texto}\n`);
    console.error(texto);
    process.exit(1);
  };
  if (args.includes('--conferir')) {
    try {
      const conta = await conferirConta({ env: process.env });
      console.log(`Chave OK: publica como @${conta.username}.`);
      process.exit(0);
    } catch (e) {
      sair([{ peca: 'chave da Meta', mensagem: String(e.message).split(process.env.META_TOKEN || '\0').join('***') }]);
    }
  }
  const hoje = process.env.PUBLICAR_HOJE || hojeEmSaoPaulo();
  const r = await publicar({ raiz, hoje, alvo, simular: args.includes('--simular'), env: process.env });
  if (!r.publicadas.length && !r.erros.length) console.log(`Nada para publicar hoje (${hoje}).`);
  if (r.erros.length) sair(r.erros);
}
