// Redator (Sonnet) + as checagens de texto (G1–G5, G8). O redator recebe os motivos da tentativa anterior.
import { z } from 'zod';
import { checarGancho } from '../checagens/gancho.mjs';
import { checarLegenda } from '../checagens/legenda.mjs';
import { checarHumano } from '../checagens/humano.mjs';
import { checarNunca } from '../checagens/nunca.mjs';
import { checarFatos, resumoParaJuiz } from '../checagens/fatos.mjs';
import { checarRepeticao } from '../checagens/repeticao.mjs';
import { Afirmacoes, ProblemasMarca } from '../lib/schemas.mjs';
import { contextoMarca } from './contexto.mjs';

const Cartao = z.object({
  titulo: z.string().max(30).optional(),
  linhas: z.array(z.object({ rotulo: z.string().min(1).max(32), selo: z.string().max(22).optional(), tom: z.enum(['ok', 'aviso', 'ruim', 'neutro']).optional() })).min(1).max(3),
});
const Slide = z.object({
  tipo: z.enum(['capa', 'estaca', 'ideia', 'resumo', 'chamada']),
  titulo: z.string().min(2).max(70),
  destaque: z.string().max(25).optional(),
  texto: z.string().max(190).optional(),
  passo: z.number().int().min(1).max(9).optional(),
  itens: z.array(z.string().max(60)).max(5).optional(),
  cartao: Cartao.optional(),
});
const Quadro = z.object({ titulo: z.string().min(2).max(80), destaque: z.string().max(25).optional(), texto: z.string().max(140).optional(), cartao: Cartao.optional() });

export const CONTEUDO = {
  carrossel: z.object({ gancho: z.string().min(3).max(70), slides: z.array(Slide).min(5).max(8), legenda: z.string().min(20).max(2200), alt_text: z.string().min(10).max(1000) }),
  imagem: z.object({ gancho: z.string().min(3).max(70), titulo: z.string().min(2).max(70), destaque: z.string().max(25).optional(), texto: z.string().max(190).optional(), cartao: Cartao.optional(), legenda: z.string().min(20).max(2200), alt_text: z.string().min(10).max(1000) }),
  stories: z.object({ gancho: z.string().min(3).max(80), quadros: z.array(Quadro).min(4).max(5) }),
};

const cartaoTexto = (c) => (c ? `[CARTÃO EXEMPLO${c.titulo ? ` "${c.titulo}"` : ''}: ${c.linhas.map((l) => `${l.rotulo}${l.selo ? ` = ${l.selo}` : ''}`).join('; ')}]` : '');

/** Todo o texto da peça, na ordem em que aparece (com os cartões marcados como EXEMPLO para o juiz de fatos). */
export function textoDaPeca(tipo, c) {
  const partes = [];
  if (tipo === 'carrossel') for (const s of c.slides) partes.push([s.titulo, s.texto, ...(s.itens ?? []), cartaoTexto(s.cartao)].filter(Boolean).join('\n'));
  if (tipo === 'imagem') partes.push([c.titulo, c.texto, cartaoTexto(c.cartao)].filter(Boolean).join('\n'));
  if (tipo === 'stories') for (const q of c.quadros) partes.push([q.titulo, q.texto, cartaoTexto(q.cartao)].filter(Boolean).join('\n'));
  if (c.legenda) partes.push(`LEGENDA:\n${c.legenda}`);
  return partes.join('\n\n');
}

/** Texto corrido sem cartões (para as notas de estilo, que não devem ler rótulos de interface). */
const textoCorrido = (tipo, c) => (tipo === 'stories' ? c.quadros.map((q) => [q.titulo, q.texto].filter(Boolean).join('. ')).join('\n')
  : [c.legenda ?? ''].join('\n'));

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
    if (!legenda.detalhe.visivel.includes(conteudo.gancho.replace(/[.?!]+$/, '').slice(0, 30))) motivos.push('legenda: o gancho não está no começo da legenda');
  }
  // Stories: cada quadro é uma tela, então variação de tamanho entre frases não se aplica.
  const humano = checarHumano(textoCorrido(item.tipo, conteudo), { ...c.humano, semVariacao: item.tipo === 'stories' });
  notas.humano = humano.nota;
  motivos.push(...humano.motivos);
  const tudo = textoDaPeca(item.tipo, conteudo);
  const [nunca, fatos] = await Promise.all([checarNunca(tudo, { juiz: juizMarca, base: resumoParaJuiz(produto) }), checarFatos(tudo, { juiz: juizFatos, produto })]);
  motivos.push(...nunca.motivos, ...fatos.motivos);
  motivos.push(...checarRepeticao(conteudo.gancho, usados, { hoje, limite: c.repeticao.limite }).motivos);
  return { ok: motivos.length === 0, motivos, notas, fatos: fatos.fatos };
}

export function promptPeca(item, motivosAnteriores = []) {
  const formato = {
    carrossel: '5 a 8 slides: capa (gancho), estaca, ideias (uma por slide, com "passo" numerado se for sequência), resumo (itens) e chamada. Cartão de exemplo quando ajudar a ver a função.',
    imagem: 'um post de imagem única: título forte, texto curto e, se ajudar, um cartão de exemplo.',
    stories: '4 ou 5 quadros, uma ideia por quadro, falando com "você"; o 4º é o pedido ("me responde aqui nesse story" ou "chama no WhatsApp, link na bio").',
  }[item.tipo];
  const chamada = item.objetivo === 'conversa' ? 'A chamada é "chama no WhatsApp (link na bio)".' : 'A chamada pede para salvar ou compartilhar o post (uma só).';
  return `Escreva a peça abaixo para o Instagram @mazzisystems.

Formato: ${item.tipo}: ${formato}
Ramo: ${item.ramo} · Objetivo: ${item.objetivo} · Tipo de conteúdo: ${item.conteudo}
Tema: ${item.tema}
Ângulo: ${item.angulo}
Fatos da base que pode usar (e só estes): ${item.fatos.join(', ')}
${item.tipo === 'stories' ? '' : `${chamada}\nA legenda começa com o gancho (primeira linha, até 125 caracteres), corpo curto, uma chamada, até 3 hashtags no fim.\n"alt_text" descreve a capa para quem não enxerga, em uma ou duas frases.`}
"gancho" é a frase da capa / do 1º quadro: até 12 palavras, concreta, com algo em jogo, falando com o dono.
${motivosAnteriores.length ? `\nA TENTATIVA ANTERIOR FOI REPROVADA. Corrija tudo isto:\n${motivosAnteriores.map((m) => `- ${m}`).join('\n')}` : ''}`;
}

/** Escreve a peça (uma tentativa). */
export function escreverPeca({ raiz, item, produto, cerebro, config, motivosAnteriores }) {
  return cerebro.pedir({
    etapa: `escrever:${item.tipo}`,
    modelo: config.modelos.redator,
    sistema: `Você é o redator do Instagram da Mazzi Systems. Escreve como gente, em português do Brasil.\n\n${contextoMarca(raiz, produto)}`,
    prompt: promptPeca(item, motivosAnteriores),
    schema: CONTEUDO[item.tipo],
    effort: 'medium',
  });
}

export const juizesDeTexto = (cerebro) => ({ juizFatos: cerebro.juiz(Afirmacoes, 'juiz:fatos'), juizMarca: cerebro.juiz(ProblemasMarca, 'juiz:marca') });
