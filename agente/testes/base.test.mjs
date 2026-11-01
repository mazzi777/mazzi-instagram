import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerProduto, julgarAfirmacoes, checarFatos, resumoParaJuiz } from '../checagens/fatos.mjs';
import { palavrasProibidas } from '../checagens/nunca.mjs';
import { checarHumano } from '../checagens/humano.mjs';
import { lerVerticals, ramosAtivos, secoesNovidades, filtrarCandidatas, atualizarBase } from '../base/atualizar.mjs';
import { Agenda, Produto, validar } from '../lib/schemas.mjs';

const produto = lerProduto();
const afirma = (tipo, funcao_id = null, em_exemplo = false) => ({ trecho: `t-${tipo}-${funcao_id}`, tipo, funcao_id, em_exemplo });

test('base: válida, ids únicos, tudo que está no ar tem fonte e nada no ar bate na lista NUNCA', () => {
  const ids = produto.funcoes.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of produto.funcoes.filter((x) => x.status === 'no_ar')) {
    assert.ok(f.fonte, f.id);
    assert.deepEqual(palavrasProibidas(f.fato), [], f.id);
  }
  assert.equal(produto.preco.regra, 'nunca_falar');
});

test('base: respostas do FAQ não tocam em nada proibido e não têm cara de IA', () => {
  for (const { pergunta, resposta } of produto.faq) {
    assert.deepEqual(palavrasProibidas(resposta), [], pergunta);
    assert.equal(checarHumano(resposta).ok, true, `${pergunta}: ${checarHumano(resposta).motivos}`);
  }
});

test('base: o resumo do juiz traz as funções no ar e as proibidas separadas', () => {
  const r = resumoParaJuiz(produto);
  assert.match(r, /rest\.delivery\.teclado/);
  assert.match(r, /NÃO EXISTEM[\s\S]*fiscal\.nfce/);
});

test('fatos: função no ar passa; função inventada ou proibida reprova', () => {
  assert.deepEqual(julgarAfirmacoes([afirma('funcao', 'rest.caixa'), afirma('opiniao')], produto), []);
  assert.match(julgarAfirmacoes([afirma('funcao', null)], produto).join(), /não está na base/);
  assert.match(julgarAfirmacoes([afirma('funcao', 'rest.inventada')], produto).join(), /não está na base/);
  assert.match(julgarAfirmacoes([afirma('funcao', 'fiscal.nfce')], produto).join(), /proibido/);
});

test('fatos: número só em cartão EXEMPLO; preço, cliente e depoimento nunca', () => {
  assert.deepEqual(julgarAfirmacoes([afirma('numero', null, true), afirma('resultado', null, true)], produto), []);
  assert.match(julgarAfirmacoes([afirma('numero')], produto).join(), /EXEMPLO/);
  assert.match(julgarAfirmacoes([afirma('preco')], produto).join(), /preço/);
  assert.match(julgarAfirmacoes([afirma('promocao', null, true)], produto).join(), /preço/);
  assert.match(julgarAfirmacoes([afirma('cliente', null, true)], produto).join(), /nem em cartão/);
  assert.match(julgarAfirmacoes([afirma('depoimento')], produto).join(), /proibido/);
});

test('fatos (G1): devolve os ids usados; juiz ausente ou com erro reprova', async () => {
  const juiz = async (tarefa) => {
    assert.match(tarefa, /FUNÇÕES NO AR/);
    return { afirmacoes: [afirma('funcao', 'clin.orcamento'), afirma('funcao', 'clin.orcamento'), afirma('opiniao')] };
  };
  const r = await checarFatos('peça', { juiz, produto });
  assert.equal(r.ok, true);
  assert.deepEqual(r.fatos, ['clin.orcamento']);
  assert.equal((await checarFatos('peça', { produto })).ok, false);
  assert.equal((await checarFatos('peça', { produto, juiz: async () => { throw new Error('limite'); } })).ok, false);
});

