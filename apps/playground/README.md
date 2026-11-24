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
it, else WebGL). **Since M4 W3 that is the default** (AB-T-0575, M4 check 8): without the switch the playground draws
with WebGPU where the page has it; `?renderer=webgl` forces WebGL. Every check mode, `?mode=acceptance` included, runs on
either backend (`acceptance/matrix.mjs` runs them all on both). The Renderer readout says which backend drew. The host is made asynchronously, so the controls
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
  `frameAt` and a still, hashes them, and sets `window.__result`. On WebGL it also hashes each frame through
  `gl.readPixels`, as exports do (`glFrames`, `glStill`). The check owns the canvas at 1280×720, pixel ratio 1
  (`Playground.offline`, since AB-T-0587), and fails if the drawing buffer changes size during it. On WebGL,
  `stillMsWithRead` now includes the `gl.readPixels` read as well as `toDataURL`, so it can't be compared with
  timings from before AB-T-0587.

```sh
(cd apps/playground && npx vite build)
node apps/playground/scripts/backends-chromium.mjs    # both backends, twice each; the stills compared: results/backends-chromium.json
LOADS=16 apps/playground/scripts/backends-wkwebview.sh  # the same in WKWebView, 16 fresh loads per backend and origin: results/backends-wkwebview.json
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
- **WebGL in WKWebView** came out as one of two images from load to load (3 of 16 loads gave the other). AB-T-0587
  settled it below: the check, not the engine.

**WebGL's second image in WKWebView (AB-T-0587, 2026-11-22, M5 Max, macOS 27.3).** Raw data:
`results/backends-wkwebview-ab-t-0587.json`.
- **The read wasn't the cause.** In the odd loads, `gl.readPixels` straight after the draw differed too, and agreed
  with `toDataURL` on which image it was. No paused-loop draw landed during the check.
- **The simulation is identical.** Recorded per drawn frame, the world hash matches between the two images at steps
  300 to 304 and 420. The camera's pose matches too.
- **The view size wasn't.** The check drew at whatever size the canvas had. Usually the page's layout had settled at
  1280×485 (a46febe0). Sometimes, mostly over the scheme origin (7 of 40 loads there, 0 of 40 over loopback in one
  run; W0 saw 3 of 16 on both), the check started while the canvas's box was still 1280×561.43 mid-layout. The
  drawing buffer rounded to 1280×561, the lens refit to that box's aspect (fov 20.62° instead of 17.87°), and the
  layout's ResizeObserver brought it to 485 only after the frames: d60fac47 (`results/ab-t-0587-old-*.png`). Pinning
  the old check to 1280×561 gives a third hash (4f0d6881): the fractional box's aspect differs from the whole pixels'
  (`results/ab-t-0587-d60fac47-vs-whole-561.png`). With the canvas's CSS height changing every 7 ms during the load,
  the old check gives four distinct image sets in 16 loads.
- **Fixed in the check:** it owns the canvas (`offline`: no resize from the layout, no paused-loop draws) at
  1280×720, pixel ratio 1. **WebGL in WKWebView now repeats exactly:** 106 fresh loads per origin, every one
  028f66d0, by `toDataURL` and by `gl.readPixels` (04a7ce64b0d04506). All of them draw the frames the same way. The 16
  in `backends-wkwebview.sh` ran the check as committed in 89c3759. The review fixes after it change only what happens
  once the frames are read (restoring the page's size even when the canvas has no box), and haven't had a browser run.
  The other 90 ran working versions that differ only in what they recorded or what they did after the frames:
  - **32 loads:** an earlier version that didn't restore the pixel ratio and size afterwards.
  - **50 loads:** with uncommitted hooks that recorded the buffer, camera and world hash for every frame drawn.
  - **8 loads:** with an uncommitted hook that changed the canvas's CSS height every 7 ms. WebGPU repeats too (e380a3a2, 16 loads per origin), and Chromium repeats on
  both. At 1280×720 the two backends' stills differ by 0.49 levels on average, with 1.03% of pixels over 8, in both
  engines.
- **Not before W0:** the check came with W0. M3's acceptance never hashed the page canvas's pixels across loads. Any
  check that does must own the canvas, as `?mode=post` and now `?mode=backends` do; the exports' own hosts
  (`?mode=frames`) are sized already.

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
  three times per page and returns any frame that differs, with the tiles that differ and its images. With
  `&keepTile=72` it keeps that tile of every frame of the first export (about 62 MB a whole film), so a differing frame
  lists its exact pixels there and comes with both tiles at 4×. It records the node-frame ids and the view's draws
  between frames (`timing`), each export's room PMREM hash, and wall-clock bounds (for the runners' GPU-load samples).
  `&pres=1` hashes what the CPU hands the GPU right after each draw (the camera's matrices, every visible mesh's world
  matrix, the uploaded bone matrices), and throws if any frame went unhashed; `&wgsl=1` records every shader module per export and lists
  any the first export didn't compile; `&jitter=N`, `&lag=N` and `&serial=1` vary the timing between offline frames.
- **sameFrame** (AB-T-0589): `&frames=72&repeat=20000` draws the film's frame 72 again and again on one host, with
  nothing stepped or changed between draws, and counts the distinct images (and tile 72's). Switches: `noShadows`,
  `noPost`, `noMsaa` (the post's scene pass at 1 sample), `noAA` (no MSAA anywhere), `hide=<node>`,
  `frontSide=<node>`, `split=<node>` (a double-sided node as two culled draws).

AB-T-0589's runners: `scripts/repeat-chromium.mjs` (`--loads N --name X [--part sameFrame] [--renderer webgl]
'query'`) and `scripts/repeat-wkwebview.sh loads name 'query' [origins]`, which runs the harness as an app and bundle id of
its own per run name, so two runs at once can't delete each other's app or overwrite each other's results. Both record
what else used the GPU during each load (`gpuLoad`, from `scripts/gpu-load.mjs`: the GPU's utilisation, and the WebKit,
Chromium, python, MLX and harness processes). Both write `results/<name>.json` and put images and load logs in
`results/repeat/` (git-ignored); AB-T-0589's runs are in `results/ab-t-0589/`.

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
- **One frame, now and then: the GPU, under another process's load (AB-T-0589).** A WebGPU export sometimes had one
  frame that differed from the page's other exports, in a few pixels by 1–10 levels.
  - **What was hashed, and what wasn't.** In an odd export, at the odd frame and over the whole film, the camera's
    matrices, every visible mesh's world matrix and the uploaded bone matrices hash the same as in the others (`pres=1`,
    both engines). The normalised shader modules (`wgsl=1`) and the room PMREM are the same too. Not hashed:
    - morph-target influences, and material uniforms (colours, MToon parameters, UV-animation offsets)
    - light uniforms and the shadow cameras' matrices
    - the particles' instance buffers, the post stack's uniforms, and texture uploads
    - the contents of earlier passes' targets, and three's node-frame time (no node in the scene or the post stack reads it)

    `normWGSL` renames `nodeUniform*` / `nodeVar*` and the `@binding` numbers, so a change in binding layout alone
    wouldn't show. "The engine's inputs are equal" holds for what was hashed.
  - **Where.** 11 of the 13 odd frames on the normal build differed only in tile 72 at 1080p (the espresso machine's
    top right). Frame 1059 (`burner4`) differed in tile 70, and frame 848 (`burner5`) in tiles 24, 25 and 40; those two
    have no pixel detail (`keepTile` was 72), so how big their difference was isn't known.
  - **When.** It shows while another process loads the GPU. With WKWebView exporting alongside Chromium, 6 of 210
    WKWebView exports and 7 of 47 Chromium exports had one. A second Chromium as the load (18 whole-film exports), jitter
    of 0–30 ms between frames, or `lag=2` (9 shorter exports each) didn't bring it on. **Quiet:** 0 in 102 whole-film WKWebView
    exports with sound (`quiet100-wkwebview.json`: the GPU at a median 8–13% per load, max 23%, and no Chromium, python
    or MLX process seen), 0 in 120 with the earlier 18. If quiet ran at the loaded rate, seeing none would have about a
    3% chance, so quiet is rarer; but the 95% upper bound is still ~2.5% per export, and quiet repro 5 and native Metal
    show it isn't zero (about 1 MSAA draw in 60,000).
  - **sameFrame.** Drawing one frame 20,000 times on one host with nothing changed gives a second image 1–6 times under
    that load, and never in WebGL (0 in 40,000).
    - These each left it there: shadows off, post off, the scene pass's MSAA off, declaring positions `@invariant`,
      dropping the machine's 153 coincident triangles.
    - **No MSAA anywhere doesn't make it exact either** (`sameframe-noaa-noAA`: the renderer, the post scene pass and
      the readback target all at 1 sample): 1 odd draw in 20,000, plus 3 in a run that was overwritten.
    - Hiding the machine, or drawing it single-sided, gave 0 in 40,000 once, but 4 in 20,000 single-sided once the
      coincident triangles went: the sensitive pixels move with the geometry.
  - **Raw WebGPU, no three.js** (`spike-webgpu-render/repros/5-machine-under-load.html`, the machine's mesh from frame
    72's camera) reproduces the MSAA case, measured in both engines.
    - Chromium: 4 of 120,000 MSAA draws with WKWebView exporting alongside, all the first-draw image; 12 of 60,000 with
      two native Metal copies running.
    - WKWebView: 7 of 60,000 with the two native Metal copies running.
    - At 1 sample: 0 of 240,000 in all.
  - **Native Metal** (`spike-webgpu-render/repros/metal/machine.swift`, no WebGPU) gives the byte-identical odd MSAA
    image. With two copies at once it reproduces at 1 sample too (9 of 80,000).
  - **So** the MSAA case is below the engine, three and both browsers: Metal or the GPU on macOS 27.3 beta. The no-MSAA
    odd draws in three's scene are **not explained**. Repro 5's WebGPU path never showed one at 1 sample, while native
    Metal and three's scene did, so the same driver behaviour is likely but not shown.
  - **Decision AB-D-0278:** report it to Apple; no export mitigation for now; run the exact-frames checks with nothing
    else on the GPU; re-test on each beta (the repros README has the command). If it outlives the betas, W10's delivery
    export could take a verified readback (each frame drawn twice and compared, a third time when they differ).
    `results/ab-t-0589/` has the runs.
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

## The game UI demo (M5 W3, AB-T-0618)

`game-ui.html` (http://localhost:5181/game-ui.html) is `@vrmxg/game-ui`'s overlay over a small game, without the game
app (W1) and without models: Hana takes the order in a conversation with three choices, a ball to push to the table
(collider wires), a 20 s clock, then an ending whose goodbye depends on the order (`engine/packages/game-ui/test/fixtures`).
It is a page of its own, so this page and its checks don't move, and it imports engine packages only, so it builds
without vrmxa-avatar-studio. Speech bubbles and name tags are `@vrmxg/text`'s, on the WebGL host. Escape (or a
gamepad's Menu) opens a settings panel of the demo's own with the package's volume and rebinding controls; settings are
kept in this browser's localStorage, the store the demo supplies.

`node apps/playground/scripts/game-ui-check.mjs` builds only that page and drives it in headless Chromium: the HUD's
goal, score and clock, and the line, as text a screen reader says; Enter held from Continue picking no choice; focus on the first choice when Hana asks; an arrow and Enter answer (the choice reaches the game
as a recorded input); the gamepad's Menu, d-pad and A in the settings (an emulated standard pad); a slider turned down;
the keys answering with focus on the canvas; a gamepad capture of B inside the menu (it rebinds and doesn't close the menu; a slot clicked twice leaves one capture); Move right rebound to A (warned that A is Move left, then moved on confirm, Right arrow kept); a mouse click working while Space is held from the canvas; a key rebound, used by the next steps, and still there after a reload; the line's live region mounted before and after the conversation; every control named. 27 checks, all passing in
Chrome for Testing 156 (2026-11-24), no console errors. It draws, so it takes the GPU lock.
