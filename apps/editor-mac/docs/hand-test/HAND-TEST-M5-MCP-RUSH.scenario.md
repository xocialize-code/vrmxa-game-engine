# Editor hand test (M5 W11): an agent adds to the sample game and exports it, AppProbe scenario

M5's check 9 on the sample game itself, "The Morning Rush" (W9's `HAND-TEST-M5-MCP` was written before W10 and runs on
the cafe project, whose game has no rules). Run `apps/editor-mac/scripts/build.sh`, launch the app once (its container
must exist), then `apps/editor-mac/scripts/hand-test-fixtures-m5-mcp-rush.sh` (this scenario's own `project-w11-rush`,
the sample with the game's `game/game.json` as its `game.json`, and `builds-w11/`). Then, under the GPU lock,
`appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M5-MCP-RUSH.scenario.md`, and once row 1 has
passed, `node apps/editor-mac/scripts/mcp-session.mjs --rush` (row 2 waits up to 20 minutes for the agent).
- **The editor polls the bridge on 5193** (`VRMXG_QUERY=mcp=5193`), and `--rush` serves it there.
- **The agent's steps** are read from the toolbar's `#undo` and `#redo`: its two edits are labelled by the prompt, and
  the editor adds ` (MCP)`. The scene is saved at each end to compare whole document lines, as `HAND-TEST-M5-MCP` does.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M5-MCP-RUSH.md
env: {"VRMXG_SHELL_PROJECT": "project-w11-rush", "VRMXG_SHELL_BUILD": "builds-w11/", "VRMXG_QUERY": "mcp=5193"}
fresh: false
```

- [ ] The project opens on the sample game's level, linked to the agent's MCP server on its own port, with no undo step.
  ```steps
  wait id=open-project enabled=true timeout_ms=60000
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved" timeout=60000   # the bundled sample first
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project-w11-rush" timeout=30000   # the scenario's own copy, read through /project/
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved" timeout=60000   # the project's first scene: cafe-cart.vrmxs
  act id=file-name action=set_value value=game/level.vrmxs   # the level, where the game's rules are, which the agent is told is open
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene game/level\.vrmxs 48 nodes saved valid hash " timeout=60000
  set opened = find("id=doc-state").0.name
  expect find("id=undo").0.name == "Undo"   # nothing is an undo step yet
  expect find("id=mcp-state").0.name matches "^MCP"   # the page polls vrmxg-mcp --editor --port 5193
  shot "opened"
  ```

- [ ] An agent with only the editor's MCP tools reads the sample game's rules, adds a regular and a goal, validates, saves and exports it; its last edit is in the editor's Undo, marked (MCP), and the build is written.
  ```steps
  until find("id=mcp-state").0.name matches "calls" timeout=1200000   # the agent's session has connected
  until find("id=undo").0.name == "Undo Add the greet goal (MCP)" timeout=1200000   # its second edit
  until find("id=doc-state").0.name matches "^Scene game/level\.vrmxs [0-9]+ nodes saved valid hash " timeout=600000   # it saved
  act id=export-open action=press
  wait id=export-game timeout_ms=5000
  until find("id=export-game-result").0.name matches "^Exported game morning-rush: [0-9]+ files, [0-9]+ bytes, entry game/title\.vrmxs, runtime .*/builds-w11/morning-rush$" timeout=600000   # the agent's export, through the shell
  expect find("role=alert").count == 0   # no error line
  set agent = find("id=doc-state").0.name
  expect $agent != $opened   # the agent's scene, saved
  shot "after the agent"
  partial: the build folder is checked against its manifest outside the app (vrmxg-export --verify), and the agent's calls are in results/mcp-editor-session-m5-rush.json
  ```

- [ ] Undo walks the agent's edits back one step at a time, each named for the agent; saved, the level is the one that opened.
  ```steps
  act id=undo action=press
  until find("id=undo").0.name == "Undo Add a customer (MCP)" timeout=30000
  expect find("id=redo").0.name == "Redo Add the greet goal (MCP)"
  act id=undo action=press
  until find("id=undo").0.name == "Undo" timeout=30000   # nothing of the agent's is left to undo
  expect find("id=redo").0.name == "Redo Add a customer (MCP)"
  until find("id=doc-state").0.name matches "unsaved changes" timeout=30000   # the file is the agent's; the scene is not
  act id=save action=press
  until find("id=doc-state").0.name == $opened timeout=30000   # the level exactly as it opened: same nodes, same hash, saved
  shot "after undo"
  ```

- [ ] Redo brings the agent's edits back, each still marked (MCP); saved, the level is the agent's.
  ```steps
  act id=redo action=press
  until find("id=undo").0.name == "Undo Add a customer (MCP)" timeout=30000
  act id=redo action=press
  until find("id=undo").0.name == "Undo Add the greet goal (MCP)" timeout=30000
  expect find("id=redo").0.name == "Redo"   # every step is back
  act id=save action=press
  until find("id=doc-state").0.name == $agent timeout=30000   # the agent's level again, to the hash
  shot "after redo"
  ```
