// Biblioteca de cenas dos reels (v2). Cada cena recebe os dados que o redator escreveu para a batida.
// Tudo que é interface aparece como EXEMPLO (marca obrigatória) e todo texto fica dentro da área segura
// (x de 96 a 850, y de 230 a 1180; abaixo disso fica a legenda da voz).
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, staticFile } from 'remotion';
import { loadFont } from '@remotion/fonts';
import { AREA, geometriaHub, geometriaEncaixe } from './geometria.mjs';
import { COR, ATOS, tw, mola, SAI, ENTRA_SAI, useCena, naBatida, Fundo, Camera, Rabisco, Icone, TituloCinetico, Rotulo, MarcaMazzi, linhasEstimadas, tamanhoQueCabe } from './base.jsx';

loadFont({ family: 'Caveat', url: staticFile('caveat-600.woff2'), weight: '600' });

const TONS = { ok: ['#1f3a2b', COR.verde], aviso: ['#3d3220', COR.amarelo], ruim: ['#40211f', '#f08a80'], neutro: ['#262a31', '#c9c6bf'] };
const ESQ = 96;
const LARG = 754;

function Selo({ texto, tom = 'neutro', tamanho = 30 }) {
  const [fundo, cor] = TONS[tom] ?? TONS.neutro;
  return <span style={{ fontSize: tamanho, fontWeight: 800, padding: '8px 22px', borderRadius: 999, background: fundo, color: cor, whiteSpace: 'nowrap' }}>{texto}</span>;
}

function Exemplo({ titulo, cor = '#8b8f97' }) {
  return <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '0.16em', color: cor }}>EXEMPLO{titulo ? ` · ${titulo.toUpperCase()}` : ''}</div>;
}

/**
 * Título da cena no alto (menor que o do gancho). Sempre em até 2 linhas (diminui se precisar): o conteúdo das
 * cenas começa em y ≥ 520 e um título de 3 linhas ficava por baixo dele.
 */
function Topo({ tela, destaque, ramo, tamanho = 84 }) {
  const tam = tamanhoQueCabe(tela, LARG, [tamanho, tamanho - 8, tamanho - 16, 60, 54, 48]);
  return (
    <>
      {ramo ? <Rotulo texto={ramo} /> : null}
      <div style={{ position: 'absolute', left: ESQ, top: 310, width: LARG }}>
        <TituloCinetico texto={tela} destaque={destaque} tamanho={tam} passo={3} sublinhar="linha" />
      </div>
    </>
  );
}

// 1. GANCHO: palavras batem uma a uma, risco à mão na palavra-chave, símbolos gigantes voando desfocados.
export function Gancho({ tela, destaque, simbolo = '?', ramo }) {
  const f = useCurrentFrame();
  const { ato, duracao } = useCena();
  const simbolos = [{ x: 640, y: 150, t: 520, r: 18, v: 0.6 }, { x: -120, y: 980, t: 420, r: -22, v: -0.45 }, { x: 760, y: 1250, t: 300, r: 12, v: 0.8 }];
  const palavras = tela.split(/\s+/).length;
  const impacto = destaque ? 4 * Math.max(0, tela.split(/\s+/).findIndex((p) => p.toLowerCase().startsWith(destaque.split(/\s+/)[0].toLowerCase()))) + 6 : 4 * palavras;
  return (
    <Camera tremerEm={[impacto]}>
      <Fundo />
      {simbolos.map((s, i) => {
        const y = s.y + Math.sin((f + i * 20) / 18) * 30 - f * s.v * 2;
        return <div key={i} style={{ position: 'absolute', left: s.x, top: y, fontSize: s.t, fontWeight: 900, color: ato.destaque, opacity: 0.22, filter: `blur(${10 + i * 6}px)`, transform: `rotate(${s.r + f * s.v * 0.4}deg)`, lineHeight: 1 }}>{simbolo}</div>;
      })}
      {ramo ? <Rotulo texto={ramo} /> : null}
      <div style={{ position: 'absolute', left: ESQ, top: 420, width: LARG }}>
        <TituloCinetico texto={tela} destaque={destaque} passo={4} sublinhar="circulo" />
      </div>
      <div style={{ position: 'absolute', left: ESQ, top: 1040, width: tw(f, 6, duracao, 0, LARG, ENTRA_SAI), height: 6, borderRadius: 3, background: ato.destaque, opacity: 0.8 }} />
    </Camera>
  );
}

