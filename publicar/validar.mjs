// Valida uma semana (semanas/AAAA-MM-DD) antes do commit e antes de publicar.
// Uso: node publicar/validar.mjs semanas/2026-11-09
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const IDS = {
  A: { tipo: 'carrossel', offset: 0 },
  S1: { tipo: 'stories', offset: 0 },
  REEL: { tipo: 'reel', offset: 2 },
  S2: { tipo: 'stories', offset: 2 },
  B: { tipo: 'carrossel', offset: 4 },
  S3: { tipo: 'stories', offset: 4 },
};

// Reel avulso, fora do rodízio (ex.: os vídeos fixados do perfil): AV1, AV2... Sai em qualquer dia
// da própria semana e não é cobrado como peça obrigatória.
export const AVULSO = /^AV\d{1,2}$/;
const DURACAO_MAX_LIMITE = 180; // a API da Meta aceita reel bem mais longo; 3 min basta para nós.

// Só palavras: o sentido (número sem "EXEMPLO", promessa estética) é conferido por quem lê as peças.
export const PROIBIDAS = [
  [/nfc-?e\b|nota fiscal|cupom fiscal/i, 'NFC-e/nota fiscal (em homologação)'],
  [/lembrete autom[aá]tico|whatsapp autom[aá]tico/i, 'lembrete automático pela Meta (não está ligado)'],
  [/aj\s*clinic|jo[aã]o\s*xxiii|jo[aã]o\s*23\b/i, 'nome de cliente'],
  [/gr[aá]tis para sempre|gratuito para sempre|sempre gr[aá]tis/i, '"grátis para sempre"'],
  [/revolucion|alavanc|solu[cç][aã]o completa|potencializ/i, 'palavra fora do tom da marca'],
  [/\{\{/, 'sobra de modelo {{...}}'],
  [/—/, 'travessão (—): trocar por vírgula, ponto ou dois-pontos'],
  [/[​-‏⁠﻿]/, 'caractere invisível'],
];

export function dataMais(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function tamanhoJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { altura: buf.readUInt16BE(i + 5), largura: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

export function sondarVideo(arquivo) {
  const saida = execFileSync('ffprobe', ['-v', 'error', '-show_entries',
    'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', arquivo], { encoding: 'utf8' });
  const j = JSON.parse(saida);
  const v = j.streams.find((s) => s.codec_type === 'video');
  return {
    largura: v?.width, altura: v?.height, codec: v?.codec_name,
    audio: j.streams.some((s) => s.codec_type === 'audio'),
    duracao: Number(j.format?.duration),
  };
}

export function validarLegenda(texto, onde) {
  const erros = [];
  if (typeof texto !== 'string' || !texto.trim()) return [`${onde}: legenda vazia`];
  if (texto.length > 2200) erros.push(`${onde}: legenda com ${texto.length} caracteres (máx. 2200)`);
  const tags = texto.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  if (tags.length > 3) erros.push(`${onde}: ${tags.length} hashtags (máx. 3)`);
  erros.push(...textoProibido(texto, onde));
  return erros;
}

export function textoProibido(texto, onde) {
  return PROIBIDAS.filter(([re]) => re.test(texto)).map(([, motivo]) => `${onde}: ${motivo}`);
}

/** Valida uma peça. `dir` é a pasta da semana. Devolve a lista de erros (vazia = ok). */
export function validarPeca(dir, semana, peca, { sondar = sondarVideo } = {}) {
  const onde = `${semana}/${peca.id}`;
  const avulso = AVULSO.test(peca.id ?? '');
  const regra = IDS[peca.id] ?? (avulso ? { tipo: 'reel' } : null);
  if (!regra) return [`${onde}: id desconhecido (use ${Object.keys(IDS).join(', ')} ou AV1, AV2... para reel avulso)`];
  const erros = [];
  if (peca.tipo !== regra.tipo) erros.push(`${onde}: tipo "${peca.tipo}", esperado "${regra.tipo}"`);
  if (avulso) {
    if (typeof peca.dia !== 'string' || peca.dia < semana || peca.dia > dataMais(semana, 6)) {
      erros.push(`${onde}: dia ${peca.dia}, esperado entre ${semana} e ${dataMais(semana, 6)}`);
    }
  } else if (peca.dia !== dataMais(semana, regra.offset)) {
    erros.push(`${onde}: dia ${peca.dia}, esperado ${dataMais(semana, regra.offset)}`);
  }

  const { arquivos } = peca;
  if (!Array.isArray(arquivos) || arquivos.some((a) => typeof a !== 'string')) return [...erros, `${onde}: lista de arquivos inválida`];
  const [min, max] = peca.tipo === 'carrossel' ? [2, 10] : peca.tipo === 'stories' ? [1, 10] : [1, 1];
  if (arquivos.length < min || arquivos.length > max) erros.push(`${onde}: ${arquivos.length} arquivo(s), esperado de ${min} a ${max}`);

  for (const nome of arquivos) {
    if (!nome.startsWith(`${semana}-${peca.id}`)) erros.push(`${onde}: ${nome} fora do padrão ${semana}-${peca.id}...`);
    const caminho = path.join(dir, nome);
    if (!existsSync(caminho)) { erros.push(`${onde}: ${nome} não existe`); continue; }
    if (peca.tipo === 'reel') {
      if (!nome.endsWith('.mp4')) { erros.push(`${onde}: ${nome} precisa ser .mp4`); continue; }
      let v;
      try { v = sondar(caminho); } catch (e) { erros.push(`${onde}: não deu para medir ${nome} (${e.message.split('\n')[0]})`); continue; }
      if (v.largura !== 1080 || v.altura !== 1920) erros.push(`${onde}: ${nome} é ${v.largura}x${v.altura}, esperado 1080x1920`);
      if (v.codec !== 'h264') erros.push(`${onde}: ${nome} em ${v.codec}, esperado h264`);
      if (!v.audio) erros.push(`${onde}: ${nome} sem faixa de áudio`);
      // Padrão da semana: 20 a 30 s. Peça especial (ex.: lançamento) pode declarar "duracao_max" (até 180 s).
      const maximo = peca.duracao_max ?? 30;
      if (!(v.duracao >= 20 && v.duracao <= maximo + 0.5)) erros.push(`${onde}: ${nome} com ${v.duracao}s (20 a ${maximo})`);
    } else {
      if (!/\.jpe?g$/i.test(nome)) { erros.push(`${onde}: ${nome} precisa ser JPEG`); continue; }
      const t = tamanhoJpeg(readFileSync(caminho));
      const alvo = peca.tipo === 'carrossel' ? [1080, 1350] : [1080, 1920];
      if (!t) erros.push(`${onde}: ${nome} não é um JPEG legível`);
      else if (t.largura !== alvo[0] || t.altura !== alvo[1]) erros.push(`${onde}: ${nome} é ${t.largura}x${t.altura}, esperado ${alvo.join('x')}`);
    }
  }

  if (peca.tipo !== 'stories') erros.push(...validarLegenda(peca.legenda, onde));
  for (const campo of ['tema', 'gancho']) {
    if (typeof peca[campo] === 'string') erros.push(...textoProibido(peca[campo], `${onde} (${campo})`));
  }
  if (peca.tipo === 'reel' && peca.capa_ms !== undefined && !(Number.isInteger(peca.capa_ms) && peca.capa_ms >= 0)) {
    erros.push(`${onde}: capa_ms precisa ser inteiro >= 0`);
  }
  if (peca.duracao_max !== undefined && !(peca.tipo === 'reel' && Number.isInteger(peca.duracao_max) && peca.duracao_max >= 30 && peca.duracao_max <= DURACAO_MAX_LIMITE)) {
    erros.push(`${onde}: duracao_max só vale para reel e precisa ser inteiro de 30 a ${DURACAO_MAX_LIMITE}`);
  }
  return erros;
}

export function lerAgenda(dir) {
  const agenda = JSON.parse(readFileSync(path.join(dir, 'agenda.json'), 'utf8'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(agenda.semana ?? '')) throw new Error('agenda.json: "semana" precisa ser AAAA-MM-DD');
  if (!Array.isArray(agenda.pecas)) throw new Error('agenda.json: "pecas" precisa ser uma lista');
  return agenda;
}

export function validarSemana(dir, opcoes) {
  let agenda;
  try { agenda = lerAgenda(dir); } catch (e) { return [e.message]; }
  const erros = [];
  if (path.basename(dir) !== agenda.semana) erros.push(`pasta ${path.basename(dir)} diferente da semana ${agenda.semana}`);
  if (new Date(`${agenda.semana}T12:00:00Z`).getUTCDay() !== 1) erros.push(`semana ${agenda.semana} não é uma segunda-feira`);
  const vistos = new Set();
  for (const peca of agenda.pecas) {
    if (vistos.has(peca.id)) erros.push(`${agenda.semana}/${peca.id}: id repetido`);
    vistos.add(peca.id);
    erros.push(...validarPeca(dir, agenda.semana, peca, opcoes));
  }
  // Semana só de avulsos (ex.: os fixados do perfil) não cobra as peças do rodízio.
  const soAvulsos = agenda.pecas.length > 0 && agenda.pecas.every((p) => AVULSO.test(p.id ?? ''));
  if (!soAvulsos) for (const id of Object.keys(IDS)) if (!vistos.has(id)) erros.push(`${agenda.semana}: falta a peça ${id}`);
  return erros;
}

/** Semanas desta segunda em diante que ainda têm alguma peça por publicar. */
export function semanasFuturas(raiz, hoje) {
  const dia = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  const segunda = dataMais(hoje, -((dia + 6) % 7));
  const base = path.join(raiz, 'semanas');
  if (!existsSync(base)) return [];
  return readdirSync(base).filter((n) => {
    const agenda = path.join(base, n, 'agenda.json');
    if (n < segunda || !existsSync(agenda)) return false;
    const pub = path.join(base, n, 'publicado.json');
    const feito = existsSync(pub) ? JSON.parse(readFileSync(pub, 'utf8')) : {};
    try {
      return JSON.parse(readFileSync(agenda, 'utf8')).pecas.some((p) => !feito[p.id]?.completo);
    } catch {
      return true; // agenda quebrada: validarSemana mostra o erro
    }
  }).sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--futuras') {
    const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const semanas = semanasFuturas(raiz, hoje);
    const erros = semanas.flatMap((s) => validarSemana(path.join(raiz, 'semanas', s)));
    if (erros.length) { console.error(erros.map((e) => `- ${e}`).join('\n')); process.exit(1); }
    console.log(semanas.length ? `OK: ${semanas.join(', ')}` : 'Nenhuma semana futura para validar.');
    process.exit(0);
  }
  const dir = process.argv[2];
  if (!dir) { console.error('Uso: node publicar/validar.mjs semanas/AAAA-MM-DD | --futuras'); process.exit(2); }
  const erros = validarSemana(path.resolve(dir));
  if (erros.length) { console.error(erros.map((e) => `- ${e}`).join('\n')); process.exit(1); }
  console.log('OK');
}
