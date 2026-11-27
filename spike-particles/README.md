# VRMXG particles spike

*2026-11-17. A throwaway spike for PRD §5.11: which particle system VRMXG should put behind its engine adapter. Tested in our real stack: Vue 3 + three r187 + `@pixiv/three-vrm` 3.5.5 (MToon), inside the thin sandboxed WKWebView wrapper copied from `spike-physics`. Machine: M5 Max, macOS 27.3.*

## Verdict

> **2026-11-17, AB-T-0500:** the maths module is now the engine package [`engine/packages/dmath`](../engine/packages/dmath/README.md) (`@vrmxg/dmath`, receipt AB-R-0931). `web/src/core/detmath.js` is a re-export of it, so the suite runs on the engine module; the numbers below are from the original port. Re-run on the merged module, the portable-math variants are still identical in every runtime, now including headless Chromium (`web/scripts/chromium-tests.mjs`), but their hashes differ from the ones below: the merged trig rounds differently from this spike's simpler port.

**Adopt three.quarks (0.18.0, MIT) behind the adapter. The adapter, not the library, owns the RNG, the fixed step, the maths and the snapshots.**

- **three.quarks has the most features and is the fastest CPU library.** It is the only candidate with stretched billboards, flipbooks, sub-emitters, trails, mesh particles, soft particles and a collision hook. One API covers WebGL and WebGPU (`three.quarks/webgpu`, TSL), and the same effect code ran on both in WKWebView. 10k particles cost about **0.6–0.7 ms per step** in WKWebView, drawn in **1 draw call** whether they come from 1 or 50 emitters. It is under active development (0.18.0 shipped today, 81 releases since 2019) and adds 41 KB gzipped.
- **No library is deterministic across browser engines out of the box, and nothing in particles is to blame.** V8 and JavaScriptCore return different last bits from `Math.sin`, `cos`, `tan`, `atan2`, `acos`, `asin`, `exp`, `log`, `cbrt` and `hypot`. I measured this directly with `node` and the `jsc` CLI on 200k inputs. Every library calls these functions, and so did my own CPU reference.
- **Determinism is easy to add in an adapter, and the spike proved it.** The adapter swaps in two things for the duration of each step: a seeded RNG for `Math.random`, and portable fdlibm-style maths for those ten functions (`src/core/detmath.js`, 2.4 KB gzipped). With both in place, three.quarks, three-nebula, three.proton.js and the hand-rolled reference give **bit-identical state in Node (V8), WKWebView over the custom scheme and WKWebView over loopback (both JSC)**. It costs three.quarks about 0.01 ms per step.
- **Scrubbing a shot works.** An adapter-side snapshot of three.quarks restores **bit-identical state and pixel-identical frames**. It takes about 5 ms to take or restore at 10k particles, and its JSON is 7.3 MB. Re-simulating from frame 0 also matches, at about 0.6 ms per frame.
- **The runner-up is three-nebula, revived in July 2026.** It now has built-in seeding (`setSeed`), JSON loading and a WebGPU renderer. Its WebGL renderer, though, draws point sprites only: no stretched sparks, a 511 px cap, sizes that ignore the pixel ratio, and broken rotation once a system uses an atlas. It is also 3× slower than three.quarks and made the weakest anime effects.
- **Don't adopt three.proton (Mage's choice).** `three.proton.js` last shipped on 2020-07-29. It creates one scene object per particle, so 10k particles mean 10k draw calls.
- **Keep the hand-rolled "stateless" GPU kernel as a later option for timeline-heavy anime FX.** Each particle is a pure function of (seed, index, time), so a step costs nothing on the CPU and a scrub is O(1) and pixel-exact. It made the best-looking sparks and speed lines, but it can only move particles along closed-form paths (no collisions, attractors or noise), has no editor, and is WebGL-only until it gets a TSL port.

## Comparison

Release dates come from the npm registry (2026-11-17). "Ran on r187" means the spike built, stepped and rendered it on three 0.187.0.

