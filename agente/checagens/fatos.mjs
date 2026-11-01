// G1: fatos contra a base do produto. O juiz (Claude, outro prompt) só LISTA as afirmações da peça e liga
// cada uma a uma função da base; quem decide se pode é este código. Assim o modelo não tem como "aprovar"
// uma função que não existe: ou o id está na base e no ar, ou a peça reprova.
import { readFileSync } from 'node:fs';
import { Produto, validar } from '../lib/schemas.mjs';

export function lerProduto(arquivo = new URL('../base/produto.json', import.meta.url)) {
  return validar(Produto, JSON.parse(readFileSync(arquivo, 'utf8')), 'agente/base/produto.json');
}

/** Texto da base que vai para o juiz: só o que pode ser ligado (funções no ar, com id). */
export function resumoParaJuiz(produto) {
  const noAr = produto.funcoes.filter((f) => f.status === 'no_ar').map((f) => `- ${f.id}: ${f.fato}`);
  const proibidas = produto.funcoes.filter((f) => f.status === 'proibido').map((f) => `- ${f.id}: ${f.motivo}`);
  return `FUNÇÕES NO AR (só estas existem):\n${noAr.join('\n')}\n\nNÃO EXISTEM / PROIBIDAS:\n${proibidas.join('\n')}`;
}

export const TAREFA_JUIZ_FATOS = `Você confere fatos de uma peça do Instagram da Mazzi Systems.
Liste CADA afirmação concreta da peça sobre o produto, sobre preço, números, clientes, depoimentos ou resultados.
Para cada uma:
- "tipo": funcao | preco | numero | cliente | depoimento | resultado | promocao | opiniao | outro;
- "funcao_id": o id da função da base que comprova a afirmação, ou null se nenhuma comprova EXATAMENTE (não force: função parecida não serve);
- "em_exemplo": true só se o trecho está dentro de um cartão de interface marcado "EXEMPLO".
Como classificar:
- "funcao": o que o produto faz ou mostra ("o lembrete sai pronto pro WhatsApp", "você vê em qual sessão ela está", "o relatório mostra se sobrou");
- "resultado": promessa de resultado de negócio ou de procedimento, em geral com número ou garantia ("fatura 30% mais", "acaba com as faltas");
- "opiniao": dor do dia a dia do dono, cena de exemplo sem nome real, posição sobre gestão ("o caixa não fecha", "paciente falta");
- "outro": a chamada para o WhatsApp, o link na bio e o convite para entrar (é como se entra na Mazzi; NÃO é preço nem promoção);
- "preco"/"promocao": só quando fala de valor, "grátis", desconto ou oferta.
Não julgue se pode ou não; só liste. Responda só no formato pedido.`;

/** Regras do código sobre a lista do juiz. Devolve os motivos de reprovação. */
export function julgarAfirmacoes(afirmacoes, produto) {
  const porId = new Map(produto.funcoes.map((f) => [f.id, f]));
  const motivos = [];
  for (const a of afirmacoes) {
    const onde = `"${a.trecho}"`;
    switch (a.tipo) {
      case 'funcao': {
        const f = a.funcao_id ? porId.get(a.funcao_id) : null;
        if (!f) motivos.push(`fato: ${onde} fala de uma função que não está na base`);
        else if (f.status !== 'no_ar') motivos.push(`fato: ${onde} fala de ${f.id}, que é proibido (${f.motivo})`);
        break;
      }
      case 'numero':
        if (!a.em_exemplo) motivos.push(`fato: ${onde} tem número fora de cartão EXEMPLO`);
        break;
      case 'preco':
      case 'promocao':
        motivos.push(`fato: ${onde} fala de preço ou promoção (a marca nunca fala de preço)`);
        break;
      case 'cliente':
      case 'depoimento':
      case 'resultado':
        if (!a.em_exemplo) motivos.push(`fato: ${onde} é ${a.tipo} (inventar ${a.tipo} é proibido)`);
        else if (a.tipo !== 'resultado') motivos.push(`fato: ${onde} é ${a.tipo}, nem em cartão EXEMPLO`);
        break;
      default:
        break;
    }
  }
  return motivos;
}

/**
 * G1 completo. `juiz(tarefa, texto)` devolve { afirmacoes } (schema Afirmacoes, validado pelo cérebro).
 * Devolve também os ids usados, que vão para o campo "fatos" da peça na agenda.
 */
export async function checarFatos(texto, { juiz, produto = lerProduto() } = {}) {
  if (!juiz) return { ok: false, motivos: ['juiz de fatos indisponível: checagem incompleta'], fatos: [] };
  let afirmacoes;
  try {
    ({ afirmacoes } = await juiz(`${TAREFA_JUIZ_FATOS}\n\n${resumoParaJuiz(produto)}`, texto));
  } catch (e) {
    if (e.parar) throw e; // limite, teto ou login: para a rodada, não reprova a peça
    return { ok: false, motivos: [`juiz de fatos falhou (${e.message}): na dúvida, não posta`], fatos: [] };
  }
  const motivos = julgarAfirmacoes(afirmacoes, produto);
  const fatos = [...new Set(afirmacoes.filter((a) => a.tipo === 'funcao' && a.funcao_id).map((a) => a.funcao_id))];
  return { ok: motivos.length === 0, motivos, fatos, afirmacoes };
}