// 2. DIGITANDO: frase digitada com cursor; um "chip" com ícone salta no fim e o cursor do mouse clica nele.
export function Digitando({ texto, chip, ramo }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { ato } = useCena();
  const n = Math.floor(tw(f, 4, 4 + texto.length * 1.6, 0, texto.length, (x) => x));
  const fimDigitacao = 4 + Math.ceil(texto.length * 1.6);
  const pop = chip ? mola(f, fps, fimDigitacao + 2) : 0;
  const clique = chip ? tw(f, fimDigitacao + 14, fimDigitacao + 18, 1, 0.9) * tw(f, fimDigitacao + 18, fimDigitacao + 22, 1, 1.11) : 1;
  // O chip fica embaixo da frase PRONTA (que pode quebrar em 2 linhas), não numa altura fixa.
  const tam = tamanhoQueCabe(texto, LARG, [92, 80, 68, 60]);
  const topoChip = 520 + linhasEstimadas(texto, tam, LARG) * tam * 1.05 + 56;
  const mx = tw(f, fimDigitacao + 2, fimDigitacao + 14, 900, 640);
  const my = tw(f, fimDigitacao + 2, fimDigitacao + 14, topoChip + 400, topoChip + 60);
  return (
    <Camera>
      <Fundo />
      {ramo ? <Rotulo texto={ramo} /> : null}
      <div style={{ position: 'absolute', left: ESQ, top: 520, width: LARG, fontSize: tam, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, color: ato.texto }}>
        {texto.slice(0, n)}
        <span style={{ display: 'inline-block', width: 8, height: tam, marginLeft: 6, verticalAlign: 'text-bottom', background: ato.destaque, opacity: Math.floor(f / 8) % 2 ? 0.2 : 1 }} />
      </div>
      {chip ? (
        <div style={{ position: 'absolute', left: ESQ, top: topoChip, display: 'flex', alignItems: 'center', gap: 18, padding: '18px 30px', borderRadius: 26, background: ato.destaque, color: ato.fundo, fontSize: 56, fontWeight: 900, transform: `scale(${pop * clique}) rotate(${(1 - pop) * -8}deg)`, transformOrigin: 'left center', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
          <Icone nome={chip.icone} tamanho={60} cor={ato.fundo} traco={2.6} />
          {chip.rotulo}
        </div>
      ) : null}
      {chip ? (
        <svg viewBox="0 0 24 24" width="88" height="88" aria-hidden="true" style={{ position: 'absolute', left: mx, top: my, opacity: tw(f, fimDigitacao, fimDigitacao + 4, 0, 1), filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.4))' }}>
          <path d="M4 2 L20 12 L13 13.5 L17 21 L14 22.5 L10 15 L5 19 Z" fill="#FFFFFF" stroke="#111316" strokeWidth="1.2" />
        </svg>
      ) : null}
    </Camera>
  );
}

// 3. LISTA: botões com ícone entram um por batida numa coluna em 3D que gira devagar (o "menu de funções").
export function Lista({ tela, destaque, itens, ramo, estilo }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { ato, nomeAto } = useCena();
  if (estilo === 'pilulas') return <Pilulas tela={tela} destaque={destaque} itens={itens} ramo={ramo} />;
  const giro = tw(f, 0, 120, 18, 6);
  const sobe = tw(f, 0, 160, 60, -40, (x) => x);
  const claro = nomeAto === 'claro';
  return (
    <Camera>
      <Fundo />
      <Topo tela={tela} destaque={destaque} ramo={ramo} tamanho={76} />
      <div style={{ position: 'absolute', left: 140, top: 560 + sobe, width: 760, perspective: 1400 }}>
        <div style={{ transform: `rotateY(${-giro}deg) rotateX(${giro * 0.5}deg)`, transformStyle: 'preserve-3d', display: 'flex', flexDirection: 'column', gap: 26 }}>
          {itens.map((it, i) => {
            const q = naBatida(i) + 4;
            const m = mola(f, fps, q);
            const ativo = f >= q && (i === itens.length - 1 || f < naBatida(i + 1) + 4);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 26, padding: '24px 34px', borderRadius: 28, width: 620,
                background: claro ? '#FFFFFF' : 'rgba(255,255,255,0.08)', border: `2px solid ${ativo ? ato.destaque : claro ? 'rgba(17,19,22,0.08)' : 'rgba(255,255,255,0.12)'}`,
                boxShadow: claro ? '0 20px 40px rgba(17,19,22,0.10)' : '0 20px 40px rgba(0,0,0,0.35)', opacity: m, transform: `translateX(${(1 - m) * 260}px) translateZ(${ativo ? 60 : 0}px) rotateY(${(1 - m) * 40}deg)`,
                color: ato.texto, fontSize: 50, fontWeight: 800 }}>
                <Icone nome={it.icone} tamanho={58} cor={ato.destaque} />
                <span>{it.rotulo}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Camera>
  );
}

// 4. CARTÃO DE VIDRO: a função num cartão EXEMPLO que gira em 3D, com reflexo passando e linhas em cascata.
export function Cartao({ tela, destaque, cartao, ramo }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { ato } = useCena();
  const m = mola(f, fps, 3, { damping: 16, stiffness: 120 });
  const reflexo = tw(f, 14, 40, -300, 900, ENTRA_SAI);
  return (
    <Camera>
      <Fundo />
      <Topo tela={tela} destaque={destaque} ramo={ramo} />
      <div style={{ position: 'absolute', left: 520, top: 760, width: 700, height: 700, marginLeft: -350, marginTop: -350, borderRadius: '50%', background: `radial-gradient(circle, ${ato.brilho}, transparent 62%)` }} />
      <div style={{ position: 'absolute', left: ESQ, top: 600, width: 800, perspective: 1600 }}>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 40, padding: '40px 44px 22px', background: 'linear-gradient(140deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05))', border: '2px solid rgba(255,255,255,0.24)', backdropFilter: 'blur(8px)',
          boxShadow: '0 60px 120px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.3)', transform: `rotateY(${-6 - (1 - m) * 30}deg) rotateX(${4 + (1 - m) * 12}deg) translateY(${(1 - m) * 140}px)`, opacity: m, color: COR.papel }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(17,19,22,0.55)' }} />
          <div style={{ position: 'absolute', top: 0, left: reflexo, width: 220, height: '100%', background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.22), transparent)', transform: 'skewX(-18deg)' }} />
          <div style={{ position: 'relative' }}>
            <Exemplo titulo={cartao.titulo} cor="#b9bcc3" />
            {cartao.linhas.map((l, i) => {
              const q = naBatida(i + 1);
              const v = tw(f, q, q + 8, 0, 1);
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, padding: '22px 0', borderTop: i ? '2px solid rgba(255,255,255,0.14)' : 'none', marginTop: i ? 0 : 12,
                  fontSize: 40, fontWeight: 600, opacity: v, transform: `translateX(${(1 - v) * 50}px)` }}>
                  <span>{l.rotulo}</span>
                  {l.selo ? <Selo texto={l.selo} tom={l.tom} /> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Camera>
  );
}

// 5. PAPEL × MAZZI: caderno rabiscado à esquerda, cartão limpo à direita; a divisória varre e o caderno treme.
export function Papel({ tela, destaque, rabiscos, cartao, ramo }) {
  const f = useCurrentFrame();
  const { duracao } = useCena();
  const div = tw(f, 6, Math.min(duracao, 40), 1080, 520, ENTRA_SAI);
  const treme = Math.sin(f * 1.7) * 2.5;
  return (
    <Camera>
      <AbsoluteFill style={{ background: 'linear-gradient(170deg, #ece7da, #d9d2c0)' }}>
        <AbsoluteFill style={{ background: 'repeating-linear-gradient(180deg, transparent 0 66px, rgba(70,110,160,0.25) 66px 68px)' }} />
        <div style={{ position: 'absolute', left: 70, top: 0, width: 4, height: 1920, background: 'rgba(200,60,60,0.35)' }} />
        <div style={{ position: 'absolute', left: 96, top: 236, fontSize: 30, fontWeight: 900, letterSpacing: '0.08em', color: '#6b6355' }}>NO CADERNO</div>
        <div style={{ position: 'absolute', left: 100, top: 520, width: 420, fontFamily: 'Caveat, cursive', fontSize: 64, lineHeight: '68px', color: '#2b3a55', transform: `rotate(-3deg) translate(${treme}px, ${-treme}px)` }}>
          {rabiscos.map((r, i) => <div key={i} style={{ textDecoration: i === 1 ? 'line-through' : 'none', color: i === rabiscos.length - 1 ? '#b4473a' : undefined, opacity: tw(f, i * 4, i * 4 + 6, 0, 1) }}>{r}</div>)}
        </div>
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: div, top: 0, width: 1080, height: 1920, background: 'radial-gradient(120% 70% at 40% 45%, #22262c, #111316)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 50, top: 236, fontSize: 30, fontWeight: 900, letterSpacing: '0.08em', color: COR.coral }}>NA MAZZI</div>
        <div style={{ position: 'absolute', left: 50, top: 560, width: 450, borderRadius: 30, padding: '28px 30px 12px', background: COR.cartao, border: `2px solid ${COR.borda}`, boxShadow: '0 40px 80px rgba(0,0,0,0.5)', color: COR.papel }}>
          <Exemplo titulo={cartao.titulo} />
          {cartao.linhas.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '18px 0', borderTop: i ? `2px solid ${COR.borda}` : 'none', fontSize: 32 }}>
              <span>{l.rotulo}</span>{l.selo ? <Selo texto={l.selo} tom={l.tom ?? 'ok'} tamanho={24} /> : null}
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', left: div - 4, top: 0, width: 8, height: 1920, background: COR.coral, boxShadow: '0 0 60px rgba(255,122,80,0.9)' }} />
      <div style={{ position: 'absolute', left: ESQ, top: 330, width: LARG, fontSize: 64, fontWeight: 900, letterSpacing: '-0.04em', color: COR.grafite, mixBlendMode: 'normal' }}>
        <span style={{ background: COR.papel, padding: '4px 14px', borderRadius: 12, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>{tela}</span>
      </div>
    </Camera>
  );
}

// 6. CHECKLIST: cada item se marca no tempo da batida (o check é desenhado), os feitos ficam coloridos.
export function Checklist({ tela, destaque, itens, ramo }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { ato } = useCena();
  return (
    <Camera>
      <Fundo />
      <Topo tela={tela} destaque={destaque} ramo={ramo} />
      <div style={{ position: 'absolute', left: ESQ, top: 580, width: LARG, display: 'flex', flexDirection: 'column', gap: 30 }}>
        {itens.map((t, i) => {
          const q = naBatida(i) + 6;
          const ent = mola(f, fps, q - 4);
          const marca = tw(f, q + 2, q + 10, 0, 1, ENTRA_SAI);
          const ativo = f >= q && f < naBatida(i + 1) + 6;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 26, fontSize: ativo ? 58 : 50, fontWeight: 800, color: marca > 0.5 ? ato.texto : ato.suave, opacity: ent, transform: `translateY(${(1 - ent) * 30}px)` }}>
              <svg viewBox="0 0 40 40" width="68" height="68" aria-hidden="true" style={{ flex: 'none' }}>
                <circle cx="20" cy="20" r="17" fill={marca > 0.9 ? ato.destaque : 'none'} stroke={ato.destaque} strokeWidth="3" />
                <path d="M11 20.5 L17.5 27 L29 14" stroke={marca > 0.9 ? ato.fundo : ato.destaque} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - marca} />
              </svg>
              <span>{t}</span>
            </div>
          );
        })}
      </div>
    </Camera>
  );
}

// 7. CONTADOR: anel que enche e número que rola (só valor de EXEMPLO ou contagem do próprio produto).
export function Contador({ tela, destaque, rotulo, valor, total, sufixo, ramo }) {
  const f = useCurrentFrame();
  const { ato, duracao } = useCena();
  const p = tw(f, 6, Math.min(duracao - 4, 40), 0, 1, ENTRA_SAI);
  const atual = Math.round(valor * p);
  const frac = total ? valor / total : 1;
  const C = 2 * Math.PI * 250;
  return (
    <Camera>
      <Fundo />
      <Topo tela={tela} destaque={destaque} ramo={ramo} tamanho={72} />
      <svg viewBox="0 0 600 600" width="600" height="600" aria-hidden="true" style={{ position: 'absolute', left: 240, top: 520 }}>
        <circle cx="300" cy="300" r="250" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="38" />
        <circle cx="300" cy="300" r="250" fill="none" stroke={ato.destaque} strokeWidth="38" strokeLinecap="round" strokeDasharray={`${C * frac * p} ${C}`} transform="rotate(-90 300 300)" />
      </svg>
      <div style={{ position: 'absolute', left: 240, top: 640, width: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', color: ato.texto }}>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '0.14em', opacity: 0.7 }}>{rotulo.toUpperCase()}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontWeight: 900, letterSpacing: '-0.05em' }}>
          <span style={{ fontSize: 210, lineHeight: 1 }}>{atual}{sufixo ?? ''}</span>
          {total ? <span style={{ fontSize: 90, opacity: 0.45 }}>/{total}</span> : null}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '0.16em', opacity: 0.55, marginTop: 10 }}>EXEMPLO</div>
      </div>
    </Camera>
  );
}

// 8. CELULAR: o telefone gira para a frente e as mensagens sobem uma a uma (com "digitando..." antes).
export function Celular({ tela, destaque, mensagens, contato = 'Sua clínica', ramo }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = mola(f, fps, 2, { damping: 15, stiffness: 110 });
  return (
    <Camera>
      <Fundo />
      <Topo tela={tela} destaque={destaque} ramo={ramo} tamanho={72} />
      <div style={{ position: 'absolute', left: 270, top: 520, width: 540, perspective: 1800 }}>
        <div style={{ width: 460, height: 640, borderRadius: 64, background: '#0a0b0d', border: '5px solid #3a3e46', boxShadow: '0 70px 140px rgba(0,0,0,0.6), 0 0 0 16px #1a1c20', overflow: 'hidden', position: 'relative',
          transform: `rotateY(${-14 - (1 - m) * 40}deg) rotateX(${4 + (1 - m) * 10}deg) translateY(${(1 - m) * 200}px)`, opacity: m }}>
          <div style={{ height: 130, background: '#1f2c27', display: 'flex', alignItems: 'flex-end', gap: 16, padding: '0 26px 20px', color: COR.papel, fontSize: 28, fontWeight: 800 }}>
            <div style={{ width: 50, height: 50, borderRadius: 25, background: COR.coral }} />{contato}
          </div>
          <div style={{ position: 'absolute', inset: '130px 0 0 0', background: '#12171a', padding: '26px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {mensagens.map((msg, i) => {
              const q = naBatida(i * 2) + 8;
              const digitando = f >= q - 10 && f < q;
              const v = mola(f, fps, q);
              const dele = msg.lado === 'cliente';
              return (
                <React.Fragment key={i}>
                  {digitando ? <div style={{ alignSelf: dele ? 'flex-end' : 'flex-start', background: '#232b2f', borderRadius: 22, padding: '14px 22px', color: '#9aa', fontSize: 34, letterSpacing: 4 }}>{'•••'.slice(0, 1 + (Math.floor(f / 4) % 3))}</div> : null}
                  {f >= q ? (
                    <div style={{ alignSelf: dele ? 'flex-end' : 'flex-start', maxWidth: 330, background: dele ? '#1e4a3a' : '#232b2f', color: COR.papel, borderRadius: dele ? '24px 24px 6px 24px' : '24px 24px 24px 6px', padding: '18px 22px', fontSize: 27, lineHeight: 1.35,
                      transform: `scale(${v})`, transformOrigin: dele ? 'right bottom' : 'left bottom' }}>{msg.texto}</div>
                  ) : null}
                </React.Fragment>
              );
            })}
            <div style={{ marginTop: 'auto', textAlign: 'center', fontSize: 20, fontWeight: 800, letterSpacing: '0.16em', color: '#6f7279' }}>EXEMPLO</div>
          </div>
        </div>
      </div>
    </Camera>
  );
}

