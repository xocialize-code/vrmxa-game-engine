# Editor hand test: an agent adds to the sample game and exports it (M5 W11, AB-T-0621)

M5 check 9 on the sample game, "The Morning Rush" (`content/sample/game`). W9's `HAND-TEST-M5-MCP` runs on the cafe
project, whose game has no rules; this one opens the sample game's level, so the agent reads the game's real rules
(counters, timers, goals, the lose condition), adds a fourth regular and a goal under the existing rules, validates,
saves and exports the game. The scenario ([`hand-test/HAND-TEST-M5-MCP-RUSH.scenario.md`](hand-test/HAND-TEST-M5-MCP-RUSH.scenario.md))
opens its own copy of the project, waits for the agent, then walks its steps back and forth with the toolbar's Undo and
Redo.

```sh
apps/editor-mac/scripts/build.sh
apps/editor-mac/scripts/hand-test-fixtures-m5-mcp-rush.sh
node acceptance/gpu-lock.mjs run --who editor-m5-mcp-rush -- appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M5-MCP-RUSH.scenario.md
node apps/editor-mac/scripts/mcp-session.mjs --rush    # after row 1 passes; records docs/hand-test/results/mcp-editor-session-m5-rush.json
node engine/packages/bundle/src/cli.js --verify "$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp/builds-w11/morning-rush"
```

- [x] The project opens on the sample game's level, linked to the agent's MCP server on its own port, with no undo step. *AppProbe 2026-11-26 00:28 UTC: Open Project on `project-w11-rush`, then `game/level.vrmxs` by the file field; 48 nodes, saved, valid, hash 53377e39…; no undo step; `#mcp-state` polling 5193.*
- [x] An agent with only the editor's MCP tools reads the sample game's rules, adds a regular and a goal, validates, saves and exports it; its last edit is in the editor's Undo, marked (MCP), and the build is written. *AppProbe 2026-11-26: `mcp-session.mjs --rush` (Sonnet, the editor's tools only): 15 MCP calls and one tool lookup, none failed, $0.28 ([record](hand-test/results/mcp-editor-session-m5-rush.json)). `game` read `morning-rush`'s rules (the counters score, served, mistakes; the clock and three brew timers; the goals serve and close-till; lost on the clock or two mistakes); validate ok, warning that `serve` and the title's `press-start` can't be completed by a connection (`serve` is reached from code, `tableZone`'s `game.add('served', 1)`, which validate can't follow; `press-start` is an optional, label-only goal that nothing completes; both are warnings only because the project's behaviours mention the game service, AB-T-0641; the agent listed them and didn't check them). `kai` made from aoi's asset with aoi's brain preset (arrive 120, seat stool-7); `greeted`, `greet-kai` and `kai-zone` under the existing rules, wired to `greeted.add`; validate ok again; saved; exported through the shell into `builds-w11/morning-rush`: 116 files, manifest 6cdaf299…. Outside the app, `vrmxg-export --verify` on the folder: whole, nothing changed or extra, and its `project/game/level.vrmxs` holds `kai` and `greet-kai`.*
- [x] Undo walks the agent's edits back one step at a time, each named for the agent; saved, the level is the one that opened. *AppProbe 2026-11-26: "Undo Add the greet goal (MCP)", then "Undo Add a customer (MCP)", then nothing; saved: the opened line exactly.*
- [x] Redo brings the agent's edits back, each still marked (MCP); saved, the level is the agent's. *AppProbe 2026-11-26: two Redos, each label read; Redo empty; saved: the agent's line exactly.*

## Results

| Date | Build | Rows | Result |
|---|---|---|---|
| 2026-11-26 | Release, ad hoc signed (`scripts/build.sh`), shell 0.13.0, main 981eaef + c03f0d8 | 1–4 | 4 of 4 on the first run (`acceptance/results/m5-acceptance/hand-tests/mcp-rush.md`) |