| | **three.quarks 0.18.0** | three-nebula 13.3.0 | three.proton.js 0.2.3 | MavonEngine (`reference/Core-dev`) | @newkrok/three-particles 3.0.0 | Hand-rolled stateless (this spike) |
|---|---|---|---|---|---|---|
| Licence | MIT | MIT | MIT | MIT | MIT | ours |
| Maintenance | 0.18.0 on 2026-11-17, 0.17.1 May, 0.17.0 Feb; 81 versions since 2019 | Dormant from 10.0.3 (Nov 2021) to 11.0.0 (Jul 2026), then 13 versions in 2 months (TypeScript, seeding, WebGPU, ribbons, child emitters) | Last release 2020-07-29 (`three.proton` 1.0.1 in 2017) | In the repo only, not on npm; about 400 lines | 3.0.0 on 2026-04-25; 62 versions | — |
| three r187 | peer `>=0.182`; ran | built against r185.1; ran | UMD `require('three')`; ran once `three` was aliased to the ESM build (gotcha 10) | coupled to its `Game` singleton | peer `^0.182`, so it needs an npm override; the CPU path ran | ran |
| WebGL | yes, batched | `GPURenderer` (one `gl.POINTS` draw), or one `Sprite` per particle | one `Sprite`/`Mesh` per particle | `Points` + `ShaderMaterial` | yes | GLSL `ShaderMaterial` |
| WebGPU | `three.quarks/webgpu` (TSL); **verified in WKWebView** | `three-nebula/webgpu` `GPURenderer`; **verified** | no | no | TSL compute backend (GPU simulation); not verified | needs a TSL port |
| Emitter shapes | point, sphere, hemisphere, cone, circle, donut, rectangle (perimeter), grid, mesh surface | point, sphere, box, line, mesh, screen, ring, disc, cylinder, cone | point, line, sphere, box, mesh, screen | hand-coded per effect | sphere, cone, box, circle, rectangle | sphere, box, plane + cone direction |
| Curves over life | Bezier and piecewise curves for size, colour, speed, rotation, force and frame | two-point A→B with easing | two-point A→B | hand-coded | Bezier curves | cubic Bezier for size and alpha, linear colour |
| Sub-emitters | yes (birth, death, per frame) | yes (13.1 child emitters, death trigger) | no | no | yes | no (possible in closed form) |
| Trails | yes (Trail mode) | yes (13.1 `RibbonRenderer`) | no | no | yes | no (possible in closed form) |
| Stretched billboards | **yes** | no | no | no | not found | yes |
| Collisions | `ApplyCollision` with a pluggable resolver (Rapier fits) | particle–particle, zone bounds | particle–particle, zone bounds | no | collision planes | no |
| Attractors and fields | gravity point, orbit, turbulence, noise, force | attraction, repulsion, gravity, drift, spring, vortex, curl noise | attraction, repulsion, gravity, drift, spring | no | force fields, noise | gravity and drag only |
| Soft particles | yes (WebGL needs a depth texture; automatic on WebGPU) | no | no | no | not found | no |
| Texture sheets | tiles, frame over life, frame blending | atlas of whole textures, no flipbook | no | no | yes | atlas tiles |
| Mesh particles | yes (instanced) | `MeshRenderer` (one mesh per particle) | one mesh per particle | no | yes (instanced) | no |
| Seeding | **none built in** (global `Math.random`); the adapter swaps it | **`setSeed`** + fixed `update()` | none; the adapter swaps it | none | none, and it times particles from a wall-clock millisecond value | built in |
| Saved format | three.js Object JSON (`toJSON` / `QuarksLoader`); **bit-exact round trip** | `System.fromJSON(Async)` in; **no `toJSON`** | none | none | config objects with live textures and geometry; `serializeParticleSystemConfig` | plain JSON by construction |
| Editor | quarks.art (hosted, exports quarks JSON); the old open-source editor is archived (MIT) | none current | none | MavonEngine's own editor preview | THREE Particles Editor (newkrok.com) | none |
| Bundle, min / gzip | 195 / 41 KB (WebGPU entry 216 / 47 KB) | 100 / 25 KB (+ 8 / 3 KB WebGPU) | 57 / 13 KB | — | 97 / 26 KB | 22 / 8 KB |

**Also found in 2026, all too young to adopt:** `webgpu-vfx` 0.1.1 and `three-plume` 0.1.1 (TSL compute, each a single burst of releases in April and May 2026, peer three `^0.184`), and `@interverse/three-particles` 1.7.0 (a burst in December 2025, then quiet).

## Results

The same suite (`web/src/tests.js`) ran in Node and in the page. The raw JSON is in `results/`, and `node web/scripts/summary.mjs results/*.json` prints the tables.

