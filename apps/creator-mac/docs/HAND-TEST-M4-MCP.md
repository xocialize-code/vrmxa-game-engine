# Creator hand test: an agent makes the short (M4 W11, AB-T-0583)

M4 check 9 in the Mac app: a Claude Code session with only the creator's MCP tools (`vrmxg-mcp --creator`) patches the
script, recasts a role, re-voices a line, changes a shot's camera, renders a frame and queues an export, and each of
its edits is a step of the creator's own Undo, marked "(MCP)". The scenario beside it
([`hand-test/HAND-TEST-M4-MCP.scenario.md`](hand-test/HAND-TEST-M4-MCP.scenario.md)) opens the project, waits for the
agent, then walks its steps back and forth with the toolbar's Undo and Redo.

Set up with `apps/creator-mac/scripts/build.sh` and `apps/creator-mac/scripts/hand-test-fixtures.sh`. The re-voicing
needs a TTS: run `content/sample/tools/tts-server.py` (Kokoro) under the machine's GPU lock, which also covers the
drawing. Then start the scenario, and once its first row has passed, the agent:

```sh
HF_HUB_CACHE=/Volumes/DEV_VOL1/Models HF_HUB_OFFLINE=1 node acceptance/gpu-lock.mjs run --who creator-mcp -- <venv>/bin/python -I content/sample/tools/tts-server.py --port 5190
appprobe checklist scenario=apps/creator-mac/docs/hand-test/HAND-TEST-M4-MCP.scenario.md
node apps/creator-mac/scripts/mcp-session.mjs          # after row 1 passes; records docs/hand-test/results/mcp-creator-session.json
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
