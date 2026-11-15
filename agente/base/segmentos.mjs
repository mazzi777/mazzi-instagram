// Política central: quais ramos do aj-clinic o agente PODE DIVULGAR.
//
// Existir no código do aj-clinic (VERTICALS), ter migration, documentação ou seção no
// docs/NOVIDADES.md NÃO libera nada. Só libera um ramo a linha dele aqui com
// `divulgar: true`, num commit revisado (ver guia/segmentos.md). Ramo que não está
// nesta lista é tratado como bloqueado. Falha de leitura nunca libera: sem lista
// confiável, o agente fica com os ramos que já usava (que passaram por aqui).
//
// `termos`: como o ramo aparece em qualquer texto (peças, changelog, candidatas); barrados
//   enquanto o ramo estiver bloqueado, também dentro de hashtag ("#xyzbrasil").
// `sinais`: palavras típicas do ramo que outros ramos também podem usar ("massagem" em
//   estética). Valem SÓ no changelog e nas candidatas do Claude, nunca para reprovar peça.
// Comparação por palavra inteira, sem acento, sem maiúscula e sem caractere invisível.
// Este repositório é público: os motivos que vão para registro e issue não nomeiam o ramo.

/** @typedef {{ ramo: string | null, divulgar: boolean, termos: readonly string[], sinais?: readonly string[] }} Segmento */

const congelar = (s) => Object.freeze({ ...s, termos: Object.freeze([...(s.termos ?? [])]), sinais: Object.freeze([...(s.sinais ?? [])]) });

/** @type {Readonly<Record<string, Readonly<Segmento>>>} */
export const SEGMENTOS = Object.freeze({
  clinic: congelar({ ramo: 'clinica', divulgar: true, termos: ['clinica', 'clinicas'] }),
  restaurant: congelar({ ramo: 'restaurante', divulgar: true, termos: ['restaurante', 'restaurantes'] }),
  spa: congelar({ ramo: null, divulgar: false, termos: ['spa', 'spas', 'day spa', 'dayspa'], sinais: ['cabine', 'cabines', 'massagem', 'massagens', 'massoterapia', 'massoterapeuta'] }),
});

/** Motivo público (registro, issue, prompt de correção): não nomeia o ramo. */
export const MOTIVO_BLOQUEIO = 'cita um tipo de negócio que a Mazzi ainda não divulga: fale só de clínica e restaurante';

/**
 * Hashtag com o termo do ramo: igual ao termo ou termo + complemento típico de hashtag de setor
 * (#spabrasil, #dayspa, #bemestarspa). Não pega palavra que só começa ou termina igual (#spaghetti, #vespa).
 */
const HASHTAG_SUFIXOS = ['brasil', 'br', 'sp', 'rj', 'bh', 'poa', 'urbano', 'urbana', 'day', 'dia', 'life', 'care', 'terapia', 'time', 'lovers', 'experience', 'relax', 'bemestar'];
const HASHTAG_PREFIXOS = ['day', 'bemestar', 'meu', 'seu', 'nosso', 'nossa', 'melhor', 'visite', 'urban'];

// NFKC primeiro (largura total, ligaduras), depois sem acento e sem caractere invisível (\p{Cf}: zero-width etc.).
const normalizar = (s) => String(s ?? '').normalize('NFKC').normalize('NFD').replace(/[\p{M}\p{Cf}]/gu, '').toLowerCase();
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function regexPalavras(palavras) {
  if (!palavras.length) return null;
  const alt = palavras.map((t) => escapar(normalizar(t)).replace(/\s+/g, '\\s+')).join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'u');
}

/** Hashtags do texto (já normalizado) que começam ou terminam com um termo de uma palavra só. */
function hashtagComTermo(t, termos) {
  const simples = termos.map(normalizar).filter((x) => !/\s/.test(x));
  for (const m of t.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    const tag = m[1];
    for (const x of simples) {
      if (tag === x) return true;
      if (tag.startsWith(x) && HASHTAG_SUFIXOS.includes(tag.slice(x.length))) return true;
      if (tag.endsWith(x) && HASHTAG_PREFIXOS.includes(tag.slice(0, -x.length))) return true;
    }
  }
  return false;
}

/** Ramo do agente para uma vertical do aj-clinic, só se a política libera; senão null. */
export function ramoLiberado(vertical, politica = SEGMENTOS) {
  const s = Object.hasOwn(politica, vertical) ? politica[vertical] : undefined;
  return s && s.divulgar === true && typeof s.ramo === 'string' && s.ramo ? s.ramo : null;
}

/** null se a vertical está liberada; senão o motivo público (genérico) do bloqueio. */
export function motivoBloqueio(vertical, politica = SEGMENTOS) {
  return ramoLiberado(vertical, politica) ? null : MOTIVO_BLOQUEIO;
}

