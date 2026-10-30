// Publica no Instagram @mazzisystems as peças do dia, a partir de semanas/*/agenda.json,
// pela API oficial da Meta (Instagram Graph API). Roda no GitHub Actions (publicar.yml).
//
// Uso: node publicar/publicar.mjs [--peca AAAA-MM-DD/ID] [--simular]
// Ambiente: META_TOKEN, IG_USER_ID, GITHUB_REPOSITORY (opcional), PUBLICAR_HOJE (opcional, AAAA-MM-DD)
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerAgenda, validarPeca, dataMais } from './validar.mjs';

export const GRAPH = 'https://graph.facebook.com/v25.0';
export const ATRASO_MAXIMO_DIAS = 2;
const FORMATO = { carrossel: 'carrossel', reel: 'reel', stories: 'stories' };

export function hojeEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

function lerJson(arquivo, padrao) {
  return existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : padrao;
}

function arquivosDa(peca) {
  return peca.tipo === 'reel' ? [peca.arquivo] : peca.arquivos;
}

/** Peças a publicar agora: [{ semana, dir, peca, vencida }]. */
export function escolherPecas(raiz, hoje, alvo) {
  const base = path.join(raiz, 'semanas');
  if (!existsSync(base)) return [];
  const escolhidas = [];
  for (const nome of readdirSync(base).sort()) {
    const dir = path.join(base, nome);
    if (!existsSync(path.join(dir, 'agenda.json'))) continue;
    const agenda = lerAgenda(dir);
    const publicado = lerJson(path.join(dir, 'publicado.json'), {});
    for (const peca of agenda.pecas) {
      const chave = `${agenda.semana}/${peca.id}`;
      if (alvo) {
        if (chave === alvo && !publicado[peca.id]?.completo) escolhidas.push({ semana: agenda.semana, dir, peca, vencida: false });
        continue;
      }
      const registro = publicado[peca.id];
      if (registro?.completo || registro?.vencida || peca.dia > hoje) continue;
      const vencida = peca.dia < dataMais(hoje, -ATRASO_MAXIMO_DIAS);
      escolhidas.push({ semana: agenda.semana, dir, peca, vencida });
    }
  }
  return escolhidas;
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

  async function container(params) {
    return (await graph('POST', `${igUserId}/media`, params)).id;
  }

  async function esperarPronto(id, { limiteMs, intervaloMs }) {
    for (let gasto = 0; ; gasto += intervaloMs) {
      const { status_code: status } = await graph('GET', id, { fields: 'status_code' });
      if (status === 'FINISHED') return;
      if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`contêiner ${id} terminou com ${status}`);
      if (gasto >= limiteMs) throw new Error(`contêiner ${id} não ficou pronto em ${limiteMs / 1000}s (último status: ${status})`);
      await esperar(intervaloMs);
    }
  }

  async function publicarContainer(id) {
    return (await graph('POST', `${igUserId}/media_publish`, { creation_id: id })).id;
  }

  return { graph, container, esperarPronto, publicarContainer };
}

