// Máquina de estado de cada peça (SPEC 6.3):
// escrever → G1–G5/G8 → imagens ou reel (voz, legenda, vídeo) → G6 técnica + G7 visual → aprovada.
// Reprovou: regera com os motivos (até config.checagens.regeracoes vezes). Esgotou: reserva. Sem reserva: pulada.
// Tudo vai para registro/AAAA-MM-DD.jsonl. Retomável: o plano fica em semanas/SEMANA/plano.json e
// a rodada diária produz o que ainda falta.
// `raiz` é o repositório (guias, base); `saida` é onde vão semanas/, registro/ e uso/ (no ensaio: ensaio/).
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, rmSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validarPeca, dataMais } from '../publicar/validar.mjs';
import { ErroLimite, ErroTeto, ErroToken } from './cerebro.mjs';
import { escreverPeca, checarTexto, juizesDeTexto } from './etapas/escrever.mjs';
import { checarVisual, ProblemasVisuais } from './checagens/visual.mjs';
import { capturar, paginasDaPeca } from './imagens/capturar.mjs';
import { montarReel } from './ferramentas/montar_video.mjs';
import { ffprobe } from './ferramentas/binarios.mjs';
import { Registro, validar } from './lib/schemas.mjs';
import { situacao, guardar, pautasEvergreen, lerReserva } from './reserva.mjs';

export const FORMATOS_COM_IMAGEM = ['carrossel', 'imagem', 'stories'];
export const FORMATOS_PRODUZIDOS = [...FORMATOS_COM_IMAGEM, 'reel'];
// Quadro do gancho como capa do reel (thumb_offset da Meta, em ms).
const CAPA_REEL_MS = 1000;

export function criarRegistro(raiz, agora = () => new Date()) {
  return (entrada) => {
    const e = validar(Registro, { em: agora().toISOString(), ...entrada }, 'registro');
    const pasta = path.join(raiz, 'registro');
    mkdirSync(pasta, { recursive: true });
    appendFileSync(path.join(pasta, `${e.em.slice(0, 10)}.jsonl`), `${JSON.stringify(e)}\n`);
  };
}

const lerJson = (f, padrao) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : padrao);
const gravarJson = (f, d) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, `${JSON.stringify(d, null, 2)}\n`); };

/** Entrada da agenda (formato do publicador) a partir do item do plano e do conteúdo escrito. */
function entradaAgenda(item, conteudo, arquivos, fatos, tentativa) {
  const e = {
    id: item.id, dia: item.dia, horario: item.horario, tipo: item.tipo, arquivos,
    tema: `${item.ramo} · ${item.tema}`, gancho: conteudo.gancho, ramo: item.ramo, objetivo: item.objetivo,
    ia: false, origem: 'agente', fatos, tentativas: tentativa,
  };
  if (item.tipo !== 'stories') Object.assign(e, { legenda: conteudo.legenda, ...(conteudo.alt_text ? { alt_text: conteudo.alt_text } : {}) });
  return e;
}

/**
 * Apaga as mídias de uma peça na pasta da semana (slides e vídeo, inclusive o .parcial de um ffmpeg que caiu).
 * Roda antes de cada tentativa: a 1ª com 8 slides e a 2ª com 6 deixariam o 07 e o 08 sobrando no repositório.
 */
export function limparPeca(pasta, semana, id) {
  if (!existsSync(pasta)) return;
  for (const f of readdirSync(pasta)) if (f.startsWith(`${semana}-${id}-`) || f.startsWith(`${semana}-${id}.`)) rmSync(path.join(pasta, f), { force: true });
}

/** Reel: voz + legenda + vídeo. Devolve { arquivos, entrada, tecnica[], quadros[], limpar() }. */
async function produzirReel(item, conteudo, texto, tentativa, { semana, pasta, ctx }) {
  const destino = path.join(pasta, `${semana}-${item.id}.mp4`);
  limparPeca(pasta, semana, item.id);
  const m = await (ctx.montarReel ?? montarReel)({ roteiro: conteudo, item: { ...item, semana }, destino, log: (l) => ctx.registrar({ tipo: 'tentativa', peca: `${semana}/${item.id}`, detalhe: l }) });
  const limpar = () => m.trabalho && rmSync(m.trabalho, { recursive: true, force: true });
  if (!m.arquivo) return { arquivos: [], tecnica: m.motivos, quadros: [], limpar };
  const legenda = conteudo.legenda;
  // Voz sintética realista: etiqueta de IA obrigatória pela política da Meta (SPEC 8.4).
  const entrada = { ...entradaAgenda(item, { ...conteudo, legenda }, [path.basename(destino)], texto.fatos, tentativa), ia: true, capa_ms: CAPA_REEL_MS };
  if (!ctx.sondar) process.env.FFPROBE ??= ffprobe(); // o validador do publicador mede o vídeo com ele
  const tecnica = [...validarPeca(pasta, semana, entrada, { agente: true, ...(ctx.sondar ? { sondar: ctx.sondar } : {}) }), ...m.motivos];
  return { arquivos: [destino], entrada, tecnica, quadros: m.quadros, limpar, voz: m.motor };
}

