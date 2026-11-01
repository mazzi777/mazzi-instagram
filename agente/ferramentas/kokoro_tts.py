"""Reserva da voz: Kokoro (Apache-2.0), voz masculina pt-BR pm_alex.
Lê do stdin uma lista JSON de textos e grava <pasta>/<i>.wav (24 kHz). Uso: python -I kokoro_tts.py <pasta>"""
import json
import sys

import numpy as np
import soundfile as sf
from kokoro import KPipeline

pasta = sys.argv[1]
textos = json.load(sys.stdin)
pipeline = KPipeline(lang_code="p")  # p = português do Brasil
for i, texto in enumerate(textos):
    pedacos = [audio for _, _, audio in pipeline(texto, voice="pm_alex", speed=1.05)]
    if not pedacos:
        sys.exit(f"Kokoro não gerou áudio para a fala {i}")
    sf.write(f"{pasta}/{i}.wav", np.concatenate(pedacos), 24000)
