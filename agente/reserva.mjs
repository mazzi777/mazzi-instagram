// Banco reserva (evergreen) (SPEC 8.5): peças prontas e aprovadas, de temas que não envelhecem, para quando a peça
// da semana reprova. Antes de usar, revalida SEM o Claude (pode ser justamente o Claude que está fora):
// palavras proibidas, funções ainda no ar na base, arquivos e formato. Mesma peça só volta depois de 90 dias.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { validarPeca, dataMais } from '../publicar/validar.mjs';
import { palavrasProibidas } from './checagens/nunca.mjs';
import { checarRepeticao } from './checagens/repeticao.mjs';
import { ffprobe } from './ferramentas/binarios.mjs';

// SPEC 8.5: 2 de cada formato de feed + 2 conjuntos de stories. Abaixo de ALERTA peças válidas vira issue.
export const MINIMO = { carrossel: 2, reel: 2, stories: 2 };
export const ALERTA = 3;
export const TETO_BANCO = 16;
const INTERVALO_DIAS = 90;
// O que pode ocupar o lugar de quê (imagem única e carrossel têm a mesma medida).
const SUBSTITUTOS = { carrossel: ['carrossel', 'imagem'], imagem: ['imagem', 'carrossel'], reel: ['reel'], stories: ['stories'] };

export function lerReserva(raiz) {
  const base = path.join(raiz, 'reserva');
  if (!existsSync(base)) return [];
  return readdirSync(base).filter((d) => existsSync(path.join(base, d, 'peca.json')))
    .map((d) => ({ ...JSON.parse(readFileSync(path.join(base, d, 'peca.json'), 'utf8')), pasta: path.join(base, d) }));
}

/** Pode ser usada hoje? Devolve a lista de motivos (vazia = pode). */
export function motivosParaNaoUsar(r, { produto, hoje }) {
  const m = [];
  const ultimo = (r.usada_em ?? []).at(-1);
  if (ultimo && dataMais(ultimo, INTERVALO_DIAS) > hoje) m.push(`usada em ${ultimo} (volta só depois de ${INTERVALO_DIAS} dias)`);
  const noAr = new Set(produto.funcoes.filter((f) => f.status === 'no_ar').map((f) => f.id));
  for (const f of r.fatos ?? []) if (!noAr.has(f)) m.push(`a função ${f} não está mais no ar na base`);
  const texto = `${r.gancho}\n${r.legenda ?? ''}\n${r.tema ?? ''}\n${r.alt_text ?? ''}`;
  m.push(...palavrasProibidas(texto));
  // Aqui não tem o juiz do Claude: valor em reais fora do cartão de exemplo é conversa de preço.
  if (/R\$\s?\d|\d\s?reais(?![\p{L}])/iu.test(texto)) m.push('valor em reais no texto (a marca não fala de preço)');
  for (const a of r.arquivos) if (!existsSync(path.join(r.pasta, a))) m.push(`arquivo ${a} sumiu`);
  return m;
}

/** Contagem de peças utilizáveis por formato, e o que falta para o mínimo. */
export function situacao(raiz, { produto, hoje }) {
  const uteis = lerReserva(raiz).filter((r) => motivosParaNaoUsar(r, { produto, hoje }).length === 0);
  const por = Object.fromEntries(Object.keys(MINIMO).map((t) => [t, uteis.filter((r) => SUBSTITUTOS[t].includes(r.tipo)).length]));
  const faltam = Object.entries(MINIMO).flatMap(([t, min]) => Array(Math.max(0, min - por[t])).fill(t));
  // Peças no visual novo (guia/direcao-de-arte.md, 12/11/2026): o banco se renova até ter o mínimo delas; as antigas
  // continuam valendo como última opção.
  const novas = uteis.filter((r) => r.visual);
  // Conta as peças novas que existem (mesmo as em descanso de 90 dias): senão o banco reencheria toda semana.
  // Teto: com TETO_BANCO peças no total, não produz mais (o repositório não cresce sem fim). Alterna os formatos.
  const todasNovas = lerReserva(raiz).filter((r) => r.visual);
  const deCada = Object.entries(MINIMO).map(([t, min]) => [t, Math.max(0, min - todasNovas.filter((r) => SUBSTITUTOS[t].includes(r.tipo)).length)]);
  const faltamNovas = lerReserva(raiz).length >= TETO_BANCO ? [] : Array.from({ length: Math.max(...deCada.map(([, n]) => n), 0) }, (_, k) => deCada.filter(([, n]) => n > k).map(([t]) => t)).flat();
  return { total: uteis.length, por, faltam, faltamNovas };
}

