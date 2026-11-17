# VRMXG M0 plan: the runtime core

*Draft, 2026-11-17. M0 as the PRD scopes it (§8): node tree, scenes, signals, fixed-step loop with interpolation,
Rapier adapter, VRMXA player, animation slots and state machine, character controller, camera presets, input map,
picking, debug draw, MCP describe and inspect. It builds on the eight spikes and the decisions already made: `.vrmxs`
scenes (AB-D-0246), scripts on nodes (AB-D-0247), the determinism boundary (AB-D-0248), `vrmxa-core` in place
(AB-D-0249) and the 60 Hz clock (AB-D-0245). Filed as plan AB-P-0013, with one bridge task per workstream (AB-T-0501 to 0510), each with its acceptance and `blocks` edges for the order below.*

## What M0 is done looking like

M0 is finished when **one sample scene plays the same everywhere**:

1. **A cafe scene runs in the playground app**, in WKWebView (the Mac wrapper) and in Chromium. It has a set, a player
   character, an idle NPC, a door prefab that opens when the player walks into its trigger, a light rig, and camera
   presets the player can switch between.
2. **The player walks, runs and jumps** with keyboard and mouse or a gamepad, through the action map, on the Rapier
   character controller, with VRMXA animation slots, a speed blend and root motion.
3. **It replays bit for bit.** A 10-second recorded input run gives the same per-step world hash in Node, Chromium and
   WKWebView (scheme and loopback). A snapshot taken mid-run and restored re-simulates to the same hashes.
4. **It fits the budget.** Twenty characters plus physics step in under 5 ms in WKWebView on the M5 Max (the receipts
   predict about 4.3 ms), measured over loopback in a fresh web view.
5. **Agents can see it.** The MCP server describes every node type, reads the scene tree and node state of a running
   headless engine, and edits `.vrmxs` files with undo.
6. **You can see the physics.** Debug draw shows colliders, sensors, rays and the character capsule.

No editor (M1), no items or closet at run time (M1), no sequencer, post stack, particles or navigation (M2).

## Shape of the code

One npm workspace in this folder, plain JavaScript ES modules with JSDoc types checked by `tsc --checkJs` (the
convention `vrmxa-core` already uses), no build step for the packages themselves.

```
engine/
  packages/
    dmath/        portable maths (built, AB-R-0931)
    registry/     node and behaviour definitions, prop types               ← spike-registry
    scene/        .vrmxs schema, canonical I/O, lint, flatten, edits+undo   ← spike-registry
    core/         node tree, lifecycle, signals, tags, behaviours host, clock, RNG, timers, tweens
    physics/      adapter interface + Rapier deterministic build            ← spike-physics
    character/    VRMXA player, animation graph, controller, look-at, expressions
    input/        action map, devices, recording and replay, picking
    camera/       physical camera, rigs, spring arm
    render/       renderer host, environment, lights and shadows, interpolation, debug draw
    snapshot/     world snapshot and the determinism harness
    mcp/          MCP server: describe, inspect, edit                       ← spike-registry
  vendor/
    three-vrm/    @pixiv/three-vrm 3.5.5 with getState / setState for spring bones and look-at
apps/
  playground/     Vite + Vue 3 test app: load a scene, play / pause / step, debug toggles, camera presets
  playground-mac/ the thin WKWebView wrapper (from the spikes), scheme + loopback
content/
  sample/         the cafe scene, door prefab, characters and clips M0 tests with
```

**Rules every package follows:**
- **Simulation packages** (core, physics, character, input recording, snapshot) obey the determinism boundary
  (AB-D-0248). A lint rule enforces it: no `Math.random`, `Date.now`, `performance.now`, `**`,
  `Object3D.rotation` or the uncovered `Math.*` functions inside them.
- **Node types register themselves** with the registry's `define`, so the schema, inspector and MCP can't drift
  from the code.
