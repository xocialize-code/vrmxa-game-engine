# @vrmxg/snapshot

M0 W6 (AB-T-0507). One snapshot of a whole world, per-step hashes, and the harness that proves a scene replays
bit-identically in Node, Chromium and WKWebView.

```js
import { captureWorld, restoreWorld, recordRun, compareRuns, assertSameRun } from '@vrmxg/snapshot';
const snap = captureWorld(tree, { meta: { scene: 'cafe' } }); // plain data: structuredClone / postMessage carry it
restoreWorld(freshTree, snap);                                 // a tree instantiated from the same scene, same services
const run = recordRun(tree, 600, { physicsBytesEvery: 60 });   // [{ step, h: { component: hash } }]
assertSameRun(runA, runB, 'Node and WKWebView');               // throws: "… diverge at step 201 in node:mira (and …)"
```

| Piece | What |
|---|---|
| `captureWorld` | `tree.getState()` (clock, random streams, timers, every node's transform, props, behaviour params and state, state machine), every service's state (physics as Rapier's bytes plus its behaviours, input's latched frame, the current camera) and every node with its own state (characters: pose, springs, look-at, expressions, locomotion graph, controller; cameras: rig and preset). Versions or anything else go in `meta` |
| `restoreWorld` | Restores onto a tree freshly instantiated from the same scene. Code isn't data: a timer created at run time can't come back, and restoring says so (as it does for a node or behaviour the tree doesn't have), before changing anything. An input recording being replayed isn't in the snapshot: replay it again after restoring (its cursor is the clock's step) |
| `worldHashes` | One 64-bit hash per component: `clock`, `rng`, `timers`, `node:<id>` (core record), `state:<id>` (a node's own state), `physics` (every body's pose; `physics:bytes`, Rapier's whole serialisation, on request), `service:<name>`. Numbers hash by their float64 bits (bit-identical is the requirement) |
| `recordRun`, `compareRuns`, `assertSameRun` | Step and hash; compare two runs and name the first step and the components that differ there |

Tests (`npm test`, no models needed, so they run on CI): the cafe's doors, a kinematic walker the recorded input
drives, a behaviour with a random stream and a repeating timer, a follow camera. A 10 s run hashes identically twice;
a snapshot at step 300 restored into a fresh world (and a structured clone of it) re-simulates to 600 identically; a
Math.random slipped in at step 200 is named at step 201; restoring refuses a run-time timer and another scene.

## The harness (`harness/`)

The cafe (`cafe.vrmxs`: the core fixture's cafe with a floor and walls standing in for its set) with Mira as the player
(the avatar inside vrmxa-core's `full.vrmxa`), Hana wandering on her own random stream (`spec.vrm`), the locked side door
and the double entrance door on hinges, and a follow camera, driven by `input.json`: 600 recorded frames of keyboard,
mouse, gamepad stick and buttons. Both entrance doors open and close, Mira jumps twice and the camera switches preset.
`world.js` is the one module every runtime runs.

```sh
cd engine/packages/snapshot/harness
node make-assets.mjs            # models, clips, scene and input into public/models (git-ignored)
node record-input.mjs           # only to re-record input.json (committed)
node node-run.mjs               # results/node.json            (--inject 200: a Math.random from step 200)
npx vite build && node chromium.mjs   # results/chromium.json  (--inject 200)
./wkwebview.sh                  # results/wkwebview-{scheme,loopback}.json (needs spike-cinematics/mac/build)
node compare.mjs                # every runtime against Node; exit 1 naming the first step and components
```

**Result (AB-R-0941, 2026-11-17, M5 Max).** Every step of all 600, all 40 components, is identical in Node, headless
Chromium 156, and WKWebView over the custom scheme and over loopback; final world hash `db46e5d51c815425`. In every
runtime the snapshot taken at step 300 hashes as step 300 did once restored, and re-simulates to 600 identically. The
injected Math.random is reported as diverging at step 201 in `node:mira` (with `node:cam`, `state:mira`, `state:cam`,
`physics`) in Node, Chromium and WKWebView.

**Budget.** The cafe plus 18 VRoid-class NPCs (106 spring joints each), 20 characters with physics, doors and controllers,
480 timed steps: **1.92 ms per step in WKWebView over loopback** (p95 2.28, max 2.58) against M0's 5 ms. Snapshot capture
1.04 ms, restore 3.19 ms. Chromium 3.65 ms and Node 4.35 ms: JSC runs this about twice as fast as V8, so Node numbers
are not the product's. Raw files and `summary.json` are in `harness/results/`.

**Re-run for M0 acceptance (AB-R-0948, AB-R-0949, W9).** The files in `harness/results/` are now that re-run: the same
final hash `db46e5d51c815425` in all four runtimes, the injected Math.random still named at step 201, and 2.11 ms per
step for 20 characters in WKWebView over loopback.
