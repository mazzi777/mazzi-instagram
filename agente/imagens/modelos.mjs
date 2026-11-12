// Modelos HTML das peças de imagem (carrossel, imagem única e stories). Direção de arte em guia/direcao-de-arte.md.
// Marca fixa: grafite #111316, papel #F3F1EC, coral #FF7A50, Inter (títulos e texto) e Caveat (só o que é "escrito à mão").
// O que varia: 10 layouts (composições) e 3 fundos. O redator escolhe o layout de cada slide; o código escolhe o fundo
// (direcao.mjs) para o grid não virar um bloco só. @mazzisystems em toda peça; interface sempre com o selo "EXEMPLO".
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const woff = (pacote, arquivo) => readFileSync(require.resolve(`@fontsource/${pacote}/files/${arquivo}`)).toString('base64');
let fontesCss;
function fontes() {
  fontesCss ??= [
    ...[400, 500, 600, 700, 800].map((p) => `@font-face{font-family:Inter;font-weight:${p};src:url(data:font/woff2;base64,${woff('inter', `inter-latin-${p}-normal.woff2`)}) format('woff2')}`),
    `@font-face{font-family:Caveat;font-weight:600;src:url(data:font/woff2;base64,${woff('caveat', 'caveat-latin-600-normal.woff2')}) format('woff2')}`,
  ].join('');
  return fontesCss;
}

export const MEDIDAS = { carrossel: [1080, 1350], imagem: [1080, 1350], story: [1080, 1920] };
const ROTULO = { clinica: 'para clínicas', restaurante: 'para restaurantes', comum: 'Mazzi Systems' };

/**
 * Os layouts. `fundos`: onde ele funciona (o 1º é o preferido); `capa`: pode abrir o carrossel / ser a imagem única;
 * `precisa`: campo do conteúdo sem o qual o layout não tem o que mostrar.
 */
export const LAYOUTS = {
  manchete: { fundos: ['escuro', 'papel'], capa: true, uso: 'título grande à esquerda e um texto curto; o padrão para explicar uma ideia' },
  pergunta: { fundos: ['papel', 'coral', 'escuro'], capa: true, uso: 'uma pergunta ou frase curta enorme, centralizada, quase sem texto; para a dor e para a capa' },
  passo: { fundos: ['escuro', 'papel'], capa: false, precisa: 'passo', uso: 'número gigante vazado + título + texto; SÓ quando os slides são uma sequência de verdade (passo 1, 2, 3)' },
  conversa: { fundos: ['papel', 'escuro'], capa: true, precisa: 'conversa', uso: 'bolhas de conversa (EXEMPLO) entre o negócio e o cliente/paciente; para orçamento, confirmação, pedido' },
  comparativo: { fundos: ['escuro', 'papel'], capa: true, precisa: 'lados', uso: 'dois lados: à esquerda o jeito de caderno (manuscrito e riscado), à direita o que a tela mostra' },
  cartao: { fundos: ['escuro', 'papel', 'coral'], capa: true, precisa: 'cartao', uso: 'cartão de interface EXEMPLO grande e levemente inclinado, título curto em cima; para mostrar a função' },
  bilhete: { fundos: ['escuro', 'coral'], capa: true, precisa: 'anotacoes', uso: 'folha de caderno com anotações à mão (algumas riscadas); para a dor do papel, da cabeça, do caderno' },
  lista: { fundos: ['escuro', 'papel'], capa: false, precisa: 'itens', uso: 'checklist marcado; para o resumo que a pessoa printa' },
  frase: { fundos: ['coral', 'papel'], capa: true, uso: 'uma opinião da marca em frase grande com aspas; para opinião e virada' },
  chamada: { fundos: ['coral', 'papel', 'escuro'], capa: false, uso: 'o pedido final (WhatsApp, salvar, compartilhar), grande e sozinho' },
};
export const NOMES_LAYOUT = Object.keys(LAYOUTS);
export const FUNDOS = ['escuro', 'papel', 'coral'];

