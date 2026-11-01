// Atualiza a base do produto sem a Andressa (SPEC 7.2):
// 1) ramos: só os que existem no código do aj-clinic (VERTICALS) E têm função no ar na base;
// 2) novidades: seções novas do docs/NOVIDADES.md viram candidatas (o Claude extrai), e o código barra
//    tudo que bate com a lista NUNCA ou soa como "ainda não está pronto". O que passa entra no ar e
//    aparece no relatório ("passei a divulgar: X").
import { palavrasProibidas } from '../checagens/nunca.mjs';
import { Produto, Funcao, RAMOS, validar } from '../lib/schemas.mjs';

const RAMO_DO_CODIGO = { clinic: 'clinica', restaurant: 'restaurante' };
const NAO_PRONTO = /homologa|em teste|em breve|ainda n[aã]o|falta(?:m)? |pendente|precisa d[ae]s? credenciais|n[aã]o est[aá] ligad|piloto|beta\b/iu;

/** `export const VERTICALS = ['clinic', 'restaurant'] as const;` → ['clinic', 'restaurant'] */
export function lerVerticals(permissionsTs) {
  const m = permissionsTs.match(/VERTICALS\s*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error('não achei VERTICALS em packages/shared/src/permissions.ts');
  return [...m[1].matchAll(/['"]([a-z_]+)['"]/g)].map((x) => x[1]);
}

/** Ramos que o agente pode usar e ramos do código que ainda não têm base (para o relatório). */
export function ramosAtivos(produto, verticals) {
  const ativos = [];
  const semBase = [];
  for (const v of verticals) {
    const ramo = RAMO_DO_CODIGO[v];
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
Ignore o que estiver em homologação, em teste, pendente ou dependendo de credencial. Responda só no formato pedido.`;

/** Barra candidatas proibidas, não prontas, repetidas ou inválidas. */
export function filtrarCandidatas(candidatas, produto) {
  const existentes = new Set(produto.funcoes.map((f) => f.id));
  const aprovadas = [];
  const recusadas = [];
  for (const c of candidatas) {
    const proibido = palavrasProibidas(`${c.id} ${c.fato}`);
    const valida = Funcao.safeParse({ ...c, status: 'no_ar' });
    if (existentes.has(c.id)) recusadas.push({ ...c, motivo: 'já está na base' });
    else if (proibido.length) recusadas.push({ ...c, motivo: proibido[0] });
    else if (NAO_PRONTO.test(c.fato)) recusadas.push({ ...c, motivo: 'parece não estar pronta' });
    else if (!valida.success) recusadas.push({ ...c, motivo: `inválida: ${valida.error.issues[0].message}` });
    else { aprovadas.push(c); existentes.add(c.id); }
  }
  return { aprovadas, recusadas };
}

/**
 * Passo completo. `extrair(tarefa, texto)` (Claude) devolve { funcoes: [{id, ramo, fato, fonte}] }.
 * Só lê seções que ainda não estão em produto.novidades_vistas.
 */
export async function atualizarBase({ produto, novidadesMd, permissionsTs, extrair, hoje }) {
  const vistas = new Set(produto.novidades_vistas ?? []);
  const novas = secoesNovidades(novidadesMd).filter((s) => !vistas.has(s.titulo));
  let adicionadas = [];
  let recusadas = [];
  if (novas.length) {
    const texto = novas.map((s) => `## ${s.titulo}\n${s.texto}`).join('\n\n');
    const { funcoes } = await extrair(TAREFA_EXTRAIR, texto);
    ({ aprovadas: adicionadas, recusadas } = filtrarCandidatas(funcoes, produto));
  }
  const novo = {
    ...produto,
    atualizado_em: hoje,
    funcoes: [...produto.funcoes, ...adicionadas.map((c) => ({ ...c, status: 'no_ar', fonte: `docs/NOVIDADES.md: ${c.fonte}`, desde: hoje }))],
    novidades_vistas: [...vistas, ...novas.map((s) => s.titulo)],
  };
  const { ativos, semBase } = ramosAtivos(novo, lerVerticals(permissionsTs));
  novo.ramos = ativos;
  return { produto: validar(Produto, novo, 'base do produto atualizada'), adicionadas, recusadas, ramosSemBase: semBase };
}
