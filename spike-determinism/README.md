# VRMXG character determinism spike

*2026-11-17. A throwaway spike that asks whether the **character** side is as deterministic as the physics side ([spike-physics](../spike-physics/README.md)): `.vrma` playback through three's `AnimationMixer` (crossfades, blend weights), three-vrm spring bones on a walking character, VRM lookAt and expressions, and snapshot / restore. Stack: three r187 + `@pixiv/three-vrm` 3.5.5 + `@pixiv/three-vrm-animation` 3.5.5, in Node (V8), headless Chromium (V8) and the sandboxed WKWebView wrapper (JavaScriptCore), fixed 1/60 s step. Machine: M5 Max, macOS 27.3.*

## Verdict

> **2026-11-17, AB-T-0500:** the maths module is now the engine package [`engine/packages/dmath`](../engine/packages/dmath/README.md) (`@vrmxg/dmath`, receipt AB-R-0931). `web/src/char/dmath.js` is a re-export of it, so the suite runs on the engine module; the numbers below are from the original port. Re-run on the merged module, every `dmath`-mode hash is unchanged (all four runtimes).

**Out of the box the character side is not deterministic across engines. A ~200-line pure-arithmetic math shim makes it bit-identical in Node, Chromium and WKWebView, at no measurable cost.**

- **Native: not bit-identical across engines, and not even between two V8s.** With the stock libraries, Node 26 (V8 14.6), Chromium 156 (V8) and WKWebView (JSC) all disagree with each other. The mixer diverges at **step 121**, the first step of the first crossfade, on all four test models. With a lookAt target, lookAt diverges from **step 1–4** and the pose from step 4–5. The cause is `Math.sin/cos/acos/asin/atan/atan2` (and `exp`, `log`, `hypot`, `cbrt`, `sinh` …), which round differently between any two of the three runtimes in 3–19% of inputs for the trig functions the libraries use, and up to 40% for `tan` and `hypot` (always ≤1–2 ulp). Only `+ - * /`, `Math.sqrt` and (on these inputs) `Math.pow` agree.
- **The divergence is invisible but real.** After 10 s the bone world matrices differ by at most **1.4e-13 m** and spring tails by 1.6e-14 m. Spring bones damp it, so it does not grow; two of four models even return to the same bits by step 600. But hashes, replays and "re-render from frame N" checks fail, and any pose that feeds physics contacts could amplify it.
- **Where it comes from (measured per call site):** `Quaternion.slerpFlat` takes its `acos`/`sin` branch whenever two quaternions are more than ~3.6° apart, which is about 14 times per step during crossfades (8,370 of 55,900 slerps over the shot; keyframe-to-keyframe slerps of a 30 fps clip take the nlerp branch and are exact). VRM lookAt uses `atan2` (`calcAzimuthAltitude`) and `sin`/`cos` (`Quaternion.setFromEuler` in the bone applier). Spring bones themselves use only `+ - * / sqrt`; they diverge only because their input pose does.
- **Fix that works: `dmath`**, a port of FreeBSD msun's `sin/cos/tan/asin/acos/atan/atan2` to plain double arithmetic (`web/src/char/dmath.js`), installed over `Math.*` before the VRM is loaded. With it, **all 4 models × 4 scenarios × 600 steps × 4 state components are bit-identical in all four runtimes** (Node, Chromium, WKWebView scheme and loopback). It agrees with native to ≤1 ulp. Per call it is 1–3.5× slower than native in JSC (sin 9 ns vs 3 ns), but a character makes only ~1,000–1,800 such calls per step (most of them three's `Euler` sync, which feeds nothing), so the character step cost is **unchanged within noise** (±10%, either sign).
- **Fix that half-works: nlerp** instead of slerp in `Quaternion.slerpFlat`. It makes the mixer and spring bones identical everywhere, but lookAt still diverges from step 1, and it changes how crossfades look. Not recommended.
- **"Deterministic within one engine" already holds, but only per engine build.** Two fresh runs in the same runtime were identical at every step in every runtime, mode and model. WKWebView over the custom scheme and over loopback (same JSC) were identical. Rendering between steps (`updateMatrixWorld` at 60 Hz, at 24 fps or never) never changed the simulation. But Node's V8 and Chromium's V8 differ from each other, so "same engine" means the same engine *build*: a macOS update can change JSC or libm under a saved shot.
- **Snapshot / restore works, but three-vrm exposes nothing for it.** Restoring into the same instance or into a freshly loaded character at steps 130 (mid-crossfade), 300 and 430 (mid-warped crossfade) re-simulated bit-identically, every step to 600. It needs private fields: spring joints' `_currentTail` / `_prevTail`, lookAt `_yaw` / `_pitch`, and either the mixer's internals or (better) a stateless timeline driver. It also needs every node's local transform, not just the spring tails: restoring only the root, the tails and the mixer diverges on the very next step. A snapshot is 26 KB (spec, 4 springs) to 44 KB (VRoid, 106 springs) as local TRS, and takes 0.05–0.2 ms to take or restore.
- **Crowds:** in WKWebView one VRoid character with 106 spring joints costs about **0.10 ms** per step for mixer + `vrm.update`, plus about 0.045 ms of matrix work a render adds. 20 such characters cost about **3 ms** per step (18% of a 60 Hz frame) before GPU skinning. The 4-joint spec avatar costs a third of that.

