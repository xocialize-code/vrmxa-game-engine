"""Hana's voice lines for the sample (M1 W6): Kokoro-82M (Apache-2.0) with its built-in af_heart voice, through
mlx-audio, at 24 kHz. Each line is written as voice/<id>.wav (16-bit PCM mono) and voice/<id>.timings.json: the words
with their start and duration in seconds, from Kokoro's own predicted durations (mlx-audio's join_timestamps), the
shape the engine's lip sync reads (TTSWordTiming: { text, start, duration }).

Run with a Python that has mlx-audio and the Kokoro weights in the Hugging Face cache, from content/sample:
  HF_HUB_CACHE=/Volumes/DEV_VOL1/Models <venv>/bin/python -I tools/make-voice.py
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np

LINES = [
    ("hana-welcome", "Oh, hi! Welcome to the cafe. Sit anywhere you like, and I'll bring you a menu."),
    ("hana-sword", "Careful with that sword. The last person who swung it broke a lamp."),
]
VOICE, REPO, RATE = "af_heart", "mlx-community/Kokoro-82M-bf16", 24000
HERE = Path(__file__).resolve().parent.parent


def main():
    from mlx_audio.tts.utils import load_model
    from mlx_audio.tts.models.kokoro.pipeline import KokoroPipeline

    model = load_model(REPO)
    pipe = KokoroPipeline(lang_code="a", model=model, repo_id=REPO)
    for line_id, text in LINES:
        audio, words, offset = [], [], 0.0
        for r in pipe(text, voice=VOICE, speed=1.0):
            a = np.array(r.audio).reshape(-1)
            for t in r.tokens or []:
                if t.start_ts is None or t.end_ts is None or not any(ch.isalnum() for ch in t.text):
                    continue
                words.append({"text": t.text, "start": round(offset + t.start_ts, 4), "duration": round(t.end_ts - t.start_ts, 4)})
            audio.append(a)
            offset += len(a) / RATE
        pcm = np.clip(np.concatenate(audio), -1, 1)
        out = HERE / "voice" / f"{line_id}.wav"
        with wave.open(str(out), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
            w.writeframes((pcm * 32767).astype("<i2").tobytes())
        timings = {"format": "vrmxg-word-timings", "version": 1, "text": text, "audio": out.name, "sampleRate": RATE,
                   "duration": round(len(pcm) / RATE, 4), "source": f"Kokoro-82M {VOICE} (mlx-audio join_timestamps)",
                   "offset": 0.03, "offsetNote": "Kokoro predicted durations run about 30 ms early against a forced aligner (AB-R-0888); the engine adds this to every word",
                   "words": words}
        (HERE / "voice" / f"{line_id}.timings.json").write_text(json.dumps(timings, indent=1) + "\n")
        print(f"wrote voice/{line_id}.wav {len(pcm) / RATE:.2f} s, {len(words)} words", file=sys.stderr)


if __name__ == "__main__":
    main()