/**
 * Segmentos bloqueados citados no texto. `comSinais`: também as palavras típicas do ramo (só para
 * changelog e candidatas; peça não é reprovada por "massagem").
 */
export function segmentosBloqueadosNoTexto(texto, politica = SEGMENTOS, { comSinais = false } = {}) {
  const t = normalizar(texto);
  const achados = [];
  for (const [id, s] of Object.entries(politica)) {
    if (s.divulgar === true) continue;
    const termos = [...(s.termos ?? [])];
    const re = regexPalavras(comSinais ? [...termos, ...(s.sinais ?? [])] : termos);
    if ((re && re.test(t)) || hashtagComTermo(t, termos)) achados.push(id);
  }
  return achados;
}

/** Palavras depois de "ramo" que não nomeiam um ramo ("escolha do ramo no convite", "cada ramo com sua cor"). */
const GENERICAS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'por', 'para', 'o', 'a', 'os', 'as', 'no', 'na', 'nos', 'nas', 'com', 'em', 'ao', 'aos',
  'que', 'certo', 'sua', 'seu', 'cada', 'negocio', 'negocios', 'novo', 'novos', 'escolhido', 'atual', 'atividade', 'atividades', 'unidade', 'unidades', 'estetica']);

/** Sinais de "ainda não é para divulgar" no título ou no texto da seção: a seção sai inteira. */
const MARCADOR_LINHA = /^[\s>*_\-(\[]*(?:status\s*:[\s*_]*)?(?:ainda\s+)?(?:n[aã]o\s+(?:publicad[oa]s?|liberad[oa]s?|divulgar|anunciar)|em\s+breve|uso\s+interno)[\s)\]*_.!:]*$/iu;
const NAO_LIBERADA = /n[aã]o (?:publicad|liberad|divulga|anunci)|em breve|ainda n[aã]o (?:est[aá] )?(?:no ar|dispon[ií]vel|pronto|liberad|publicad)|uso interno|n[aã]o anunciar/iu;

const CABECALHO = /^\s{0,3}(#{1,6})/;
const SUBLINHADO = /^\s{0,3}(=+|-+)\s*$/;
const ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s/;

/**
 * Divide o texto da seção em blocos de Markdown, sem depender de como foi escrito:
 * - `cab`: título com # ou sublinhado (=== / ---), com o nível;
 * - `item`: item de lista com TUDO o que pertence a ele (linhas seguintes até linha em branco, outro
 *   item no mesmo nível ou acima, ou título), com a indentação;
 * - `par`: parágrafo (linhas seguidas sem linha em branco: texto, rótulo, citação com >, HTML);
 * - `vazio`: linha em branco.
 */
function blocos(texto) {
  const linhas = String(texto ?? '').split('\n');
  const out = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l.trim()) { out.push({ tipo: 'vazio', linhas: [l] }); continue; }
    const cab = l.match(CABECALHO);
    if (cab) { out.push({ tipo: 'cab', nivel: cab[1].length, linhas: [l] }); continue; }
    const item = l.match(ITEM);
    if (item) {
      const indent = item[1].replace(/\t/g, '    ').length;
      const bloco = { tipo: 'item', indent, linhas: [l] };
      while (i + 1 < linhas.length) {
        const prox = linhas[i + 1];
        if (!prox.trim() || CABECALHO.test(prox) || SUBLINHADO.test(prox)) break;
        const pi = prox.match(ITEM);
        if (pi) break; // subitem ou irmão: bloco próprio (o subitem herda pelo recuo)
        bloco.linhas.push(prox);
        i++;
      }
      out.push(bloco);
      continue;
    }
    const bloco = { tipo: 'par', indent: l.match(/^\s*/)[0].replace(/\t/g, '    ').length, linhas: [l] };
    while (i + 1 < linhas.length) {
      const prox = linhas[i + 1];
      if (!prox.trim() || CABECALHO.test(prox) || ITEM.test(prox)) break;
      if (SUBLINHADO.test(prox)) {
        // "Título\n---": o parágrafo era um título sublinhado.
        bloco.linhas.push(prox);
        bloco.tipo = 'cab';
        bloco.nivel = prox.trim().startsWith('=') ? 1 : 2;
        i++;
        break;
      }
      bloco.linhas.push(prox);
      i++;
    }
    out.push(bloco);
  }
  return out;
}

/**
 * Tira de uma seção tudo o que está NO ESCOPO de uma citação a ramo bloqueado (termo ou sinal):
 * - título que cita: sai até o próximo título do mesmo nível ou maior;
 * - parágrafo que cita (rótulo, frase de abertura, citação, HTML): sai ele e tudo o que vem depois
 *   (itens e parágrafos) até o próximo título ou até um parágrafo que fale de ramo liberado;
 * - item que cita: sai com tudo o que pertence a ele e com os subitens (recuo maior).
 * Devolve o texto que sobra e quantos blocos saíram.
 */
