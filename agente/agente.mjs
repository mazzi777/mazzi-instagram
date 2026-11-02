// Porta de entrada do agente (chamada pelos workflows).
//   node agente/agente.mjs semanal   planeja e produz a semana seguinte (sábado 02:17)
//   node agente/agente.mjs diario    métricas, produz o que falta para os próximos 3 dias e confere os tokens (03:17)
//   node agente/agente.mjs stories   só as métricas dos stories do dia, antes de sumirem (20:10)
// Ambiente: CLAUDE_CODE_OAUTH_TOKEN, META_TOKEN e IG_USER_ID (métricas), AGENTE_PAUSADO, AGENTE_MODO (ensaio | so_reserva),
//           AJ_CLINIC_DIR (clone do aj-clinic), AGENTE_SEMANA (opcional: segunda futura que o semanal produz, para adiantar),
//           AGENTE_HOJE (opcional, AAAA-MM-DD, só para testar a produção: as métricas sempre usam a data real).
// Saída: commit fica com o workflow. Erros vão para agente/erros.md (o workflow abre a issue, como o publicador).
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hojeEmSaoPaulo } from '../publicar/publicar.mjs';
import { dataMais } from '../publicar/validar.mjs';
import { criarCerebro, semanaIso, ErroToken, ErroLimite, ErroTeto } from './cerebro.mjs';
import { lerProduto } from './checagens/fatos.mjs';
import { lerGanchosUsados } from './checagens/repeticao.mjs';
import { atualizarBase } from './base/atualizar.mjs';
import { planejarSemana } from './etapas/planejar.mjs';
import { criarRegistro, produzirPendentes, cobrirComReserva, encherReserva, agendaAlheia, assumirSemana, revalidarAgenda, FORMATOS_PRODUZIDOS } from './orquestrador.mjs';
import { criarMeta, coletar } from './metricas.mjs';
import { atualizarEstrategia } from './estrategia.mjs';
import { criarReserva, situacao, lerReserva, ALERTA } from './reserva.mjs';
import { gravarRelatorio } from './relatorio.mjs';
import { Produto, validar } from './lib/schemas.mjs';
import { z } from 'zod';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const segundaSeguinte = (hoje) => {
  const dia = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  return dataMais(hoje, ((8 - dia) % 7) || 7);
};
export const segundaDa = (hoje) => dataMais(hoje, -((new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7));

/**
 * Semana do semanal: AGENTE_SEMANA (na mão) ou a segunda seguinte. Devolve { semana, desde }.
 * A semana em curso só se pedida na mão, e aí o plano vai de amanhã a domingo. Semana passada, nunca.
 */
export function semanaAlvo(hoje, pedida) {
  const semana = pedida || segundaSeguinte(hoje);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana) || segundaDa(semana) !== semana) throw new Error(`AGENTE_SEMANA ${semana} não é uma segunda-feira (AAAA-MM-DD)`);
  if (semana > hoje) return { semana, desde: semana };
  const desde = dataMais(hoje, 1);
  if (pedida && semana === segundaDa(hoje) && desde <= dataMais(semana, 6)) return { semana, desde };
  throw new Error(`a semana ${semana} já começou: só dá para assumir a semana em curso pedindo na mão, até sábado`);
}

/** Ganchos das agendas do agente (além do guia/log.md), para a checagem de repetição. */
export function ganchosDasAgendas(saida) {
  const base = path.join(saida, 'semanas');
  if (!existsSync(base)) return [];
  return readdirSync(base).flatMap((s) => {
    const f = path.join(base, s, 'agenda.json');
    if (!existsSync(f)) return [];
    try { return JSON.parse(readFileSync(f, 'utf8')).pecas.filter((p) => p.gancho).map((p) => ({ data: p.dia, gancho: p.gancho })); } catch { return []; }
  });
}