// 9. ÍCONE: um ícone de app com notificação acumulando; linhas convergem e ele se transforma no ícone da Mazzi.
export function IconeApp({ tela, destaque, de = 'MessageCircle', badge = 12, ramo }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { ato, duracao } = useCena();
  const troca = Math.round(duracao * 0.55);
  const glitch = f >= troca - 3 && f <= troca + 3;
  const depois = f > troca;
  const m = mola(f, fps, 2);
  const linhas = tw(f, 4, troca, 0, 1, ENTRA_SAI);
  const cont = Math.min(badge, Math.round(tw(f, 6, troca - 6, 1, badge, (x) => x)));
  return (
    <Camera tremerEm={[troca]}>
      <Fundo />
      <Topo tela={tela} destaque={destaque} ramo={ramo} tamanho={72} />
      <svg width="1080" height="1920" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
        {[[0, 520], [1080, 520], [0, 1300], [1080, 1300]].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y} Q ${540 + (x ? -120 : 120)} ${y > 900 ? 1150 : 700}, 540 900`} stroke={ato.destaque} strokeWidth="5" fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - linhas} opacity={depois ? 0 : 0.8} />
        ))}
      </svg>
      <div style={{ position: 'absolute', left: 540 - 170, top: 900 - 170, width: 340, height: 340, borderRadius: 84, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: depois ? COR.coral : '#25a85a', transform: `scale(${m * (glitch ? 1.18 : 1)}) translateX(${glitch ? Math.sin(f * 9) * 18 : 0}px)`, boxShadow: `0 40px 90px rgba(0,0,0,0.45)${glitch ? ', 6px 0 0 #00e5ff, -6px 0 0 #ff2e63' : ''}` }}>
        {depois ? <MarcaMazzi tamanho={210} cor={COR.grafite} degrade={['#ffffff', '#ffe2d6']} /> : <Icone nome={de} tamanho={190} cor="#FFFFFF" traco={2} />}
        {!depois ? (
          <div style={{ position: 'absolute', right: -28, top: -28, minWidth: 110, height: 110, borderRadius: 55, background: '#ff3b30', color: '#fff', fontSize: 58, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${mola(f, fps, 8)})` }}>{cont}</div>
        ) : null}
      </div>
    </Camera>
  );
}

