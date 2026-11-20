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

## Renderer (M4 W0, AB-T-0572)

**`?renderer=webgpu`** draws the playground with three's `WebGPURenderer` (`?renderer=auto`: WebGPU where the page has
it, else WebGL). Without the switch it stays on WebGL until M4 W3 flips the default; `?mode=acceptance` stays on WebGL
until W3 runs it on both. The Renderer readout says which backend drew. The host is made asynchronously, so the controls
that need the world stay disabled until it and the scene are there; a forced `?renderer=webgpu` where WebGPU fails shows
the error and leaves them disabled (`backends-chromium.mjs` checks that too).
- **On WebGPU** the cafe and its characters render (Mira and Hana with the patched `MToonNodeMaterial`), with shadows
  and the room environment.
- **Not yet on WebGPU:** the post stack (TSL post is W1), readback and `frameHash` (W2), and the speech bubbles and
  name tags (troika's shaders are WebGL's; the captions still show every line; the two checkboxes are disabled).
- **`?mode=backends&renderer=…`** draws the cafe offline as an export does, and reads each frame with `toDataURL` in the
  task that drew it (`Playground.backendCheck`). It replays the recorded walk, draws five consecutive frames with
  `frameAt` and a still, hashes them, and sets `window.__result`.

```sh
(cd apps/playground && npx vite build)
node apps/playground/scripts/backends-chromium.mjs    # both backends, twice each; the stills compared: results/backends-chromium.json
apps/playground/scripts/backends-wkwebview.sh         # the same in WKWebView, scheme and loopback: results/backends-wkwebview.json
```

**Result (AB-R-1055, 2026-11-20, M5 Max, Chrome for Testing 156 headless on Metal, WKWebView on macOS 27.3).**
- **WebGPU runs on its WebGPU backend everywhere,** with Mira on `MToonNodeMaterial`. Five consecutive offline frames
  give five distinct images, and every frame repeats exactly on a second load. In WKWebView the scheme and loopback
  origins give the same frames.
- **The two backends' stills** (`results/playground-webgl.png`, `playground-webgpu.png`, bubbles off) differ by 0.9
  levels on average; 1.6% of pixels differ by more than 8. Most of that is one MToon difference the six-line patch
  doesn't cover: `MToonNodeMaterial` ignores the shadow in its toon shading. three r187 multiplies the shadow into the
  light colour, so shadowed skin goes dark (Mira's arm) where WebGL's MToon shades it with the shade colour (AB-L-0373; fix or
  tolerate: AB-T-0586).
- **WebKit reads a WebGPU canvas differently.** `drawImage` of a WebGPU canvas gives the last *presented* frame even
  right after `render()`, so offline frames read that way all looked the same. `toDataURL` in the drawing task gives
  the frame just drawn. Chromium gives the new frame either way (AB-L-0372).
- **WebGL in WKWebView** came out as one of two images from load to load (3 of 16 loads gave the other), which W0 didn't
  change. It's noted for W3 (AB-T-0587, blocking AB-T-0575).

## Dialogue (M3 W6, AB-T-0545)

Talking to a character, as screen overlays over the canvas. They are presentation: they read the world and write
nothing, and the step is the same with them on or off.
- **`?director=demo`** (a scripted model) or **`?director=http://127.0.0.1:5191/v1/chat/completions&model=omni4`**
  (the loopback stand-in) puts a director on the character you talk to: `?talkTo=hana-1`, recast with
  `?preset=host`.
- **The chat:** type a line, or pick one of her replies (her app persona's `replies` in `personas.json`). Keys typed
  into the chat box never reach the game's input.
- **Speech bubbles, drawn in the canvas** (`@vrmxg/text`, troika): each line shows over the speaker's head, word by
  word, with punctuation; while the director waits for the model it shows "…".
  - A speaker out of view gets none; the caption says the line.
  - A screen-reader copy of the bubbles stays in the page, visually hidden.
  - **Names** toggles name tags over the characters.
- **Captions** at the bottom, as before. They now keep the line's punctuation. Both have toggles in the status bar.
- **`?take=takes/conversation.json`** replays a recorded conversation (its cast, input and ai log) with no model.

Checked in headless Chromium by `acceptance/m3/dialogue-chromium.mjs` (`acceptance/results/m3-dialogue-*.png`):
- the typed line, the "…" bubble, her reply with its caption, and a picked reply that sets her order goal;
- the take replayed with the bubbles and captions read every step hashes the same as with both off.

The text spike (AB-T-0536) chose troika for in-world text. Subtitles burned into exports, and title cards, are still to
do.