- **Vue never holds engine objects** in reactive state (`markRaw` / `shallowRef`; the physics spike's lesson).
- **Every package has Node tests**, and the determinism harness runs the same scenes in all three runtimes.

## Workstreams

Sizes are rough: S about a day, M a few days, L a week or more of focused work. Arrows are dependencies.

| # | Task | Workstream | Size | After | Delivers |
|---|---|---|---|---|---|
| W0 | AB-T-0501 | **Foundation** | S | (repo: done) | Workspace, test runner, `tsc --checkJs`, the determinism lint rule, `registry` and `scene` lifted from the spike with its 8 tests, `dmath` moved in |
| W1 | AB-T-0502 | **Core runtime** | L | W0 | Node tree over three.js `Object3D`; lifecycle (`ready`, `process`, `physicsProcess`, `exitTree`); signals and connections (including paths into instances); tags; behaviours host with per-node state machine; instantiate a `.vrmxs` into a live tree; the 60 Hz clock with interpolation α, pause and time scale; seeded RNG streams; step-driven timers and tweens; autoload services |
| W2 | AB-T-0503 | **Physics** | M | W1 | Adapter interface and Rapier deterministic build: bodies, colliders (scene and `KHR_physics` in GLBs), sensors with the spike's two gotchas handled, joints with limits and motors (the door), ray and shape casts, named layers and masks, snapshot and restore, debug render data |
| W3 | AB-T-0504 | **Characters** | L | W1, W2 | Load `.vrmxa` through `vrmxa-core` and `.vrm` (0.x converted); vendored three-vrm with spring and look-at state; clip player driven from step time; animation state machine on VRMXA slots with `resolveSlots`; speed blend space; root motion; look-at; expressions; bone attachments; the kinematic character controller with jump |
| W4 | AB-T-0505 | **Input and cameras** | M | W1, W2 | Action map in `vrmxg.json`; keyboard, mouse, pointer lock, gamepads; per-step input recording and replay; picking (Rapier ray, `three-mesh-bvh` for skinned meshes); physical camera (mm, sensor, focus, f-stop); rigs: orbit, third person, over the shoulder, first person, fixed; spring arm |
| W5 | AB-T-0506 | **Render host** | M | W1 | Renderer setup for MToon (key light, Neutral tone mapping), the Environment node, light and shadow presets with frozen shadow maps, applying interpolation at α each frame, debug draw for colliders, sensors, rays and capsules |
| W6 | AB-T-0507 | **Snapshot and determinism harness** | M | W2, W3, W4 | One world snapshot (physics, characters, RNG, clock, input cursor); the harness that runs a scene with recorded input in Node, Chromium and WKWebView and compares per-step hashes; the M0 replay and budget checks |
| W7 | AB-T-0508 | **MCP** | S | W0, W1 | The spike's generic tools on `scene`, plus inspect against a running headless engine in Node: tree, node state, step, physics state |
| W8 | AB-T-0509 | **Playground and sample content** | M | W5 (app), none (content) | The Vue playground and its Mac wrapper; the cafe scene, door prefab, a player and an NPC character, an animation set covering idle, walk, run and jump, all with licences we can ship |
| W9 | AB-T-0510 | **M0 acceptance** | S | all | The six checks above, run and filed as receipts |

```
W0 ──► W1 ──┬──► W2 ──┬──► W3 ──┐
            │         └──► W4 ──┼──► W6 ──► W9
            ├──► W5 ──► W8 app  │
            └──► W7             │
W8 content (from day one) ──────┘
```

After W1, three streams can run side by side: physics then characters, render host and playground, and MCP. Sample
content can start immediately.

## Decisions M0 still needs from you

1. **Repository.** *Done 2026-11-17:* [xocialize-code/vrmxa-game-engine](https://github.com/xocialize-code/vrmxa-game-engine)
   (private, `main`), with the spikes kept in place and CI on Node 26. W0 is unblocked.
2. **Plain JavaScript with JSDoc types**, matching `vrmxa-core`, rather than TypeScript with a build step. Behaviours
   (user scripts) can still be TypeScript. Assumed in this plan.
3. **Sample content licences.** The spike models (VRoid samples) are git-ignored and may not be shippable. M0 can use
   `spec.vrm` (ours), `vrmxa-core`'s starter animation sets if their licences allow, and CC0 clips (PRD Q9: mesh2motion).

Open questions that don't block M0: VRMXI embedding and spec ownership (Q2, needed for M1 items), whether the three
apps share one Swift wrapper (Q4, needed before M1 apps; the playground uses the spike wrapper meanwhile), and how
browser builds reach a local LLM (Q6, M3).

## Risks

| Risk | Effect | Handling |
|---|---|---|
| `vrmxa-core` moves fast (VRMXA 0.32 this week) | The character layer breaks under the engine | Depend on a pinned commit; engine needs go to the avatar studio as asks (AB-D-0249); W3 has its own tests against `vrmxa-core`'s fixtures |
| Vendoring three-vrm | Falling behind upstream fixes | Keep the patch to `getState` / `setState` only, as a separate commit; offer it upstream |
| Determinism slips in through a library update | Replays break silently | The harness (W6) runs on every change; versions of three, three-vrm, Rapier and `dmath` are pinned and recorded in snapshots |
| W1 grows into an editor | M0 never ends | The playground is a test harness: no inspector, no gizmos, no saving. The editor is M1 |
| 20-character budget on slower Macs | Live play misses 60 fps on base chips | Measure on a base M-series machine during W6 as well as the M5 Max |

## Where things come from

| Piece | Source |
|---|---|
| Registry, scene, MCP | `spike-registry/` (AB-R-0933) |
| Physics adapter, wrapper, loopback server | `spike-physics/` (AB-R-0923), `physics-engine-research.md` |
| Character determinism, snapshot fields, crowd costs | `spike-determinism/` (AB-R-0924) |
| Portable maths | `engine/packages/dmath/` (AB-R-0931) |
| Clock and interpolation | `spike-steprate/` (AB-R-0932, AB-D-0245) |
| VRMXA reading, animation sets, closet | `vrmxa-avatar-studio/packages/vrmxa-core` (AB-D-0249) |
| Stage setup for MToon | `vrmxa-avatar-studio/app/src/stage/engine.js`, `spike-cinematics/` |
