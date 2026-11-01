"""Tempo de cada palavra da narração com Whisper (faster-whisper, modelo small, CPU).
Uso: python -I alinhar.py <audio.f32>  (PCM float32, 16 kHz, mono, cru: o ffmpeg decodifica antes,
para não depender do leitor de áudio do faster-whisper). Imprime JSON [{"p": palavra, "i": início_s, "f": fim_s}].
Só os TEMPOS interessam: as palavras da legenda vêm do roteiro (alinhar.mjs casa uma lista com a outra)."""
import json
import os
import sys

import numpy as np
from faster_whisper import WhisperModel

audio = np.fromfile(sys.argv[1], dtype=np.float32)
modelo = WhisperModel(os.environ.get("WHISPER_MODELO", "small"), device="cpu", compute_type="int8")
segmentos, _ = modelo.transcribe(audio, language="pt", word_timestamps=True, vad_filter=False, beam_size=5)
palavras = [{"p": w.word.strip(), "i": round(w.start, 3), "f": round(w.end, 3)} for s in segmentos for w in (s.words or [])]
json.dump(palavras, sys.stdout, ensure_ascii=False)
