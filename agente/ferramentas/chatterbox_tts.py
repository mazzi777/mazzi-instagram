"""Teste da 3ª voz candidata (Chatterbox Multilingual, licença MIT), só para a amostra.
Uso: python -I chatterbox_tts.py <saida.wav>  (texto pelo stdin). Roda em CPU: é lento, e é isso que se quer medir."""
import sys
import time

import torchaudio
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

texto = sys.stdin.read().strip()
inicio = time.time()
modelo = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
wav = modelo.generate(texto, language_id="pt")
torchaudio.save(sys.argv[1], wav, modelo.sr)
print(f"chatterbox: {time.time() - inicio:.0f} s em CPU")
