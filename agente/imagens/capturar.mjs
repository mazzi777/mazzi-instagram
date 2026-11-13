// HTML → JPEG (qualidade 92) com Playwright. No GitHub usa o Chromium instalado pelo workflow;
// no PC da Andressa, o Edge (channel msedge) se o Chromium não estiver instalado.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { htmlSlide, htmlImagem, htmlStory, MEDIDAS } from './modelos.mjs';

async function abrirNavegador() {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: 'msedge' });
  }
}

/** Renderiza uma lista de { html, formato, arquivo } e devolve os caminhos (com .problemas: o que a página mediu de errado). */
export async function capturar(paginas, { navegador } = {}) {
  const nav = navegador ?? await abrirNavegador();
  try {
    const saida = [];
    const problemas = [];
    for (const p of paginas) {
      const [width, height] = MEDIDAS[p.formato];
      const page = await nav.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      await page.setContent(p.html, { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.dataset.pronto === '1');
      await page.evaluate(() => document.fonts.ready);
      const problema = await page.evaluate(() => document.body.dataset.problema);
      mkdirSync(path.dirname(p.arquivo), { recursive: true });
      writeFileSync(p.arquivo, await page.screenshot({ type: 'jpeg', quality: 92, fullPage: false }));
      if (problema) problemas.push(`${path.basename(p.arquivo)}: ${problema}`);
      await page.close();
      saida.push(p.arquivo);
    }
    saida.problemas = problemas;
    return saida;
  } finally {
    if (!navegador) await nav.close();
  }
}

/** Monta as páginas de uma peça escrita (saída do redator) com os nomes de arquivo do guia. */
export function paginasDaPeca({ semana, id, tipo, ramo, objetivo, conteudo, pasta }) {
  const nome = (i) => path.join(pasta, `${semana}-${id}-${String(i + 1).padStart(2, '0')}.jpg`);
  if (tipo === 'carrossel') {
    return conteudo.slides.map((s, i) => ({ formato: 'carrossel', arquivo: nome(i), html: htmlSlide(s, { ramo, objetivo, numero: i + 1, total: conteudo.slides.length }) }));
  }
  if (tipo === 'imagem') return [{ formato: 'imagem', arquivo: nome(0), html: htmlImagem(conteudo, { ramo, objetivo }) }];
  if (tipo === 'stories') return conteudo.quadros.map((q, i) => ({ formato: 'story', arquivo: nome(i), html: htmlStory(q, { ramo }) }));
  throw new Error(`tipo sem modelo de imagem: ${tipo}`);
}
