# VRMXG WebXR spike

*2026-11-25. AB-T-0623, running alongside M6 (M6-PLAN "Running alongside M6"; PRD §5.17, P2). A throwaway spike:
WebXR in WKWebView on the Mac and in Safari on visionOS, MToon in stereo on WebGPU, 90 Hz presentation over the 60 Hz
step, and hands and gaze as input. Stack: three r187 (0.187.0), `@pixiv/three-vrm` 3.5.5 with the `engine/patches`
patch, the engine's packages at 49cd652. Machine: M5 Max, macOS 27.3 (26C5047e), Xcode 27.2. No headset.*

## Verdicts

**WKWebView on the Mac: no WebXR, and nothing in the shell can turn it on.**
- **No `navigator.xr`.** `navigator.xr` is undefined under the custom scheme and over loopback, and so is every WebXR
  global (`XRSystem`, `XRSession`, `XRWebGLBinding`, …).
- **No switch for it.** WebKit's own feature list, read through the preferences' private SPI (`+[WKPreferences
  _features]`, 668 features, `results/webkit-features.json`), has no WebXR feature at all on macOS. The one XR flag it
  lists, `WebXRWebGPUBindingsEnabled` ("WebGPU support for WebXR", off by default, unstable), was turned on with
  `_setEnabled:forFeature:` and changed nothing.
- **No entitlement either.** There is no public WKWebView preference or entitlement for WebXR. macOS WebKit is built
  without it, so Safari on this Mac lacks it too.
- **What it means for the shell.** It has nothing to expose. An XR build of a VRMXG game is a web build opened in a
  headset's browser, not a Mac app.
- **For comparison:** Chromium on the same Mac has the API (inline sessions work) but no immersive device:
  `isSessionSupported('immersive-vr')` is false.

**Safari on visionOS: not run (no visionOS simulator runtime, no hardware).**
- **The runtime isn't installed.** Xcode 27.2 has the visionOS 27.2 SDK and the Apple Vision Pro device types, but no
  visionOS simulator runtime (`xcrun simctl list runtimes` lists only iOS). Installing it is a download of several GB,
  asked for and not yet answered, so nothing ran there.
- **What Apple and WebKit document** (sources only, not measured here):
  - WebXR (`immersive-vr`) ships on by default since Safari 18 on visionOS 2.
  - Input is `transient-pointer`: look and pinch. The input source exists only while the pinch lasts, and its ray is
    the gaze at the pinch's start. There is no continuous gaze stream.
  - Hand tracking is a separate feature with a permission prompt.
  - Safari 26.2 on visionOS draws WebXR with WebGPU.
  - The simulator supports `transient-pointer` (a click is a pinch). Developers report that hand-tracking requests can
    fail there.
- **It would very likely work.** The engine's WebGPU XR path (three r187's `XRManager` with `XRGPUBinding` and the
  `webgpu` session feature) is the path Safari 26.2 on visionOS ships. This spike showed the parts it could, on an
  emulator: the draw through an `ArrayCamera`, the XR frame loop, and input record and replay.
- **What only hardware can tell:** the presented frame rate, the WebGPU binding in a real session, real hands and pinches.
- **Loopback reaches the simulator only.** A simulator shares the Mac's loopback, so `http://127.0.0.1:<port>` reaches
  it. A real Vision Pro can't reach the Mac's loopback and would need a secure origin (HTTPS) on the network. That is
  outside this spike (servers stay on loopback) and is the operator's call.

