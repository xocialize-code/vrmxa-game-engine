# VRMXG Playground: which backend draws (M4 check 8, M4 W13): AppProbe scenario, WebGL forced

Run `apps/playground-mac/scripts/build.sh`, then
`appprobe checklist scenario=apps/playground-mac/docs/hand-test/HAND-TEST-M4-BACKEND-webgl.scenario.md` (under the GPU lock). The `#renderer`
readout carries the backend in its accessible name (`Renderer WebGPU`, `Renderer WebGL`).
The query switch reaches the Mac app through `VRMXG_QUERY`: this scenario launches it with `renderer=webgl`.

```scenario
app: VRMXG Playground
launch: ../../build/VRMXGPlayground.app
checklist: ../HAND-TEST-M4-BACKEND.md
env: {"VRMXG_QUERY": "renderer=webgl"}
fresh: false
```

- [ ] With `renderer=webgl` in the query the playground draws on WebGL, and it plays.
  ```steps
  wait id=play enabled=true timeout_ms=60000
  until find("id=renderer").0.name == "Renderer WebGL" timeout=60000
  set before = find("id=step-count").0.name
  act id=play action=press
  until find("id=play").0.name == "Pause"
  pause 1500
  expect find("id=step-count").0.name != $before   # it steps and draws
  expect find("role=statictext text=Error").count == 0
  shot "webgl"
  ```