/**
 * Produz uma peça. ctx: { raiz, saida, semana, produto, config, cerebro, usados, hoje, registrar, reserva, navegador }
 * Devolve { status: 'aprovada'|'reserva'|'pulada', entrada? }. ErroTeto/ErroLimite/ErroToken sobem (param a rodada).
 */
export async function produzirPeca(item, ctx) {
  const { raiz, saida = raiz, semana, produto, config, cerebro, usados, hoje, registrar } = ctx;
  const pasta = path.join(saida, 'semanas', semana);
  const onde = `${semana}/${item.id}`;
  if (ctx.soReserva) return usarReserva(item, ctx, ['modo só reserva (sem Claude)']);
  const juizes = juizesDeTexto(cerebro);
  const juizVisual = cerebro.juiz(ProblemasVisuais, 'juiz:visual', config.modelos.juizVisual);
  const maxTentativas = 1 + (cerebro.economico() ? 0 : config.checagens.regeracoes);
  let motivos = [];
  let arquivos = [];
  let anterior = null; // a versão reprovada volta para o redator corrigir só o apontado

  if (!FORMATOS_PRODUZIDOS.includes(item.tipo)) {
    registrar({ tipo: 'reprovada', peca: onde, motivos: [`formato ${item.tipo} ainda não é produzido`] });
    return usarReserva(item, ctx, [`formato ${item.tipo} ainda não é produzido`]);
  }

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      const conteudo = await escreverPeca({ raiz, item, produto, cerebro, config, motivosAnteriores: motivos, anterior });
      anterior = conteudo;
      const texto = await checarTexto({ item, conteudo, produto, ...juizes, usados, hoje, config });
      registrar({ tipo: 'tentativa', peca: onde, notas: texto.notas, motivos: texto.motivos, detalhe: `tentativa ${tentativa}: texto` });
      if (!texto.ok) { motivos = texto.motivos; continue; }

      if (item.tipo === 'reel') {
        const r = await produzirReel(item, conteudo, texto, tentativa, { semana, pasta, ctx });
        arquivos = r.arquivos;
        try {
          const visual = r.tecnica.length ? { ok: false, motivos: [] } : await checarVisual(r.quadros, { juiz: juizVisual, contexto: `reel · ${conteudo.gancho} (quadros do vídeo)` });
          motivos = [...r.tecnica, ...visual.motivos];
        } finally {
          r.limpar();
        }
        registrar({ tipo: motivos.length ? 'tentativa' : 'aprovada', peca: onde, notas: texto.notas, motivos, detalhe: `tentativa ${tentativa}: vídeo (voz ${r.voz ?? 'nenhuma'})` });
        if (!motivos.length) return { status: 'aprovada', entrada: r.entrada };
        continue;
      }

      const paginas = paginasDaPeca({ semana, id: item.id, tipo: item.tipo, ramo: item.ramo, conteudo, pasta });
      limparPeca(pasta, semana, item.id);
      arquivos = await (ctx.capturar ?? capturar)(paginas, { navegador: ctx.navegador });
      const entrada = entradaAgenda(item, conteudo, arquivos.map((a) => path.basename(a)), texto.fatos, tentativa);
      const tecnica = [...validarPeca(pasta, semana, entrada, { agente: true }), ...(arquivos.problemas ?? []).map((p) => `diagramação: ${p}`)];
      const visual = tecnica.length ? { ok: false, motivos: [] } : await checarVisual(arquivos, { juiz: juizVisual, contexto: `${item.tipo} · ${conteudo.gancho}` });
      motivos = [...tecnica, ...visual.motivos];
      registrar({ tipo: motivos.length ? 'tentativa' : 'aprovada', peca: onde, notas: texto.notas, motivos, detalhe: `tentativa ${tentativa}: imagens` });
      if (!motivos.length) return { status: 'aprovada', entrada };
    } catch (e) {
      if (e instanceof ErroTeto || e instanceof ErroLimite || e instanceof ErroToken) throw e;
      motivos = [`erro na produção: ${e.message}`];
      registrar({ tipo: 'erro', peca: onde, motivos, detalhe: `tentativa ${tentativa}` });
    }
  }
  for (const a of arquivos) rmSync(a, { force: true });
  limparPeca(pasta, semana, item.id);
  registrar({ tipo: 'reprovada', peca: onde, motivos });
  return { ...(await usarReserva(item, ctx, motivos)), motivos };
}