/** Guarda no banco uma peça aprovada (copiando as mídias de `origem`). */
export function guardar(raiz, entrada, origem, { rid, hoje }) {
  const pasta = path.join(raiz, 'reserva', rid);
  mkdirSync(pasta, { recursive: true });
  for (const a of entrada.arquivos) copyFileSync(path.join(origem, a), path.join(pasta, a));
  const { id, dia, horario, origem: _o, tentativas, ...resto } = entrada;
  writeFileSync(path.join(pasta, 'peca.json'), `${JSON.stringify({ rid, criado_em: hoje, usada_em: [], ...resto }, null, 2)}\n`);
}

/**
 * Pega uma peça do banco para o lugar de `item` na semana: copia as mídias com os nomes da semana, revalida o
 * formato pelo publicador e marca o uso (no ensaio, `marcar: false`: o banco real não gasta a vez).
 * Devolve { origemId, entrada } ou null.
 */
export function criarReserva({ raiz, saida = raiz, produto, marcar = true, sondar }) {
  return {
    async pegar({ tipo, item, semana, hoje, capas = [], usados = [], recentes = [] }) {
      const pastaSemana = path.join(saida, 'semanas', semana);
      const candidatas = ordenarReserva(lerReserva(raiz).filter((r) => SUBSTITUTOS[tipo]?.includes(r.tipo) && motivosParaNaoUsar(r, { produto, hoje }).length === 0), { item, capas, usados, hoje, recentes });
      for (const r of candidatas) {
        mkdirSync(pastaSemana, { recursive: true });
        const arquivos = r.arquivos.map((a, i) => {
          const ext = path.extname(a);
          const nome = r.tipo === 'reel' ? `${semana}-${item.id}${ext}` : `${semana}-${item.id}-${String(i + 1).padStart(2, '0')}${ext}`;
          copyFileSync(path.join(r.pasta, a), path.join(pastaSemana, nome));
          return nome;
        });
        const { rid, criado_em, usada_em, pasta, ...dados } = r;
        const entrada = { ...dados, id: item.id, dia: item.dia, horario: item.horario, arquivos, origem: 'reserva' };
        if (r.tipo === 'reel' && !sondar) process.env.FFPROBE ??= ffprobe();
        if (validarPeca(pastaSemana, semana, entrada, { agente: true, ...(sondar ? { sondar } : {}) }).length) {
          for (const a of arquivos) rmSync(path.join(pastaSemana, a), { force: true });
          continue;
        }
        if (marcar) writeFileSync(path.join(r.pasta, 'peca.json'), `${JSON.stringify({ rid, criado_em, usada_em: [...(usada_em ?? []), hoje], ...dados }, null, 2)}\n`);
        return { origemId: rid, entrada };
      }
      return null;
    },
  };
}

// Direção de arte (guia/direcao-de-arte.md): peça antiga sem `visual` é do molde único (manchete no fundo escuro).
const capaDe = (r) => r.visual ?? (r.tipo === 'reel' ? { layout: 'reel', fundo: 'video' } : { layout: 'manchete', fundo: 'escuro' });
/** 1 se a capa da peça repete o layout ou o fundo de uma das 2 últimas capas do feed (vai para o fim da fila). */
export const repeteCapa = (r, capas) => (r.tipo !== 'stories' && capas.slice(0, 2).some((c) => c.layout === capaDe(r).layout || (c.fundo === capaDe(r).fundo && c.fundo !== 'video')) ? 1 : 0);
const novoVisual = (r) => (r.visual ? 1 : 0);

/**
 * Ordem de preferência das peças do banco: primeiro a que não repete gancho das últimas 6 semanas (G8) nem o tema ou as
 * funções das peças das últimas 3 semanas e da própria semana (`recentes`), depois a que não repete a capa das 2 últimas do feed, a de visual novo, a usada há mais tempo e a do mesmo ramo. Repetida não é
 * descartada: só entra se não houver outra (uma reserva parecida ainda é melhor que um horário vazio).
 */
