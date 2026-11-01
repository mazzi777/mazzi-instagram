// G7: o juiz olha as imagens prontas (slides, quadros ou 6 quadros do reel) e responde num checklist.
// Qualquer erro do juiz reprova. Na dúvida, não posta.
import { z } from 'zod';

export const ProblemasVisuais = z.object({
  problemas: z.array(z.object({ imagem: z.number().int().min(1), problema: z.string().min(3) })),
});

export const TAREFA_JUIZ_VISUAL = `Você confere as imagens de uma peça do Instagram da Mazzi Systems antes de ir ao ar.
As imagens vêm na ordem (1, 2, 3...). Aponte só problemas reais, um por linha, dizendo o número da imagem:
1. texto cortado, saindo da imagem ou encostado na borda;
2. texto sobreposto a outro texto ou ao cartão;
3. erro de português ou palavra quebrada;
4. texto pequeno demais ou com pouco contraste para ler no celular;
5. falta o @mazzisystems;
6. cartão de interface sem o selo "EXEMPLO";
7. qualquer coisa que pareça print de sistema real, dado de pessoa real, nome de cliente ou marca de outra empresa;
8. imagem vazia, quebrada ou com caractere estranho (quadrado, interrogação no lugar de acento);
9. pessoa com o rosto identificável em destaque no vídeo de fundo (pode mão, objeto, lugar, pessoa de costas ou desfocada);
10. legenda ou texto difícil de ler sobre o vídeo de fundo.
Se estiver tudo certo, devolva a lista vazia.`;

/** juiz(tarefa, texto, imagens) → { problemas } */
export async function checarVisual(imagens, { juiz, contexto = '' } = {}) {
  if (!juiz) return { ok: false, motivos: ['juiz visual indisponível: checagem incompleta'] };
  try {
    const { problemas } = await juiz(TAREFA_JUIZ_VISUAL, contexto || 'Confira as imagens.', imagens);
    const motivos = problemas.map((p) => `visual (imagem ${p.imagem}): ${p.problema}`);
    return { ok: motivos.length === 0, motivos };
  } catch (e) {
    if (e.parar) throw e; // limite, teto ou login: para a rodada, não reprova a peça
    return { ok: false, motivos: [`juiz visual falhou (${e.message}): na dúvida, não posta`] };
  }
}