export function tirarEscopoBloqueado(texto, politica = SEGMENTOS) {
  const cita = (b) => segmentosBloqueadosNoTexto(b.linhas.join('\n'), politica, { comSinais: true }).length > 0;
  // Só o NOME do ramo abre escopo (sinal como "massagem modeladora" apara só o próprio bloco).
  const citaNome = (b) => segmentosBloqueadosNoTexto(b.linhas.join('\n'), politica).length > 0;
  const termosLiberados = Object.values(politica).filter((s) => s.divulgar === true).flatMap((s) => [...(s.termos ?? [])]).map(normalizar);
  const liberadoRe = regexPalavras(termosLiberados);
  const falaDeLiberado = (b) => Boolean(liberadoRe && liberadoRe.test(normalizar(b.linhas.join('\n'))));
  // Rótulo de ramo liberado: a primeira linha É o nome do ramo ("Na clínica:", "**Restaurante**",
  // "### Clínica", "Restaurante e clínica"), seguido de dois-pontos ou do fim da linha. Frase
  // comparativa ("Como na clínica, ...", "Clínica e o novo ramo também:") não é rótulo.
  const alt = termosLiberados.map((t) => escapar(t)).join('|');
  const rotuloRe = alt ? new RegExp(`^(?:(?:na|no|nas|nos|para|pra|em)\\s+)?(?:(?:a|o|as|os)\\s+)?(?:${alt})(?:\\s+(?:e|ou)\\s+(?:(?:a|o|as|os)\\s+)?(?:${alt}))*\\s*(?::|$)`, 'u') : null;
  const termosBloqueados = Object.values(politica).filter((s) => s.divulgar !== true).flatMap((s) => [...(s.termos ?? [])]).map(normalizar);
  const altB = termosBloqueados.map((t) => escapar(t).replace(/\s+/g, '\\s+')).join('|');
  const termo = `(?:(?:na|no|nas|nos|da|do|das|dos|para|pra|em)\\s+)?(?:(?:a|o|as|os)\\s+)?(?:${[alt, altB].filter(Boolean).join('|')})`;
  const enumRe = alt && altB ? new RegExp(`(?<![\\p{L}\\p{N}])${termo}(?:\\s*,\\s*${termo})*\\s*,?\\s+(?:e|ou)\\s+${termo}(?![\\p{L}\\p{N}])`, 'gu') : null;
  const reL = regexPalavras(termosLiberados);
  const reB = regexPalavras(termosBloqueados);
  /** O ramo bloqueado só aparece listado junto de ramos liberados ("vale para clínica, restaurante e spa"). */
  const soEnumeracaoMista = (b) => {
    if (!enumRe) return false;
    const t = normalizar(b.linhas.join(' '));
    const enums = [...t.matchAll(enumRe)].map((m) => m[0]).filter((e) => reL.test(e) && reB.test(e));
    if (!enums.length) return false;
    // Fora das enumerações mistas, o nome do ramo bloqueado não pode aparecer de novo.
    let resto = t;
    for (const e of enums) resto = resto.replace(e, ' ');
    return !reB.test(resto);
  };
  const ehRotuloLiberado = (b) => {
    const primeira = normalizar(b.linhas[0]).replace(/<[^>]*>/g, ' ').replace(/^[\s>#*_\-+]+|^\d+[.)]\s*/g, '').replace(/[*_]+/g, '').trim();
    return Boolean(rotuloRe && rotuloRe.test(primeira)) && !citaNome(b);
  };
  const fica = [];
  let removidos = 0;
  let nivelBloqueado = null;
  let escopoParagrafo = false;
  let itemBloqueado = null;
  // Item-rótulo do ramo bloqueado ("- Para o spa:"): se ele tem subitens, o escopo é só a subárvore;
  // se o que vem logo depois é um irmão no mesmo nível, os irmãos são dele (escopo de rótulo).
  let rotuloItem = null;
  for (const b of blocos(texto)) {
    if (rotuloItem && b.tipo !== 'vazio') {
      if (b.tipo === 'item' && b.indent > rotuloItem.indent) rotuloItem.teveFilhos = true;
      else {
        if (b.tipo === 'item' && b.indent === rotuloItem.indent && !rotuloItem.teveFilhos) escopoParagrafo = true;
        rotuloItem = null;
      }
    }
    if (b.tipo === 'vazio') { fica.push(...b.linhas); continue; }
    if (b.tipo === 'cab') {
      if (nivelBloqueado !== null && b.nivel > nivelBloqueado) { removidos++; continue; }
      // Rótulo do ramo bloqueado: o escopo dele só acaba num título que fale de ramo liberado.
      if (escopoParagrafo && !cita(b) && !ehRotuloLiberado(b)) { removidos++; continue; }
      nivelBloqueado = null;
      escopoParagrafo = false;
      itemBloqueado = null;
      if (cita(b)) { nivelBloqueado = b.nivel; removidos++; continue; }
      fica.push(...b.linhas);
      continue;
    }
    if (nivelBloqueado !== null) { removidos++; continue; }
    if (b.tipo === 'item') {
      if (itemBloqueado !== null && b.indent > itemBloqueado) { removidos++; continue; }
      itemBloqueado = null;
      if (escopoParagrafo && ehRotuloLiberado(b)) { escopoParagrafo = false; fica.push(...b.linhas); continue; }
      if (escopoParagrafo || cita(b)) {
        // Item que é rótulo do ramo bloqueado ("- Para o spa:"): abre escopo também para os itens irmãos.
        if (!escopoParagrafo && citaNome(b) && !soEnumeracaoMista(b) && /:\s*$/.test(b.linhas.join(' ').replace(/[*_]+/g, '').trim())) rotuloItem = { indent: b.indent, teveFilhos: false };
        itemBloqueado = b.indent;
        removidos++;
        continue;
      }
      fica.push(...b.linhas);
      continue;
    }
    // Parágrafo. Recuado mais que o item bloqueado (continuação depois de linha em branco, código
    // recuado): ainda é do item e sai junto.
    if (itemBloqueado !== null && b.indent > itemBloqueado) { removidos++; continue; }
    itemBloqueado = null;
    // Parágrafo que cita: sai. Abre escopo se diz o NOME do ramo, mesmo citando outro ramo ("Para o spa
    // (diferente da clínica):"), exceto quando o nome só aparece numa enumeração de ramos ("Valem para
    // clínica, restaurante e spa:"): aí sai sozinho e os itens seguintes são julgados um a um.
    if (cita(b)) { if (citaNome(b) && !soEnumeracaoMista(b)) escopoParagrafo = true; removidos++; continue; }
    if (escopoParagrafo && !ehRotuloLiberado(b)) { removidos++; continue; }
    escopoParagrafo = false;
    fica.push(...b.linhas);
  }
  return { texto: fica.join('\n').replace(/\n{3,}/g, '\n\n').trim(), removidos };
}

/**
 * Prepara as seções do NOVIDADES.md para o Claude, pelo contexto:
 * - seção cujo TÍTULO fala de ramo bloqueado (ou de "ramo X" que a política não libera), ou marcada
 *   como ainda não liberada, fica inteira de fora, mesmo que o corpo cite outros ramos;
 * - nas demais, sai só o que está no escopo de uma citação a ramo bloqueado (tirarEscopoBloqueado).
 * Seção que sai inteira não entra em `novidades_vistas`: quando o ramo for liberado, ela é lida.
 */
export function separarSecoes(secoes, politica = SEGMENTOS) {
  const liberadas = [];
  const bloqueadas = [];
  const ramosLiberados = new Set(Object.values(politica).filter((s) => s.divulgar === true).flatMap((s) => (s.termos ?? []).map(normalizar)));
  for (const s of secoes) {
    // No título só os termos: "Massagem modeladora na clínica" não tira a seção inteira (o corpo usa os sinais).
    const doTitulo = segmentosBloqueadosNoTexto(s.titulo, politica);
    // "ramo X" / "Ramo: X" no título com X fora dos ramos liberados também bloqueia (ramo novo ainda sem linha aqui).
    const ramoNomeado = normalizar(s.titulo).match(/(?<![\p{L}\p{N}])ramos?\s*[:\-–]?\s*(?:de\s+|do\s+|da\s+)?([\p{L}][\p{L}\s-]*)/u);
    const palavra = ramoNomeado ? ramoNomeado[1].trim().split(/\s+/)[0] : null;
    const nomeado = palavra && !GENERICAS.has(palavra) ? palavra : null;
    // No corpo, só uma linha que seja o próprio marcador ("(não publicado)", "Status: em breve"): frases comuns
    // de clínica ("a consulta é em breve") não tiram a seção.
    const naoLiberada = NAO_LIBERADA.test(s.titulo) || String(s.texto ?? '').split('\n').some((l) => MARCADOR_LINHA.test(l));
    if (doTitulo.length || (nomeado && !ramosLiberados.has(nomeado)) || naoLiberada) {
      bloqueadas.push({ titulo: s.titulo, motivo: naoLiberada && !doTitulo.length ? 'seção marcada como ainda não liberada' : MOTIVO_BLOQUEIO });
      continue;
    }
    const r = tirarEscopoBloqueado(s.texto, politica);
    // textoOriginal: só para a conferência de "não pronta" (aviso no trecho aparado); nunca vai ao Claude.
    liberadas.push({ ...s, texto: r.texto, textoOriginal: s.texto, linhasRemovidas: r.removidos });
  }
  return { liberadas, bloqueadas };
}
