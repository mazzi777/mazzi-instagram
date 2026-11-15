// Atualiza a base do produto sem a Andressa (SPEC 7.2):
// 1) ramos: só os que existem no código do aj-clinic (VERTICALS), que a política de segmentos
//    libera (agente/base/segmentos.mjs) E que têm função no ar na base;
// 2) novidades: seções novas do docs/NOVIDADES.md viram candidatas (o Claude extrai), e o código barra
//    tudo que bate com a lista NUNCA ou soa como "ainda não está pronto". O que passa entra no ar e
//    aparece no relatório ("passei a divulgar: X").
import { palavrasProibidas } from '../checagens/nunca.mjs';
import { Produto, Funcao, RAMOS, validar } from '../lib/schemas.mjs';
import { SEGMENTOS, motivoBloqueio, ramoLiberado, segmentosBloqueadosNoTexto, separarSecoes } from './segmentos.mjs';
const NAO_PRONTO = /homologa|em teste|em breve|ainda n[aã]o|falta(?:m)? |pendente|precisa d[ae]s? credenciais|n[aã]o est[aá] ligad|piloto|beta\b/iu;

/** Onde a lista de ramos mora no aj-clinic, em ordem de preferência (versão atual; versão anterior). */
export const FONTES_VERTICALS = ['packages/shared/src/verticals.ts', 'packages/shared/src/permissions.ts'];

const ID_VERTICAL = /^[a-z][a-z0-9_]{1,30}$/;

/**
 * Troca comentários por espaços (mesmo tamanho) e devolve também uma máscara em que o conteúdo das
 * strings vira espaço: a declaração é procurada na máscara ("VERTICALS = [...]" dentro de uma string
 * não conta) e lida no texto sem comentários.
 */
function preparar(src) {
  let texto = '';
  let mascara = '';
  let i = 0;
  let str = null;
  const por = (t, m) => { texto += t; mascara += m; };
  while (i < src.length) {
    const c = src[i];
    if (str) {
      if (c === '\\') { por(c + (src[i + 1] ?? ''), '  '.slice(0, 1 + (src[i + 1] !== undefined ? 1 : 0))); i += 2; continue; }
      if (c === str) { str = null; por(c, c); i++; continue; }
      por(c, c === '\n' ? '\n' : ' ');
      i++;
    } else if (c === '"' || c === "'" || c === '`') { str = c; por(c, c); i++; }
    else if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') { por(' ', ' '); i++; } }
    else if (c === '/' && src[i + 1] === '*') { const f = src.indexOf('*/', i + 2); const fim = f < 0 ? src.length : f + 2; while (i < fim) { const x = src[i] === '\n' ? '\n' : ' '; por(x, x); i++; } }
    else { por(c, c); i++; }
  }
  return { texto, mascara };
}

/**
 * Lê `VERTICALS = [ 'a', "b", ... ]` de um arquivo TypeScript do aj-clinic SEM executar nada:
 * aceita `export`, `const`, anotação de tipo, quebra de linha, vírgula no fim, comentários e `as const`.
 * Só strings literais na lista; qualquer outra coisa (spread, variável, chamada) é "estrutura inesperada".
 * Sem a declaração: lança (quem chama decide o que fazer).
 */
export function lerVerticals(ts) {
  const { texto: src, mascara } = preparar(String(ts ?? ''));
  const re = /(?<![\w$])VERTICALS(?![\w$])/g;
  let m;
  while ((m = re.exec(mascara))) {
    let i = m.index + m[0].length;
    const pular = () => { while (i < src.length && /\s/.test(src[i])) i++; };
    pular();
    // Anotação de tipo opcional: `: readonly string[]` até o `=` (sem atravessar `;` ou `{`).
    if (mascara[i] === ':') { while (i < src.length && !'=;{}'.includes(mascara[i])) i++; }
    if (mascara[i] !== '=' || mascara[i + 1] === '=') continue; // uso, import ou comparação: não é a declaração
    i++;
    pular();
    if (src[i] !== '[') throw new Error('VERTICALS com estrutura inesperada: não é uma lista literal');
    i++;
    const ids = [];
    for (;;) {
      pular();
      if (src[i] === ']') break;
      const q = src[i];
      if (q !== "'" && q !== '"') throw new Error('VERTICALS com estrutura inesperada: item que não é texto literal');
      const fim = src.indexOf(q, i + 1);
      if (fim < 0) throw new Error('VERTICALS malformado: texto sem fechar');
      ids.push(src.slice(i + 1, fim));
      i = fim + 1;
      pular();
      if (src[i] === ',') { i++; continue; }
      if (src[i] === ']') break;
      throw new Error('VERTICALS malformado: esperava vírgula ou fim da lista');
    }
    return ids;
  }
  throw new Error('não achei a declaração de VERTICALS');
}

