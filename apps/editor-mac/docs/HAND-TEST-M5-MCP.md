# Editor hand test: an agent builds and exports the game (M5 W9, AB-T-0619)

M5 check 9 in the Mac app: a Claude Code session with only the editor's MCP tools (`vrmxg-mcp --editor`) reads the
sample game's rules, adds a customer and a goal, validates the project, saves and exports the game, and each of its
edits is a step of the editor's own Undo, marked "(MCP)". The scenario beside it
([`hand-test/HAND-TEST-M5-MCP.scenario.md`](hand-test/HAND-TEST-M5-MCP.scenario.md)) opens its own copy of the
project, waits for the agent, then walks its steps back and forth with the toolbar's Undo and Redo.

```sh
apps/editor-mac/scripts/build.sh
apps/editor-mac/scripts/hand-test-fixtures-m5-mcp.sh
node acceptance/gpu-lock.mjs run --who editor-m5-mcp -- appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M5-MCP.scenario.md
node apps/editor-mac/scripts/mcp-session.mjs --m5      # after row 1 passes; records docs/hand-test/results/mcp-editor-session-m5.json
node engine/packages/bundle/src/cli.js --verify "$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp/builds-w9/cafe"
```

- [x] The project opens on the cafe, linked to the agent's MCP server on its own port, with no undo step. *AppProbe 2026-11-24: Open Project on `project-w9-mcp`, then `cafe.vrmxs` by the file field (the project's first scene is `cafe-cart.vrmxs`); 29 nodes, saved, hash 8fb64e11…; no undo step; `#mcp-state` polling 5193.*
- [x] An agent with only the editor's MCP tools adds a customer and a goal, validates, saves and exports the game; its last edit is in the editor's Undo, marked (MCP), and the build is written. *AppProbe 2026-11-24: `mcp-session.mjs --m5` (Sonnet, the editor's tools only): 17 calls, none failed, $0.26 ([record](hand-test/results/mcp-editor-session-m5.json)). `customer-1` from Hana's asset with the customer brain; `rules`, `served`, `serve-customer` and `counter-zone` wired to `served.add`; validate ok before and after; saved; exported through the shell into `builds-w9/cafe`: 61 files, manifest 4df45e16…. Outside the app, `vrmxg-export --verify` on the folder: whole, nothing changed or extra, and its `project/cafe.vrmxs` holds `customer-1` ([shot](hand-test/shots/m5-mcp/r2-1.png); the export line's folder path is covered).*
- [x] Undo walks the agent's edits back one step at a time, each named for the agent; saved, the scene is the one that opened. *AppProbe 2026-11-24: "Undo Add the serve goal (MCP)", then "Undo Add a customer (MCP)", then nothing to undo, Redo naming the agent's first edit; saved: the opened line exactly (29 nodes, hash 8fb64e11…).*
- [x] Redo brings the agent's edits back, each still marked (MCP); saved, the scene is the agent's. *AppProbe 2026-11-24: two Redos, each label read; Redo empty; saved: the agent's line exactly (34 nodes, hash 38f3e493…).*

## Results

| Row | Step | What happened | Undo |
|---|---|---|---|
| 1–2 | 2026-11-24, first run | The editor opened the project's first scene, `cafe-cart.vrmxs`, not the game's entry. The agent saw it through `game` (the open scene isn't one of the game's), made its two edits there, then stopped before saving and asked. It also read `describe` of GameRules and GameGoal cut off at the 24,000-character limit: a condition was written out three levels deep for every condition prop. Fixed: the scenario opens `cafe.vrmxs`; `describe` gives the condition language once (every type now fits) | — |
| 1–4 | 2026-11-24, the run after those fixes | 4 of 4 rows. The agent: 17 calls, none failed ([report](hand-test/results/m5-mcp/report.md)) | the two steps, each "(MCP)" |
