// G9b: o editor. Última porta antes da agenda: um juiz separado (outro prompt, sem ver o raciocínio do redator) olha
// a peça PRONTA (imagens + texto) e as últimas peças do perfil, e dá nota de 0 a 10 em 5 critérios. Abaixo do mínimo
// em qualquer um, ou qualquer problema de ética médica (CFM) numa peça de clínica, reprova: o laço regera com os
// motivos e, esgotado, usa o banco reserva. Erro do juiz também reprova. Na dúvida, não posta.
import { z } from 'zod';

export const CRITERIOS_EDITOR = ['original', 'humano', 'marca', 'novidade', 'clareza'];

export const Curadoria = z.object({
  notas: z.object(Object.fromEntries(CRITERIOS_EDITOR.map((c) => [c, z.number().int().min(0).max(10)]))),
  cfm: z.array(z.string().min(3)),
  problemas: z.array(z.object({ criterio: z.enum(CRITERIOS_EDITOR), imagem: z.number().int().min(1).nullable(), motivo: z.string().min(3) })),
});

export const TAREFA_EDITOR = `Você é o editor-chefe do Instagram da Mazzi Systems (sistema de gestão para clínicas de estética/HOF e restaurantes pequenos).
Nada vai ao ar sem a sua nota, e não há humano depois de você. Seja exigente: prefira reprovar uma peça morna a deixar o perfil
com cara de template ou de texto de IA. Você recebe as imagens prontas (na ordem), o texto completo e as últimas peças do perfil.

Dê uma nota inteira de 0 a 10 para cada critério (7 = pode ir ao ar; 9 = peça que um bom social media assinaria):
- original: a peça tem uma ideia e uma composição próprias? Baixe a nota se ela poderia ser de qualquer sistema de gestão
  ("organize sua clínica", "gestão eficiente"), se é só frase genérica sobre fundo liso em todos os slides, se a imagem não ajuda a
  entender nada, ou se tudo parece o mesmo molde trocando o texto.
- humano: o texto soa como uma pessoa que entende do dia a dia do dono falando com ele? Baixe a nota por frase de efeito vazia,
  cadência de robô (todas as frases do mesmo tamanho), "não é só X, é Y", trincas ("rápido, fácil e seguro"), pergunta retórica
  de uma palavra ("O resultado?"), clichê de rede social ("chega de...", "diga adeus", "simples assim", "sem dor de cabeça",
  "praticidade", "vem com a gente"), emoji como marcador, ou palavras que o dono não usa.
- marca: está no tom da Mazzi (informal, direto, frases curtas, dor concreta + o que a tela mostra, uma chamada só) e no visual
  dela (grafite, papel claro, coral, Inter; manuscrito só em anotação de caderno; @mazzisystems visível)?
- novidade: comparando com AS ÚLTIMAS PEÇAS, ela traz algo novo (cena, ângulo, função, formato)? Mesma ideia com outras palavras,
  ou a mesma capa com outro texto, é nota baixa.
- clareza: dá para entender a peça em 3 segundos no celular? A capa diz do que se trata? Cada slide tem uma ideia? A ordem faz sentido?

Para cada nota abaixo de 8, escreva em "problemas" o que está fraco e COMO consertar, em uma frase concreta (diga a imagem quando der).

"cfm": só para peça de CLÍNICA (regras de publicidade médica, Resolução CFM 2.336/2023, e bom senso de ética). Liste cada trecho que:
promete ou insinua resultado de procedimento; mostra ou descreve paciente identificável, antes e depois de paciente ou caso real;
usa sensacionalismo, medo ou urgência; fala de preço, desconto ou condição de pagamento; usa superlativo ("o melhor", "o único") ou
garantia. Falar da GESTÃO da clínica (agenda, ficha, anamnese, termo, orçamento, estoque, lembrete) é permitido e não entra aqui.
Para restaurante ou peça comum, devolva "cfm" vazio.`;

/** Resumo das últimas peças para o critério "novidade". */
export function resumoRecentes(recentes = []) {
  if (!recentes.length) return '(ainda sem histórico)';
  return recentes.slice(0, 10).map((r) => `- ${r.dia} · ${r.tipo ?? ''} · ${r.tema ?? ''} · capa em "${r.layout ?? '?'}" · "${r.gancho}"`).join('\n');
}

/**
 * G9b. imagens: JPEGs da peça (slides, quadros ou quadros do reel). texto: textoDaPeca(). recentes: [{dia,tipo,tema,gancho,layout}].
 * Devolve { ok, motivos, notas }.
 */
export async function checarEditor(imagens, { juiz, texto, item, recentes = [], notaMinima = 7 } = {}) {
  if (!juiz) return { ok: false, motivos: ['editor indisponível: checagem incompleta'], notas: {} };
  const contexto = `PEÇA: ${item.tipo} · ramo ${item.ramo} · objetivo ${item.objetivo} · tipo de conteúdo ${item.conteudo ?? '?'}
Tema: ${item.tema}

TEXTO COMPLETO:
${texto}

AS ÚLTIMAS PEÇAS DO PERFIL (para o critério "novidade"):
${resumoRecentes(recentes)}`;
  try {
    const r = await juiz(TAREFA_EDITOR, contexto, imagens);
    const motivos = [];
    const baixas = CRITERIOS_EDITOR.filter((c) => r.notas[c] < notaMinima);
    for (const c of baixas) {
      const ditos = r.problemas.filter((p) => p.criterio === c);
      if (ditos.length) for (const p of ditos) motivos.push(`editor (${c} ${r.notas[c]}/10${p.imagem ? `, imagem ${p.imagem}` : ''}): ${p.motivo}`);
      else motivos.push(`editor (${c} ${r.notas[c]}/10): abaixo do mínimo ${notaMinima}`);
    }
    if (item.ramo === 'clinica') motivos.push(...r.cfm.map((t) => `ética médica (CFM): ${t}`));
    const notas = Object.fromEntries(CRITERIOS_EDITOR.map((c) => [`editor_${c}`, r.notas[c]]));
    return { ok: motivos.length === 0, motivos, notas };
  } catch (e) {
    if (e.parar) throw e; // limite, teto ou login: para a rodada, não reprova a peça
    return { ok: false, motivos: [`editor falhou (${e.message}): na dúvida, não posta`], notas: {} };
  }
}
