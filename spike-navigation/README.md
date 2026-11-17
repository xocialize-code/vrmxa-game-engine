# VRMXG navigation spike

*2026-11-17. A throwaway spike that answers PRD §5.7's open question: which navigation library VRMXG should use, and whether it works in our stack. The stack is Vue 3 + three r187 + Rapier (`@dimforge/rapier3d-deterministic-compat` 0.21) inside the thin sandboxed WKWebView wrapper from [spike-physics](../spike-physics/README.md), where the custom scheme has no `SharedArrayBuffer`, so WASM runs single-threaded. Machine: M5 Max, macOS 27.3.*

## Verdict

**Use navcat 0.4.1. Keep recast-navigation-js 0.44 as the fallback behind the engine's nav adapter.** Both libraries passed every test in our stack. navcat wins on what VRMXG's principles ask for, and it loses only on raw speed, which our scenes don't need.

- **Both work single-threaded in WKWebView.** Neither uses threads or `SharedArrayBuffer`. Both run under the custom scheme.
- **Both are deterministic across engines.** Same seed and inputs gave **bit-identical agent positions** after 600 steps in Node (V8) and WKWebView (JSC), through both origins. This held for crowds of 10, 50 and 200, with a door closing and opening mid-run, and with crowds driving Rapier character controllers. Repeat runs in one runtime always matched too.
- **Only navcat can scrub a crowd.** Its navmesh and crowd are plain JS objects. A snapshot at step 300, restored and re-simulated to 600, matched bit for bit, door toggle included. In WKWebView the snapshot took 3.7 ms to take and 2.0 ms to restore, and it is 1.1 MB as JSON. recast-navigation keeps dtCrowd's state (corridors, path queue) inside WASM and has no snapshot API, so a scrubbed shot would have to re-simulate the crowd from step 0.
- **recast-navigation is about 2.5× faster at run time and 3× faster at baking.** At 200 agents, a crowd step costs 0.59 ms with recast-navigation and 1.6 ms with navcat in WKWebView, or up to 2.6 ms when it drives Rapier characters. Both are small next to the Rapier character controllers themselves (about 5.2 ms for 200 characters). For 10 to 50 NPCs, the realistic VRMXG range, navcat costs 0.05–0.21 ms per step.
- **navcat fits the rest of the engine better:**
  - Off-mesh links can be added and removed at run time (0.04–0.1 ms), and the crowd has traversal hooks, so a jump or ladder can hand off to Rapier and animation.
  - Query filters are plain JS functions.
  - Tiled meshes keep detail heights. recast-navigation's tile cache has none, so its navmesh sat up to 0.69 m off the terrain.
  - The bundle is 44–60 KB gzipped, against 228 KB.
  - It is debuggable JS, with no `destroy()` calls to remember.
- **The door works in both.** In recast-navigation it is a tile-cache box obstacle (0.02–0.04 ms). In navcat it is a rebuild of the 2 tiles under the door with the box marked unwalkable (1.0 ms). Either way, the path through the doorway goes from 14.0 m to 22.6 m around the wall, and back.

The risks with navcat: it is pre-1.0 (pin it, and vendor the crowd "block", which its own docs suggest), and its obstacle avoidance calls `Math.cos`/`Math.sin` on constant angles. Those matched in V8 and JSC here, but the spike-physics rule says to keep transcendental functions out of simulation, so replace them with literals when the block is vendored. recast-navigation is immune by construction, because its libm is compiled into the WASM.

## Comparison

Release dates are from the npm registry on 2026-11-17. Bundle sizes are minified and gzipped through the app's Vite 8 (`npm run sizes`), with three external.

