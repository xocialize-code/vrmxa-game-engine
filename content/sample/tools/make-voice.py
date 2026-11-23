"""The sample's voice lines (M1 W6, M2 W10): Kokoro-82M (Apache-2.0) with its built-in voices, through mlx-audio, at
24 kHz. The lines are listed in voice/lines.json ([{ id, voice, text }]: M1 to M3's lines; since M4 W7
tools/bake-lines.mjs voices sequences itself, through tools/tts-server.py, and no longer adds lines here). Each is written as voice/<id>.wav (16-bit PCM mono) and voice/<id>.timings.json: the words
with their start and duration in seconds, from Kokoro's own predicted durations, the shape the engine's lip sync reads.

Lines that already have a clip are left alone (a new run doesn't change committed audio); --all remakes every one,
--only <id> one.

Run with a Python that has mlx-audio and the Kokoro weights in the Hugging Face cache, from content/sample:
  HF_HUB_CACHE=/Volumes/DEV_VOL1/Models HF_HUB_OFFLINE=1 <venv>/bin/python -I tools/make-voice.py
"""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ in the content folder (every file there needs a licence row)
sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I leaves the script's folder off the path
from kokoro_tts import Kokoro, wav_bytes, timings  # noqa: E402

HERE = Path(__file__).resolve().parent.parent


def main():
    args = sys.argv[1:]
    only = args[args.index("--only") + 1] if "--only" in args else None
    lines = json.loads((HERE / "voice" / "lines.json").read_text())
    todo = [l for l in lines if (only is None or l["id"] == only) and ("--all" in args or only or not (HERE / "voice" / f"{l['id']}.wav").exists())]
    if not todo:
        print("every line has its clip (--all remakes them)", file=sys.stderr)
        return
    tts = Kokoro()
    for line in todo:
        pcm, words = tts.speak(line["text"], voice=line.get("voice", "af_heart"))
        out = HERE / "voice" / f"{line['id']}.wav"
        out.write_bytes(wav_bytes(pcm))
        (HERE / "voice" / f"{line['id']}.timings.json").write_text(json.dumps(timings(line["text"], out.name, pcm, words, line.get("voice", "af_heart")), indent=1) + "\n")
        print(f"wrote voice/{line['id']}.wav {len(pcm) / 24000:.2f} s, {len(words)} words ({line.get('voice', 'af_heart')})", file=sys.stderr)


if __name__ == "__main__":
    main()
