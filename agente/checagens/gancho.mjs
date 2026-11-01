// G3: nota do gancho. Porte para pt-BR do hookscore.py (skill ig-reel, licença MIT, Jake Schincariol).
// Cinco critérios de 0 a 100: tamanho, concretude, tensão, carga na frente e com quem fala.
// O próprio autor avisa: separa gancho bom de gancho ruim, mas NÃO prevê qual de dois bons vai melhor.
// Por isso é piso de qualidade; quem escolhe entre ganchos bons são as métricas.
//
// Adaptações para pt-BR e para a Mazzi (o resto segue o original):
// - objetos do dia a dia do dono contam como concretos (número inventado é proibido na marca);
// - pergunta direta conta como tensão e como fala com quem assiste (sujeito oculto é o normal em pt-BR).
import { palavras, minusculas, concretos, NUMERO_RE, PROPRIO_RE, NUMEROS_FALADOS, PALAVRAS_DINHEIRO, CONCRETOS,
  HASHTAG_RE, EMOJI_RE, limitar, notaGeral } from '../lib/texto.mjs';

// ~160 palavras por minuto na voz do Antonio.
const PALAVRAS_POR_SEGUNDO = 2.65;

const TENSAO = new Set([
  'não', 'nunca', 'ninguém', 'nada', 'nenhum', 'nenhuma', 'sem', 'perde', 'perdeu', 'perder', 'perdendo', 'perda',
  'sumiu', 'some', 'sumir', 'somem', 'falta', 'faltou', 'faltam', 'faltar', 'esqueceu', 'esquece', 'esquecer', 'erro',
  'errado', 'errou', 'prejuízo', 'custa', 'custou', 'caro', 'quebrou', 'furou', 'atrasou', 'atraso', 'antes', 'até',
  'mas', 'só', 'ainda', 'já', 'problema', 'risco', 'cuidado', 'pior', 'vence', 'venceu', 'vencendo', 'vencido',
  'desperdício', 'verdade', 'segredo', 'escondido', 'mentira', 'diferença', 'sobrou', 'sobra', 'cadê', 'parou',
  'acabou', 'acaba', 'jogou', 'fora', 'duas', 'vezes', 'dobrado', 'cobrou', 'cobrado', 'bagunça', 'confusão',
]);

const ABERTURAS_FRACAS = [
  'então', 'bom', 'olá', 'oi', 'e aí', 'gente', 'pessoal', 'galera', 'hoje', 'basicamente', 'sinceramente', 'olha',
  'escuta', 'vamos', 'bora', 'eu queria', 'eu quero', 'um dos', 'uma das', 'já pensou', 'você sabia', 'neste', 'nesse',
  'a coisa', 'muita gente', 'existe', 'existem', 'isso é', 'este é', 'esse é', 'esta é', 'essa é', 'quando se',
  'se você já', 'sabe', 'você sabe', 'deixa eu',
];

const IMPERATIVOS = new Set([
  'pare', 'para', 'copie', 'apague', 'tente', 'veja', 'leia', 'salve', 'salva', 'use', 'usa', 'monte', 'faça', 'faz',
  'escreva', 'mande', 'manda', 'comece', 'começa', 'nunca', 'sempre', 'não', 'confira', 'confere', 'chama', 'anota',
  'conta', 'abre', 'fecha', 'cobre', 'cobra', 'troca', 'esquece', 'larga', 'imagina',
]);

const ELIMINATORIOS = [
  [/^\s*(?:para|pare) de (?:rolar|passar)|^\s*não (?:passa|pula|role)/iu, 'Abre pedindo atenção ("para de rolar"). Quem pede atenção ainda não ganhou.'],
  [/(?:neste|nesse|no|deste|desse) (?:vídeo|reel)|vou (?:te )?mostrar|vou (?:te )?ensinar|hoje eu vou/iu, 'Preâmbulo de vídeo. Corte e abra no que interessa.'],
  [/^\s*(?:oi|olá|e aí|fala,? (?:galera|pessoal|gente)|bem-vind)/iu, 'Cumprimento. Ninguém foi ao feed para ser cumprimentado.'],
  [HASHTAG_RE, 'Hashtag no gancho. Hashtag vai no fim da legenda, se for.'],
  [EMOJI_RE, 'Emoji no gancho. No tamanho do gancho cabe palavra ou emoji, não os dois.'],
];

const CRITERIOS = ['TAMANHO', 'CONCRETO', 'TENSAO', 'NA_FRENTE', 'COM_QUEM'];

function tamanho(texto) {
  const n = palavras(texto).length;
  const segundos = n / PALAVRAS_POR_SEGUNDO;
  const chars = texto.trim().length;
  let nota = n >= 5 && n <= 12 ? 100 : n < 5 ? 100 - (5 - n) * 20 : 100 - (n - 12) * 11;
  if (chars > 60) nota -= 12; // duas linhas de texto grande na tela
  return [limitar(nota), `${n} palavras, ${chars} caracteres, ~${segundos.toFixed(1)} s falado (ideal: 5 a 12 palavras)`];
}

