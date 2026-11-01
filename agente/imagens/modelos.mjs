// Modelos HTML das peças de imagem, no visual que já está no ar (guia/marca.md › Visual):
// fundo grafite #111316, texto #F3F1EC, coral #FF7A50, Inter, @mazzisystems em toda peça,
// cartão de interface sempre marcado "EXEMPLO" (nunca print do sistema).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fonte = (peso) => readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${peso}-normal.woff2`)).toString('base64');
let fontesCss;
function fontes() {
  fontesCss ??= [400, 500, 700, 800].map((p) => `@font-face{font-family:Inter;font-weight:${p};src:url(data:font/woff2;base64,${fonte(p)}) format('woff2')}`).join('');
  return fontesCss;
}

export const MEDIDAS = { carrossel: [1080, 1350], imagem: [1080, 1350], story: [1080, 1920] };
const ROTULO = { clinica: 'Clínica', restaurante: 'Restaurante', comum: 'Mazzi Systems' };

const esc = (t = '') => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Título com a palavra de destaque em coral (o padrão da marca nas capas). */
function titulo(texto, destaque) {
  const t = esc(texto);
  if (!destaque || !texto.includes(destaque)) return t;
  const i = t.lastIndexOf(esc(destaque));
  return `${t.slice(0, i)}<span class="coral">${esc(destaque)}</span>${t.slice(i + esc(destaque).length)}`;
}

const TONS = { ok: ['#1f3a2b', '#6fd39a'], aviso: ['#3d3220', '#f2c46d'], ruim: ['#40211f', '#f08a80'], neutro: ['#262a31', '#c9c6bf'] };

/** Cartão de interface. O selo EXEMPLO é colocado aqui, não pelo redator: não tem como faltar. */
function cartao(c) {
  if (!c) return '';
  const linhas = c.linhas.map((l) => {
    const [fundo, cor] = TONS[l.tom ?? 'neutro'];
    const selo = l.selo ? `<span class="selo" style="background:${fundo};color:${cor}">${esc(l.selo)}</span>` : '';
    return `<div class="linha"><span>${esc(l.rotulo)}</span>${selo}</div>`;
  }).join('');
  return `<div class="cartao"><div class="exemplo">EXEMPLO${c.titulo ? ` · ${esc(c.titulo).toUpperCase()}` : ''}</div>${linhas}</div>`;
}

const CSS = (l, a, story) => `
${fontes()}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${l}px;height:${a}px;background:#111316;color:#F3F1EC;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
.peca{position:relative;width:${l}px;height:${a}px;padding:${story ? '250px 110px 320px' : '64px 130px'};display:flex;flex-direction:column}
.topo{display:flex;justify-content:space-between;font-size:${story ? 34 : 32}px;font-weight:700;letter-spacing:.08em}
.ramo{color:#FF7A50;text-transform:uppercase}
.pagina{color:#9a9890;letter-spacing:.02em;font-weight:500}
.corpo{flex:1;display:flex;flex-direction:column;justify-content:safe center;gap:40px;min-height:0;margin:28px 0}
.traco{width:120px;height:12px;border-radius:6px;background:#FF7A50}
.num{color:#FF7A50;font-size:48px;font-weight:700}
h1{font-weight:800;letter-spacing:-.035em;line-height:1.02;font-size:var(--fs,112px)}
.coral{color:#FF7A50}
.texto{font-size:${story ? 44 : 42}px;line-height:1.38;color:#c9c6bf;font-weight:400}
.cartao{background:#1d2026;border:2px solid #2c3038;border-radius:28px;padding:36px 40px 18px}
.exemplo{font-size:26px;font-weight:700;letter-spacing:.14em;color:#8b8f97;margin-bottom:14px}
.linha{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:20px 0;border-top:2px solid #2c3038;font-size:38px}
.exemplo+.linha{border-top:0}
.selo{font-size:30px;font-weight:700;padding:8px 22px;border-radius:999px;white-space:nowrap}
.rodape{display:flex;justify-content:space-between;font-size:32px;color:#9a9890;font-weight:500}
.lista{display:flex;flex-direction:column;gap:22px;font-size:42px;line-height:1.3}
.lista div{display:flex;gap:22px}.lista b{color:#FF7A50;font-weight:700}
`;

