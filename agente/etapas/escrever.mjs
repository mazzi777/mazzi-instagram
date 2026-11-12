// Redator (Sonnet) + as checagens de texto (G1–G5, G8). O redator recebe os motivos da tentativa anterior.
import { z } from 'zod';
import { checarGancho } from '../checagens/gancho.mjs';
import { checarLegenda } from '../checagens/legenda.mjs';
import { checarHumano } from '../checagens/humano.mjs';
import { checarNunca } from '../checagens/nunca.mjs';
import { checarFatos, resumoParaJuiz } from '../checagens/fatos.mjs';
import { checarRepeticao } from '../checagens/repeticao.mjs';
import { checarBatidas } from '../checagens/batidas.mjs';
import { ICONES } from '../video/motion/icones.mjs';
import { Afirmacoes, ProblemasMarca } from '../lib/schemas.mjs';
import { contextoMarca } from './contexto.mjs';
import { LAYOUTS, NOMES_LAYOUT } from '../imagens/modelos.mjs';

const Cartao = z.object({
  titulo: z.string().max(30).optional(),
  linhas: z.array(z.object({ rotulo: z.string().min(1).max(32), selo: z.string().max(22).optional(), tom: z.enum(['ok', 'aviso', 'ruim', 'neutro']).optional() })).min(1).max(3),
});
// Campos dos layouts (agente/imagens/modelos.mjs). Cada layout usa os seus; os outros ficam vazios.
const Mensagem = z.object({ lado: z.enum(['negocio', 'cliente']), texto: z.string().min(2).max(70) });
const Lado = z.object({ rotulo: z.string().min(2).max(18), itens: z.array(z.string().min(2).max(34)).min(1).max(3) });
const Anotacao = z.object({ texto: z.string().min(2).max(24), riscado: z.boolean().optional() });
const Visual = {
  layout: z.enum(NOMES_LAYOUT),
  conversa: z.array(Mensagem).min(2).max(4).optional(),
  contato: z.string().max(18).optional(),
  lados: z.object({ a: Lado, b: Lado }).optional(),
  anotacoes: z.array(Anotacao).min(2).max(4).optional(),
};
const Slide = z.object({
  tipo: z.enum(['capa', 'estaca', 'ideia', 'resumo', 'chamada']),
  ...Visual,
  titulo: z.string().min(2).max(70),
  destaque: z.string().max(25).optional(),
  texto: z.string().max(190).optional(),
  passo: z.number().int().min(1).max(9).optional(),
  itens: z.array(z.string().max(60)).max(5).optional(),
  cartao: Cartao.optional(),
});
const Quadro = z.object({ ...Visual, layout: z.enum(NOMES_LAYOUT.filter((l) => !LAYOUTS[l].soCarrossel)), titulo: z.string().min(2).max(80), destaque: z.string().max(25).optional(), texto: z.string().max(140).optional(), itens: z.array(z.string().max(60)).max(5).optional(), cartao: Cartao.optional() });
// Cenas da biblioteca de motion (agente/video/motion/cenas.jsx). O redator escolhe uma por batida.
const Ic = z.enum(ICONES);
const Cena = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('gancho'), simbolo: z.enum(['?', '!', 'x']).optional() }),
  z.object({ tipo: z.literal('digitando'), texto: z.string().min(3).max(34), chip: z.object({ icone: Ic, rotulo: z.string().min(2).max(18) }).optional() }),
  z.object({ tipo: z.literal('lista'), itens: z.array(z.object({ icone: Ic, rotulo: z.string().min(2).max(22) })).min(3).max(5) }),
  z.object({ tipo: z.literal('cartao'), cartao: Cartao }),
  z.object({ tipo: z.literal('papel'), rabiscos: z.array(z.string().min(2).max(22)).min(3).max(5), cartao: Cartao }),
  z.object({ tipo: z.literal('checklist'), itens: z.array(z.string().min(2).max(26)).min(3).max(5) }),
  z.object({ tipo: z.literal('contador'), rotulo: z.string().min(2).max(18), valor: z.number().int().min(1).max(999), total: z.number().int().min(1).max(999).optional(), sufixo: z.string().max(3).optional() }),
  z.object({ tipo: z.literal('celular'), contato: z.string().max(18).optional(), mensagens: z.array(z.object({ lado: z.enum(['negocio', 'cliente']), texto: z.string().min(2).max(70) })).min(1).max(3) }),
  z.object({ tipo: z.literal('icone'), de: Ic, badge: z.number().int().min(1).max(99) }),
  z.object({ tipo: z.literal('orbita'), icones: z.array(Ic).min(4).max(6) }),
  z.object({ tipo: z.literal('ato') }),
  z.object({ tipo: z.literal('painel'), titulo: z.string().min(2).max(26), linhas: z.array(z.object({ rotulo: z.string().max(30), selo: z.string().max(22).optional(), tom: z.enum(['ok', 'aviso', 'ruim', 'neutro']).optional() })).max(2).optional() }),
]);
const Batida = z.object({
  fala: z.string().min(2).max(160),
  tela: z.string().min(2).max(40),
  destaque: z.string().max(25).optional(),
  cena: Cena,
});

