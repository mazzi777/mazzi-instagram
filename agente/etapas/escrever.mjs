// Redator (Sonnet) + as checagens de texto (G1–G5, G8). O redator recebe os motivos da tentativa anterior.
import { z } from 'zod';
import { checarGancho, notaGancho } from '../checagens/gancho.mjs';
import { CONCRETOS } from '../lib/texto.mjs';
import { checarLegenda } from '../checagens/legenda.mjs';
import { checarHumano, COLOQUIAL, PESSOAS } from '../checagens/humano.mjs';
import { checarNunca, palavrasProibidas } from '../checagens/nunca.mjs';
import { checarFatos, resumoParaJuiz } from '../checagens/fatos.mjs';
import { checarRepeticao } from '../checagens/repeticao.mjs';
import { checarBatidas } from '../checagens/batidas.mjs';
import { ICONES } from '../video/motion/icones.mjs';
import { Afirmacoes, ProblemasMarca } from '../lib/schemas.mjs';
import { contextoMarca } from './contexto.mjs';
import { LAYOUTS, NOMES_LAYOUT } from '../imagens/modelos.mjs';
import { DINHEIRO } from '../checagens/direcao.mjs';

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
  z.object({ tipo: z.literal('lista'), estilo: z.enum(['botoes', 'pilulas']).optional(), itens: z.array(z.object({ icone: Ic, rotulo: z.string().min(2).max(22) })).min(2).max(5) }),
  z.object({ tipo: z.literal('hub'), modulos: z.array(z.object({ icone: Ic, rotulo: z.string().min(2).max(12) })).min(3).max(6) }),
  z.object({ tipo: z.literal('encaixe'), pecas: z.array(z.object({ icone: Ic, rotulo: z.string().min(2).max(16) })).min(2).max(4) }),
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
  batidas.forEach((b, i) => {
    const c = b.cena;
    if (c.tipo === 'lista' && c.estilo === 'pilulas' && c.itens.length > 3) motivos.push(`edição: pílulas com ${c.itens.length} itens na batida ${i + 1} (no máximo 3)`);
    if (c.tipo === 'lista' && c.estilo === 'pilulas' && c.itens.some((x) => x.rotulo.length > 18)) motivos.push(`edição: pílula com mais de 18 letras na batida ${i + 1} (não cabe numa linha)`);
    // Valor em dinheiro só em cena de interface EXEMPLO (cartão, celular, contador, painel); nunca na fala, na tela ou em lista.
    const soltos = [b.fala, b.tela, ...(c.itens ?? []).map((x) => (typeof x === 'string' ? x : x.rotulo)), ...(c.modulos ?? []).map((x) => x.rotulo), ...(c.pecas ?? []).map((x) => x.rotulo), ...(c.rabiscos ?? []), c.texto];
    if (soltos.some((x) => DINHEIRO.test(x ?? ''))) motivos.push(`edição: valor em dinheiro fora de cena EXEMPLO na batida ${i + 1}`);
    if (c.tipo === 'lista' && c.estilo !== 'pilulas' && c.itens.length < 3) motivos.push(`edição: lista com ${c.itens.length} itens na batida ${i + 1} (de 3 a 5; para 2 ou 3 benefícios use estilo "pilulas")`);
  });
  if (!tipos.some((t) => ['cartao', 'celular', 'painel', 'lista', 'icone', 'papel', 'contador', 'hub', 'encaixe'].includes(t))) motivos.push('edição: falta uma cena que mostre o produto (cartão, celular, painel, lista, ícone, papel, contador, hub ou encaixe)');
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
    case 'lista': return `${c.estilo === 'pilulas' ? 'PÍLULAS' : 'LISTA'}: ${c.itens.map((i) => i.rotulo).join('; ')}`;
    case 'hub': return `HUB (a Mazzi no centro, ligada a): ${c.modulos.map((m) => m.rotulo).join('; ')}`;
    case 'encaixe': return `ENCAIXE (base que vai enchendo, contador ${c.pecas.length} de ${c.pecas.length}): ${c.pecas.map((p) => p.rotulo).join('; ')}`;
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
    if (DINHEIRO.test(conteudo.legenda)) motivos.push('legenda: valor em dinheiro (só dentro de cartão EXEMPLO na imagem)');
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
  // O texto alternativo é publicado junto (e o gancho pode ir para a capa): passam pela lista NUNCA também.
  motivos.push(...palavrasProibidas(`${conteudo.gancho ?? ''}\n${conteudo.alt_text ?? ''}`).map((m) => `alt_text/gancho: ${m}`));
  motivos.push(...checarRepeticao(conteudo.gancho, usados, { hoje, limite: c.repeticao.limite }).motivos);
  if (item.tipo === 'reel') motivos.push(...checarBatidas(conteudo.batidas.map((b) => b.fala), c.batidas).motivos, ...regrasDaEdicao(conteudo.batidas));
  return { ok: motivos.length === 0, motivos, notas, fatos: fatos.fatos };
}

