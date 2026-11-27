# Editor hand test: an agent adds a level to "After Hours" and exports it (M6 W8, AB-T-0649)

W8's acceptance: an agent with only the editor's MCP tools builds onto the second game, "After Hours" (W10,
`content/sample/after-hours`). It copies the first level into a second one, adds a book and a shelf that runs the game's
own `shelf` behaviour, wires the shelf's signals, names the level in the game with a licence row, sends the first level on
to it, and validates and exports. The agent loads the repository's `vrmxg` skill and is told to follow its building rules
(AB-T-0678), so this is their first test too. The scenario
([`hand-test/HAND-TEST-M6-MCP-AFTER-HOURS.scenario.md`](hand-test/HAND-TEST-M6-MCP-AFTER-HOURS.scenario.md)) opens its
own copy of the project, waits for the agent, walks its last step back and forth with the toolbar's Undo and Redo, and
opens the level the agent made.

```sh
apps/editor-mac/scripts/build.sh
apps/editor-mac/scripts/hand-test-fixtures-m6-mcp-after-hours.sh
node acceptance/gpu-lock.mjs run --who editor-m6-mcp-after-hours -- appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M6-MCP-AFTER-HOURS.scenario.md
node apps/editor-mac/scripts/mcp-session.mjs --w8    # after row 1 passes; records docs/hand-test/results/mcp-editor-session-m6-after-hours.json
node engine/packages/bundle/src/cli.js --verify "$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp/builds-w8/after-hours"
```

- [x] The project opens on After Hours' first level, polling for the agent's MCP server on its own port with no other editor holding the link, and with no undo step.
- [x] An agent with only the editor's MCP tools (and the vrmxg skill) adds a second level with a behaviour and its connections, names it in the game, sends the first level on to it, validates and exports; its last edit is in the editor's Undo, marked (MCP), and the build is written.
- [x] Undo takes the agent's last step back, named for the agent; saved, the first level is the one that opened.
- [x] Redo brings it back, still marked (MCP); saved, the first level is the agent's.
- [x] The second level opens in the editor as the agent saved it: valid, 41 nodes, with its two books, the store shelf's Area, the shelf's behaviour and its four connections.

## Results

| Date | Build | Rows | Result |
|---|---|---|---|
| 2026-11-27 | Release, ad hoc signed (`scripts/build.sh`), shell 0.16.0, WebGPU, branch `claude/m6-w8-after-hours` on main 606620c | 1–5 | 5 of 5 on the second run (`hand-test/results/m6-mcp-after-hours/`). The agent (Sonnet, 37 calls, none failed, $0.42; `hand-test/results/mcp-editor-session-m6-after-hours.json`) put `book-2` at [3.4, 0.775, −2], `book-2-shelved` at [8.2, 0.615, −5.02] and `zone-store` at [8, 1, −4.3], 1.2 × 2 × 0.9. `--verify` on `builds-w8/after-hours`: whole, 70 files, 18,985,412 bytes, manifest `b5730154…cebd`, the same manifest as the headless rehearsal and the first run. I stopped the first run in row 2, which would have timed out: the prompt didn't name the export, the agent called it `after-hours-2-levels`, and row 2 checks `builds-w8/after-hours`. The prompt now names it |
| 2026-11-27 | The same, with the Export line's `~` (PR 74's review) | 1, 5 | Rows 1 and 5, tightened after the run above (row 1: polling with no other editor holding the link; row 5: 41 nodes, `book-2`, `book-2-shelved`, and `zone-store`'s `shelf` behaviour and four connections), run again on the project the agent saved, so row 1 opened the agent's first level: 2 of 2 (`hand-test/results/m6-mcp-after-hours/rows-1-5/`). The first run's shots r2 to r5 have the Export line's path painted over (its report says so) |
