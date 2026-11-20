# @vrmxg/post

M2 W3 (AB-T-0526). The post stack and the anime look, as scene data: an `Environment` node's `post` is a preset name or
a list of effects, and the render host draws through it. Behind a thin adapter over
[pmndrs postprocessing](https://github.com/pmndrs/postprocessing) 6.39.6 (Zlib; three peer < 0.188), so the engine's
own code never names a pmndrs class (`research/cinematics.md` §1.3). On WebGPU the same spec runs as a TSL
`RenderPipeline` (M4 W1: "TSL on WebGPU" below).

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

**Offline frames wait for the grade** (M2 W12). A LUT loads asynchronously. `configure` keeps each load in
`loading`, and `await stack.settle()` resolves when none is left (a load that fails sets the LUT to none and warns).
`RenderHost.frameAt` awaits it before drawing, so an export or a scrub never draws a frame before its grade arrives.
Without it the editor's hash-only export, which never yields, came out ungraded, while a Mac export picked the grade up
from its second frame.

## TSL on WebGPU (M4 W1, AB-T-0573)

`TSLPostStack` (`@vrmxg/post/tsl`) is the same stack on three's `WebGPURenderer`, as a TSL `RenderPipeline`. It keeps
`PostStack`'s spec, order and interface: `configure`, `setParams`, `settle()`, `setSize`, `render`, `passes` and
`dofSource`. LUTs and lengths in px at 1080p work as on WebGL. The render host picks the stack:

```js
const host = await RenderHost.create({ canvas, backend, post: { loadCube: async (file) => text(file) } });
// WebGL: PostStack (pmndrs).  WebGPU: TSLPostStack, whose module (and three/webgpu) only a WebGPU page loads.
// Or: await makePostStack(renderer, { loadCube }) from '@vrmxg/post'.
```

The formulas are pmndrs 6.39.6's, effect by effect, so the look stays within the WebGL tolerance (M4-PLAN: SSIM ≥ 0.98;
translucency aside, AB-D-0273). The merged pass converts colour spaces where pmndrs' `EffectPass` does: brightness and
contrast, and the LUT, run in sRGB. Patterns written in GL's uv (y up), such as the speed lines, the aberration's
direction and grain's noise, get a flipped uv on WebGPU.

| Effect | Under TSL (r187) | Why not three's node |
|---|---|---|
| `edges` | Custom TSL, depth + normal, characters masked. Normals come from a full-res pass with an override material, as pmndrs' `NormalPass` makes them. The character mask is a ½-res pass of layer 2 (`PassNode.setLayers` + `overrideMaterial`) | `sobel()` is luminance only and `outline()` outlines a selection. Not `material.mrtNode`: in r187 it breaks every non-MRT pass (gotcha 5, #35373, fixed for r188) |
| `dof` | A port of pmndrs' `DepthOfFieldEffect`: CoC from the distance to the camera, the near CoC Kawase-blurred at ½ res, the far field masked by its CoC, and per field a 64-tap average and a 16-tap max (Vogel kernel). Composited by CoC × bokeh scale | three's `dof()` ports the same bokeh but blurs the far field unmasked, so in-focus edges bleed into the blur (SSIM 0.983 against 0.996 with the port). Its first frame is flat when it's newly built (gotcha 4, #35620) |
| `bloom` | pmndrs' luminance threshold and 8-level mipmap blur (13-tap down, 9-tap tent up, radius), SCREEN-blended | `bloom()` is UnrealBloom's blur, a different look |
| `grade` | pmndrs' hue matrix and saturation-on-average (clamped to 1), then brightness/contrast in sRGB | `hue()` and `saturation()` use other formulas |
| `lut` | `lut3D()` on a HalfFloat 3D texture (`lutFromCubeTSL`), looked up in sRGB; `intensity` (0…1) mixes it in. `PostStack` honours it too: below 1 its LUT3DEffect blends NORMAL at that opacity, and at 1 it keeps pmndrs' SRC, so a full-strength grade draws exactly as before | (used) |
| `toneMapping` | `toneMapping()` mid-chain; the pipeline's output transform does sRGB only | (used) |
| `vignette`, `anime`, `chromaticAberration` | Custom TSL, ports of pmndrs' and `AnimeEffect` | No vignette node; `chromaticAberration()` has no px unit |
| `grain` | pmndrs' `NoiseEffect` (three's `rand`, premultiplied, SCREEN) on the frame's presentation time | `film()` takes the renderer's global time |
| `smaa` | `smaa()`, only without MSAA, as on WebGL | (used) |