// 10. ÓRBITA: o ícone da Mazzi no centro e as funções girando em volta (tudo num lugar só).
export function Orbita({ tela, destaque, icones, ramo }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { ato } = useCena();
  const m = mola(f, fps, 2);
  return (
    <Camera>
      <Fundo />
      <Topo tela={tela} destaque={destaque} ramo={ramo} tamanho={76} />
      <div style={{ position: 'absolute', left: 540 - 140, top: 880 - 140, width: 280, height: 280, borderRadius: 72, background: COR.coral, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${m})`, boxShadow: '0 30px 80px rgba(255,122,80,0.45)' }}>
        <MarcaMazzi tamanho={170} cor={COR.grafite} degrade={['#ffffff', '#ffe2d6']} />
      </div>
      {icones.map((ic, i) => {
        const ang = (i / icones.length) * Math.PI * 2 + f / 40;
        const raio = tw(f, 4 + i * 3, 18 + i * 3, 0, 1) * 330;
        const x = 540 + Math.cos(ang) * raio;
        const y = 880 + Math.sin(ang) * raio * 0.55;
        const z = Math.sin(ang);
        return (
          <div key={i} style={{ position: 'absolute', left: x - 70, top: y - 70, width: 140, height: 140, borderRadius: 40, background: ato.fundo === COR.papel ? '#FFFFFF' : 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.75 + 0.3 * (z + 1) / 2})`, opacity: 0.55 + 0.45 * (z + 1) / 2, zIndex: z > 0 ? 2 : 0, filter: `blur(${z < -0.4 ? 3 : 0}px)` }}>
            <Icone nome={ic} tamanho={72} cor={ato.destaque} />
          </div>
        );
      })}
    </Camera>
  );
}