### 1. Determinism

**State hashes after 600 fixed steps at 1/60 s.** The scene has 10 benchmark emitters of about 1000 particles each, plus every anime effect that library has, about 10.2k live particles in all. The hash is FNV-1a over the float64 bits of position, velocity, age, life, size, colour and rotation for every live particle.

| Variant | Node (V8) | WKWebView scheme (JSC) | WKWebView loopback (JSC) | Repeats in one runtime | Same across runtimes |
|---|---|---|---|---|---|
| three.quarks, unseeded | varies | varies | varies | no | no |
| three.quarks, adapter RNG, one stream | `27641e0e` | `da9126ed` | `da9126ed` | yes | **no** |
| three.quarks, adapter RNG, per-frame seed | `c70927d7` | `5ff6669f` | `5ff6669f` | yes | **no** |
| three-nebula, `setSeed` | `ec53cfec` | `93c60c07` | `93c60c07` | yes | **no** |
| stateless CPU reference | `e7ebcb91` | `eef5422c` | `eef5422c` | yes | **no** |
| three.proton.js, RNG swap (probe) | `6c31fd6b` | `e2508fa7` | `e2508fa7` | yes | **no** |
| **three.quarks, per-frame seed + portable maths** | `43cfdc5f` | `43cfdc5f` | `43cfdc5f` | yes | **yes** |
| **three-nebula, `setSeed` + portable maths** | `4ef05877` | `4ef05877` | `4ef05877` | yes | **yes** |
| **stateless CPU reference + portable maths** | `8c085ec6` | `8c085ec6` | `8c085ec6` | yes | **yes** |
| **three.proton.js, RNG swap + portable maths** | `fbc66ad0` | `fbc66ad0` | `fbc66ad0` | yes | **yes** |

**Seeding, stepping and restoring:**
- **Seeding.** three.quarks has no seed. Swapping `Math.random` for the adapter's `sfc32` stream during create and step makes it repeatable. three-nebula needs only `setSeed`.
- **Manual stepping.** All of them can be stepped by hand. three.quarks uses `BatchedRenderer.update(1/60)`, three-nebula uses `system.update(1/60)` (avoid `tick()`, which runs on wall-clock time), and @newkrok needs a synthetic millisecond clock.
- **Restoring a frame.** The table below is in WKWebView, with 10.2k particles, restoring frame 450 after wandering off.

| Method | State equal | Pixels equal | Cost |
|---|---|---|---|
| three.quarks full snapshot (adapter-side copy of the particles plus emission state) | yes, bit-exact | **yes** | 5 ms to take, 4–5 ms to restore; 7.3 MB as JSON |
| three.quarks window restore (keep 4.3 KB of emission state per frame, re-simulate the last 100 frames with per-frame seeds) | yes, same set | **no**: particles return in a different pool order, so blending order differs | 42–50 ms |
| three.quarks re-simulate from frame 0 | yes | yes | 0.55–0.62 ms per frame (450 frames ≈ 250–280 ms) |
| three-nebula re-simulate from frame 0 | yes | yes | 1.25–1.44 ms per frame |
| stateless seek | yes | yes | ≈ 0 ms |

**What the adapter needs** (all prototyped in `src/libs/quarks.js`):
- its own RNG with copyable state (`src/core/rng.js`);
- the engine's fixed step, never a library's clock;
- `Math.random` and the ten transcendental functions swapped in during each step (`withRandom`, `withPortableMath`); this is safe because JS runs one thread;
- `scene.updateMatrixWorld()` before each step;
- full snapshots every N frames, with re-simulation forward from the nearest one;
- the library version pinned, because hashes change between versions.

### 2. Performance in WKWebView