const CENAS_PROMPT = `CENAS DISPONÍVEIS (campo "cena", escolha uma por batida):
- gancho: a frase da tela bate palavra por palavra com risco à mão no "destaque" e símbolos gigantes no fundo ("simbolo": ? ! ou x). SEMPRE a 1ª batida.
- digitando: uma frase curta sendo digitada ("texto") e um chip com ícone que salta no fim ("chip": {icone, rotulo}).
- lista: 3 a 5 botões com ícone girando em 3D ("itens": [{icone, rotulo}]). Para passos ou partes de UMA função (não uma vitrine de recursos). Com "estilo": "pilulas", 2 ou 3 benefícios curtos em pílulas cheias que entram uma por batida (uma ideia por pílula, até 18 letras cada, senão não cabe numa linha).
- hub: a Mazzi no centro e 3 a 6 módulos em volta ligados por linha fina ("modulos": [{icone, rotulo}]). Para "tudo num lugar só" (só módulos que existem na base).
- encaixe: uma base com 2 a 4 encaixes que vão sendo ocupados, um por batida, com o contador "2/4" ("pecas": [{icone, rotulo}]). Para "cada coisa no seu lugar" (os módulos de um ramo, os passos de um fluxo). Nunca número de resultado.
- cartao: cartão de interface EXEMPLO em vidro 3D ("cartao": {titulo, linhas: [{rotulo, selo, tom}]}).
- papel: caderno rabiscado × cartão da Mazzi ("rabiscos": 3 a 5 anotações curtas de caderno, "cartao").
- checklist: 3 a 5 itens que se marcam no tempo da música ("itens").
- contador: anel que enche e número que rola, só valor de EXEMPLO ou contagem do produto ("rotulo", "valor", "total"?, "sufixo"?).
- celular: telefone em 3D com 1 a 3 mensagens subindo ("mensagens": [{lado: negocio|cliente, texto}], "contato"?).
- icone: ícone de app com notificações acumulando que vira o ícone da Mazzi ("de": ícone, "badge": número).
- orbita: a Mazzi no centro e 4 a 6 ícones de funções girando em volta ("icones").
- ato: corte para fundo coral com a frase da tela enorme. No máximo UMA vez, e a frase traz informação da cena ("Domingo o quilo já vem certo"), nunca virada vazia ("Mas tem jeito", "Tem solução").
- painel: painel de relatório inclinado com gráfico se desenhando ("titulo", "linhas"? até 2). Só para números do período: vendas, compras, lucro bruto, atendimentos do mês. Para um caso pontual (uma nota, um pedido, uma paciente), use cartão ou celular.
Regras: comece com gancho; nunca a mesma cena duas vezes seguidas; pelo menos 4 cenas diferentes; pelo menos uma cena que mostre o produto.
O reel é UMA cena do começo ao fim (o editor reprovou em 21/11 os que viravam vitrine de recursos):
1. gancho com a cena concreta (quem, quando, qual objeto) e o nome da coisa logo na 1ª ou 2ª tela ("balança", "lista de retornos");
2. o problema MOSTRADO: se a fala cita caderno, plaquinha, gaveta ou bilhete, a cena daquela batida mostra (papel, celular);
3. a tela da função naquela mesma cena (cartao, celular, contador ou painel), só com o que a base diz;
4. um ou dois detalhes NOVOS da mesma função, cada batida com informação que a anterior não tinha (checklist que resume o que acabou de ser dito é repetição);
5. chamada ligada à cena.
A frase da tela é frase de balcão, não etiqueta ("O caixa lê o código", não "Nota com código"). Varie o tamanho das falas: umas de 2 a 4 palavras, outras de 8 a 10.
A ferramenta medir_roteiro também devolve "avisos" (o que o editor costuma reprovar): resolva antes de entregar. 20 a 35 segundos; uma frase por tela.
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

/**
 * Ferramenta do redator e do planejador: a MESMA régua do G3 e do G8 (código, sem Claude). Medir antes de entregar
 * não muda a checagem final (ela roda de novo depois); só evita gastar uma tentativa inteira num gancho que já nasce reprovado.
 */
export function medirGanchos(ganchos, { config, usados = [], hoje } = {}) {
  const limites = config?.checagens?.gancho ?? {};
  return ganchos.map((g) => {
    const r = checarGancho(g, limites);
    const rep = checarRepeticao(g, usados, { hoje, limite: config?.checagens?.repeticao?.limite });
    const motivos = [...r.motivos, ...rep.motivos];
    return { gancho: g, nota: r.nota, passa: motivos.length === 0, motivos, criterios: Object.fromEntries(Object.entries(r.detalhe.criterios).map(([k, v]) => [k, `${v[0]} (${v[1]})`])) };
  });
}

/** Especificação da ferramenta "medir_gancho" (o cérebro embrulha no formato do SDK). */
export function ferramentaGancho(opcoes) {
  return {
    name: 'medir_gancho',
    description: 'Mede ganchos com a régua oficial (nota de 0 a 100, mínimo 70, nenhum critério abaixo de 55, sem repetir gancho das últimas 6 semanas). Mande de 1 a 8 candidatos; use um que volte com passa=true.',
    shape: { ganchos: z.array(z.string().min(2).max(140)).min(1).max(8) },
    handler: async ({ ganchos }) => ({ content: [{ type: 'text', text: JSON.stringify(medirGanchos(ganchos, opcoes), null, 1) }] }),
  };
}

/**
 * Ferramenta "medir_texto": a MESMA régua do G4 (cara de IA) sobre o texto corrido da peça (legenda; no reel, as falas
 * e a legenda; nos stories, títulos e textos dos quadros). Em 21/11 (2ª rodada) duas reposições reprovaram por VOZ.
 */
export function ferramentaTexto({ config, tipo }) {
  return {
    name: 'medir_texto',
    description: 'Mede o texto corrido (legenda; no reel as falas + legenda; nos stories os títulos e textos dos quadros) com a régua oficial de "cara de IA" (nota mínima 70, nenhum critério abaixo de 55). Devolve nota, passa e os critérios.',
    shape: { texto: z.string().min(10).max(4000) },
    handler: async ({ texto }) => {
      const r = checarHumano(texto, { ...config?.checagens?.humano, semVariacao: tipo === 'stories' || tipo === 'reel' });
      const criterios = Object.fromEntries(Object.entries(r.detalhe.criterios).map(([k, v]) => [k, `${v[0] ?? '-'} (${v[1]})`]));
      return { content: [{ type: 'text', text: JSON.stringify({ nota: r.nota, passa: r.ok, motivos: r.motivos, criterios }, null, 1) }] };
    },
  };
}

// O que o editor (G9b) mais reprovou nos reels de 21/11 (18 sugestões no registro), em sinais que o código acha.
// São AVISOS para o redator antecipar: não reprovam nada (quem julga continua sendo o editor, independente).
const VIRADA_VAZIA = /^\s*(?:mas\s+)?(?:tem|há|existe)\s+(?:jeito|solução|saída)\b|^\s*simples\s+assim\b|^\s*(?:e\s+)?agora\s+ficou\s+fácil\b|^\s*problema\s+resolvido\b/iu;
const OBJETOS_DE_CENA = /\b(caderno|papel|plaquinha|gaveta|bilhete|planilha|agenda de papel|post-?it)\b/iu;
const FALA_DE_MANUAL = /\b(cada linha traz|o sistema (?:permite|possibilita|oferece)|é possível|você pode (?:ver|acessar|conferir)|basta (?:clicar|abrir)|com (?:apenas|poucos) cliques)\b/iu;
const palavrasDe = (t = '') => (t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[a-z0-9]{4,}/g) ?? []);

/** Avisos editoriais do roteiro do reel (lista de frases; vazia = nada a antecipar). */
export function avisosDoRoteiro(batidas) {
  const avisos = [];
  batidas.forEach((b, i) => {
    const n = i + 1;
    if (VIRADA_VAZIA.test(b.fala) || VIRADA_VAZIA.test(b.tela)) avisos.push(`batida ${n}: virada vazia ("${b.fala}"): troque por uma informação da cena`);
    if (FALA_DE_MANUAL.test(b.fala)) avisos.push(`batida ${n}: fala de manual ("${b.fala}"): diga como na recepção ou no balcão`);
    const objeto = b.fala.match(OBJETOS_DE_CENA)?.[1];
    const mostra = [batidas[i - 1], b, batidas[i + 1]].some((x) => x && ['papel', 'celular'].includes(x.cena?.tipo));
    if (objeto && !mostra) avisos.push(`batida ${n}: a fala cita "${objeto}" mas nenhuma cena perto mostra (use "papel" ou "celular")`);
    if (i && ['checklist', 'lista'].includes(b.cena?.tipo)) {
      const itens = (b.cena.itens ?? []).map((x) => (typeof x === 'string' ? x : x.rotulo)).join(' ');
      const antes = new Set(palavrasDe(`${batidas[i - 1].fala} ${batidas[i - 1].tela} ${JSON.stringify(batidas[i - 1].cena ?? {})}`));
      const daLista = palavrasDe(itens);
      if (daLista.length && daLista.filter((p) => antes.has(p)).length / daLista.length >= 0.5) avisos.push(`batida ${n}: a lista repete o que a batida ${n - 1} acabou de dizer: traga informação nova`);
    }
  });
  const tamanhos = batidas.map((b) => b.fala.split(/\s+/).filter(Boolean).length);
  const media = tamanhos.reduce((s, x) => s + x, 0) / (tamanhos.length || 1);
  const desvio = Math.sqrt(tamanhos.reduce((s, x) => s + (x - media) ** 2, 0) / (tamanhos.length || 1));
  if (tamanhos.length >= 5 && desvio < 1.5) avisos.push(`falas todas do mesmo tamanho (${tamanhos.join(', ')} palavras): misture falas de 2 a 4 palavras com outras de 8 a 10`);
  return avisos;
}

/**
 * Ferramenta "medir_roteiro" (só reel): as MESMAS regras de código do roteiro (tempo de cada batida e do gancho,
 * duração estimada do vídeo com folga) e da edição (cenas), mais os avisos editoriais (não reprovam).
 * Em 21/11 os 3 reels de reposição gastaram tentativas em batida > 4 s, gancho com 3,0 s e cena repetida.
 */
export function ferramentaRoteiro({ config }) {
  return {
    name: 'medir_roteiro',
    description: 'Confere o roteiro do reel com as regras oficiais do código: tempo de cada batida (até 4 s) e do gancho (até 3 s), duração total, variedade e regras das cenas. Mande as batidas completas ({fala, tela, cena}); passa=true quer dizer que o roteiro não tem nenhum desses problemas.',
    shape: { batidas: z.array(z.object({ fala: z.string(), tela: z.string(), cena: z.object({ tipo: z.string() }).passthrough() })).min(1).max(20) },
    handler: async ({ batidas }) => {
      let motivos;
      let avisos = [];
      let videoEstimado;
      try {
        const r = checarBatidas(batidas.map((b) => b.fala), config?.checagens?.batidas);
        videoEstimado = r.detalhe.videoEstimado;
        motivos = [...r.motivos, ...regrasDaEdicao(batidas)];
        avisos = avisosDoRoteiro(batidas);
      } catch (e) {
        motivos = [`roteiro fora do formato: ${e.message}`];
      }
      return { content: [{ type: 'text', text: JSON.stringify({ passa: motivos.length === 0, motivos, video_estimado_s: videoEstimado, avisos_do_editor: avisos }, null, 1) }] };
    },
  };
}

/** Régua de voz em texto, com as listas EXATAS do código (G4, critério VOZ). */
export const REGUA_VOZ = `RÉGUA DE VOZ (código; o texto corrido precisa de nota 70 e nenhum critério abaixo de 55):
- A cada 100 palavras, uns 2 coloquiais destes: ${[...COLOQUIAL].join(', ')}. ("pra" e "tá" resolvem quase sempre.)
- A cada 100 palavras, uns 5 destes: ${[...PESSOAS].join(', ')}. (Fale com o dono: "você", "seu caixa", "a gente".)
- Sem trinca de adjetivos, sem "não é só X, é Y", sem travessão (—).
Meça o texto corrido com a ferramenta medir_texto antes de responder.`;

/** Régua do gancho em texto, com a lista EXATA de palavras que contam como concretas (a mesma do código). */
export const REGUA_GANCHO = `RÉGUA DO GANCHO (código; nota mínima 70 e nenhum critério abaixo de 55; vale para a capa/1º quadro e para a 1ª linha da legenda):
- CONCRETO é o critério que mais reprova. Conta como concreto: número, nome próprio no meio da frase, ou uma destas palavras:
  ${[...CONCRETOS].join(', ')}.
  NÃO contam: sistema, tela, logo, venda, menu, conta, negócio, gestão, cadastro, controle, organização.
