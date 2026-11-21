// Missão de 21/11/2026 (reserva zerada): a geração melhora sem afrouxar nenhuma checagem.
// Estes testes passam pelo código real das checagens (gancho, repetição, fatos, editor, reserva, orquestrador);
// só o Claude é falso. Cada um diz qual achado da rodada de 21/11 ele cobre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checarTexto, medirGanchos, ferramentaGancho, promptPeca, ganchoSugerido, REGUA_GANCHO } from '../etapas/escrever.mjs';
import { checarGancho } from '../checagens/gancho.mjs';
import { motivosDoEditor } from '../checagens/editor.mjs';
import { CONCRETOS } from '../lib/texto.mjs';
import { usoDasFuncoes, promptPlano } from '../etapas/planejar.mjs';
import { produzirPeca, produzirPendentes, encherReserva, criarRegistro } from '../orquestrador.mjs';
import { guardar, situacao, motivosParaNaoUsar, lerReserva, pautasEvergreen, escolherPautas } from '../reserva.mjs';
import { avisosDaReserva } from '../agente.mjs';
import { lerProduto } from '../checagens/fatos.mjs';
import { dataMais } from '../../publicar/validar.mjs';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const config = JSON.parse(readFileSync(path.join(RAIZ, 'agente', 'config.json'), 'utf8'));
const produto = lerProduto();
const SEMANA = '2026-11-23';
const HOJE = '2026-11-21';
const tmp = () => mkdtempSync(path.join(tmpdir(), 'mazzi-qualidade-'));
const ler = (rel) => readFileSync(path.join(RAIZ, rel), 'utf8');

function jpeg(largura, altura) {
  const b = Buffer.alloc(21);
  b.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  b.writeUInt16BE(altura, 7);
  b.writeUInt16BE(largura, 9);
  b.set([0xff, 0xd9], 19);
  return b;
}
const capturaFalsa = async (paginas) => paginas.map((p) => {
  mkdirSync(path.dirname(p.arquivo), { recursive: true });
  writeFileSync(p.arquivo, p.formato === 'story' ? jpeg(1080, 1920) : jpeg(1080, 1350));
  return p.arquivo;
});

// Peça específica e correta (só o que clin.retornos diz, cena concreta, uma chamada).
const retornosBom = {
  gancho: 'Sua paciente passou da data do retorno?',
  slides: [
    { tipo: 'capa', layout: 'bilhete', anotacoes: [{ texto: 'ligar pra Bia' }, { texto: 'retorno?', riscado: true }], titulo: 'Sua paciente passou da data do retorno?', destaque: 'retorno' },
    { tipo: 'estaca', layout: 'manchete', titulo: 'Segunda, 9h, recepção', texto: 'Quem deveria ter voltado e ainda não marcou?' },
    { tipo: 'ideia', layout: 'cartao', titulo: 'A lista de retornos', texto: 'Mostra quem deveria voltar e quando.', cartao: { titulo: 'Retornos', linhas: [{ rotulo: 'Bia S.', selo: 'passou 5 dias', tom: 'aviso' }, { rotulo: 'Carla M.', selo: 'dia 28', tom: 'neutro' }] } },
    { tipo: 'resumo', layout: 'lista', titulo: 'Na segunda de manhã', itens: ['Abra a lista de retornos', 'Veja quem passou da data', 'Chame essa paciente'] },
    { tipo: 'chamada', layout: 'chamada', titulo: 'Quer ver a sua lista?', texto: 'Chama no WhatsApp, link na bio.' },
  ],
  legenda: 'Sua paciente passou da data do retorno?\n\nSegunda de manhã a recepção abre a lista de retornos da Mazzi: quem deveria voltar e quando.\n\nChama no WhatsApp (link na bio).\n\n#clinicadeestetica',
  alt_text: 'Capa com um bilhete de recepção e a pergunta: sua paciente passou da data do retorno?',
};
const itemRetornos = { id: 'A', dia: SEMANA, horario: '11:40', tipo: 'carrossel', ramo: 'clinica', objetivo: 'conversa', conteudo: 'ensina', tema: 'a lista de quem deveria ter voltado', angulo: 'Segunda de manhã, a recepção abre a lista de retornos.', fatos: ['clin.retornos'] };
const EDITOR_OK = () => ({ problemas: [], notas: { original: 8, humano: 8, marca: 8, novidade: 8, clareza: 8 }, cfm: [], sugestoes: [] });
// Juiz de fatos falso que liga cada afirmação como o juiz de verdade faria (a decisão continua no código).
const fatosDe = (afirmacoes) => () => ({ afirmacoes });
function cerebroFalso({ conteudos, fatos = fatosDe([]), editor = EDITOR_OK }) {
  let n = 0;
  const pedidos = [];
  return {
    pedidos,
    economico: () => false,
    pedir: async (q) => { pedidos.push(q); return conteudos[Math.min(n++, conteudos.length - 1)]; },
    juiz: (_s, etapa) => async () => (etapa === 'juiz:visual' ? editor() : etapa === 'juiz:fatos' ? fatos() : { problemas: [] }),
  };
}
const juizes = (fatos = fatosDe([])) => ({ juizFatos: async () => fatos(), juizMarca: async () => ({ problemas: [] }) });