// 11. ATO DE COR: fundo coral inteiro, tipografia enorme, uma palavra por batida (a virada "mas tem jeito").
export function AtoCor({ tela, destaque }) {
  const f = useCurrentFrame();
  const palavras = tela.split(/\s+/);
  return (
    <Camera>
      <Fundo />
      <div style={{ position: 'absolute', left: -80, top: 900, width: 1300, height: 360, background: 'rgba(255,255,255,0.12)', transform: `rotate(-9deg) translateX(${tw(f, 0, 20, -1300, 0)}px)` }} />
      <div style={{ position: 'absolute', left: 84, top: 330, width: 820, display: 'flex', flexDirection: 'column' }}>
        {palavras.map((p, i) => {
          const q = naBatida(i);
          const v = tw(f, q, q + 5, 0, 1);
          const eDest = destaque && destaque.toLowerCase().includes(p.toLowerCase().replace(/[.,!?]/g, ''));
          return <div key={i} style={{ overflow: 'hidden' }}><div style={{ fontSize: palavras.length > 4 ? 120 : 168, fontWeight: 900, lineHeight: 0.95, letterSpacing: '-0.06em', color: eDest ? COR.papel : COR.grafite, transform: `translateY(${(1 - v) * 110}%)` }}>{p}</div></div>;
        })}
      </div>
    </Camera>
  );
}

