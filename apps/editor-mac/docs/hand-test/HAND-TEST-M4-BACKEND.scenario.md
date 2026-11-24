# VRMXG Editor: which backend draws (M4 check 8, M4 W13): AppProbe scenario

Run `apps/editor-mac/scripts/build.sh`, then
`appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M4-BACKEND.scenario.md` (under the GPU lock). The `#renderer`
readout carries the backend in its accessible name (`Renderer WebGPU`, `Renderer WebGL`).
No query: the app's own choice, WebGPU where the page has it (M4 W3). `HAND-TEST-M4-BACKEND-webgl.scenario.md` forces WebGL.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M4-BACKEND.md
env: {}
fresh: false
```

- [ ] With no query the editor draws on WebGPU, and the scene shows.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved valid" timeout=60000
  until find("id=renderer").0.name == "Renderer WebGPU" timeout=60000
  expect find("role=alert").count == 0   # no error line
  shot "webgpu"
  ```
