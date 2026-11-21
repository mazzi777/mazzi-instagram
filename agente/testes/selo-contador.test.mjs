// Molde do reel (21/11/2026): selo EXEMPLO único e legível, número dentro do anel, sem sobreposição.
// Os quadros reais ficam com a vitrine (agente/ferramentas/vitrine-reel.mjs, que renderiza pelo Remotion do pipeline);
// aqui vai o que dá para provar sem navegador: geometria, contraste, nome do cartão e o código das cenas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { nomeDoCartao, contraste, SELO_CORES } from '../lib/exemplo.mjs';
import { layoutContador, meiaCorda, ANEL, RAIO_UTIL, AREA } from '../video/motion/geometria.mjs';
import { htmlSlide } from '../imagens/modelos.mjs';
import { TAREFA_JUIZ_VISUAL } from '../checagens/visual.mjs';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const cenas = readFileSync(path.join(RAIZ, 'agente', 'video', 'motion', 'cenas.jsx'), 'utf8');

test('selo 1: o nome do cartão perde o "exemplo" que o redator escreve (o selo sai uma vez só)', () => {
  const casos = {
    'Estoque EXEMPLO': 'Estoque', 'Exemplo: Retornos da semana': 'Retornos da semana', 'Bebidas (exemplo)': 'Bebidas',
    'EXEMPLO · Agenda': 'Agenda', 'exemplo': '', 'Pacote 4/10': 'Pacote 4/10', 'Exemplar do mês': 'Exemplar do mês', '': '',
  };
  for (const [entrada, saida] of Object.entries(casos)) assert.equal(nomeDoCartao(entrada), saida, entrada);
  assert.equal(nomeDoCartao(undefined), '');
  // Imagens usam a mesma função: "EXEMPLO" aparece uma vez no cartão do carrossel.
  const html = htmlSlide({ layout: 'cartao', fundo: 'escuro', titulo: 'O lote', cartao: { titulo: 'Estoque EXEMPLO', linhas: [{ rotulo: 'Toxina', selo: 'vence', tom: 'aviso' }] } }, { ramo: 'clinica', numero: 2, total: 5 });
  assert.equal((html.match(/EXEMPLO/g) ?? []).length, 1, 'carrossel: um selo só');
});

test('selo 2: no reel, a palavra EXEMPLO só existe dentro do SeloExemplo, e toda interface usa o selo', () => {
  assert.equal((cenas.match(/EXEMPLO</g) ?? []).length, 1, 'texto "EXEMPLO" desenhado num lugar só');
  assert.doesNotMatch(cenas, /`EXEMPLO|'EXEMPLO'|"EXEMPLO"/, 'nenhum "EXEMPLO" montado em texto solto');
  assert.doesNotMatch(cenas, /titulo\.toUpperCase\(\)/, 'o título do cartão não é mais colado ao selo');
  for (const cena of ['Cartao', 'Papel', 'Contador', 'Celular', 'Painel']) {
    const ini = cenas.indexOf(`export function ${cena}(`);
    const fim = cenas.indexOf('export function', ini + 10);
    const corpo = cenas.slice(ini, fim === -1 ? undefined : fim);
    assert.match(corpo, /<SeloExemplo|<Exemplo /, `${cena} mostra o selo`);
  }
});

test('selo 3: contraste do selo ≥ 7:1 (AAA) nas duas versões e tamanho ≥ 24 px', () => {
  for (const [lado, c] of Object.entries(SELO_CORES)) assert.ok(contraste(c.fundo, c.texto) >= 7, `${lado}: ${contraste(c.fundo, c.texto).toFixed(1)}`);
  assert.ok(contraste('#8b8f97', '#2a2d33') < 4.5, 'o cinza antigo (#8b8f97 sobre vidro escuro) ficava abaixo de 4,5');
  const tamanhos = [...cenas.matchAll(/<SeloExemplo[^>]*tamanho=\{(\d+)\}/g)].map((m) => Number(m[1]));
  assert.ok(tamanhos.every((t) => t >= 24), `tamanhos ${tamanhos}`);
  assert.match(cenas, /export function SeloExemplo\(\{ sobre = 'escuro', tamanho = 28 \}\)/);
});

const ROTULOS = ['', 'Sessão', 'Peso do prato', 'Peso em gramas', 'Sessões usadas no pacote', 'Pedidos do dia no delivery'];
const VALORES = [1, 4, 42, 532, 999];
const SUFIXOS = ['', 'g', 'kg', 'min'];
const TOTAIS = [undefined, 10, 999];

test('contador 1: número, rótulo e selo cabem dentro do anel em todos os casos (curto, longo e extremo)', () => {
  let casos = 0;
  for (const rotulo of ROTULOS) for (const valor of VALORES) for (const sufixo of SUFIXOS) for (const total of TOTAIS) {
    const g = layoutContador({ rotulo, valor, total, sufixo });
    const id = JSON.stringify({ rotulo, valor, sufixo, total });
    assert.ok(g.cabe, `não coube: ${id}`);
    assert.ok(g.linhas.length <= 2, id);
    for (const c of g.caixas) {
      assert.ok(c.largura / 2 <= meiaCorda(c.topo, c.base) + 1e-6, `${c.parte} passa da borda: ${id}`);
      assert.ok(c.topo >= ANEL.cy - RAIO_UTIL && c.base <= ANEL.cy + RAIO_UTIL, `${c.parte} fora do anel na vertical: ${id}`);
      assert.ok(ANEL.cx - c.largura / 2 >= AREA.esq && ANEL.cx + c.largura / 2 <= AREA.dir + 40 && c.base <= AREA.base, `${c.parte} fora da área segura: ${id}`);
    }
    // Sem sobreposição: as caixas empilham de cima para baixo.
    g.caixas.forEach((c, i) => { if (i) assert.ok(c.topo >= g.caixas[i - 1].base, `sobreposição em ${id}`); });
    casos++;
  }
  assert.equal(casos, ROTULOS.length * VALORES.length * SUFIXOS.length * TOTAIS.length);
});

test('contador 2: os casos que reprovaram em 21/11 encolhem para caber; número curto fica grande', () => {
  const peso = layoutContador({ rotulo: 'Peso do prato', valor: 532, sufixo: 'g' });
  assert.ok(peso.numero < 210, 'o 210 fixo de antes estourava o anel');
  assert.ok(peso.numero >= 120, `ainda é o destaque da cena (${peso.numero})`);
  assert.equal(layoutContador({ rotulo: 'Sessão', valor: 4, total: 10 }).numero, 200, 'número curto no tamanho máximo');
  const extremo = layoutContador({ rotulo: 'Sessões usadas no pacote', valor: 999, total: 999, sufixo: 'kg' });
  assert.ok(extremo.numero < peso.numero && extremo.cabe);
  assert.match(cenas, /layoutContador\(\{ rotulo, valor, total, sufixo \}\)/, 'a cena usa o layout calculado');
  assert.doesNotMatch(cenas, /fontSize: 210/, 'sem fonte fixa de 210 no número');
});

test('checagem visual: a tarefa do juiz continua exigindo selo, contraste, corte e @mazzisystems', () => {
  for (const regra of ['texto cortado', 'pouco contraste', 'falta o @mazzisystems', 'sem o selo "EXEMPLO"']) assert.ok(TAREFA_JUIZ_VISUAL.includes(regra), regra);
});