/** Layout de quem não escolheu (semanas e reservas antigas): o desenho de antes, por tipo de slide. */
export function layoutPadrao(s, formato = 'carrossel') {
  if (s.layout) return s.layout;
  if (formato !== 'carrossel') return s.cartao ? 'cartao' : 'manchete';
  if (s.tipo === 'resumo') return 'lista';
  if (s.tipo === 'chamada') return 'chamada';
  if (s.tipo === 'ideia' && s.passo) return 'passo';
  if (s.cartao && s.tipo !== 'capa') return 'cartao';
  return 'manchete';
}

const esc = (t = '') => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Título com o destaque (no escuro é coral; no papel, marca-texto coral; no coral, sublinhado grafite). */
function titulo(texto, destaque) {
  const t = esc(texto);
  if (!destaque || !texto.includes(destaque)) return t;
  const i = t.lastIndexOf(esc(destaque));
  return `${t.slice(0, i)}<span class="dest">${esc(destaque)}</span>${t.slice(i + esc(destaque).length)}`;
}
const paragrafo = (t) => (t ? `<p class="texto">${esc(t)}</p>` : '');

const TONS = { ok: ['#1f3a2b', '#6fd39a'], aviso: ['#3d3220', '#f2c46d'], ruim: ['#40211f', '#f08a80'], neutro: ['#262a31', '#c9c6bf'] };
const TONS_CLARO = { ok: ['#dcefe2', '#1e6b3f'], aviso: ['#f6e7c8', '#7a5410'], ruim: ['#f7d9d5', '#9b2c22'], neutro: ['#e7e4dd', '#3c3f45'] };

/** Cartão de interface. O selo EXEMPLO é colocado aqui, não pelo redator: não tem como faltar. */
function cartao(c, fundo, grande = false) {
  if (!c) return '';
  const tons = fundo === 'escuro' ? TONS : TONS_CLARO;
  const linhas = c.linhas.map((l) => {
    const [bg, cor] = tons[l.tom ?? 'neutro'];
    const selo = l.selo ? `<span class="selo" style="background:${bg};color:${cor}">${esc(l.selo)}</span>` : '';
    return `<div class="linha"><span>${esc(l.rotulo)}</span>${selo}</div>`;
  }).join('');
  return `<div class="cartao escala${grande ? ' grande' : ''}"><div class="exemplo">EXEMPLO${c.titulo ? ` · ${esc(c.titulo)}` : ''}</div>${linhas}</div>`;
}

const CORES = {
  escuro: { bg: '#111316', fg: '#F3F1EC', sub: '#b4b1a9', fraco: '#8f8c85', linha: '#2c3038', card: '#1d2026', acento: '#FF7A50' },
  papel: { bg: '#F3F1EC', fg: '#111316', sub: '#45484e', fraco: '#6b6d72', linha: '#d8d3c8', card: '#ffffff', acento: '#FF7A50' },
  coral: { bg: '#FF7A50', fg: '#111316', sub: '#3a1d12', fraco: '#5a2c1c', linha: 'rgba(17,19,22,.22)', card: '#F3F1EC', acento: '#111316' },
};