CPU ms per simulation step, over 300 steps after 120 warm-up steps. Each configuration ran twice and only the second pass counts. The table uses the loopback origin, whose timer resolves 20 µs (the scheme origin's resolves about 1 ms). Draw calls are `renderer.info.render.calls` for the particles alone.

| Library | 1 emitter × 10k | 10 × 1k | 50 × 200 | Draw calls | Node (V8), 10 × 1k |
|---|---|---|---|---|---|
| **three.quarks** | 0.73 / p95 0.88 | 0.65 / 0.68 | 0.59 / 0.62 | **1** at every emitter count (batched by material) | 1.23 |
| three-nebula (`GPURenderer`) | 2.22 / 2.44 | 2.10 / 2.32 | 1.99 / 2.40 | 1 | 2.93 |
| stateless (GPU) | ≈ 0 | ≈ 0 | ≈ 0 | one per emitter (1 / 10 / 50; not batched in the spike) | ≈ 0 |
| three.quarks + portable maths | — | 0.66 / 0.70 | — | — | 1.06 |
| three-nebula + portable maths | — | 1.16 / 1.30 | — | — | 2.84 |
| three.proton.js (probe, 10 × 1k, `MeshRender`) | — | about 2.1 | — | one object (draw) per particle: 10k | 4.7 |

`render()` takes 0.04–0.05 ms of CPU for every library. GPU time was not measured. Portable maths makes three-nebula faster in JSC, which suggests JSC's native `sin` and `cos` are slow.

### 3. Anime look

The shots were rendered in WKWebView next to a VRM 1.0 VRoid model in MToon, at fixed frames (impact at frame 5, sparkles 150, speed lines 90, sweat drop 40). Every sprite comes from a procedural hard-edged atlas (`src/core/atlas.js`), so there are no soft gradients anywhere. They show a VRoid Hub model (spike-physics' `vroid10`), so they stay local and out of git (`.gitignore`); `mac/scripts/run.sh shots` makes them again (AB-T-0668).

- **three.quarks handles stylised, hard-edged effects well.**
  - Stretched billboards give speed-scaled spark streaks and speed lines.
  - Bezier size curves give the "pop in with overshoot" that emotes and glints need.
  - Additive and normal blending can be chosen per system.
  - Its soft particles, turbulence and noise also cover realistic smoke, which it was designed for.
- **The stateless kernel matched three.quarks shot for shot, with the crispest speed lines.** That is expected: anime FX are mostly ballistic, so closed-form motion is enough.
- **three-nebula made the weakest anime effects.**
  - Sparks render as round dots, because it has no stretched billboards.
  - The flash is capped at 511 px and doesn't scale with the pixel ratio.
  - Glints can't spin, because rotation is broken with atlases.
  - Its two-point A→B ramps can't do a pop-in overshoot.
  - It has no sweat drop or speed lines here, because neither fits point sprites.
  - Its strengths are organic motion (`CurlNoise`, `Vortex`), which matter less for anime looks.
- **Additive white blows out against a light sky in WebGL.** Under WebGPU, the same three.quarks effects came out less saturated (`shots/webgpu-*.png`). Check the colour pipeline before tuning looks.
- **Flat manga effects don't belong in particles.** Screen-space focus lines and impact frames are a post-processing or overlay job (PRD G20).

### 4. Authoring as plain JSON

- **three.quarks round-trips exactly.** Saving the seven effect systems and loading them back gives bit-identical simulation after 120 steps, in Node and in WKWebView.
  - The JSON is three.js Object format. It is 15 KB, or 1.9 MB with the atlas embedded as an image, so the scene format should reference textures by asset id and strip `images`.
  - There are two gotchas (6 and 7).
  - The quarks.art editor exports this same format.
- **three-nebula loads JSON but can't save it.** There is no `toJSON`, and textures are loaded by URL.
- **The stateless spec is plain JSON by construction:** 2.9 KB for all four effects.
- **Decision for the adapter:** keep VRMXG's own effect document (data first, schema in the registry) and compile it to three.quarks objects, rather than storing quarks JSON verbatim. quarks JSON stays the import path from quarks.art.

### 5. WebGPU smoke test

Under `WebGPURenderer` in WKWebView (`navigator.gpu` present, WebGPU backend), the unchanged three.quarks effect code ran through `three.quarks/webgpu` (impact, sparkles, speed lines), and three-nebula ran through `three-nebula/webgpu` (sparkles). See `results/wkwebview-webgpu.json` and `shots/webgpu-*.png`. The VRM was left out, because MToon needs its node material under WebGPU, which is out of scope here.

## Bugs and gotchas this spike found

1. **three-nebula `Rate` with a fractional count loops forever.** The loop is `for (; n--;)`, which never reaches zero, and the page runs out of memory. Use integer counts only. `Rate` also fires at most once per update and drops the remainder.
2. **three-nebula `Rotation(x, y, z)` throws with its default `useEmitterRotation = true`,** because `particle.parent` is null at init. It also takes fixed angles only, so there is no random start angle.
3. **three-nebula particles default to black.** Without a `Color` behaviour, additive particles are invisible.
4. **three-nebula `GPURenderer` has four traps:**
   - It draws `gl.POINTS`, capped at 511 px in WKWebView, and the size ignores the device pixel ratio.
   - It rotates UVs about the centre of the whole atlas rather than the tile, so rotation breaks once a system uses two textures.
   - Size is scale² × radius.
   - It stamps `texture.textureIndex` on first use, so **a texture shared with a second `GPURenderer` renders garbage** there. The pixel-scrub test caught this: same state, different pixels. Keep one texture cache per renderer.
5. **three-nebula velocities are in m/s, but `Force` and `Gravity` are scaled ×100** (Proton heritage).
6. **Saving a three.quarks emitter with `emitter.toJSON()` silently drops its materials and textures.** Serialise from a parent `Group` instead.
7. **three.js `toJSON` writes `object.matrix`, which stays stale until `updateMatrix()` runs.** An emitter rotated in code and saved before the first render loses its rotation. Call `scene.updateMatrixWorld()` first.
8. **three.quarks systems dispose themselves if the emitter's root isn't a `Scene`.** Outside a render loop (Node, offline export), nothing updates `matrixWorld`, so call `scene.updateMatrixWorld()` before each step.
9. **three.quarks `RectangleEmitter` fires outward within its own plane, not along its normal.** For a curtain of lines, use a `ConeEmitter` with angle 0. Stretched length follows Unity: `size × (lengthFactor + speedFactor × speed)`.
10. **`three.proton.js` calls `require('three')`, which bundles three's CJS build:** a second copy of three that calls `process.emitWarning` and crashes in the browser. Alias bare `three` to `three/build/three.module.js` (see `vite.config.js`).
11. **@newkrok/three-particles has three traps:**
    - Passing `externalNow = 0` falls back to `Date.now()`, because 0 is falsy.
    - Its default texture needs `document`.
    - Its peer range `^0.182` rejects r187.
12. **V8 and JSC disagree in the last bit** on `sin`, `cos`, `tan`, `atan2`, `acos`, `asin`, `exp`, `log`, `cbrt` and `hypot`. `pow` and `sqrt` matched on 200k samples. This is spike-physics gotcha 4, now measured, and it affects any library.
13. **A stretched billboard built on a mirrored axis flips the quad's winding,** and front-face culling then hides it. Keep the basis right-handed (`src/libs/stateless.js`).
14. **The sandboxed wrapper can only write inside its container.** `mac/scripts/run.sh` copies the results out.

## Run it

```bash
cd web && npm install && npm run dev            # http://127.0.0.1:5243 — interactive showcase
npm run test:node                               # the suite in Node; JSON to stdout (--save node writes results/node.json)
node scripts/summary.mjs ../results/*.json      # comparison tables
node scripts/bundle-size.mjs                    # min/gzip sizes -> results/bundle-size.json
mac/scripts/build.sh                            # web build + swiftc + ad hoc signed, sandboxed .app
mac/scripts/run.sh suite                        # suite via scheme, then loopback -> results/wkwebview-*.json
mac/scripts/run.sh shots                        # every library × effect next to the VRM -> shots/*.png
SPIKE_QUERY='webgpu=1' mac/scripts/run.sh shots # the WebGPU smoke test
SPIKE_QUERY='lib=stateless&effect=speedlines' mac/build/ParticlesSpike.app/Contents/MacOS/ParticlesSpike
```

Page query options:
- `?lib=quarks|nebula|stateless&effect=impact|sparkles|speedlines|sweatdrop`
- `?avatar=vroid10|vroid0x|spec`
- `?autorun=1` runs the suite (`&save=<name>` writes it through the dev server)
- `?shots=1`
- `?debug=1`

## Layout

| Path | What |
|---|---|
| `web/src/core/rng.js` | `sfc32` RNG with copyable state; `withRandom` swaps it into `Math.random` |
| `web/src/core/detmath.js` | Portable `sin`/`cos`/`tan`/`atan`/`atan2`/`asin`/`acos`/`exp`/`log`/`pow`/`cbrt`/`hypot` (fdlibm reductions, only IEEE-exact operations); `withPortableMath` |
| `web/src/core/atlas.js` | Procedural hard-edged sprite atlas: dot, glint, spark, flash, ring, line, sweat drop, diamond |
| `web/src/libs/quarks.js` | three.quarks adapter: seeding modes, portable maths, full and window snapshots, JSON round trip, benchmark emitter, four anime effects |
| `web/src/libs/nebula.js` | three-nebula adapter: benchmark emitter, impact and sparkles |
| `web/src/libs/stateless.js` | The hand-rolled closed-form GPU kernel (GLSL) and its JS twin, with four effects as JSON specs |
| `web/src/libs/probes.js` | Smoke probes for three.proton.js and @newkrok/three-particles |
| `web/src/tests.js` | Determinism, scrub, JSON and performance suite (Node and page) |
| `web/src/stage/stage.js` | VRM + MToon showcase stage; deterministic pose and effect placement |
| `web/src/webgpu.js` | WebGPU smoke test |
| `web/src/App.vue` | Modes: interactive, autorun (adds pixel-scrub and draw calls), shots, debug, WebGPU |
| `mac/` | The wrapper from spike-physics, renamed, plus PNG capture (`scripts/run.sh` copies out of the sandbox) |
| `results/` | `node.json`, `wkwebview-scheme.json`, `wkwebview-loopback.json`, `wkwebview-webgpu.json`, `bundle-size.json` |
| `shots/` | The WebGPU shots (no VRM in them); the per-effect PNGs and the contact sheet, which show a VRoid Hub model, are made here but not committed |

**Models:** `npm run models` copies them from `spike-physics/web/public/models/` into `web/public/models/`. That folder is git-ignored and must never ship. The VRoid models' licences require credit.

## Caveats

- **Coverage.** This is one machine (M5 Max, macOS 27.3). V8 was tested through Node only: Chromium was not run, because the shared browser pane is off limits. Cross-engine identity was checked on arm64 macOS only.
- **Timings.** They are CPU-side only. `render()` time is command submission, and GPU cost and fill rate were not measured. The scheme origin's 1 ms timer makes its p95 figures coarse.
- **Snapshots.** The three.quarks snapshot reads internal fields (`particles`, `emissionState`), so it can break on any upgrade. Upstream would need a supported state API, or the version stays pinned. 7.3 MB is JSON; a packed binary form would be about 1.6 MB.
- **Probes.** three.proton.js and @newkrok were probe-level only. @newkrok's live particle count and its GPU backend were not verified, so its 0.12 ms step is not comparable.
- **Effect authoring.** I wrote the effects in code with a procedural atlas, not in quarks.art, and tuned them for one camera. Treat the screenshots as capability checks, not art direction.
- **Stateless kernel.** It is not batched across emitters (one draw call each) and has no WebGPU path yet.

## What PRD §5.11 should say

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| GPU and CPU particles | `GPUParticles3D`, `CPUParticles3D`, `ParticleProcessMaterial` | **three.quarks** (MIT, pinned, WebGL now and `three.quarks/webgpu` later) behind the particle adapter; three-nebula is the fallback. Not three.proton (unmaintained since 2020, one draw per particle). Budget: 10k particles ≈ 0.7 ms CPU per step, 1 draw call per material (spike) | P1 |
| Determinism | not guaranteed | The adapter owns a seeded RNG, the fixed 1/60 s step and portable transcendental maths, all swapped in during each step. Result: bit-identical across V8 and JSC (spike). Snapshots every N frames plus re-simulation for scrubbing; a 10k-particle snapshot restores in 5 ms, pixel-exact | P1 |
| Effect documents | `ParticleProcessMaterial` resources | VRMXG's own JSON effect document (registry schema, textures by asset id), compiled to three.quarks; quarks.art JSON accepted as an import | P1 |
| Collision and attractors | `GPUParticlesCollision3D`, attractors | Collision through quarks' `ApplyCollision` resolver backed by Rapier queries; gravity, orbit, turbulence fields | P2 |
| Sub-emitters and trails | sub-emitters, trails | three.quarks sub-emitters and Trail mode | P2 |
| Anime effects | none | A built-in hard-edged FX library on the adapter: sparks, flashes, glints, speed lines, emotes and sweat drops. Optionally a closed-form "stateless" GPU kernel (TSL) for the zero-CPU, O(1)-scrub cases. Screen-space focus lines and impact frames go in post-processing (G20) | P1 |
