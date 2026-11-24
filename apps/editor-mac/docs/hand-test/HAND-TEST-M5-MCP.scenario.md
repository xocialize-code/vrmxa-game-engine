# Editor hand test (M5 W9): an agent builds and exports the game, AppProbe scenario

Run `apps/editor-mac/scripts/build.sh`, launch the app once (its container must exist), then
`apps/editor-mac/scripts/hand-test-fixtures-m5-mcp.sh` (this scenario's own `project-w9-mcp` and `builds-w9/`, so a
run beside another scenario's can't pull its project away). Then, under the GPU lock (`../HAND-TEST-M5-MCP.md`),
`appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M5-MCP.scenario.md`, and once row 1 has passed,
`node apps/editor-mac/scripts/mcp-session.mjs --m5` (row 2 waits up to 20 minutes for the agent).
- **The editor polls the bridge on 5193** (`VRMXG_QUERY=mcp=5193`), and `--m5` serves it there: another editor or
  session on the default 5183 can't take the agent's calls.
- **The agent's steps** are read from the toolbar's `#undo` and `#redo` (`Undo <label>`): its two edits are labelled
  by the prompt, and the editor adds ` (MCP)`.
- **The agent saves before it exports**, so the scene it leaves is saved. Undo then makes the scene differ from the
  file, and the document line says "unsaved changes" with the opened hash; this scenario saves at each end to compare
  whole lines: after Undo the opened line exactly, after Redo the agent's.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M5-MCP.md
env: {"VRMXG_SHELL_PROJECT": "project-w9-mcp", "VRMXG_SHELL_BUILD": "builds-w9/", "VRMXG_QUERY": "mcp=5193"}
fresh: false
```

- [ ] The project opens on the cafe, linked to the agent's MCP server on its own port, with no undo step.
  ```steps
  wait id=open-project enabled=true timeout_ms=60000
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved" timeout=60000   # the bundled sample first
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project-w9-mcp" timeout=30000   # the scenario's own copy, read through /project/
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved" timeout=60000   # the project's first scene: cafe-cart.vrmxs
  act id=file-name action=set_value value=cafe.vrmxs   # the game's entry (game.json), which the agent is told is open
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene cafe\.vrmxs [0-9]+ nodes saved valid hash " timeout=60000
  set opened = find("id=doc-state").0.name
  expect find("id=undo").0.name == "Undo"   # nothing is an undo step yet
  expect find("id=mcp-state").0.name matches "^MCP"   # the page polls vrmxg-mcp --editor --port 5193
  shot "opened"
  ```

- [ ] An agent with only the editor's MCP tools adds a customer and a goal, validates, saves and exports the game; its last edit is in the editor's Undo, marked (MCP), and the build is written.
  ```steps
  until find("id=mcp-state").0.name matches "calls" timeout=1200000   # the agent's session has connected
  until find("id=undo").0.name == "Undo Add the serve goal (MCP)" timeout=1200000   # its second edit
  until find("id=doc-state").0.name matches "^Scene cafe\.vrmxs [0-9]+ nodes saved valid hash " timeout=600000   # it saved
  act id=export-open action=press
  wait id=export-game timeout_ms=5000
  until find("id=export-game-result").0.name matches "^Exported game cafe: [0-9]+ files, [0-9]+ bytes, entry cafe\.vrmxs, runtime .*/builds-w9/cafe$" timeout=600000   # the agent's export, through the shell
  expect find("role=alert").count == 0   # no error line
  set agent = find("id=doc-state").0.name
  expect $agent != $opened   # the agent's scene, saved
  shot "after the agent"
  partial: the build folder is checked against its manifest outside the app (vrmxg-export --verify), and the agent's calls are in results/mcp-editor-session-m5.json
  ```

- [ ] Undo walks the agent's edits back one step at a time, each named for the agent; saved, the scene is the one that opened.
  ```steps
  act id=undo action=press
  until find("id=undo").0.name == "Undo Add a customer (MCP)" timeout=30000   # the goal, its counter, its zone and rules went first
  expect find("id=redo").0.name == "Redo Add the serve goal (MCP)"
  act id=undo action=press
  until find("id=undo").0.name == "Undo" timeout=30000   # nothing of the agent's is left to undo
  expect find("id=redo").0.name == "Redo Add a customer (MCP)"   # Redo names the agent's first edit
  until find("id=doc-state").0.name matches "unsaved changes" timeout=30000   # the file is the agent's; the scene is not
  act id=save action=press
  until find("id=doc-state").0.name == $opened timeout=30000   # the scene exactly as it opened: same nodes, same hash, saved
  expect find("id=redo").0.name == "Redo Add a customer (MCP)"   # saving kept the history
  shot "after undo"
  ```

- [ ] Redo brings the agent's edits back, each still marked (MCP); saved, the scene is the agent's.
  ```steps
  act id=redo action=press
  until find("id=undo").0.name == "Undo Add a customer (MCP)" timeout=30000
  act id=redo action=press
  until find("id=undo").0.name == "Undo Add the serve goal (MCP)" timeout=30000
  expect find("id=redo").0.name == "Redo"   # every step is back
  act id=save action=press
  until find("id=doc-state").0.name == $agent timeout=30000   # the agent's scene again, to the hash
  shot "after redo"
  ```