const CSS = (l, a, story, fundo) => {
  const k = CORES[fundo] ?? CORES.escuro;
  const dest = { escuro: 'color:var(--acento)', papel: 'background:linear-gradient(transparent 58%,#FF7A50 58%,#FF7A50 92%,transparent 92%);padding:0 .06em', coral: 'text-decoration:underline;text-decoration-thickness:.09em;text-underline-offset:.12em' }[fundo] ?? 'color:var(--acento)';
  return `
${fontes()}
:root{--bg:${k.bg};--fg:${k.fg};--sub:${k.sub};--fraco:${k.fraco};--linha:${k.linha};--card:${k.card};--acento:${k.acento}}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${l}px;height:${a}px;background:var(--bg);color:var(--fg);font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
.peca{position:relative;width:${l}px;height:${a}px;padding:${story ? '250px 110px 320px' : '64px 120px'};display:flex;flex-direction:column;overflow:hidden}
.topo{display:flex;justify-content:space-between;align-items:baseline;font-size:${story ? 34 : 30}px;font-weight:600;color:var(--sub)}
.pagina{color:var(--fraco);font-weight:500;font-variant-numeric:tabular-nums}
.corpo{flex:1;display:flex;flex-direction:column;justify-content:safe center;gap:40px;min-height:0;margin:28px 0;position:relative}
h1{font-weight:800;letter-spacing:-.035em;line-height:1.03;font-size:var(--fs,112px);text-wrap:balance}
.dest{${dest}}
.texto{font-size:${story ? 44 : 40}px;line-height:1.38;color:var(--sub);font-weight:400;max-width:22em;text-wrap:pretty}
.mao{font-family:Caveat,cursive;font-weight:600}
.rodape{display:flex;justify-content:space-between;align-items:baseline;font-size:30px;color:var(--fraco);font-weight:500}
.cartao{background:var(--card);border:2px solid var(--linha);border-radius:26px;padding:34px 40px 16px;color:var(--fg)}
.cartao.grande{transform:rotate(-2deg);box-shadow:0 30px 60px -20px rgba(0,0,0,.45);padding:44px 48px 22px}
.cartao.grande .linha{font-size:42px;padding:26px 0}
.exemplo{font-size:24px;font-weight:700;letter-spacing:.12em;color:var(--fraco);margin-bottom:12px}
.linha{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:20px 0;border-top:2px solid var(--linha);font-size:36px}
.exemplo+.linha{border-top:0}
.selo{font-size:28px;font-weight:700;padding:8px 22px;border-radius:999px;white-space:nowrap}
/* manchete */
.traco{width:96px;height:10px;border-radius:5px;background:var(--acento)}
/* pergunta */
.l-pergunta .corpo{align-items:center;text-align:center}
.l-pergunta h1{letter-spacing:-.045em;line-height:.98}
.l-pergunta .texto{text-align:center}
/* passo */
.numero{font-size:${story ? 520 : 400}px;font-weight:800;line-height:.78;letter-spacing:-.06em;color:transparent;-webkit-text-stroke:6px var(--acento);margin-left:-12px}
/* conversa */
.chat{display:flex;flex-direction:column;gap:22px;background:var(--card);border:2px solid var(--linha);border-radius:34px;padding:30px 30px 34px}
.bolha{max-width:78%;font-size:36px;line-height:1.3;padding:20px 28px;border-radius:30px}
.bolha.cliente{align-self:flex-start;background:var(--linha);color:var(--fg);border-bottom-left-radius:8px}
.bolha.negocio{align-self:flex-end;background:#111316;color:#F3F1EC;border-bottom-right-radius:8px}
.escuro-bg .bolha.negocio{background:#FF7A50;color:#111316}
/* comparativo */
.lados{display:grid;grid-template-columns:1fr 1fr;gap:28px}
.lado{border-radius:26px;padding:34px 32px 40px;display:flex;flex-direction:column;gap:22px}
.lado ul{display:flex;flex-direction:column;gap:16px}
.lado.a{border:3px dashed var(--linha)}
.lado.b{background:var(--card);border:2px solid var(--linha)}
.lado h2{font-size:30px;font-weight:700;color:var(--fraco)}
.lado.a li{font-family:Caveat,cursive;font-weight:600;font-size:58px;line-height:1.12;list-style:none;color:var(--sub);text-decoration:line-through;text-decoration-color:rgba(255,122,80,.75);text-decoration-thickness:3px}
.lado.b li{font-size:38px;line-height:1.25;list-style:none;display:flex;gap:14px;font-weight:500}
.lado.b li::before{content:"";flex:0 0 26px;height:26px;margin-top:6px;border-radius:50%;background:#FF7A50}
.coral-bg .lado.b li::before{background:#111316}
/* bilhete */
.folha{position:relative;background:#fffdf6;color:#1d2a44;transform:rotate(1.6deg);border-radius:6px;padding:46px 54px 46px 104px;box-shadow:0 28px 50px -18px rgba(0,0,0,.5);
background-image:repeating-linear-gradient(transparent 0 66px,#cfdcef 66px 68px),linear-gradient(90deg,transparent 78px,#f0a8a0 78px 81px,transparent 81px)}
.folha li{list-style:none;font-family:Caveat,cursive;font-weight:600;font-size:58px;line-height:68px}
.folha li.risco{text-decoration:line-through;text-decoration-color:#d9412a;text-decoration-thickness:5px;color:#55607a}
/* lista */
.checklist{display:flex;flex-direction:column;gap:24px;font-size:40px;line-height:1.28}
.checklist div{display:flex;gap:26px;align-items:flex-start}
.caixa{flex:0 0 46px;height:46px;border-radius:12px;background:var(--acento);position:relative;margin-top:2px}
.caixa::after{content:"";position:absolute;left:15px;top:7px;width:12px;height:22px;border:solid var(--bg);border-width:0 6px 6px 0;transform:rotate(45deg)}
/* frase */
.aspas{font-family:Caveat,cursive;font-weight:600;font-size:300px;line-height:.5;height:110px;color:var(--fg);opacity:.9}
.l-frase h1{font-weight:700;letter-spacing:-.03em;line-height:1.08}
/* chamada */
.l-chamada h1{letter-spacing:-.045em;line-height:.98}
.pilula{align-self:flex-start;font-size:38px;font-weight:700;padding:22px 40px;border-radius:999px;background:var(--fg);color:var(--bg)}
`;
};