/** Regras de edição que o código cobra do roteiro do reel (variedade e começo forte). */
export function regrasDaEdicao(batidas) {
  const tipos = batidas.map((b) => b.cena.tipo);
  const motivos = [];
  if (tipos[0] !== 'gancho') motivos.push('edição: a 1ª batida tem que ser a cena "gancho"');
  tipos.forEach((t, i) => { if (i && t === tipos[i - 1]) motivos.push(`edição: cena "${t}" repetida nas batidas ${i} e ${i + 1}`); });
  if (new Set(tipos).size < 4) motivos.push(`edição: só ${new Set(tipos).size} tipos de cena; use pelo menos 4 diferentes`);
  if (!tipos.some((t) => ['cartao', 'celular', 'painel', 'lista', 'icone', 'papel', 'contador'].includes(t))) motivos.push('edição: falta uma cena que mostre o produto (cartão, celular, painel, lista, ícone, papel ou contador)');
  return motivos;
}

export const CONTEUDO = {
  carrossel: z.object({ gancho: z.string().min(3).max(70), slides: z.array(Slide).min(5).max(8), legenda: z.string().min(20).max(2200), alt_text: z.string().min(10).max(1000) }),
  imagem: z.object({ gancho: z.string().min(3).max(70), ...Visual, titulo: z.string().min(2).max(70), destaque: z.string().max(25).optional(), texto: z.string().max(190).optional(), cartao: Cartao.optional(), legenda: z.string().min(20).max(2200), alt_text: z.string().min(10).max(1000) }),
  stories: z.object({ gancho: z.string().min(3).max(80), quadros: z.array(Quadro).min(4).max(5) }),
  reel: z.object({ gancho: z.string().min(3).max(70), batidas: z.array(Batida).min(6).max(14), legenda: z.string().min(20).max(2200) }),
};

const cartaoTexto = (c) => (c ? `[CARTÃO EXEMPLO${c.titulo ? ` "${c.titulo}"` : ''}: ${c.linhas.map((l) => `${l.rotulo}${l.selo ? ` = ${l.selo}` : ''}`).join('; ')}]` : '');

/** O que os elementos visuais de uma tela mostram (conversa e caderno marcados como EXEMPLO para o juiz de fatos). */
const extrasTexto = (t) => [
  t.conversa ? `[CONVERSA EXEMPLO: ${t.conversa.map((m) => `${m.lado}: ${m.texto}`).join(' | ')}]` : '',
  t.lados ? `[COMPARATIVO: ${t.lados.a.rotulo}: ${t.lados.a.itens.join('; ')} || ${t.lados.b.rotulo}: ${t.lados.b.itens.join('; ')}]` : '',
  t.anotacoes ? `[CADERNO, anotações de exemplo: ${t.anotacoes.map((a) => `${a.texto}${a.riscado ? ' (riscado)' : ''}`).join('; ')}]` : '',
].filter(Boolean);

/** Todo o texto da peça, na ordem em que aparece (com os cartões marcados como EXEMPLO para o juiz de fatos). */
export function textoDaPeca(tipo, c) {
  const partes = [];
  const tela = (t) => [t.titulo, t.texto, ...(t.itens ?? []), cartaoTexto(t.cartao), ...extrasTexto(t)].filter(Boolean).join('\n');
  if (tipo === 'carrossel') for (const s of c.slides) partes.push(tela(s));
  if (tipo === 'imagem') partes.push(tela(c));
  if (tipo === 'stories') for (const q of c.quadros) partes.push(tela(q));
  if (tipo === 'reel') for (const b of c.batidas) partes.push([`NA TELA: ${b.tela}`, `NARRAÇÃO: ${b.fala}`, textoDaCena(b.cena)].filter(Boolean).join('\n'));
  if (c.legenda) partes.push(`LEGENDA:\n${c.legenda}`);
  return partes.join('\n\n');
}