// 12. PAINEL: um painel inclinado em perspectiva com a linha do gráfico se desenhando (EXEMPLO).
export function Painel({ tela, destaque, titulo, linhas = [], ramo }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { ato } = useCena();
  const m = mola(f, fps, 2, { damping: 16, stiffness: 110 });
  const traco = tw(f, 10, 44, 0, 1, ENTRA_SAI);
  return (
    <Camera>
      <Fundo />
      <Topo tela={tela} destaque={destaque} ramo={ramo} tamanho={76} />
      <div style={{ position: 'absolute', left: 70, top: 600, width: 940, perspective: 1600 }}>
        <div style={{ borderRadius: 36, background: COR.cartao, border: `2px solid ${COR.borda}`, padding: '34px 38px', color: COR.papel, boxShadow: '0 60px 120px rgba(0,0,0,0.5)',
          transform: `rotateX(${18 - m * 8}deg) rotateY(${-12 + (1 - m) * -20}deg) translateY(${(1 - m) * 160}px)`, opacity: m }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontSize: 38, fontWeight: 800 }}>{titulo}</div><Exemplo /></div>
          <svg viewBox="0 0 860 300" width="860" height="300" aria-hidden="true" style={{ marginTop: 18 }}>
            {[0, 1, 2, 3].map((k) => <line key={k} x1="0" x2="860" y1={40 + k * 80} y2={40 + k * 80} stroke="#2c3038" strokeWidth="2" />)}
            <path d="M0 250 C 90 230, 140 180, 220 190 S 360 120, 440 140 S 600 60, 680 80 S 800 30, 860 24" stroke={ato.destaque} strokeWidth="8" fill="none" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - traco} />
          </svg>
          {linhas.slice(0, 2).map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderTop: `2px solid ${COR.borda}`, fontSize: 34, opacity: tw(f, 30 + i * 6, 38 + i * 6, 0, 1) }}>
              <span>{l.rotulo}</span>{l.selo ? <Selo texto={l.selo} tom={l.tom ?? 'ok'} tamanho={26} /> : null}
            </div>
          ))}
        </div>
      </div>
    </Camera>
  );
}

