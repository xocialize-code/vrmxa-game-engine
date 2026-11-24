# Which backend draws in the editor's Mac app (M4 check 8, M4 W13)

M4's exit check 8 ([M4-PLAN.md](../../../M4-PLAN.md)): the editor picks WebGPU where the page has it, and a query
switch forces either backend. In the Mac app the switch is `VRMXG_QUERY=renderer=webgl|webgpu|auto`. AppProbe runs one
row per launch: `hand-test/HAND-TEST-M4-BACKEND.scenario.md` (no query) and
`hand-test/HAND-TEST-M4-BACKEND-webgl.scenario.md` (WebGL forced). The fall-back to WebGL on a page without WebGPU can't
be shown in WKWebView on this Mac (it has WebGPU); `acceptance/m4/backend-switch.mjs` shows it in Chromium with
`navigator.gpu` hidden.

- [x] With no query the editor draws on WebGPU, and the scene shows.
- [x] With `renderer=webgl` in the query the editor draws on WebGL, and the scene shows.

## Results

Both rows passed on 2026-11-24 at 14:12 UTC (M4's acceptance, AB-T-0585), each in its own launch under the GPU lock:
the readout read `Renderer WebGPU` with no query and `Renderer WebGL` with `VRMXG_QUERY=renderer=webgl`. Reports:
`acceptance/results/m4-acceptance/hand-tests/editor-m4-backend.md` and `editor-m4-backend-webgl.md`.

| Row | Step | What happened |
|---|---|---|
| 1, 2 | the first `wait` | The first try, six hours earlier, didn't run: the Mac's screen had locked, and AppProbe can't read a window behind the lock (the app launches, its window has no frame). Run again once the operator had unlocked it |
