// Vitrine dos layouts: renderiza cada layout em cada fundo com texto de amostra, para conferir a direção de arte.
//   node agente/ferramentas/vitrine.mjs <pasta-de-saida>
// Não usa o Claude nem publica nada. Os textos aqui são só amostra de diagramação.
import path from 'node:path';
import { capturar } from '../imagens/capturar.mjs';
import { htmlSlide, htmlStory, LAYOUTS } from '../imagens/modelos.mjs';

const AMOSTRA = {
  manchete: { titulo: 'A ficha de papel não avisa ninguém', destaque: 'não avisa', texto: 'No tablet, o alerta de anticoagulante aparece antes do atendimento.' },
  pergunta: { titulo: 'A bebida acabou e ninguém viu?', texto: 'Sábado cheio, geladeira vazia.' },
  passo: { titulo: 'Ela preenche no tablet', passo: 1, texto: 'A paciente assina a anamnese e o termo com o dedo.' },
  conversa: { titulo: 'Visualizou o orçamento e sumiu?', conversa: [{ lado: 'negocio', texto: 'Segue o orçamento do pacote de 4 sessões' }, { lado: 'cliente', texto: 'Vou ver e te falo' }, { lado: 'negocio', texto: 'Aprovado! Já deixei sua agenda pronta' }] },
  comparativo: { titulo: 'O troco no delivery', lados: { a: { rotulo: 'No caderno', itens: ['troco pra 50?', 'nº 4 saiu?', 'sem talher'] }, b: { rotulo: 'No sistema', itens: ['troco na via do motoboy', 'pedido nº 4 conferido', 'talher marcado'] } } },
  cartao: { titulo: 'O lote que vence primeiro', cartao: { titulo: 'Estoque', linhas: [{ rotulo: 'Toxina · lote A12', selo: 'vence em 30 dias', tom: 'aviso' }, { rotulo: 'Preenchedor · lote B7', selo: 'ok', tom: 'ok' }] } },
  bilhete: { titulo: 'O caixa do caderno sempre bate', texto: 'Porque ninguém confere.', anotacoes: [{ texto: 'abertura 200' }, { texto: 'sangria 150', riscado: true }, { texto: 'fechou ok?' }] },
  lista: { titulo: 'Antes de fechar o caixa', itens: ['Conta a gaveta', 'Lança a sangria', 'Confere o Pix', 'Anota a diferença'] },
  frase: { titulo: 'Lucro é o que sobra depois das compras.', texto: 'O resto é movimento.' },
  chamada: { titulo: 'Chama no WhatsApp', texto: 'A gente te manda o convite.' },
};

const pasta = path.resolve(process.argv[2] ?? 'vitrine');
const paginas = [];
for (const [nome, def] of Object.entries(LAYOUTS)) {
  for (const fundo of def.fundos) {
    paginas.push({ formato: 'carrossel', arquivo: path.join(pasta, `${nome}-${fundo}.jpg`), html: htmlSlide({ ...AMOSTRA[nome], layout: nome, fundo }, { ramo: 'clinica', numero: 2, total: 7 }) });
  }
}
paginas.push({ formato: 'story', arquivo: path.join(pasta, 'story-conversa-papel.jpg'), html: htmlStory({ ...AMOSTRA.conversa, layout: 'conversa', fundo: 'papel' }, { ramo: 'clinica' }) });
paginas.push({ formato: 'story', arquivo: path.join(pasta, 'story-pergunta-coral.jpg'), html: htmlStory({ ...AMOSTRA.pergunta, layout: 'pergunta', fundo: 'coral' }, { ramo: 'restaurante' }) });
const feitos = await capturar(paginas);
console.log(`${feitos.length} imagens em ${pasta}`);
if (feitos.problemas.length) console.log(`Problemas de diagramação:\n- ${feitos.problemas.join('\n- ')}`);
