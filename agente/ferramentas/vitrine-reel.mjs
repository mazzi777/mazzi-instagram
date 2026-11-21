// Vitrine das cenas de interface do reel: renderiza quadros REAIS pelo mesmo Remotion do pipeline (video/raiz.jsx),
// com os casos que reprovaram no juiz visual em 21/11 (contador "532g", cartão "Estoque EXEMPLO" em fundo claro) e
// casos extremos. Opcional: passa os quadros pelo juiz visual original (G7, a mesma tarefa do pipeline).
//   node agente/ferramentas/vitrine-reel.mjs <pasta-de-saida> [--juiz]
// Não publica nada e não mexe na reserva nem na agenda. Os textos são só amostra de diagramação.
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ffmpeg, rodar } from './binarios.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export const AMOSTRAS = [
  { nome: 'contador-peso-claro', tipo: 'contador', ato: 'claro', dados: { tela: 'O peso já entra no caixa', rotulo: 'Peso do prato', valor: 532, sufixo: 'g' } },
  { nome: 'contador-gramas-escuro', tipo: 'contador', ato: 'escuro', dados: { tela: 'A balança manda o peso', rotulo: 'Peso em gramas', valor: 532 } },
  { nome: 'contador-extremo-coral', tipo: 'contador', ato: 'coral', dados: { tela: 'Sessões do pacote', rotulo: 'Sessões usadas no pacote', valor: 999, total: 999, sufixo: 'kg' } },
  { nome: 'contador-curto-azul', tipo: 'contador', ato: 'azul', dados: { tela: 'Pacote da Ana', rotulo: 'Sessão', valor: 4, total: 10 } },
  { nome: 'cartao-estoque-claro', tipo: 'cartao', ato: 'claro', dados: { tela: 'O alerta chega antes', cartao: { titulo: 'Estoque EXEMPLO', linhas: [{ rotulo: 'Refrigerante lata', selo: '6 unidades', tom: 'aviso' }, { rotulo: 'Água sem gás', selo: 'ok', tom: 'ok' }] } } },
  { nome: 'cartao-longo-escuro', tipo: 'cartao', ato: 'escuro', dados: { tela: 'A lista de retornos', cartao: { titulo: 'Exemplo: Retornos da semana', linhas: [{ rotulo: 'Bianca Souza Lima Ferraz', selo: 'passou 5 dias', tom: 'aviso' }, { rotulo: 'Carla M.', selo: 'dia 28', tom: 'neutro' }, { rotulo: 'Dona Lurdes', selo: 'retorno hoje', tom: 'ok' }] } } },
  { nome: 'papel-bebidas', tipo: 'papel', ato: 'claro', dados: { tela: 'Caderno x Mazzi', rabiscos: ['coca 2L?', 'contar sexta', 'faltou guaraná'], cartao: { titulo: 'Bebidas (exemplo)', linhas: [{ rotulo: 'Guaraná 2L', selo: 'mínimo', tom: 'aviso' }] } } },
  { nome: 'painel-vendas', tipo: 'painel', ato: 'escuro', dados: { tela: 'Vendas menos compras', titulo: 'Semana', linhas: [{ rotulo: 'Vendas', selo: 'R$ 8.420', tom: 'ok' }, { rotulo: 'Compras', selo: 'R$ 5.100', tom: 'neutro' }] } },
  { nome: 'celular-lembrete', tipo: 'celular', ato: 'escuro', dados: { tela: 'O lembrete sai pronto', contato: 'Clínica Bela', mensagens: [{ lado: 'negocio', texto: 'Oi, Ana! Amanhã, 14h. Confirma?' }, { lado: 'cliente', texto: 'Confirmo!' }] } },
];

const QUADROS = 90; // cada cena tem 3 s; o quadro capturado é o 70 (animação de entrada pronta, longe da saída)
export const QUADRO_CAPTURA = 70;

export function propsDaVitrine(amostras = AMOSTRAS) {
  const cenas = amostras.map((a, i) => ({ de: i * QUADROS, ate: (i + 1) * QUADROS, tipo: a.tipo, ato: a.ato, entrada: 'corte', saida: null, batidasLocais: [0, 10, 20, 30, 40, 50], dados: a.dados }));
  return { cenas, palavras: [], audio: 'narracao.wav', musica: null, sfx: [], duracaoFrames: amostras.length * QUADROS };
}

export async function renderizarVitrine(pasta, amostras = AMOSTRAS) {
  const publico = mkdtempSync(path.join(tmpdir(), 'vitrine-reel-'));
  for (const peso of [500, 700, 800, 900]) copyFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${peso}-normal.woff2`), path.join(publico, `inter-${peso}.woff2`));
  copyFileSync(require.resolve('@fontsource/caveat/files/caveat-latin-600-normal.woff2'), path.join(publico, 'caveat-600.woff2'));
  rodar(ffmpeg(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '1', path.join(publico, 'narracao.wav')]);
  const { bundle } = await import('@remotion/bundler');
  const { selectComposition, renderStill } = await import('@remotion/renderer');
  const serveUrl = await bundle({ entryPoint: path.join(AQUI, '..', 'video', 'raiz.jsx'), publicDir: publico });
  const props = propsDaVitrine(amostras);
  const composition = await selectComposition({ serveUrl, id: 'ReelMotion', inputProps: props });
  mkdirSync(pasta, { recursive: true });
  const arquivos = [];
  for (const [i, a] of amostras.entries()) {
    const png = path.join(pasta, `${a.nome}.png`);
    await renderStill({ composition, serveUrl, output: png, frame: i * QUADROS + QUADRO_CAPTURA, inputProps: props });
    const jpg = png.replace(/\.png$/, '.jpg');
    rodar(ffmpeg(), ['-v', 'error', '-y', '-i', png, '-q:v', '3', jpg]);
    arquivos.push(jpg);
  }
  return arquivos;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pasta = path.resolve(process.argv[2] ?? 'vitrine-reel');
  const arquivos = await renderizarVitrine(pasta);
  console.log(`${arquivos.length} quadros em ${pasta}`);
  if (process.argv.includes('--juiz')) {
    // Juiz visual ORIGINAL (mesma tarefa TAREFA_JUIZ_VISUAL do pipeline), um quadro por vez.
    const { criarCerebro } = await import('../cerebro.mjs');
    const { TAREFA_JUIZ_VISUAL } = await import('../checagens/visual.mjs');
    const { z } = await import('zod');
    const config = JSON.parse(readFileSync(path.join(AQUI, '..', 'config.json'), 'utf8'));
    const cerebro = criarCerebro({ raiz: mkdtempSync(path.join(tmpdir(), 'vitrine-uso-')), config });
    const Schema = z.object({ problemas: z.array(z.object({ imagem: z.number().int().min(1), problema: z.string().min(3) })) });
    const juiz = cerebro.juiz(Schema, 'juiz:visual', config.modelos.juizVisual);
    for (const a of arquivos) {
      const r = await juiz(TAREFA_JUIZ_VISUAL, `reel · quadro de interface (${path.basename(a)})`, [a]);
      console.log(`${path.basename(a)}: ${r.problemas.length ? r.problemas.map((p) => p.problema).join(' | ') : 'sem problemas'}`);
    }
  }
}