// 1. Gancho abaixo de 70 continua reprovando (e a ferramenta do redator dá o MESMO veredito da checagem).
test('qualidade 1: gancho abaixo de 70 reprova; a ferramenta medir_gancho usa a mesma régua', async () => {
  assert.equal(config.checagens.gancho.notaMinima, 70, 'a nota mínima não baixou');
  assert.equal(config.checagens.gancho.criterioMinimo, 55);
  const fraco = 'Abriu o sistema e não sabe por onde começar?'; // C de 23/11 (nota 50)
  const g = checarGancho(fraco, config.checagens.gancho);
  assert.equal(g.ok, false);
  assert.ok(g.nota < 70);
  const conteudo = { ...retornosBom, gancho: fraco, slides: [{ ...retornosBom.slides[0], titulo: fraco }, ...retornosBom.slides.slice(1)], legenda: `${fraco}\n\nCorpo.\n\nChama no WhatsApp (link na bio).` };
  const t = await checarTexto({ item: itemRetornos, conteudo, produto, ...juizes(), usados: [], hoje: HOJE, config });
  assert.equal(t.ok, false);
  assert.ok(t.motivos.some((m) => /gancho com nota 50 \(mínimo 70\)/.test(m)), t.motivos.join('; '));
  const [medida] = medirGanchos([fraco], { config, usados: [], hoje: HOJE });
  assert.equal(medida.passa, false);
  assert.equal(medida.nota, g.nota);
  const forte = medirGanchos(['Tirou dinheiro do caixa e esqueceu?'], { config, usados: [], hoje: HOJE })[0];
  assert.equal(forte.passa, checarGancho('Tirou dinheiro do caixa e esqueceu?', config.checagens.gancho).ok);
  // A ferramenta não aprova nada: só devolve a medida em texto.
  const resposta = await ferramentaGancho({ config, usados: [], hoje: HOJE }).handler({ ganchos: [fraco] });
  assert.match(resposta.content[0].text, /"passa": false/);
});

// 2. Promessa de função inexistente ou proibida continua reprovando (S3 de 16/11 e S2 de 23/11).
test('qualidade 2: função que não está na base ou é proibida reprova pelo código', async () => {
  const inventada = fatosDe([{ trecho: 'O sistema avisa quando o fornecedor sobe o preço.', tipo: 'funcao', funcao_id: null, em_exemplo: false }]);
  const t = await checarTexto({ item: itemRetornos, conteudo: retornosBom, produto, ...juizes(inventada), usados: [], hoje: HOJE, config });
  assert.ok(t.motivos.some((m) => /fala de uma função que não está na base/.test(m)), t.motivos.join('; '));
  const proibida = fatosDe([{ trecho: 'O lembrete sai sozinho pela Meta.', tipo: 'funcao', funcao_id: 'clin.lembrete-automatico', em_exemplo: false }]);
  const t2 = await checarTexto({ item: itemRetornos, conteudo: retornosBom, produto, ...juizes(proibida), usados: [], hoje: HOJE, config });
  assert.ok(t2.motivos.some((m) => /é proibido/.test(m)), t2.motivos.join('; '));
  const resultado = fatosDe([{ trecho: 'Nunca mais paciente some.', tipo: 'resultado', funcao_id: null, em_exemplo: false }]);
  const t3 = await checarTexto({ item: itemRetornos, conteudo: retornosBom, produto, ...juizes(resultado), usados: [], hoje: HOJE, config });
  assert.ok(t3.motivos.some((m) => /inventar resultado é proibido/.test(m)), t3.motivos.join('; '));
});