async function usarReserva(item, ctx, motivos) {
  const onde = `${ctx.semana}/${item.id}`;
  const r = ctx.reserva ? await ctx.reserva.pegar({ tipo: item.tipo, item, semana: ctx.semana, hoje: ctx.hoje }) : null;
  if (r) {
    ctx.registrar({ tipo: 'reserva', peca: onde, motivos, detalhe: `usou a reserva ${r.origemId}` });
    return { status: 'reserva', entrada: r.entrada };
  }
  ctx.registrar({ tipo: 'pulada', peca: onde, motivos, detalhe: 'sem reserva válida: na dúvida, não posta' });
  return { status: 'pulada' };
}

/** Grava a peça na agenda da semana (cria a agenda do agente se precisar). */
export function gravarNaAgenda(saida, semana, entrada) {
  const f = path.join(saida, 'semanas', semana, 'agenda.json');
  const agenda = lerJson(f, { semana, produtor: 'agente', pecas: [] });
  if (agenda.produtor !== 'agente') throw new Error(`semanas/${semana}/agenda.json não é do agente (é da rotina): não mexo`);
  agenda.pecas = [...agenda.pecas.filter((p) => p.id !== entrada.id), entrada].sort((a, b) => a.dia.localeCompare(b.dia) || (a.horario ?? '').localeCompare(b.horario ?? ''));
  gravarJson(f, agenda);
}

/**
 * Produz as peças do plano que ainda não estão na agenda nem foram puladas, com dia entre `desde` e `ate`.
 * Para ao bater no teto ou no limite do plano (a próxima rodada continua).
 */
/**
 * SPEC 6.2.3: confere de novo as peças prontas de `desde` a `ate` que ainda não começaram a sair. Mídia sumida ou
 * quebrada, ou função que saiu do ar na base: a peça sai da agenda e volta para o plano, e o diário refaz
 * (ou usa a reserva). Devolve os ids refeitos com o motivo.
 */
export function revalidarAgenda({ raiz, saida = raiz, semana, desde, ate, registrar, sondar }) {
  const dir = path.join(saida, 'semanas', semana);
  const fAgenda = path.join(dir, 'agenda.json');
  const fPlano = path.join(dir, 'plano.json');
  if (!existsSync(fAgenda) || !existsSync(fPlano) || agendaAlheia(saida, semana)) return [];
  const agenda = lerJson(fAgenda, null);
  const plano = lerJson(fPlano, null);
  const publicado = lerJson(path.join(dir, 'publicado.json'), {});
  const noAr = new Set(lerJson(path.join(raiz, 'agente', 'base', 'produto.json'), { funcoes: [] }).funcoes.filter((f) => f.status === 'no_ar').map((f) => f.id));
  const refeitas = [];
  for (const p of agenda.pecas) {
    if (p.dia < desde || p.dia > ate || publicado[p.id]) continue;
    if (p.tipo === 'reel' && !sondar) process.env.FFPROBE ??= ffprobe();
    const motivos = [
      ...validarPeca(dir, semana, p, { agente: true, ...(sondar ? { sondar } : {}) }),
      ...(p.fatos ?? []).filter((f) => !noAr.has(f)).map((f) => `a função ${f} não está mais no ar na base`),
    ];
    if (!motivos.length) continue;
    refeitas.push({ id: p.id, motivos });
    limparPeca(dir, semana, p.id);
    const item = plano.pecas.find((x) => x.id === p.id);
    if (item) delete item.situacao;
    registrar({ tipo: 'reprovada', peca: `${semana}/${p.id}`, motivos, detalhe: 'ficou inválida depois de aprovada: volta para ser refeita' });
  }
  if (refeitas.length) {
    const fora = new Set(refeitas.map((r) => r.id));
    agenda.pecas = agenda.pecas.filter((p) => !fora.has(p.id));
    gravarJson(fAgenda, agenda);
    gravarJson(fPlano, plano);
  }
  return refeitas;
}

/** A pasta da semana já tem agenda de outro produtor (rotina antiga, Windsor)? Aí o agente não mexe em nada. */
export function agendaAlheia(saida, semana) {
  const f = path.join(saida, 'semanas', semana, 'agenda.json');
  return existsSync(f) && lerJson(f, {}).produtor !== 'agente';
}

