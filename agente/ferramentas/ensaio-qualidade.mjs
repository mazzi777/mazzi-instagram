// Ensaio do laço de qualidade (direção de arte + editor) com o Claude de verdade, sem publicar e sem gravar no repositório.
//   node agente/ferramentas/ensaio-qualidade.mjs <pasta-de-saida> [semana-de-referencia]
// Planeja a PRÓXIMA semana com o planejador real (pauta nova: refazer a pauta de uma semana já publicada só faz o editor
// reprovar tudo por repetição, com razão), produz as primeiras peças de imagem e compara cada uma com a peça do mesmo
// formato que foi ao ar na semana de referência ("antes"). Depois roda um caso forçado a reprovar (editor com nota
// impossível sobre um texto já aprovado) para provar que é o editor que reprova e que a peça cai no banco reserva.
// Saída: <pasta>/semanas/... (peças novas), <pasta>/registro (cada tentativa, notas e motivos), <pasta>/resumo.md e
// <pasta>/antes-depois-*.jpg. O banco reserva é só lido (usar não gasta a vez da peça). Quem roda: .github/workflows/ensaio-qualidade.yml.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarCerebro } from '../cerebro.mjs';
import { lerProduto } from '../checagens/fatos.mjs';
import { lerGanchosUsados } from '../checagens/repeticao.mjs';
import { produzirPeca, criarRegistro, gravarNaAgenda } from '../orquestrador.mjs';
import { criarReserva } from '../reserva.mjs';
import { ganchosDasAgendas, segundaSeguinte } from '../agente.mjs';
import { hojeEmSaoPaulo } from '../../publicar/publicar.mjs';
import { dataMais } from '../../publicar/validar.mjs';
import { planejarSemana } from '../etapas/planejar.mjs';
import { capasRecentes } from '../checagens/direcao.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const saida = path.resolve(process.argv[2] ?? 'ensaio-qualidade');
const referencia = process.argv[3] ?? '2026-11-09';
const hoje = process.env.ENSAIO_HOJE ?? hojeEmSaoPaulo();
const semana = segundaSeguinte(hoje);
const config = JSON.parse(readFileSync(path.join(RAIZ, 'agente', 'config.json'), 'utf8'));
const produto = lerProduto();
mkdirSync(saida, { recursive: true });

const log = [];
const registrar = criarRegistro(saida);
// raiz = repositório: o cérebro lê o uso real da semana (uso/AAAA-Www.json) e respeita o teto e o modo econômico.
// O que ele anota fica só na cópia do runner (este workflow não faz commit).
const base = criarCerebro({ raiz: RAIZ, config, log: (m) => log.push(m) });
// Guarda o que o redator escreveu em cada peça, para o caso forçado reaproveitar sem pagar outro texto.
const escrito = new Map();
let atual = null;
const cerebro = { ...base, config, pedir: async (q) => { const r = await base.pedir(q); if (q.etapa.startsWith('escrever:')) escrito.set(atual, r); return r; } };
const reserva = criarReserva({ raiz: RAIZ, saida, produto, marcar: false });
const usados = [...lerGanchosUsados(RAIZ), ...ganchosDasAgendas(RAIZ)];
const ctx = { raiz: RAIZ, saida, config, cerebro, produto, usados, hoje, registrar, reserva, semana };

// Pauta nova, do planejador real (o mesmo do sábado), com os ganchos das últimas 6 semanas para não repetir.
const { plano } = await planejarSemana({ raiz: RAIZ, semana, config, produto, cerebro, formatos: ['carrossel', 'imagem', 'reel', 'stories'], ganchosRecentes: usados.filter((u) => u.data >= dataMais(hoje, -42)),
  temasRecentes: capasRecentes([RAIZ], { limite: 30, comStories: true }).filter((t) => t.dia >= dataMais(hoje, -14) && t.tema) });
writeFileSync(path.join(saida, 'plano.json'), `${JSON.stringify(plano, null, 2)}
`);

const resultados = [];
const pecas = plano.pecas.filter((p) => ['carrossel', 'imagem', 'stories'].includes(p.tipo)).slice(0, Number(process.env.ENSAIO_MAX ?? 4));
for (const item of pecas) {
  atual = item.id;
  const r = await produzirPeca(item, ctx);
  if (r.entrada) gravarNaAgenda(saida, semana, r.entrada);
  resultados.push({ id: item.id, tipo: item.tipo, status: r.status, motivos: r.motivos ?? [], gancho: r.entrada?.gancho, visual: r.entrada?.visual });
  console.log(`${item.id} ${item.tipo}: ${r.status}`);
}

