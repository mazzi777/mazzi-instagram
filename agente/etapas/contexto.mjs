// O que o planejador e o redator leem antes de escrever: guia da marca, voz, regras das skills e a base.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resumoParaJuiz } from '../checagens/fatos.mjs';

const ler = (raiz, rel) => readFileSync(path.join(raiz, rel), 'utf8');

export function contextoMarca(raiz, produto) {
  const publico = Object.entries(produto.publico).filter(([r]) => produto.ramos.includes(r)).map(([r, t]) => `- ${r}: ${t}`).join('\n');
  return [
    '# GUIA DA MARCA (vale mais que tudo)', ler(raiz, 'guia/marca.md'),
    '# VOZ', ler(raiz, 'guia/voz.md'),
    '# REGRAS DE ESCRITA', ler(raiz, 'agente/prompts/regras.md'),
    '# PÚBLICO (só estes ramos)', publico,
    `# PREÇO\nNunca fale de preço. Se o assunto aparecer: "${produto.preco.resposta}"`,
    `# COMO ENTRAR\n${produto.entrada}`,
    '# BASE DO PRODUTO', resumoParaJuiz(produto),
  ].join('\n\n');
}