**MToon in stereo on WebGPU: draws correctly in both eyes, with one exception: the post stack is per frame, not per eye.**
- **The method.** The stand-in is an `ArrayCamera` of two eyes 63 mm apart, with off-axis frusta (outward wider, as a
  headset's are). three's WebGPU backend draws it per eye with camera-indexed uniforms, the same shader path its WebGPU
  XR session takes. Each eye of the stereo frame is compared, pixel for pixel, with a mono frame drawn through that eye
  alone.
- **Both eyes match.** The left eye differs from mono in 5–7 pixels by at most 2/255. The right eye differs in about
  2,500 pixels by up to 24/255, all along shadow edges.
- **Those shadow-edge pixels are three's PCF filter, not a stereo bug.** The filter rotates its samples by noise keyed
  to the framebuffer pixel (`interleavedGradientNoise(screenCoordinate)`). The right eye sits at x = W, so it gets
  different noise. Drawn alone at that same offset, it matches the stereo frame's right eye to 5–9 pixels. With
  shadows off, it matches mono to 9–13 pixels by at most 4/255. In a real XR session each eye is its own array layer
  starting at x = 0, so the noise would be the same as mono.
- **Outlines draw in both eyes.** Mira's are world-space, 0.8 mm (her two skin materials). Switched to screen space
  (`outlineWidthMode` `screenCoordinates`, 0.004), they draw in both eyes too: 3,790 and 3,778 pixels, so width under
  asymmetric projections holds per eye.
- **Shadows draw in both eyes:** 3,223 and 3,472 pixels change when the shadow maps are turned off.
- **Post per eye is exact.** Drawn once per eye, it matches mono exactly (0 pixels), even for the second eye drawn in
  the same node frame without advancing it. The render README's gotcha 1 doesn't bite here.
- **Post through the `ArrayCamera` is wrong.** About 85 % of each eye's pixels change: one vignette and one bloom
  span the double-wide frame, and the vignette darkens each eye's outer side only.
- **Every runtime agrees.** WKWebView (scheme and loopback) and Chromium give the same results within a few noise
  pixels, with no errors.
- **On an emulated session:** the same world draws through three's real `XRManager` on the `webgl-fallback` backend
  (`MToonNodeMaterial` on WebGL2), in Chromium and WKWebView, with no errors.

**90 Hz over the 60 Hz step: the simulation doesn't move, and the presentation is smooth.**
- **Hashes.** The 600 recorded steps hash the same, step by step, headless and drawn at a paced 90 Hz: interpolated,
  plain, and interpolated in stereo. That holds in Chromium, WKWebView scheme and WKWebView loopback. The final hash
  is `cecacdfa8a061e5d` everywhere.
- **Frame pattern.** Frames take 1, 1, 0 steps (600 and 300 of 900) at α 0.333, 0.667, 0.
- **Smoothness.** Interpolated, Mira moves exactly 15.556 mm every frame while she walks (coefficient of variation 0,
  no still frames), in stereo too. Plain, she moves 0, 23.3, 23.3 mm (CV 0.71, 30 of 89 frames still).
- **CPU cost.** `host.render` takes p50 0.38 ms (p95 0.54 ms) in WKWebView over loopback, mono or stereo. GPU time
  wasn't measured.
- **What "90 Hz" means here.** The display runs at 60 Hz, so this is paced frames: each frame is told 1/90 s passed.
  A presented 90 Hz on a headset is **not run, no hardware**.

**Hands and gaze: they work as recorded input, but the input service has no binding kind for them.**
- **The emulator.** IWER 2.8.0 (Meta's emulation runtime, MIT) supplies a Quest Pro profile. It grants `hand-tracking`
  and `gaze-tracking` and takes a 90 Hz target frame rate.
- **Hands become actions** through `XRHandsDevice` (`web/src/xr-input.js`), which reads thumb-tip to index-tip distance
  from the joints, so it works with or without a hand gamepad:
  - a right pinch is mouse button 0, `interact` in the default map;
  - a left pinch-drag is the left stick: 10 cm is full tilt, quantised to 1/64.
- **Gaze becomes a choice.** At the frame a right pinch starts, the page casts the gaze ray against the scene and
  hands the node it hits (`mira`) to the simulation as `input.choose('xr.target', id)`.
- **Record and replay.** 300 steps were recorded during the session (8 KB of JSON). Replayed in a fresh world with no
  XR and no devices, every step's hash matches the session's, in Chromium and in WKWebView over both origins. The
  hands moved Mira: the run's final hash isn't the idle world's.
- **The head pose stays out of the hashes.** It drives a camera rig outside the tree, presentation only. Handing three
  the tree's own Camera node (`?camera=tree`) also replayed identically.
- **Real hands, Apple's `transient-pointer` and a real user's gaze:** **not run, no hardware**. IWER's gaze is a
  persistent viewer ray; visionOS's isn't.

## Results

Raw JSON in `results/`: `probe/` (the WebXR probe), `webkit-features.json` (WebKit's feature list), `pages/` (stereo,
90 Hz and the emulated session, `wkwebview.json` and `chromium.json`, and stills: the stereo pair, the right eye's
difference from mono in red, the post stack through the `ArrayCamera`). Only some stills are committed; the pages
write all of them.

**The probe** (`index.html`; no emulator on the page):

| | `navigator.xr` | inline | immersive-vr | immersive-ar | WebXR globals |
|---|---|---|---|---|---|
| WKWebView scheme, flags as shipped | undefined | — | — | — | none |
| WKWebView loopback, flags as shipped | undefined | — | — | — | none |
| WKWebView scheme, `WebXRWebGPUBindingsEnabled` on | undefined | — | — | — | none |
| WKWebView loopback, `WebXRWebGPUBindingsEnabled` on | undefined | — | — | — | none |
| Chromium (Chrome for Testing 156), loopback | object | supported, session granted | false | false | 13, no `XRGPUBinding` |
| Safari, visionOS simulator | not run: no visionOS simulator runtime | | | | |
| Safari, Apple Vision Pro | not run: no hardware | | | | |

`requestAdapter({ xrCompatible: true })` resolves in both browsers. That proves nothing, because unknown dictionary
members are ignored. WKWebView has no `makeXRCompatible` on WebGL2.

**Stereo** (`stereo.html`, eyes 576 × 640, step 150): pixels that differ / largest channel difference out of 255.

| Runtime, case | Left eye vs mono | Right eye vs mono | Right eye alone at x = W | No shadows, L / R vs mono | Outline pixels L / R | Shadow pixels L / R | Post per eye L / R (same frame) |
|---|---|---|---|---|---|---|---|
| Chromium, world outlines | 5 / 2 | 2494 / 24 | 5 / 24 | 5 / 2, 9 / 4 | 1223 / 1240 | 3223 / 3474 | |
| Chromium, screen outlines | 5 / 2 | 2212 / 24 | 5 / 24 | 5 / 2, 9 / 1 | 3790 / 3778 | 2689 / 2978 | |
| Chromium, post (bloom, vignette) | 312679 / 66 | 313300 / 66 | 507 / 23 | — | 1658 / 1777 | 3176 / 3456 | 0 / 0, 0 / 0 |
| WKWebView loopback, world outlines | 7 / 2 | 2498 / 24 | 9 / 24 | 7 / 2, 13 / 4 | 1223 / 1239 | 3223 / 3472 | |
| WKWebView loopback, screen outlines | 7 / 2 | 2210 / 24 | 9 / 24 | 7 / 2, 12 / 1 | 3790 / 3778 | 2689 / 2979 | |
| WKWebView loopback, post | 312682 / 66 | 313301 / 66 | 507 / 23 | — | 1650 / 1768 | 3173 / 3453 | 0 / 0, 0 / 0 |

WKWebView over the scheme gives the same numbers as over loopback. The control (the left eye drawn twice) differs in 0
pixels everywhere.

**90 Hz** (`present.html`, 1280 × 720, WebGPU, 600 recorded steps at 1/90 s a frame):

| Runtime | Hashes = headless (interpolated / plain / stereo) | Final | Interpolated: mm per frame, CV | Plain: CV, still frames | `host.render` p50 / p95 ms (interpolated, plain, stereo) | Display |
|---|---|---|---|---|---|---|
| Chromium | yes / yes / yes | `cecacdfa8a061e5d` | 15.556, 0 | 0.713, 30 of 89 | 0.35 / 0.45, 0.27 / 0.32, 0.36 / 0.42 | 60 Hz |
| WKWebView scheme | yes / yes / yes | `cecacdfa8a061e5d` | 15.556, 0 | 0.713, 30 of 89 | (1 ms timer) | 58.8 Hz |
| WKWebView loopback | yes / yes / yes | `cecacdfa8a061e5d` | 15.556, 0 | 0.713, 30 of 89 | 0.38 / 0.54, 0.30 / 0.38, 0.38 / 0.50 | 60 Hz |

**The emulated session** (`xr.html`, IWER 2.8.0, Quest Pro profile, 300 steps):

| Runtime | Session | Views | Input sources | Pinches → choices | Recording | Replay, every step |
|---|---|---|---|---|---|---|
| Chromium | immersive-vr; `local-floor`, `hand-tracking`, `gaze-tracking`; rates 72–120, 90 granted | 2, ±31.5 mm, symmetric | left and right hands (25 joints, `xr-standard` gamepad), gaze | 2 → `mira`, nothing | 300 frames, 8 KB | same |
| WKWebView scheme | the same | the same | the same | 2 → `mira`, nothing | 301 frames, 8 KB | same |
| WKWebView loopback | the same | the same | the same | 2 → `mira`, nothing | 300 frames, 8 KB | same |

The session's frames come from the page's requestAnimationFrame: 60 Hz here, though 90 Hz was granted.

## What the engine would need (findings, filed as tasks)

1. **A per-view post stack** (`@vrmxg/post`, TSL). The stack runs once per frame over the whole target, so through an
   `ArrayCamera` one vignette and one bloom span both eyes. In XR it has to run per view: per layer of the XR array
   target, or once per eye. Per-eye post was measured exact. The host's split-screen layout already skips post
   (`render()`'s views branch), the same gap from the other side.
2. **An XR mode in the render host** (`@vrmxg/render`). It needs:
   - a head rig outside the tree, presentation only;
   - the XR camera handed to three;
   - a WebGPU session with the `webgpu` feature and `XRGPUBinding` where the browser has them (visionOS Safari 26.2);
   - `webgl-fallback` (node materials on WebGL2, as measured here) where it doesn't;
   - an XR frame loop in place of the page's, stepping the 60 Hz clock with interpolation at the headset's rate.
3. **XR input in `@vrmxg/input`.** It needs:
   - binding kinds for hands (`pinch`, a pinch-drag stick) and XR controllers. Their `xr-standard` gamepads aren't in
     `navigator.getGamepads()`, so `GamepadDevice` never sees them;
   - an `XRDevice` read in the XR frame callback;
   - a convention for the gaze or `transient-pointer` target: the ray resolved to a node id when the pinch starts and
     handed over as a choice, which this spike showed records and replays exactly;
   - quantised values, so recordings stay small and exact.
4. **Not engine work: the shell.** WKWebView on macOS has no WebXR to expose.

Not a bug: three's PCF shadow noise is keyed to the framebuffer pixel. It makes side-by-side viewports differ from mono
at shadow edges, but not an XR session's per-eye layers.

## Not run

- **Safari in the visionOS simulator.** No visionOS simulator runtime is installed (the download is the operator's
  call). To run it later:
  1. Install the runtime: `xcodebuild -downloadPlatform visionOS`.
  2. Boot an Apple Vision Pro simulator.
  3. Serve `web/dist` on 127.0.0.1, for example `npx vite preview --host 127.0.0.1 --port 5240` in `web/`.
  4. Open `http://127.0.0.1:5240/index.html` in its Safari for the probe, `stereo.html` and `present.html` for the
     drawing, and `xr.html` with IWER for the emulated session.
  5. A real `immersive-vr` session needs a page that starts it from a tap: not written, because nothing here could run it.
- **On an Apple Vision Pro:** the presented frame rate, WebGPU XR (`XRGPUBinding`) in a real session, hands and
  `transient-pointer` from a real user, the comfort of the PCF and post findings in a headset. **No hardware.**
- **A presented 90 Hz on any display:** this Mac's display runs at 60 Hz.
- **GPU time per eye.** Only the CPU side of `host.render` was timed.

## Run it

```bash
cd web && npm install && npm run models      # iwer 2.8.0; the harness models into public/models (git-ignored)
npx vite build                               # dist/: index (probe), stereo, present, xr
node scripts/chromium.mjs pages 'stereo.html;stereo.html?outline=screen;stereo.html?post=1;present.html;xr.html'
node scripts/chromium.mjs probe 'index.html'
cd .. && mac/scripts/build.sh                # web build + swiftc + ad hoc signed, sandboxed WebXRSpike.app
mac/scripts/run.sh probe 'index.html' both default,xr
mac/scripts/run.sh pages 'stereo.html?w=576&h=640;stereo.html?outline=screen;stereo.html?post=1;present.html;xr.html' both default
node web/scripts/table.mjs results/pages/chromium.json results/pages/wkwebview.json
node web/scripts/summary.mjs results/probe/wkwebview.json
```

Every runner takes the machine's GPU lock (`acceptance/gpu-lock.mjs`). `run.sh` launches the app with `open -W --env`
and copies its results out of the sandbox container, with the home folder scrubbed. The pages also run in a browser
from `npx vite` (127.0.0.1:5240).

Page options:
- `stereo.html`: `?w=576&h=640` (one eye), `&step=150`, `&outline=world|screen`, `&post=1`, `&backend=webgl`,
  `&pngs=0`.
- `present.html`: `?hz=90`, `&w=1280&h=720`, `&backend=`.
- `xr.html`: `?steps=300`, `&camera=tree`.

## Layout

| Path | What |
|---|---|
| `mac/Sources/` | The wrapper: spike-physics' `SchemeHandler` and `LoopbackServer` (copied), and `main.swift`, which runs every case in a fresh configuration and web view over both origins, with WebKit's XR features as shipped or turned on through the preferences SPI, and dumps WebKit's feature list |
| `web/src/probe.js` | The WebXR probe, with no engine or emulator on the page |
| `web/src/world.js` | The harness cafe (Mira on the recorded input) loading VRMs with the host's MToon class |
| `web/src/stereo.js` | The two-eye `ArrayCamera` with off-axis frusta, and the per-eye comparisons with mono |
| `web/src/present.js` | The render demo's hash and motion trace at 1/90 s, mono and stereo |
| `web/src/xr.js`, `web/src/xr-input.js` | The emulated session on `webgl-fallback`, the hands and gaze device, the recording and its replay |
| `web/scripts/` | `chromium.mjs` (runner), `models.mjs` (copies the harness models), `table.mjs` and `summary.mjs` (the tables above) |

## Caveats

- One machine, one emulator. IWER's views are symmetric and its hands are scripted poses, so they show that the APIs
  and the engine fit together, not how a headset behaves.
- The stereo stand-in draws both eyes into one target side by side. An XR session's WebGPU path draws into a two-layer
  array texture (`XRManager._initWebGPUSession`), which no runtime here could create. What matches between them is
  the per-camera shader path. The layer target itself is unmeasured.
- The harness avatar is the VRMXA fixture's untextured body. The check is the same per eye whatever the textures.
- Chromium timings are headless. WKWebView timings are over loopback in a fresh web view (AB-L-0346); over the scheme
  the timer resolves only 1 ms.