/** A lista só vale se for plausível: não vazia, ids simples, sem repetição. */
export function validarVerticals(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('VERTICALS vazio');
  if (ids.length > 30) throw new Error('VERTICALS com itens demais');
  const ruim = ids.find((v) => !ID_VERTICAL.test(v));
  // Só a posição: o conteúdo vem de repositório privado e o erro pode virar issue pública.
  if (ruim !== undefined) throw new Error(`VERTICALS com item inválido (posição ${ids.indexOf(ruim) + 1})`);
  if (new Set(ids).size !== ids.length) throw new Error('VERTICALS com item repetido');
  return ids;
}

/**
 * Descobre os ramos do código a partir dos arquivos lidos do clone (`{ caminho: texto | null }`),
 * na ordem de FONTES_VERTICALS. Nunca lança: sem lista confiável devolve `verticals: null` e os
 * problemas (o chamador mantém os ramos que já usava; nada novo é liberado por falta de leitura).
 */
export function descobrirVerticals(arquivos) {
  const problemas = [];
  for (const caminho of FONTES_VERTICALS) {
    const texto = arquivos?.[caminho];
    if (typeof texto !== 'string') continue;
    try {
      return { verticals: validarVerticals(lerVerticals(texto)), fonte: caminho, problemas };
    } catch (e) {
      problemas.push(`${caminho}: ${e.message}`);
    }
  }
  if (!problemas.length) problemas.push(`nenhum arquivo de ramos encontrado (${FONTES_VERTICALS.join(', ')})`);
  return { verticals: null, fonte: null, problemas };
}

/** Ramos que o agente pode usar e ramos do código que ainda não têm base (para o relatório). */
export function ramosAtivos(produto, verticals, politica = SEGMENTOS) {
  const ativos = [];
  const semBase = [];
  for (const v of verticals) {
    const ramo = ramoLiberado(v, politica);
    const temFuncao = ramo && produto.funcoes.some((f) => f.ramo === ramo && f.status === 'no_ar');
    if (ramo && temFuncao && RAMOS.includes(ramo)) ativos.push(ramo);
    else semBase.push(v);
  }
  return { ativos, semBase };
}

