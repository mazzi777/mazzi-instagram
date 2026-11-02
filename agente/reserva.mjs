// Banco reserva (evergreen) (SPEC 8.5): peças prontas e aprovadas, de temas que não envelhecem, para quando a peça
// da semana reprova. Antes de usar, revalida SEM o Claude (pode ser justamente o Claude que está fora):
// palavras proibidas, funções ainda no ar na base, arquivos e formato. Mesma peça só volta depois de 90 dias.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { validarPeca, dataMais } from '../publicar/validar.mjs';
import { palavrasProibidas } from './checagens/nunca.mjs';
import { ffprobe } from './ferramentas/binarios.mjs';

// SPEC 8.5: 2 de cada formato de feed + 2 conjuntos de stories. Abaixo de ALERTA peças válidas vira issue.
export const MINIMO = { carrossel: 2, reel: 2, stories: 2 };
export const ALERTA = 3;
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
  const texto = `${r.gancho}\n${r.legenda ?? ''}\n${r.tema ?? ''}`;
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
  return { total: uteis.length, por, faltam };
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
    async pegar({ tipo, item, semana, hoje }) {
      const pastaSemana = path.join(saida, 'semanas', semana);
      const candidatas = lerReserva(raiz)
        .filter((r) => SUBSTITUTOS[tipo]?.includes(r.tipo) && motivosParaNaoUsar(r, { produto, hoje }).length === 0)
        .sort((a, b) => ((a.usada_em ?? []).at(-1) ?? '').localeCompare((b.usada_em ?? []).at(-1) ?? '') || (a.ramo === item.ramo ? -1 : 1));
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

/** Pautas que não envelhecem, para encher o banco (o agente escreve a peça a partir delas). */
export function pautasEvergreen(produto) {
  const ramos = produto.ramos;
  const pautas = [
    { conteudo: 'convite', tema: 'o que é a Mazzi', angulo: 'Pra quem chegou agora: sistema de gestão online para clínica e restaurante pequenos, com o logo do negócio, por convite no WhatsApp.', fatos: ['comum.marca-propria', 'comum.celular'], ramo: 'comum' },
    { conteudo: 'convite', tema: 'como entrar', angulo: 'Não tem cadastro aberto: a pessoa chama no WhatsApp, a gente entende o negócio e manda o convite.', fatos: ['comum.celular'], ramo: 'comum' },
  ];
  if (ramos.includes('restaurante')) pautas.push({ conteudo: 'ensina', tema: 'o restaurante num lugar só', angulo: 'Caixa, delivery pelo teclado, balança e estoque no mesmo sistema, sem caderno.', fatos: ['rest.caixa', 'rest.delivery.teclado', 'rest.balanca', 'rest.estoque'], ramo: 'restaurante' });
  if (ramos.includes('clinica')) pautas.push({ conteudo: 'ensina', tema: 'a clínica num lugar só', angulo: 'Agenda, fichas com fotos, anamnese e termo assinados na tela, orçamento e lembrete de 1 toque.', fatos: ['clin.agenda', 'clin.fichas', 'clin.anamnese-termo', 'clin.orcamento', 'clin.lembrete-1-clique'], ramo: 'clinica' });
  return pautas;
}