**Pipelines are cached per structure, in a small LRU.** The structure is which effects (and the LUT file), whether that
LUT has arrived, the tone mapping and the sampling. A structure that comes back reuses its pipeline. A new camera or
scene retargets the passes, and values only update uniforms.
- **Shared passes:** every structure shares one MSAA scene pass, and one normal pass and one mask pass once a structure
  has edges.
- **What a pipeline owns:** its own targets are its bloom chain (16), its DOF (10) and its intermediate textures.
- **Eviction:** the cache keeps `cacheSize` structures (2 by default: the look and the one before it). The least
  recently drawn is disposed with every target it owns. A LUT look's `lut:false` pipeline goes when the LUT arrives.
- **`dispose()`** frees every pipeline, every target and the shared passes. Every pass and texture is sized to the drawing buffer when the
pipeline is built (gotcha 4: a node that sizes itself from its input on its first frame saw a 1×1 target and drew one
flat colour).

**Result (2026-11-20, M5 Max, Chrome for Testing 156 headless on Metal; WKWebView, macOS 27.3; the cafe at step 420
of the recorded walk at 1920×1080, `apps/playground` `?mode=post`).**
- **Every M2 preset renders on WebGPU** in Chromium and in WKWebView over the scheme and loopback. So do the variants a
  short uses: no grain, the sample's LUT, the overlays keyed on, a close-up's shallow focus. The first frame of every
  newly built pipeline equals the next draw of the same frame and isn't flat.
- **Two exports per engine are byte-identical**: five frames of the anime preset from fresh loads, one pipeline built
  at frame 0 and one from the cache. They repeat across page loads and, in WKWebView, across origins. Frames differ
  between Chromium and WebKit, as every WebGPU and WebGL frame does (gotcha 10).
- **SSIM against WebGL** (luma, 8×8 windows) per look. WebGPU's frame is compared with WebGL's in the same engine
  (`results/post-chromium.json`, `post-wkwebview.json`):

  | Look | none | clean | anime | anime, no grain | + LUT | + LUT at 0.85 | + overlays | shallow focus |
  |---|---|---|---|---|---|---|---|---|
  | Chromium and WKWebView (loopback) | 0.994 | 0.997 | 0.961 | 0.996 | 0.996 | 0.996 | 0.996 | 0.995 |
  | the same at ¼ size (4×4 means) | 0.997 | 1.000 | 0.993 | 0.996 | 0.996 | 0.996 | 0.996 | 0.997 |

- **The cost of a 1080p frame** (median of 20, GPU work included; WebGPU waits on `onSubmittedWorkDone()`, which
  adds its own round trip, so read the difference): in WKWebView over loopback, the anime stack takes WebGPU from
  2.5–2.9 to 3.7 ms (+0.8–1.2 ms), against WebGL's 0.4 to 1.0–1.2 ms (+0.6–0.8 ms). In Chromium: WebGPU 1.9–2.4 to
  3.6–5.7 ms, WebGL 0.6 to 1.6 ms.

  The only effect that can't match is **grain**: its noise is `fract(sin(dot(uv, k)) × 43758)`, and uv differences
  around 1e-6 (each backend's interpolation) pick other noise. Statistically it's the same grain, but pixel by pixel it
  isn't. M2's check 11 already measured grain apart (0.951) for the same reason. At ¼ size, where the noise averages
out, the anime look with grain is 0.993. What's left elsewhere is silhouettes
  and edge lines, mostly MSAA resolve, which is there without post too.

Tests (`npm test`): spec normalisation (presets, defaults, order, unknown effects refused), structure keys, and the
layout of viewports. `test/tsl.test.mjs` builds `TSLPostStack`'s graph against a stand-in renderer (TSL builds without
a GPU) and has one test per r187 gotcha the stack leans on, each with a canary that reads three itself. Gotcha 1: an
offline frame advances the node frame before the stack draws. Gotcha 4: every pass and texture is sized at build, and
`render()`'s own cache keeps one pipeline per structure (the LRU's eviction frees every target, and the rebuild is
sized; `dispose()` frees all). Gotcha 5: the mask is a layer pass with no material `mrtNode`. Gotcha 7: in the built
graph, `toneMapping()` takes the vec4 and is never joined into another vec4. Further tests cover the order, `setParams`, LUTs and `settle()`, resolution-independent
lengths, pmndrs' grade factors and `makePostStack`. The rendered checks run in the browsers (`acceptance/`, and
`apps/playground`'s `?mode=post`).