// 3. Genérico e repetido continuam reprovando (G8 e o editor).
test('qualidade 3: gancho repetido das últimas semanas e peça genérica reprovam', async () => {
  const usados = [{ data: '2026-11-20', gancho: 'Sua paciente passou da data do retorno?' }];
  const t = await checarTexto({ item: itemRetornos, conteudo: retornosBom, produto, ...juizes(), usados, hoje: HOJE, config });
  assert.ok(t.motivos.some((m) => /repete o gancho de 2026-11-20/.test(m)), t.motivos.join('; '));
  assert.equal(medirGanchos(['Sua paciente passou da data do retorno?'], { config, usados, hoje: HOJE })[0].passa, false, 'a ferramenta também acusa a repetição');
  const generico = { notas: { original: 4, humano: 6, marca: 7, novidade: 4, clareza: 7 }, sugestoes: [{ criterio: 'novidade', imagem: 1, motivo: 'repete o ângulo do papel que some' }] };
  const m = motivosDoEditor(generico, config.checagens.editor);
  assert.ok(m.length && /novidade 4/.test(m[0]));
  assert.deepEqual(config.checagens.editor, { minimoCriterio: 5, maxAbaixoDe7: 1, pisos: { clareza: 6, humano: 6, novidade: 6 } }, 'os limites do editor não mudaram');
});

// 4. Específica e correta passa pelo caminho real (texto, direção de arte, validador do publicador, editor).
test('qualidade 4: peça específica e fiel à base é aprovada pelo orquestrador', async () => {
  const saida = tmp();
  const fatos = fatosDe([{ trecho: 'a lista de retornos da Mazzi: quem deveria voltar e quando', tipo: 'funcao', funcao_id: 'clin.retornos', em_exemplo: false }]);
  const cerebro = cerebroFalso({ conteudos: [retornosBom], fatos });
  const r = await produzirPeca(itemRetornos, { raiz: RAIZ, saida, semana: SEMANA, produto, config, cerebro, usados: [], hoje: HOJE, registrar: criarRegistro(saida), capturar: capturaFalsa, capas: [], recentes: [] });
  assert.equal(r.status, 'aprovada', JSON.stringify(r.motivos));
  // O redator recebeu o texto exato da função, a régua com a lista de palavras concretas e a ferramenta.
  const [pedido] = cerebro.pedidos;
  assert.match(pedido.prompt, /clin\.retornos: Lista de retornos: quem deveria voltar e quando\./);
  assert.match(pedido.prompt, /RÉGUA DO GANCHO/);
  assert.deepEqual(pedido.ferramentas.map((f) => f.name), ['medir_gancho']);
  assert.ok(pedido.maxTurns >= 6);
});

// 5. Clínica e restaurante: pautas e prompt separados; ramo sem base (spa) nunca entra.
test('qualidade 5: clínica e restaurante têm pautas e orientação próprias; spa não entra', () => {
  const pautas = pautasEvergreen(produto);
  assert.ok(pautas.filter((p) => p.ramo === 'clinica').length >= 4);
  assert.ok(pautas.filter((p) => p.ramo === 'restaurante').length >= 4);
  for (const p of pautas) {
    const prefixos = new Set(p.fatos.map((f) => f.split('.')[0]));
    if (p.ramo === 'clinica') assert.ok(!prefixos.has('rest'), `${p.chave} mistura restaurante`);
    if (p.ramo === 'restaurante') assert.ok(!prefixos.has('clin'), `${p.chave} mistura clínica`);
    assert.ok(!/cadastro aberto|convite/i.test(p.angulo), 'nenhuma pauta depende de afirmação sem função na base');
  }
  const soClinica = pautasEvergreen({ ...produto, ramos: ['clinica'] });
  assert.ok(soClinica.every((p) => p.ramo !== 'restaurante'));
  assert.ok(pautasEvergreen({ ...produto, ramos: ['clinica', 'restaurante', 'spa'] }).every((p) => p.ramo !== 'spa'));
  const semRetornos = { ...produto, funcoes: produto.funcoes.map((f) => (f.id === 'clin.retornos' ? { ...f, status: 'proibido', motivo: 'saiu' } : f)) };
  assert.ok(!pautasEvergreen(semRetornos).some((p) => p.fatos.includes('clin.retornos')), 'função fora do ar tira a pauta');
  const clin = promptPeca(itemRetornos, [], null, { produto, config });
  const rest = promptPeca({ ...itemRetornos, ramo: 'restaurante', fatos: ['rest.caixa'] }, [], null, { produto, config });
  assert.match(clin, /Clínica: fale da recepção/);
  assert.doesNotMatch(clin, /Restaurante: fale do balcão/);
  assert.match(rest, /Restaurante: fale do balcão/);
  assert.match(rest, /rest\.caixa: Caixa com abertura/);
});

