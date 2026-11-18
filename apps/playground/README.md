# VRMXG playground

M0 W8 (AB-T-0509). A test harness for the runtime, not an editor: open a scene from `content/sample`, play, pause,
step, change the time scale, switch cameras and presets, toggle debug draw and interpolation, read the frame time.

```sh
npm run dev -w @vrmxg/playground          # http://localhost:5181 (or the "playground" preview config)
(cd apps/playground && npx vite build)     # dist/, which the Mac wrapper bundles
node apps/playground/scripts/chromium-check.mjs   # the built app in headless Chromium: loads, plays, no console errors
```

WASD or arrows move, Shift runs, Space jumps, C cycles the camera preset, the mouse turns the camera; a gamepad works
too. "Replay demo walk" plays `content/sample/input/walk-in.json`.

- **Engine objects stay out of Vue.** `src/engine.js` holds the tree, the render host and the frame loop in a plain
  class; `App.vue` keeps copies of what the controls show and refreshes them a few times a second.
- **Readouts carry their value in their accessible names** (`Frame time 16.7 ms · 60 fps`, `Step 431`), and the controls
  have ids (`#play`, `#step`, `#replay`), so AppProbe drives it in the Mac wrapper
  (`apps/playground-mac/docs/hand-test/`).
- **vrmxa-core is read in place** from `../vrmxa-avatar-studio` (AB-D-0249), and its pinned sql.js is loaded the way
  the avatar studio does (`src/sqljs.js`), only when a bundle has a database. Without the studio beside this repository
  the playground doesn't build.

**Result (AB-R-0945, 2026-11-17).** Headless Chromium 156: the cafe loads, Play runs 166 steps in 3 s, simulation
0.32 ms per step, render 0.86 ms, no console errors or warnings. The in-app browser ran at 120 fps.
