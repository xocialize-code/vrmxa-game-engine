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
  and the room environment. Since M4 W2, particles too (three.quarks/webgpu's batch renderer, from the host), and
  readback: `frameHash()` (now a promise on both backends), stills and exports.
- **Not yet on WebGPU:** the post stack (TSL post is W1), and the speech bubbles and
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
- **The two backends' stills** (`results/playground-webgl.png`, `playground-webgpu.png`, bubbles off) differed by 0.9
  levels on average, with 1.56% of pixels off by more than 8. Most of that was MToon shadows: `MToonNodeMaterial`
  ignored the shadow in its toon shading, so shadowed skin went dark (Mira's arm) where WebGL's MToon uses the shade
  colour (AB-L-0373). Patch 5 (AB-T-0586) fixes it: the means fall to 0.48 (Chromium) and 0.51 (WKWebView), and the
  shares over 8 to 1.04% and 1.22% (from 1.73% in WKWebView). What's left is led by the espresso machine's metal and
  character edges.
- **WebKit reads a WebGPU canvas differently.** `drawImage` of a WebGPU canvas gives the last *presented* frame even
  right after `render()`, so offline frames read that way all looked the same. `toDataURL` in the drawing task gives
  the frame just drawn. Chromium gives the new frame either way (AB-L-0372).
- **WebGL in WKWebView** came out as one of two images from load to load (3 of 16 loads gave the other), which W0 didn't
  change. It's noted for W3 (AB-T-0587, blocking AB-T-0575).

## Particles and readback (M4 W2, AB-T-0574)

**`?mode=frames&renderer=webgpu|webgl`** (`src/frames.js`, `Playground.framesCheck`) checks particles and readback
on the page's backend. Each part draws offline on hosts of its own (`RenderHost.create`, `dprCap: 1`), reads every
frame back through `@vrmxg/export`'s `readbackFor` and hashes it. `&parts=` picks some of them.
- **particles:** check 13's scene (the cafe, steam, dust, sparks and 40 more steam emitters) is drawn every step on the
  host's own batch renderer, through a fixed camera onto the emitters. The world must hash as headless at every step.
  A snapshot at step 180 is restored into a fresh world on a fresh host, which must draw the same frames to step 360.
- **film:** the morning film (`sequences/cafe-morning.vrmxs`, 1,080 frames at 1080p24, with its sound and the
  espresso's steam) is exported twice through `exportTake` to a hash sink, each time on a fresh host and world. The two
  exports must agree frame for frame.
- **still:** `captureStill` is compared with the canvas's own pixels at 640×360 (`toDataURL` in the drawing task), and
  the view must follow a resize afterwards.
- **readback:** the readback's cost per frame at 1080p and 4K on a cafe frame. `exportLoop` reads frame n and takes
  n − 1, as `exportTake` does; `afterFrame` reads and takes a frame the GPU has finished.

```sh
(cd apps/playground && npx vite build)
node apps/playground/scripts/frames-chromium.mjs     # both backends, two loads each: results/frames-chromium.json
apps/playground/scripts/frames-wkwebview.sh          # WKWebView, scheme and loopback, two loads each: results/frames-wkwebview.json
```

**Result (2026-11-20, M5 Max, Chrome for Testing 156 headless on Metal, WKWebView on macOS 27.3).**
- **Particles on both backends.** WebGPU draws with `three.quarks/webgpu`'s batch renderer and WebGL with three.quarks'
  own (3 batches, 1,149 particles at step 360; `results/frames-*-particles.png`). The world hashes as headless at
  every step on both backends in Chromium and in WKWebView over both origins. The final hash is `09ef4d21b00189d1`,
  check 13's since M3's 37ca5e3 (the spike's `976e7033e22ad048` came before 37ca5e3 moved every final). All 361 frames
  are distinct, and the world restored at step 180 drew the same 181 frames on every run.
- **The film exports twice the same.** WebGPU's frames digest to `72e11057f7fe8c21` in Chromium and
  `01bbab58fabd08f7` in WKWebView, on both origins and every load; WebGL's digest to `4c2265c827597f04` and
  `696295fc68b0fa12`. The sound hashes the same in every run. WebGPU has 988 distinct frames to WebGL's 1,080 in both
  engines: WebGL's post adds grain to every frame, and WebGPU has no post until W1, so the film's still moments repeat.
- **One frame once.** On WKWebView loopback's second load, frame 10 of the first WebGPU export differed from the second
  export and from every other run. It didn't come back in 26 more WebGPU exports in WKWebView (6 × 3 loads of 24
  frames, then 4 loads of the whole film twice; `results/frames-wkwebview-repeats.json`). The cause isn't found (AB-T-0589).
- **Stills match the canvas** pixel for pixel on both backends: 230,400 of 230,400 pixels at 640×360 (a flipped still
  would differ in 160,114). The view kept drawing at its own size after the stills.
- **Readback cost** (median ms per frame; the two loads' medians where they differ; WKWebView over loopback):

  | Runtime | Backend | 1080p export loop | 1080p after frame | 4K export loop | 4K after frame |
  |---|---|---|---|---|---|
  | WKWebView | WebGPU (mapAsync, ring of 3) | 1.86 / 2.14 | 2.06 / 2.30 | 7.78 / 9.64 | 7.22 / 8.30 |
  | WKWebView | WebGL (pixel-pack buffer) | 1.98 / 3.54 | 2.32 / 3.42 | 5.76 / 10.64 | 6.02 / 10.38 |
  | Chromium | WebGPU | 0.3 | 0.5 | 0.8 / 1.3 | 1.4 |
  | Chromium | WebGL | 2.7 | 2.7 / 2.9 | 9.3 / 9.4 | 9.8 / 10.0 |

  In the film's export loop at 1080p24 the readback costs 2.81 / 2.78 ms a frame on WebGPU in WKWebView (whole frame
  8.40 / 8.12 ms) and 2.39 / 2.17 on WebGL (7.16 / 7.63). In Chromium it costs 0.54 / 0.52 on WebGPU (5.1) and 2.63 on
  WebGL (7.4). WebKit's mapAsync is still the slow part, as the spike found (2.46 / 9.68 ms there). WebGL's second load
  in WKWebView ran about 1.8 times slower than its first, so its range is wide.
- **A Chromium quirk.** A WebGPU canvas still at the browser's default 300×150 when an output target was drawn on its
  renderer stopped following resizes (`toDataURL` kept giving 300×150). This page never sizes its view canvas, so the
  still check sizes it first.

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