/** Confere a chave sem publicar: devolve { id, username } da conta. */
export async function conferirConta({ env, fetch = globalThis.fetch }) {
  if (!env.META_TOKEN || !env.IG_USER_ID) throw new Error('faltam os segredos META_TOKEN e/ou IG_USER_ID');
  const meta = criarCliente({ token: env.META_TOKEN, igUserId: env.IG_USER_ID, fetch, esperar: async () => {} });
  return meta.graph('GET', env.IG_USER_ID, { fields: 'id,username' });
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

export async function publicar({
  raiz, hoje, alvo = null, simular = false, env = {}, fetch = globalThis.fetch,
  esperar = (ms) => new Promise((r) => setTimeout(r, ms)), sondar, log = console.log, agora = () => new Date(),
}) {
  const token = env.META_TOKEN;
  const igUserId = env.IG_USER_ID;
  const repo = env.GITHUB_REPOSITORY || 'mazzi777/mazzi-instagram';
  const ocultar = (texto) => (token ? String(texto).split(token).join('***') : String(texto));
  const resultado = { publicadas: [], erros: [] };

  const escolhidas = escolherPecas(raiz, hoje, alvo);
  if (!simular && escolhidas.some((e) => !e.vencida) && (!token || !igUserId)) {
    resultado.erros.push({ peca: 'configuração', mensagem: 'faltam os segredos META_TOKEN e/ou IG_USER_ID no repositório' });
    return resultado;
  }
  const meta = criarCliente({ token, igUserId, fetch, esperar });

  for (const { semana, dir, peca, vencida } of escolhidas) {
    const onde = `${semana}/${peca.id}`;
    const arquivoPublicado = path.join(dir, 'publicado.json');
    const publicado = lerJson(arquivoPublicado, {});
    const salvar = () => writeFileSync(arquivoPublicado, `${JSON.stringify(publicado, null, 2)}\n`);

    if (vencida) {
      if (!simular) {
        publicado[peca.id] = { ...publicado[peca.id], vencida: hoje };
        salvar();
      }
      resultado.erros.push({ peca: onde, mensagem: `venceu sem publicar (dia ${peca.dia}, hoje ${hoje}). Não sai sozinha; para publicar mesmo assim, rode o workflow com peca=${onde}.` });
      continue;
    }

    try {
      const erros = validarPeca(dir, semana, peca, sondar ? { sondar } : undefined);
      if (erros.length) throw new Error(`não passou na validação:\n${erros.map((e) => `  - ${e}`).join('\n')}`);

      const urls = arquivosDa(peca).map((a) => `https://raw.githubusercontent.com/${repo}/main/semanas/${semana}/${a}`);
      for (const url of urls) {
        const r = await fetch(url, { method: 'HEAD' });
        if (r.status !== 200) throw new Error(`mídia não está pública (${r.status}): ${url}`);
      }

      if (simular) {
        log(`[simular] ${onde}: ${peca.tipo} com ${urls.length} arquivo(s) pronto(s) para publicar`);
        resultado.publicadas.push({ peca: onde, simulado: true });
        continue;
      }

      const registro = publicado[peca.id] ?? { ids: [] };
      if (peca.tipo === 'carrossel') {
        const filhos = [];
        for (const url of urls) {
          const id = await meta.container({ image_url: url, is_carousel_item: true });
          await meta.esperarPronto(id, IMAGEM);
          filhos.push(id);
        }
        const pai = await meta.container({ media_type: 'CAROUSEL', children: filhos.join(','), caption: peca.legenda });
        await meta.esperarPronto(pai, IMAGEM);
        registro.ids = [await meta.publicarContainer(pai)];
      } else if (peca.tipo === 'reel') {
        const id = await meta.container({
          media_type: 'REELS', video_url: urls[0], caption: peca.legenda, share_to_feed: true, thumb_offset: peca.capa_ms ?? 0,
        });
        await meta.esperarPronto(id, VIDEO);
        registro.ids = [await meta.publicarContainer(id)];
      } else {
        // Stories: um quadro por vez; se uma rodada parou no meio, continua do próximo quadro.
        for (let i = registro.ids.length; i < urls.length; i++) {
          if (i > 0) await esperar(10_000);
          const id = await meta.container({ media_type: 'STORIES', image_url: urls[i] });
          await meta.esperarPronto(id, IMAGEM);
          registro.ids.push(await meta.publicarContainer(id));
          publicado[peca.id] = { ...registro, via: 'api' };
          salvar();
        }
      }

      publicado[peca.id] = { em: agora().toISOString(), via: 'api', ids: registro.ids, completo: true };
      salvar();
      const extra = [peca.tema, peca.gancho && `"${peca.gancho}"`].filter(Boolean).join(' · ');
      inserirNoLog(raiz, `- ${dataBR(hoje)} · PUBLICADO · ${FORMATO[peca.tipo]} (${peca.id}, ${urls.length} arquivo(s)) · ${extra || 'sem tema'} · ids ${registro.ids.join(', ')} · via API da Meta`);
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
  if (args.includes('--conferir')) {
    const conta = await conferirConta({ env: process.env });
    console.log(`Chave OK: publica como @${conta.username} (${conta.id}).`);
    process.exit(0);
  }
  const hoje = process.env.PUBLICAR_HOJE || hojeEmSaoPaulo();
  const r = await publicar({ raiz, hoje, alvo, simular: args.includes('--simular'), env: process.env });
  if (!r.publicadas.length && !r.erros.length) console.log(`Nada para publicar hoje (${hoje}).`);
  if (r.erros.length) {
    const texto = r.erros.map((e) => `### ${e.peca}\n\n${e.mensagem}`).join('\n\n');
    writeFileSync(path.join(raiz, 'publicar', 'erros.md'), `${texto}\n`);
    console.error(texto);
    process.exit(1);
  }
}
