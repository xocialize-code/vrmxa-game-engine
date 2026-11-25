"""The Morning Rush's voiced lines (M5 W10, AB-T-0620): Kokoro-82M (Apache-2.0) with its built-in voices, through
mlx-audio, at 24 kHz, as make-voice.py voices the sample's. The lines are game/voice/lines.json ([{ id, voice, text }],
written by tools/make-game.mjs from the scenes' text). Each is written as game/voice/<id>.wav (16-bit PCM mono) and
game/voice/<id>.timings.json (the words with their start and duration, Kokoro's own predicted durations: the shape the
engine's lip sync and a Dialogue line's length read).

Lines that already have a clip are left alone (Kokoro's audio isn't byte-reproducible run to run, AB-L-0375, so a new
run doesn't change committed audio); --all remakes every one, --only <id> one. A line whose text changed in lines.json
is remade (its timings file keeps the text it was spoken from).

Run with a Python that has mlx-audio and misaki, and the Kokoro weights in the Hugging Face cache, from content/sample:
  HF_HUB_CACHE=<models> HF_HUB_OFFLINE=1 <venv>/bin/python -I tools/make-game-voice.py
"""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ in the content folder (every file there needs a licence row)
sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I leaves the script's folder off the path
from kokoro_tts import Kokoro, wav_bytes, timings  # noqa: E402

VOICE = Path(__file__).resolve().parent.parent / "game" / "voice"


def stale(line):
    t = VOICE / f"{line['id']}.timings.json"
    if not (VOICE / f"{line['id']}.wav").exists() or not t.exists():
        return True
    return json.loads(t.read_text()).get("text") != line["text"]


def main():
    args = sys.argv[1:]
    only = args[args.index("--only") + 1] if "--only" in args else None
    lines = json.loads((VOICE / "lines.json").read_text())
    todo = [l for l in lines if (only is None or l["id"] == only) and ("--all" in args or only or stale(l))]
    if not todo:
        print("every line has its clip (--all remakes them)", file=sys.stderr)
        return
    tts = Kokoro()
    for line in todo:
        voice = line.get("voice", "af_heart")
        pcm, words = tts.speak(line["text"], voice=voice)
        out = VOICE / f"{line['id']}.wav"
        out.write_bytes(wav_bytes(pcm))
        (VOICE / f"{line['id']}.timings.json").write_text(json.dumps(timings(line["text"], out.name, pcm, words, voice), indent=1) + "\n")
        print(f"wrote game/voice/{line['id']}.wav {len(pcm) / 24000:.2f} s, {len(words)} words ({voice})", file=sys.stderr)


if __name__ == "__main__":
    main()
