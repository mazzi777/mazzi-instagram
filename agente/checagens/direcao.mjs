// G9a: direção de arte conferida por código (sem Claude, antes de renderizar). Regras em guia/direcao-de-arte.md.
// 1) cada slide/quadro tem o que o layout dele precisa; 2) variedade dentro da peça; 3) a capa não repete as
// últimas capas do feed (o grid do perfil não vira um bloco só); 4) o código escolhe os fundos.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { LAYOUTS, layoutPadrao } from '../imagens/modelos.mjs';

/** As "telas" de uma peça (slides, quadros ou a imagem única), com o layout já resolvido. */
export function telasDaPeca(tipo, conteudo) {
  if (tipo === 'carrossel') return conteudo.slides.map((s) => ({ ...s, layout: layoutPadrao(s, 'carrossel') }));
  if (tipo === 'stories') return conteudo.quadros.map((q) => ({ ...q, layout: layoutPadrao(q, 'story') }));
  if (tipo === 'imagem') return [{ ...conteudo, layout: layoutPadrao(conteudo, 'imagem') }];
  return [];
}

/**
 * Visual das capas do feed já produzidas (mais recente primeiro): [{ dia, layout, fundo }].
 * Peça sem o campo `visual` (feita antes desta regra) era toda "manchete" no escuro.
 */