// O gancho que o plano fixa no ângulo e que reprova é avisado ao redator (C de 23/11 voltou a ele na 3ª tentativa).
test('qualidade: gancho fraco sugerido no ângulo é avisado; a régua lista as mesmas palavras concretas do código', () => {
  const item = { ...itemRetornos, angulo: 'Gancho: "Abriu o sistema e não sabe por onde começar?". Mostra a lista.' };
  assert.equal(ganchoSugerido(item.angulo), 'Abriu o sistema e não sabe por onde começar?');
  assert.match(promptPeca(item, [], null, { produto, config }), /tira nota 50 na régua e REPROVA: não use/);
  const bom = { ...itemRetornos, angulo: 'Gancho: "Tirou dinheiro do caixa e esqueceu?". Rotina.' };
  assert.doesNotMatch(promptPeca(bom, [], null, { produto, config }), /REPROVA/);
  for (const p of CONCRETOS) assert.ok(REGUA_GANCHO.includes(p), p);
});

// 6. Peça pulada é definitiva.
test('qualidade 6: peça pulada nunca volta para a produção', async () => {
  const saida = tmp();
  const dir = path.join(saida, 'semanas', SEMANA);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'plano.json'), JSON.stringify({ semana: SEMANA, pecas: [{ ...itemRetornos, situacao: 'pulada' }] }));
  const cerebro = cerebroFalso({ conteudos: [retornosBom] });
  const r = await produzirPendentes({ raiz: RAIZ, saida, semana: SEMANA, produto, config, cerebro, usados: [], hoje: HOJE, registrar: criarRegistro(saida), capturar: capturaFalsa, desde: SEMANA, ate: dataMais(SEMANA, 6) });
  assert.deepEqual(r.feitas, []);
  assert.equal(cerebro.pedidos.length, 0);
  assert.equal(JSON.parse(readFileSync(path.join(dir, 'plano.json'), 'utf8')).pecas[0].situacao, 'pulada');
});

function bancoCom(pecas) {
  const banco = tmp();
  for (const [i, extra] of pecas.entries()) {
    const origem = tmp();
    const arquivos = [1, 2, 3, 4, 5].map((k) => `x-R${i}-0${k}.jpg`);
    for (const a of arquivos) writeFileSync(path.join(origem, a), jpeg(1080, 1350));
    guardar(banco, { id: `R${i}`, dia: '2026-11-09', horario: '07:40', tipo: 'carrossel', arquivos, tema: 'clinica · a lista de quem deveria ter voltado', gancho: 'Sua paciente passou da data do retorno?', ramo: 'clinica', objetivo: 'conversa', ia: false, origem: 'agente', fatos: ['clin.retornos'], tentativas: 1, legenda: 'Sua paciente passou da data do retorno?\n\nChama no WhatsApp (link na bio).', ...extra }, origem, { rid: `r${i}`, hoje: '2026-11-01' });
  }
  return banco;
}

// 7. Descanso de 90 dias.
test('qualidade 7: peça do banco usada há menos de 90 dias não volta; com 90, volta', () => {
  const [r] = lerReserva(bancoCom([{}]));
  assert.deepEqual(motivosParaNaoUsar({ ...r, usada_em: [dataMais(HOJE, -89)] }, { produto, hoje: HOJE }).length, 1);
  assert.deepEqual(motivosParaNaoUsar({ ...r, usada_em: [dataMais(HOJE, -90)] }, { produto, hoje: HOJE }), []);
});

