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

- [ ] The project opens on After Hours' first level, linked to the agent's MCP server on its own port, with no undo step.
- [ ] An agent with only the editor's MCP tools (and the vrmxg skill) adds a second level with a behaviour and its connections, names it in the game, sends the first level on to it, validates and exports; its last edit is in the editor's Undo, marked (MCP), and the build is written.
- [ ] Undo takes the agent's last step back, named for the agent; saved, the first level is the one that opened.
- [ ] Redo brings it back, still marked (MCP); saved, the first level is the agent's.
- [ ] The second level opens in the editor as the agent saved it: valid, with its book, its shelf and the shelf's behaviour.

## Results

| Date | Build | Rows | Result |
|---|---|---|---|