export async function produzirPendentes({ desde, ate, ...ctx }) {
  const { raiz, saida = raiz, semana, registrar } = ctx;
  // Semana da rotina antiga ou do Windsor: não é erro (o diário passa por elas até a 1ª semana do agente), só não mexe.
  if (agendaAlheia(saida, semana)) return { feitas: [], parou: null, alheia: true };
  const fPlano = path.join(saida, 'semanas', semana, 'plano.json');
  const plano = lerJson(fPlano, null);
  if (!plano) return { feitas: [], parou: null };
  const agenda = lerJson(path.join(saida, 'semanas', semana, 'agenda.json'), { pecas: [] });
  const prontas = new Set(agenda.pecas.map((p) => p.id));
  const feitas = [];
  for (const item of plano.pecas) {
    if (prontas.has(item.id) || item.situacao === 'pulada' || item.dia < desde || item.dia > ate) continue;
    try {
      const r = await produzirPeca(item, ctx);
      if (r.entrada) gravarNaAgenda(saida, semana, r.entrada);
      // G8 também dentro da rodada: o próximo gancho da semana não pode repetir este.
      if (r.entrada?.gancho) ctx.usados?.push({ data: item.dia, gancho: r.entrada.gancho });
      item.situacao = r.status;
      gravarJson(fPlano, plano);
      feitas.push({ id: item.id, status: r.status, ...(r.motivos ? { motivos: r.motivos } : {}) });
    } catch (e) {
      registrar({ tipo: 'erro', peca: `${semana}/${item.id}`, motivos: [e.message], detalhe: e.constructor.name });
      return { feitas, parou: e };
    }
  }
  return { feitas, parou: null };
}

/**
 * Sem Claude (limite do plano ou modo só reserva): as peças de `desde` a `ate` que ainda não estão prontas
 * entram do banco reserva. Devolve { cobertas[], descobertas[] } (descoberta = vai ficar sem post).
 */
export async function cobrirComReserva({ desde, ate, ...ctx }) {
  const { saida = ctx.raiz, semana } = ctx;
  const fPlano = path.join(saida, 'semanas', semana, 'plano.json');
  const plano = lerJson(fPlano, null);
  if (!plano || agendaAlheia(saida, semana)) return { cobertas: [], descobertas: [] };
  const prontas = new Set(lerJson(path.join(saida, 'semanas', semana, 'agenda.json'), { pecas: [] }).pecas.map((p) => p.id));
  const cobertas = [];
  const descobertas = [];
  for (const item of plano.pecas) {
    if (prontas.has(item.id) || item.situacao === 'pulada' || item.dia < desde || item.dia > ate) continue;
    const r = await usarReserva(item, ctx, ['sem Claude nesta rodada']);
    if (r.entrada) { gravarNaAgenda(saida, semana, r.entrada); cobertas.push(item.id); } else descobertas.push(item.id);
    item.situacao = r.status;
  }
  gravarJson(fPlano, plano);
  return { cobertas, descobertas };
}

/**
 * Repõe o banco reserva aos poucos (SPEC 8.5): produz até `maximo` peças evergreen do formato que falta,
 * pelo mesmo laço de qualidade, numa pasta temporária, e guarda as aprovadas em <banco>/reserva/.
 * ctx igual ao de produzirPeca + { banco (pasta do banco), semana (só para nomes e dia) }.
 */
export async function encherReserva({ banco, maximo = 1, ...ctx }) {
  const { produto, hoje, semana, cerebro } = ctx;
  const falta = situacao(banco, { produto, hoje }).faltam;
  if (!falta.length || cerebro.economico()) return [];
  const pautas = pautasEvergreen(produto);
  const jaTem = lerReserva(banco).length;
  const feitas = [];
  for (const [k, tipo] of falta.slice(0, maximo).entries()) {
    const pauta = pautas[(jaTem + k) % pautas.length];
    const item = {
      id: `R${k + 1}`, dia: semana, horario: '07:40', tipo, objetivo: 'conversa', exploracao: false, ...pauta,
      angulo: `${pauta.angulo} (Peça de reserva: precisa valer daqui a meses. Nada de data, "essa semana", novidade ou lançamento.)`,
    };
    const tmp = mkdtempSync(path.join(tmpdir(), 'mazzi-reserva-'));
    try {
      const r = await produzirPeca(item, { ...ctx, saida: tmp, reserva: null, soReserva: false });
      if (r.status === 'aprovada') {
        const rid = `${hoje}-${tipo}-${k + 1}`;
        guardar(banco, r.entrada, path.join(tmp, 'semanas', semana), { rid, hoje });
        ctx.registrar({ tipo: 'aprovada', peca: `reserva/${rid}`, detalhe: `banco reserva: ${pauta.tema}` });
      }
      feitas.push({ tipo, status: r.status });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  return feitas;
}

export const fimDaSemana = (semana) => dataMais(semana, 6);