// 13. FECHAMENTO: azul da marca, logo, nome, botão do WhatsApp que pulsa e "link na bio". Sempre igual.
export function Fechamento() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = mola(f, fps, 2, { damping: 12, stiffness: 140 });
  const pulso = 1 + Math.max(0, Math.sin((f - 26) / 5)) * 0.04 * (f > 26 && f < 60 ? 1 : 0);
  return (
    <Camera>
      <Fundo />
      {/* Tudo acima de y≈1100: a legenda da voz ocupa a faixa de baixo. */}
      <div style={{ position: 'absolute', left: 0, top: 330, width: 1080, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30, color: '#FFFFFF' }}>
        <div style={{ transform: `scale(${logo}) rotate(${(1 - logo) * -20}deg)` }}><MarcaMazzi tamanho={260} /></div>
        <div style={{ fontSize: 86, fontWeight: 900, letterSpacing: '-0.03em', opacity: tw(f, 10, 18, 0, 1), transform: `translateY(${tw(f, 10, 18, 30, 0)}px)` }}>Mazzi Systems</div>
        <div style={{ fontSize: 36, fontWeight: 600, opacity: tw(f, 14, 22, 0, 0.85) }}>Gestão para clínicas e restaurantes</div>
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 20, background: '#FFFFFF', color: COR.azulFundo, fontSize: 50, fontWeight: 900, padding: '30px 56px', borderRadius: 999,
          boxShadow: '0 0 0 18px rgba(255,255,255,0.14), 0 30px 70px rgba(0,0,0,0.35)', opacity: tw(f, 18, 24, 0, 1), transform: `scale(${tw(f, 18, 26, 0.7, 1) * pulso})` }}>
          <Icone nome="MessageCircle" tamanho={56} cor={COR.azulFundo} traco={2.8} />Chama no WhatsApp
        </div>
        <div style={{ fontSize: 36, fontWeight: 800, opacity: tw(f, 26, 32, 0, 0.9) }}>link na bio · @mazzisystems</div>
      </div>
    </Camera>
  );
}

// 3b. PÍLULAS (variação da LISTA, referências de mercado de 12/11): até 3 benefícios em pílulas cheias que entram
// uma por batida, empilhadas e levemente desalinhadas, sem giro 3D. Uma ideia por pílula.
function Pilulas({ tela, destaque, itens, ramo }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { ato } = useCena();
  const desvio = [0, 40, 12];
  return (
    <Camera>
      <Fundo />
      <Topo tela={tela} destaque={destaque} ramo={ramo} tamanho={76} />
      <div style={{ position: 'absolute', left: ESQ, top: 600, width: LARG, display: 'flex', flexDirection: 'column', gap: 34 }}>
        {itens.slice(0, 3).map((it, i) => {
          const m = mola(f, fps, naBatida(i) + 4);
          return (
            <div key={i} style={{ alignSelf: 'flex-start', marginLeft: desvio[i], display: 'flex', alignItems: 'center', gap: 22, padding: '26px 44px 26px 30px', borderRadius: 999,
              background: i === itens.length - 1 ? ato.destaque : ato.texto, color: i === itens.length - 1 ? ato.texto : ato.fundo, fontSize: 48, fontWeight: 800, whiteSpace: 'nowrap',
              opacity: m, transform: `translateY(${(1 - m) * 90}px) scale(${0.9 + 0.1 * m})`, boxShadow: '0 18px 40px rgba(0,0,0,0.22)' }}>
              {it.icone ? <Icone nome={it.icone} tamanho={56} cor={i === itens.length - 1 ? ato.texto : ato.destaque} /> : null}
              <span>{it.rotulo}</span>
            </div>
          );
        })}
      </div>
    </Camera>
  );
}

