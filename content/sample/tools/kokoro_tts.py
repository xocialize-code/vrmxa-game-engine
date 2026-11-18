"""Kokoro-82M (Apache-2.0) through mlx-audio: a line of text to 24 kHz 16-bit PCM and its word timings (Kokoro's own
predicted durations, mlx-audio's join_timestamps): the shape the engine's lip sync reads (TTSWordTiming: { text, start,
duration } in seconds). Shared by make-voice.py (baked lines) and tts-server.py (live lines while playing).

Needs a Python with mlx-audio and misaki, and the weights in the Hugging Face cache (HF_HUB_CACHE).
"""
import io
import wave

import numpy as np

REPO, RATE = "mlx-community/Kokoro-82M-bf16", 24000
OFFSET = 0.03
OFFSET_NOTE = "Kokoro predicted durations run about 30 ms early against a forced aligner (AB-R-0888); the engine adds this to every word"


class Kokoro:
    def __init__(self):
        from mlx_audio.tts.utils import load_model
        from mlx_audio.tts.models.kokoro.pipeline import KokoroPipeline

        self.model = load_model(REPO)
        self.pipe = KokoroPipeline(lang_code="a", model=self.model, repo_id=REPO)

    def speak(self, text, voice="af_heart", speed=1.0):
        """→ (pcm float32 in -1..1, words [{text, start, duration}])"""
        audio, words, offset = [], [], 0.0
        for r in self.pipe(text, voice=voice, speed=speed):
            a = np.array(r.audio).reshape(-1)
            for t in r.tokens or []:
                if t.start_ts is None or t.end_ts is None or not any(ch.isalnum() for ch in t.text):
                    continue
                words.append({"text": t.text, "start": round(offset + t.start_ts, 4), "duration": round(t.end_ts - t.start_ts, 4)})
            audio.append(a)
            offset += len(a) / RATE
        return np.clip(np.concatenate(audio), -1, 1), words


def wav_bytes(pcm):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes((pcm * 32767).astype("<i2").tobytes())
    return buf.getvalue()


def timings(text, audio_name, pcm, words, voice):
    return {"format": "vrmxg-word-timings", "version": 1, "text": text, "audio": audio_name, "sampleRate": RATE,
            "duration": round(len(pcm) / RATE, 4), "source": f"Kokoro-82M {voice} (mlx-audio join_timestamps)",
            "offset": OFFSET, "offsetNote": OFFSET_NOTE, "words": words}
