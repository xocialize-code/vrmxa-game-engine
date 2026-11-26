# @vrmxg/render

M0 W5 (AB-T-0506). The render host: a three.js WebGL renderer (and since M4 W0 a WebGPU one: see "WebGPU" below) set up for MToon, presentation interpolated at the clock's
α without touching simulated state, Environment and light nodes with shadow presets and frozen shadow maps, and debug
draw. Presentation only: outside the determinism boundary.

```js
import { RenderHost } from '@vrmxg/render';
const host = new RenderHost({ canvas }).attach(tree);  // the tree runs exactly as it would headless
host.resize(innerWidth, innerHeight);
host.debug.set({ colliders: true, sensors: true, capsules: true, rays: true });
let last;
requestAnimationFrame(function tick(t) { if (last) host.frame((t - last) / 1000); last = t; requestAnimationFrame(tick); });
```

| Piece | What |
|---|---|
| `RenderHost` | `WebGLRenderer` with sRGB output, Neutral tone mapping, device pixel ratio capped at 2, PCF shadows. `frame(elapsed)` runs the steps the clock owes, the nodes' presentation hooks (`tree.present`), and one render at α from the current camera. `interpolate = false` draws the last step as simulated. `attach` / `detach` a tree at any time. Offline (M1 W8 export): `await frameAt(step, α)` runs the tree up to `step` (waiting out held steps) and draws the blend live play would have shown; `frameToStep(n, fps)` (core) gives frame n's step and α |
| Interpolation | Around the last step of a frame it copies every transform under the tree (nodes, VRM bones, cameras) and every morph weight; at render time it writes the blend at α (lerp, slerp through `dmath`), draws, then writes the simulated values back and re-derives world matrices. Quaternions go through their private fields, so no change callback fires (VRM's look-at proxy turns quaternion writes into look-at yaw and pitch, which is simulated). A node that moves more than 1 m in one step snaps |
| `Environment` node | Background (colour, gradient sky, the environment map, transparent), image-based lighting (a neutral room), ambient, fog (linear, exponential), tone mapping (Neutral, AgX, ACES, none) and exposure, an optional shadow-receiving ground. Defaults apply when a scene has none |
| Light nodes | `DirectionalLight` (along the node's -Z; the shadow box is centred on the node, `shadowExtent` half-wide), `PointLight`, `SpotLight` (cone half-angle, penumbra). `shadowPreset` low / medium / high / ultra (map 512 to 4096, matching bias); `shadowUpdate: "once"` freezes the map for static sets, re-rendered when the light moves or its props change. Characters and models cast and receive shadows |
| Debug draw | A wire per physics collider from Rapier's own shape, placed at its pose: solid colliders by body type, sensors (triggers) yellow, character capsules cyan; raycasts since the last step (green to a hit, red when they miss: the camera's spring arm, picks, queries), through a record-only tap on the physics world |

**Hashes don't move.** Simulation state is the same headless, rendered with interpolation and rendered without, per step:
`test/render.test.mjs` (Node, a stand-in renderer that updates the scene graph as WebGLRenderer does) and `demo/` (real
WebGL with characters and textures, in Chromium and WKWebView).

**Offline frames** (`frameAt(step, alpha)`, used by exports and scrubs): the host updates its views and awaits the post
stack's `settle()` before it draws, so a frame never depends on how long the page yielded (M2 W12). After the tree is
restored without stepping (a scrub's first frame), the interpolator drops the pair it captured before the restore and
draws the step as it is.

**A film's frame 0** (AB-T-0595). Frame 0 maps to step 0 at α 0, and at step 0 nothing has run: characters stand in
their bind pose, the output camera is where the set left it, and a sequence's look, first camera and shot overrides
aren't applied yet (tracks apply in the step). So `frameAt` draws step 1 as simulated for any blend that would reach
back to step 0 (α < 1 on step 0 or 1), and `render` does the same on step 1. That is frame 0 at every rate, and the
frames after it inside the first step at 48 fps and up. `last.alpha` is then 1. The simulation doesn't change: only
which moment those frames show. α = 1 still draws a step as simulated, step 0 included (`test/first-frame.test.mjs`).

Tests (`npm test`, no models, so they run on CI): hashes headless / interpolated / plain over 600 recorded steps at a
120 Hz frame rate; the walker moves 2.5 cm every frame interpolated, 0 / 5 cm without; the blend never stays in an object
and fires no change callback; lights, shadow presets, frozen maps and the Environment follow nodes and prop edits; a wire
per collider with the door triggers as sensors and the spring-arm ray; attaching another tree rebuilds views and wires.

## WebGPU (M4 W0, AB-T-0572)

WebGPU is M4's default renderer and WebGL its tested fallback (AB-D-0271). Until M4 W3 flips the default, apps stay on
WebGL and ask for WebGPU through a query switch.

```js
import { RenderHost, backendFromQuery, warmUpWebGPU } from '@vrmxg/render';
warmUpWebGPU();                                               // at app start (optional: create() does it too)
const host = await RenderHost.create({ canvas, backend: backendFromQuery(location.search) }); // ?renderer=webgpu|webgl|auto
const lib = installCharacters(tree, { ...opts, mtoonMaterial: host.mtoonMaterial });          // MToonNodeMaterial on WebGPU
```

| Piece | What |
|---|---|
| Backend choice (`backend.js`) | `webgl` (`RenderHost.create`'s own default), `webgpu` (throws where the page has no WebGPU: a forced backend never quietly becomes the other), `auto` (WebGPU where `navigator.gpu` gives an adapter, else WebGL). `backendFromQuery` reads `?renderer=`; without it, `auto`: the playground's and the editor's default since M4 W3 (AB-T-0575). three/webgpu is imported only for WebGPU, in its own chunk |
| `RenderHost.create` | Resolves the backend; for WebGPU it warms the page up, creates and `await init()`s the view's `WebGPURenderer`, and loads the patched `MToonNodeMaterial` (`host.mtoonMaterial`; null on WebGL, so the loader keeps `MToonMaterial`). `host.backend` says which. three's `WebGPURenderer` falls back to its WebGL2 backend inside `init()` when WebGPU fails there (`requestDevice` after `requestAdapter` succeeded): the host checks `renderer.backend.isWebGPUBackend` (the warm-up's first, before the view's canvas is touched), and then a forced `webgpu` throws while `auto` makes a WebGL host. A failed three/webgpu load or warm-up isn't cached: the next `create` tries again |
| Post (M4 W1) | `create({ post: { loadCube } })` makes the backend's own stack once the renderer exists: @vrmxg/post's `PostStack` (pmndrs) on WebGL, `TSLPostStack` on WebGPU (`makePostStack`; the TSL module loads only on WebGPU). Since AB-A-0335 @vrmxg/post itself loads only then (a dynamic import): a host made without `post` never loads pmndrs postprocessing. Split screen's `renderViews` comes from `@vrmxg/post/views`, which imports three only. `loadCube` returns a project `.cube`'s text. `setPost(stack)` installs or replaces one (its lens source, its size, the Environment's `post` on the next frame). A factory in `post` works as before |
| The constructor | Still takes a renderer. A `WebGPURenderer` must come initialised, on its WebGPU backend, with `webgpu` (three/webgpu, for the PMREM) and `mtoonMaterial`; anything less throws rather than half-work |
| Room environment | `roomEnvironment()` makes the PMREM with three/webgpu's `PMREMGenerator` on WebGPU (it used to return null without WebGL) |
| Drawing-buffer size | `drawingBufferSize()`: WebGL reads its context as before; WebGPU has none, so `getDrawingBufferSize()`. The post stack and the lens are sized from it |
| Node frame (gotcha 1) | `frameAt` calls `advanceNodeFrame()` before it draws: r187 updates a RenderPipeline's passes and the shadow maps once per `nodeFrame.frameId`, and only the renderer's own rAF loop advances it, so an export that never yields would draw every frame over the first one's passes. It's the private `renderer._nodes.nodeFrame`; the host throws if a three upgrade moves it |
| Particles (M4 W2) | `host.particleRenderer`: the three.quarks `BatchedRenderer` class for this renderer, three.quarks' own on WebGL, @vrmxg/particles/webgpu's (over `three.quarks/webgpu`'s) on WebGPU and on `webgl-fallback`. `attach(tree)` hands the host to every service with an `attachHost(host)`: the particles service takes its batch renderer from it. The tree keeps the host as `tree.renderHost` (cleared on detach), for a service installed later. A stand-in draws none (null). **Loaded on demand** (AB-A-0335): `particleRenderer` is `undefined` until `host.loadParticleRenderer(particleRenderers)` loads it, with @vrmxg/particles' `particleRenderers` (the host never imports three.quarks, so an app without particles neither loads nor ships it). The particles service does that on attach and holds the tree's steps until the batch is in (core's `holds` / `settle`); `frameAt`, `captureStill` and `RenderHost.replace` wait for it (`host.ready()`), so no offline frame is drawn with emitters and no batch. An app whose worlds have particles (everything built through the playground's `buildWorld`: the playground, the editor and creator, the game app) awaits `loadParticleRenderer` when it makes a host, before any world attaches, so attaching never holds a step and the first frame has its batch. `RenderHost.replace` carries a loaded class to a host of the same kind; `exportTake` and `exportTurntable` wait for `ready()` too |
| Warm-up renderer (gotcha 6) | `warmUpWebGPU()`: one throwaway `WebGPURenderer`, initialised with a room PMREM, created once per page before any other. The page's first `WebGPURenderer` compiles some materials differently, so its frames differ from later renderers' by ±1 in a few pixels. It's kept, not disposed, as the spike measured it |
| The three-vrm patch | `scripts/patch-three-vrm.mjs` applies `engine/patches/three-vrm-3.5.5-nodes-r187.patch` to `@pixiv/three-vrm`'s `lib/nodes/index.module.js` on install (AB-T-0553's six lines plus patch 5's twelve, AB-T-0586: the light's shadow goes into MToon's toon shading, not its light colour, so shadowed MToon takes the shade colour as on WebGL; AB-D-0274), and replaces the CommonJS `index.cjs` (stock, which loads on r187 and draws wrong) with a stub that throws. `--check` fails unless each file is exactly stock 3.5.5 or exactly patched; CI adds `--require-patched`, which also fails a stock file, so it proves the install patched |

### What an app without post or particles loads (AB-A-0335)

`size/main.js` is the smallest app on the host (`RenderHost.create`, `mtoonMaterial`, `captureStill`, as the avatar
studio's Quick Look viewer uses them); `node engine/packages/render/size/size.mjs` builds it with Vite and reports what
loads at start (the entry and its static imports) and what the build ships (every chunk). Before: 1,106,788 bytes at start
(312,392 gzipped), with pmndrs postprocessing (243 KB rendered), quarks.core (145 KB) and three.quarks (57 KB of its 83 KB) in it;
1,941,701 bytes shipped. After: 776,396 at start (197,383 gzipped), none of the three; 1,800,783 shipped (three.quarks is
gone from the build; @vrmxg/post's chunks, 205 KB with pmndrs, ship but never load without `post`). Both runs are in
`acceptance/results/m6-render-size.json`.

### Warming a model's pipelines up (AB-A-0335)

```js
await host.warmUp(model);          // before the model is shown (or warmUp() for everything the tree draws)
scene.add(model);                  // its first frame meets compiled pipelines
```

WebKit compiles a WebGPU pipeline the first time a draw needs it, and a draw waits. In a fresh WKWebView (loopback, its
Metal cache cleared) the sample cafe with Mira and Hana took 8.7 s to its first frame; the studio measured 10–12 s for its
models, 0.13–0.18 s cached. `warmUp(object, { camera, draw })` does two things:
1. `renderer.compileAsync` through the host's own copy of the view camera (its world transform and projection; compileAsync
   frustum-culls) with every layer enabled; on WebGL through the post stack, for the composer's input buffer. r187's compileAsync skips what the
   camera's layers exclude, as `render` does, so "put it on a hidden layer and compile" compiles nothing on WebGPU. A model
   not in the host's scene yet compiles with the scene's lights and environment.
2. On WebGPU, one draw nobody sees, into a throwaway target made like three's framebuffer target (or through the post
   stack, whose last pass draws into it), through the view's camera with every layer on for that one synchronous draw, the
   model in the scene for it. That compiles what compileAsync doesn't: the shadow maps' materials, the post stack's
   passes, pipelines that differ only by draw state. Lights' pending shadow updates are left as they were and the node frame
   advances, so the next frame draws its own shadow maps and passes. Then it waits for the GPU. WebGL takes step 1 only (a draw into a target there compiles programs without the canvas's tone mapping).

It resolves with `{ ms, compileMs, drawMs }`; a stand-in, lost or disposed host returns `{ skipped: true }`. Measured:
`acceptance/m6/warmup-wkwebview.sh` (the playground's `?mode=warmup`), receipt AB-R-1189: in cold WKWebView the
first WebGPU frame through the post stack goes from 13.0 s to 137 ms (10.0 s of warm-up), without post from 8.7 s to 1.7 s
(5.6 s; the rest is AB-T-0665), WebGL with post from 6.6 s to 3.8 s (pmndrs' own passes still compile on the first frame).

### Tone mapping and `toneMapped: false` on WebGPU

r187's `WebGPURenderer` draws a frame with tone mapping (or an sRGB output) into its framebuffer target and tone-maps the
whole target on its way to the canvas (`Renderer.needsFrameBufferTarget`), so a material's `toneMapped: false` does
nothing there: anything drawn into the canvas after the frame, or in it, is tone-mapped with it. The host's debug draw
lives in `host.scene` and is tone-mapped on WebGPU (its colours read a little darker than on WebGL; they are diagnostics).
The editor's viewport aids are drawn through its composite pass on WebGPU (`apps/editor/src/viewport/composite.js`), so they
keep their colours (`acceptance/m6/aids-tonemap.mjs`). r187's WebGPURenderer also doesn't draw `LineLoop` (use a closed
`Line`) and ignores `material.clippingPlanes` (use a `ClippingGroup` or a `maskNode`): lint refuses both in engine and app
sources.

**Not in W0:** TSL post (W1, now in: the row above), particles and readback (W2, now in: above and `@vrmxg/export`'s
`GPUReadback`), both backends in the acceptance and the default flip (W3). The playground's speech bubbles (troika) are
WebGL-only for now.

**Tests** (`test/webgpu.test.mjs`, Node, a stand-in three/webgpu): the query switch and backend choice; gotcha 6, the
warm-up comes first and once, before the view's and every later renderer, and WebGL never touches WebGPU; gotcha 1,
`frameAt` advances the node frame once per offline frame and live frames leave it to three's loop; a canary that reads
three r187 itself (the version, `renderer._nodes`, the rAF-only advance) so a three bump fails here first; the PMREM;
the drawing-buffer size on both backends; the patch applied (MToonNodeMaterial loads on r187, all five fixes); patch 5 with a shadowed light, a non-receiving object and a custom shadow pass;
the patcher's exact-hunk applier; and (W1) `create` with post options on both backends and `setPost`.

**In browsers** (`apps/playground`, `?renderer=webgpu`): `scripts/backends-chromium.mjs` and `backends-wkwebview.sh`
draw the cafe with Mira offline on both backends (results in `apps/playground/results/`, receipt AB-R-1055).

## A lost GPU device (M6 W6, AB-T-0639)

WebKit kills its GPU process when a Metal command buffer fails, and every renderer in the page loses its device (the
game app stopped with "createCommandEncoder: Unable to make command encoder", 425 s into a ten-minute run under another
process's GPU load). The host now:

- **notices**: `GPUDevice.lost` for any reason (three ignores `destroyed`, which its own dispose causes; the host only
  ignores it while it is disposing), three's `onDeviceLost` (kept: it still logs), `webglcontextlost` on a WebGL
  canvas, and the first draw that throws for it (WebKit throws from `createCommandEncoder` before `lost` resolves).
  Another error from a draw is thrown as before.
- **stops and says so, once**: `host.lost` (`{ api, reason, message }`) is set, `render()` draws nothing more, and
  `host.onLost(lost)` is called. A draw that throws can't leave the interpolated pose in the simulated transforms:
  `render()` puts them back in a `finally` (before, a throwing draw left the blend in the world it had drawn).
- **is made again**: `await RenderHost.replace(old, { canvas, backends })` makes a host with the old one's options,
  post stack and MToon kind on the first backend that works (`RenderHost.recoveryOrder`: WebGPU again, then
  `'webgl-fallback'`, a WebGPURenderer on three's WebGL2 backend, which draws the node materials a WebGPU world was
  built with; a WebGL host is made again on WebGL), and moves the tree, the camera override, the split-screen layout,
  interpolation and the overlays over. The old renderer is disposed (errors from a dead device ignored). It throws,
  naming each backend's failure, when none can be made, and keeps what it carried on the old host for another try.
  `host.replaced` says what it came from.
- **says a loss that came early**: `onLost` set on a host that is already lost (its device went while `replace` was
  still making it) is called at once, so an app that sets it after `replace` resolves never misses one.
- **never touches the simulation**: the tree isn't stepped or changed, so the next frame draws the world from the step
  it is on and the hashes are those of an unbroken run.

A canvas that had a WebGPU context can't give a WebGL one, so the game app replaces its canvas; the editor and the
creator keep theirs (their controls listen on it) and try their own backend again only: WebGPU on WebGPU, and on WebGL
once the browser restores the lost context (`webglcontextrestored`, waited for up to 15 s; a context the browser never
restores leaves the view lost, and the editor says to save and reopen the window). Tests:
`test/device-loss.test.mjs` (a stand-in WebGPU: each way of noticing, the pose put back after a failing draw, replace
on WebGPU and on the fallback with every step hashing as an unbroken run's, nothing able to draw). In browsers:
`acceptance/m6/device-loss.mjs` (Chromium) and `device-loss-wkwebview.sh`, through the game app.

## The demo (`demo/`)

The W6 harness's cafe (Mira on the recorded input, Hana wandering, the doors) with an Environment, a spot lamp and an
overview camera, textures decoded.

```sh
cd engine/packages/snapshot/harness && node make-assets.mjs    # the assets the demo shares
cd ../../render/demo && npx vite build
node chromium.mjs [--debug] [--headed]       # results/chromium*.json and .png
./wkwebview.sh                               # results/wkwebview.json and canvas .pngs, scheme and loopback
# dist/index.html?mode=live in a browser: play it (WASD, Shift, Space, C, mouse; F1 debug draw)
```

**Result (AB-R-0942, 2026-11-17, M5 Max).** In headless Chromium, WKWebView over the scheme and over loopback: the 600
recorded steps hash identically headless, rendered with interpolation and rendered without (and the same in both
browsers, `92927c8d46b5274f`). At a 120 Hz frame rate, Mira's rendered position moves 11.67 mm every frame while she
walks; without interpolation it alternates 0 and 23.3 mm. Debug draw shows all 12 colliders: 7 solid, the 3 door triggers,
2 character capsules, and the spring-arm ray. No console errors or warnings anywhere. `host.render()` costs 1.25 ms of CPU
in WKWebView (1.03 ms without interpolation), 68 draw calls.

The attached display runs at 60 Hz, so the 120 Hz case is paced frames rather than a 120 Hz screen; live play there takes
one step per frame. Check it on a ProMotion display when one is at hand.
