# VRMXG WebGPU render spike

*2026-11-19. AB-T-0554, WebGPU research 2 for M4 (AB-D-0261): the render path apart from MToon on `WebGPURenderer`. That covers the anime post stack in TSL, three.quarks, offline readback with deterministic frames, and WKWebView. MToon is AB-T-0553 (`spike-webgpu-mtoon/`, AB-R-1004), so the characters here use a `MeshToonNodeMaterial` stand-in with an inverted-hull outline in TSL. The stack is three r187, `@pixiv/three-vrm` 3.5.5 (vendored), three.quarks 0.18.0 and the engine packages as they are (nothing in `engine/packages` changed). The scene is the sample cafe. Machine: M5 Max, macOS 27.3 (26C5047e). The runtimes are the sandboxed WKWebView wrapper copied from `spike-physics` (a fresh web view per case, default `WKWebViewConfiguration`) and Chrome for Testing 156, headless on Metal.*

## Verdict

*Receipts: AB-R-1005 (post stack), AB-R-1006 (three.quarks), AB-R-1007 (readback and exports), AB-R-1008 (WKWebView). Task AB-T-0554 is done.*

**Every piece runs on `WebGPURenderer`, and exports stay byte-identical. M4 needs six engine changes and five r187 workarounds, all listed below. Nothing here blocks M4.**

