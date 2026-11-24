# Creator hand test (M4 W11): an agent makes the short, AppProbe scenario

Run `apps/creator-mac/scripts/build.sh`, then `apps/creator-mac/scripts/hand-test-fixtures.sh` (it puts Kokoro where
the app's `tts.speak` reads it: no TTS server, AB-T-0614), under the GPU lock (`../HAND-TEST-M4-MCP.md`). Then
`appprobe checklist scenario=apps/creator-mac/docs/hand-test/HAND-TEST-M4-MCP.scenario.md`, and once row 1 has
passed, `node apps/creator-mac/scripts/mcp-session.mjs` (row 2 waits up to 20 minutes for the agent).
- **The agent's steps** are read from the toolbar's `#undo` (`Undo <label>`): with `pageUndo`, Edit › Undo's title
  stays "Undo". `#mcp-state` says whether the page is linked to `vrmxg-mcp --creator` and how many calls it has run.
- **Labels** come from the packages the commands go through: `Re-script (1 changed)` (@vrmxg/script), `Cast HANA: …`
  (@vrmxg/cast, with the re-voicing in the same step), `Voice line "…" (new words)` (the script reworded, re-scripted and voiced in one step), `Shot 030: camera …`
  (@vrmxg/coverage), each with ` (MCP)` added by the agent's session.

```scenario
app: VRMXG Creator
launch: ../../build/VRMXGCreator.app
checklist: ../HAND-TEST-M4-MCP.md
env: {"VRMXG_SHELL_PROJECT": "project", "VRMXG_SHELL_MODELS": "models"}
fresh: false
```

- [ ] The project opens on the sample short, linked to the agent's MCP server, with no undo step.
  ```steps
  wait id=open-project enabled=true timeout_ms=60000
  until find("id=doc-state").0.name matches "^Short cafe-order " timeout=60000
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project"
  until find("id=doc-state").0.name matches "^Short cafe-order sequences/cafe-order.vrmxs [0-9]+ nodes saved valid " timeout=60000
  until find("id=sb-status").0.name == "Storyboard 11 shots, 11 thumbnails" timeout=120000
  set opened = find("id=doc-state").0.name
  expect find("id=undo").0.name == "Undo"   # nothing is an undo step yet
  expect find("id=mcp-state").0.name matches "^MCP"   # the page polls vrmxg-mcp --creator (on in the Mac app)
  shot "opened"
  ```

- [ ] An agent with only the creator's MCP tools makes the short's edits; the last one is in the creator's Undo, marked (MCP), and the export it queued is in the render queue.
  ```steps
  until find("id=mcp-state").0.name matches "calls" timeout=1200000   # the agent's session has connected
  until find("id=undo").0.name matches "^Undo Shot 030: camera .* \(MCP\)$" timeout=1200000   # its last edit: shot 030's camera
  until find("id=q-job-1-status").count == 1 timeout=600000   # the export it queued
  expect find("id=undo").0.name matches "^Undo Shot 030: camera .* \(MCP\)$"   # queuing added no step of its own
  expect find("id=doc-state").0.name matches "unsaved changes"   # the agent didn't save
  shot "after the agent"
  ```

- [ ] Undo walks the agent's edits back one step at a time, each named for the agent: the shot's camera, the re-voiced line, the cast and its voices, the re-script; the short comes back to its opened hash.
  ```steps
  act id=undo action=press
  until find("id=undo").0.name == "Undo Voice line \"Is it always this quiet before nine?\" (new words) (MCP)" timeout=30000   # the camera went first; the line's new words (script, sequence and voice) are next
  act id=undo action=press
  until find("id=undo").0.name matches "^Undo Cast HANA: .* \(MCP\)$" timeout=30000   # the cast, with its re-voicing, is one step
  act id=undo action=press
  until find("id=undo").0.name == "Undo Re-script (1 changed) (MCP)" timeout=30000   # the script patch
  act id=undo action=press
  until find("id=undo").0.name == "Undo" timeout=30000   # nothing of the agent's is left to undo
  until find("id=doc-state").0.name == $opened timeout=30000   # the short exactly as it opened (same hash, saved)
  expect find("id=redo").0.name == "Redo Re-script (1 changed) (MCP)"   # Redo names the agent's first edit
  shot "after undo"
  ```

- [ ] Redo brings the agent's edits back, each still marked (MCP), to the same hash.
  ```steps
  act id=redo action=press
  until find("id=undo").0.name == "Undo Re-script (1 changed) (MCP)" timeout=30000
  act id=redo action=press
  until find("id=undo").0.name matches "^Undo Cast HANA: .* \(MCP\)$" timeout=30000
  act id=redo action=press
  until find("id=undo").0.name == "Undo Voice line \"Is it always this quiet before nine?\" (new words) (MCP)" timeout=30000
  act id=redo action=press
  until find("id=undo").0.name matches "^Undo Shot 030: camera .* \(MCP\)$" timeout=30000
  expect find("id=redo").0.name == "Redo"   # every step is back
  expect find("id=doc-state").0.name != $opened   # the agent's short again, not the opened one
  shot "after redo"
  ```
