// Porta de entrada do agente (chamada pelos workflows).
//   node agente/agente.mjs semanal   planeja e produz a semana seguinte (sábado 02:17)
//   node agente/agente.mjs diario    produz o que falta para os próximos 3 dias e confere os tokens (03:17)
// Ambiente: CLAUDE_CODE_OAUTH_TOKEN, AGENTE_PAUSADO, AGENTE_MODO (ensaio | so_reserva), AJ_CLINIC_DIR (clone do aj-clinic),
//           AGENTE_HOJE (opcional, AAAA-MM-DD, para testes).
// Saída: commit fica com o workflow. Erros vão para agente/erros.md (o workflow abre a issue, como o publicador).
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hojeEmSaoPaulo } from '../publicar/publicar.mjs';
import { dataMais } from '../publicar/validar.mjs';
import { criarCerebro, ErroToken, ErroLimite, ErroTeto } from './cerebro.mjs';
import { lerProduto } from './checagens/fatos.mjs';
import { lerGanchosUsados } from './checagens/repeticao.mjs';
import { atualizarBase } from './base/atualizar.mjs';
import { planejarSemana } from './etapas/planejar.mjs';
import { criarRegistro, produzirPendentes, FORMATOS_COM_IMAGEM } from './orquestrador.mjs';
import { Produto, validar } from './lib/schemas.mjs';
import { z } from 'zod';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const segundaSeguinte = (hoje) => {
  const dia = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  return dataMais(hoje, ((8 - dia) % 7) || 7);
};
export const segundaDa = (hoje) => dataMais(hoje, -((new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7));

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

function erroComoAviso(e) {
  if (e instanceof ErroToken) return { peca: 'token do Claude', mensagem: `${e.message}. Gere outro com "claude setup-token" e grave em CLAUDE_CODE_OAUTH_TOKEN.` };
  if (e instanceof ErroTeto) return { peca: 'teto de uso', mensagem: `${e.message}. O agente só publica o que já está pronto até a semana virar.` };
  if (e instanceof ErroLimite) return { peca: 'limite do plano', mensagem: `${e.message}. A próxima rodada tenta de novo.` };
  return { peca: 'agente', mensagem: e.message };
}

export async function rodar(comando, { env = process.env, agora = () => new Date(), consultar } = {}) {
  const erros = [];
  if (env.AGENTE_PAUSADO === 'true') return { erros, log: ['Agente pausado (AGENTE_PAUSADO=true): nada é produzido.'] };
  const ensaio = env.AGENTE_MODO === 'ensaio';
  const saida = ensaio ? path.join(RAIZ, 'ensaio') : RAIZ;
  mkdirSync(saida, { recursive: true });
  const hoje = env.AGENTE_HOJE || hojeEmSaoPaulo(agora());
  const config = JSON.parse(readFileSync(path.join(RAIZ, 'agente', 'config.json'), 'utf8'));
  const registrar = criarRegistro(saida, agora);
  const log = [];
  const cerebro = { ...criarCerebro({ raiz: saida, config, agora, ...(consultar ? { consultar } : {}), log: (m) => log.push(m) }), config };
  erros.push(...avisosDeToken(config, hoje));

  if (env.AGENTE_MODO === 'so_reserva') {
    log.push('Modo só reserva: não produz nada novo.');
    return { erros, log };
  }

  let produto = lerProduto();
  const formatos = config.formatosAtivos ?? FORMATOS_COM_IMAGEM;
  const usados = [...lerGanchosUsados(RAIZ), ...ganchosDasAgendas(saida)];
  const ctxBase = { raiz: RAIZ, saida, config, cerebro, usados, hoje, registrar, reserva: null };

  try {
    if (comando === 'semanal') {
      const base = await atualizarBaseSePuder({ produto, cerebro, hoje, registrar });
      produto = base.produto;
      log.push(...base.avisos);
      const semana = segundaSeguinte(hoje);
      const fPlano = path.join(saida, 'semanas', semana, 'plano.json');
      if (!existsSync(fPlano)) {
        const { plano, tentativas } = await planejarSemana({ raiz: RAIZ, semana, config, produto, cerebro, formatos, ganchosRecentes: usados.filter((u) => u.data >= dataMais(hoje, -42)), novidades: base.novidades });
        mkdirSync(path.dirname(fPlano), { recursive: true });
        writeFileSync(fPlano, `${JSON.stringify({ semana, criado_em: hoje, tentativas, ...plano }, null, 2)}\n`);
        registrar({ tipo: 'plano', peca: semana, detalhe: plano.porque });
        log.push(`Plano da semana ${semana}: ${plano.pecas.length} peças.`);
      }
      const r = await produzirPendentes({ ...ctxBase, produto, semana, desde: semana, ate: dataMais(semana, 6) });
      log.push(`Produzidas: ${r.feitas.map((f) => `${f.id}=${f.status}`).join(', ') || 'nada'}`);
      for (const f of r.feitas.filter((x) => x.motivos)) log.push(`  ${f.id} (${f.status}), último motivo: ${f.motivos.join(' | ')}`);
      if (r.parou) erros.push(erroComoAviso(r.parou));
    } else if (comando === 'diario') {
      const ate = dataMais(hoje, 3);
      for (const semana of [...new Set([segundaDa(hoje), segundaDa(ate)])]) {
        const r = await produzirPendentes({ ...ctxBase, produto, semana, desde: hoje, ate });
        if (r.feitas.length) log.push(`${semana}: ${r.feitas.map((f) => `${f.id}=${f.status}`).join(', ')}`);
        if (r.parou) { erros.push(erroComoAviso(r.parou)); break; }
      }
      const puladasHoje = [];
      for (const semana of [segundaDa(hoje)]) {
        const f = path.join(saida, 'semanas', semana, 'plano.json');
        if (existsSync(f)) puladasHoje.push(...JSON.parse(readFileSync(f, 'utf8')).pecas.filter((p) => p.dia === hoje && p.situacao === 'pulada').map((p) => p.id));
      }
      if (puladasHoje.length) log.push(`Puladas hoje (na dúvida, não posta): ${puladasHoje.join(', ')}`);
    } else {
      throw new Error(`comando desconhecido: ${comando} (use semanal ou diario)`);
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
