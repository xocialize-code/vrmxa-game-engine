# VRMXG physics spike

*2026-11-17. A throwaway spike that tests the [physics recommendation](../physics-engine-research.md) (Rapier behind an adapter, Jolt as fallback) in our real stack: Vue 3 + three r187 + `@pixiv/three-vrm` 3.5.5, inside a thin sandboxed WKWebView wrapper. Machine: M5 Max, macOS 27.3.*

## Verdict

**Rapier holds up, and the spike measured the WKWebView threading question.**

- **Determinism across browser engines works.** The same scripted 600 steps (300 boxes, a character, a hinged door, a sensor and a cloth) give **bit-identical state** in Node (V8), Chromium (V8) and WKWebView (JavaScriptCore), through both origins. This held for every Rapier build. Running the same build twice in one runtime always matched too.
- **Snapshot scrubbing works.** Restoring a snapshot into a new world and re-simulating 300 steps gives a bit-identical result, with and without the cloth. A snapshot of the full scene is 1.27 MB, takes about 2 ms to take and about 3.5 ms to restore.
- **Physics barely touches the frame budget.** The full scene costs 0.25–0.40 ms per step in WKWebView, about 2% of a 60 Hz frame.
- **The custom scheme blocks threads, measured.** Under `vrmxg-spike://`, WebKit reports `crossOriginIsolated: true` but **`SharedArrayBuffer` is still undefined**. Over loopback HTTP (`http://127.0.0.1:<port>`) with the same COOP/COEP headers, both are available, and Jolt's multithreaded build runs.
- **Jolt only catches up with threads.** Single-threaded Jolt is about 3× slower than Rapier on the same box scene. Jolt with 4 workers roughly matches Rapier's single-threaded SIMD build. Threads would only pay off in scenes far larger than ours.

## Results

All runtimes run the same suite (`src/sim/tests.js`). The raw JSON is in `web/results/`.

**State hashes** (FNV-1a over the raw float bits of every box, the door, the player and the cloth particles after 600 scripted steps):

| Build | Node (V8) | Chromium (V8) | WKWebView scheme (JSC) | WKWebView loopback (JSC) |
|---|---|---|---|---|
| `rapier3d-compat` (standard) | `44f6c2b6` | `44f6c2b6` | `44f6c2b6` | `44f6c2b6` |
| `rapier3d-deterministic-compat` | `44f6c2b6` | `44f6c2b6` | `44f6c2b6` | `44f6c2b6` |
| `rapier3d-simd-compat` | `aea7c548` | `aea7c548` | `aea7c548` | `aea7c548` |

In this scene the standard and deterministic builds agree. The SIMD build differs from them but matches itself everywhere. **Rule: pick one build per project and never mix them.** Saved snapshots and replays are only valid for the build that made them.

**Step time in WKWebView over loopback** (ms per step over 600 steps from step 0, including the pile collapse; loopback has the finer timer):

| | Full scene mean / p95 | No cloth mean / p95 | 300 boxes, all awake (first 60 steps) |
|---|---|---|---|
| Rapier standard | 0.37 / 0.68 | 0.34 / 0.64 | 0.31 |
| Rapier deterministic | 0.39 / 0.72 | 0.36 / 0.66 | 0.33 |
| Rapier SIMD | 0.26 / 0.62 | 0.22 / 0.44 | 0.22 |
| Jolt 1.1.1, single-threaded | — | — | 0.90 |
| Jolt 1.1.1, multithreaded, 4 workers | — | — | 0.18 |

**Origins in WKWebView** (sandboxed, macOS 27.3):

| | `isSecureContext` | `crossOriginIsolated` | `SharedArrayBuffer` | `performance.now()` resolution |
|---|---|---|---|---|
| Custom scheme `vrmxg-spike://app` + COOP/COEP | true | **true** | **undefined** | about 1 ms |
| Loopback `http://127.0.0.1:<port>` + COOP/COEP | true | true | available | about 20 µs |

**Other measurements:**
- Rapier `init()` takes about 15 ms in WKWebView. Jolt takes about 33 ms.
- Each `-compat` bundle is about 4.3 MB minified (1.7 MB gzipped), because the WASM is inlined. Jolt's is 3.6 MB (0.95 MB gzipped).
- The cloth (20×14 particles, top row pinned) adds about 0.3 ms per step while it settles, and about 0.02 ms after.