export function ordenarReserva(candidatas, { item, capas = [], usados = [], hoje, recentes = [] }) {
  const temas = new Set(recentes.map((x) => x.tema));
  const fatos = new Set(recentes.flatMap((x) => x.fatos ?? []));
  // Chaves separadas, nesta ordem: gancho repetido (G8) pesa mais que tema repetido, que pesa mais que dividir funções
  // (funções como clin.agenda aparecem em quase toda peça: contam pela quantidade, não como sim/não).
  const gancho = (r) => (checarRepeticao(r.gancho, usados, { hoje }).ok ? 0 : 1);
  const tema = (r) => (temas.has(r.tema) ? 1 : 0);
  const funcoes = (r) => (r.fatos ?? []).filter((f) => fatos.has(f)).length;
  return [...candidatas].sort((a, b) => gancho(a) - gancho(b) || tema(a) - tema(b) || repeteCapa(a, capas) - repeteCapa(b, capas) || funcoes(a) - funcoes(b) || novoVisual(b) - novoVisual(a)
    || ((a.usada_em ?? []).at(-1) ?? '').localeCompare((b.usada_em ?? []).at(-1) ?? '') || (a.ramo === item.ramo ? -1 : 1));
}

/**
 * Pautas que não envelhecem, para encher o banco (o agente escreve a peça a partir delas).
 * Até 21/11/2026 eram 4 pautas genéricas ("a clínica num lugar só", "como entrar"...) escolhidas por
 * (tamanho do banco + k) % 4: com o banco parado em 8 peças, toda semana voltavam as mesmas 2 ("marca própria" e
 * "como entrar", que nem tem função na base que a comprove) e reprovavam pelos mesmos motivos. Agora cada pauta é
 * UMA função da base numa cena do dia a dia, separada por ramo, sem gancho pronto (o redator mede o dele).
 * Só entram pautas cujas funções estão no ar e cujo ramo está ativo (ramo sem base, como o spa, nunca entra).
 */
