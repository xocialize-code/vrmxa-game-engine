# @vrmxg/render

M0 W5 (AB-T-0506). The render host: a three.js WebGL renderer set up for MToon, presentation interpolated at the clock's
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

Tests (`npm test`, no models, so they run on CI): hashes headless / interpolated / plain over 600 recorded steps at a
120 Hz frame rate; the walker moves 2.5 cm every frame interpolated, 0 / 5 cm without; the blend never stays in an object
and fires no change callback; lights, shadow presets, frozen maps and the Environment follow nodes and prop edits; a wire
per collider with the door triggers as sensors and the spring-arm ray; attaching another tree rebuilds views and wires.

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