// 13. HUB: a Mazzi no centro e os módulos em volta, parados, ligados por linha fina que se desenha um por batida
// (referências de mercado de 12/11). Para "tudo num lugar só", sem número inventado.
export function Hub({ tela, destaque, modulos, ramo }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { ato } = useCena();
  const { cx, cy, pos } = geometriaHub(modulos.length);
  const m0 = mola(f, fps, 2);
  return (
    <Camera>
      <Fundo />
      <Topo tela={tela} destaque={destaque} ramo={ramo} tamanho={76} />
      <svg width="1080" height="1920" style={{ position: 'absolute', left: 0, top: 0 }} aria-hidden="true">
        {pos.map((p, i) => {
          const q = tw(f, naBatida(i) + 2, naBatida(i) + 14, 0, 1);
          return <line key={i} x1={cx} y1={cy} x2={cx + (p.x - cx) * q} y2={cy + (p.y - cy) * q} stroke={ato.texto} strokeOpacity="0.35" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />;
        })}
      </svg>
      <div style={{ position: 'absolute', left: cx - 110, top: cy - 110, width: 220, height: 220, borderRadius: 60, background: COR.coral, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${m0})`, boxShadow: '0 26px 60px rgba(255,122,80,0.4)' }}>
        <MarcaMazzi tamanho={130} cor={COR.grafite} degrade={['#ffffff', '#ffe2d6']} />
      </div>
      {modulos.map((md, i) => {
        const m = mola(f, fps, naBatida(i) + 10);
        const p = pos[i];
        return (
          <div key={i} style={{ position: 'absolute', left: p.x - 120, top: p.y - 70, width: 240, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, opacity: m, transform: `scale(${0.6 + 0.4 * m})` }}>
            <div style={{ width: 110, height: 110, borderRadius: 32, background: ato.fundo === COR.papel ? '#FFFFFF' : 'rgba(255,255,255,0.1)', border: `2px solid ${ato.fundo === COR.papel ? 'rgba(17,19,22,0.1)' : 'rgba(255,255,255,0.18)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icone nome={md.icone} tamanho={60} cor={ato.destaque} />
            </div>
            <span style={{ fontSize: 32, fontWeight: 800, color: ato.texto, textAlign: 'center', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{md.rotulo}</span>
          </div>
        );
      })}
    </Camera>
  );
}

// 14. ENCAIXE: uma base com N encaixes vazios que vão sendo ocupados, um por batida, com o contador "2/4"
// (referências de mercado de 12/11). Para "cada coisa no seu lugar" e para os módulos de cada ramo.
export function Encaixe({ tela, destaque, pecas, ramo }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { ato } = useCena();
  const n = pecas.length;
  const ocupados = pecas.filter((_, i) => f >= naBatida(i) + 8).length;
  const { topo, alt, contadorTopo, letra } = geometriaEncaixe(n);
  return (
    <Camera>
      <Fundo />
      <Topo tela={tela} destaque={destaque} ramo={ramo} tamanho={76} />
      <div style={{ position: 'absolute', left: AREA.esq, top: topo, width: AREA.dir - AREA.esq, padding: 26, borderRadius: 40, background: ato.fundo === COR.papel ? COR.papel2 : 'rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {pecas.map((p, i) => {
          const m = mola(f, fps, naBatida(i) + 4, { damping: 13, stiffness: 190, mass: 0.7 });
          return (
            <div key={i} style={{ position: 'relative', height: alt, borderRadius: 28, border: `3px dashed ${ato.fundo === COR.papel ? 'rgba(17,19,22,0.2)' : 'rgba(255,255,255,0.2)'}` }}>
              <div style={{ position: 'absolute', inset: -3, borderRadius: 28, background: ato.fundo === COR.papel ? '#FFFFFF' : COR.cartao, border: `2px solid ${ato.destaque}`,
                display: 'flex', alignItems: 'center', gap: 26, padding: '0 34px', opacity: m, transform: `translateX(${(1 - m) * 700}px) rotate(${(1 - m) * 6}deg)` }}>
                <Icone nome={p.icone} tamanho={letra[1]} cor={ato.destaque} />
                <span style={{ fontSize: letra[0], fontWeight: 800, color: ato.fundo === COR.papel ? COR.grafite : COR.papel, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip' }}>{p.rotulo}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: AREA.esq, width: AREA.dir - AREA.esq, top: contadorTopo, height: 96, lineHeight: '96px', textAlign: 'center', color: ato.texto, fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ fontSize: 80, fontWeight: 900, letterSpacing: '-0.04em' }}>{ocupados}</span>
        <span style={{ fontSize: 52, fontWeight: 800, opacity: 0.45 }}>/{n}</span>
      </div>
    </Camera>
  );
}

export const CENAS = { gancho: Gancho, digitando: Digitando, lista: Lista, cartao: Cartao, papel: Papel, checklist: Checklist, contador: Contador, celular: Celular, icone: IconeApp, orbita: Orbita, ato: AtoCor, painel: Painel, hub: Hub, encaixe: Encaixe, fechamento: Fechamento };
// Ato de cor de cada cena quando o código não decide outro (o agente alterna para não repetir).
export const ATO_PADRAO = { gancho: 'escuro', digitando: 'claro', lista: 'claro', cartao: 'escuro', papel: 'escuro', checklist: 'escuro', contador: 'escuro', celular: 'escuro', icone: 'claro', orbita: 'escuro', ato: 'coral', painel: 'escuro', hub: 'claro', encaixe: 'escuro', fechamento: 'azul' };
export { ATOS };