| Piece | Verdict |
|---|---|
| **Post stack** | **Works.** The whole anime stack runs as one TSL `RenderPipeline` behind the `PostStack` interface (`web/src/tsl-post.js`), driven by the same scene data (`environment.post`, presets, `setParams`). three's nodes cover DOF, bloom, LUT, hue/saturation and tone mapping. Six pieces are custom TSL of 5–30 lines each: set edges with the character mask, vignette, deterministic grain, speed lines / focus lines / impact, px-unit chromatic aberration, and brightness/contrast. **Cost:** throughput in WKWebView is 1.94 / 4.91 ms per frame at 1080p / 4K, against 2.66 / 5.22 for `@vrmxg/post` on WebGL. Chromium gives 1.41 / 3.18 against 1.60 / 4.51. The stack makes 290 draw calls against WebGL's 395. The look matches WebGL's: corner and centre means are within 5 levels of 255, and the remaining difference is the MToon stand-in. |
| **three.quarks** | **Works, and the adapter holds.** `three.quarks/webgpu` (`WebGPUBatchedRenderer`, TSL) draws the engine's unchanged effects. The particle state rendered every step under WebGPU hashes the same as the headless reference (final `976e7033e22ad048`, the same value acceptance check 13 gets in Node, Chromium and WKWebView). A snapshot taken mid-effect re-simulates identically, and frames after a restore are pixel-identical once a warm-up renderer exists (gotcha 6). The engine change is one line: `@vrmxg/particles` must take the renderer's `BatchedRenderer` instead of importing the WebGL one (the spike swaps it with a Vite shim). |
| **Readback** | **Works, but slower than WebGL in WebKit.** Readback goes through an `RGBA8` output target, `copyTextureToBuffer` into a ring of 3 `MAP_READ` buffers, and `mapAsync`. In WKWebView it costs **2.46 / 9.68 ms** at 1080p / 4K after a finished frame, and 3.1 / 10.5 ms inside the export loop. WebGL's pixel-pack path costs 1.96 / 5.52 ms there. WebKit's `mapAsync` moves about 3.4 GB/s no matter how it is pipelined (it copies across from the GPU process). Chromium takes 0.5 / 1.3 ms. A whole export frame (steps, render, readback, hash) is 9.7 / 23.7 ms on WebGPU against 8.1 / 20.8 ms on WebGL. |
| **Deterministic frames** | **Two exports are byte-identical.** That holds for 90 frames at 1080p30 and 12 frames at 4K, each export with its own renderer and world, in WKWebView through both origins (same digests: `071fd8804bc0d857`, `f450285b59b8b9bd`) and in Chromium. It holds only with the workarounds: advance the node frame per offline frame (without it, 5 offline frames came out as 1 distinct image), draw through `setOutputRenderTarget`, reuse one output target per size, cache pipelines per structure, and create a warm-up renderer before the ones whose frames must match. WebGPU frames are not identical between Chromium and WebKit (nor are WebGL ones), so exports are exact per engine, as AB-R-1004 also found. |
| **WKWebView** | **WebGPU is on by default.** It needs no flags, no private preferences and no entitlement beyond the shell's existing sandbox (`app-sandbox`, `network.client`, `network.server`). In the sandboxed wrapper on macOS 27.3, `navigator.gpu` is present, an adapter and device come up, and `WebGPURenderer` gets its WebGPU backend under the custom scheme `vrmxg-spike://` and on loopback alike. Both origins render the same frames. WebKit's limits are lower than Chromium's, for example `maxColorAttachmentBytesPerSample` is 64 against 128. The post stack's MRT uses 20 bytes per sample. Timings still need loopback (the scheme's timer is 1 ms). |

### What M4 has to change in the engine

1. **`RenderHost`**
   - Accept a `WebGPURenderer` (`await renderer.init()`).
   - Make the room environment with WebGPU's `PMREMGenerator` (`roomEnvironment()` returns null without WebGL).
   - Size the post stack from `renderer.getDrawingBufferSize()`, not `getContext().drawingBufferWidth`.
   - In `frameAt`, advance the node frame before drawing (gotcha 1).
2. **`@vrmxg/post`**
   - Add a TSL adapter beside the pmndrs one. `web/src/tsl-post.js` is its seed: the same spec, order, `setParams`, `settle()`, LUT loading and resolution-independent lengths.
   - Cache pipelines per structure (gotcha 4).
   - Build the character mask from a layer pass, not `material.mrtNode` (gotcha 5).
3. **`@vrmxg/particles`**
   - Take the `BatchedRenderer` from the host (WebGL or `three.quarks/webgpu`) instead of importing it.
4. **`@vrmxg/export`**
   - Add a WebGPU `Readback`: an output target per size with `setOutputRenderTarget`, a buffer ring and `mapAsync`.
   - Its rows are **top-down** and straight RGBA, so `toImageRGBA` needs a flag. WebGL's rows are bottom-up and premultiplied.
   - `captureStill` reads with `gl.readPixels` and needs the same split.
5. **App start**
   - Create and `init()` one throwaway `WebGPURenderer` (with a PMREM) before the view's and the exports' renderers (gotcha 6).
6. **Characters**
   - Apply AB-T-0553's three-vrm patch (`MToonNodeMaterial`). Until then, use this spike's stand-in (`web/src/standin.js`).

## Results

All numbers are from the production build (`vite build`, minified) and the wrapper built with `swiftc -O`. Timed runs in WKWebView went over loopback in a fresh web view (AB-L-0346). Raw JSON is in `results/`, and `node web/scripts/summary.mjs` prints these tables.

### Post stack: TSL mapping

| Effect (`@vrmxg/post`) | Under WebGPU | What's missing in r187 |
|---|---|---|
| `edges` (depth + normal on sets, characters masked) | Custom TSL over `pass()` MRT `normal` (`packNormalToRGB(normalView)`, RGBA8) and the pass's depth. The mask is a ½-resolution pass of layer 2 (`PassNode.setLayers` + `overrideMaterial`, background off), as `drawMask` does | No depth+normal edge node. `sobel()` is luminance only and `outline()` is a selection outline. `material.mrtNode` can't carry the mask (gotcha 5) |
| `dof` (auto from the lens) | `dof(color, scenePass.getViewZNode(), focus, range, bokeh)`, same focus and range in world units | `bokehScale` is in different units from pmndrs' (visual match not tuned). Rebuild bug (gotcha 4) |
| `bloom` | **Selective:** `bloom()` on the emissive MRT target (`mrt({ output, emissive })`), so only emissive surfaces bloom, as research/cinematics.md §3.2 asks. `?bloom=threshold` runs `bloom()` on the colour with pmndrs' threshold instead | Nothing |
| `grade` | `hue()`, `saturation()` and two lines for brightness/contrast | Brightness/contrast node |
| `lut` (`.cube`) | `lut3D()` on three's `LUTCubeLoader` texture | Nothing |
| `toneMapping` | `toneMapping()` mid-chain. The pipeline's output transform then does sRGB only (`renderer.toneMapping = NoToneMapping` while the stack runs, as on WebGL) | Nothing (`ToneMappingNode` returns a vec4 for a vec4 input) |
| `vignette` | Custom (three's `VignetteShader` formula) | Vignette node |
| `grain` | Custom: pmndrs' `NoiseEffect` (premultiplied, screen blend) seeded by the frame's presentation time as a uniform | `film()` takes its noise from the renderer's global `time` (wall clock), so it isn't deterministic in exports |
| `anime` (speed lines, focus lines, impact) | Custom: a line-for-line port of the GLSL `Effect` | (ours) |
| `chromaticAberration` | Custom: pmndrs' radial model, offset in px at 1080p, 3 taps on a `convertToTexture` of the chain | `chromaticAberration()` exists but is a stepped radial scale with no pixel unit |
| `smaa` | `smaa()` (also `fxaa()`, `traa()`) | Not used: the anime preset runs MSAA 4× |

The passes the anime preset builds (`results/*bench_renderer_webgpu.json`) are scene (MSAA 4×, MRT output + emissive + normal) → character mask (layer 2, ½ resolution) → edges → `dof()` → one merged node (bloom on the emissive target, grade, tone mapping, vignette, grain, anime) → chromatic aberration. The cafe under it: `shots/wkwebview-loopback-webgpu-anime-1080p.png`, next to `shots/wkwebview-loopback-webgl-anime-1080p.png`.

### Post stack: cost

Throughput is 30 frames drawn back to back with one GPU sync, best of 3, after a 2 s warm-up at 4K. It compares the two APIs fairly. Per-frame synced medians (`gl.finish()` against `queue.onSubmittedWorkDone()`) carry different fixed costs per API and are noisy in WebKit, so they're in the JSON and the second table only.

| Runtime | Renderer | none 1080p | none 4K | **anime 1080p** | **anime 4K** | anime+LUT 1080p | anime+LUT 4K | draw calls none / anime |
|---|---|---|---|---|---|---|---|---|
| WKWebView loopback | WebGL, `@vrmxg/post` (pmndrs) | 0.68 | 1.19 | **2.66** | **5.22** | 2.27 | 5.27 | 227 / 395 |
| WKWebView loopback | WebGPU, TSL stack | 0.80 | 0.91 | **1.94** | **4.91** | 2.14 | 4.90 | 244 / 290 |
| Chromium 156 | WebGL, `@vrmxg/post` | 0.46 | 0.46 | 1.60 | 4.51 | 1.61 | 4.52 | 227 / 395 |
| Chromium 156 | WebGPU, TSL stack | 0.76 | 0.78 | 1.41 | 3.18 | 1.53 | 3.20 | 244 / 290 |

Synced per-frame medians in WKWebView (loopback): WebGL anime 1.38 / 5.44 ms (p90 2.7 / 14.5), WebGPU anime 3.22 / 6.74 ms (p90 3.5 / 7.0). WebGPU's numbers are steadier. Its synced no-post frame (1.5 / 2.9 ms) is mostly the cost of `onSubmittedWorkDone` itself.

### Readback (median ms, anime frame)

| Runtime | Renderer | Size | After a finished frame | In the export loop (read n, take n − 1) | Other |
|---|---|---|---|---|---|
| WKWebView loopback | WebGL (`@vrmxg/export` `Readback`) | 1080p | PBO 2.88 | **1.96** | `readPixels` sync 4.42 |
| WKWebView loopback | WebGL | 4K | PBO 10.52 | **5.52** | `readPixels` sync 14.76 |
| WKWebView loopback | WebGPU (`mapAsync`, ring of 3) | 1080p | **2.46** | 3.10 | three's `readRenderTargetPixelsAsync` 3.36 |
| WKWebView loopback | WebGPU | 4K | **9.68** | 10.52 | three's helper 13.0 |
| WKWebView scheme | WebGPU | 1080p / 4K | 3 / 9 (1 ms timer) | 3 / 9 | 3 / 12 |
| Chromium 156 | WebGPU | 1080p / 4K | 0.5 / 1.3 | 0.2 / 1.7 | 1.4 / 4.9 |
| Chromium 156 | WebGL | 1080p / 4K | PBO 5.5 / 16 | 3.0 / 9.7 | 4.5 / 12.4 |

three's `readRenderTargetPixelsAsync` allocates a new buffer on every call and strips row padding in JavaScript, so keep a ring of buffers instead. At 1080p and 4K, `width × 4` is already a multiple of 256, so the rows have no padding.

### Two exports, byte for byte

Each export builds its own renderer and world, replays the walk-in take from step 0, and draws 1080p30 for 90 frames (all distinct) or 4K for 12 frames, through the anime stack. Each frame is hashed as it is read back (`hashFrame`, as the shell does). The cafe camera doesn't see the particle emitters. The particle check below covers them.

| Runtime | Renderer | Size | Identical | Digest | Per-frame ms |
|---|---|---|---|---|---|
| WKWebView loopback | WebGPU | 1080p / 4K | **yes / yes** | `071fd8804bc0d857` / `f450285b59b8b9bd` | 9.7 / 23.7 |
| WKWebView scheme | WebGPU | 1080p / 4K | **yes / yes** | `071fd8804bc0d857` / `f450285b59b8b9bd` (same as loopback) | 9.0 / 23.0 |
| WKWebView loopback, export A = the page's first renderer | WebGPU | 1080p | yes | `071fd8804bc0d857` | 8.7 |
| WKWebView loopback | WebGL | 1080p / 4K | yes / yes | `b031d0bf8ca76efc` / `7407a64996db3d54` | 8.1 / 20.8 |
| Chromium 156 | WebGPU | 1080p / 4K | yes / yes | `03db9f76c8b82309` / `0a2b69944544f9a0` | 5.3 / 13.7 |
| Chromium 156 | WebGL | 1080p / 4K | yes / yes | `325882aaac77d91e` / `52cea067853f19e2` | 8.1 / 22.2 |

**Without advancing the node frame** (`withoutTick` in the JSON), five offline frames, steps 120 to 128, came out as **one** distinct image in both runtimes: every frame showed the first one's pass textures. With the tick they came out as five.

### three.quarks under WebGPU

The run is acceptance check 13's: steam, dust and a spark loop plus 40 steam emitters, 360 steps, a snapshot at 180. Here it is rendered every step through `frameAt` at 720p, and a camera on the emitters takes pixel hashes at steps 200–360. "Second world" is the world those pixels are compared against: a restore of the snapshot, or a fresh run from step 0.

| Runtime | Renderer | Headless final | Rendered final | Snapshot re-run | Pixels, second world |
|---|---|---|---|---|---|
| WKWebView loopback | WebGL `BatchedRenderer` | `976e7033e22ad048` | same | identical | restored: **identical** |
| WKWebView loopback | `three.quarks/webgpu` `WebGPUBatchedRenderer` | `976e7033e22ad048` | same | identical | restored: 7 px differ by 1 (world A was the page's first renderer) |
| WKWebView loopback | `three.quarks/webgpu` | same | same | identical | fresh from step 0: 7 px differ by 1 (same cause) |
| WKWebView loopback | `three.quarks/webgpu`, warm-up renderer first | same | same | identical | restored: **identical**; fresh: **identical** |
| Chromium 156 | `three.quarks/webgpu` | same | same | identical | restored: 2 px differ by 1; with a warm-up renderer: **identical** |
| Chromium 156 | WebGL | same | same | identical | restored: identical |

The rendered frame with particles (720p, no post, GPU-synced, step included) takes 4.34 ms on WebGPU against 1.58 on WebGL in WKWebView. About 1 ms of that is the sync. The rest is uploading the batches' storage buffers, which this spike didn't profile. The quarks step itself is the same 0.23 ms. Shots: `shots/wkwebview-loopback-webgpu-particles-720p.png` and `…-webgl-particles-720p.png`.

## Gotchas this spike found (r187)

1. **A `RenderPipeline` doesn't redraw its passes in an offline loop.** Every `PassNode` (and every shadow map) updates once per `nodeFrame.frameId`, and only the renderer's own `requestAnimationFrame` loop advances that. An export or a timing loop that never yields to rAF gets the final quad drawn over the first frame's pass textures. Measured: 5 offline frames came out as 1 distinct image. The fix is `renderer._nodes.nodeFrame.update()` before each offline frame. That is a private field, since r187 has no public call, so file an upstream issue for a public one.
2. **Read frames back through `setOutputRenderTarget(rt)`, not `setRenderTarget(rt)`.** With `setRenderTarget`, a plain `renderer.render()` skips the output transform (no tone mapping, no sRGB) and depth-tests against the target's own depth buffer. Ours had none, so the frame drew back faces over front faces and looked like a different camera. With `setOutputRenderTarget` the target gets exactly what the canvas would.
3. **Keep one output target per size, sized to the drawing buffer.** In r187, output targets created after the first one never received the draws: they had no GPU texture, or stayed black after `initRenderTarget`. An exporter keeps one per size anyway (`readbackFor()`).
4. **A `dof()` built after another `dof()` can draw one flat colour.** Reproduced: dof → tone mapping only → dof again, and anime + LUT → anime. Disposing old pipelines or not makes no difference. `DepthOfFieldNode` shares one module-level `QuadMesh` between instances, which is the likely suspect. The workaround is to cache one pipeline per structure and never build a second for a structure the stack has seen. Evidence: `shots/chromium-webgpu-view-dof-rebuild-bug.png` (flat) and `…-cached.png`. Repro: `?mode=view&renderer=webgpu&seq=dof,toneMapping;toneMapping&post=dof,toneMapping&disposeOld=1`. To report upstream (needs the operator's OK).
5. **`material.mrtNode` breaks every render-target pass without an MRT.** A material's own MRT replaces its output whenever the pass has none. Shadow maps and the renderer's own framebuffer then fail to compile (`struct OutputType {}` with no members, a WGSL error). So the character mask is a separate layer pass, as on WebGL, not a per-material MRT channel.
6. **The first `WebGPURenderer` in a page compiles some materials differently.** A set material (`#9b9a96`) came out with its environment (IBL) code before the shadowed light on the first renderer, and after it on every later one (`?wgsl=1` records and diffs the shader modules). The arithmetic order differs, so a few pixels differ by 1. That showed up only in the particle view (2–7 pixels at 720p). The cafe export from the first renderer matched later ones. The workaround: create and `init()` a throwaway renderer, with a PMREM, before any renderer whose frames must match (`?dummy=host`). Afterwards every renderer in the page drew identical frames. A throwaway world (which brings its own renderer) fixes it too. 5,000 throwaway materials or objects do **not**, so it isn't id order.
7. **Small r187 API changes.** `directionToColor()` is now `packNormalToRGB()`. `toneMapping(mapping, exposure, color)` returns a vec4 when `color` is a vec4. `RenderPipeline.renderAsync()` is deprecated (use `render()` after `init()`). `PMREMGenerator.fromSceneAsync()` is deprecated.
8. **`renderer.info` resets on every `render()` call**, and a pipeline makes a dozen. Draw calls per frame need `info.autoReset = false` around the whole frame (`frameInfo()`).
9. **WebKit's `mapAsync` is a copy at about 3.4 GB/s.** It costs 2.5 ms for 8.3 MB and 9.7 ms for 33 MB, and overlapping it with the next frame doesn't hide it. Chromium maps shared memory (0.5 / 1.3 ms). If 4K export speed matters, convert to 4:2:0 on the GPU before reading back. That moves 1.5 bytes per pixel instead of 4, and AVAssetWriter takes NV12 directly. Not tried here.
10. **WebGPU frames differ between engines.** Chromium (Tint/Dawn) and WebKit give different exact frames for the same scene. So do WebGL frames, here. Determinism holds per engine and across origins. The shell is one engine (WebKit), so its exports repeat exactly.

## Run it

```bash
cd web && ../../node_modules/.bin/vite --port 5241             # http://127.0.0.1:5241/?mode=… (dev, source)
node scripts/chromium.mjs 'mode=bench&renderer=webgpu' bench-webgpu   # Chromium; writes ../results/chromium-<name>.json and shots
mac/scripts/build.sh                                            # vite build + swiftc -O + ad hoc signed, sandboxed .app
mac/scripts/run.sh                                              # the default cases (main.swift) through both origins
SPIKE_CASES='mode=probe&origin=scheme;mode=export&renderer=webgpu&origin=loopback' mac/scripts/run.sh
node web/scripts/summary.mjs                                    # the tables above; writes results/summary.json
```

The engine packages and three come from the repo root's `node_modules` (workspaces), so the spike has no install of its own. vrmxa-core is read from `../vrmxa-avatar-studio` as the playground reads it.

**Modes** (`?mode=`): `probe` (WebGPU in this web view), `view` (one still; `post=anime|none|<comma list>`, `seq=` posts set first, `toggle=`, `big=1`), `bench` (costs; `stages=1` stills per case), `export` (readback timing and two exports; `timing=0` makes export A the page's first renderer; `frames=`), `particles` (`b=fresh`, `fx=0`, `dummy=host|world|materials|objects`, `wgsl=1`, `pixshots=1`). Any page takes `renderer=webgpu|webgl`, `tick=0` (no node-frame tick), `disposeOld=1`, `bloom=threshold` and `outline=<scale>` (stand-in outline width).

## Layout

| Path | What |
|---|---|
| `web/src/tsl-post.js` | The TSL anime stack behind `PostStack`'s interface; `MAPPING` (effect → node, what's missing) |
| `web/src/standin.js` | MToon → `MeshToonNodeMaterial` + inverted-hull outline in TSL (until AB-T-0553's patch is applied) |
| `web/src/main.js` | The harness: hosts on either renderer, the WebGPU readback (`GPUReadback`), the modes |
| `web/src/quarks-shim.js` | `three.quarks` for the engine package, with `BatchedRenderer` chosen by `?renderer=` (the Vite plugin in `vite.config.js` routes the import) |
| `web/scripts/chromium.mjs`, `summary.mjs` | Chromium runner; the tables |
| `mac/` | The wrapper (`SchemeHandler` and `LoopbackServer` copied from spike-physics; `main.swift` runs cases in fresh web views) |
| `results/` | Raw JSON: `wkwebview-<origin>-<case>.json`, `chromium-<name>.json`, `summary.json` |
| `shots/` | Stills: the anime look on both renderers and runtimes, export frames, particles, the DOF rebuild bug |