// Caso forçado: o MESMO texto de uma peça que acabou de ser aprovada, com o editor exigindo nota impossível e sem regeração.
// Só o editor pode reprovar aqui, e a peça tem que cair no banco reserva.
const aprovada = resultados.find((x) => x.status === 'aprovada' && escrito.has(x.id));
let provaReserva = 'sem peça aprovada para reaproveitar: caso forçado não rodou';
if (aprovada) {
  const item = pecas.find((p) => p.id === aprovada.id);
  const pastaF = path.join(saida, 'forcado');
  const configForcado = { ...config, checagens: { ...config.checagens, regeracoes: 0, editor: { minimoCriterio: 11, maxAbaixoDe7: 0 } } };
  const cerebroForcado = { ...cerebro, pedir: async (q) => (q.etapa.startsWith('escrever:') ? structuredClone(escrito.get(aprovada.id)) : cerebro.pedir(q)) };
  const rf = await produzirPeca({ ...item, id: 'X' }, { ...ctx, config: configForcado, cerebro: cerebroForcado, saida: pastaF, registrar: criarRegistro(pastaF), reserva: criarReserva({ raiz: RAIZ, saida: pastaF, produto, marcar: false }) });
  const peloEditor = (rf.motivos ?? []).some((m) => m.startsWith('editor'));
  provaReserva = rf.status === 'reserva' && peloEditor ? `OK: reprovada pelo editor e trocada pela reserva ${rf.entrada?.tema ?? ''}` : `FALHOU: status ${rf.status}, motivos ${(rf.motivos ?? []).join(' | ')}`;
  resultados.push({ id: `X (forçado, texto de ${aprovada.id})`, tipo: item.tipo, status: rf.status, motivos: rf.motivos ?? [], gancho: rf.entrada?.gancho, origem: rf.entrada?.origem });
}
console.log(`Caso forçado: ${provaReserva}`);

// Notas e motivos de cada tentativa, do registro.
const linhas = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((f) => readFileSync(path.join(dir, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l))) : []);
const reg = [...linhas(path.join(saida, 'registro')), ...linhas(path.join(saida, 'forcado', 'registro'))];
const resumo = [
  `# Ensaio de qualidade (${hoje}): pauta nova da semana ${semana}, antes = peças no ar da semana ${referencia}`,
  '',
  '| Peça | Tipo | Resultado | Gancho | Capa |',
  '|---|---|---|---|---|',
  ...resultados.map((r) => `| ${r.id} | ${r.tipo} | ${r.status}${r.origem ? ` (${r.origem})` : ''} | ${r.gancho ?? '-'} | ${r.visual ? `${r.visual.layout}/${r.visual.fundo}` : '-'} |`),
  '',
  `Caso forçado (reprovar e cair na reserva): ${provaReserva}`,
  '',
  '## Tentativas (notas e motivos)',
  '',
  ...reg.filter((l) => l.peca).map((l) => `- ${l.peca} · ${l.tipo}${l.detalhe ? ` · ${l.detalhe}` : ''}${l.notas ? ` · notas ${JSON.stringify(l.notas)}` : ''}${l.motivos?.length ? `\n  - ${l.motivos.join('\n  - ')}` : ''}`),
  '',
  `Uso: ${log.join(' | ')}`,
].join('\n');
writeFileSync(path.join(saida, 'resumo.md'), `${resumo}\n`);

// Antes (o que foi ao ar) e depois (o ensaio), lado a lado, uma folha por peça.
try {
  const { chromium } = await import('playwright');
  const nav = await chromium.launch();
  const noAr = JSON.parse(readFileSync(path.join(RAIZ, 'semanas', referencia, 'agenda.json'), 'utf8')).pecas;
  for (const r of resultados.filter((x) => x.status === 'aprovada')) {
    const imgs = (dir, sem, pref) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(`${sem}-${pref}-`) && f.endsWith('.jpg')).sort().map((f) => path.join(dir, f)) : []);
    // "Antes": a peça do mesmo formato que foi ao ar na semana de referência (o molde antigo).
    const par = noAr.find((p) => p.tipo === r.tipo) ?? noAr.find((p) => p.tipo !== 'reel');
    const antes = par ? imgs(path.join(RAIZ, 'semanas', referencia), referencia, par.id) : [];
    const depois = imgs(path.join(saida, 'semanas', semana), semana, r.id);
    const fila = (titulo, lista) => `<h2>${titulo}</h2><div class="fila">${lista.map((f) => `<img src="data:image/jpeg;base64,${readFileSync(f).toString('base64')}">`).join('')}</div>`;
    const html = `<body style="margin:0;padding:24px;background:#6d6d6d;font:600 22px sans-serif;color:#fff;width:max-content"><style>.fila{display:flex;gap:10px;margin-bottom:24px}.fila img{width:${r.tipo === 'stories' ? 216 : 270}px}</style>${fila(`Antes (no ar, ${referencia}) · ${par?.tema ?? ''}`, antes)}${fila(`Depois (ensaio, ${semana}) · ${r.gancho ?? ''}`, depois)}</body>`;
    const p = await nav.newPage({ viewport: { width: 600, height: 400 } });
    await p.setContent(html);
    await p.screenshot({ path: path.join(saida, `antes-depois-${r.id}.jpg`), fullPage: true, type: 'jpeg', quality: 85 });
    await p.close();
  }
  await nav.close();
} catch (e) {
  console.log(`folha antes/depois não saiu: ${e.message}`);
}
console.log(resumo);
if (provaReserva.startsWith('FALHOU')) process.exit(1);
