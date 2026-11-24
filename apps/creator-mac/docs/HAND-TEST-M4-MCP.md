# Creator hand test: an agent makes the short (M4 W11, AB-T-0583)

M4 check 9 in the Mac app: a Claude Code session with only the creator's MCP tools (`vrmxg-mcp --creator`) patches the
script, recasts a role, re-voices a line, changes a shot's camera, renders a frame and queues an export, and each of
its edits is a step of the creator's own Undo, marked "(MCP)". The scenario beside it
([`hand-test/HAND-TEST-M4-MCP.scenario.md`](hand-test/HAND-TEST-M4-MCP.scenario.md)) opens the project, waits for the
agent, then walks its steps back and forth with the toolbar's Undo and Redo.

Set up with `apps/creator-mac/scripts/build.sh` and `apps/creator-mac/scripts/hand-test-fixtures.sh`. The re-voicing
speaks through the app's own `tts.speak` (AB-T-0614): the fixtures put Kokoro in the app's sandbox and the scenario
launches with `VRMXG_SHELL_MODELS=models`, so there is no TTS server to run. Start the scenario under the machine's GPU
lock, and once its first row has passed, the agent:

```sh
node acceptance/gpu-lock.mjs run --who creator-mcp -- appprobe checklist scenario=apps/creator-mac/docs/hand-test/HAND-TEST-M4-MCP.scenario.md
node apps/creator-mac/scripts/mcp-session.mjs          # after row 1 passes; records docs/hand-test/results/mcp-creator-session.json
node apps/creator-mac/scripts/check-shell-takes.mjs --expect 5   # the takes the shell spoke: HANA's four and Mira's reworded line
```

- [x] The project opens on the sample short, linked to the agent's MCP server, with no undo step. *AppProbe 2026-11-23: Open Project on a fresh copy of the sample; `#mcp-state` polling; no undo step.*
- [x] An agent with only the creator's MCP tools makes the short's edits; the last one is in the creator's Undo, marked (MCP), and the export it queued is in the render queue. *AppProbe 2026-11-23: `mcp-session.mjs` (Sonnet, the creator's seven tools only): 19 calls, none failed ([record](hand-test/results/mcp-creator-session.json)). The script patched, HANA cast in af_nicole with 4 lines re-voiced by Kokoro, a line reworded and voiced, shot 030 on a new close-up of Mira, frame 200 rendered, a review export queued; queuing added no step. What the agent's frame looks like was checked by eye on the screenshot, not by the scenario.*
- [x] Undo walks the agent's edits back one step at a time, each named for the agent: the shot's camera, the re-voiced line, the cast and its voices, the re-script; the short comes back to its opened hash. *AppProbe 2026-11-23: four toolbar Undos, each label read: "Shot 030: camera vc-030-closeup (MCP)", "Voice line … (new words) (MCP)", "Cast HANA: Minimal (MCP)", "Re-script (1 changed) (MCP)"; then the opened hash, saved. The voices' audio wasn't listened to.*
- [x] Redo brings the agent's edits back, each still marked (MCP), to the same hash. *AppProbe 2026-11-23: four Redos, each label read; Redo empty at the end.*

## Results

| Row | Step | What happened | Undo |
|---|---|---|---|
| 2–3 | First session: queue_export after the agent's edits | `queueShort` built the applied script again: an unmarked "Re-script" step on top, which put the re-voiced line's words back to the script's. Fixed: queuing and saving apply only unapplied typing, and new words for a line go into the script (one step) | Re-script |
| 3 | `until doc-state == "$opened"` | The scenario's own mistake: a quoted `$opened` isn't substituted. Fixed in the scenario | — |
| 2 | 2026-11-24, the first run through the shell's `tts.speak` (AB-T-0614) | The voice didn't load: the app had inherited `HF_HUB_CACHE` from the shell that launched it, a folder outside its sandbox, and Kokoro's G2P model's lock file there couldn't be opened. The agent's recast and re-voice were refused (3 of 20 calls) and it made two steps, not four. Fixed: the voice's hub cache follows its models folder | Shot 030: camera … |
| 1–4 | 2026-11-24, the run after that fix | 4 of 4 rows with no TTS server and no query. The agent: 19 calls, none failed. `check-shell-takes.mjs`: 5 takes carry "(shell)", HANA's four in af_nicole and Mira's reworded line in af_bella, each with timed words. Nobody listened to them ([report](hand-test/results/ab-t-0614/mcp/report.md), AB-R-1098) | the four steps, each "(MCP)" |
