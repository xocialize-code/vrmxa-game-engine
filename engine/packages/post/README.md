# @vrmxg/post

M2 W3 (AB-T-0526). The post stack and the anime look, as scene data: an `Environment` node's `post` is a preset name or
a list of effects, and the render host draws through it. Behind a thin adapter over
[pmndrs postprocessing](https://github.com/pmndrs/postprocessing) 6.39.6 (Zlib; three peer < 0.188), so the engine's
own code never names a pmndrs class (`research/cinematics.md` §1.3).

```js
import { PostStack, renderViews, gridLayout } from '@vrmxg/post';
const host = new RenderHost({ canvas, post: (renderer) => new PostStack(renderer, { loadLut }) });
// in a scene: { "id": "env", "type": "Environment", "props": { "post": "anime" } }
//         or: "post": [{ "effect": "bloom", "intensity": 1.2 }, { "effect": "anime", "speedLines": 0.8 }]
host.post.setParams({ 'anime.speedLines': 0.9 }); // values change without rebuilding passes (a sequence's post track does this)
```

| Piece | What |
|---|---|
| Effects | `edges` (depth + normal edges on sets and props; characters masked on layer 2, they keep MToon's outline), `dof` (auto from the current Camera's physical lens: focal length, f-stop, focus distance, CoC 0.025 mm), `bloom`, `grade`, `lut` (a project `.cube`), `toneMapping`, `vignette`, `grain` (its pattern from the frame's presentation time: deterministic in exports), `anime` (speed lines, focus lines, impact frames), `chromaticAberration`, `smaa` |
| Presets | `anime` (edges, DOF, bloom, grade, tone mapping, vignette, grain, the anime overlays, chromatic aberration) and `clean` (bloom, tone mapping) |
| Order | Fixed, whatever the list's order: RenderPass → NormalPass → edges → DOF → one merged pass (bloom, grade, LUT, tone mapping, vignette, grain, anime) → chromatic aberration → SMAA. A change of *which* effects rebuilds the passes; a change of values (`setParams`, a new Environment value) only updates uniforms |
| Lengths | In pixels at 1080p, scaled by the output's height, so a 4K export looks like the 1080p preview (edge thickness clamps to ≥ 1 px) |
| Tone mapping | While the stack runs it does the tone mapping itself and the renderer's own is off |
| Views | `renderViews(renderer, scene, views)` draws several cameras into scissored viewports of one canvas; `gridLayout(n)` lays out n of them |

Presentation only: nothing here touches the simulation, and the post stack changes no world hash.

Measured (acceptance check 11, results in `acceptance/results/`; M5 Max): SSIM between a 4K frame scaled to 1080p and the
1080p frame 0.986 with the anime preset without grain (0.951 with grain, which is per pixel by design; 0.998 with no
post); the anime stack costs 1.4 / 1.6 ms at 1080p / 4K in Chromium against 0.4 / 0.5 ms without post (WKWebView over
loopback 1.4 / 3.1 against 0.3 / 1.0); four viewports 0.9–1.4 ms. The SSIM is measured with debug draw off.

Tests (`npm test`): spec normalisation (presets, defaults, order, unknown effects refused), structure keys, and the
layout of viewports. The rendered checks run in the browsers (`acceptance/`).
