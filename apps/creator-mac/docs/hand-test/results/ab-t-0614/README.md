# AB-T-0614: the creator's Mac app speaks through the shell's own tts.speak

Runs of 2026-11-24 on the M5 Max (macOS 27.3 beta 26C5047e), VRMXG Creator built from the branch with
`scripts/build.sh`, AppProbe 0.5.1, each under the GPU lock. `mcp/` is the run on the branch's final code, after the
review's fixes below; `creator/` and `release/footprint.txt` are from 88bf459, before them. No TTS server was running and no `VRMXG_QUERY` was set:
the app was launched with `VRMXG_SHELL_MODELS=models`, the Kokoro folder `scripts/hand-test-fixtures.sh` puts in its
sandbox. Receipt AB-R-1098.

| Folder | Run | Result |
|---|---|---|
| `mcp/` | `HAND-TEST-M4-MCP.scenario.md` with `scripts/mcp-session.mjs` (the record is `../mcp-creator-session.json`) | 4 of 4 rows. The agent: 19 calls, none failed. `shell-takes.json` (`scripts/check-shell-takes.mjs`): 5 takes whose timings name the shell as speaker, HANA's four in af_nicole and Mira's reworded line in af_bella, each a 24 kHz WAV with timed words |
| `creator/` | `HAND-TEST-M4-CREATOR.scenario.md`, now with the voice linked | 15 of 15 rows. Its cast into the draft short spoke 2 lines through the shell. `footprint.txt` is the app's memory through the run |
| `release/` | `voice-release.scenario.md`: open the draft short, cast (2 lines spoken), idle 20 s, File › Export…, idle | 3 of 3 rows. `footprint.txt`: the app process's physical footprint, one line a second (`<epoch seconds> <MB>`). `footprint-after-review.txt`: the same check on the final code, 3 of 3 rows |

## Memory: what the voice holds, and that it leaves before a render

From `release/footprint.txt` (seconds from the app's launch):

| When | The app's footprint |
|---|---|
| Idle, before any line is spoken (0 to 19 s) | 48 to 57 MB |
| The cast: Kokoro loads and speaks two lines (20 to 21 s) | a peak of 2,640 MB |
| Idle after the cast (23 to 43 s) | 2,506 MB, steady |
| File › Export… starts: the page calls `voice.release` (44 s) | 78 MB |
| Through the render and after (45 to 58 s) | 93 to 95 MB |

On the final code (`release/footprint-after-review.txt`) the same check gave 2,514 MB steady after the cast and 81 MB
one second after the export started.

## After the review

An independent read of the diff found nothing that breaks the path above, and four things worth fixing. All four are
fixed, and the MCP scenario and the release check were run again on the result:
- The hub cache is moved into the models folder only when the inherited one can't be written to, so the playground's
  and the companion's existing download is still found.
- `voice.release` answers busy while any caller waits on a prepare, and always asks the backend, which evicts every
  registered part: a prepare that failed midway no longer leaves a model loaded.
- The page waits out a line that is being spoken (up to 5 s) before a render, where it used to give up at once.
- The fixtures copy each model folder under another name and rename it, so an interrupted copy isn't taken for a whole
  one, and they copy the G2P model to where the hub client looks for it.

## What went wrong on the way

The first run of the MCP scenario reached `tts.speak`, and the voice didn't load. The app had inherited `HF_HUB_CACHE`
from the shell that launched it: a folder outside its sandbox. Kokoro's G2P model comes through the hub client, whose
lock file there couldn't be opened (errno 1). The agent's recast and its re-voice were refused (3 of its 20 calls). The
voice backend now moves the hub client's cache into the voice's models folder when the inherited one can't be written to.

## Not checked

- Nobody listened to the takes. They carry timed words, and the two whose samples were read carry sound (peaks at 0.41 and 0.47 of full scale).
- The folder panel a person sees the first time a line needs speaking (`voice.chooseModels`) wasn't driven: AppProbe
  can't type into a system panel, so the hand tests name the folder with `VRMXG_SHELL_MODELS`.
- The numbers are one or two runs each, on a machine in use.
- A line voiced while a render is running loads the voice again; nothing stops that.
- `HAND-TEST-M4-CREATOR` (15 of 15) was not run again after the review's fixes.
