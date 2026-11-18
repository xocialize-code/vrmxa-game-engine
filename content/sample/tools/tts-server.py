"""A loopback TTS server for live lines while playing (M2 W10): Kokoro-82M through mlx-audio, answering the engine's
httpTTS provider (@vrmxg/voice live.js). POST {"text": "...", "voice": "af_heart"} (any content type; text/plain keeps
browsers from sending a preflight) → {"wav": base64 16-bit PCM, "sampleRate": 24000, "words": [{text, start,
duration}], "ms": synthesis time}. Listens on 127.0.0.1 only; CORS-readable, so the playground can reach it.

This stands in for the MLXEngine endpoint the Mac shell will call (asked of the mlx-engine area): the same answer shape.

  HF_HUB_CACHE=/Volumes/DEV_VOL1/Models HF_HUB_OFFLINE=1 <venv>/bin/python -I tools/tts-server.py [--port 5190]
then open the playground with ?tts=http://127.0.0.1:5190/speak
"""
import base64
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ in the content folder (every file there needs a licence row)
sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I leaves the script's folder off the path
from kokoro_tts import RATE, OFFSET, Kokoro, wav_bytes  # noqa: E402

VOICES = {"af_heart", "af_bella", "af_nicole", "af_sarah", "af_sky", "am_adam", "am_echo", "am_eric", "am_michael", "bf_emma", "bm_george"}
tts, lock = None, threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()

    def answer(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code); self.cors()
        self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body)))
        self.end_headers(); self.wfile.write(body)

    def do_POST(self):
        if self.path.rstrip("/") != "/speak":
            return self.answer(404, {"error": "POST /speak"})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            text, voice = str(req.get("text", "")).strip(), req.get("voice") or "af_heart"
            if not text or len(text) > 600:
                return self.answer(400, {"error": "text: 1 to 600 characters"})
            if voice not in VOICES:
                return self.answer(400, {"error": f"voice: one of {sorted(VOICES)}"})
            t0 = time.perf_counter()
            with lock:  # one synthesis at a time: MLX on one GPU
                pcm, words = tts.speak(text, voice=voice)
            ms = round((time.perf_counter() - t0) * 1000, 1)
            words = [{**w, "start": round(w["start"] + OFFSET, 4)} for w in words]
            self.answer(200, {"wav": base64.b64encode(wav_bytes(pcm)).decode(), "sampleRate": RATE, "duration": round(len(pcm) / RATE, 4), "words": words, "voice": voice, "ms": ms})
            print(f"{ms:7.1f} ms  {len(pcm) / RATE:5.2f} s  {voice}  {text[:60]}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001 — answer the error, keep serving
            self.answer(500, {"error": str(e)})

    def log_message(self, *a):
        pass


def main():
    global tts
    port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 5190
    tts = Kokoro()
    tts.speak("Ready.")  # warm: the first synthesis compiles
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"tts-server: http://127.0.0.1:{server.server_address[1]}/speak", file=sys.stderr, flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