// 8. Reprovada não entra no banco nem conta como válida.
test('qualidade 8: reposição reprovada não entra no banco e fica registrada com a pauta', async () => {
  const banco = tmp();
  const saida = tmp();
  const ruim = { ...retornosBom, gancho: 'Abriu o sistema e não sabe por onde começar?', slides: [{ ...retornosBom.slides[0], titulo: 'Abriu o sistema e não sabe por onde começar?' }, ...retornosBom.slides.slice(1)] };
  const cerebro = cerebroFalso({ conteudos: [ruim] });
  const feitas = await encherReserva({ banco, maximo: 3, raiz: RAIZ, saida, semana: SEMANA, produto, config, cerebro, usados: [], hoje: HOJE, registrar: criarRegistro(saida), capturar: capturaFalsa });
  assert.equal(feitas.length, 3);
  assert.ok(feitas.every((f) => f.status === 'pulada'));
  assert.equal(new Set(feitas.map((f) => f.tema)).size, 3, 'três pautas diferentes na mesma rodada');
  assert.deepEqual(lerReserva(banco), []);
  assert.equal(situacao(banco, { produto, hoje: HOJE }).total, 0);
  const linhas = readdirSync(path.join(saida, 'registro')).flatMap((f) => readFileSync(path.join(saida, 'registro', f), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
  assert.equal(linhas.filter((l) => l.tipo === 'reprovada' && /^reserva\//.test(l.peca)).length, 3);
});

// 9. Fluxo semanal da reposição: aprovada entra com id único; pauta gira entre semanas e não repete tema do banco.
test('qualidade 9: reposição aprovada entra no banco; pautas giram por semana e evitam tema que o banco já tem', async () => {
  const banco = tmp();
  const saida = tmp();
  const feitas = await encherReserva({ banco, maximo: 1, raiz: RAIZ, saida, semana: SEMANA, produto, config, cerebro: cerebroFalso({ conteudos: [retornosBom] }), usados: [], hoje: HOJE, registrar: criarRegistro(saida), capturar: capturaFalsa });
  assert.equal(feitas[0].status, 'aprovada');
  const [r] = lerReserva(banco);
  assert.ok(r.rid.startsWith(`${HOJE}-carrossel-`), r.rid);
  assert.equal(situacao(banco, { produto, hoje: HOJE }).total, 1);

  const pautas = pautasEvergreen(produto);
  const a = escolherPautas(pautas, { quantas: 2, semente: 100 }).map((p) => p.chave);
  const b = escolherPautas(pautas, { quantas: 2, semente: 101 }).map((p) => p.chave);
  assert.notDeepEqual(a, b, 'semana seguinte tenta outras pautas');
  const dois = escolherPautas(pautas, { quantas: 2, semente: 7 });
  assert.notEqual(dois[0].ramo, dois[1].ramo, 'alterna o ramo');
  const comRetornos = escolherPautas(pautas, { banco: [{ tema: 'clinica · a lista de quem deveria ter voltado', fatos: ['clin.retornos'] }], quantas: pautas.length, semente: 0 });
  assert.ok(!comRetornos.some((p) => p.chave === 'clin-retornos'));
});

// Planejador: vê quais funções estão esquecidas (a semana de 16/11 girou em agenda, ficha e caixa no caderno).
test('qualidade: o plano recebe o uso das funções, a régua e a ferramenta do gancho', () => {
  const uso = usoDasFuncoes(produto, [{ fatos: ['clin.agenda', 'clin.agenda'] }, { fatos: ['clin.agenda', 'rest.caixa'] }]);
  assert.equal(uso.at(-1).id, 'clin.agenda');
  assert.equal(uso.at(-1).vezes, 3);
  assert.ok(uso.every((u) => !u.id.startsWith('spa.')));
  const p = promptPlano({ semana: SEMANA, config, formatos: ['carrossel', 'reel', 'stories', 'imagem'], estadoResumo: '', ganchosRecentes: [], novidades: [], usoFuncoes: uso });
  assert.match(p, /USO DAS FUNÇÕES NAS ÚLTIMAS 6 SEMANAS/);
  assert.match(p, /- clin\.agenda: 3/);
  assert.match(p, /medir_gancho/);
});

// 10. Aviso da reserva: só o semanal e o diário fecham (PR #19), e agora o semanal também confere o banco.
test('qualidade 10: stories não fecha o aviso; semanal e diário conferem a reserva antes de fechar', () => {
  const yml = ler('.github/workflows/agente.yml');
  const passo = yml.slice(yml.indexOf('- name: Fechar aviso resolvido'));
  assert.match(passo, /if: success\(\) && steps\.qual\.outputs\.comando != 'stories'/);
  const fonte = ler('agente/agente.mjs');
  const semanal = fonte.slice(fonte.indexOf("if (comando === 'semanal')"), fonte.indexOf("} else if (comando === 'diario')"));
  assert.match(semanal, /avisosDaReserva\(/, 'o semanal confere a reserva (senão fecharia o aviso com o banco vazio)');
  const diario = fonte.slice(fonte.indexOf("} else if (comando === 'diario')"));
  assert.match(diario, /avisosDaReserva\(/);
  // Banco com 6 peças em descanso: aviso de reserva baixa.
  const banco = bancoCom(Array.from({ length: 6 }, () => ({ usada_em: ['2026-11-14'] })));
  const avisos = avisosDaReserva({ saida: tmp(), hoje: HOJE, produto, banco });
  assert.ok(avisos.some((a) => a.peca === 'banco reserva' && /só 0 peça/.test(a.mensagem)), JSON.stringify(avisos));
});
