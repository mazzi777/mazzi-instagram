// Plano da semana (SPEC 6.1). O Claude propõe; o código confere as regras e devolve os motivos se falhar.
import { z } from 'zod';
import { dataMais } from '../../publicar/validar.mjs';
import { HORARIOS, RAMOS } from '../lib/schemas.mjs';
import { contextoMarca } from './contexto.mjs';

const FEED = ['carrossel', 'imagem', 'reel'];

export const Plano = z.object({
  pecas: z.array(z.object({
    dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    horario: z.enum(HORARIOS),
    tipo: z.enum(['carrossel', 'imagem', 'reel', 'stories']),
    ramo: z.enum([...RAMOS, 'comum']),
    objetivo: z.enum(['conversa', 'alcance']),
    conteudo: z.enum(['dor', 'ensina', 'opiniao', 'convite']),
    tema: z.string().min(3).max(80),
    angulo: z.string().min(10).max(300),
    fatos: z.array(z.string()).min(1),
    exploracao: z.boolean(),
  })).min(4).max(12),
  porque: z.string().max(1200),
});

/** Regras que o código cobra do plano. Devolve a lista de motivos (vazia = plano aceito). */
export function regrasDoPlano(plano, { semana, config, produto, formatos, desde = semana }) {
  const m = [];
  const f = config.frequencia;
  const feed = plano.pecas.filter((p) => FEED.includes(p.tipo));
  const stories = plano.pecas.filter((p) => p.tipo === 'stories');
  const fim = dataMais(semana, 6);
  const noAr = new Set(produto.funcoes.filter((x) => x.status === 'no_ar').map((x) => x.id));

  if (feed.length < f.feedMin || feed.length > f.feedMax) m.push(`${feed.length} posts de feed (precisa de ${f.feedMin} a ${f.feedMax})`);
  const diasStories = new Set(stories.map((p) => p.dia));
  if (diasStories.size < f.storiesDiasMin || diasStories.size > f.storiesDiasMax) m.push(`stories em ${diasStories.size} dia(s) (precisa de ${f.storiesDiasMin} a ${f.storiesDiasMax})`);
  if (stories.length !== diasStories.size) m.push('no máximo um conjunto de stories por dia');
  for (const tipo of ['carrossel', 'reel']) {
    if (formatos.includes(tipo) && !feed.some((p) => p.tipo === tipo)) m.push(`falta pelo menos um ${tipo}`);
  }
  for (const p of plano.pecas) {
    if (!formatos.includes(p.tipo)) m.push(`formato ${p.tipo} ainda não está ligado (use: ${formatos.join(', ')})`);
    if (p.dia < desde || p.dia > fim) m.push(`${p.tema}: dia ${p.dia} fora do período ${desde} a ${fim}`);
    if (p.ramo !== 'comum' && !produto.ramos.includes(p.ramo)) m.push(`${p.tema}: ramo ${p.ramo} não está ativo`);
    for (const id of p.fatos) if (!noAr.has(id)) m.push(`${p.tema}: fato "${id}" não existe ou não está no ar`);
  }
  const porDia = Object.groupBy(feed, (p) => p.dia);
  for (const [dia, lista] of Object.entries(porDia)) if (lista.length > 1) m.push(`${lista.length} posts de feed no dia ${dia} (máximo 1)`);
  for (const ramo of produto.ramos) if (!feed.some((p) => p.ramo === ramo)) m.push(`nenhum post de feed para ${ramo}`);
  const conversa = feed.filter((p) => p.objetivo === 'conversa').length;
  const alvo = Math.round(feed.length * f.objetivoConversa);
  if (Math.abs(conversa - alvo) > 1) m.push(`${conversa} de ${feed.length} posts com objetivo conversa (alvo: ${alvo}, 70/30)`);
  return m;
}

/** Ids da agenda: feed em ordem de dia (A, B, C...), stories S1, S2... Pula os `ocupados` (semana assumida). */
export function idsDoPlano(plano, ocupados = new Set()) {
  const ordenado = [...plano.pecas].sort((a, b) => a.dia.localeCompare(b.dia) || a.horario.localeCompare(b.horario));
  let feed = 0;
  let st = 0;
  const proximo = (gerar) => { let id; do id = gerar(); while (ocupados.has(id)); return id; };
  return ordenado.map((p) => ({ ...p, id: p.tipo === 'stories' ? proximo(() => `S${++st}`) : proximo(() => String.fromCharCode(65 + feed++)) }));
}

export function promptPlano({ semana, config, formatos, estadoResumo, ganchosRecentes, novidades, desde = semana }) {
  const f = config.frequencia;
  return `Monte o plano do Instagram @mazzisystems para a semana de ${semana} (segunda) a ${dataMais(semana, 6)} (domingo).
${desde > semana ? `A semana já começou: todas as peças entre ${desde} e ${dataMais(semana, 6)} (nada antes de ${desde}).
` : ''}
Faixa: ${f.feedMin} a ${f.feedMax} posts de feed (formatos ligados: ${formatos.join(', ')}; pelo menos 1 carrossel${formatos.includes('reel') ? ' e 1 reel' : ''}),
no máximo 1 post de feed por dia, e stories em ${f.storiesDiasMin} a ${f.storiesDiasMax} dias.
Objetivo: ${Math.round(f.objetivoConversa * 100)}% dos posts de feed com objetivo "conversa" (levar ao WhatsApp) e o resto "alcance".
Os dois ramos ativos aparecem no feed. Cerca de ${Math.round(f.exploracao * 100)}% das peças são exploração (formato, tema ou horário pouco testado): marque exploracao=true.
Horários possíveis: ${HORARIOS.join(', ')}.
Cada peça cita em "fatos" os ids da base do produto que ela vai usar.

O QUE FUNCIONOU E O QUE FLOPOU (métricas):
${estadoResumo || 'Ainda sem dados suficientes: siga os padrões do guia.'}

GANCHOS DAS ÚLTIMAS 6 SEMANAS (não repita gancho nem ângulo):
${ganchosRecentes.map((g) => `- ${g.data}: ${g.gancho}`).join('\n') || '- nenhum'}
${novidades?.length ? `\nFUNÇÕES NOVAS NA BASE (boa hora para mostrar):\n${novidades.map((n) => `- ${n.id}: ${n.fato}`).join('\n')}` : ''}

Em "porque", explique em poucas linhas as escolhas da semana.`;
}

/** Pede o plano e cobra as regras (até 3 tentativas, passando os motivos de volta). */
export async function planejarSemana({ raiz, semana, config, produto, cerebro, formatos, estadoResumo = '', ganchosRecentes = [], novidades = [], desde = semana, ocupados = new Set() }) {
  const sistema = `Você é o estrategista de conteúdo do Instagram da Mazzi Systems.\n\n${contextoMarca(raiz, produto)}`;
  let prompt = promptPlano({ semana, config, formatos, estadoResumo, ganchosRecentes, novidades, desde });
  let motivos = [];
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const plano = await cerebro.pedir({ etapa: 'planejar', modelo: config.modelos.planejador, sistema, prompt, schema: Plano, effort: 'medium' });
    motivos = regrasDoPlano(plano, { semana, config, produto, formatos, desde });
    if (!motivos.length) return { plano: { ...plano, pecas: idsDoPlano(plano, ocupados) }, tentativas: tentativa };
    prompt = `${prompt}\n\nSEU PLANO ANTERIOR FOI RECUSADO. Corrija:\n${motivos.map((x) => `- ${x}`).join('\n')}`;
  }
  throw new Error(`plano recusado 3 vezes: ${motivos.join('; ')}`);
}