## Recommended determinism boundary (PRD §9 question 7)

**Inside** (bit-identical across engines, snapshot-able, part of a shot's replay):
- Physics (Rapier deterministic build; settled by spike-physics).
- Animation sampling and blending: clip times, weights, crossfades, the blend tree, `AnimationMixer` output — **with `dmath` installed**.
- Spring bones (`vrm.update(1/60)`), node constraints, the humanoid normalized → raw copy.
- LookAt (yaw / pitch and the bone or expression it drives) and expression weights, including morph target influences.
- Character root motion and anything else the step derives from input.
- Rule for all of it: only `+ - * /`, `Math.sqrt`, `floor/round/trunc/abs/min/max/sign`, `Math.imul`, integer hashing and the `dmath` functions. No `Math.pow`, `**`, `exp`, `log`, `hypot`, `cbrt`, `Math.random`, wall-clock time, or reading `Object3D.rotation` (an Euler derived through native `asin`/`atan2`).

**Presentation only** (may differ per engine, never fed back into the step):
- Rendering, skinning (`skeleton.update`, GPU), interpolation between steps for display rate, cameras that only look.
- MToon UV animation and other material animation (`vrm.update` calls `Texture.updateMatrix`, which uses native `sin`/`cos`; it feeds nothing).
- three's `Object3D.rotation` Euler mirror.
- UI, audio playback timing, particles unless seeded and stepped (P1 in §5.11).

## Results

All runtimes run the same suite (`web/src/char/suite.js`). Raw JSON is in `results/`. Every comparison is per step, over 600 steps, of four FNV-1a hashes over the raw float64 bits: the normalized pose (mixer output), every bone's world matrix plus the character root, every spring joint's current and previous tail, and expression weights + morph influences + lookAt yaw/pitch. World matrices are recomputed by the observer into a scratch buffer, so observing never touches the scene.

**The shot** (10 s): idle; at step 120 a 0.5 s crossfade to walk (`timeScale` 1.1); at 300 a run layer at weight 0.35 over walk at 0.65; at 420 a 0.4 s *warped* crossfade to wave while walk fades out; at 510 a crossfade back to idle. The parent group walks a curved path (1.2–2 m/s, two turns). A lookAt target sweeps side to side. A face clip drives `happy` and `ou` through the mixer; `blink` and `aa` are set directly each step. Every input is a closed-form function of the step index built from arithmetic, `sqrt` and integer hashing, so the inputs are bit-identical everywhere.

**Scenarios:** `mixer` (question 1: mixer + `humanoid.update()` only), `springs` (question 2: + `vrm.update(1/60)` and the walking parent), `full` (question 3: + lookAt target and expressions), `timeline` (`full` with a stateless driver that sets each action's time and weight from the step index and calls `mixer.update(0)`).

**Models:** `spec` (VRMXA base, VRM 1.0, 4 spring joints, bone lookAt), `vroid10` (VRoid, VRM 1.0, 106 joints, 28 colliders), `vroid0x` (VRoid, VRM 0.x, 43 joints, 22 colliders), `seed` (Seed-san sample, VRM 1.0, 19 joints, 23 node constraints, expression lookAt).

### Cross-engine: first step where Node, Chromium and WKWebView disagree

"identical" = all 4 models, all 600 steps, all 4 state components, in Node, Chromium, WKWebView scheme and WKWebView loopback.

| Scenario | native `Math` | nlerp instead of slerp | **dmath shim** |
|---|---|---|---|
| `mixer` (Q1) | pose from **step 121** (all models) | identical | **identical** |
| `springs` (Q2) | pose 121, spring tails 125–312 | identical | **identical** |
| `full` (Q3) | lookAt/expressions from **step 1–4**, pose from 4–5 (Seed-san, whose lookAt drives expressions: 121); spring tails 125–312 | lookAt/expressions from step 1–4 | **identical** |
| `timeline` | from step 1–6 | from step 1–6 (lookAt) | **identical** |

The per-model, per-component table is in `results/compare.md` (generated by `compare.mjs`). Within each runtime, two fresh runs were identical at every step for every model, mode and scenario.

### Which `Math` functions differ (2000 inputs each; inputs that differ from Node)

| Function | Chromium 156 (V8) | WKWebView (JSC) |
|---|---|---|
| `sin` / `cos` / `tan` | 68 / 79 / 87 | 93 / 101 / 812 (≤2 ulp) |
| `asin` / `acos` | 128 / 134 | 169 / 346 |
| `atan` / `atan2` | 149 / 387 | 143 / 386 |
| `exp` / `log` / `cbrt` | 179 / 81 / 166 | 179 / 79 / 229 |
| `hypot` | 0 | 714 (≤2 ulp) |
| `sinh` / `cosh` / `tanh` | 163 / 154 / 239 | 551 / 442 / 239 |
| `pow` / `sqrt` | 0 / 0 | 0 / 0 |
| `dmath.*` (all six) | 0 | 0 |

All differences are ≤1 ulp unless marked. Chromium and WKWebView also differ from each other (`sin` 81, `acos` 284, `hypot` 714 inputs) but happen to agree on `exp` and almost all of `atan2`. `pow` agreeing here is luck, not a guarantee: the spec leaves it implementation-defined too.

### How big the native divergence is (max |difference| vs Node)

| Model | Step 450 (bone matrices / spring tails) | Step 600 |
|---|---|---|
| spec | 4.9e-14 / 3.1e-15 | 5.6e-15 / 4.4e-16 (Chromium: 0 / 0) |
| vroid10 | 1.2e-13 / 1.6e-14 | 1.4e-13 / 8.0e-15 |
| vroid0x | 9.2e-14 / 8.9e-15 | 6.1e-14 / 3.6e-15 |
| seed | 5.2e-14 / 3.6e-15 | 0 / 0 |

Metres, worst of Chromium and WKWebView. The `mixer` scenario's state is exactly equal again at 450 and 600 (single-clip segments take the exact nlerp branch), even though it differed in between.

### Snapshot / restore (Q4)

A straight run to step 600, against a restore at step N followed by re-simulation, compared at **every** step after N. Same result in all four runtimes, for `spec` and `vroid10`, with the crossfade driver and the timeline driver.

| Restore | From 130 (mid-crossfade) | From 300 | From 430 (mid-warped crossfade) |
|---|---|---|---|
| Same instance, scrubbed back from 600 | identical | identical | identical |
| Fresh instance, full (TRS + `matrix` + `matrixWorld` of every node) | identical | identical | identical |
| Fresh instance, local TRS of every node, matrices recomputed | identical | identical | identical |
| Fresh instance, root + spring tails + mixer only | differs at 131 | differs at 301 | differs at 431 |
| Fresh instance, root + mixer, tails not restored | differs at 131 | differs at 301 | differs at 431 |

| | spec (4 joints) | vroid10 (106 joints) |
|---|---|---|
| Snapshot size, full / TRS only (raw float64) | 62 / 26 KB | 125 / 44 KB |
| of which spring tails / mixer | 0.2 / 10.5 KB | 5.0 / 10.5 KB |
| Take / restore (WKWebView loopback) | 0.05–0.12 / 0.09–0.15 ms | 0.06 / 0.12 ms |

A keyframe every 30 steps for a 2-minute shot is 240 snapshots: about 6–11 MB per character as TRS.

**What has to be in a character snapshot**, and how three-vrm 3.5.5 exposes it:

| State | Where | Public API? |
|---|---|---|
| Spring Verlet state | `VRMSpringBoneJoint._currentTail`, `._prevTail` (Vector3, in center space) | No. TypeScript-private but plain properties, so readable and writable without vendoring. `reset()` / `setInitState()` are public but only rebuild the rest state |
| Every node's local TRS | `position` / `quaternion` / `scale`; spring bones run with `matrixAutoUpdate = false`, so recompute their `matrix` with `updateMatrix()` | Yes (three) |
| Hidden carry-over in node state | lookAt reads the head's `matrixWorld` left from the previous step (a one-step lag); eye normalized bones are written once and then left; spring length reads the child's previous `matrixWorld` | — this is why TRS of *every* node is needed |
| LookAt | `VRMLookAt._yaw`, `._pitch`, `._needsUpdate` (yaw/pitch have public getters/setters) | Partly |
| Expressions | `VRMExpression.weight` per expression; morph influences are recomputed each update | Yes |
| Mixer, stateful driver | `mixer.time`, `_accuIndex`; per action `time`, `weight`, `timeScale`, `_loopCount`, `_startTime`, `_effectiveWeight`, `_effectiveTimeScale`, fade and warp interpolants (`_weightInterpolant`, `_timeScaleInterpolant`, from `_lendControlInterpolant()`), the **active order** (`_actions[0.._nActiveActions)`, which is the summation order), and every `PropertyMixer.buffer` (it holds the "original" value a blend with total weight < 1 mixes towards, saved at activation) | No: all three internals |
| Mixer, timeline driver | Nothing: every action plays from load at weight 0, so each PropertyMixer saves its original (rest) value once; time and weight are set from the step index each step | — |

### Render cadence

`full` scenario, `spec` and `vroid10`, in every runtime: calling `scene.updateMatrixWorld()` after every step (a 60 Hz render), only on 24 fps frames, or never gave identical hashes at every step. three-vrm recomputes the world matrices it reads (the spring manager updates the ancestors of every joint), and the ones it reads stale are the same bits a render would write. So offline export at 24 fps and live preview at 60 Hz simulate the same shot.

### Step cost in WKWebView (questions on crowd size)

Dedicated runs (`parts=timing,micro`, a fresh page, `results/wkwebview-timing-*.json`). "Wall" is one interval over 600 steps divided by 600, covering every character's driver + `mixer.update` + `vrm.update(1/60)` **plus** `scene.updateMatrixWorld()` + `skeleton.update()` (the CPU matrix work a render adds). No GPU work. `sim per char` is the mixer + `vrm.update` part alone.

| Model | N | Wall per step, scheme / loopback (ms) | Sim per char (ms) | With dmath, wall scheme / loopback |
|---|---|---|---|---|
| spec, 4 joints | 1 | 0.06 / 0.05 | 0.03–0.04 | 0.06 / 0.05 |
| | 5 | 0.26 / 0.21 | 0.03 | 0.23 / 0.22 |
| | 20 | 1.14 / 0.85 | 0.03–0.04 | 1.13 / 0.87 |
| vroid10, 106 joints | 1 | 0.15 / 0.14 | 0.10 | 0.14 / 0.14 |
| | 5 | 0.78 / 0.69 | 0.10–0.11 | 0.79 / 0.70 |
| | 20 | 3.89 / 2.95 | 0.10–0.13 | 3.09 / 3.16 |

Without COOP/COEP (`SPIKE_COI=0`) the numbers are the same (vroid10 ×20: 2.83 / 3.08 ms). Cost is linear in characters and roughly linear in spring joints. Read it as about **0.15 ms per VRoid-class character per step** including matrices, so 20 characters take about 3 ms of the 16.7 ms frame and 50 would take about 7.5 ms before rendering. JSC is the fastest of the three here: the same vroid10 ×20 step takes 8.8 ms wall in Node and 7.0 ms in headless Chromium against about 3 ms in WKWebView (`results/compare.md`). The full-suite WKWebView runs agree with the dedicated runs (vroid10 ×20: 3.2 ms scheme, 3.0 ms loopback).

`dmath` per call in JSC (ns, native → dmath): sin 3 → 9, cos 5 → 8.5, acos 4 → 12, asin 10 → 9, atan 9 → 6.5, atan2 10 → 13. Calls per character step, counted: 270–500 `asin` and 540–990 `atan2` (all from three's `Euler` mirror on every quaternion write), 14–33 `acos` and 40–150 `sin` (slerp branch, lookAt), 60–80 `cos` (lookAt `setFromEuler`, MToon UV transforms). At ~10 ns extra per call that is ≤15 µs per character step, below the noise of the measurements.

## Engine design consequences

1. **Install `dmath` at engine boot, before any VRM or clip is parsed**, in every app (editor, game, anime creator) and in Node tooling. Then a shot previewed in the editor's WKWebView and rendered in Chromium, or the reverse, simulates bit-identically. A global `Object.assign(Math, …)` is what the spike measured; it is the cheapest route and the shim is accurate enough for UI code too. A later hardening option is a Vite transform that rewrites `Math.sin(` etc. inside `three` and `@pixiv/*` to imports, so nothing depends on a global being patched in time.
2. **Pin exact versions** of `three`, `@pixiv/three-vrm*`, `dmath` and Rapier per project, like the Rapier build. Any change to library arithmetic changes the bits. Saved snapshots and replays name the versions that made them.
3. **Drive the mixer statelessly from shot time** (an engine animation graph that computes each action's time and weight from the step index, with `mixer.update(0)`), rather than `mixer.update(dt)` with scheduled fades. Both restore bit-exactly, but the stateless driver needs no mixer internals in the snapshot, cannot accumulate float time differently (`(k − k0)·dt` instead of a running sum), and makes scrubbing to any frame a pure function of the timeline plus the spring state. Keep every action playing from load (weight 0 when unused) so `PropertyMixer` never re-saves its "original" value mid-shot.
4. **Spring bones need an engine-owned state API.** three-vrm has no `getState` / `setState`. The fields are reachable today, so vendoring is not strictly required for snapshots, but the PRD already vendors the VRM libraries (principle 2): add `VRMSpringBoneManager.getState()/setState()` (tails in sorted-joint order) to the vendored copy, and upstream it if pixiv takes it, rather than reaching into `_currentTail` from engine code.
5. **A character snapshot is node TRS + spring tails + lookAt yaw/pitch + expression weights + animation-graph state.** Restoring only the tails is not enough; the scene graph carries a one-step lag (lookAt reads last step's head matrix). Restore TRS, `updateMatrix()` on `matrixAutoUpdate = false` nodes, then `scene.updateMatrixWorld(true)`.
6. **Feed the step only deterministic input:** quantized or integer-hashed values, literal directions, step indices. This is the same rule spike-physics found for Rapier; it now covers the character too.
7. **Keep presentation out of the step.** Interpolating render transforms between steps, cameras, MToon UV animation and Euler readouts must never write back into simulated state.

## Gotchas this spike found

1. **Two V8s disagree.** Node 26 and Chromium 156 round `sin`, `cos`, `exp`, `atan2` … differently. "Same engine family" is not a determinism boundary.
2. **A final-state hash can lie.** Spring damping and exact single-clip sampling bring diverged runs back to identical bits (`seed` and `spec` at step 600, `mixer` everywhere). Compare per step.
3. **`Quaternion.slerpFlat` switches algorithm at dot = 0.9995.** Keyframe interpolation of a 30 fps clip is almost always on the exact nlerp side; crossfades and blends are on the `acos` side. A test that only plays one clip will wrongly look deterministic.
4. **Every quaternion write runs native `asin` + 2× `atan2`** to update `Object3D.rotation`. Harmless while nothing reads `.rotation`, and the bulk of the transcendental calls per step.
5. **`PropertyMixer` mixes towards an "original" value** saved when a binding becomes active, whenever the active weights sum to less than 1, and float weights often sum to 0.9999999999999999. Stopping and replaying an action re-saves that value from the current pose.
6. **The mixer's active-action order is the summation order.** It depends on the history of `play()` / `stop()` calls; a restore must replay activations in the snapshot's order.
7. **`createVRMAnimationClip` adds a `VRMLookAtQuaternionProxy` node to `vrm.scene`** (with a console warning) if none exists. Add it yourself before collecting nodes, or snapshots taken before and after the first clip have different node lists.
8. **WKWebView step times varied 2–3× between launches** in the full-suite runs, including the pure-arithmetic microbenchmark, while the dedicated timing runs were consistent. The cause was not isolated; it looks like the web content process being scheduled at a lower QoS (the wrapper's `beginActivity` only covers the app process). Offline renders should keep the window frontmost and should not trust a single timing run.

## Run it

```bash
cd web && npm install                         # exact versions, see below
npm run models                                # copies the models and clips into public/models (never commit or ship)
npm run test:node -- --out ../results/node.json
npm run test:chromium                         # Playwright's headless Chromium against Vite on 127.0.0.1:5241
node scripts/compare.mjs ../results/node.json ../results/chromium.json ../results/wkwebview-scheme.json ../results/wkwebview-loopback.json > ../results/compare.md
npm run dev                                   # http://127.0.0.1:5241 — the viewer; ?model=spec|vroid10|vroid0x|seed&mode=native|dmath|nlerp
                                              # ?autorun=1[&parts=…&models=…&save=<name>] runs the suite in the page

mac/scripts/build.sh                          # web build + swiftc + ad hoc signed, sandboxed .app
SPIKE_AUTORUN=1 mac/build/DeterminismSpike.app/Contents/MacOS/DeterminismSpike
#   runs the suite through vrmxg-dspike://app, then http://127.0.0.1:<port>; JSON lands in
#   ~/Library/Containers/com.xocialize.vrmxg-determinism-spike/Data/tmp/ (the app is sandboxed)
SPIKE_AUTORUN=1 SPIKE_NAME=timing SPIKE_QUERY='parts=timing,micro&models=spec,vroid10' mac/build/…/DeterminismSpike
SPIKE_COI=0 …                                 # serve without COOP/COEP
SPIKE_ORIGINS=loopback …                      # only one origin
```

Suite parts: `fingerprint`, `determinism`, `cadence`, `snapshot`, `calls`, `timing`, `micro`. A full run takes about 30 s in Node or Chromium and about 2 minutes per origin in WKWebView.

**Pinned versions:** `three` 0.187.0, `@pixiv/three-vrm` 3.5.5 (with `-core`, `-springbone`, `-node-constraint` 3.5.5), `@pixiv/three-vrm-animation` 3.5.5, `vue` 3.5.45, `vite` 8.3.8, `@vitejs/plugin-vue` 6.0.11, `playwright-core` 1.64.1 (uses the cached Chromium 156.0.8078.4, revision 1248). Node 26.12.1 (V8 14.6.202.34). WKWebView: macOS 27.3 system WebKit.

## Layout

| Path | What |
|---|---|
| `web/src/char/dmath.js` | The deterministic `sin/cos/tan/asin/acos/atan/atan2` and `installDMath()` / `uninstallDMath()`. |
| `web/src/char/character.js` | One character: the scripted shot (crossfade and timeline drivers), walking parent, lookAt target, expressions, the observed state vector, `snapshot()` / `restore()` including the mixer internals. No rendering. |
| `web/src/char/load.js` | Parses `.vrm` / `.vrma` from an ArrayBuffer, the same way in Node and browsers (textures stubbed for the tests). |
| `web/src/char/suite.js` | Modes (native, dmath, nlerp), scenarios, math fingerprint, per-step hashing, cadence, snapshot tests, call counts, timing, microbenchmark. |
| `web/src/App.vue`, `web/src/viewer.js` | `?autorun=1` test page; otherwise a WebGL viewer of the shot with real textures. |
| `web/scripts/` | `node-tests.mjs`, `chromium-tests.mjs`, `compare.mjs` (Markdown tables), `copy-models.mjs`. |
| `mac/` | The physics spike's wrapper, renamed: `SchemeHandler` (custom scheme + COOP/COEP, `SPIKE_COI=0` drops them), `LoopbackServer`, `main.swift` (autorun across origins, `SPIKE_ORIGINS`, `SPIKE_NAME`). |
| `results/` | `node.json`, `chromium.json`, `wkwebview-scheme.json`, `wkwebview-loopback.json` (full suite); `wkwebview-timing-{coi,nocoi}-{scheme,loopback}.json` (dedicated timing runs); `compare.md` (all tables, generated). |
| `shots/` | Viewer screenshots from headless Chromium (one per model, mid-walk). |

**Models and clips** (`npm run models`; `web/public/models/` is git-ignored and must never ship): `spec.vrm`, `vroid10.vrm`, `vroid0x.vrm` copied from spike-physics (VRoid Hub models 9096495490126901469 and 1020331055235827291; modification and corporate use allowed, credit required); `seed-san.vrm` from `vrm-specification/samples` (VRM Public License 1.0, VirtualCast, Inc.); `idle`, `walk`, `run_b`, `wave_b` `.vrma` from `vrmxa-core/assets/motions/kimodo`.

## Caveats

- One machine (M5 Max, macOS 27.3, arm64). Not tested on Intel, iOS or Safari proper; Safari uses the same JSC as WKWebView on a given macOS, so it should match it, but that is unverified.
- `dmath` makes the libraries' transcendental calls identical; it does not cover `exp`, `log`, `pow`, `hypot` or `cbrt`, which three and three-vrm don't call during a step (counted) but engine code might. Arguments above about 2^20·π/2 use a simplified range reduction (deterministic, less accurate).
- 600 steps, one scripted shot per model, four models. VRM 0.x and 1.0, bone and expression lookAt, colliders, centered springs and node constraints are covered. The `VRMC_springBone_limit` and extended-collider extensions are not (none of the models use them).
- Timing excludes GPU skinning and rendering. The scheme origin's timer has 1 ms resolution, so its per-step p95 values are meaningless; use the wall-per-step column.
- The `nlerp` mode only replaces `Quaternion.slerpFlat` (the mixer path), not `Quaternion.slerp` (node constraints) or lookAt.