function concreto(texto) {
  const c = concretos(texto);
  const nota = c.total === 0 ? 15 : limitar(45 + c.total * 30);
  const achados = [...c.nums, ...c.proprios, ...c.falados, ...c.objetos].slice(0, 4).join(', ');
  return [nota, c.total ? `${c.total} marcador(es) concreto(s): ${achados}` : 'nada concreto: sem número, nome ou objeto do dia a dia'];
}

function tensao(texto) {
  const baixas = minusculas(palavras(texto));
  const marcas = [...new Set(baixas.filter((p) => TENSAO.has(p)))];
  if (/R\$\s?\d/.test(texto)) marcas.push('um preço');
  if (texto.includes('?')) marcas.push('pergunta');
  const nota = { 0: 20, 1: 70 }[marcas.length] ?? 100;
  return [nota, marcas.length ? `${marcas.length} marca(s) de tensão: ${marcas.slice(0, 4).join(', ')}` : 'nada em jogo nesta frase'];
}

function naFrente(texto) {
  const ps = palavras(texto);
  if (!ps.length) return [0, 'vazio'];
  const baixas = minusculas(ps);
  const abertura = baixas.slice(0, 3).join(' ');
  const fraca = ABERTURAS_FRACAS.find((f) => abertura === f || abertura.startsWith(`${f} `) || baixas[0] === f);
  const carga = baixas.findIndex((p, i) => TENSAO.has(p) || NUMEROS_FALADOS.has(p) || PALAVRAS_DINHEIRO.has(p)
    || CONCRETOS.has(p) || new RegExp(`^${NUMERO_RE.source}$`, 'iu').test(ps[i])
    || (i > 0 && new RegExp(`^${PROPRIO_RE.source}$`, 'u').test(ps[i])));
  let base;
  let onde;
  if (carga === -1) [base, onde] = [30, 'nenhuma palavra de peso na frase'];
  else if (carga <= 3) [base, onde] = [100, `carga na palavra ${carga + 1}`];
  else if (carga <= 6) [base, onde] = [70, `carga na palavra ${carga + 1}, dá para trazer para a frente`];
  else [base, onde] = [40, `carga na palavra ${carga + 1}, tarde demais`];
  return [limitar(base - (fraca ? 30 : 0)), onde + (fraca ? `; abertura fraca "${fraca}"` : '')];
}

function comQuem(texto) {
  const baixas = minusculas(palavras(texto));
  if (baixas.some((p) => ['você', 'vocês', 'seu', 'sua', 'seus', 'suas', 'te', 'cê', 'tu', 'contigo'].includes(p))) {
    return [100, 'fala com quem assiste'];
  }
  if (baixas.length && IMPERATIVOS.has(baixas[0])) return [90, `abre com ordem ("${baixas[0]}")`];
  if (texto.trim().endsWith('?')) return [80, 'pergunta direta a quem assiste'];
  if (baixas.some((p) => ['eu', 'meu', 'minha', 'nós', 'nosso', 'nossa', 'gente'].includes(p))) return [70, 'primeira pessoa, sem falar com ninguém'];
  return [35, 'terceira pessoa, ninguém na sala'];
}

/** Nota do gancho: { nota, veredito: FORTE|OK|FRACO, criterios: {NOME: [nota, detalhe]}, alertas[] }. */
export function notaGancho(texto) {
  const criterios = {
    TAMANHO: tamanho(texto), CONCRETO: concreto(texto), TENSAO: tensao(texto), NA_FRENTE: naFrente(texto), COM_QUEM: comQuem(texto),
  };
  const alertas = ELIMINATORIOS.filter(([re]) => new RegExp(re.source, re.flags.replace('g', '')).test(texto)).map(([, m]) => m);
  const notas = CRITERIOS.map((c) => criterios[c][0]);
  const nota = notaGeral(notas, alertas.length * 15);
  const veredito = nota >= 70 && Math.min(...notas) >= 55 && !alertas.length ? 'FORTE' : nota >= 50 ? 'OK' : 'FRACO';
  return { nota: Math.round(nota), minimo: Math.min(...notas), veredito, criterios, alertas };
}

/** Checagem G3 com os limites do config (calibrados): passa com nota >= notaMinima e nenhum critério < criterioMinimo. */
export function checarGancho(texto, { notaMinima = 70, criterioMinimo = 55 } = {}) {
  const r = notaGancho(texto);
  const motivos = [];
  if (r.nota < notaMinima) motivos.push(`gancho com nota ${r.nota} (mínimo ${notaMinima})`);
  for (const c of CRITERIOS) if (r.criterios[c][0] < criterioMinimo) motivos.push(`gancho fraco em ${c}: ${r.criterios[c][1]}`);
  motivos.push(...r.alertas);
  return { ok: motivos.length === 0, nota: r.nota, motivos, detalhe: r };
}
