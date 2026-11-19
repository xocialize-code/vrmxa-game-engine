"""The loopback voice stand-in (M3 W3, AB-T-0542): a character's language model, speech-to-text and speech, on this Mac.

It stands in for the MLXEngine calls the Mac shell will make (asked of mlx-engine: AB-A-0311 for the LLM and STT,
AB-A-0308 for TTS with word timings), and serves browsers and the acceptance in the meantime. Three endpoints,
127.0.0.1 only, CORS-readable:

  POST /v1/chat/completions   OpenAI-compatible chat with tools (what @vrmxg/director's httpModel sends): LFM2.5-8B-A1B
                              int4 through mlx-lm, with reasoning skipped (an empty <think></think> is prefilled);
                              LFM's tool calls ([say(text='…', to='user')]) come back as OpenAI tool_calls
  POST /transcribe            a WAV (16-bit PCM, any rate; the body as bytes, or JSON { "wav": base64 }) → { text, ms }:
                              whisper-large-v3-turbo through mlx-whisper
  POST /speak                 { text, voice } → { wav (base64), sampleRate, duration, words, ms }: Kokoro-82M (as
                              tts-server.py, the shape @vrmxg/voice's httpTTS reads)

Every answer carries `ms`, the server's own time for it (the latency receipts split the turn by stage).

  HF_HUB_CACHE=/Volumes/DEV_VOL1/Models HF_HUB_OFFLINE=1 <venv>/bin/python -I tools/voice-server.py [--port 5191]
      [--no-llm] [--no-stt] [--no-tts]
"""
import ast
import base64
import io
import json
import re
import sys
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ in the content folder (every file there needs a licence row)
sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I leaves the script's folder off the path

LLM_REPO = "mlx-community/LFM2.5-8B-A1B-MLX-4bit"
STT_REPO = "mlx-community/whisper-large-v3-turbo"
VOICES = {"af_heart", "af_bella", "af_nicole", "af_sarah", "af_sky", "am_adam", "am_echo", "am_eric", "am_michael", "bf_emma", "bm_george"}
gpu = threading.Lock()  # one model at a time on the GPU
llm = tts = None
stt_ready = False


# ---------------------------------------------------------------- the language model

def load_llm():
    global llm
    from mlx_lm import load
    model, tok = load(LLM_REPO)
    llm = (model, tok)
    chat([{"role": "user", "content": "Hi"}], [], 8)  # warm


def chat(messages, tools, max_tokens, temperature=0.6):
    """→ (text, tool_calls, tokens). Reasoning is skipped by prefilling an empty think block."""
    from mlx_lm import generate
    from mlx_lm.sample_utils import make_sampler
    model, tok = llm
    prompt = tok.apply_chat_template(messages, tools=tools or None, add_generation_prompt=True, tokenize=False) + "<think></think>"
    out = generate(model, tok, prompt=prompt, max_tokens=max_tokens, sampler=make_sampler(temp=temperature), verbose=False)
    calls, text = parse_tool_calls(out)
    return text, calls, len(tok.encode(out))


CALLS = re.compile(r"<\|tool_call_start\|>(.*?)<\|tool_call_end\|>", re.S)


def parse_tool_calls(out):
    """LFM writes calls as a Python list of calls: [say(text='Hi', to='user'), setGoal(goal='x', params={...})].
    Parsed with ast (literals only, never evaluated). Returns (calls as OpenAI tool_calls, the rest as text)."""
    calls = []
    for m in CALLS.finditer(out):
        try:
            tree = ast.parse(m.group(1).strip(), mode="eval").body
            items = tree.elts if isinstance(tree, (ast.List, ast.Tuple)) else [tree]
            for c in items:
                if not isinstance(c, ast.Call) or not isinstance(c.func, ast.Name):
                    continue
                args = {k.arg: ast.literal_eval(k.value) for k in c.keywords if k.arg}
                calls.append({"type": "function", "function": {"name": c.func.id, "arguments": json.dumps(args)}})
        except (SyntaxError, ValueError):
            calls.append({"type": "function", "function": {"name": "__unparsed__", "arguments": m.group(1)[:400]}})
    text = CALLS.sub("", out).replace("<think></think>", "").replace("<|im_end|>", "").strip()
    return calls, text or None


# ---------------------------------------------------------------- speech to text

def load_stt():
    global stt_ready
    import numpy as np
    transcribe(np.zeros(16000, dtype=np.float32))  # warm: downloads nothing (offline), compiles
    stt_ready = True


def transcribe(audio):
    import mlx_whisper
    r = mlx_whisper.transcribe(audio, path_or_hf_repo=STT_REPO, language="en", fp16=True, condition_on_previous_text=False)
    return r.get("text", "").strip()


