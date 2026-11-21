// Selo EXEMPLO: uma fonte só para o nome do cartão e para o contraste do selo (imagens e reel).
// Em 21/11 o reel mostrou "EXEMPLO · ESTOQUE EXEMPLO": o molde das imagens já tirava o "exemplo" do título que o
// redator escreve, o do vídeo não. Agora os dois usam nomeDoCartao().

/** Título do cartão sem a palavra "exemplo" (o selo é colocado pelo molde, uma vez só). */
export function nomeDoCartao(titulo = '') {
  return String(titulo ?? '').replace(/(?:^|\s*[:·\-–]\s*|\s+)\(?exemplo\)?(?:\s*[:·\-–]\s*|\s+|$)/gi, ' ').replace(/\s+/g, ' ').trim();
}

/** Luminância relativa (WCAG 2.x) de uma cor #rrggbb. */
function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores #rrggbb (1 a 21). */
export function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// Cores da marca (guia/marca.md): grafite e papel. O selo é uma pílula sólida, com fundo próprio, e por isso não
// depende do que está atrás (vidro, papel, coral, azul).
export const SELO_CORES = {
  escuro: { fundo: '#F3F1EC', texto: '#111316' }, // sobre fundo ou cartão escuro: pílula papel
  claro: { fundo: '#111316', texto: '#F3F1EC' }, // sobre fundo claro (papel, coral): pílula grafite
};
