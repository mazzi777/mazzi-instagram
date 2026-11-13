// Schemas (zod) de tudo que o agente lê e grava. Saída do Claude também passa por aqui antes de ser usada.
import { z } from 'zod';

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD');
export const RAMOS = ['clinica', 'restaurante'];
export const HORARIOS = ['07:40', '11:40', '18:40', '20:40'];

export const Funcao = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:\.[a-z0-9-]+)+$/, 'id como "rest.delivery.teclado"'),
  ramo: z.enum([...RAMOS, 'comum']),
  status: z.enum(['no_ar', 'proibido']),
  fato: z.string().min(10).optional(),
  fonte: z.string().min(3).optional(),
  motivo: z.string().min(3).optional(),
  desde: dataIso.optional(),
}).refine((f) => (f.status === 'no_ar' ? f.fato && f.fonte : f.motivo), {
  message: 'função no ar precisa de "fato" e "fonte"; proibida precisa de "motivo"',
});

export const Produto = z.object({
  atualizado_em: dataIso,
  ramos: z.array(z.enum(RAMOS)).min(1),
  publico: z.record(z.enum(RAMOS), z.string().min(10)),
  preco: z.object({ regra: z.literal('nunca_falar'), resposta: z.string().min(10) }),
  entrada: z.string().min(10),
  suporte: z.string().min(10),
  funcoes: z.array(Funcao).min(1),
  faq: z.array(z.object({ pergunta: z.string().min(5), resposta: z.string().min(10) })),
  nunca: z.array(z.string().min(3)).min(1),
  // Seções do docs/NOVIDADES.md do aj-clinic já lidas (só as novas viram candidatas).
  novidades_vistas: z.array(z.string()).optional(),
});

/** Resposta do juiz de fatos (G1): cada afirmação da peça, ligada a uma função da base (ou não). */
export const Afirmacoes = z.object({
  afirmacoes: z.array(z.object({
    trecho: z.string().min(1),
    tipo: z.enum(['funcao', 'preco', 'numero', 'cliente', 'depoimento', 'resultado', 'promocao', 'opiniao', 'outro']),
    funcao_id: z.string().nullable(),
    em_exemplo: z.boolean(),
  })),
});

export const ProblemasMarca = z.object({
  problemas: z.array(z.object({ regra: z.number().int().min(1).max(7), trecho: z.string(), motivo: z.string().min(3) })),
});

export const Peca = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9]{0,5}$/),
  dia: dataIso,
  tipo: z.enum(['carrossel', 'imagem', 'reel', 'stories']),
  arquivos: z.array(z.string().min(5)).min(1),
  legenda: z.string().optional(),
  tema: z.string().min(3),
  gancho: z.string().min(3),
  // Campos novos do agente (opcionais para as semanas antigas continuarem válidas).
  horario: z.enum(HORARIOS).optional(),
  ramo: z.enum([...RAMOS, 'comum']).optional(),
  objetivo: z.enum(['conversa', 'alcance']).optional(),
  ia: z.boolean().optional(),
  origem: z.enum(['agente', 'reserva', 'rotina']).optional(),
  fatos: z.array(z.string()).optional(),
  alt_text: z.string().max(1000).optional(),
  capa_ms: z.number().int().min(0).optional(),
  tentativas: z.number().int().min(1).max(3).optional(),
  // Direção de arte da peça (layout e fundo da capa), para a próxima capa não repetir (checagens/direcao.mjs).
  visual: z.object({ layout: z.string(), fundo: z.string(), layouts: z.array(z.string()).optional() }).optional(),
});

export const Agenda = z.object({ semana: dataIso, pecas: z.array(Peca) });

export const Uso = z.object({
  semana: z.string().regex(/^\d{4}-W\d{2}$/),
  teto_usd: z.number().positive(),
  chamadas: z.array(z.object({ em: z.string(), etapa: z.string(), modelo: z.string(), custo_usd: z.number().min(0), entrada: z.number().int(), saida: z.number().int() })),
});

export const Registro = z.object({
  em: z.string(),
  tipo: z.enum(['plano', 'tentativa', 'aprovada', 'reprovada', 'reserva', 'pulada', 'publicada', 'erro', 'base', 'estrategia']),
  peca: z.string().optional(),
  notas: z.record(z.string(), z.number()).optional(),
  motivos: z.array(z.string()).optional(),
  detalhe: z.string().optional(),
});

/** Valida e devolve o dado, ou lança erro com as mensagens do zod em português simples. */
export function validar(schema, dado, onde = 'dado') {
  const r = schema.safeParse(dado);
  if (r.success) return r.data;
  const erros = r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; ');
  throw new Error(`${onde} inválido: ${erros}`);
}