/** Avisos sobre os tokens (sem chamar nada): token do Claude perto de vencer. */
export function avisosDeToken(config, hoje) {
  const { claudeCriadoEm, claudeValidadeDias, avisarAntesDias } = config.tokens;
  const vence = dataMais(claudeCriadoEm, claudeValidadeDias);
  const faltam = Math.round((Date.parse(`${vence}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000);
  return faltam <= avisarAntesDias ? [{ peca: 'token do Claude', mensagem: `o token da assinatura vence em ${faltam} dia(s) (${vence}). Rode "claude setup-token" e grave em CLAUDE_CODE_OAUTH_TOKEN; depois atualize tokens.claudeCriadoEm em agente/config.json.` }] : [];
}

async function atualizarBaseSePuder({ produto, cerebro, hoje, registrar }) {
  const dir = process.env.AJ_CLINIC_DIR;
  if (!dir || !existsSync(path.join(dir, 'docs', 'NOVIDADES.md'))) return { produto, avisos: ['aj-clinic não foi clonado: base do produto não foi atualizada nesta rodada'] };
  const r = await atualizarBase({
    produto, hoje,
    novidadesMd: readFileSync(path.join(dir, 'docs', 'NOVIDADES.md'), 'utf8'),
    permissionsTs: readFileSync(path.join(dir, 'packages', 'shared', 'src', 'permissions.ts'), 'utf8'),
    extrair: (tarefa, texto) => cerebro.pedir({
      etapa: 'base', modelo: cerebro.config.modelos.juiz, sistema: tarefa, prompt: texto,
      schema: z.object({ funcoes: z.array(z.object({ id: z.string(), ramo: z.string(), fato: z.string(), fonte: z.string() })) }), effort: 'low',
    }),
  });
  writeFileSync(path.join(RAIZ, 'agente', 'base', 'produto.json'), `${JSON.stringify(validar(Produto, r.produto), null, 2)}\n`);
  registrar({ tipo: 'base', detalhe: `adicionadas: ${r.adicionadas.map((a) => a.id).join(', ') || 'nenhuma'}; recusadas: ${r.recusadas.length}; ramos sem base: ${r.ramosSemBase.join(', ') || 'nenhum'}` });
  return { produto: r.produto, avisos: [], novidades: r.adicionadas };
}

/** Coleta as métricas (só leitura na Meta). Erro de token vira aviso; o resto fica no log (tenta de novo amanhã). */
async function coletarMetricas({ env, hoje, modo, log, erros, fetch }) {
  if (!env.META_TOKEN || !env.IG_USER_ID) { log.push('Sem META_TOKEN/IG_USER_ID: métricas não coletadas.'); return; }
  try {
    const meta = criarMeta({ token: env.META_TOKEN, igUserId: env.IG_USER_ID, ...(fetch ? { fetch } : {}) });
    const r = await coletar({ raiz: RAIZ, hoje, meta, modo, log: (l) => log.push(l) });
    for (const e of r.erros.slice(0, 5)) log.push(`  métrica: ${e}`);
  } catch (e) {
    if (e.chave || e.codigo === 190) erros.push({ peca: 'token da Meta', mensagem: `a Meta recusou a chave ao ler as métricas (${e.message}). Ela precisa ser refeita no Gerenciador de Negócios, com a permissão instagram_manage_insights.` });
    else log.push(`Métricas falharam nesta rodada: ${e.message}`);
  }
}

export const PERMISSOES_META = ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights'];

/** SPEC 9: conferência semanal da chave da Meta (o publicador já confere se ela abre a conta; aqui, as permissões). */
async function conferirChaveMeta({ env, erros, log, fetch }) {
  if (!env.META_TOKEN || !env.IG_USER_ID) return;
  try {
    const tem = await criarMeta({ token: env.META_TOKEN, igUserId: env.IG_USER_ID, ...(fetch ? { fetch } : {}) }).permissoes();
    const faltam = PERMISSOES_META.filter((p) => !tem.includes(p));
    if (faltam.length) erros.push({ peca: 'token da Meta', mensagem: `a chave da Meta perdeu a(s) permissão(ões) ${faltam.join(', ')}. Ela precisa ser refeita no Gerenciador de Negócios.` });
    else log.push('Chave da Meta: permissões OK.');
  } catch (e) {
    if (e.chave || e.codigo === 190) erros.push({ peca: 'token da Meta', mensagem: `a Meta recusou a chave (${e.message}). Ela precisa ser refeita no Gerenciador de Negócios.` });
    else log.push(`Conferência da chave da Meta falhou nesta rodada: ${e.message}`);
  }
}

/** Avisos do banco reserva: poucas peças válidas (depois que ele já encheu uma vez) ou 2 horários seguidos sem post. */
export function avisosDaReserva({ saida, hoje, produto, banco = RAIZ }) {
  const avisos = [];
  const st = situacao(banco, { produto, hoje });
  if (st.total < ALERTA && lerReserva(banco).length >= 6) avisos.push({ peca: 'banco reserva', mensagem: `só ${st.total} peça(s) válida(s) no banco reserva (mínimo ${ALERTA}). Se o Claude parar, horários vão ficar sem post.` });
  const itens = [segundaDa(hoje), dataMais(segundaDa(hoje), 7)].flatMap((s) => {
    const f = path.join(saida, 'semanas', s, 'plano.json');
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).pecas.map((p) => ({ ...p, semana: s })) : [];
  }).filter((p) => p.dia >= hoje).sort((a, b) => a.dia.localeCompare(b.dia) || a.horario.localeCompare(b.horario));
  for (let i = 1; i < itens.length; i++) {
    if (itens[i - 1].situacao === 'pulada' && itens[i].situacao === 'pulada') {
      avisos.push({ peca: 'horários sem post', mensagem: `${itens[i - 1].semana}/${itens[i - 1].id} e ${itens[i].id} reprovaram e não havia reserva: 2 horários seguidos vão ficar sem post.` });
      break;
    }
  }
  return avisos;
}

function erroComoAviso(e) {
  if (e instanceof ErroToken) return { peca: 'token do Claude', mensagem: `${e.message}. Gere outro com "claude setup-token" e grave em CLAUDE_CODE_OAUTH_TOKEN.` };
  if (e instanceof ErroTeto) return { peca: 'teto de uso', mensagem: `${e.message}. O agente só publica o que já está pronto até a semana virar.` };
  if (e instanceof ErroLimite) return { peca: 'limite do plano', mensagem: `${e.message}. A próxima rodada tenta de novo.` };
  return { peca: 'agente', mensagem: e.message };
}

export async function rodar(comando, { env = process.env, agora = () => new Date(), consultar, fetch } = {}) {
  const erros = [];
  if (env.AGENTE_PAUSADO === 'true') return { erros, log: ['Agente pausado (AGENTE_PAUSADO=true): nada é produzido.'] };
  const ensaio = env.AGENTE_MODO === 'ensaio';
  const saida = ensaio ? path.join(RAIZ, 'ensaio') : RAIZ;
  mkdirSync(saida, { recursive: true });
  const hojeReal = hojeEmSaoPaulo(agora());
  const hoje = env.AGENTE_HOJE || hojeReal;
  const config = JSON.parse(readFileSync(path.join(RAIZ, 'agente', 'config.json'), 'utf8'));
  const registrar = criarRegistro(saida, agora);
  const log = [];
  // Métricas são das publicações reais (também no ensaio) e não usam o Claude.
  if (comando === 'stories') {
    await coletarMetricas({ env, hoje: hojeReal, modo: 'stories', log, erros, fetch });
    return { erros, log };
  }
  // Data real sempre: com AGENTE_HOJE falso, a coleta gravaria D+7 e "ontem" de dias que ainda não aconteceram.
  if (comando === 'diario' || comando === 'semanal') await coletarMetricas({ env, hoje: hojeReal, modo: 'dia', log, erros, fetch });
  if (comando === 'semanal') await conferirChaveMeta({ env, erros, log, fetch });
  const cerebro = { ...criarCerebro({ raiz: saida, config, agora, ...(consultar ? { consultar } : {}), log: (m) => log.push(m) }), config };
  erros.push(...avisosDeToken(config, hoje));

  let produto = lerProduto();
  // O banco reserva é um só (o real). No ensaio ele é lido e reposto, mas usar uma peça não gasta a vez dela.
  const reserva = criarReserva({ raiz: RAIZ, saida, produto, marcar: !ensaio });
  const formatos = config.formatosAtivos ?? FORMATOS_PRODUZIDOS;
  const usados = [...lerGanchosUsados(RAIZ), ...ganchosDasAgendas(saida)];
  const ctxBase = { raiz: RAIZ, saida, config, cerebro, usados, hoje, registrar, reserva };

  if (env.AGENTE_MODO === 'so_reserva') {
    log.push('Modo só reserva: nada novo é escrito; o que falta nos próximos 3 dias sai do banco reserva.');
    if (comando === 'diario') {
      for (const semana of [...new Set([segundaDa(hoje), segundaDa(dataMais(hoje, 3))])]) {
        const r = await cobrirComReserva({ ...ctxBase, produto, semana, desde: hoje, ate: dataMais(hoje, 3) });
        if (r.cobertas.length || r.descobertas.length) log.push(`${semana}: da reserva ${r.cobertas.join(', ') || 'nenhuma'}; sem post ${r.descobertas.join(', ') || 'nenhuma'}`);
      }
      erros.push(...avisosDaReserva({ saida, hoje, produto }));
    }
    return { erros, log };
  }

  /** Planeja a semana se ainda não tem plano. Semana com agenda de outro produtor (rotina, Windsor) nunca. */
  async function planejarSeFaltar(semana, novidades = [], desde = semana) {
    const fPlano = path.join(saida, 'semanas', semana, 'plano.json');
    if (existsSync(fPlano)) return false;
    if (agendaAlheia(saida, semana)) throw new Error(`semanas/${semana} já tem agenda que não é do agente (rotina antiga ou Windsor): não planejo por cima`);
    const estrategia = atualizarEstrategia(RAIZ, hoje, saida);
    log.push(`Estratégia: ${estrategia.comNota.length} post(s) medidos, ${estrategia.mudancas.length} peso(s) mudaram.`);
    const fAgenda = path.join(saida, 'semanas', semana, 'agenda.json');
    const ocupados = new Set(existsSync(fAgenda) ? JSON.parse(readFileSync(fAgenda, 'utf8')).pecas.map((p) => p.id) : []);
    const { plano, tentativas } = await planejarSemana({ raiz: RAIZ, semana, config, produto, cerebro, formatos, estadoResumo: estrategia.resumo, ganchosRecentes: usados.filter((u) => u.data >= dataMais(hoje, -42)), novidades, desde, ocupados });
    mkdirSync(path.dirname(fPlano), { recursive: true });
    writeFileSync(fPlano, `${JSON.stringify({ semana, criado_em: hoje, tentativas, ...plano }, null, 2)}\n`);
    registrar({ tipo: 'plano', peca: semana, detalhe: plano.porque });
    log.push(`Plano da semana ${semana}: ${plano.pecas.length} peças.`);
    return true;
  }

  try {
    if (comando === 'semanal') {
      const base = await atualizarBaseSePuder({ produto, cerebro, hoje, registrar });
      produto = base.produto;
      log.push(...base.avisos);
      const { semana, desde } = semanaAlvo(hoje, env.AGENTE_SEMANA);
      if (desde > semana && assumirSemana(saida, semana, hoje)) log.push(`Semana ${semana} assumida: a agenda antiga já tinha saído toda; o agente produz de ${desde} a domingo.`);
      await planejarSeFaltar(semana, base.novidades, desde);
      const r = await produzirPendentes({ ...ctxBase, produto, semana, desde, ate: dataMais(semana, 6) });
      log.push(`Produzidas: ${r.feitas.map((f) => `${f.id}=${f.status}`).join(', ') || 'nada'}`);
      for (const f of r.feitas.filter((x) => x.motivos)) log.push(`  ${f.id} (${f.status}), último motivo: ${f.motivos.join(' | ')}`);
      // Limite do plano no sábado não é urgente: a semana é a seguinte e o diário continua de onde parou.
      if (r.parou instanceof ErroLimite) log.push(`Limite do plano: ${r.parou.message}. O diário continua a produção nos próximos dias.`);
      else if (r.parou) erros.push(erroComoAviso(r.parou));
      else {
        try {
          const repostas = await encherReserva({ ...ctxBase, produto, semana, banco: RAIZ, maximo: 2 });
          if (repostas.length) log.push(`Banco reserva: ${repostas.map((x) => `${x.tipo}=${x.status}`).join(', ')}`);
        } catch (e) {
          erros.push(erroComoAviso(e));
        }
      }
      const estrategia = atualizarEstrategia(RAIZ, hoje, saida);
      const f = gravarRelatorio({ saida, hoje, semanaIso: semanaIso(new Date(`${hoje}T12:00:00Z`)), raiz: RAIZ, estrategia, reserva: situacao(RAIZ, { produto, hoje }), gasto: cerebro.gastoSemana() });
      log.push(`Relatório: ${path.relative(RAIZ, f)}`);
    } else if (comando === 'diario') {
      // Sexta a domingo: se o semanal de sábado não conseguiu planejar (limite, erro), o diário tenta de novo.
      const proxima = segundaSeguinte(hoje);
      if ([5, 6, 0].includes(new Date(`${hoje}T12:00:00Z`).getUTCDay()) && !agendaAlheia(saida, proxima) && await planejarSeFaltar(proxima)) {
        log.push(`O plano de ${proxima} faltava: planejado no diário.`);
      }
      const ate = dataMais(hoje, 3);
      for (const semana of [...new Set([segundaDa(hoje), segundaDa(ate)])]) {
        for (const x of revalidarAgenda({ raiz: RAIZ, saida, semana, desde: hoje, ate, registrar })) log.push(`${semana}/${x.id} ficou inválida e vai ser refeita: ${x.motivos.join(' | ')}`);
        const r = await produzirPendentes({ ...ctxBase, produto, semana, desde: hoje, ate });
        if (r.feitas.length) log.push(`${semana}: ${r.feitas.map((f) => `${f.id}=${f.status}`).join(', ')}`);
        if (r.parou) {
          // Sem Claude: o que é de hoje sai do banco reserva. Limite do plano com tudo coberto não é alerta.
          const c = await cobrirComReserva({ ...ctxBase, produto, semana: segundaDa(hoje), desde: hoje, ate: hoje });
          if (c.cobertas.length) log.push(`Da reserva hoje: ${c.cobertas.join(', ')}`);
          if (!(r.parou instanceof ErroLimite) || c.descobertas.length) erros.push(erroComoAviso(r.parou));
          else log.push(`Limite do plano: ${r.parou.message}. Hoje está coberto; a próxima rodada tenta de novo.`);
          break;
        }
      }
      erros.push(...avisosDaReserva({ saida, hoje, produto }));
      const puladasHoje = [];
      for (const semana of [segundaDa(hoje)]) {
        const f = path.join(saida, 'semanas', semana, 'plano.json');
        if (existsSync(f)) puladasHoje.push(...JSON.parse(readFileSync(f, 'utf8')).pecas.filter((p) => p.dia === hoje && p.situacao === 'pulada').map((p) => p.id));
      }
      if (puladasHoje.length) log.push(`Puladas hoje (na dúvida, não posta): ${puladasHoje.join(', ')}`);
    } else {
      throw new Error(`comando desconhecido: ${comando} (use semanal, diario ou stories)`);
    }
  } catch (e) {
    erros.push(erroComoAviso(e));
  }
  return { erros, log, gasto: cerebro.gastoSemana() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await rodar(process.argv[2]);
  for (const l of r.log) console.log(l);
  if (r.gasto !== undefined) console.log(`Uso da semana: US$ ${r.gasto.toFixed(2)} equivalente.`);
  const arquivo = path.join(RAIZ, 'agente', 'erros.md');
  if (r.erros.length) {
    const texto = r.erros.map((e) => `### ${e.peca}\n\n${e.mensagem}`).join('\n\n');
    writeFileSync(arquivo, `${texto}\n`);
    console.error(texto);
    process.exit(1);
  }
}
