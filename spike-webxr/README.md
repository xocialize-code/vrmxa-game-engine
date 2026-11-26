# VRMXG WebXR spike

*2026-11-25, visionOS simulator 2026-11-26. AB-T-0623, running alongside M6 (M6-PLAN "Running alongside M6"; PRD §5.17, P2). A throwaway spike:
WebXR in WKWebView on the Mac and in Safari on visionOS, MToon in stereo on WebGPU, 90 Hz presentation over the 60 Hz
step, and hands and gaze as input. Stack: three r187 (0.187.0), `@pixiv/three-vrm` 3.5.5 with the `engine/patches`
patch, the engine's packages at 49cd652. Machine: M5 Max, macOS 27.3 (26C5047e), Xcode 27.2 with the visionOS 27.2 simulator runtime (24N120). No headset.*

*Receipts: AB-R-1167 (WKWebView), AB-R-1168 (stereo), AB-R-1169 (90 Hz), AB-R-1170 (hands and gaze). Findings filed
as tasks AB-T-0660 (per-view post), AB-T-0661 (an XR mode in the render host), AB-T-0662 (XR input).*

## Verdicts

**WKWebView on the Mac: no WebXR, and nothing in the shell can turn it on.**
- **No `navigator.xr`.** `navigator.xr` is undefined under the custom scheme and over loopback, and so is every WebXR
  global (`XRSystem`, `XRSession`, `XRWebGLBinding`, …).
- **No switch for it.** WebKit's own feature list, read through the preferences' private SPI (`+[WKPreferences
  _features]`, 668 features, `results/webkit-features.json`), has no WebXR feature at all on macOS. The one XR flag it
  lists, `WebXRWebGPUBindingsEnabled` ("WebGPU support for WebXR", off by default, unstable), was turned on with
  `_setEnabled:forFeature:` and changed nothing.
- **No entitlement either.** There is no public WKWebView preference or entitlement for WebXR. macOS WebKit is built
  without it. Safari on this Mac should lack it too, since it uses the same system WebKit (inferred, not opened).
- **What it means for the shell.** It has nothing to expose. An XR build of a VRMXG game is a web build opened in a
  headset's browser, not a Mac app.
- **For comparison:** Chromium on the same Mac has the API (inline sessions work) but no immersive device:
  `isSessionSupported('immersive-vr')` is false.

**Safari on visionOS (simulator): WebXR is there, with `immersive-vr` and `XRGPUBinding`. The simulator has no WebGPU
adapter and its WebGL is incomplete, and a native immersive session wasn't started (nothing here can tap in a visionOS
simulator). On hardware: not run, no hardware.**
- **Setup.** The visionOS 27.2 simulator runtime (24N120) on the operator's yes, and the Apple Vision Pro simulator
  Xcode created with it. Its Safari (Version/27.2) loaded the pages from `http://127.0.0.1:5240` (`web/scripts/serve.mjs`,
  loopback only), and each page posted its result back. Raw JSON is in `results/visionos/`.
- **The probe.**
  - `navigator.xr` is there: `inline` and `immersive-vr` are supported, `immersive-ar` isn't, and an inline session is
    granted.
  - `XRGPUBinding` exists, as do `XRSystem`, `XRWebGLLayer`, `XRHand` and the rest.
  - `XRWebGLBinding` and `XRProjectionLayer` don't.
  - WebGL2's `makeXRCompatible` resolves.
  - `navigator.gpu` exists but `requestAdapter()` gives no adapter in the simulator, so nothing on WebGPU can run
    there. That leaves three r187's WebGPU XR path (the `webgpu` session feature plus `XRGPUBinding`) unexercised, and
    whether a real headset grants it unknown.
- **90 Hz on the WebGL host** (`present.html?backend=webgl`): all 600 step hashes match headless for interpolated,
  plain and stereo drawing. The final hash is `cecacdfa8a061e5d`, the same as Node, Chromium and WKWebView on the Mac:
  JavaScriptCore on visionOS replays the world bit for bit. Motion is the same: 15.556 mm per frame, CV 0. The
  simulator's display ran at 58.8 Hz.