- TENSÃO: "não", "sem", "sumiu", "faltou", "esqueceu", "de novo", "ninguém", "antes", "cadê" ou pergunta.
- NA FRENTE: a palavra concreta ou de tensão nas 4 primeiras palavras.
- COM QUEM: "você/seu/sua", uma ordem ("Confere", "Anota") ou pergunta direta.
- 5 a 12 palavras, até 60 caracteres.`;

/** O gancho que o plano sugeriu no ângulo (entre aspas, depois de "Gancho", "Quadro 1" etc.), se houver. */
export function ganchoSugerido(angulo = '') {
  const m = angulo.match(/(?:gancho(?: falado)?|quadro 1|capa)\s*:\s*["“]([^"”]{3,140})["”]/i);
  return m ? m[1].trim() : null;
}

/** Texto exato das funções que a peça pode usar: o redator não amplia ("as ações importantes" não vira "tudo"). */
export function fatosDaPeca(item, produto) {
  const porId = new Map((produto?.funcoes ?? []).map((f) => [f.id, f]));
  return item.fatos.map((id) => `- ${id}: ${porId.get(id)?.fato ?? '(fora da base: não use)'}`).join('\n');
}

export function promptPeca(item, motivosAnteriores = [], anterior = null, { capas = [], produto = null, config = null } = {}) {
  const formato = {
    carrossel: `5 a 8 slides: capa (gancho), estaca, ideias (uma por slide, com "passo" numerado se for sequência), resumo (itens) e chamada. Cartão, conversa, comparativo ou bilhete de exemplo quando ajudar a VER a cena.\n${layoutsPrompt(item.tipo)}`,
    imagem: `um post de imagem única: título forte, texto curto e, se ajudar, um cartão, uma conversa, um comparativo ou um bilhete de exemplo.\n${layoutsPrompt(item.tipo)}`,
    stories: `4 ou 5 quadros, uma ideia por quadro, falando com "você"; o 4º é o pedido, UM só: "me responde aqui nesse story" OU "chama no WhatsApp, link na bio" (nunca os dois); o 5º, se houver, fecha sem pedir de novo. "gancho" é o título do 1º quadro, igual.\n${layoutsPrompt(item.tipo)}`,
    reel: 'reel narrado de 20 a 40 segundos, em 7 a 12 batidas. Cada batida tem "fala" (o que a voz diz: frases curtas de gente, até 10 palavras para caber em 4 segundos; a 1ª fala é o gancho, até 7 palavras, e cabe em 3 segundos), "tela" (a frase grande na tela, até 6 palavras, que reforça a fala sem repetir tudo) e "cena" (o motion graphics daquela batida). A última batida é a chamada (o fechamento da marca entra sozinho nela). Escreva a fala para ser ouvida: sem siglas difíceis, sem parênteses, sem emoji.\n' + CENAS_PROMPT,
  }[item.tipo];
  const chamada = item.objetivo === 'conversa'
    ? 'A chamada é "chama no WhatsApp (link na bio)", ligada à cena da peça (ex.: "Quer ver a sua agenda assim? Chama no WhatsApp, link na bio."). Nunca prometa o que acontece depois da conversa (demonstração, teste, prazo, convite na hora).'
    : 'A chamada pede para salvar OU para compartilhar o post, dizendo para quê (ex.: "Salva pra conferir no fechamento de sábado."): um verbo só (nunca "salva e compartilha").';
  const sugerido = ganchoSugerido(item.angulo);
  const notaSugerido = sugerido ? notaGancho(sugerido) : null;
  const avisoSugerido = sugerido && config && !checarGancho(sugerido, config.checagens.gancho).ok
    ? `\nO gancho sugerido no ângulo ("${sugerido}") tira nota ${notaSugerido.nota} na régua e REPROVA: não use; escreva outro para a mesma cena.`
    : sugerido ? '\nO gancho do ângulo é sugestão: pode melhorar, desde que passe na régua.' : '';
  return `Escreva a peça abaixo para o Instagram @mazzisystems.