const PAUTAS = [
  // Clínica: as funções menos mostradas no feed (ver usoDasFuncoes no planejador).
  { chave: 'clin-retornos', ramo: 'clinica', conteudo: 'ensina', tema: 'a lista de quem deveria ter voltado', fatos: ['clin.retornos'],
    angulo: 'Segunda de manhã, a recepção abre a lista de retornos: quem deveria voltar e quando. Mostre a lista num cartão EXEMPLO com nomes de exemplo e a data do retorno. Feche com a chamada, sem prometer que a paciente volta.' },
  { chave: 'clin-pacotes', ramo: 'clinica', conteudo: 'dor', tema: 'em que sessão do pacote a paciente está', fatos: ['clin.pacotes', 'clin.agenda'],
    angulo: 'A paciente pergunta na recepção quantas sessões ainda tem e ninguém sabe sem abrir o caderno. Mostre o selo "Pacote 4/10" no horário da agenda (cartão EXEMPLO): cada atendimento desconta uma sessão.' },
  { chave: 'clin-comissoes', ramo: 'clinica', conteudo: 'dor', tema: 'a comissão do fim do mês', fatos: ['clin.comissoes'],
    angulo: 'Dia 30, a profissional pergunta quanto deu a comissão e a conta está no caderno. Mostre a comissão por profissional calculada pelos atendimentos (cartão EXEMPLO, valores só ali). Não prometa acabar com briga nem economizar tempo.' },
  { chave: 'clin-lote', ramo: 'clinica', conteudo: 'ensina', tema: 'o lote que vence primeiro', fatos: ['clin.estoque-lote'],
    angulo: 'Dois frascos iguais na gaveta, lotes diferentes. No atendimento a Mazzi usa o lote que vence antes e avisa do lote vencendo em 30 dias e do item acabando (cartão EXEMPLO). Fale só da gestão do estoque, nunca do procedimento.' },
  { chave: 'clin-alerta-ficha', ramo: 'clinica', conteudo: 'ensina', tema: 'o alerta de alergia na ficha', fatos: ['clin.anamnese-termo', 'clin.fichas'],
    angulo: 'A paciente respondeu na anamnese que tem alergia. No dia do atendimento o alerta está na ficha, com o termo assinado com data e hora. Mostre a ficha EXEMPLO com o alerta. Sem medo nem urgência sobre saúde.' },
  // Restaurante.
  { chave: 'rest-numero-faltou', ramo: 'restaurante', conteudo: 'dor', tema: 'o pedido de número que faltou', fatos: ['rest.delivery.teclado'],
    angulo: 'Sexta à noite, o motoboy sai com os pedidos 3 e 5. Cadê o 4? A Mazzi numera o pedido do dia e mostra qual número faltou (cartão EXEMPLO). Feche mostrando a tela e a chamada, sem prometer que nenhum pedido some.' },
  { chave: 'rest-ticket-balanca', ramo: 'restaurante', conteudo: 'dor', tema: 'o ticket da balança cobrado duas vezes', fatos: ['rest.balanca'],
    angulo: 'Hora do almoço, fila no caixa: o mesmo ticket da balança aparece de novo. O caixa lê o código de barras, o valor entra sozinho e ticket já cobrado é recusado (cartão EXEMPLO). Diga "ticket da balança", nunca "nota" sozinha.' },
  { chave: 'rest-quilo-dia', ramo: 'restaurante', conteudo: 'ensina', tema: 'o preço do quilo de cada dia da semana', fatos: ['rest.balanca'],
    angulo: 'Domingo o quilo tem outro preço e alguém sempre esquece de trocar a plaquinha. A balança tem o preço do quilo por dia da semana e uma tela para o cliente ver o peso. Valor só no cartão EXEMPLO.' },
  { chave: 'rest-bebida-minimo', ramo: 'restaurante', conteudo: 'ensina', tema: 'o estoque mínimo da bebida', fatos: ['rest.estoque'],
    angulo: 'Cada refrigerante vendido baixa sozinho do estoque, e o alerta de estoque mínimo aparece antes de acabar (cartão EXEMPLO com a bebida e a quantidade). Evite a fórmula "acabou e ninguém viu": a cena é a compra feita na hora certa.' },
  { chave: 'rest-diferenca-caixa', ramo: 'restaurante', conteudo: 'ensina', tema: 'a diferença que aparece no fechamento', fatos: ['rest.caixa'],
    angulo: 'Fim do dia: abertura, vendas, sangria e o fechamento mostram a diferença do caixa na tela (cartão EXEMPLO, valores só ali). Sem "caixa no caderno": a cena é o fechamento das 22h.' },
  { chave: 'rest-cargos', ramo: 'restaurante', conteudo: 'opiniao', tema: 'o que cada pessoa da equipe vê', fatos: ['comum.equipe-cargos'],
    angulo: 'Opinião: quem atende o balcão não precisa ver o relatório do mês. Cada pessoa vê só o que o cargo permite e as ações importantes ficam registradas (exatamente isso; nunca "tudo fica registrado").' },
];

export function pautasEvergreen(produto) {
  const noAr = new Set(produto.funcoes.filter((f) => f.status === 'no_ar').map((f) => f.id));
  return PAUTAS.filter((p) => (p.ramo === 'comum' || produto.ramos.includes(p.ramo)) && p.fatos.every((f) => noAr.has(f)));
}

/**
 * Escolhe `quantas` pautas para esta rodada: nunca o tema de uma peça que já está no banco, primeiro as funções que
 * menos aparecem no banco, alternando o ramo. O empate gira pela semana (`semente`): pauta que reprovou numa semana
 * não volta na seguinte só porque o banco não cresceu.
 */
export function escolherPautas(pautas, { banco = [], quantas = 1, semente = 0 } = {}) {
  const temas = banco.map((r) => r.tema ?? '');
  const fatosNoBanco = banco.flatMap((r) => r.fatos ?? []);
  const livres = pautas.filter((p) => !temas.some((t) => t.includes(p.tema)));
  const n = livres.length;
  const giro = (i) => ((i - semente) % n + n) % n;
  const ordem = livres.map((p, i) => ({ p, i, peso: p.fatos.filter((f) => fatosNoBanco.includes(f)).length }))
    .sort((a, b) => a.peso - b.peso || giro(a.i) - giro(b.i)).map((x) => x.p);
  const escolhidas = [];
  while (escolhidas.length < quantas && ordem.length) {
    const ultimo = escolhidas.at(-1)?.ramo;
    const k = Math.max(0, ordem.findIndex((p) => p.ramo !== ultimo));
    escolhidas.push(ordem.splice(k, 1)[0]);
  }
  return escolhidas;
}