// Encolhe o título (e depois o texto) até caber, sem cortar palavra. Depois MEDE: se ainda transborda,
// encosta na borda ou invade o topo/rodapé, marca data-problema e a peça reprova na checagem técnica (G6).
// Roda depois que a fonte Inter carregou (medir com a fonte reserva daria outro tamanho).
const AJUSTE = `<script>
document.fonts.ready.then(()=>{
const h=document.querySelector('h1'),c=document.querySelector('.corpo'),t=document.querySelector('.texto');
const sobra=()=>c.scrollHeight>c.clientHeight+1||(h&&h.scrollWidth>h.clientWidth+1);
if(h){let fs=parseFloat(getComputedStyle(h).fontSize);while(fs>56&&sobra()){fs-=4;h.style.setProperty('--fs',fs+'px')}}
if(t){let fs=parseFloat(getComputedStyle(t).fontSize);while(fs>32&&sobra()){fs-=2;t.style.fontSize=fs+'px'}}
const r=(e)=>e.getBoundingClientRect(),cr=r(c),problemas=[];
if(sobra())problemas.push('o conteúdo não coube na peça');
for(const e of c.querySelectorAll('h1,.texto,.cartao,.lista,.traco,.num')){const b=r(e);
if(b.top<cr.top-1||b.bottom>cr.bottom+1)problemas.push('elemento saiu da área do conteúdo e encostou no topo ou no rodapé');
if(b.left<0||b.right>innerWidth)problemas.push('elemento saiu pela lateral');}
document.body.dataset.problema=[...new Set(problemas)].join('; ');
document.body.dataset.pronto='1';
});
</script>`;

function pagina({ formato, ramo, numero, total, corpo, seguir }) {
  const [l, a] = MEDIDAS[formato];
  const story = formato === 'story';
  const topo = `<div class="topo"><span class="ramo">${esc(ROTULO[ramo] ?? '')}</span>${total ? `<span class="pagina">${numero}/${total}</span>` : ''}</div>`;
  const rodape = `<div class="rodape"><span>@mazzisystems</span>${seguir ? '<span>arrasta →</span>' : ''}</div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${CSS(l, a, story)}</style></head>
<body><div class="peca">${topo}<div class="corpo">${corpo}</div>${rodape}</div>${AJUSTE}</body></html>`;
}

/** Slide de carrossel. slide: { tipo: capa|ideia|resumo|chamada, titulo, destaque?, texto?, passo?, itens?, cartao? } */
export function htmlSlide(slide, { ramo, numero, total }) {
  let corpo;
  if (slide.tipo === 'capa') {
    corpo = `<div class="traco"></div><h1 style="--fs:124px">${titulo(slide.titulo, slide.destaque)}</h1>${slide.texto ? `<p class="texto">${esc(slide.texto)}</p>` : ''}`;
  } else if (slide.tipo === 'resumo') {
    // O modelo numera; número que o redator já tenha posto ("1.", "2)") sai, para não ficar "1 1.".
    const itens = (slide.itens ?? []).map((t, i) => `<div><b>${i + 1}</b><span>${esc(t.replace(/^\s*\d+\s*[.)\-:]\s*/, ''))}</span></div>`).join('');
    corpo = `<h1 style="--fs:84px">${titulo(slide.titulo, slide.destaque)}</h1><div class="lista">${itens}</div>`;
  } else {
    const passo = slide.passo ? `<div class="num">${slide.passo}</div>` : '';
    corpo = `${passo}<h1 style="--fs:96px">${titulo(slide.titulo, slide.destaque)}</h1>${slide.texto ? `<p class="texto">${esc(slide.texto)}</p>` : ''}${cartao(slide.cartao)}`;
  }
  return pagina({ formato: 'carrossel', ramo, numero, total, corpo, seguir: numero < total });
}

/** Post de imagem única: mesmo desenho da capa, com texto e cartão opcionais. */
export function htmlImagem(peca, { ramo }) {
  const corpo = `<div class="traco"></div><h1 style="--fs:104px">${titulo(peca.titulo, peca.destaque)}</h1>${peca.texto ? `<p class="texto">${esc(peca.texto)}</p>` : ''}${cartao(peca.cartao)}`;
  return pagina({ formato: 'imagem', ramo, corpo });
}

/** Quadro de story (texto entre y=250 e y=1600, sem figurinha: a API não aceita). */
export function htmlStory(quadro, { ramo }) {
  const corpo = `<h1 style="--fs:104px">${titulo(quadro.titulo, quadro.destaque)}</h1>${quadro.texto ? `<p class="texto">${esc(quadro.texto)}</p>` : ''}${cartao(quadro.cartao)}`;
  return pagina({ formato: 'story', ramo, corpo });
}
