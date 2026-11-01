// Utilidades de texto em pt-BR usadas pelas checagens (porte das skills ig-*, que eram só para inglês).
// Palavra aqui é qualquer sequência de letras com acento, números e R$: "não" é uma palavra, não duas.

export const PALAVRA_RE = /R\$\s?\d[\d.,]*|[\p{L}\p{N}$%'’]+(?:-[\p{L}\p{N}]+)*/gu;
export const NUMERO_RE = /R\$\s?\d[\d.,]*|\b\d[\d.,]*(?:\s?(?:%|h\b|min\b|kg\b|g\b|dias?\b|semanas?\b|m[eê]s(?:es)?\b|anos?\b|horas?\b|minutos?\b))?/giu;
// Nome próprio: maiúscula que não abre frase (WhatsApp, Pix, Mazzi).
// (\b do JavaScript não entende acento, por isso as fronteiras são escritas à mão.)
export const PROPRIO_RE = /(?<![.!?:]\s)(?<!^)(?<![.!?:\p{L}\p{N}])\p{Lu}\p{Ll}{2,}[\p{L}\p{N}]*/gmu;
export const HASHTAG_RE = /(?:^|\s)(#[\p{L}\p{N}_]+)/gu;
export const EMOJI_RE = /\p{Extended_Pictographic}/gu;

export const NUMEROS_FALADOS = new Set([
  'zero', 'dois', 'duas', 'três', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove',
  'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa', 'cem', 'cento',
  'mil', 'milhão', 'milhões', 'bilhão', 'dúzia', 'metade', 'dobro', 'triplo', 'meia',
]);

export const PALAVRAS_DINHEIRO = new Set([
  'reais', 'real', 'centavos', 'lucro', 'prejuízo', 'faturamento', 'salário', 'aluguel', 'dinheiro', 'pix', 'troco', 'sinal',
]);

// Adaptação para a Mazzi: número inventado é proibido (só em cartão "EXEMPLO"), então o que deixa um texto
// concreto é o objeto do dia a dia do dono (o caixa, o paciente, o pedido). Sem isso, todo gancho honesto
// da marca seria "abstrato" para o script original.
export const CONCRETOS = new Set([
  'paciente', 'pacientes', 'cliente', 'clientes', 'caixa', 'pedido', 'pedidos', 'orçamento', 'orçamentos', 'agenda',
  'anamnese', 'termo', 'termos', 'tablet', 'balança', 'quilo', 'sangria', 'lote', 'lotes', 'validade', 'estoque',
  'bebida', 'bebidas', 'refrigerante', 'motoboy', 'delivery', 'marmita', 'marmitex', 'comanda', 'ficha', 'fichas',
  'whatsapp', 'papel', 'caderno', 'caneta', 'planilha', 'pacote', 'pacotes', 'sessão', 'sessões', 'comissão',
  'fornecedor', 'fornecedores', 'consulta', 'consultas', 'retorno', 'horário', 'horários', 'recepção', 'prato',
  'pratos', 'cartão', 'fila', 'almoço', 'cozinha', 'telefone', 'celular', 'foto', 'fotos', 'antes', 'depois',
  'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo', 'mês', 'semana', 'dia', 'fechamento',
  'dentista', 'equipe', 'impressora', 'nota', 'código', 'etiqueta', 'frasco', 'ampola', 'seringa',
]);

export function palavras(texto) {
  return (texto.replace(/(?<=\d)[.,](?=\d{3}\b)/g, '').match(PALAVRA_RE) ?? []);
}

export const minusculas = (lista) => lista.map((p) => p.toLowerCase().replace(/^['’]+|['’]+$/g, ''));

/** Sem acento e em minúsculas, para comparar ("Orçamento" == "orcamento"). */
export function dobrar(texto) {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function frases(texto) {
  return (texto.match(/[^.!?\n]+[.!?]*/g) ?? []).map((f) => f.trim()).filter((f) => f.split(/\s+/).length > 2);
}

export const limitar = (n) => Math.max(0, Math.min(100, n));

/** Mapeia `valor` para 0–100: `humano` vira 100, `maquina` vira 0. */
export function escala(valor, humano, maquina) {
  if (humano === maquina) return 50;
  return limitar(((valor - maquina) / (humano - maquina)) * 100);
}

export const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function desvioPadrao(xs) {
  const m = media(xs);
  return Math.sqrt(media(xs.map((x) => (x - m) ** 2)));
}

/** Marcadores concretos: números, nomes próprios, números por extenso, dinheiro e os objetos do dia a dia. */
export function concretos(texto) {
  const nums = (texto.match(NUMERO_RE) ?? []).map((n) => n.trim()).filter(Boolean);
  const proprios = [...new Set(texto.match(PROPRIO_RE) ?? [])];
  const baixas = minusculas(palavras(texto));
  const falados = baixas.filter((p) => NUMEROS_FALADOS.has(p) || PALAVRAS_DINHEIRO.has(p));
  const objetos = [...new Set(baixas.filter((p) => CONCRETOS.has(p)))];
  return { total: nums.length + proprios.length + falados.length + objetos.length, nums, proprios, falados, objetos };
}

/** Notas 0–100 de cada critério → nota geral (o mais fraco puxa para baixo, como nos scripts originais). */
export function notaGeral(notas, penalidade = 0) {
  return limitar(media(notas) * 0.6 + Math.min(...notas) * 0.4 - penalidade);
}
