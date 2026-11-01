"""Mede uma trilha para o reel cortar no tempo da música: andamento (BPM), onde cai a 1ª batida e o trecho
de 40 s com mais energia (para começar o reel já no "meio" animado da faixa, não na introdução).
Uso: python -I analisar_trilha.py <audio.f32>  (PCM float32 mono 22050 Hz cru, decodificado pelo ffmpeg)
Imprime JSON: {"bpm": 124.0, "fase": 0.31, "inicio_energia": 18.4, "duracao": 152.3}"""
import json
import sys

import numpy as np

SR = 22050
HOP = 512
x = np.fromfile(sys.argv[1], dtype=np.float32)
duracao = len(x) / SR

# Envelope de ataques: fluxo espectral (quanto o espectro cresce de um quadro para o outro).
janela = np.hanning(2048).astype(np.float32)
quadros = np.lib.stride_tricks.sliding_window_view(x, 2048)[::HOP] * janela
espectro = np.abs(np.fft.rfft(quadros, axis=1))
fluxo = np.maximum(0, np.diff(np.log1p(espectro), axis=0)).sum(axis=1)
fluxo = (fluxo - fluxo.mean()) / (fluxo.std() + 1e-9)
fps_env = SR / HOP

# Andamento: autocorrelação do envelope entre 80 e 160 BPM (faixa de música de propaganda).
ac = np.correlate(fluxo, fluxo, mode="full")[len(fluxo) - 1:]
atrasos = np.arange(len(ac)) / fps_env
validos = (atrasos >= 60 / 160) & (atrasos <= 60 / 80)
melhor = int(np.argmax(np.where(validos, ac, -np.inf)))
# Refino entre amostras (parábola nos 3 pontos do pico): sem isso o BPM sai "em degraus" e o corte escorrega.
a, b, c = ac[melhor - 1], ac[melhor], ac[melhor + 1]
desvio = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0.0
bpm = 60 / ((melhor + desvio) / fps_env)

# Fase: deslocamento (dentro de uma batida) que mais coincide com ataques fortes.
periodo = int(round(melhor))
somas = [fluxo[f::periodo].sum() for f in range(periodo)]
fase = int(np.argmax(somas)) / fps_env

# Trecho com mais energia (RMS em janelas de 40 s, a partir de 4 s), alinhado à batida.
segundos = len(x) // SR
rms = np.sqrt((x[: segundos * SR] ** 2).reshape(segundos, SR).mean(axis=1))  # um valor por segundo
largura = 40
if len(rms) > largura + 4:
    medias = [rms[i:i + largura].mean() for i in range(4, len(rms) - largura)]
    inicio = 4 + int(np.argmax(medias))
else:
    inicio = 0
batida = 60 / bpm
inicio = fase + round((inicio - fase) / batida) * batida

json.dump({"bpm": round(float(bpm), 2), "fase": round(float(fase), 3), "inicio_energia": round(float(max(0, inicio)), 3), "duracao": round(duracao, 2)}, sys.stdout)
