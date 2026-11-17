# VRMXG physics engine: research and recommendation

*2026-11-17, updated the same day with the spike's measurements ([spike-physics/README.md](spike-physics/README.md)). Scope: a physics engine for the three.js-based VRMXG game engine, used by the VRMX anime studio (3D animated shorts) and the companion app. Stack: Vue + three.js, wrapped in a thin Xcode (WKWebView) app.*

## Recommendation

**Use Rapier (`@dimforge/rapier3d-compat`) as the physics backend. Put it behind a thin adapter interface, and keep Jolt as the planned fallback.**

**Spike result: confirmed** in our real stack (Vue + three r187 + three-vrm inside a sandboxed WKWebView wrapper). The same 600 scripted steps gave bit-identical state in V8 and JavaScriptCore. Snapshot restore re-simulates bit-identically. The full scene costs 0.25–0.40 ms per step. Use the **deterministic build** for the studio; it costs about 5% over the standard build. Details are in [the spike README](spike-physics/README.md).

Four reasons, in order of weight:

1. **It runs in our WKWebView wrapper without special setup.** Rapier is single-threaded WASM. It needs no `SharedArrayBuffer`, and so no cross-origin isolation. The `-compat` build inlines the `.wasm` as base64, so there is no separate fetch to fail under a custom URL scheme (see *WKWebView constraint* below).
2. **Determinism, which the anime studio needs.** Rapier's JS/WASM build is documented as cross-platform deterministic, and a dedicated `@dimforge/rapier3d-deterministic-compat` package exists. With a fixed timestep and `world.takeSnapshot()` / `World.restoreSnapshot()`, a shot simulates the same way every time. Scrubbing the timeline, re-rendering a shot and exporting frames all give identical results. The VRMXA spec already requires deterministic 60 Hz stepping for spring bones (see `VRMXA_Specification/reference/vrm-conformance-main/docs/methodology.md`, "Spring bone determinism"), so this keeps both systems consistent.
3. **It covers the features in our notes.** Box, sphere, capsule, cylinder, cone, convex hull, trimesh and heightfield colliders. Sensors (trigger volumes for doors and loot pickup). Ray, shape and point queries. Joints with limits and motors (doors, hinges, ragdolls). A built-in kinematic character controller and a raycast vehicle controller. Collision and contact events.
4. **It is healthy.** Apache-2.0. v0.21.0 shipped 2026-09-25, with a steady release history since 2021. It is the default physics choice in the three.js community, so examples and agent familiarity are widely available. That matters for the MCP layer too.

**Correction from the spike: Rapier 0.21 has soft bodies.** `SoftBodyDesc` supports cloth, rope, tubes, volumetric FEM and balloons, plus tearing, plasticity and attaching particles to rigid bodies. The spike ran a 20×14 pinned cloth: it is deterministic and survives snapshots, and costs about 0.3 ms per step while settling and about 0.02 ms after. The earlier draft said Rapier lacked soft bodies; that was wrong.

**What Rapier still lacks:** a ready-made *powered* ragdoll (motor-driven joints that follow an animation). You can build ragdolls from capsules and spherical joints with motors, but Jolt ships one ready to use. If active ragdolls become a core feature (for example, physically reactive companion interactions), Jolt is the swap. That is why the adapter layer matters.

## Candidates compared

Versions and dates are from the npm registry, 2026-11-17.

