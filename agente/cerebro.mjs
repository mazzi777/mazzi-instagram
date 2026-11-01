// Única porta para o Claude (Agent SDK, assinatura da Andressa via CLAUDE_CODE_OAUTH_TOKEN).
// - Ferramentas do Claude Code desligadas (tools: []); só as nossas, por MCP no processo.
// - Toda resposta sai em JSON pelo schema zod da etapa e é validada de novo aqui.
// - Mede o custo equivalente de cada chamada em uso/AAAA-Www.json e corta no teto semanal.
// - Erro de login vira ErroToken (alerta do token); limite do plano vira ErroLimite (tentar mais tarde).
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { validar } from './lib/schemas.mjs';

export class ErroToken extends Error {}

/** JSON Schema que o Claude Code aceita: draft-07 e sem o campo $schema. */
export function schemaParaClaude(schema) {
  const { $schema, ...resto } = z.toJSONSchema(schema, { target: 'draft-7' });
  return resto;
}
export class ErroLimite extends Error {}
export class ErroTeto extends Error {}

/** Semana ISO ("2026-W45") de uma data. */
export function semanaIso(data) {
  const d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d - inicio) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}

const LIMITE_RE = /you've hit your|you've reached your|out of usage|usage limit|rate limit|429|overloaded/i;
const TOKEN_RE = /401|invalid bearer|authentication|not logged in|login expired|oauth|invalid api key|unauthorized/i;

/** Chamada real ao Agent SDK. Devolve { ok, saida, custo, entrada, saidaTokens, erro }. */
/** Prompt com imagens (G7): uma mensagem de usuário com as imagens em base64 e o texto no fim. */
function promptComImagens(texto, imagens) {
  const content = [
    ...imagens.map((f) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: readFileSync(f).toString('base64') } })),
    { type: 'text', text: texto },
  ];
  return (async function* () { yield { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null }; }());
}

export async function consultarSdk({ modelo, sistema, prompt, imagens = [], schemaJson, ferramentas = [], maxTurns, tetoUsd, effort }) {
  const { query, createSdkMcpServer } = await import('@anthropic-ai/claude-agent-sdk');
  const mcpServers = ferramentas.length ? { mazzi: createSdkMcpServer({ name: 'mazzi', tools: ferramentas }) } : {};
  const permitidas = ferramentas.map((t) => `mcp__mazzi__${t.name}`);
  const conversa = query({
    prompt: imagens.length ? promptComImagens(prompt, imagens) : prompt,
    options: {
      model: modelo,
      systemPrompt: sistema,
      tools: [],
      mcpServers,
      allowedTools: permitidas,
      permissionMode: 'dontAsk',
      settingSources: [],
      persistSession: false,
      cwd: mkdtempSync(path.join(tmpdir(), 'mazzi-cerebro-')),
      outputFormat: { type: 'json_schema', schema: schemaJson },
      maxTurns,
      maxBudgetUsd: tetoUsd,
      ...(effort ? { effort } : {}),
    },
  });
  let fim = null;
  for await (const msg of conversa) if (msg.type === 'result') fim = msg;
  if (!fim) return { ok: false, erro: 'o SDK terminou sem resultado', custo: 0, entrada: 0, saidaTokens: 0 };
  const uso = { custo: fim.total_cost_usd ?? 0, entrada: (fim.usage?.input_tokens ?? 0) + (fim.usage?.cache_read_input_tokens ?? 0) + (fim.usage?.cache_creation_input_tokens ?? 0), saidaTokens: fim.usage?.output_tokens ?? 0 };
  if (fim.subtype === 'success' && !fim.is_error) {
    return { ok: true, saida: fim.structured_output ?? JSON.parse(fim.result), ...uso };
  }
  return { ok: false, erro: [fim.subtype, ...(fim.errors ?? []), fim.result ?? ''].filter(Boolean).join(': '), ...uso };
}

export function criarCerebro({ raiz, config, agora = () => new Date(), consultar = consultarSdk, log = () => {} }) {
  const pasta = path.join(raiz, 'uso');
  const arquivoSemana = () => path.join(pasta, `${semanaIso(agora())}.json`);
  const teto = config.uso.tetoSemanalUsd;

  function lerUso() {
    const f = arquivoSemana();
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { semana: semanaIso(agora()), teto_usd: teto, chamadas: [] };
  }
  const gastoSemana = () => lerUso().chamadas.reduce((s, c) => s + c.custo_usd, 0);

  function anotar(etapa, modelo, r) {
    const uso = lerUso();
    uso.chamadas.push({ em: agora().toISOString(), etapa, modelo, custo_usd: +(r.custo ?? 0).toFixed(5), entrada: r.entrada ?? 0, saida: r.saidaTokens ?? 0 });
    mkdirSync(pasta, { recursive: true });
    writeFileSync(arquivoSemana(), `${JSON.stringify(uso, null, 1)}\n`);
  }

  /** Pede uma resposta no formato do schema zod. Lança ErroTeto/ErroLimite/ErroToken ou Error. */
  async function pedir({ etapa, modelo, sistema, prompt, imagens = [], schema, ferramentas = [], maxTurns = 6, effort }) {
    const gasto = gastoSemana();
    if (gasto >= teto) throw new ErroTeto(`teto semanal de uso atingido (US$ ${gasto.toFixed(2)} de ${teto} equivalente)`);
    const r = await consultar({
      modelo, sistema, prompt, imagens, schemaJson: schemaParaClaude(schema), ferramentas, maxTurns, effort,
      tetoUsd: Math.max(0.05, Math.min(1.5, teto - gasto)),
    });
    anotar(etapa, modelo, r);
    if (!r.ok) {
      if (TOKEN_RE.test(r.erro)) throw new ErroToken(`login do Claude recusado: ${r.erro}`);
      if (LIMITE_RE.test(r.erro)) throw new ErroLimite(`limite do plano do Claude: ${r.erro}`);
      throw new Error(`Claude falhou em ${etapa}: ${r.erro}`);
    }
    log(`${etapa}: US$ ${(r.custo ?? 0).toFixed(4)} equivalente`);
    return validar(schema, r.saida, `resposta do Claude (${etapa})`);
  }

  /** Juiz no formato que as checagens esperam: (tarefa, texto, imagens?) => objeto do schema. */
  const juiz = (schema, etapa = 'juiz') => (tarefa, texto, imagens = []) => pedir({
    etapa, modelo: config.modelos.juiz, sistema: tarefa, prompt: `PEÇA A CONFERIR:\n\n${texto}`, imagens, schema, maxTurns: 2, effort: 'low',
  });

  const economico = () => gastoSemana() >= teto * config.uso.economicoEm;

  return { pedir, juiz, gastoSemana, economico };
}
