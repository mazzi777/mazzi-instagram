// Revisão final (G7 visual + G9b editor) numa chamada só ao juiz: ele recebe a peça PRONTA (imagens + texto) e as
// últimas peças do perfil, e devolve (1) o checklist técnico de imagem do G7 e (2) as notas de editor de 0 a 10 em
// 5 critérios e os trechos com problema de ética médica (CFM). Uma chamada com imagens por tentativa, não duas.
// Reprova: qualquer problema visual; nota de editor abaixo do mínimo; trecho de CFM que exista de fato no texto de
// uma peça de clínica. O laço regera com os motivos e, esgotado, usa o banco reserva. Erro do juiz reprova.
import { z } from 'zod';
import { TAREFA_JUIZ_VISUAL } from './visual.mjs';
import { dobrar } from '../lib/texto.mjs';

export const CRITERIOS_EDITOR = ['original', 'humano', 'marca', 'novidade', 'clareza'];

export const RevisaoFinal = z.object({
  problemas: z.array(z.object({ imagem: z.number().int().min(1), problema: z.string().min(3) })),
  notas: z.object(Object.fromEntries(CRITERIOS_EDITOR.map((c) => [c, z.number().int().min(0).max(10)]))),
  sugestoes: z.array(z.object({ criterio: z.enum(CRITERIOS_EDITOR), imagem: z.number().int().min(1).nullable(), motivo: z.string().min(3) })),
  cfm: z.array(z.object({ trecho: z.string().min(3), motivo: z.string().min(3) })),
});

const RUBRICA_MARCA = {
  imagem: 'está no tom da Mazzi (informal, direto, frases curtas, dor concreta + o que a tela mostra, uma chamada só) e o layout escolhido combina com o que a tela precisa mostrar?',
  reel: 'está no tom da Mazzi (informal, direto, frases curtas, dor concreta + o que a tela mostra, uma chamada só) e as cenas escolhidas mostram o que a fala diz?',
};

export const tarefaEditor = (tipo) => `PARTE 2: EDITOR. Você também é o editor-chefe do Instagram da Mazzi Systems (gestão para clínicas de estética/HOF e
restaurantes pequenos). Não há humano depois de você. Julgue SÓ o que o redator escolhe: o texto, a ideia, o layout ou cena de cada tela
e o conteúdo dos cartões, conversas e listas. Cores, fundos, fonte e tamanho de letra são do sistema: não julgue nem sugira mudar.

Dê uma nota inteira de 0 a 10 a cada critério. Régua: 5 = morno, dá para postar mas ninguém lembraria; 7 = bom, um social media
competente assinaria; 9 = ótimo, específico e com cara de gente. Use a régua inteira (não dê 8 para tudo):
- original: tem uma ideia própria? Nota baixa se a peça serviria para qualquer sistema de gestão ("organize sua clínica", "gestão
  eficiente"), se toda tela é só frase genérica, ou se nenhuma tela ajuda a VER a cena (cartão, conversa, caderno, comparativo).
- humano: soa como gente que conhece o balcão e a recepção? Nota baixa por frase de efeito vazia, cadência de robô (frases todas
  do mesmo tamanho), "não é só X, é Y", trinca de adjetivos, pergunta retórica de uma palavra ("O resultado?"), clichê de rede social
  ("chega de", "diga adeus", "simples assim", "sem dor de cabeça", "praticidade"), emoji como marcador, palavra que o dono não usa.
- marca: ${RUBRICA_MARCA[tipo === 'reel' ? 'reel' : 'imagem']}
- novidade: comparando com AS ÚLTIMAS PEÇAS, traz cena, ângulo ou função nova? Mesma ideia com outras palavras é nota baixa.
- clareza: dá para entender em 3 segundos no celular? A capa diz do que se trata? Uma ideia por tela, numa ordem que faz sentido?

Em "sugestoes", para cada nota abaixo de 7, diga em uma frase concreta o que o redator deve mudar (e a imagem, quando der).

"cfm": só em peça de CLÍNICA (publicidade médica, Resolução CFM 2.336/2023). Liste SÓ trechos que existem de verdade no texto da
peça e que: prometem ou insinuam resultado de procedimento; mostram ou descrevem paciente identificável, caso real, antes e depois
de paciente; usam medo, urgência ou sensacionalismo sobre saúde; usam superlativo ("o melhor", "referência") ou garantia;
falam de preço, desconto ou condição de pagamento.
Em "trecho", copie as palavras exatas da peça. Falar da GESTÃO da clínica (agenda, ficha, anamnese, termo, alerta de alergia,
orçamento, estoque, lembrete) é permitido. Sem problema, ou peça de restaurante: "cfm" é uma lista VAZIA (nunca escreva
"nenhum problema" dentro dela).`;

/** Resumo das últimas peças para o critério "novidade". */
export function resumoRecentes(recentes = []) {
  if (!recentes.length) return '(sem histórico para comparar)';
  return recentes.slice(0, 10).map((r) => `- ${r.dia} · ${r.tipo ?? ''} · ${r.tema ?? ''} · capa "${r.layout ?? '?'}" · "${r.gancho ?? ''}"`).join('\n');
}