| Engine | npm / latest | License | Notes | Verdict |
|---|---|---|---|---|
| **Rapier** | `@dimforge/rapier3d-compat` 0.21.0 (2026-09-25) | Apache-2.0 | Rust→WASM, single-threaded. Deterministic build. Character and vehicle controllers. Soft bodies (cloth, rope, FEM) since 0.21. Snapshots. Simple GC-friendly API. **Spike-verified.** | **Pick** |
| **Jolt** (JoltPhysics.js) | `jolt-physics` 1.1.1 (2026-10-23) | MIT | AAA engine (Horizon Forbidden West, Death Stranding 2). Ragdolls with motors, soft bodies, wheeled/tracked vehicles, `CharacterVirtual`. Requires **manual memory management** (`Jolt.destroy`). The MT build needs `SharedArrayBuffer`. Also an official three.js addon (`JoltPhysics` in three docs). | **Fallback / v2 candidate** |
| **Box3D** | `box3d-wasm` 0.2.0 (2026-07-02, community port) | MIT | Erin Catto's (Box2D) new 3D engine, released July 2026, derived partly from Valve's Rubikon. Reportedly deterministic across threads and platforms. **The author calls it alpha.** The WASM port is unofficial and new. | Watch for 2027 |
| **crashcat** | `crashcat` 0.0.5 (2026-07-06) | MIT | Pure JS, no WASM, tree-shakeable, by Isaac Mason (who also maintains a JoltPhysics.js fork). Attractive idea, but 0.0.x. | Watch |
| **Havok** | `@babylonjs/havok` 1.3.14 (2026-07-29) | MIT (binary) | Strong engine, but a closed WASM blob with a Babylon-shaped API. No first-class three.js integration. | Skip |
| **cannon-es** | 0.20.0 (**2022-08-12**) | MIT | Pure JS, easy, but unmaintained for 4 years, with weaker stability. | Skip |
| **Ammo.js** | (Bullet port) | zlib | Stale, awkward Emscripten API, large build. | Skip |
| **Oimo.js / Physijs / cannon.js** | — | — | Effectively abandoned. | Skip |

**About the threejsresources.com list:** its ranking is editorial and mixes in things that aren't engines. Rank 1–2 are a racing game and a games portal. Rank 5 is a Rapier ragdoll demo. Rapier sits at #9. Treat it as a list of names, not a ranking.

## WKWebView constraint: threaded WASM

