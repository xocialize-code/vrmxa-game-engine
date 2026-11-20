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
| Backend choice (`backend.js`) | `webgl` (the default until W3), `webgpu` (throws where the page has no WebGPU: a forced backend never quietly becomes the other), `auto` (WebGPU where `navigator.gpu` gives an adapter, else WebGL). `backendFromQuery` reads `?renderer=`. three/webgpu is imported only for WebGPU, in its own chunk |
| `RenderHost.create` | Resolves the backend; for WebGPU it warms the page up, creates and `await init()`s the view's `WebGPURenderer`, and loads the patched `MToonNodeMaterial` (`host.mtoonMaterial`; null on WebGL, so the loader keeps `MToonMaterial`). `host.backend` says which. The constructor still takes a renderer, and refuses a `WebGPURenderer` that hasn't been initialised |
| Room environment | `roomEnvironment()` makes the PMREM with three/webgpu's `PMREMGenerator` on WebGPU (it used to return null without WebGL) |
| Drawing-buffer size | `drawingBufferSize()`: WebGL reads its context as before; WebGPU has none, so `getDrawingBufferSize()`. The post stack and the lens are sized from it |
| Node frame (gotcha 1) | `frameAt` calls `advanceNodeFrame()` before it draws: r187 updates a RenderPipeline's passes and the shadow maps once per `nodeFrame.frameId`, and only the renderer's own rAF loop advances it, so an export that never yields would draw every frame over the first one's passes. It's the private `renderer._nodes.nodeFrame`; the host throws if a three upgrade moves it |
| Warm-up renderer (gotcha 6) | `warmUpWebGPU()`: one throwaway `WebGPURenderer`, initialised with a room PMREM, created once per page before any other. The page's first `WebGPURenderer` compiles some materials differently, so its frames differ from later renderers' by ±1 in a few pixels. It's kept, not disposed, as the spike measured it |
| The three-vrm patch | `scripts/patch-three-vrm.mjs` applies `engine/patches/three-vrm-3.5.5-nodes-r187.patch` to `@pixiv/three-vrm`'s `lib/nodes` on install (AB-T-0553's six lines, AB-D-0274). `--check` runs in CI and fails unless the installed file is exactly the stock 3.5.5 file or exactly that file patched |

**Not in W0:** TSL post (W1: on WebGPU the host runs without post), particles and readback (W2), both backends in the
acceptance and the default flip (W3). The playground's speech bubbles (troika) are WebGL-only for now.

**Tests** (`test/webgpu.test.mjs`, Node, a stand-in three/webgpu): the query switch and backend choice; gotcha 6, the
warm-up comes first and once, before the view's and every later renderer, and WebGL never touches WebGPU; gotcha 1,
`frameAt` advances the node frame once per offline frame and live frames leave it to three's loop; a canary that reads
three r187 itself (the version, `renderer._nodes`, the rAF-only advance) so a three bump fails here first; the PMREM;
the drawing-buffer size on both backends; the patch applied (MToonNodeMaterial loads on r187, six patched lines) and
the patcher's exact-hunk applier.

**In browsers** (`apps/playground`, `?renderer=webgpu`): `scripts/backends-chromium.mjs` and `backends-wkwebview.sh`
draw the cafe with Mira offline on both backends (results in `apps/playground/results/`).

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