/** Seções "## Título" do NOVIDADES.md: [{ titulo, texto }]. */
export function secoesNovidades(md) {
  const secoes = [];
  for (const bloco of md.split(/^## /m).slice(1)) {
    const [titulo, ...resto] = bloco.split('\n');
    secoes.push({ titulo: titulo.trim(), texto: resto.join('\n').trim() });
  }
  return secoes;
}

export const TAREFA_EXTRAIR = `Você lê o changelog de um sistema de gestão (Mazzi Systems) e extrai funções NOVAS que um dono de clínica ou restaurante entenderia.
Para cada função: "id" no formato ramo.nome (rest., clin. ou comum.; minúsculas, hífen), "ramo" (clinica | restaurante | comum),
"fato" (uma ou duas frases simples, sem exagero, só o que o texto diz) e "fonte" (o título da seção).
Ignore correção de bug, segurança interna, infraestrutura e o que for só para a administradora da plataforma.
Ignore o que estiver em homologação, em teste, pendente ou dependendo de credencial.
Só clínica e restaurante: nunca transforme função de outro tipo de negócio em "comum". Responda só no formato pedido.`;

// No texto original da seção só os sinais fortes (o "falta" de "paciente que falta" não pode barrar a função).
const SECAO_NAO_PRONTA = /homologa|em teste|em breve|pendente|credenciais|n[aã]o est[aá] ligad|piloto|beta\b|n[aã]o (?:publicad|liberad|divulga|anunci)/iu;

/**
 * Barra candidatas proibidas, não prontas, repetidas ou inválidas. `secoes` = { titulo: texto original }:
 * a paráfrase do Claude pode perder o "(em homologação)", então o texto da seção de origem também é conferido.
 */
const chave = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

export function filtrarCandidatas(candidatas, produto, secoes = {}, politica = SEGMENTOS) {
  // Fonte comparada sem diferença de espaço e maiúscula, e o texto da seção achado pela mesma chave.
  const porChave = new Map(Object.entries(secoes).map(([t, txt]) => [chave(t), txt]));
  const existentes = new Set(produto.funcoes.map((f) => f.id));
  const aprovadas = [];
  const recusadas = [];
  for (const c of candidatas) {
    const proibido = palavrasProibidas(`${c.id} ${c.fato}`);
    // Defesa em profundidade: a seção do segmento bloqueado nem chega ao Claude, mas uma candidata
    // que fale dele (inclusive rotulada "comum") também não entra.
    const bloqueado = segmentosBloqueadosNoTexto(`${c.id} ${c.fato} ${c.fonte}`, politica, { comSinais: true });
    const valida = Funcao.safeParse({ ...c, status: 'no_ar' });
    // O Claude só pode citar como fonte uma seção que recebeu (seção bloqueada nem foi enviada).
    const fonteDesconhecida = porChave.size > 0 && !porChave.has(chave(c.fonte));
    const textoDaSecao = porChave.get(chave(c.fonte)) ?? '';
    if (bloqueado.length) recusadas.push({ ...c, motivo: bloqueado.map((id) => motivoBloqueio(id, politica)).join('; ') });
    else if (fonteDesconhecida) recusadas.push({ ...c, motivo: 'fonte fora das seções lidas nesta rodada' });
    else if (existentes.has(c.id)) recusadas.push({ ...c, motivo: 'já está na base' });
    else if (proibido.length) recusadas.push({ ...c, motivo: proibido[0] });
    else if (NAO_PRONTO.test(c.fato) || SECAO_NAO_PRONTA.test(`${c.fonte}\n${textoDaSecao}`)) recusadas.push({ ...c, motivo: 'parece não estar pronta' });
    else if (!valida.success) recusadas.push({ ...c, motivo: `inválida: ${valida.error.issues[0].message}` });
    else { aprovadas.push(c); existentes.add(c.id); }
  }
  return { aprovadas, recusadas };
}

/**
 * Passo completo. `extrair(tarefa, texto)` (Claude) devolve { funcoes: [{id, ramo, fato, fonte}] }.
 * Só lê seções que ainda não estão em produto.novidades_vistas.
 * Arquivos do clone: `arquivos` = { 'packages/shared/src/verticals.ts': texto|null, ... }. Compatível com
 * a forma antiga (`permissionsTs`, só o permissions.ts).
 *
 * Ordem segura: (1) ramos do código e política; (2) seções do changelog separadas pela política (a do
 * segmento bloqueado nem vai para o Claude); (3) candidatas filtradas de novo pela política.
 * Sem lista confiável de ramos, ficam os ramos que a base já usava (filtrados pela política) e o
 * problema volta em `avisos`: a semana segue com clínica e restaurante.
 */
export async function atualizarBase({ produto, novidadesMd, permissionsTs, arquivos, extrair, hoje, politica: politicaBase = SEGMENTOS }) {
  let politica = politicaBase;
  const fontes = arquivos ?? { 'packages/shared/src/permissions.ts': permissionsTs ?? null };
  const descoberta = descobrirVerticals(fontes);
  // Não ler os ramos é problema para alguém olhar (vira issue), não só uma linha de log.
  const alertas = descoberta.verticals
    ? (descoberta.problemas.length ? [`lista de ramos lida de ${descoberta.fonte}, mas a fonte preferida deu problema (${descoberta.problemas.join(' | ')})`] : [])
    : [`ramos do aj-clinic não lidos (${descoberta.problemas.join(' | ')}): mantidos os que a base já usava; novidades seguradas até a leitura voltar`];
  const bloqueados = (descoberta.verticals ?? []).map((v) => motivoBloqueio(v, politica)).filter(Boolean);
  // Vertical do código sem linha na política: bloqueada, e o próprio id vira termo (o changelog pode citá-la).
  const desconhecidas = (descoberta.verticals ?? []).filter((v) => !Object.hasOwn(politica, v));
  if (desconhecidas.length) politica = { ...politica, ...Object.fromEntries(desconhecidas.map((v) => [v, { ramo: null, divulgar: false, termos: [v.replace(/_/g, ' ')], sinais: [] }])) };
  // O id do código costuma estar em inglês e o changelog em português: sem a linha do ramo na política
  // (com os termos dele), o filtro não reconhece as seções dele. Até alguém decidir, nenhuma seção nova
  // é lida (nem marcada como lida) e a rodada alerta.
  // Sem lista confiável também: um ramo novo poderia estar no changelog sem ninguém saber.
  const segurarNovidades = !descoberta.verticals || desconhecidas.length > 0;
  const alertasRamoNovo = desconhecidas.length ? [`há ${desconhecidas.length} ramo(s) novo(s) no código do aj-clinic sem linha em agente/base/segmentos.mjs: as novidades ficam seguradas até a decisão (ver guia/segmentos.md)`] : [];

  const vistas = new Set(produto.novidades_vistas ?? []);
  const novas = segurarNovidades ? [] : secoesNovidades(novidadesMd).filter((s) => !vistas.has(s.titulo));
  const { liberadas, bloqueadas } = separarSecoes(novas, politica);
  let adicionadas = [];
  let recusadas = [];
  const paraLer = liberadas.filter((s) => s.texto);
  if (paraLer.length) {
    const texto = paraLer.map((s) => `## ${s.titulo}\n${s.texto}`).join('\n\n');
    const { funcoes } = await extrair(TAREFA_EXTRAIR, texto);
    ({ aprovadas: adicionadas, recusadas } = filtrarCandidatas(funcoes, produto, Object.fromEntries(paraLer.map((s) => [s.titulo, s.textoOriginal ?? s.texto])), politica));
  }
  const novo = {
    ...produto,
    atualizado_em: hoje,
    funcoes: [...produto.funcoes, ...adicionadas.map((c) => ({ ...c, status: 'no_ar', fonte: `docs/NOVIDADES.md: ${c.fonte}`, desde: hoje }))],
    // Seção bloqueada não fica como vista: quando o ramo for liberado, ela é lida.
    novidades_vistas: [...vistas, ...liberadas.map((s) => s.titulo)],
  };
  let semBase = [];
  if (descoberta.verticals) {
    const r = ramosAtivos(novo, descoberta.verticals, politica);
    novo.ramos = r.ativos;
    semBase = r.semBase;
  } else {
    const liberados = new Set(Object.values(politica).filter((s) => s.divulgar === true).map((s) => s.ramo));
    novo.ramos = (produto.ramos ?? []).filter((r) => liberados.has(r));
  }
  if (!novo.ramos.length) throw new Error('nenhum ramo liberado com base confiável: a base do produto não foi atualizada');
  return {
    produto: validar(Produto, novo, 'base do produto atualizada'),
    adicionadas,
    recusadas,
    ramosSemBase: semBase,
    bloqueados,
    secoesBloqueadas: bloqueadas,
    blocosAparados: liberadas.reduce((n, s) => n + (s.linhasRemovidas ?? 0), 0),
    fonteVerticals: descoberta.fonte,
    avisos: [],
    alertas: [...alertas, ...alertasRamoNovo],
  };
}