Multithreaded WASM (Jolt MT, Box3D's worker solver, Emscripten pthreads) needs `SharedArrayBuffer`, which requires cross-origin isolation (COOP `same-origin` + COEP `require-corp`/`credentialless`). Issue reports said a `WKURLSchemeHandler` page can't get it on macOS.

**Measured in the spike (sandboxed WKWebView, macOS 27.3), with both origins sending the same COOP/COEP/CORP headers:**

| Origin | `crossOriginIsolated` | `SharedArrayBuffer` | Timer resolution |
|---|---|---|---|
| Custom scheme (`vrmxg-spike://app`) | true | **undefined** | about 1 ms |
| Loopback HTTP (`http://127.0.0.1:<port>`) | true | available | about 20 µs |

So the reports are right in effect, with a twist: WebKit *says* the scheme page is isolated but still withholds `SharedArrayBuffer`. Over loopback, Jolt's multithreaded build ran fine in the wrapper (needs the `network.server` sandbox entitlement).

**Consequence:** choose an engine whose default build is single-threaded. Rapier qualifies by design. If we ever need threads, the Xcode shell serves the app from a tiny loopback server instead of a custom scheme; the spike's `LoopbackServer.swift` is 64 lines on Network.framework. The loopback origin also gives a profiling-grade timer, which the scheme doesn't.

**Measured cost of threads:** with all 300 boxes awake, Jolt with 4 workers took 0.18 ms per step, single-threaded Rapier SIMD 0.22 ms, single-threaded Rapier 0.31 ms, and single-threaded Jolt 0.90 ms. Threads only matter for scenes far larger than ours.

## Architecture notes for VRMXG

- **Spring bones stay in three-vrm, not in the physics engine.** `VRMC_springBone` hair and cloth chains are a separate Verlet system with their own colliders. To stay spec-faithful (matching the UniVRM golden reference), drive `vrm.update()` at a fixed 1/60 s, one step per tick, from the same fixed-step loop. Optional later step: mirror a few world colliders (floor, held items) into spring-bone colliders so hair reacts to the environment.
- **Fixed-timestep loop, separate from rendering.** Use an accumulator stepping physics at 60 Hz, and interpolate render transforms between steps. This matters on 120 Hz ProMotion displays and in offline frame export, where the studio renders at arbitrary rates.
- **A physics adapter interface** (`PhysicsWorld`, `Body`, `Collider`, `Joint`, `query.raycast`, `snapshot/restore`), implemented first by Rapier. This keeps Jolt or Box3D as a swap rather than a rewrite. It is also the natural surface to describe through the **MCP** server, so agents see engine-neutral capabilities.
- **VRMXI items declare their colliders in data.** The item format carries collider shapes (box, sphere, capsule, convex, trimesh), mass, joint definitions (a door is a revolute joint with limits and a motor), and sensor volumes. The engine maps these to `ColliderDesc` / `JointData`. This is the "bounding boxes with colliders" item in the notes.
- **Two kinds of raycast.** Use Rapier `castRay` / `castShape` for gameplay queries such as line of sight, ground checks and interaction range. Use `three-mesh-bvh` (MIT, 0.9.18, actively maintained) for pixel-accurate picking against visual meshes, such as clicking a skinned VRM.
- **Characters.** VRM avatars use a capsule with Rapier's `KinematicCharacterController` for locomotion, and NPCs use the same controller driven by AI. Ragdoll mode maps VRM humanoid bones to capsules and spherical/revolute joints. Humanoid bone names are standardized, so one mapping works for every VRM.
- **Determinism discipline (from the spike):**
  - Pick one Rapier build per project. The SIMD build produces different results from the scalar builds, and snapshots and replays only replay on the build that made them.
  - Keep everything that feeds the simulation free of `Math.sin`, `Math.cos` and other transcendental functions. Their rounding isn't guaranteed to match between V8 and JSC. The spike's level uses integer hashes and quantised heights, and its scripted input uses literal directions.
- **Rapier configuration gotchas (from the spike):**
  - Pass `QueryFilterFlags.EXCLUDE_SENSORS` to the character controller, or the character bumps into trigger volumes.
  - Give sensors `ActiveCollisionTypes.KINEMATIC_FIXED`, or a kinematic player never triggers them.
  - For VRM 0.x models, put facing on a parent group. Writing `vrm.scene.rotation` undoes `rotateVRM0`, and the model walks backwards.
- **Snapshots for the studio timeline:** a full-scene snapshot is 1.27 MB, takes about 2 ms and restores in about 3.5 ms. A keyframe every 30 frames costs about 150 MB for a 2-minute shot, which is fine in memory, or can be written to disk per shot.
- **Vue gotcha:** never put Rapier objects (world, bodies, colliders) into reactive state. Vue's proxies wrap WASM handle objects, which breaks them and adds per-access overhead. Use `markRaw()` / `shallowRef()`, and only push plain-number snapshots into the UI.

## Spike: done (2026-11-17)

All four spike steps ran, plus the optional Jolt comparison. Results, run instructions and the bugs it found are in [spike-physics/README.md](spike-physics/README.md), and the raw JSON is in `spike-physics/web/results/`.

## Sources

- [threejsresources.com: best physics](https://threejsresources.com/best/physics)
- [Rapier determinism (JS)](https://rapier.rs/docs/user_guides/javascript/determinism), [rapier.js CHANGELOG](https://github.com/dimforge/rapier.js/blob/master/CHANGELOG.md), npm `@dimforge/rapier3d-compat`
- [JoltPhysics.js](https://github.com/jrouwe/JoltPhysics.js), [three.js JoltPhysics addon](https://threejs.org/docs/pages/JoltPhysics.html)
- Box3D: [Phoronix](https://www.phoronix.com/news/Box3D-Open-Source-3D-Physics), [GameFromScratch](https://gamefromscratch.com/box2d-enters-the-3rd-dimension-box3d-released/), [box3d-wasm](https://awesome.ecosyste.ms/projects/github.com%2Fmonteslu%2Fbox3d-wasm)
- crashcat: [repo](https://github.com/isaac-mason/crashcat), [library comparison tests](https://github.com/isaac-mason/javascript-physics-library-tests)
- WKWebView isolation: [NeboLoop/nebo PR #633](https://github.com/NeboLoop/nebo/pull/633), [pdfcraft issue #201](https://github.com/PDFCraftTool/pdfcraft/issues/201), [capacitor issue #6182](https://github.com/ionic-team/capacitor/issues/6182), [web.dev cross-origin isolation guide](https://web.dev/articles/cross-origin-isolation-guide)
- [ecctrl](https://cdn.jsdelivr.net/npm/ecctrl@2.0.0/README.md) (Rapier character controller reference)