/** O que aparece escrito numa cena do reel (interface sempre marcada como EXEMPLO para o juiz de fatos). */
function textoDaCena(c) {
  switch (c.tipo) {
    case 'digitando': return `NA TELA (digitado): ${c.texto}${c.chip ? ` [${c.chip.rotulo}]` : ''}`;
    case 'lista': return `LISTA: ${c.itens.map((i) => i.rotulo).join('; ')}`;
    case 'cartao': return cartaoTexto(c.cartao);
    case 'papel': return `CADERNO (rabiscos de exemplo): ${c.rabiscos.join('; ')}\n${cartaoTexto(c.cartao)}`;
    case 'checklist': return `CHECKLIST: ${c.itens.join('; ')}`;
    case 'contador': return `[CARTÃO EXEMPLO: ${c.rotulo} = ${c.valor}${c.total ? `/${c.total}` : ''}${c.sufixo ?? ''}]`;
    case 'celular': return `[CELULAR EXEMPLO: ${c.mensagens.map((m) => `${m.lado}: ${m.texto}`).join(' | ')}]`;
    case 'painel': return `[PAINEL EXEMPLO "${c.titulo}": ${(c.linhas ?? []).map((l) => `${l.rotulo}${l.selo ? ` = ${l.selo}` : ''}`).join('; ')}]`;
    default: return '';
  }
}

/** Texto corrido sem cartões (para as notas de estilo, que não devem ler rótulos de interface). */
const textoCorrido = (tipo, c) => {
  if (tipo === 'stories') return c.quadros.map((q) => [q.titulo, q.texto].filter(Boolean).join('. ')).join('\n');
  if (tipo === 'reel') return `${c.batidas.map((b) => b.fala).join(' ')}\n${c.legenda}`;
  return c.legenda ?? '';
};

/** G1–G5 e G8 sobre o texto de uma peça. Devolve { ok, motivos, notas, fatos }. */
export async function checarTexto({ item, conteudo, produto, juizFatos, juizMarca, usados, hoje, config }) {
  const c = config.checagens;
  const motivos = [];
  const notas = {};
  const gancho = checarGancho(conteudo.gancho, c.gancho);
  notas.gancho = gancho.nota;
  motivos.push(...gancho.motivos);
  if (item.tipo !== 'stories') {
    const legenda = checarLegenda(conteudo.legenda);
    motivos.push(...legenda.motivos);
    // A primeira linha da legenda é o gancho do feed: não precisa ser idêntica à capa, mas tem que ser forte.
    const primeira = conteudo.legenda.trim().split('\n')[0];
    const g = checarGancho(primeira, c.gancho);
    if (!g.ok) motivos.push(`legenda: a primeira linha não é um gancho forte (nota ${g.nota}): "${primeira}"`);
  }
  // Stories e reel: cada quadro/batida é uma tela, então variação de tamanho entre frases não se aplica.
  const humano = checarHumano(textoCorrido(item.tipo, conteudo), { ...c.humano, semVariacao: item.tipo === 'stories' || item.tipo === 'reel' });
  notas.humano = humano.nota;
  motivos.push(...humano.motivos);
  const tudo = textoDaPeca(item.tipo, conteudo);
  const [nunca, fatos] = await Promise.all([checarNunca(tudo, { juiz: juizMarca, base: resumoParaJuiz(produto) }), checarFatos(tudo, { juiz: juizFatos, produto })]);
  motivos.push(...nunca.motivos, ...fatos.motivos);
  motivos.push(...checarRepeticao(conteudo.gancho, usados, { hoje, limite: c.repeticao.limite }).motivos);
  if (item.tipo === 'reel') motivos.push(...checarBatidas(conteudo.batidas.map((b) => b.fala), c.batidas).motivos, ...regrasDaEdicao(conteudo.batidas));
  return { ok: motivos.length === 0, motivos, notas, fatos: fatos.fatos };
}