export function capasRecentes(pastas, { antesDe = '9999-99-99', limite = 6 } = {}) {
  const capas = [];
  for (const base of pastas) {
    const dir = path.join(base, 'semanas');
    if (!existsSync(dir)) continue;
    for (const s of readdirSync(dir)) {
      const f = path.join(dir, s, 'agenda.json');
      if (!existsSync(f)) continue;
      let agenda;
      try { agenda = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
      for (const p of agenda.pecas ?? []) {
        if (p.tipo === 'stories' || p.dia >= antesDe) continue;
        const v = p.visual ?? (p.tipo === 'reel' ? { layout: 'reel', fundo: 'video' } : { layout: 'manchete', fundo: 'escuro' });
        capas.push({ dia: p.dia, id: p.id, tipo: p.tipo, tema: p.tema, gancho: p.gancho, layout: v.layout, fundo: v.fundo });
      }
    }
  }
  const vistas = new Set();
  return capas.sort((a, b) => b.dia.localeCompare(a.dia))
    .filter((c) => { const k = `${c.dia}/${c.id}`; if (vistas.has(k)) return false; vistas.add(k); return true; })
    .slice(0, limite);
}

/**
 * Escolhe o fundo de cada tela: a capa foge do fundo das 2 últimas capas de imagem do feed; depois, o fundo não se repete
 * 3 vezes seguidas e o carrossel usa pelo menos 2 fundos. Sempre um fundo que o layout aceita. Determinístico.
 */
export function escolherFundos(telas, { capas = [], formato = 'carrossel' } = {}) {
  const ultimos = capas.filter((c) => c.fundo !== 'video').slice(0, 2).map((c) => c.fundo);
  const fundos = [];
  telas.forEach((t, i) => {
    const aceitos = LAYOUTS[t.layout]?.fundos ?? ['escuro'];
    let opcoes = aceitos;
    if (i === 0 && formato !== 'story') opcoes = aceitos.filter((f) => !ultimos.includes(f));
    if (i >= 2 && fundos[i - 1] === fundos[i - 2]) opcoes = opcoes.filter((f) => f !== fundos[i - 1]);
    // Coral é forte: no máximo 2 telas coral numa peça (a capa e a chamada, por exemplo).
    if (fundos.filter((f) => f === 'coral').length >= 2) opcoes = opcoes.filter((f) => f !== 'coral');
    if (!opcoes.length) opcoes = aceitos.filter((f) => f !== fundos[i - 1]);
    if (!opcoes.length) opcoes = aceitos;
    // Preferido do layout, mas alternando com a tela anterior quando dá.
    fundos.push(opcoes.find((f) => f !== fundos[i - 1]) ?? opcoes[0]);
  });
  if (formato === 'carrossel' && telas.length > 2 && new Set(fundos).size < 2) {
    for (let i = telas.length - 1; i > 0; i--) {
      const outro = (LAYOUTS[telas[i].layout]?.fundos ?? []).find((f) => f !== fundos[0]);
      if (outro) { fundos[i] = outro; break; }
    }
  }
  return fundos;
}

const palavras = (t = '') => t.trim().split(/\s+/).filter(Boolean).length;

/** Regras de direção de arte de uma peça escrita. Devolve a lista de motivos (vazia = ok). */
export function checarDirecao(tipo, conteudo, { capas = [] } = {}) {
  if (tipo === 'reel') return [];
  const telas = telasDaPeca(tipo, conteudo);
  const m = [];
  const nome = (i) => (tipo === 'carrossel' ? `slide ${i + 1}` : tipo === 'stories' ? `quadro ${i + 1}` : 'imagem');

  telas.forEach((t, i) => {
    const def = LAYOUTS[t.layout];
    if (!def) { m.push(`direção: ${nome(i)} com layout "${t.layout}" que não existe`); return; }
    if (def.precisa === 'passo' && !t.passo) m.push(`direção: ${nome(i)} usa "passo" sem número de passo (use passo só em sequência)`);
    if (def.precisa === 'conversa' && !(t.conversa?.length >= 2)) m.push(`direção: ${nome(i)} usa "conversa" sem 2 a 4 mensagens`);
    if (def.precisa === 'lados' && !(t.lados?.a?.itens?.length && t.lados?.b?.itens?.length)) m.push(`direção: ${nome(i)} usa "comparativo" sem os dois lados preenchidos`);
    if (def.precisa === 'cartao' && !t.cartao) m.push(`direção: ${nome(i)} usa "cartao" sem cartão`);
    if (def.precisa === 'anotacoes' && !(t.anotacoes?.length >= 2)) m.push(`direção: ${nome(i)} usa "bilhete" sem 2 a 4 anotações`);
    if (def.precisa === 'itens' && !(t.itens?.length >= 3)) m.push(`direção: ${nome(i)} usa "lista" sem 3 a 5 itens`);
    if (['pergunta', 'chamada'].includes(t.layout) && palavras(t.titulo) > 9) m.push(`direção: ${nome(i)} (${t.layout}) com título de ${palavras(t.titulo)} palavras: até 9, senão vira parede de texto`);
    if (palavras(t.texto) > 32) m.push(`direção: ${nome(i)} com ${palavras(t.texto)} palavras de texto (até 32; slide não é parágrafo)`);
  });

  const layouts = telas.map((t) => t.layout);
  const capa = telas[0];
  if (tipo === 'carrossel' || tipo === 'imagem') {
    if (capa && LAYOUTS[capa.layout] && !LAYOUTS[capa.layout].capa) m.push(`direção: o layout "${capa.layout}" não serve de capa (use ${Object.keys(LAYOUTS).filter((k) => LAYOUTS[k].capa).join(', ')})`);
    const ultimas = capas.filter((c) => c.layout !== 'reel').slice(0, 2).map((c) => c.layout);
    if (capa && ultimas.includes(capa.layout)) m.push(`direção: capa em "${capa.layout}" repete uma das 2 últimas capas do feed (${ultimas.join(', ')}); escolha outro layout de capa`);
    // No grid, "pergunta", "manchete" e "frase" são o mesmo quadrado de letra grande: depois de 2 capas só de texto, a próxima mostra uma cena.
    const familia = (l) => LAYOUTS[l]?.familia ?? 'texto';
    if (capa && LAYOUTS[capa.layout] && ultimas.length === 2 && ultimas.every((l) => familia(l) === 'texto') && familia(capa.layout) === 'texto') {
      m.push(`direção: as 2 últimas capas do feed foram só texto grande (${ultimas.join(', ')}); esta capa precisa mostrar uma cena (${Object.keys(LAYOUTS).filter((k) => LAYOUTS[k].capa && LAYOUTS[k].familia === 'cena').join(', ')})`);
    }
  }
  if (tipo === 'carrossel') {
    const distintos = new Set(layouts).size;
    const minimo = telas.length >= 7 ? 4 : 3;
    if (distintos < minimo) m.push(`direção: só ${distintos} layouts diferentes em ${telas.length} slides (mínimo ${minimo}); mude a composição de alguns slides`);
    layouts.forEach((l, i) => { if (i && l === layouts[i - 1] && l !== 'passo') m.push(`direção: layout "${l}" repetido nos slides ${i} e ${i + 1}`); });
    if (layouts.at(-1) !== 'chamada') m.push('direção: o último slide tem que ser o layout "chamada"');
  }
  if (tipo === 'stories') {
    if (new Set(layouts).size < 2) m.push('direção: os quadros dos stories usam um layout só; use pelo menos 2');
    if (!layouts.some((l) => LAYOUTS[l]?.familia === 'cena')) m.push('direção: nenhum quadro dos stories mostra uma cena (conversa, cartão, bilhete, comparativo ou lista); é só texto grande');
    layouts.forEach((l, i) => { if (i >= 2 && l === layouts[i - 1] && l === layouts[i - 2]) m.push(`direção: layout "${l}" 3 vezes seguidas nos stories (quadros ${i - 1} a ${i + 1})`); });
  }
  return m;
}

/**
 * Aplica os fundos escolhidos no conteúdo (cópia) e corrige sozinho o que não precisa do redator: destaque colorido
 * só nas 2 primeiras telas que o pediram (destaque em todo slide vira enfeite). Devolve { conteudo, visual } para a agenda.
 */
export function aplicarFundos(tipo, conteudo, { capas = [] } = {}) {
  const telas = telasDaPeca(tipo, conteudo);
  if (!telas.length) return { conteudo, visual: null };
  const fundos = escolherFundos(telas, { capas, formato: tipo === 'stories' ? 'story' : tipo });
  let destaques = 0;
  const pintar = (lista) => lista.map((t, i) => {
    const { destaque, ...resto } = t;
    const manter = destaque && destaques++ < 2;
    return { ...resto, ...(manter ? { destaque } : {}), layout: telas[i].layout, fundo: fundos[i] };
  });
  const novo = tipo === 'carrossel' ? { ...conteudo, slides: pintar(conteudo.slides) }
    : tipo === 'stories' ? { ...conteudo, quadros: pintar(conteudo.quadros) }
      : { ...conteudo, layout: telas[0].layout, fundo: fundos[0] };
  return { conteudo: novo, visual: { layout: telas[0].layout, fundo: fundos[0], layouts: telas.map((t) => t.layout) } };
}