| | **navcat** | **recast-navigation-js** | three-pathfinding | Yuka | recast-detour (Babylon) |
|---|---|---|---|---|---|
| What it is | Pure-JS Recast/Detour re-implementation (by recast-navigation-js's author) | Recast + Detour C++ → WASM (emscripten), JS wrapper | Navmesh queries for three.js (PatrolJS lineage) | Game-AI library: steering, FSM, navmesh queries | Old emscripten port used by Babylon.js |
| Licence | MIT | MIT (wrapper) + zlib (Recast/Detour) | MIT | MIT | zlib |
| Latest / cadence | 0.4.1 (2026-05-06); 29 versions since 2025-09; canaries to 2026-11-06 | 0.44.0 (2026-10-30); 85 versions since 2023-04; previous 0.43.1 2026-02-04 | 1.3.0 (2024-05-17) | 0.7.8 (2022-09-17) | 1.6.4 (2025-01-20) |
| Single-threaded / no SAB | yes (plain JS) | yes (no pthreads in the build) | yes | yes | yes |
| Bundle (gzip) | 44 KB tree-shaken, 60 KB all | 228 KB (WASM inlined; 340 KB `.wasm` + glue with the non-compat build) | 4 KB | 33 KB | — |
| Bake from triangle soup | yes | yes | **no** (bring a navmesh) | **no** | yes |
| Tiled navmesh | yes | yes | no | no | yes |
| Dynamic: temporary obstacles | tile rebuild with marked areas (DIY, ~1 ms per door) | tile cache box/cylinder obstacles (0.03 ms) | no | no | yes (tile cache) |
| Off-mesh links | yes, **added/removed at run time**, global, cross-tile | yes, baked into tiles (tile cache: via the mesh process only) | no | no | baked |
| Crowd with RVO-style avoidance | yes (Detour-style crowd as an ejectable block, off-mesh animation hooks) | yes (dtCrowd; no off-mesh hooks) | no | steering only (no navmesh crowd) | yes (dtCrowd) |
| Path queries | findPath / smooth path / raycast / nearest / random; custom JS filters | the same Detour set; area-cost/flag filters | A* + funnel on groups | A* on navmesh | the Detour set |
| Crowd snapshot (scrubbing) | **yes**: plain objects, measured | no API | n/a | n/a | no |
| three.js integration | `navcat/three` debug helpers + `getPositionsAndIndices` | `@recast-navigation/three` helpers | native | adapters | via Babylon |
| Verdict | **pick** | **fallback** behind the adapter | too small: no baking, no crowd | stale, no baking | Babylon-centric, stale |

recastjs (2014–2016 asm.js, one 2026 republish) and `@crowdedjs/recast-detour` (2022) were also checked. Both are abandoned.

## Results

The same suite (`src/sim/tests.js`) runs everywhere. The raw JSON is in `web/results/`. All step times are milliseconds per 60 Hz step, over 600 steps after a warm-up run.

**State hashes** (FNV-1a over the raw float bits of every agent position after 600 steps; the door closes at step 200 and opens at 400):

| | crowd 10 | crowd 50 | crowd 200 | 50 on Rapier | 200 on Rapier |
|---|---|---|---|---|---|
| navcat: Node / WKWebView scheme / WKWebView loopback | `17dda427` ×3 | `1437178a` ×3 | `db4018a7` ×3 | `f6a04ea6` ×3 | `2d991d2a` ×3 |
| recast-navigation: Node / scheme / loopback | `1d0ca378` ×3 | `1dbeb21d` ×3 | `3ed9e129` ×3 | `5cafa1cd` ×3 | `df440436` ×3 |

Every run was also repeated in its own runtime, and the repeat always matched. The navcat crowd snapshot hash is `33a19f40` in all three runtimes. All of this held across four separate WKWebView autoruns.

**Cost in WKWebView over loopback** (loopback has the 20 µs timer; the scheme's is 1 ms):

| | navcat | recast-navigation |
|---|---|---|
| Init (WASM instantiate) | 0 | 13.3 ms |
| Bake, solo (one tile), cold / warm | 110 / 53 ms, 110 polys | 38 / 14 ms, 107 polys |
| Bake, tiled 4.8 m tiles (81 tiles), cold / warm | 50 / 44 ms, 214 polys | 22 / 14 ms (tile cache), 102 polys |
| Door close / open (p50) | 1.0 / 1.0 ms (rebuild 2 tiles) | 0.04 / 0.02 ms (tile-cache obstacle) |
| Path query (200 random pairs, mean) | 0.017 ms | 0.009 ms |
| Crowd 10, mean / p95 | 0.048 / 0.08 | 0.014 / 0.02 |
| Crowd 50, mean / p95 | 0.21 / 0.26 | 0.071 / 0.08 |
| Crowd 200, mean / p95 | 1.61 / 1.82 | 0.59 / 0.64 |
| Off-mesh jump link (stairs → ground) | path 7.00 → 2.22 m (reverse unchanged); added at run time in 0.04 ms, removed in 0.1 ms | path 6.60 → 1.96 m (reverse unchanged); only by re-baking with the link (14 ms) |

The level is the physics spike's own geometry: a 48×48-cell ground trimesh, walls with a doorway, five stairs and a ramp, 4,756 triangles in all. It is turned into one triangle soup from the same `level.js` arrays that build the Rapier colliders (`src/sim/geometry.js`: the trimesh as is, each cuboid as 12 triangles).

**Crowd driving Rapier kinematic character controllers** (WKWebView loopback, `sync` mode):

| | navcat 50 | navcat 200 | recast 50 | recast 200 |
|---|---|---|---|---|
| Crowd update (incl. the sync writes) | 0.36 | 2.57 | 0.09 | 0.66 |
| Controllers + `world.step()` | 1.28 | 5.26 | 1.31 | 5.16 |
| Total, mean / p95 | 1.64 / 1.78 | 7.83 / 8.30 | 1.40 / 1.58 | 5.81 / 6.10 |
| Agent ↔ body drift, mean / max | 0.002 / 0.13 m | 0.009 / 0.43 m | 0.002 / 0.13 m | 0.009 / 0.26 m |
| Same, open loop (`free`), max | 2.3 m | 1.0 m | 2.3 m | 2.7 m |
| Navmesh vs physics ground at spawn, max | 0.28 m | 0.27 m | 0.58 m | 0.69 m |

At 200 characters, the Rapier character controller (about 26 µs per character per step) costs two to eight times more than either crowd. The machine was under load from other work (load average about 9) during the WKWebView runs. In an earlier clean run, navcat's 200-agent crowd on Rapier cost 1.75 ms rather than 2.57 ms; treat its coupled numbers as ±0.8 ms.

### Reconciling the crowd and Rapier (what worked)

The design is that **physics is authoritative for where a character is, and the crowd is authoritative for where it wants to go.** Each fixed step (`src/sim/coupled.js`):

1. **Sync.** Write each body's foot position into its agent. In recast-navigation that is `dtCrowdAgent.npos` via `agent.raw.set_npos`; in navcat it is `agent.position`. Don't teleport: a teleport resets the corridor and replans. Detour integrates from `npos` and then moves the corridor along the navmesh surface to it, which is Unity's `updatePosition = false` pattern.
2. **Crowd update.** Paths, steering and agent-to-agent avoidance.
3. **Move.** Agent velocity × dt, plus our own gravity, goes into `computeColliderMovement`, then `setNextKinematicTranslation`.
4. **Physics step.**
5. **Drift check.** Measure the horizontal distance between agent and body. Past 0.5 m, teleport the agent to the body and re-request its target. This never fired in any run: the largest per-step gap was 0.43 m. Without the sync (open loop), the gap grew to 2.7 m within 10 s, from stairs, autostep slowdowns and the door collider.

The characters skip each other in the controller (Rapier collision groups), because the crowd owns separation. Physics owns the world: walls, stairs, slopes and the door collider, which is toggled together with the navmesh obstacle. The crowd's own Y is ignored; the controller's snap-to-ground and gravity decide height.

**Debug draw.** `src/stage/stage.js` draws the navmesh in three.js two ways. One is a library-agnostic `BufferGeometry` built from `debugTriangles()`: a translucent fill and a wireframe, rebuilt when the door changes. The other is each library's own helper (`?draw=library`). Screenshots from WKWebView are in `shots/`.

## Bugs and gotchas this spike found

1. **Spawning a capsule at a navmesh point can bury it in the ground.** The navmesh surface is only approximately the physics surface: within about 0.28 m for navcat's detail mesh here, and up to 0.69 m for recast-navigation's tile cache, which has **no detail mesh** and interpolates over whole polygons. A character spawned inside the trimesh never gets out, because Rapier's controller doesn't depenetrate. In one seed, one stuck character doubled the controller cost of all 50. **Fix:** ray-cast down to the physics ground before placing a body, and never use navmesh Y for physics.
2. **Thick wall tops bake as walkable.** The 1 m boundary walls survived the 0.3 m erosion and left navmesh strips 7 m up. Fix: give colliders a nav flag. "Blocker only" here means the top face is left out of the soup; the alternative is a flood-fill prune from seed points, which both libraries have.
3. **recast-navigation's tile cache can't take run-time off-mesh links,** and `generateTileCache` has no `offMeshConnections` option. They go in through the `TileCacheMeshProcess` callback (`params.setOffMeshConnections`) and are fixed at bake time.
4. **Re-bake (or restore) before comparing runs.** Tile rebuilds bump tile salts and node-ref sequence counters. The suite re-bakes before every determinism run, so each one starts from the same navmesh state.
5. **navcat's `addAgent` keeps the position array you pass in.** Pass a fresh array, or the agent moves when you reuse it.
6. **recast-navigation needs manual memory management.** Call `destroy()` on the navmesh, tile cache, query and crowd. Its handles are WASM objects, so keep them out of Vue reactivity (`markRaw`), as with Rapier.
7. **The navcat three.js helper renders almost black.** Its material is already unlit, but its vertex colours are scaled to 40% and three r187 treats vertex colours as linear. Use the engine-side draw, or brighten the colour attribute.
8. **The custom scheme's timer is 1 ms.** Use the loopback origin for timings, as in the physics spike.
9. **Don't share a scratch folder with other agents.** A sibling agent overwrote one of this spike's scratch scripts mid-run. Use a private subfolder.

## Run it

```bash
cd web && npm install && npm run dev          # http://127.0.0.1:5242: the stage
```

Stage query: `?backend=recast|navcat`, `&agents=10|50|200`, `&draw=ours|library`, `&door=1` (start closed), `&cam=door`. Press D or click the button to toggle the door. Click the ground to send every agent there. `?autorun=1` runs the suite instead (`&save=<name>` writes `results/<name>.json` via the dev server, `&only=recast|navcat`, `&rapier=0`).

```bash
cd web && npm run test:node -- --out results/node.json      # the suite in Node; JSON to stdout
node scripts/summary.mjs results/*.json                      # hashes, cost, coupling tables
npm run sizes -- --out results/bundle-sizes.json             # bundle sizes
mac/scripts/build.sh                                         # web build + swiftc + ad hoc signed, sandboxed .app
SPIKE_AUTORUN=1 mac/build/NavigationSpike.app/Contents/MacOS/NavigationSpike     # suite via scheme, then loopback
SPIKE_ORIGIN=loopback SPIKE_QUERY='backend=navcat&agents=200' mac/build/NavigationSpike.app/Contents/MacOS/NavigationSpike
SPIKE_QUERY='backend=recast&door=1&cam=door' SPIKE_SHOT=shot.png mac/build/NavigationSpike.app/Contents/MacOS/NavigationSpike
```

The app is sandboxed, so autorun JSON and `SPIKE_SHOT` PNGs land in `~/Library/Containers/com.xocialize.vrmxg-navigation-spike/Data/tmp/`. Results are also printed to stdout.

## Layout

| Path | What |
|---|---|
| `web/src/sim/level.js` | Copied unchanged from spike-physics: the level as plain arrays, plus the integer PRNG. |
| `web/src/sim/geometry.js` | The navmesh input soup built from the collider arrays, the door block, the jump link, and agent and bake settings. |
| `web/src/sim/nav-recast.js` | Backend: recast-navigation (tile cache, door obstacle, dtCrowd, `npos` sync, debug triangles). |
| `web/src/sim/nav-navcat.js` | Backend: navcat (own per-tile builder with a blocker hook, door tile rebuild, crowd block, run-time links, snapshot/restore). |
| `web/src/sim/coupled.js` | Crowd → Rapier kinematic character controllers; the sync/drift loop; spawn ray casts. |
| `web/src/sim/tests.js`, `util.js` | Bake, door, link, path, crowd, determinism, scrub and coupling measurements; hash, stats, deep clone. |
| `web/src/stage/stage.js` | three.js stage: the level, the navmesh debug draw (engine-side or library helper), instanced capsules, door, click-to-send. |
| `web/src/App.vue` | HUD, autorun report, wrapper bridge. |
| `web/scripts/` | `node-tests.mjs`, `summary.mjs`, `bundle-sizes.mjs`. |
| `mac/` | The spike-physics wrapper, renamed (`vrmxg-nav://` scheme), plus `SPIKE_SHOT` to snapshot the web view. |
| `web/results/` | `node.json`, `wkwebview-scheme.json`, `wkwebview-loopback.json`, `bundle-sizes.json`. |
| `shots/` | WKWebView snapshots: overview, door closed (both libraries), library helpers, 200 agents. |

No avatars or models are used: agents are capsules the size of the physics spike's player.

## What PRD §5.7 should say

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Nav mesh baking | `NavigationRegion3D`, `NavigationMesh` | Bake from scene colliders with **navcat** behind a nav adapter (recast-navigation-js as fallback). Colliders carry a nav flag (walkable / blocker-only / ignore). Bake tiled at edit time and store the navmesh as JSON scene data; bake at run time only for generated levels (~40 ms for the spike level). | P1 |
| Path agents | `NavigationAgent3D` | Agent node feeding the Rapier character controller: physics is authoritative for position (synced into the agent each step), the crowd for velocity; teleport past 0.5 m of drift. Spawn bodies by ray-casting to physics ground, never at navmesh Y. | P1 |
| Avoidance | RVO avoidance, `NavigationObstacle3D` | Crowd avoidance (vendored navcat crowd block, trig replaced by literals). Doors and movable props are obstacles: tile rebuild with the box marked unwalkable (~1 ms). Budget ~0.2–0.4 ms per step for 50 agents and ~1.6–2.6 ms for 200 in WKWebView. | P1 |
| Off-mesh links | `NavigationLink3D` | Run-time links (jumps, ladders, doors) with traversal hooks that hand off to Rapier and animation. | P2 |
| (new) Determinism and scrubbing | none | Crowd and navmesh state is in the timeline snapshot (navcat: plain objects, bit-identical restore, 2–4 ms). | P1 |

## Caveats

- This is one machine (M5 Max, macOS 27.3) and one small level (40 m square, 4,756 triangles). Determinism was checked across V8 and JSC on arm64 macOS only, not on Intel, iOS devices, Firefox (SpiderMonkey) or Chromium proper.
- navcat's determinism across engines rests partly on `Math.cos`/`Math.sin` agreeing in V8 and JSC for a few constant angles. They agreed here, but that is not guaranteed. Vendoring with literals removes the dependency.
- Bake settings were tuned once (0.15 m cells, 4.8 m tiles) and not optimised per library. The two libraries' poly counts differ: recast-navigation's tile cache merges flat ground into fewer, larger polys and has no height detail.
- Crowd timings use each library's default crowd settings (adaptive obstacle avoidance) with all update flags on. The tile-rebuild door in navcat is my own code, built on navcat's exported per-step functions, not a library feature.
- The door is a fixed collider toggled on and off, not the physics spike's hinged door. A hinged door would also need an obstacle that is kept while the door swings.