const CENAS_PROMPT = `CENAS DISPONÍVEIS (campo "cena", escolha uma por batida):
- gancho: a frase da tela bate palavra por palavra com risco à mão no "destaque" e símbolos gigantes no fundo ("simbolo": ? ! ou x). SEMPRE a 1ª batida.
- digitando: uma frase curta sendo digitada ("texto") e um chip com ícone que salta no fim ("chip": {icone, rotulo}).
- lista: 3 a 5 botões com ícone girando em 3D ("itens": [{icone, rotulo}]). Bom para "tudo que dá pra fazer".
- cartao: cartão de interface EXEMPLO em vidro 3D ("cartao": {titulo, linhas: [{rotulo, selo, tom}]}).
- papel: caderno rabiscado × cartão da Mazzi ("rabiscos": 3 a 5 anotações curtas de caderno, "cartao").
- checklist: 3 a 5 itens que se marcam no tempo da música ("itens").
- contador: anel que enche e número que rola, só valor de EXEMPLO ou contagem do produto ("rotulo", "valor", "total"?, "sufixo"?).
- celular: telefone em 3D com 1 a 3 mensagens subindo ("mensagens": [{lado: negocio|cliente, texto}], "contato"?).
- icone: ícone de app com notificações acumulando que vira o ícone da Mazzi ("de": ícone, "badge": número).
- orbita: a Mazzi no centro e 4 a 6 ícones de funções girando em volta ("icones").
- ato: corte para fundo coral com a frase da tela enorme. Use UMA vez, na virada ("mas tem jeito").
- painel: painel de relatório inclinado com gráfico se desenhando ("titulo", "linhas"? até 2). Só para números do período: vendas, compras, lucro bruto, atendimentos do mês. Para um caso pontual (uma nota, um pedido, uma paciente), use cartão ou celular.
Regras: comece com gancho; nunca a mesma cena duas vezes seguidas; pelo menos 4 cenas diferentes; pelo menos uma cena que mostre o produto.
Roteiro-modelo de reel de produto (um dos caminhos, não o único): dor (gancho) → as coisas soltas do dia a dia (papel, lista, icone) → a Mazzi no centro (orbita) → a tela EXEMPLO (cartao, celular, painel ou contador) → uma frase de virada (ato) → chamada. 20 a 30 segundos; uma frase por tela.
Ícones permitidos: ${ICONES.join(', ')}.`;

const layoutsPrompt = (tipo) => `LAYOUTS (campo "layout" de cada slide, quadro ou imagem; o fundo quem escolhe é o sistema):
${Object.entries(LAYOUTS).filter(([, v]) => tipo === 'carrossel' || !v.soCarrossel).map(([k, v]) => `- ${k}${v.precisa ? ` (preencha "${v.precisa}")` : ''}${v.capa ? '' : ' [não serve de capa]'}: ${v.uso}.`).join('\n')}
Campos: "conversa": 2 a 4 mensagens {lado: negocio|cliente, texto}; "lados": {a: {rotulo, itens}, b: {rotulo, itens}} (a = o jeito de
caderno ou de cabeça, b = o que a tela da Mazzi mostra; até 3 itens curtos de cada lado); "anotacoes": 2 a 4 anotações de caderno
{texto, riscado?}; "itens": 3 a 5 itens; "cartao": {titulo, linhas}.
Direção de arte (o código confere e reprova): escolha o layout pelo que a tela PRECISA mostrar, não por costume. Carrossel com pelo menos
3 layouts diferentes (4 se tiver 7 ou mais slides), nunca o mesmo layout em dois slides seguidos (exceto "passo"), último slide em
"chamada". Stories com pelo menos 2 layouts. "pergunta" e "chamada" com até 9 palavras no título. Texto de cada tela com até 32 palavras.
Stories: pelo menos um quadro que mostre uma cena (conversa, cartao, bilhete, comparativo ou lista). "destaque" (palavra colorida) só na palavra que dói, em no máximo 2 telas (o sistema tira o resto). Guia: guia/direcao-de-arte.md.`;