// Encolhe o título, depois o texto, depois o bloco visual (cartão, conversa, folha, lados), até caber sem cortar palavra.
// Depois MEDE: se ainda transborda, encosta na borda ou invade o topo/rodapé, marca data-problema e a peça reprova
// na checagem técnica (G6). Roda depois que as fontes carregaram (medir com a fonte reserva daria outro tamanho).
const AJUSTE = `<script>
document.fonts.ready.then(()=>{
const h=document.querySelector('h1'),c=document.querySelector('.corpo'),ts=[...document.querySelectorAll('.texto')],e=document.querySelector('.escala');
const sobra=()=>c.scrollHeight>c.clientHeight+1||(h&&h.scrollWidth>h.clientWidth+1);
if(h){let fs=parseFloat(getComputedStyle(h).fontSize);while(fs>56&&sobra()){fs-=4;h.style.setProperty('--fs',fs+'px')}}
for(const t of ts){let fs=parseFloat(getComputedStyle(t).fontSize);while(fs>30&&sobra()){fs-=2;t.style.fontSize=fs+'px'}}
if(e){let z=1;while(z>.7&&sobra()){z-=.05;e.style.zoom=z}}
const r=(x)=>x.getBoundingClientRect(),cr=r(c),problemas=[];
if(sobra())problemas.push('o conteúdo não coube na peça');
for(const x of c.children){const b=r(x);
if(b.top<cr.top-1||b.bottom>cr.bottom+1)problemas.push('elemento saiu da área do conteúdo e encostou no topo ou no rodapé');
if(b.left<-30||b.right>innerWidth+30)problemas.push('elemento saiu pela lateral');}
document.body.dataset.problema=[...new Set(problemas)].join('; ');
document.body.dataset.pronto='1';
});
</script>`;

function pagina({ formato, ramo, numero, total, corpo, seguir, layout, fundo }) {
  const [l, a] = MEDIDAS[formato];
  const story = formato === 'story';
  const topo = `<div class="topo"><span class="ramo">${esc(ROTULO[ramo] ?? '')}</span>${total ? `<span class="pagina">${numero}/${total}</span>` : ''}</div>`;
  const rodape = `<div class="rodape"><span>@mazzisystems</span>${seguir ? '<span>arrasta pro lado</span>' : ''}</div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${CSS(l, a, story, fundo)}</style></head>
<body class="${fundo}-bg"><div class="peca l-${layout}" data-layout="${layout}" data-fundo="${fundo}">${topo}<div class="corpo">${corpo}</div>${rodape}</div>${AJUSTE}</body></html>`;
}

