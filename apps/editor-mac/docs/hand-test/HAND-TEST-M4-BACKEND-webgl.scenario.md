# VRMXG Editor: which backend draws (M4 check 8, M4 W13): AppProbe scenario, WebGL forced

Run `apps/editor-mac/scripts/build.sh`, then
`appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M4-BACKEND-webgl.scenario.md` (under the GPU lock). The `#renderer`
readout carries the backend in its accessible name (`Renderer WebGPU`, `Renderer WebGL`).
The query switch reaches the Mac app through `VRMXG_QUERY`: this scenario launches it with `renderer=webgl`.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M4-BACKEND.md
env: {"VRMXG_QUERY": "renderer=webgl"}
fresh: false
```

- [ ] With `renderer=webgl` in the query the editor draws on WebGL, and the scene shows.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved valid" timeout=60000
  until find("id=renderer").0.name == "Renderer WebGL" timeout=60000
  expect find("role=alert").count == 0   # no error line
  shot "webgl"
  ```