export function promptPeca(item, motivosAnteriores = [], anterior = null, { capas = [] } = {}) {
  const formato = {
    carrossel: `5 a 8 slides: capa (gancho), estaca, ideias (uma por slide, com "passo" numerado se for sequência), resumo (itens) e chamada. Cartão, conversa, comparativo ou bilhete de exemplo quando ajudar a VER a cena.\n${layoutsPrompt(item.tipo)}`,
    imagem: `um post de imagem única: título forte, texto curto e, se ajudar, um cartão, uma conversa, um comparativo ou um bilhete de exemplo.\n${layoutsPrompt(item.tipo)}`,
    stories: `4 ou 5 quadros, uma ideia por quadro, falando com "você"; o 4º é o pedido ("me responde aqui nesse story" ou "chama no WhatsApp, link na bio").\n${layoutsPrompt(item.tipo)}`,
    reel: 'reel narrado de 20 a 40 segundos, em 7 a 12 batidas. Cada batida tem "fala" (o que a voz diz: frases curtas de gente, até 10 palavras para caber em 4 segundos; a 1ª fala é o gancho, até 7 palavras, e cabe em 3 segundos), "tela" (a frase grande na tela, até 6 palavras, que reforça a fala sem repetir tudo) e "cena" (o motion graphics daquela batida). A última batida é a chamada (o fechamento da marca entra sozinho nela). Escreva a fala para ser ouvida: sem siglas difíceis, sem parênteses, sem emoji.\n' + CENAS_PROMPT,
  }[item.tipo];
  const chamada = item.objetivo === 'conversa' ? 'A chamada é "chama no WhatsApp (link na bio)".' : 'A chamada pede para salvar ou compartilhar o post (uma só).';
  return `Escreva a peça abaixo para o Instagram @mazzisystems.

Formato: ${item.tipo}: ${formato}
Ramo: ${item.ramo} · Objetivo: ${item.objetivo} · Tipo de conteúdo: ${item.conteudo}
Tema: ${item.tema}
Ângulo: ${item.angulo}
Fatos da base que pode usar (e só estes): ${item.fatos.join(', ')}${capas.length && ['carrossel', 'imagem'].includes(item.tipo) ? `\nAs últimas capas do feed usaram os layouts: ${capas.slice(0, 3).map((c) => c.layout).join(', ')}. A capa desta peça usa OUTRO layout${capas.slice(0, 2).length === 2 && capas.slice(0, 2).every((c) => LAYOUTS[c.layout]?.familia !== 'cena') ? ', e precisa MOSTRAR uma cena (conversa, comparativo, cartao ou bilhete): as últimas foram só texto grande' : ''}.` : ''}
${item.tipo === 'stories' ? '' : `${chamada}\nA legenda começa com o gancho (primeira linha, até 125 caracteres), corpo curto, uma chamada, até 3 hashtags no fim.${item.tipo === 'reel' ? '' : '\n"alt_text" descreve a capa para quem não enxerga, em uma ou duas frases.'}`}
"gancho" é a frase da capa / do 1º quadro: até 12 palavras, concreta, com algo em jogo, falando com o dono.
Nunca escreva sobre o plano, o ângulo ou o próprio post ("o foco aqui é...", "neste post"): escreva só o que o dono vai ler.
${motivosAnteriores.length ? `\nA TENTATIVA ANTERIOR FOI REPROVADA. Corrija tudo isto:\n${motivosAnteriores.map((m) => `- ${m}`).join('\n')}` : ''}
${anterior ? `\nSUA VERSÃO ANTERIOR está abaixo. Mantenha tudo o que não foi apontado e mude SÓ o necessário para resolver os pontos acima (reescrever tudo cria problemas novos):\n${JSON.stringify(anterior, null, 1)}` : ''}`;
}

/** Escreve a peça (uma tentativa). */
export async function escreverPeca({ raiz, item, produto, cerebro, config, motivosAnteriores, anterior, capas = [] }) {
  const conteudo = await cerebro.pedir({
    etapa: `escrever:${item.tipo}`,
    modelo: config.modelos.redator,
    sistema: `Você é o redator do Instagram da Mazzi Systems. Escreve como gente, em português do Brasil.\n\n${contextoMarca(raiz, produto)}`,
    prompt: promptPeca(item, motivosAnteriores, anterior, { capas }),
    schema: CONTEUDO[item.tipo],
    effort: 'medium',
  });
  return limparTexto(conteudo);
}

/**
 * Às vezes o modelo escreve a quebra de linha como o texto "\n" (barra e n) em vez de quebrar a linha.
 * Aqui vira quebra de verdade, em todo texto da peça, antes de qualquer checagem.
 */
export function limparTexto(valor) {
  if (typeof valor === 'string') return valor.replace(/\\r\\n|\\n/g, '\n').replace(/\\t/g, ' ');
  if (Array.isArray(valor)) return valor.map(limparTexto);
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, limparTexto(v)]));
  return valor;
}

export const juizesDeTexto = (cerebro) => ({ juizFatos: cerebro.juiz(Afirmacoes, 'juiz:fatos'), juizMarca: cerebro.juiz(ProblemasMarca, 'juiz:marca') });