**Caveats:**
- This is one machine (M5 Max, macOS 27.3) and a modest scene. Determinism was checked across V8 and JSC on arm64 macOS only, not on Intel or iOS devices.
- Jolt's stack never fell asleep in this setup (about 210–290 of 300 boxes still awake at step 600; I didn't tune its sleep settings), so its 600-step mean is pessimistic. Compare the "all awake" column instead.
- Chromium timings are omitted: the browser pane was hidden and throttled while the suite ran.

## Bugs and gotchas this spike found

1. **The character controller collides with sensors by default.** Pass `QueryFilterFlags.EXCLUDE_SENSORS` to `computeColliderMovement`, or the player stops at the edge of every trigger volume.
2. **Sensors don't see kinematic bodies by default.** A sensor on a fixed body needs `ActiveCollisionTypes.DEFAULT | KINEMATIC_FIXED`, or the kinematic player never registers.
3. **VRM 0.x models walk backwards** if you write `vrm.scene.rotation`, because that undoes `VRMUtils.rotateVRM0`. Put position and facing on a parent group.
4. **Keep simulation input free of `Math.sin`/`cos` and other transcendental functions.** They aren't guaranteed to round the same way in V8 and JSC. The level is generated from integer hashes and quantised heights, and the scripted directions are written out as literals. The physics engine is deterministic, so anything that feeds it must be too.
5. **Rapier handles are bit-cast floats.** Printing one gives values like `5.7e-322`. Use them as keys, never display them.
6. **Jolt's multithreaded build needs `worker: { format: 'es' }` in Vite**, because it spawns itself as a module worker with top-level await.
7. **Boundaries:** without walls round the edge, a character walks off the level and falls forever. Use walls, plus a respawn as a safety net.

## Run it

```bash
cd web && npm install && npm run dev          # http://127.0.0.1:5230 — interactive stage
```

Query options: `?variant=deterministic|standard|simd`, `?avatar=spec|vroid10|vroid0x`, `?autorun=1` (the test suite; `&save=<name>` writes `results/<name>.json` via the dev server, `&jolt=0` skips Jolt).

```bash
cd web && npm run test:node                   # the suite in Node; JSON to stdout
node scripts/summary.mjs results/*.json       # the comparison table
mac/scripts/build.sh                          # web build + swiftc + ad hoc signed, sandboxed .app
SPIKE_AUTORUN=1 mac/build/PhysicsSpike.app/Contents/MacOS/PhysicsSpike   # suite via scheme, then loopback
SPIKE_QUERY='avatar=vroid0x' mac/build/PhysicsSpike.app/Contents/MacOS/PhysicsSpike
SPIKE_ORIGIN=loopback mac/build/PhysicsSpike.app/Contents/MacOS/PhysicsSpike
```

**Stage controls:** WASD or the arrow keys move, Space jumps, drag orbits the camera, the wheel zooms. Clicking a box casts a Rapier ray and pushes it. Walking into the green volume opens the door.

## Layout

| Path | What |
|---|---|
| `web/src/sim/level.js` | The level as plain arrays (ground trimesh, walls, stairs, ramp, door, cloth, box layout, scripted input). Integer and quantised arithmetic only. |
| `web/src/sim/rapier-scene.js` | The Rapier world: character controller, door on a revolute joint with a motor, sensor, cloth soft body, snapshot and restore, state vector. No three.js. |
| `web/src/sim/jolt-scene.js` | The same box scene on Jolt, single- or multithreaded, for step timing. |
| `web/src/sim/tests.js` | Repeatability, cross-runtime hashes, snapshot scrub, timing, environment report. |
| `web/src/stage/stage.js` | three.js stage: fixed-step loop, the VRM on the capsule (idle/walk `.vrma`, spring bones stepped at 1/60 s), camera, ray-cast poke. |
| `web/src/App.vue` | HUD, autorun report, wrapper bridge. Rapier objects are kept out of Vue's reactivity (`markRaw` / `shallowRef`). |
| `mac/Sources/` | The wrapper: `SchemeHandler` (custom scheme + COOP/COEP), `LoopbackServer` (Network.framework HTTP on 127.0.0.1), `main.swift` (window, autorun across both origins). |
| `web/results/` | Raw results: `node.json`, `chromium-pane.json`, `wkwebview-scheme.json`, `wkwebview-loopback.json`. |

**Models:** `npm run models` copies them into `web/public/models/`, which is not in git and must never ship:
- `spec.vrm`, from `VRMXA_Specification`.
- Two VRoid Hub models from the local dataset: `9096495490126901469` (VRM 1.0) and `1020331055235827291` (VRM 0.x). Their licences allow modification and corporate use, with credit required.
- The idle and walk `.vrma` motions, from `vrmxa-avatar-studio`.