test('atualizar: VERTICALS do aj-clinic viram ramos; ramo novo sem base fica de fora', () => {
  const ts = "export const VERTICALS = ['clinic', 'restaurant', 'barbershop'] as const;";
  assert.deepEqual(lerVerticals(ts), ['clinic', 'restaurant', 'barbershop']);
  assert.deepEqual(ramosAtivos(produto, lerVerticals(ts)), { ativos: ['clinica', 'restaurante'], semBase: ['barbershop'] });
  assert.throws(() => lerVerticals('nada aqui'), /VERTICALS/);
});

test('atualizar: seções do NOVIDADES e filtro das candidatas', () => {
  const secoes = secoesNovidades('# Novidades\n\n## Nov 2026: pix\n- Pix no caixa.\n\n## Out 2026: velho\n- x');
  assert.deepEqual(secoes.map((s) => s.titulo), ['Nov 2026: pix', 'Out 2026: velho']);
  const { aprovadas, recusadas } = filtrarCandidatas([
    { id: 'rest.pix-qr', ramo: 'restaurante', fato: 'O caixa mostra o QR do Pix com o valor da venda.', fonte: 'Nov 2026: pix' },
    { id: 'rest.nfce-contingencia', ramo: 'restaurante', fato: 'Emissão de NFC-e em contingência no caixa.', fonte: 'x' },
    { id: 'clin.lembrete-meta', ramo: 'clinica', fato: 'Lembrete pela Meta, ainda não está ligado no ar.', fonte: 'x' },
    { id: 'rest.caixa', ramo: 'restaurante', fato: 'Caixa com abertura e fechamento completos.', fonte: 'x' },
    { id: 'ruim', ramo: 'restaurante', fato: 'Função qualquer com texto suficiente.', fonte: 'x' },
  ], produto);
  assert.deepEqual(aprovadas.map((a) => a.id), ['rest.pix-qr']);
  assert.deepEqual(recusadas.map((r) => r.id), ['rest.nfce-contingencia', 'clin.lembrete-meta', 'rest.caixa', 'ruim']);
});

test('atualizar (completo): só lê seções novas, grava a fonte e a data, e o resultado continua válido', async () => {
  const md = '# Novidades\n\n## Novembro de 2026: pix no caixa\n- O caixa mostra o QR do Pix.\n\n## Outubro de 2026 (12): delivery rápido\n- já lido';
  let lido = '';
  const extrair = async (_tarefa, texto) => {
    lido = texto;
    return { funcoes: [{ id: 'rest.pix-qr', ramo: 'restaurante', fato: 'O caixa mostra o QR do Pix com o valor da venda.', fonte: 'Novembro de 2026: pix no caixa' }] };
  };
  const r = await atualizarBase({ produto, novidadesMd: md, permissionsTs: "VERTICALS = ['clinic', 'restaurant']", extrair, hoje: '2026-11-07' });
  assert.match(lido, /pix no caixa/);
  assert.doesNotMatch(lido, /delivery rápido/);
  const nova = r.produto.funcoes.find((f) => f.id === 'rest.pix-qr');
  assert.equal(nova.desde, '2026-11-07');
  assert.match(nova.fonte, /NOVIDADES/);
  assert.ok(r.produto.novidades_vistas.includes('Novembro de 2026: pix no caixa'));
  validar(Produto, r.produto);

  let chamou = false;
  await atualizarBase({ produto: r.produto, novidadesMd: md, permissionsTs: "VERTICALS = ['clinic', 'restaurant']", extrair: async () => { chamou = true; return { funcoes: [] }; }, hoje: '2026-11-14' });
  assert.equal(chamou, false, 'sem seção nova, não gasta o Claude');
});

test('schemas: agenda estendida aceita os campos novos e recusa horário fora da lista', () => {
  const peca = { id: 'A', dia: '2026-11-16', tipo: 'carrossel', arquivos: ['2026-11-16-A-01.jpg'], legenda: 'x', tema: 'clínica', gancho: 'Paciente faltou?',
    horario: '11:40', ramo: 'clinica', objetivo: 'conversa', ia: false, origem: 'agente', fatos: ['clin.lembrete-1-clique'] };
  validar(Agenda, { semana: '2026-11-16', pecas: [peca] });
  assert.throws(() => validar(Agenda, { semana: '2026-11-16', pecas: [{ ...peca, horario: '12:00' }] }), /horario/);
});
