# Editor hand test (M6 W8): an agent adds a level to "After Hours" and exports it, AppProbe scenario

W8's acceptance on the second game. Run `apps/editor-mac/scripts/build.sh`, launch the app once (its container must
exist), then `apps/editor-mac/scripts/hand-test-fixtures-m6-mcp-after-hours.sh` (this scenario's own
`project-w8-after-hours`, the sample with After Hours' `after-hours/game.json` as its `game.json`, and `builds-w8/`).
Then, under the GPU lock, `appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M6-MCP-AFTER-HOURS.scenario.md`,
and once row 1 has passed, `node apps/editor-mac/scripts/mcp-session.mjs --w8` (row 2 waits up to 20 minutes for the
agent).
- **The editor polls the bridge on 5193** (`VRMXG_QUERY=mcp=5193`), and `--w8` serves it there.
- **The agent works on two scenes.** It makes and saves `after-hours/level-2.vrmxs` (three labelled edits), then opens
  the first level again for its last edit, "Go on to the second night". Opening a scene starts its own Undo, so the
  toolbar's `#undo` and `#redo` hold that one step. The first level is saved at each end to compare whole document
  lines, as `HAND-TEST-M5-MCP-RUSH` does, and the second level is opened at the end.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M6-MCP-AFTER-HOURS.md
env: {"VRMXG_SHELL_PROJECT": "project-w8-after-hours", "VRMXG_SHELL_BUILD": "builds-w8/", "VRMXG_QUERY": "mcp=5193"}
fresh: false
```

- [ ] The project opens on After Hours' first level, linked to the agent's MCP server on its own port, with no undo step.
  ```steps
  wait id=open-project enabled=true timeout_ms=60000
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved" timeout=60000   # the bundled sample first
  act id=open-project action=press
  until find("id=project-name").0.name matches "^Project " timeout=30000
  until find("id=doc-state").0.name matches "^Scene [^ ]+ [0-9]+ nodes saved" timeout=60000   # the project's first scene
  act id=file-name action=set_value value=after-hours/level.vrmxs   # the level the agent is told is open
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene after-hours/level\.vrmxs 38 nodes saved valid hash " timeout=60000
  set opened = find("id=doc-state").0.name
  expect find("id=undo").0.name == "Undo"   # nothing is an undo step yet
  expect find("id=mcp-state").0.name matches "^MCP"   # the page polls vrmxg-mcp --editor --port 5193
  shot "opened"
  ```

- [ ] An agent with only the editor's MCP tools (and the vrmxg skill) adds a second level with a behaviour and its connections, names it in the game, sends the first level on to it, validates and exports; its last edit is in the editor's Undo, marked (MCP), and the build is written.
  ```steps
  until find("id=mcp-state").0.name matches "calls" timeout=1200000   # the agent's session has connected
  until find("id=undo").0.name == "Undo Go on to the second night (MCP)" timeout=1200000   # its last edit, on the first level
  until find("id=doc-state").0.name matches "^Scene after-hours/level\.vrmxs 38 nodes saved valid hash " timeout=600000   # it saved
  act id=export-open action=press
  wait id=export-game timeout_ms=5000
  until find("id=export-game-result").0.name matches "^Exported game after-hours: [0-9]+ files, [0-9]+ bytes, entry after-hours/title\.vrmxs, runtime .*/builds-w8/after-hours$" timeout=600000   # the agent's export, through the shell
  expect find("role=alert").count == 0   # no error line
  set agent = find("id=doc-state").0.name
  expect $agent != $opened   # the agent's first level, saved
  shot "after the agent"
  partial: the build folder is checked against its manifest outside the app (vrmxg-export --verify), and the agent's calls are in results/mcp-editor-session-m6-after-hours.json
  ```

- [ ] Undo takes the agent's last step back, named for the agent; saved, the first level is the one that opened.
  ```steps
  act id=undo action=press
  until find("id=undo").0.name == "Undo" timeout=30000   # nothing of the agent's is left to undo here
  expect find("id=redo").0.name == "Redo Go on to the second night (MCP)"
  until find("id=doc-state").0.name matches "unsaved changes" timeout=30000   # the file is the agent's; the scene is not
  act id=save action=press
  until find("id=doc-state").0.name == $opened timeout=30000   # the level exactly as it opened: same nodes, same hash, saved
  shot "after undo"
  ```

- [ ] Redo brings it back, still marked (MCP); saved, the first level is the agent's.
  ```steps
  act id=redo action=press
  until find("id=undo").0.name == "Undo Go on to the second night (MCP)" timeout=30000
  expect find("id=redo").0.name == "Redo"   # every step is back
  act id=save action=press
  until find("id=doc-state").0.name == $agent timeout=30000   # the agent's level again, to the hash
  shot "after redo"
  ```

- [ ] The second level opens in the editor as the agent saved it: valid, with its book, its shelf and the shelf's behaviour.
  ```steps
  act id=file-name action=set_value value=after-hours/level-2.vrmxs
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene after-hours/level-2\.vrmxs [0-9]+ nodes saved valid hash " timeout=60000   # 38 copied, book-2, book-2-shelved, zone-store, and any group the building rules led to
  expect find("id=undo").0.name == "Undo"   # opened fresh: the agent's steps were saved, not left in an undo history
  expect find("role=alert").count == 0
  shot "the second level"
  ```
