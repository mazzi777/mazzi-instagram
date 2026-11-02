// Relatório semanal (SPEC 11): relatorios/AAAA-Www.md, para a Andressa ler se quiser (não precisa responder).
// Só junta o que já está gravado (registro, publicado, métricas, estratégia, uso); nenhum uso do Claude.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { dataMais } from '../publicar/validar.mjs';
import { publicados } from './metricas.mjs';

const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const lerJsonl = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** Linhas do registro com data entre `de` e `ate` (inclusive). */
export function registroDoPeriodo(saida, de, ate) {
  const pasta = path.join(saida, 'registro');
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta).filter((f) => f.endsWith('.jsonl') && f.slice(0, 10) >= de && f.slice(0, 10) <= ate).sort()
    .flatMap((f) => lerJsonl(path.join(pasta, f)));
}

function tamanho(caminho) {
  if (!existsSync(caminho)) return 0;
  const s = statSync(caminho);
  if (!s.isDirectory()) return s.size;
  return readdirSync(caminho).reduce((t, n) => t + tamanho(path.join(caminho, n)), 0);
}
const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

/**
 * Monta o texto. dados: { semanaIso, de, ate, raiz (publicações e métricas reais), saida (registro e uso),
 * estrategia: { mudancas, comNota } , reserva: { total, por, faltam }, gasto }.
 */
export function montarRelatorio({ semanaIso, de, ate, raiz, saida = raiz, estrategia = { mudancas: [], comNota: [] }, reserva, gasto }) {
  const reg = registroDoPeriodo(saida, de, ate);
  const saiu = publicados(raiz).filter((p) => p.dia >= de && p.dia <= ate);
  const porTipo = (t) => reg.filter((r) => r.tipo === t);
  const L = [`# Relatório da semana ${semanaIso} (${br(de)} a ${br(ate)})`, ''];

  L.push('## O que saiu', '');
  if (saiu.length) for (const p of saiu) L.push(`- ${br(p.dia)} ${p.tipo ?? 'post'}: ${p.info.gancho ?? p.info.tema ?? p.peca}${p.info.origem === 'reserva' ? ' (banco reserva)' : ''}`);
  else L.push('- Nada publicado neste período.');

  const aprovadas = porTipo('aprovada');
  const reservas = porTipo('reserva');
  const puladas = porTipo('pulada');
  L.push('', '## Produção', '',
    `- Aprovadas pelas checagens: ${aprovadas.length}.`,
    `- Trocadas por peça do banco reserva: ${reservas.length}${reservas.length ? ` (${reservas.map((r) => r.peca).join(', ')})` : ''}.`,
    `- Puladas (na dúvida, não posta): ${puladas.length}${puladas.length ? ` (${puladas.map((r) => r.peca).join(', ')})` : ''}.`);

  const reprovadas = porTipo('reprovada');
  if (reprovadas.length) {
    L.push('', '## O que reprovou e por quê', '');
    for (const r of reprovadas) L.push(`- ${r.peca}: ${(r.motivos ?? []).slice(0, 3).join(' | ') || 'sem motivo gravado'}`);
  }
  const erros = porTipo('erro');
  if (erros.length) {
    L.push('', '## Erros', '');
    for (const e of erros.slice(0, 8)) L.push(`- ${e.peca ?? 'agente'}: ${(e.motivos ?? []).join(' | ')}`);
  }

  L.push('', '## Melhores e piores posts', '');
  const medidos = estrategia.comNota ?? [];
  if (medidos.length < 8) {
    L.push(`Só ${medidos.length} post(s) com métrica até agora. Com tão pouco dado, qualquer "melhor" ou "pior" é sorte: o agente ainda não muda a estratégia por isso.`);
  } else {
    const ord = [...medidos].sort((a, b) => b.nota - a.nota);
    const linha = (p) => `- ${br(p.dia)} ${p.tipo} "${p.gancho}": nota ${p.nota.toFixed(2)} (alcance ${p.m.reach ?? '?'}, visitas ao perfil ${p.m.profile_visits ?? '?'}, compartilhamentos ${p.m.shares ?? '?'})`;
    L.push('Nota 1,00 = o normal do perfil para aquele formato.', '', 'Melhores:', ...ord.slice(0, 3).map(linha), '', 'Piores:', ...ord.slice(-3).reverse().map(linha));
  }

  L.push('', '## O que muda no plano', '');
  if (estrategia.mudancas?.length) for (const m of estrategia.mudancas) L.push(`- ${m.dimensao} "${m.valor}": peso ${m.antes} → ${m.depois} (${m.amostras} amostras).`);
  else L.push('- Nada mudou nos pesos (falta amostra ou a semana ficou dentro do normal).');

  const base = porTipo('base').map((b) => b.detalhe).filter((d) => d && !d.startsWith('adicionadas: nenhuma'));
  if (base.length) L.push('', '## Funções novas na base', '', ...base.map((d) => `- ${d}`));

  L.push('', '## Banco reserva', '');
  if (reserva) {
    L.push(`- Peças prontas e válidas: ${reserva.total} (carrossel/imagem ${reserva.por.carrossel}, reel ${reserva.por.reel}, stories ${reserva.por.stories}).`);
    if (reserva.faltam.length) L.push(`- Falta para o mínimo: ${reserva.faltam.join(', ')}. O agente repõe aos poucos no semanal.`);
  } else L.push('- Sem informação nesta rodada.');

  L.push('', '## Uso e tamanho', '',
    `- Uso da assinatura nesta semana: US$ ${(gasto ?? 0).toFixed(2)} equivalente (não é cobrança: é o quanto custaria na API).`,
    `- Mídias no repositório: ${mb(tamanho(path.join(raiz, 'semanas')) + tamanho(path.join(raiz, 'reserva')) + tamanho(path.join(raiz, 'ensaio')))} (o limite que a gente se deu é 1 GB).`);
  return `${L.join('\n')}\n`;
}

/** Grava relatorios/AAAA-Www.md com os 7 dias que terminam ontem. Devolve o caminho. */
export function gravarRelatorio({ saida, hoje, semanaIso, ...dados }) {
  const de = dataMais(hoje, -7);
  const ate = dataMais(hoje, -1);
  const f = path.join(saida, 'relatorios', `${semanaIso}.md`);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, montarRelatorio({ semanaIso, de, ate, saida, ...dados }));
  return f;
}