def wav_to_float16k(data):
    """A 16-bit PCM WAV → mono float32 at 16 kHz (linear resampling: speech only needs it roughly)."""
    import numpy as np
    with wave.open(io.BytesIO(data)) as w:
        rate, ch, width, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    if width != 2:
        raise ValueError("16-bit PCM only")
    x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    if rate != 16000:
        t = np.arange(0, len(x) * 16000 / rate) * rate / 16000
        x = np.interp(t, np.arange(len(x)), x).astype(np.float32)
    return x


# ---------------------------------------------------------------- the server

class Handler(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()

    def answer(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code); self.cors()
        self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body)))
        self.end_headers(); self.wfile.write(body)

    def body(self):
        return self.rfile.read(int(self.headers.get("Content-Length", 0)))

    def do_POST(self):
        path = self.path.rstrip("/")
        try:
            if path == "/v1/chat/completions":
                return self.chat()
            if path == "/transcribe":
                return self.stt()
            if path == "/speak":
                return self.speak()
            self.answer(404, {"error": "POST /v1/chat/completions, /transcribe or /speak"})
        except Exception as e:  # noqa: BLE001 — answer the error, keep serving
            self.answer(500, {"error": f"{type(e).__name__}: {e}"})

    def chat(self):
        if not llm:
            return self.answer(503, {"error": "started with --no-llm"})
        req = json.loads(self.body() or b"{}")
        tools = [t["function"] if t.get("type") == "function" else t for t in req.get("tools", [])]
        t0 = time.perf_counter()
        with gpu:
            text, calls, tokens = chat(req.get("messages", []), tools, int(req.get("max_tokens", 200)), float(req.get("temperature", 0.6)))
        ms = round((time.perf_counter() - t0) * 1000, 1)
        self.answer(200, {"model": LLM_REPO, "ms": ms, "usage": {"completion_tokens": tokens},
                          "choices": [{"index": 0, "message": {"role": "assistant", "content": text, "tool_calls": calls}, "finish_reason": "tool_calls" if calls else "stop"}]})
        print(f"llm {ms:7.1f} ms  {tokens:3d} tok  {json.dumps([c['function']['name'] for c in calls])} {(text or '')[:50]}", file=sys.stderr)

    def stt(self):
        if not stt_ready:
            return self.answer(503, {"error": "started with --no-stt"})
        raw = self.body()
        if raw[:1] == b"{":
            raw = base64.b64decode(json.loads(raw)["wav"])
        audio = wav_to_float16k(raw)
        t0 = time.perf_counter()
        with gpu:
            text = transcribe(audio)
        ms = round((time.perf_counter() - t0) * 1000, 1)
        self.answer(200, {"text": text, "ms": ms, "seconds": round(len(audio) / 16000, 3)})
        print(f"stt {ms:7.1f} ms  {len(audio) / 16000:5.2f} s  {text[:60]}", file=sys.stderr)

    def speak(self):
        from kokoro_tts import RATE, OFFSET, wav_bytes
        if not tts:
            return self.answer(503, {"error": "started with --no-tts"})
        req = json.loads(self.body() or b"{}")
        text, voice = str(req.get("text", "")).strip(), req.get("voice") or "af_heart"
        if not text or len(text) > 600:
            return self.answer(400, {"error": "text: 1 to 600 characters"})
        if voice not in VOICES:
            return self.answer(400, {"error": f"voice: one of {sorted(VOICES)}"})
        t0 = time.perf_counter()
        with gpu:
            pcm, words = tts.speak(text, voice=voice)
        ms = round((time.perf_counter() - t0) * 1000, 1)
        words = [{**w, "start": round(w["start"] + OFFSET, 4)} for w in words]
        self.answer(200, {"wav": base64.b64encode(wav_bytes(pcm)).decode(), "sampleRate": RATE, "duration": round(len(pcm) / RATE, 4), "words": words, "voice": voice, "ms": ms})
        print(f"tts {ms:7.1f} ms  {len(pcm) / RATE:5.2f} s  {voice}  {text[:60]}", file=sys.stderr)

    def log_message(self, *a):
        pass


def main():
    global tts
    port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 5191
    t0 = time.perf_counter()
    if "--no-tts" not in sys.argv:
        from kokoro_tts import Kokoro
        tts = Kokoro(); tts.speak("Ready.")  # warm: the first synthesis compiles
    if "--no-stt" not in sys.argv:
        load_stt()
    if "--no-llm" not in sys.argv:
        load_llm()
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"voice-server: http://127.0.0.1:{server.server_address[1]} (llm {bool(llm)}, stt {stt_ready}, tts {bool(tts)}; ready in {time.perf_counter() - t0:.1f} s)", file=sys.stderr, flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
