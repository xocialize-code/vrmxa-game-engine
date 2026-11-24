# Creator hand test (M5 W9): a fresh agent with only the vrmxg skill makes the short, AppProbe scenario

The same rows as `HAND-TEST-M4-MCP.scenario.md`, for AB-T-0608's acceptance: the agent is
`node apps/creator-mac/scripts/mcp-session.mjs --skill --port 5194`, a session that knows VRMXG only through the
`vrmxg` skill (run from a folder outside the repository, no file, shell or web tools, a prompt that names no tool).
It has M4's first two rows only: rows that press Undo can't run while the agent may still be acting, and an agent
orders its steps as it sees fit (the editor's M5 scenario walks an agent's steps back and forth, AB-T-0619). This scenario opens its own copy of the project, `project-w9-skill` (copy `content/sample` there; the voice models are
the M4 fixtures' `models/`), and its creator polls the agent's server on 5194, so no other run's creator or project
meets it. Run it under the GPU lock and start the session once row 1 has passed (`../HAND-TEST-M5-SKILL.md`).

```scenario
app: VRMXG Creator
launch: ../../build/VRMXGCreator.app
checklist: ../HAND-TEST-M5-SKILL.md
env: {"VRMXG_SHELL_PROJECT": "project-w9-skill", "VRMXG_SHELL_MODELS": "models", "VRMXG_QUERY": "mcp=5194"}
fresh: false
```

- [ ] The project opens on the sample short, linked to the agent's MCP server, with no undo step.
  ```steps
  wait id=open-project enabled=true timeout_ms=60000
  until find("id=doc-state").0.name matches "^Short cafe-order " timeout=60000
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project-w9-skill"
  until find("id=doc-state").0.name matches "^Short cafe-order sequences/cafe-order.vrmxs [0-9]+ nodes saved valid " timeout=60000
  until find("id=sb-status").0.name == "Storyboard 11 shots, 11 thumbnails" timeout=120000
  set opened = find("id=doc-state").0.name
  expect find("id=undo").0.name == "Undo"   # nothing is an undo step yet
  expect find("id=mcp-state").0.name matches "^MCP"   # the page polls vrmxg-mcp --creator --port 5194
  shot "opened"
  ```

- [ ] An agent with only the vrmxg skill and the creator's MCP tools makes the short's edits; the last one is in the creator's Undo, marked (MCP), and the export it queued is in the render queue.
  ```steps
  until find("id=mcp-state").0.name matches "calls" timeout=1200000   # the agent's session has connected
  until find("id=undo").0.name matches "^Undo Shot 030: camera .* \(MCP\)$" timeout=1200000   # its last edit: shot 030's camera
  until find("id=q-job-1-status").count == 1 timeout=600000   # the export it queued
  expect find("id=undo").0.name matches "^Undo Shot 030: camera .* \(MCP\)$"   # queuing added no step of its own
  expect find("id=doc-state").0.name matches "unsaved changes"   # the agent didn't save
  until find("id=mcp-state").0.name matches "· short · [0-9]+ calls$" timeout=300000   # its last call, the history read: the app stays open until it has answered
  shot "after the agent"
  ```