/** O miolo de cada layout. `s`: slide, imagem ou quadro; `f`: fundo. */
const CORPO = {
  manchete: (s, f, { capa }) => `${capa && f === 'escuro' ? '<div class="traco"></div>' : ''}<h1 style="--fs:${capa ? 120 : 96}px">${titulo(s.titulo, s.destaque)}</h1>${paragrafo(s.texto)}${cartao(s.cartao, f)}`,
  pergunta: (s) => `<h1 style="--fs:136px">${titulo(s.titulo, s.destaque)}</h1>${paragrafo(s.texto)}`,
  passo: (s, f) => `<div class="numero">${s.passo ?? ''}</div><h1 style="--fs:88px">${titulo(s.titulo, s.destaque)}</h1>${paragrafo(s.texto)}${cartao(s.cartao, f)}`,
  conversa: (s) => `<h1 style="--fs:80px">${titulo(s.titulo, s.destaque)}</h1><div class="chat escala"><div class="exemplo">EXEMPLO${s.contato ? ` · ${esc(s.contato)}` : ''}</div>${(s.conversa ?? []).map((m) => `<div class="bolha ${m.lado === 'negocio' ? 'negocio' : 'cliente'}">${esc(m.texto)}</div>`).join('')}</div>${paragrafo(s.texto)}`,
  comparativo: (s) => `<h1 style="--fs:80px">${titulo(s.titulo, s.destaque)}</h1><div class="lados escala">${['a', 'b'].map((k) => `<div class="lado ${k}"><h2>${esc(s.lados?.[k]?.rotulo ?? '')}</h2><ul>${(s.lados?.[k]?.itens ?? []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}</div>`,
  cartao: (s, f) => `<h1 style="--fs:84px">${titulo(s.titulo, s.destaque)}</h1>${cartao(s.cartao, f, true)}${paragrafo(s.texto)}`,
  bilhete: (s) => `<div class="folha escala"><ul>${(s.anotacoes ?? []).map((a) => `<li class="${a.riscado ? 'risco' : ''}">${esc(a.texto)}</li>`).join('')}</ul></div><h1 style="--fs:88px">${titulo(s.titulo, s.destaque)}</h1>${paragrafo(s.texto)}`,
  // O modelo numera/marca; número que o redator já tenha posto ("1.", "2)") sai.
  lista: (s) => `<h1 style="--fs:84px">${titulo(s.titulo, s.destaque)}</h1><div class="checklist escala">${(s.itens ?? []).map((t) => `<div><span class="caixa"></span><span>${esc(t.replace(/^\s*\d+\s*[.)\-:]\s*/, ''))}</span></div>`).join('')}</div>`,
  frase: (s) => `<div class="aspas">“</div><h1 style="--fs:100px">${titulo(s.titulo, s.destaque)}</h1>${paragrafo(s.texto)}`,
  chamada: (s) => `<h1 style="--fs:128px">${titulo(s.titulo, s.destaque)}</h1>${paragrafo(s.texto)}<div class="pilula">${s.objetivo === 'alcance' ? 'salva pra depois' : 'link na bio'}</div>`,
};

function montar(s, { formato, ramo, numero, total, seguir, capa }) {
  const layout = LAYOUTS[layoutPadrao(s, formato)] ? layoutPadrao(s, formato) : 'manchete';
  const fundo = FUNDOS.includes(s.fundo) ? s.fundo : 'escuro';
  return pagina({ formato, ramo, numero, total, seguir, layout, fundo, corpo: CORPO[layout](s, fundo, { capa }) });
}

/** Slide de carrossel. slide: { tipo, layout?, fundo?, titulo, destaque?, texto?, passo?, itens?, cartao?, conversa?, lados?, anotacoes? } */
export function htmlSlide(slide, { ramo, numero, total, objetivo }) {
  return montar({ ...slide, objetivo }, { formato: 'carrossel', ramo, numero, total, seguir: numero < total, capa: numero === 1 });
}

/** Post de imagem única. */
export function htmlImagem(peca, { ramo, objetivo }) {
  return montar({ ...peca, objetivo }, { formato: 'imagem', ramo, capa: true });
}

/** Quadro de story (texto entre y=250 e y=1600, sem figurinha: a API não aceita). */
export function htmlStory(quadro, { ramo }) {
  return montar(quadro, { formato: 'story', ramo, capa: false });
}