Formato: ${item.tipo}: ${formato}
Ramo: ${item.ramo} · Objetivo: ${item.objetivo} · Tipo de conteúdo: ${item.conteudo}
Tema: ${item.tema}
Ângulo: ${item.angulo}
Fatos da base que pode usar (e só estes, com estas palavras; não amplie, não some funções, não prometa resultado):
${produto ? fatosDaPeca(item, produto) : item.fatos.join(', ')}${capas.length && ['carrossel', 'imagem'].includes(item.tipo) ? `\nAs últimas capas do feed usaram os layouts: ${capas.filter((c) => c.layout !== 'reel').slice(0, 3).map((c) => c.layout).join(', ')}. A capa desta peça usa OUTRO layout${capas.filter((c) => c.layout !== 'reel').slice(0, 2).length === 2 && capas.filter((c) => c.layout !== 'reel').slice(0, 2).every((c) => LAYOUTS[c.layout]?.familia !== 'cena') ? ', e precisa MOSTRAR uma cena (conversa, comparativo, cartao ou bilhete): as últimas foram só texto grande' : ''}.` : ''}
${item.tipo === 'stories' ? '' : `${chamada}\nA legenda começa com o gancho (primeira linha, até 125 caracteres), corpo curto, uma chamada, até 3 hashtags no fim.${item.tipo === 'reel' ? '' : '\n"alt_text" descreve a capa para quem não enxerga, em uma ou duas frases.'}`}
"gancho" é a frase da capa / do 1º quadro, IGUAL ao título dela: até 12 palavras, concreta, com algo em jogo, falando com o dono.${avisoSugerido}
${REGUA_GANCHO}
Antes de responder, chame a ferramenta medir_gancho UMA vez com 4 a 8 candidatos de gancho e use um que volte com passa=true${item.tipo === 'stories' ? '' : ' (meça também a 1ª linha da legenda)'}. Só chame de novo se nenhum passar.
Como a peça anda: a cena concreta do dono (um dia, uma pessoa, um objeto) → o que a tela da Mazzi mostra naquela cena (só o que está nos fatos acima) → a chamada. Uma ideia por tela.
Nenhuma tela promete o que vai acontecer ("não some mais", "a gente vê antes", "nunca mais falta", "você vai saber"): o juiz de fatos reprova como resultado inventado. Mostre a tela; quem conclui é o dono.
Valor em dinheiro (R$, "reais", "conto") só dentro de cartão, painel, celular ou contador de EXEMPLO; nunca na fala, no texto da tela, na legenda ou no título.${item.ramo === 'clinica' ? '\nClínica: fale da recepção, da agenda, da ficha, do orçamento; nunca do procedimento nem de resultado.' : item.ramo === 'restaurante' ? '\nRestaurante: fale do balcão, do caixa, da balança, do delivery, do estoque; palavra do dono (troco, sangria, quilo, motoboy, comanda).' : ''}
${REGUA_VOZ}${item.tipo === 'reel' ? '\nReel: antes de responder, passe as batidas completas na ferramenta medir_roteiro e só entregue com passa=true. Gancho falado com até 6 palavras (o limite é 3 s, e 7 palavras já encostam nele); nenhuma fala passa de 10 palavras.' : ''}
Interface de EXEMPLO (cartão, painel, celular, conversa) e cenas de módulos (hub, encaixe, órbita, lista) mostram SÓ o que os fatos acima dizem,
com os nomes deles (ex.: "Retornos", "Pacote 4/10"): nada de módulo de fora, frase de comparação dentro do cartão ("sem caderno")
nem mensagem de cliente pedindo a função. Na dúvida, um cartão com 2 ou 3 linhas da própria função.
Nunca escreva sobre o plano, o ângulo ou o próprio post ("o foco aqui é...", "neste post"): escreva só o que o dono vai ler.
${motivosAnteriores.length ? `\nA TENTATIVA ANTERIOR FOI REPROVADA. Corrija tudo isto (sugestão do editor NÃO libera função, ação ou registro que não está nos fatos acima: use a ideia da cena só com o que a base diz):\n${motivosAnteriores.map((m) => `- ${m}`).join('\n')}` : ''}
${anterior ? `\nSUA VERSÃO ANTERIOR está abaixo. Mantenha tudo o que não foi apontado e mude SÓ o necessário para resolver os pontos acima (reescrever tudo cria problemas novos):\n${JSON.stringify(anterior, null, 1)}` : ''}`;
}

/** Escreve a peça (uma tentativa). */
export async function escreverPeca({ raiz, item, produto, cerebro, config, motivosAnteriores, anterior, capas = [], usados = [], hoje }) {
  const conteudo = await cerebro.pedir({
    etapa: `escrever:${item.tipo}`,
    modelo: config.modelos.redator,
    sistema: `Você é o redator do Instagram da Mazzi Systems. Escreve como gente, em português do Brasil.\n\n${contextoMarca(raiz, produto)}`,
    prompt: promptPeca(item, motivosAnteriores, anterior, { capas, produto, config }),
    schema: CONTEUDO[item.tipo],
    effort: 'medium',
    // As réguas do gancho e da voz como ferramentas: o redator mede antes de entregar (turnos extras só para isso).
    // Estourar os turnos vira "erro na produção" e conta como tentativa (não aprova nada).
    ferramentas: [ferramentaGancho({ config, usados, hoje }), ferramentaTexto({ config, tipo: item.tipo }), ...(item.tipo === 'reel' ? [ferramentaRoteiro({ config })] : [])],
    maxTurns: item.tipo === 'reel' ? 10 : 8,
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
