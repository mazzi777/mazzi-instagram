// G2: lista NUNCA e temas proibidos. Duas camadas:
// 1) palavras (rápido, sem Claude): as do validador do publicador + preço, saúde, política e polêmica;
// 2) juiz (Claude, outro prompt): o sentido, que palavra nenhuma pega (promessa velada, ataque a concorrente).
// Qualquer erro do juiz reprova. Na dúvida, não posta.
import { PROIBIDAS } from '../../publicar/validar.mjs';

export const PROIBIDAS_AGENTE = [
  ...PROIBIDAS,
  [/(?<![\p{L}])(?:gr[aá]tis|gratuit[ao]s?|de gra[cç]a|mensalidade|promo[cç](?:[aã]o|ões)|desconto|cupom|per[ií]odo de teste|teste gr[aá]tis|quanto custa)(?![\p{L}])/iu,
    'preço: a marca nunca fala de preço (nem "grátis"); o caminho é "chama no WhatsApp que a gente te explica"'],
  [/(?<![\p{L}])(?:rejuvenesc|elimina(?:r)? (?:rugas|gordura|manchas)|emagre[cç]|cura(?:r)?\b|sem dor(?! de cabe)|indolor|resultado(?:s)? garantid|garant(?:e|ia de) resultado|100% (?:seguro|eficaz|natural)|sem efeitos? colaterais?|aprovado pela anvisa)/iu,
    'afirmação de saúde ou resultado de procedimento (a Mazzi fala de gestão, não de procedimento)'],
  [/(?<![\p{L}])(?:lula|bolsonaro|elei[cç](?:[aã]o|ões)|candidat[oa] a|partido pol[ií]tico|stf|congresso|deputad[oa]|senador|governo federal|esquerda pol[ií]tica|direita pol[ií]tica|imposto[s]? (?:absurdo|abusivo))(?![\p{L}])/iu,
    'política (fora dos temas da marca)'],
  [/(?<![\p{L}])(?:religi[aã]o|aborto|vacina|guerra|pol[eê]mic[ao]|futebol|time do cora[cç][aã]o)(?![\p{L}])/iu,
    'tema polêmico ou fora do assunto'],
  [/(?<![\p{L}])(?:melhor (?:sistema|do brasil|do mercado)|[uú]nico (?:sistema|do mercado)|n[uú]mero 1|l[ií]der (?:do|de) mercado)(?![\p{L}])/iu,
    'superlativo que não dá para provar'],
  [/(?<![\p{L}])(?:odonto|dentista)[\p{L}]*(?:[^.!?\n]{0,40})(?:clareamento|implante|aparelho|sorriso perfeito)/iu,
    'promessa de procedimento odontológico'],
];

/** Só as palavras (camada 1). Devolve a lista de motivos. */
export function palavrasProibidas(texto) {
  return PROIBIDAS_AGENTE.filter(([re]) => new RegExp(re.source, re.flags.replace('g', '')).test(texto)).map(([, motivo]) => motivo);
}

export const TAREFA_JUIZ_NUNCA = `Você é o revisor de marca da Mazzi Systems (sistema de gestão para clínicas e restaurantes pequenos).
Leia a peça e aponte SÓ se ela faz uma destas coisas:
1. fala mal, compara ou ironiza um concorrente ou outro SISTEMA/SOFTWARE/EMPRESA (citado pelo nome ou reconhecível);
2. faz afirmação de saúde, de resultado clínico, estético ou odontológico, ou promete resultado de procedimento;
3. diz que o produto faz algo que NÃO está na base do produto abaixo, ou garante resultado de negócio em números ("você vai faturar 30% mais", "acaba com as faltas");
4. entra em política, religião, futebol ou tema polêmico;
5. usa urgência falsa ou ameaça exagerada ("última chance", "só hoje", "você vai quebrar", "está perdendo milhares por mês");
6. fala de preço, valor, "grátis", promoção ou desconto;
7. cita cliente real, depoimento, ou número/estatística apresentado como dado real (fora de cartão marcado EXEMPLO).

O que É PERMITIDO e não é problema (é o tom da marca):
- descrever uma dor concreta do dia a dia do dono ("paciente faltou", "o caixa não fechou", "a clínica perde a sessão", "fica sem graça");
- contrastar com papel, caderno, planilha, WhatsApp solto ou "de cabeça": isso não é concorrente;
- cenas do dia a dia contadas como exemplo ("a cliente jura que fez 5 sessões"), sem nome real e sem se apresentar como caso verdadeiro;
- convidar para o WhatsApp e falar do "convite" para entrar (é como se entra na Mazzi, não é oferta);
- descrever o que uma função da base faz ("a venda baixa a bebida do estoque", "o relatório mostra vendas menos compras").
Só marque o que claramente quebra uma regra. Responda só no formato pedido.`;

/**
 * G2 completo. `juiz(tarefa, texto)` devolve { problemas: [{regra, trecho, motivo}] } (já validado pelo cérebro).
 * Sem juiz, só a camada de palavras roda e a checagem fica marcada como incompleta (reprova).
 */
export async function checarNunca(texto, { juiz, base = '' } = {}) {
  const motivos = palavrasProibidas(texto);
  if (!juiz) return { ok: false, motivos: [...motivos, 'juiz de marca indisponível: checagem incompleta'], incompleta: true };
  try {
    const { problemas } = await juiz(base ? `${TAREFA_JUIZ_NUNCA}

${base}` : TAREFA_JUIZ_NUNCA, texto);
    motivos.push(...problemas.map((p) => `marca (regra ${p.regra}): ${p.motivo}${p.trecho ? ` em "${p.trecho}"` : ''}`));
  } catch (e) {
    if (e.parar) throw e; // limite, teto ou login: para a rodada, não reprova a peça
    motivos.push(`juiz de marca falhou (${e.message}): na dúvida, não posta`);
  }
  return { ok: motivos.length === 0, motivos };
}
