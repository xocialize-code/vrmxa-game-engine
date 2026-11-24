# Which backend draws in the editor's Mac app (M4 check 8, M4 W13)

M4's exit check 8 ([M4-PLAN.md](../../../M4-PLAN.md)): the editor picks WebGPU where the page has it, and a query
switch forces either backend. In the Mac app the switch is `VRMXG_QUERY=renderer=webgl|webgpu|auto`. AppProbe runs one
row per launch: `hand-test/HAND-TEST-M4-BACKEND.scenario.md` (no query) and
`hand-test/HAND-TEST-M4-BACKEND-webgl.scenario.md` (WebGL forced). The fall-back to WebGL on a page without WebGPU can't
be shown in WKWebView on this Mac (it has WebGPU); `acceptance/m4/backend-switch.mjs` shows it in Chromium with
`navigator.gpu` hidden.

- [ ] With no query the editor draws on WebGPU, and the scene shows.
- [ ] With `renderer=webgl` in the query the editor draws on WebGL, and the scene shows.

## Results

| Row | Step | What happened |
|---|---|---|
| 1, 2 | the first `wait` | Not run on 2026-11-24 (M4's acceptance): the Mac's screen had locked, and AppProbe can't read a window behind the lock (the app launches, its window has no frame). The readout shows WebGPU in the screenshots of the scenarios run before the lock (`acceptance/results/m4-acceptance/hand-tests/`) |
