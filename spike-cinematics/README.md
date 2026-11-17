# spike-cinematics

A one-page compatibility check for `research/cinematics.md` §3–4: does an anime post stack run on
three r187 + three-vrm 3.5.5 MToon, how do MToon's own outlines meet a screen-space outline, and
what do extra views cost.

```
cd web && npm install && npm run dev          # http://127.0.0.1:5245/?pipe=pmndrs
node scripts/shots.mjs                        # headless Chromium (Playwright's cached build, ANGLE Metal) → shots/, results/shots.json
```

**WKWebView pass (AB-T-0499, receipt AB-R-0929).** `mac/` is the sandboxed wrapper from `spike-physics/mac`
with a harness that runs every case through the custom scheme and through loopback, in a fresh
`WKWebView` per case, and saves `window.__result`, console errors and warnings, and the canvas:

```
mac/scripts/build.sh                          # vite build + swiftc → mac/build/CinematicsSpike.app
mac/build/CinematicsSpike.app/Contents/MacOS/CinematicsSpike
#   SPIKE_CASES='pipe=pmndrs;pipe=none'  SPIKE_ORIGINS=scheme|loopback|both
#   output: ~/Library/Containers/com.xocialize.vrmxg-cinematics-spike/Data/tmp/
#   (copied here to web/results/wkwebview-shots.json and web/shots/wkwebview/)
```

Result: 36 runs, no errors, warnings or timeouts; frames match Chromium (SSIM 0.99997 with shadows
matched); costs match. A fresh web view per case matters: one that has loaded the scheme keeps the
1 ms timer after navigating to loopback.

Query params: `pipe=none|builtin|three|pmndrs|views|monitor`, `edges=1` (depth+normal outline),
`mtoonOutline=0|1|<width m>`, `fx=dof,bloom,vig,ca,grain,lut` (switch off), `speed=1` (speed
lines), `n=` views, `shadowOnce=1`, `shadows=0`, `w`, `h`, `frames`.

Models are copied from `spike-physics/web/public/models` by `npm run dev` and are git-ignored,
as are `shots/` and `results/`, and `mac/build/`. Findings are in `../research/cinematics.md` §3.4 and §4.
