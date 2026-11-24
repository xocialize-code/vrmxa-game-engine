# The game app on the Mac (M5 W1): AppProbe scenario, WebGL forced

Run after `HAND-TEST-M5-GAME.scenario.md` (same build and fixtures), under the GPU lock:
`appprobe checklist scenario=apps/game-mac/docs/hand-test/HAND-TEST-M5-GAME-webgl.scenario.md`. The query switch
reaches the Mac app through `VRMXG_QUERY`: this scenario launches it with `renderer=webgl`, which wins over the stored
setting.

```scenario
app: The Cafe (test game)
launch: ../../build/cafe-test.app
checklist: ../HAND-TEST-M5-GAME.md
env: {"VRMXG_SHELL_SAVES": "game-w1/Saves", "VRMXG_SHELL_SETTINGS": "game-w1/settings.json", "VRMXG_QUERY": "renderer=webgl"}
fresh: false
```

- [ ] With `renderer=webgl` in the query the game draws on WebGL, and it plays.
  ```steps
  wait id=new-game enabled=true timeout_ms=60000
  until find("id=renderer").0.name == "Renderer WebGL" timeout=30000
  act id=new-game action=press
  until find("id=screen").0.name == "Screen playing" timeout=30000
  until find("id=scene").0.name == "Scene game/level.vrmxs" timeout=60000
  set before = find("id=step-count").0.name
  pause 1000
  expect find("id=step-count").0.name != $before   # it steps and draws
  expect find("role=alert").count == 0
  shot "webgl"
  ```
