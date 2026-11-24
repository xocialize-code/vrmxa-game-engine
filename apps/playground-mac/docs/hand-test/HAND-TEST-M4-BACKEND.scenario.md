# VRMXG Playground: which backend draws (M4 check 8, M4 W13): AppProbe scenario

Run `apps/playground-mac/scripts/build.sh`, then
`appprobe checklist scenario=apps/playground-mac/docs/hand-test/HAND-TEST-M4-BACKEND.scenario.md` (under the GPU lock). The `#renderer`
readout carries the backend in its accessible name (`Renderer WebGPU`, `Renderer WebGL`).
No query: the app's own choice, WebGPU where the page has it (M4 W3). `HAND-TEST-M4-BACKEND-webgl.scenario.md` forces WebGL.

```scenario
app: VRMXG Playground
launch: ../../build/VRMXGPlayground.app
checklist: ../HAND-TEST-M4-BACKEND.md
env: {}
fresh: false
```

- [ ] With no query the playground draws on WebGPU, and it plays.
  ```steps
  wait id=play enabled=true timeout_ms=60000
  until find("id=renderer").0.name == "Renderer WebGPU" timeout=60000
  set before = find("id=step-count").0.name
  act id=play action=press
  until find("id=play").0.name == "Pause"
  pause 1500
  expect find("id=step-count").0.name != $before   # it steps and draws
  expect find("role=statictext text=Error").count == 0
  shot "webgpu"
  ```
