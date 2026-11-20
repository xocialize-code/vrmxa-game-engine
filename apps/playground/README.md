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
- **Post on WebGPU (M4 W1):** the host makes the backend's own post stack (`post: { loadCube }`): pmndrs on WebGL,
  `TSLPostStack` on WebGPU. The **Post** picker in the status bar (`#post-look`) switches the look on either backend:
  the scene's own, none, or a preset (`anime`, `clean`). It's presentation only.
- **Not yet on WebGPU:** the speech bubbles and
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

## Post on WebGPU (M4 W1, AB-T-0573)

**`?mode=post&renderer=webgpu|webgl`** (`src/post-check.js`) checks the post stack on that backend the way an export
draws: `frameAt` with no yield to rAF, each frame read with `toDataURL` in the task that drew it. The check owns the
canvas (`Playground.offline`: the paused frame loop and the resize observer stay out of it) at 1920×1080.
- **The looks** (`LOOKS`): none, `clean`, `anime`, and the anime preset without grain, with the sample's LUT
  (`looks/morning.cube`), with its overlays keyed on (speed and focus lines) and with a close-up's shallow focus. Each is
  drawn on step 420 of the recorded walk from a pipeline built for it there and then. That first frame must equal the
  next draw of the same frame and must not be flat (gotcha 4).
- **Two exports** of five consecutive frames with the anime preset, each from a fresh load. The first builds its
  pipeline at frame 0 and the second takes it from the cache. They must be byte-identical, five distinct frames each.
- **The cost** of a frame without post and with the anime preset (median of 20, GPU work included: `gl.finish()` on
  WebGL, `onSubmittedWorkDone()` on WebGPU, which adds its own round trip).

```sh
(cd apps/playground && npx vite build)
node apps/playground/scripts/post-chromium.mjs     # both backends, two loads each; looks compared: results/post-chromium.json
apps/playground/scripts/post-wkwebview.sh          # WKWebView, scheme and loopback, two loads each: results/post-wkwebview.json
node apps/playground/scripts/post-compare.mjs a.png b.png   # SSIM and pixel differences of any two stills
```

The full-size stills go to `results/post/` (git-ignored). `results/post-preview-{webgl,webgpu}-{animeNoGrain,animeShallow}.png`
are 960-px previews from Chromium. The results are in `@vrmxg/post`'s README ("TSL on WebGPU").

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
- **readback:** a 640×360 still, then the readback's cost per frame at 1080p, 4K and 1366×768 (rows padded in the copy)
  on the same host, each size checked for content. `exportLoop` reads frame n and takes n − 1, as `exportTake` does;
  `afterFrame` reads and takes a frame the GPU has finished.
- **reuse:** a 640×360 still, then 24 film frames at 1080p on the same host, against a fresh host's: equal, with content.
- **alpha:** a red quad at opacity 0.5 over nothing; its middle pixel as read back, and after `toImageRGBA`.
- **filmRepeat** (not in the default parts, for AB-T-0589): `&frames=1080&repeat=3&audio=1&tiles=1` exports the film
  three times per page and returns any frame that differs, with the tiles that differ and its images.

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
- **The film exports twice the same.** Before W1's merge (no post on WebGPU): WebGPU's frames digest to
  `72e11057f7fe8c21` in Chromium and `01bbab58fabd08f7` in WKWebView, WebGL's to `4c2265c827597f04` and
  `696295fc68b0fa12`. With W1 merged, WebGPU exports carry TSL post (the film's anime look with grain): `af463f8e404b4e2b`
  in Chromium and `aa30672928beb2b1` in WKWebView, on both origins, and every frame distinct (1,080, as on WebGL, where
  grain also makes every frame distinct). The sound hashes the same in every run.
- **One frame, now and then, with sound.** In WKWebView a WebGPU export sometimes has one or two frames that differ from
  the page's other exports, by 1 level in a couple of pixels. It happened in the first and the second full run (frames 10
  and 153). Hunting it, with sound recording, 4 of 18 exports had one (frames 140–142, 747, 1032), against 0 of 18 with
  sound off (`results/frames-wkwebview-repeats.json`). The world hash is the same at those frames, so it's presentation.
  The kept pair differs near the espresso machine's edge. With W1's TSL post in the exports, Chromium shows it too: a
  hunt found single frames off in 5 of 9 exports, always one pixel by 1 level in the middle tile, though the full runner
  then passed on both loads. On the merged tree WKWebView had one more (frame 4). The cause isn't found (AB-T-0589).
- **Stills match the canvas** pixel for pixel on both backends: 230,400 of 230,400 pixels at 640×360 (a flipped still
  would differ in 160,114). The view kept drawing at its own size after the stills.
- **Every size reads back** on both backends after a 640×360 still on the same renderer: 1080p, 4K and 1366×768 all
  have content. The first version of the WebGPU readback made a second output target for the second size, and in three
  r187 a second output target on a renderer never receives an output draw: every 4K WebGPU read was zeros (PR #7
  review). Now one target per renderer is resized for each size, and a probe checks each new or resized target. An
  export after a still on the same host matches a fresh host's frames.
- **Alpha is premultiplied on both backends:** the half-transparent red reads back `[127, 0, 0, 128]` on WebGPU and
  WebGL, in Chromium and WKWebView, and `toImageRGBA` gives `[253, 0, 0, 128]`.
- **Readback cost** (median ms per frame; the two loads' medians; WKWebView over loopback; after the fix, before W1's
  merge: the readback copies the same bytes with or without post):

  | Runtime | Backend | 1080p export loop | 1080p after frame | 4K export loop | 4K after frame | 1366×768 export loop |
  |---|---|---|---|---|---|---|
  | WKWebView | WebGPU (mapAsync, ring of 3) | 1.88 / 1.94 | 2.04 / 2.00 | 8.66 / 8.80 | 7.72 / 7.92 | 1.36 / 1.26 |
  | WKWebView | WebGL (pixel-pack buffer) | 1.78 / 3.22 | 3.34 / 3.00 | 6.14 / 7.22 | 5.92 / 5.78 | 1.44 / 1.68 |
  | Chromium | WebGPU | 0.2 / 0.5 | 0.5 | 1.6 / 1.4 | 1.4 | 0.3 / 0.2 |
  | Chromium | WebGL | 2.5 / 2.8 | 2.8 / 3.1 | 8.6 / 9.6 | 10.4 / 9.9 | 1.4 / 1.6 |

  In the film's export loop at 1080p24 the readback costs 2.76 / 2.85 ms a frame on WebGPU in WKWebView (whole frame
  8.13 / 8.62 ms) and 2.09 / 2.27 on WebGL (7.64 / 7.27). In Chromium it costs 0.54 / 0.55 on WebGPU (5.2) and
  2.51 / 2.73 on WebGL (6.9 / 7.8). WebKit's mapAsync is the slow part, as the spike found (2.46 / 9.68 ms there).
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