const normal = (t) => dobrar(t).replace(/[^a-z0-9]+/g, ' ').trim();
const fichas = (t) => normal(t).split(' ').filter((p) => p.length >= 3);

/**
 * O trecho de CFM está na peça? Igual, ou com pelo menos 80% das palavras (3+ letras) presentes no texto: o juiz às
 * vezes cola dois pedaços ou acrescenta "(slide 3)". "Nenhum problema" e afins não contam.
 */
export function trechoNaPeca(trecho, texto) {
  const t = normal(trecho);
  if (t.length < 3 || /^(?:nenhum|nada|sem (?:problema|item))/.test(t)) return false;
  if (normal(texto).includes(t)) return true;
  const doTexto = new Set(fichas(texto));
  const doTrecho = fichas(trecho).filter((p) => !/^(?:slide|imagem|quadro|tela)$/.test(p));
  return doTrecho.length >= 2 && doTrecho.filter((p) => doTexto.has(p)).length / doTrecho.length >= 0.8;
}

/**
 * Motivos de editor a partir das notas: reprova se algum critério ficar abaixo do piso (`minimoCriterio`, ou o piso
 * próprio do critério em `pisos`) ou se mais de `maxAbaixoDe7` critérios ficarem abaixo de 7 (calibrado no ensaio de
 * 12/11/2026, ver checagens/calibracao.md; clareza e humano têm piso 6: peça confusa ou com voz de robô não vai ao ar).
 */
export function motivosDoEditor(r, { minimoCriterio, maxAbaixoDe7, pisos = {} }) {
  const media = CRITERIOS_EDITOR.reduce((s, c) => s + r.notas[c], 0) / CRITERIOS_EDITOR.length;
  const baixos = CRITERIOS_EDITOR.filter((c) => r.notas[c] < Math.max(minimoCriterio, pisos[c] ?? 0));
  const mornos = CRITERIOS_EDITOR.filter((c) => r.notas[c] < 7);
  if (!baixos.length && mornos.length <= maxAbaixoDe7) return [];
  // Volta para o redator o que dá para consertar: as sugestões dos critérios mais fracos.
  const fracos = baixos.length ? baixos : mornos;
  const ditas = r.sugestoes.filter((s) => fracos.includes(s.criterio)).map((s) => `editor (${s.criterio} ${r.notas[s.criterio]}/10${s.imagem ? `, imagem ${s.imagem}` : ''}): ${s.motivo}`);
  const cabeca = `editor: peça abaixo do mínimo (${CRITERIOS_EDITOR.map((c) => `${c} ${r.notas[c]}`).join(', ')}; média ${media.toFixed(1)}; aceita no máximo ${maxAbaixoDe7} critério abaixo de 7 e nenhum abaixo de ${minimoCriterio})`;
  return [cabeca, ...ditas];
}

/**
 * G7 + G9b. imagens: JPEGs da peça (slides, quadros ou quadros do reel). texto: textoDaPeca(). recentes: [{dia,tipo,tema,gancho,layout}].
 * limites: { minimoCriterio, minimoMedia }. Devolve { ok, motivos, visuais, editor, notas }.
 */
export async function checarRevisao(imagens, { juiz, contexto = '', texto, item, recentes = [], limites }) {
  if (!juiz) return { ok: false, motivos: ['juiz da revisão final indisponível: checagem incompleta'], notas: {} };
  const tarefa = `PARTE 1: CONFERÊNCIA DAS IMAGENS (lista "problemas").\n${TAREFA_JUIZ_VISUAL}\n\n${tarefaEditor(item.tipo)}`;
  const pedido = `${contexto}
PEÇA: ${item.tipo} · ramo ${item.ramo} · objetivo ${item.objetivo} · tipo de conteúdo ${item.conteudo ?? '?'} · tema: ${item.tema}

TEXTO COMPLETO:
${texto}

AS ÚLTIMAS PEÇAS DO PERFIL (para "novidade"):
${resumoRecentes(recentes)}`;
  try {
    const r = await juiz(tarefa, pedido, imagens);
    const visuais = r.problemas.map((p) => `visual (imagem ${p.imagem}): ${p.problema}`);
    const editor = motivosDoEditor(r, limites);
    // CFM: conta o trecho que está na peça (igual ou quase); "nenhum problema" e invenção do juiz não reprovam,
    // mas o número de descartados fica no registro (notas.cfm_descartados) para conferir depois.
    const lidos = item.ramo === 'clinica' ? r.cfm : [];
    const validos = lidos.filter((c) => trechoNaPeca(c.trecho, texto));
    const cfm = validos.map((c) => `ética médica (CFM) em "${c.trecho}": ${c.motivo}`);
    const notas = { ...Object.fromEntries(CRITERIOS_EDITOR.map((c) => [`editor_${c}`, r.notas[c]])), ...(lidos.length > validos.length ? { cfm_descartados: lidos.length - validos.length } : {}) };
    const motivos = [...visuais, ...editor, ...cfm];
    return { ok: motivos.length === 0, motivos, visuais, editor: [...editor, ...cfm], notas };
  } catch (e) {
    if (e.parar) throw e; // limite, teto ou login: para a rodada, não reprova a peça
    return { ok: false, motivos: [`revisão final falhou (${e.message}): na dúvida, não posta`], notas: {} };
  }
}