- **Stereo on WebGL** (`stereo.html?backend=webgl`, three-vrm's WebGL `MToonMaterial`):
  - Both eyes match mono (0 and 3 pixels).
  - Outlines draw in both eyes (880 and 884 pixels).
  - **But the simulator draws no spot light and no shadows** (0 pixels change with shadow maps off). The Mac's WebGL
    draws them (421 pixels in each eye; the image has the lamp's pool). The ground and skin come out darker too. That
    is the simulator's renderer, not something to judge a device by.
- **The emulated session** (`xr.html`, IWER installed over Safari's own `navigator.xr`): it runs as on the Mac.
  - 90 Hz target granted.
  - Spot pixels per eye drawn, never black, and differing between the eyes.
  - The gaze pinch resolves `mira`.
  - The 300-step recording replays hash-exact without XR.
  - This exercises the engine and three in visionOS's JavaScriptCore and WebGL, not visionOS's own XR runtime.
- **A native immersive session: not run.** WebXR needs a user activation to start one, and nothing here can give it:
  - Xcode 27.2 on this Mac has no Simulator.app to click in;
  - `simctl` has no input commands;
  - the session's simulator tool takes only iPhone and iPad.
  
  `immersive.html` is written for it: a tap on Enter VR asks for `immersive-vr` with `webgpu`, `hand-tracking` and
  `local-floor`, draws the cafe through three's `XRManager`, and reports what was granted, the views, frame rates,
  `transient-pointer` events and hashes. Untested, since nothing could tap it; see "Not run" for how to run it by hand.
- **What the simulator can't show, whatever is run in it:**
  - the frame rate a real headset presents;
  - a real user's hands and gaze (the simulator's pinch is a click, its gaze the pointer);
  - WebGPU at all (no adapter);
  - the lighting and shadows a device draws;
  - comfort.
- **What Apple and WebKit document** (sources only):
  - WebXR (`immersive-vr`) shipped in Safari 18 on visionOS 2, drawing with WebGL
    ([WebKit Features in Safari 18.0](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/)).
  - Input is `transient-pointer`: look and pinch. The input source exists only while the pinch lasts, and its ray is
    the gaze at the pinch's start. There is no continuous gaze stream. Hand tracking is a separate feature with a
    permission prompt ([Introducing Natural Input for WebXR in Apple Vision Pro](https://webkit.org/blog/15162/introducing-natural-input-for-webxr-in-apple-vision-pro/);
    [WWDC24, Build immersive web experiences with WebXR](https://developer.apple.com/wwdc24/10066)).
  - "Now with Safari 26.2 on visionOS, WebXR supports WebGPU"
    ([WebKit Features for Safari 26.2](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/)). The
    simulator's Safari does have `XRGPUBinding`. Whether a session grants the `webgpu` feature is unverified.
  - Developers report that hand-tracking requests can fail in the simulator
    ([Apple Developer Forums](https://developer.apple.com/forums/thread/747652)).
- **Loopback reaches the simulator only.** A simulator shares the Mac's loopback. A real Vision Pro can't reach it and
  would need a secure origin (HTTPS) on the network. That is outside this spike (servers stay on loopback) and is the
  operator's call.

**MToon in stereo on WebGPU: draws correctly in both eyes, except the post stack, which is per frame, not per eye (and drawn per eye, repeats the first eye unless the node frame advances).**
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
- **Post per eye works only if the node frame advances between eyes.** The render README's gotcha 1 bites: with both
  eyes drawn in one node frame (one frame id, nothing awaited between them), the second eye's post output is the
  first eye's image, identical to mono left (0 pixels apart). Advancing the node frame before the second eye makes it
  match mono right exactly (0 pixels). Advancing also redraws the shadow maps per eye.
- **Post through the `ArrayCamera` is wrong.** About 85 % of each eye's pixels change: one vignette and one bloom
  span the double-wide frame, and the vignette darkens each eye's outer side only.
- **Every runtime agrees.** WKWebView (scheme and loopback) and Chromium give the same results within a few noise
  pixels, with no errors.
- **On an emulated session:** the same world draws through three's real `XRManager` on the `webgl-fallback` backend
  (`MToonNodeMaterial` on WebGL2), in Chromium and WKWebView, with no errors. Only spot pixels were checked: a 5 × 5
  grid per eye at three frames, never black, varied, and differing between the eyes. Correctness wasn't compared with
  mono there.

**90 Hz over the 60 Hz step: the simulation doesn't move, and the presentation is smooth.**
- **Hashes.** The 600 recorded steps hash the same, step by step, headless and drawn at a paced 90 Hz: interpolated,
  plain, and interpolated in stereo. That holds in Chromium, WKWebView scheme and WKWebView loopback. The final hash
  is `cecacdfa8a061e5d` everywhere. Node's headless run of the same 600 steps ends on it too
  (`web/scripts/node-present.mjs`, `results/pages/node.json`), and so does Safari in the visionOS simulator on the WebGL
  host.
- **Frame pattern.** Frames take 1, 1, 0 steps (600 and 300 of 900) at α 0.333, 0.667, 0.
- **Smoothness.** Interpolated, Mira moves exactly 15.556 mm every frame while she walks (coefficient of variation 0,
  no still frames), in stereo too. Plain, she moves 0, 23.3, 23.3 mm (CV 0.71, 30 of 89 frames still).
- **CPU cost.** In WKWebView over loopback, `host.render` takes p50 0.36 ms (p95 0.52 ms) interpolated and p50
  0.34 ms (p95 0.42 ms) in stereo. GPU time wasn't measured.
- **What "90 Hz" means here.** The display runs at 60 Hz, so this is paced frames: each frame is told 1/90 s passed.
  A presented 90 Hz on a headset is **not run, no hardware**.

**Hands and gaze: they work as recorded input, but the input service has no binding kind for them.**
- **The emulator.** IWER 2.8.0 (Meta's emulation runtime, MIT) supplies a Quest Pro profile. It brings in
  `webxr-layers-polyfill` 1.1.0 (Apache-2.0) and `gl-matrix` 3.4.4 (MIT); all three are in the spike's own lockfile,
  used only by `xr.html`, and never shipped. It grants `hand-tracking`
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
  the tree's own Camera node (`?camera=tree`, Chromium only, an emulated head that never moves) also replayed
  identically, so a moving head on the tree's camera is untested.
- **Real hands, Apple's `transient-pointer` and a real user's gaze:** **not run, no hardware**. IWER's gaze is a
  persistent viewer ray; visionOS's isn't.

## Results

Raw JSON in `results/`: `probe/` (the WebXR probe), `webkit-features.json` (WebKit's feature list), `pages/` (stereo,
90 Hz and the emulated session: `wkwebview.json`, `chromium.json`, `node.json`, and stills: the stereo pair, the right
eye's difference from mono in red, the post stack through the `ArrayCamera`), `visionos/` (each page's report from
Safari in the visionOS simulator, and its WebGL stereo pair). Only some stills are committed; the pages write all of
them.

**The probe** (`index.html`; no emulator on the page):

| | `navigator.xr` | inline | immersive-vr | immersive-ar | WebXR globals |
|---|---|---|---|---|---|
| WKWebView scheme, flags as shipped | undefined | — | — | — | none |
| WKWebView loopback, flags as shipped | undefined | — | — | — | none |
| WKWebView scheme, `WebXRWebGPUBindingsEnabled` on | undefined | — | — | — | none |
| WKWebView loopback, `WebXRWebGPUBindingsEnabled` on | undefined | — | — | — | none |
| Chromium (Chrome for Testing 156), loopback | object | supported, session granted | false | false | 13, no `XRGPUBinding` |
| Safari 27.2, visionOS 27.2 simulator, loopback | object | supported, session granted | true | false | 11, with `XRGPUBinding`; no `XRWebGLBinding`, `XRProjectionLayer` |
| Safari, Apple Vision Pro | not run: no hardware | | | | |

`requestAdapter({ xrCompatible: true })` resolves in every browser here. That proves nothing, because unknown
dictionary members are ignored. WKWebView has no `makeXRCompatible` on WebGL2; Safari on visionOS does, and it
resolves. In the visionOS simulator `requestAdapter()` returns no adapter: no WebGPU there.

**Stereo** (`stereo.html`, eyes 576 × 640, step 150): pixels that differ / largest channel difference out of 255.

| Runtime, case | Left eye vs mono | Right eye vs mono | Right eye alone at x = W | No shadows, L / R vs mono | Outline pixels L / R | Shadow pixels L / R | Post, one node frame: L vs mono L, R vs mono R |
|---|---|---|---|---|---|---|---|
| Chromium, world outlines | 5 / 2 | 2494 / 24 | 5 / 24 | 5 / 2, 9 / 4 | 1223 / 1240 | 3223 / 3474 | |
| Chromium, screen outlines | 5 / 2 | 2212 / 24 | 5 / 24 | 5 / 2, 9 / 1 | 3790 / 3778 | 2689 / 2978 | |
| Chromium, post (bloom, vignette) | 312679 / 66 | 313300 / 66 | 507 / 23 | — | 1658 / 1777 | 3176 / 3456 | 0 / 0, 88739 / 212 (= mono L) |
| WKWebView loopback, world outlines | 7 / 2 | 2498 / 24 | 9 / 24 | 7 / 2, 13 / 4 | 1223 / 1239 | 3223 / 3472 | |
| WKWebView loopback, screen outlines | 7 / 2 | 2210 / 24 | 9 / 24 | 7 / 2, 12 / 1 | 3790 / 3778 | 2689 / 2979 | |
| WKWebView loopback, post | 312682 / 66 | 313301 / 66 | 507 / 23 | — | 1650 / 1768 | 3173 / 3453 | 0 / 0, 88739 / 212 (= mono L) |
| Chromium, WebGL host (`MToonMaterial`) | 0 / 0 | 2485 / 9 | 0 / 0 | 0 / 0, 2190 / 9 | 1255 / 1244 | 421 / 421 | |
| WKWebView loopback, WebGL host | 0 / 0 | 2485 / 9 | 0 / 0 | 0 / 0, 2190 / 9 | 1256 / 1244 | 422 / 421 | |
| Safari, visionOS simulator, WebGL host | 0 / 0 | 3 / 2 | 0 / 0 | 0 / 0, 3 / 2 | 880 / 884 | **0 / 0** (no spot light or shadows drawn) | |

WKWebView over the scheme gives the same numbers as over loopback. The control (the left eye drawn twice) differs in 0
pixels everywhere. In the post rows, the right eye drawn in the same node frame as the left (frame ids 40, 40 in
Chromium; 35, 35 in WKWebView loopback) is the left eye's image (0 pixels from mono left). Advancing the node frame
before it (ids 43, 44) makes it match mono right in 0 pixels, in all three runtimes. Every WebGPU row drew 22 of 22
MToon materials as `MToonNodeMaterial` (`mtoonNodeMaterials` in the JSON); the WebGL rows drew `MToonMaterial`. On WebGL
the right eye's shadow-edge pixels have the same cause (alone at x = W it matches in 0 pixels).

**90 Hz** (`present.html`, 1280 × 720, WebGPU, 600 recorded steps at 1/90 s a frame):

| Runtime | Hashes = headless (interpolated / plain / stereo) | Final | Interpolated: mm per frame, CV | Plain: CV, still frames | `host.render` p50 / p95 ms (interpolated, plain, stereo) | Display |
|---|---|---|---|---|---|---|
| Chromium | yes / yes / yes | `cecacdfa8a061e5d` | 15.556, 0 | 0.713, 30 of 89 | 0.345 / 0.445, 0.27 / 0.305, 0.355 / 0.41 | 60 Hz |
| WKWebView scheme | yes / yes / yes | `cecacdfa8a061e5d` | 15.556, 0 | 0.713, 30 of 89 | (1 ms timer) | 58.8 Hz |
| WKWebView loopback | yes / yes / yes | `cecacdfa8a061e5d` | 15.556, 0 | 0.713, 30 of 89 | 0.36 / 0.52, 0.26 / 0.32, 0.34 / 0.42 | 60 Hz |
| Safari, visionOS simulator (WebGL host; no WebGPU adapter) | yes / yes / yes | `cecacdfa8a061e5d` | 15.556, 0 | 0.713, 30 of 89 | (1 ms timer) | 58.8 Hz |
| Node 26, headless only | — | `cecacdfa8a061e5d` | | | | |

**The emulated session** (`xr.html`, IWER 2.8.0, Quest Pro profile, 300 steps):

| Runtime | Session | Views | Input sources | Pinches → choices | Recording | Replay, every step |
|---|---|---|---|---|---|---|
| Chromium | immersive-vr; `local-floor`, `hand-tracking`, `gaze-tracking`; rates 72–120, 90 granted | 2, ±31.5 mm, symmetric | left and right hands (25 joints, `xr-standard` gamepad), gaze | 2 → `mira`, nothing | 300 frames, 8 KB | same |
| WKWebView scheme | the same | the same | the same | 2 → `mira`, nothing | 300 frames, 8 KB | same |
| WKWebView loopback | the same | the same | the same | 2 → `mira`, nothing | 300 frames, 8 KB | same |
| Safari, visionOS simulator (IWER over Safari's own `navigator.xr`) | the same | 2, ±31.5 mm, symmetric | the same | 2 → `mira`, nothing | 300 frames, 8 KB | same |

The session's frames come from the page's requestAnimationFrame: 60 Hz here, though 90 Hz was granted. Pixels read
from the session's framebuffer (5 × 5 per eye at frames 60, 150 and 240) are never black or clear in either eye, and the
eyes differ at frames 60 and 150 (at 240 the grid lands on sky and floor in both).

## What the engine would need (findings, filed as tasks)

1. **A per-view post stack** (`@vrmxg/post`, TSL; AB-T-0660). The stack runs once per frame over the whole target, so through an
   `ArrayCamera` one vignette and one bloom span both eyes. In XR it has to run per view: per layer of the XR array
   target, or once per eye. Once per eye needs the node frame advanced between eyes, or the second eye repeats the
   first eye's passes (gotcha 1, measured); with it, per-eye post was exact. The host's split-screen layout already
   skips post (`render()`'s views branch), the same gap from the other side.
2. **An XR mode in the render host** (`@vrmxg/render`; AB-T-0661). It needs:
   - a head rig outside the tree, presentation only;
   - the XR camera handed to three;
   - a WebGPU session with the `webgpu` feature and `XRGPUBinding` where the browser has them (Safari 26.2 on visionOS
     says WebXR supports WebGPU; whether it is this binding is unverified);
   - `webgl-fallback` (node materials on WebGL2; ran without errors in the emulated session) where it doesn't;
   - an XR frame loop in place of the page's, stepping the 60 Hz clock with interpolation at the headset's rate.
3. **XR input in `@vrmxg/input`** (AB-T-0662). It needs:
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

- **A native immersive session in the visionOS simulator.** It needs a tap, which nothing here could give: there is
  no Simulator.app in this Xcode 27.2, `simctl` has no input commands, and the session's simulator tool takes only
  iPhone and iPad. By hand:
  1. Start the server: `node web/scripts/serve.mjs visionos` (under the GPU lock).
  2. Open the page in the simulator: `xcrun simctl openurl <device> 'http://127.0.0.1:5240/immersive.html?report=immersive'`.
  3. Tap Enter VR in the simulator's window. The page reports to `results/visionos/immersive.json` after 10 s.
  
  It would show whether Safari grants the `webgpu` feature (it won't draw on WebGPU there anyway: no adapter), the
  views and frame rates the simulator gives, and its `transient-pointer` events.
- **On an Apple Vision Pro:** the presented frame rate, WebGPU XR (`XRGPUBinding`) in a real session, a device's
  lighting and shadows, hands and `transient-pointer` from a real user, the comfort of the PCF and post findings in a
  headset. **No hardware.**
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
node web/scripts/node-present.mjs            # the 90 Hz page's headless leg in Node
# Safari in the visionOS simulator (runtime: xcodebuild -downloadPlatform visionOS), loopback only, under the GPU lock:
node ../acceptance/gpu-lock.mjs run --who spike-webxr-visionos -- node web/scripts/serve.mjs visionos &
xcrun simctl openurl <device> 'http://127.0.0.1:5240/index.html?report=probe'      # and present.html?backend=webgl&report=…,
                                                 # stereo.html?backend=webgl&report=…, xr.html?report=…
```

Every runner takes the machine's GPU lock (`acceptance/gpu-lock.mjs`). `run.sh` launches the app with `open -W --env`
and copies its results out of the sandbox container, with the home folder scrubbed. The pages also run in a browser
from `npx vite` (127.0.0.1:5240).

Page options:
- `stereo.html`: `?w=576&h=640` (one eye), `&step=150`, `&outline=world|screen`, `&post=1`, `&backend=webgl`,
  `&pngs=0`.
- `present.html`: `?hz=90`, `&w=1280&h=720`, `&backend=`.
- `xr.html`: `?steps=300`, `&camera=tree`.
- `immersive.html`: `?seconds=10`, `&backend=webgl-fallback`, `&webgpu=0`.
- Any page: `&report=<name>` posts its result to `serve.mjs`.

## Layout

| Path | What |
|---|---|
| `mac/Sources/` | The wrapper: spike-physics' `SchemeHandler` and `LoopbackServer` (copied), and `main.swift`, which runs every case in a fresh configuration and web view over both origins, with WebKit's XR features as shipped or turned on through the preferences SPI, and dumps WebKit's feature list |
| `web/src/probe.js` | The WebXR probe, with no engine or emulator on the page |
| `web/src/world.js` | The harness cafe (Mira on the recorded input) loading VRMs with the host's MToon class |
| `web/src/stereo.js` | The two-eye `ArrayCamera` with off-axis frusta, and the per-eye comparisons with mono |
| `web/src/present.js` | The render demo's hash and motion trace at 1/90 s, mono and stereo |
| `web/src/xr.js`, `web/src/xr-input.js`, `web/src/xr-pixels.js` | The emulated session on `webgl-fallback`, the hands and gaze device, the recording and its replay, spot pixels from the session's layer |
| `web/src/immersive.js` | A native immersive session from a tap (for Safari on visionOS; untested, see "Not run") |
| `web/scripts/` | `chromium.mjs` (runner), `serve.mjs` (loopback server that collects page reports), `node-present.mjs` (the Node leg), `models.mjs` (copies the harness models), `table.mjs` and `summary.mjs` (the tables above) |

## Caveats

- One machine, one emulator. IWER's views are symmetric and its hands are scripted poses, so they show that the APIs
  and the engine fit together, not how a headset behaves.
- The stereo stand-in draws both eyes into one target side by side. An XR session's WebGPU path draws into a two-layer
  array texture (`XRManager._initWebGPUSession`), which no runtime here could create. What matches between them is
  the per-camera shader path. The layer target itself is unmeasured.
- The harness avatar is the VRMXA fixture's untextured body. The check is the same per eye whatever the textures.
- Chromium timings are headless. WKWebView timings are over loopback in a fresh web view (AB-L-0346); over the scheme
  the timer resolves only 1 ms.
