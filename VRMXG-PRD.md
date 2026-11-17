# VRMXG Game Engine — PRD (features pass)

*Status: first pass, 2026-11-17, updated the same day with eight spikes and research reports (table
below). A feature inventory, not a design. It maps what Godot 4 offers onto a three.js engine
built around our VRMXA characters and items, and marks what we take, change, defer or skip.
Follow-up passes will add requirements detail per area.*

**Inputs:** Godot 4.8-beta source (`reference/godot-master`), the other repos in `reference/`, the
VRMXA specification (`VRMXA_Specification/`), the avatar studio (`vrmxa-avatar-studio/`), the
engine notes (`vrmxa-game-engine-notes.md`) and the physics research and spike
(`physics-engine-research.md`, `spike-physics/README.md`).

**Spikes and research behind this pass** (all 2026-11-17, M5 Max, macOS 27.3):

| Area | Verdict | Where | Bridge |
|---|---|---|---|
| Physics | Rapier (deterministic build) behind an adapter, Jolt as fallback; bit-identical in V8 and JSC | `spike-physics/` | AB-R-0923, AB-L-0346 |
| Determinism of characters | Not deterministic across engines as shipped; the `dmath` shim makes it bit-identical at no measurable cost | `spike-determinism/`, `engine/packages/dmath/` | AB-R-0924, AB-R-0931, AB-L-0345 |
| Navigation | navcat (pure JS), recast-navigation-js as fallback; crowds snapshot and replay bit-identically | `spike-navigation/` | AB-R-0925 |
| Particles | three.quarks behind an adapter that owns RNG, step and maths | `spike-particles/` | AB-R-0926 |
| Offline export | Raw frames to Swift, AVAssetWriter; 10 s of 4K60 in 5.2 s; bit-identical frames | `spike-frame-export/` | AB-R-0927 |
| Step rate | Keep 60 Hz: spring bones at 120 Hz move p95 2.7–23° differently; interpolate presentation for 24/25/50 fps (≈0.4–1.1°) | `spike-steprate/` | AB-R-0932, AB-D-0245 (decided) |
| Node registry, `.vrmxs`, MCP | One registry generates the schema, validation and generic MCP tools; unknown data survives round-trips; 10k nodes validate in 6.8 ms | `spike-registry/` | AB-R-0933 |
| Cinematics | Build our own sequencer and virtual cameras; pmndrs `postprocessing` for the post stack | `research/cinematics.md`, `spike-cinematics/` | AB-R-0928, AB-R-0929 (WKWebView) |
| NPC AI | Behaviour trees with a utility selector; optional LLM director logged as input | `research/npc-ai.md` | none yet (recommendation, no measurements) |
| Lip sync | TalkingHead core on three-vrm, within 10–30 ms of audio | earlier spike | AB-R-0888 |

---

## 1. What VRMXG is

A runtime engine for three.js that understands VRMXA characters, VRMXW wearables and VRMXI game
items natively, and delivers the interactive world: the scene, physics, characters, cameras,
input, audio, AI and capture. It lives **outside** the apps that use it.

**Apps built on VRMXG** (decided 2026-11-17: three new apps, separate from the avatar studio):

| App | What it is | What it takes from the engine |
|---|---|---|
| **Editor** (new) | Builds scenes and games: places sets, characters and items, wires behaviours and signals, plays in place | The whole runtime plus the editor package (tree, inspector, gizmos, undo), MCP edit |
| **Game UI app** (new) | Runs what the editor makes, for players: HUD, menus, save, settings | The runtime only, plus HUD and menu overlays, input map, save |
| **Anime creator** (new) | Makes anime shorts (and spokesmodel spots, unless they get their own app): shots, cameras, performances, dialogue, render | The runtime plus the shot sequencer, virtual cameras, lip sync and offline frame export |
| VRMXA Avatar Studio (exists) | Makes characters and wearables | The character runtime it already has (`vrmxa-core`), and later the engine's stage |
| Companion app (planned) | A character that lives with the user | The runtime with persona-driven AI, voice and camera input |

The three new apps share one runtime and one scene format, so a set built in the editor can be
played in the game UI app and filmed in the anime creator.

Godot is the model for **scope and shape**: a scene tree of composable nodes, reusable scenes,
signals, a fixed-step main loop, a strong animation system and a small, coherent editor. VRMXG is
not a Godot port. It runs in a browser and in our WKWebView wrapper, on three.js as provided.

## 2. Who it is for

| User | What they do with it | What it needs most |
|---|---|---|
| **Anime short production** | Stage VRMXA characters, block shots, run physics and AI, render frames | Determinism, a shot timeline, cameras, offline frame export, expressions and lip sync |
| **Product spokesmodels** | A character presents a product in a set, from a script | Cameras, voice and lip sync, gestures from animation sets, product items (VRMXI) |
| **Companion app** | A character lives in a small space and reacts to the user | Persona-driven AI, look-at, idle variety, input from camera and gesture, low power |
| **Game builders (us, then others)** | Build interactive scenes and small games | Scene format, items, physics, input, NPCs, UI, save |
| **Agents (Claude and others)** | Inspect, build and drive scenes through MCP | A self-describing engine: every node, property, signal and action discoverable and scriptable |

## 3. Principles

1. **VRMXA-native.** Characters, closets, animation sets, eye and mouth states, voice and persona
   are first-class engine concepts, not imported meshes. The engine is a closet-compliant reader
   (VRMXA §13.2, level 2) so a character can equip a found item in-game (`CLOSET.md` §1, §6).
2. **three.js as provided** (VRMXA §13.1). Our additions live in our own libraries. The VRM
   libraries are vendored and extended where VRMXA needs it.
3. **Deterministic by default.** A fixed 60 Hz step drives physics, animation, spring bones, AI,
   navigation and scripted input. A shot simulates identically every time, so it can be scrubbed,
   re-rendered and exported. Physics and navigation are bit-identical across V8 and JSC as they
   are (`spike-physics/`, `spike-navigation/`). The character side is not: three.js and three-vrm
   call `acos`, `sin`, `cos` and `atan2`, which round differently between engines. A pure-arithmetic
   math shim (`dmath`) installed at boot makes it bit-identical in Node, Chromium and WKWebView at
   no measurable step cost (`spike-determinism/`). The boundary is in §9, question 7.
4. **Data first.** Scenes, items, prefabs and settings are plain documents. Anything the editor
nee
   can do, a file or an MCP call can do.
5. **Agent first.** The engine describes itself: node types, properties, signals, actions and
   their schemas. The MCP surface is generated from the same registry the editor inspector uses.
6. **Adapters at the seams.** Physics (Rapier now, Jolt as fallback), particles, audio and
   networking sit behind engine-owned interfaces.
7. **Web first, native wrapped.** Runs in a browser tab and in the WKWebView shell. Single-threaded
   WASM by default (no `SharedArrayBuffer` under the custom scheme; measured in the spike).
8. **Small runtime, optional editor.** The runtime ships in every app; the editor is a separate
   package that starts minimal.

## 4. The format family

| Format | What | Status |
|---|---|---|
| `.vrmxa` | A character: appearance, closet, animation sets, voice, persona | Spec draft, bundle v5 |
| `.vrmxw` | A wearable fitted to the base model; may carry states and animations | Spec draft, v1 |
| `.vrmxi` | **New.** A game item that isn't equipped: model, colliders, joints, sensors, internal animations, item type (door, loot box, vehicle …), interaction verbs, state | To specify |
| `.vrmxs` (proposed name) | **New.** A scene: a saved node tree, the Godot `.tscn` equivalent, instancable inside other scenes. Our own JSON (§4.1) | Recommended, to specify |
| Project | **New.** Input map, autoloads, physics layers, settings, entry scene | To specify |

**The split between VRMXW and VRMXI is equipped or not.** A VRMXW is something a character wears
or holds, fitted to the base model. A VRMXI is everything else in the world that has behaviour:
doors, containers, switches, seats, vehicles, pickups. VRMXI should share VRMXW's conventions
where they overlap (the licence and `meta` block, `madeWith`, tags, states with `show` /
`morphs`), so both read the same way.

The one case that crosses over is an item that lies in the world and can then be equipped, such as
a sword on a table. The suggestion is a **pickup** VRMXI that points at its VRMXW: the VRMXI gives
the world behaviour (collider, prompt, the `take` verb), and taking it puts the VRMXW into the
character's closet through the closet protocol. Whether the VRMXI embeds the VRMXW or references it
is open (§9, question 2).

### 4.1 Scene format (decided 2026-11-17, AB-D-0246)

**Our own JSON scene document is the source of truth. glTF stays the format for assets, and is an
export target for scenes.** This is Godot's split too: `.tscn` is native, and glTF is imported and
exported (Godot 4.8 reads `KHR_physics_rigid_bodies`, `KHR_collision_shapes` and the older
`OMI_physics_*` in `modules/gltf/extensions/physics/`).

**Why not glTF plus an extension as the scene format:**

1. **A scene points at files glTF can't point at.** It places `.vrmxa` characters (ZIP bundles),
   `.vrmxi` items and other scenes, with per-instance overrides. glTF has no standard way to
   reference another glTF, let alone a bundle.
2. **VRMs don't nest.** `VRMC_vrm` is a root extension: one humanoid per file. A glTF holding two
   characters is not a VRM, and three-vrm has to parse each character from its own file anyway
   (a VRM can't be cloned).
3. **Other tools would drop our data.** gltf-transform already strips every `VRMC_*` extension on
   a plain `copy`; it would strip ours the same way. "Opens in Blender" would mean "loses the
   game on save", so the interchange benefit is smaller than it looks.
4. **Most of a scene isn't geometry.** Behaviours, signal connections, AI settings, camera rigs,
   input, the shot sequence and seeds would all be vendor extensions: our own JSON wrapped in glTF.
5. **glTF references things by index.** Indices renumber when a tool rewrites the file. The
   VRMXW draft has already hit this and switched to names (W24). A scene needs stable ids for
   undo, diffs and MCP patches ("set `n-door.open` to true").
6. **Standards are still moving.** The Khronos physics extensions are review drafts, not ratified;
   `KHR_interactivity` has been submitted for ratification, with Babylon.js support and nothing
   in three.js yet. A format of our own isn't blocked on either.

**Where glTF is used:**

| Use | How | Pri |
|---|---|---|
| Set and prop geometry | `.glb` files referenced by the scene | P0 |
| Colliders inside assets | Read `KHR_physics_rigid_bodies` + `KHR_collision_shapes` (and `OMI_physics_*`) from environment GLBs and `.vrmxi` models, so colliders authored in Blender come through. Read tolerantly while they are drafts | P1 |
| Scene export | One-way "bake to glTF": flattened nodes, physics as KHR extensions, characters as separate `.vrm` files beside it. For Blender, Godot and Babylon | P2 |
| Behaviour import | Watch `KHR_interactivity`; import simple graphs if three.js gains support | Watch |

**Shape of the document** (a sketch to react to, not a schema):

```json
{
  "format": "vrmxs", "version": 1, "id": "…",
  "assets": [
    { "id": "hana",  "type": "vrmxa", "ref": "characters/hana.vrmxa", "sha256": "…" },
    { "id": "cafe",  "type": "glb",   "ref": "sets/cafe.glb",         "sha256": "…" },
    { "id": "door",  "type": "vrmxs", "ref": "prefabs/door.vrmxs",    "sha256": "…" }
  ],
  "nodes": [
    { "id": "root",   "type": "Node3D",    "name": "Cafe" },
    { "id": "set",    "type": "Model",     "parent": "root", "asset": "cafe" },
    { "id": "door-1", "type": "Instance",  "parent": "root", "asset": "door",
      "transform": { "p": [2, 0, -3], "q": [0, 0.707, 0, 0.707] },
      "overrides": { "hinge": { "behaviours": [ { "use": "hinge", "locked": true } ] } } },
    { "id": "hana-1", "type": "Character", "parent": "root", "asset": "hana",
      "transform": { "p": [0, 0, 0] },
      "props": { "outfit": "casual" }, "behaviours": [ { "use": "wander", "radius": 4 } ] }
  ],
  "connections": [ { "from": "door-1", "signal": "opened", "to": "hana-1", "call": "lookAt" } ],
  "settings": { "physics": { "build": "deterministic", "hz": 60 }, "environment": { "…": "…" } }
}
```

**Rules to carry into the spec:**
- **A flat node list with `parent` ids**, as `.tscn` does and MavonEngine's scene JSON nearly does.
  Small, line-stable diffs; MCP and undo address nodes by id. Order in the list is sibling order.
- **Node types and their props come from the engine's node registry**, which also generates the
  JSON Schema, the inspector and the MCP tool schemas. Unknown types and props are kept on
  round-trip, never dropped.
- **Assets by relative path plus `sha256`**, as VRMXA does, so a moved or changed file is caught.
- **Instances override by inner node id**, never by index. An override is a partial node
  (`{"hinge": {"props": {"mass": 20}}}`), deep-merged over the prefab's node; nested prefabs use
  paths (`"left/hinge"`). Behaviours merge by `use`, never by position (an unknown `use` appends,
  `"remove": true` drops one); other arrays replace whole (`spike-registry/`).
- **Connections can address nodes inside instances by path** (`"door-1/hinge"`), as Godot's
  paths into instanced scenes do; a prefab's inner signals and actions are otherwise unreachable.
- **Canonical serialization:** one asset, node and connection per line, fixed key order, unknown
  keys kept and sorted after known ones. One property edit is a one-line diff (`spike-registry/`).
- **No code in a scene.** Behaviours are named and resolved from the project's registry. A scene
  from someone else is data only (VRMXA §3.5: nothing runs).
- **Same frame as VRM 1.0:** metres, Y up, right-handed, +Z forward.
- **Two forms, as VRMXA has:** a plain `.vrmxs` JSON file inside a project folder, and a packed
  ZIP with its assets for sharing, under the same container rules as `.vrmxa`.
- **Name:** `.vrmxs` fits the family (A avatar, W wearable, I item, S scene); the project file
  would be `vrmxg.json`. Both are suggestions.

---

## 5. Godot feature map

Priority: **P0** first usable engine · **P1** next · **P2** later · **Skip** not planned.
"Godot" names the classes or systems in the 4.8 source that define the feature.

### 5.1 Core architecture

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Node tree | `Node`, `Node3D`, `SceneTree` | Engine nodes wrap three.js `Object3D`s; one tree, typed nodes, lifecycle (`ready`, `process`, `physicsProcess`, `exitTree`) | P0 |
| Scenes as prefabs | `PackedScene`, instancing, scene inheritance, editable children | Scene documents instanced into other scenes, with property overrides | P0 |
| Signals | `Object.connect`, `emit_signal` | Typed events on nodes, connectable in data and code; listed by the registry for MCP | P0 |
| Groups | `add_to_group`, `get_nodes_in_group` | Tags on nodes, queryable | P0 |
| Autoloads | project singletons | Global services (save, audio, game state) declared in the project | P0 |
| Resources | `Resource`, `.tres`, shared vs local | Shareable assets (materials, curves, animation sets, AI profiles) referenced by id | P0 |
| Main loop | `_process` / `_physics_process` | Fixed 60 Hz step for simulation; render at display rate | P0 |
| Physics interpolation | `scene_tree_fti` (fixed-timestep interpolation) | Interpolate render transforms between steps: 120 and 144 Hz displays in live play, and offline export at any rate that doesn't divide 60 Hz (24, 25, 50, 29.97 fps). Bones slerp through `dmath` so exports stay bit-identical; cameras, sequencer tracks and post effects are evaluated at the exact frame time. The simulation stays at 60 Hz (`spike-steprate/`, §9 Q7) | P0 |
| Deterministic math | none | **Built: `@vrmxg/dmath`** (`engine/packages/dmath/`, AB-R-0931). FreeBSD msun ports of `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `exp`, `log`, `pow`, `cbrt`, plus V8's `hypot` algorithm, from plain arithmetic: bit-identical in Node, Chromium and WKWebView, within 1 ulp of V8 and of the correctly rounded value. It merges the two spike copies (both are now re-exports) and keeps both spike suites bit-identical. Installed over `Math.*` before any VRM is parsed, in every app and in Node tooling (`installPortableMath()`), or scoped per step (`withPortableMath`). Sun's fdlibm notice ships with it. Exact versions of three, three-vrm, `dmath` and Rapier are pinned, and snapshots and replays record them: a `dmath` version bump changes replay hashes | P0 |
| World snapshot | none | One snapshot for scrubbing: Rapier world + per character (every node's local transform, spring tails, lookAt yaw/pitch, expression weights, animation-graph state; 26–44 KB, 0.05–0.2 ms) + navigation crowd + AI tree state + RNG streams | P0 |
| Pause and time scale | `process_mode`, `Engine.time_scale` | Per-subtree pause; global and per-node time scale (slow motion for shots) | P0 |
| Timers and tweens | `Timer`, `Tween` | Step-driven timers and tweens (deterministic) | P0 |
| Unique names / paths | `%Name`, `NodePath` | Stable node ids plus paths, so MCP and scripts can address nodes | P0 |

### 5.2 Scripting

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Scripting language | GDScript, C#, GDExtension | TypeScript/JS behaviours attached to nodes. No custom language | P0 |
| Visual scripting | removed in Godot 4 | Skip; agents and data-driven behaviours cover it. Revisit for non-programmers | Skip |
| Tool scripts / editor plugins | `@tool`, `EditorPlugin` | Behaviours can run in the editor; editor plugin API | P2 |
| Hot reload | script reload on save | Vite HMR for behaviours in dev | P1 |
| Sandboxing | none (trusted code) | Scenes from others are data only; code runs only from the project (VRMXA §3.5: bundles are untrusted, nothing runs) | P0 |

### 5.3 Rendering and environment

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Renderer | Forward+, Mobile, Compatibility | three.js `WebGLRenderer`. WebGPU later: three-vrm's MToon node material fails on r187 today | P0 / P2 |
| Toon / MToon | (via godot-vrm addon) | MToon is the house look; lighting rigs tuned for it (needs a directional key light) | P0 |
| Environment | `WorldEnvironment`, `Environment`, sky, fog, tone mapping, exposure | Environment node: background, sky, fog, tone mapping, exposure, env map | P0 |
| Lights and shadows | `DirectionalLight3D`, `OmniLight3D`, `SpotLight3D`, cascades | three.js lights wrapped as nodes; shadow presets; frozen shadow maps for static sets | P0 |
| Post-processing | glow, SSAO, SSR, DOF, `CompositorEffect` | The stack is scene data, keyable from sequences, behind an adapter. pmndrs `postprocessing` 6.39 (Zlib) on WebGL now: 65 vs 88 draw calls and 2.1 vs 2.7 ms at 1080p against three's own composer, no errors with MToon on r187, and the same frames and costs in WKWebView as in Chromium (`spike-cinematics/`, AB-R-0929). TSL pipeline once MToon runs on WebGPU. MSAA 4×, Neutral tone mapping, parameters that scale with output resolution | P1 |
| Anime look | none | Selective bloom (a global 0.9 threshold makes lit skin and white cloth glow), LUT grading, vignette, grain, chromatic aberration, physical DOF, speed and focus lines, impact frames. MToon's own outline on characters, screen-space edges on sets only (stacking both doubles the line). No AO on characters | P1 |
| Hard shadows | none | A toon shadow preset for MToon sets | P1 |
| Global illumination | `VoxelGI`, SDFGI, `LightmapGI`, `ReflectionProbe` | Baked lightmaps and env probes via import; no real-time GI | P2 |
| Decals | `Decal` | three.js `DecalGeometry`-based decal node | P2 |
| Fog volumes | `FogVolume` | Skip for now | Skip |
| LOD and culling | visibility ranges (HLOD), `OccluderInstance3D` | `LOD` node; frustum culling fixed for skinned VRMs; occlusion later | P1 |
| Instancing | `MultiMeshInstance3D` | Instanced and batched mesh nodes for props and foliage | P1 |
| Shaders | Godot shader language, `VisualShader`, global uniforms | GLSL `ShaderMaterial` now, TSL with WebGPU later; global shader params | P1 |
| 3D text and sprites | `Label3D`, `Sprite3D` | Billboard text and sprites (name tags, speech bubbles, icons) | P1 |
| Trails | `Trail3D` (new in 4.8) | Trail node for swords and motion streaks | P1 |
| CSG and grids | `CSGShape3D`, `GridMap` | Blockout primitives and a tile/grid layout tool for quick sets | P2 |
| Texture streaming | `texture_streaming` module | Skip until scenes outgrow memory | Skip |

### 5.4 Animation

The area where Godot is strongest and we need the most.

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Clip player | `AnimationPlayer`, `AnimationMixer`, libraries | Plays `.vrma` and glTF clips; any-property tracks, method-call tracks, audio tracks. Driven from shot time: each action's time and weight are set from the step index and the mixer is updated with 0, so no mixer internals need snapshotting | P0 |
| State machine | `AnimationNodeStateMachine` | Locomotion and behaviour state machines, driven by VRMXA animation **slots** (`idle`, `walk`, `run`, `jump` …) | P0 |
| Blend spaces | `AnimationBlendSpace1D/2D` | Speed and direction blending (idle–walk–run, strafing) using clip `speed` from `animations.json` | P0 |
| Blend trees | `AnimationBlendTree`, `AnimationNodeExtension` | Layered blending with masks (upper body / full body / hands / face): this is open issue G10 | P1 |
| Animation sets by equipment | none | VRMXA §8.3: the active set follows the tags of equipped items and their states. Engine-native; resolver exists in `vrmxa-core/anim` (`resolveSlots`) | P0 |
| Root motion | `root_motion_view`, root motion track | `rootMotion: travel` clips move the character controller; `inPlace` clips are driven by it | P0 |
| Retargeting | `RetargetModifier3D`, bone maps | Free for VRM humanoids (normalized bones); mesh2motion-style rig mapping for non-VRM props | P0 |
| IK | `TwoBoneIK3D`, `FABRIK3D`, `CCDIK3D`, `SplineIK3D`, `JacobianIK3D` | Foot planting on stairs and slopes, hand IK for grips and doors, reach | P1 |
| Look-at | `LookAtModifier3D`, `AimModifier3D` | VRM `lookAt` plus head and spine aim at a target (camera, speaker, object) | P0 |
| Spring bones | `SpringBoneSimulator3D` + colliders | three-vrm `VRMC_springBone`, stepped at a fixed 1/60 s; optional world colliders. Deterministic in themselves (only `+ - * / sqrt`). The vendored three-vrm gains `getState` / `setState` for spring tails and lookAt, instead of engine code reaching into private fields | P0 |
| Bone constraints | `BoneConstraint3D`, copy/convert transform, twist disperser | `VRMC_node_constraint` via three-vrm | P0 |
| Attachments | `BoneAttachment3D`, `ModifierBoneTarget3D` | Item attach points on humanoid bones (VRMXW §8 states: held / stowed) | P0 |
| Expressions and morphs | blend shape tracks | VRM expressions, VRMXA eye and mouth states, custom expressions (G12) | P0 |
| Lip sync | none built in | Visemes (`aa ih ou ee oh`) driven from TTS word timings. **Already spiked** (AB-R-0888, `mlxengine-3d/DEV/VRMLipSync`): TalkingHead's lip-sync core (MIT) on three-vrm puts the mouth within 10 ms of the audio with ZONOS3 timings and +30 ms with Kokoro, no aligner pass needed. Live streaming adds about 150 ms delay | P0 |
| Tweens | `Tween` | Property tweens with easing, deterministic | P0 |
| Animation editor | track editor, Bezier editor, state machine and blend tree editors | Minimal track view first; state machine editor P1; reuse the avatar studio's motion editor (`vrmx-motion`, G18) | P1 |
| Ragdoll | `PhysicalBone3D`, `PhysicalBoneSimulator3D` | VRM humanoid → capsules and joints, one mapping for every VRM. Powered ragdoll is the Jolt trigger | P1 |

### 5.5 Characters

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Character body | `CharacterBody3D`, `move_and_slide` | Rapier kinematic character controller on a capsule, VRM on a parent group (never write `vrm.scene.rotation`) | P0 |
| Loading a character | glTF import, godot-vrm addon | Load `.vrmxa` (player level) and `.vrm`; VRM 0.x converted to 1.0 | P0 |
| Equipping at run time | none | Closet protocol at run time: put on, take off, change state, apply outfit; needs the fitting code (VRMXA level 2). Exists in `vrmxa-core/closet` and `/fit` | P0 |
| Cloning for crowds | `duplicate()` | Re-parse per copy (a VRM can't be cloned); clones get new ids (`CLOSET.md` §6). Cost per step in WKWebView (mixer + `vrm.update`, CPU only): 20 VRoid characters (106 spring joints each) about 3.0 ms, 20 Spec characters 0.85 ms | P1 |
| First person | none (manual) | VRM `firstPerson` mesh annotations, head hidden in the first-person camera | P1 |

### 5.6 Physics (settled by the spike)

Rapier (`@dimforge/rapier3d-deterministic-compat`) behind an engine adapter, Jolt as the fallback.
Godot's physics node set is the checklist:

| Godot node | VRMXG equivalent | Pri |
|---|---|---|
| `StaticBody3D`, `RigidBody3D`, `AnimatableBody3D` | Fixed, dynamic and kinematic bodies | P0 |
| `CollisionShape3D` + box/sphere/capsule/cylinder/convex/concave/heightmap shapes | Collider shapes, declared in VRMXI and scene data | P0 |
| `Area3D` | Sensors and trigger volumes (with the spike's two gotchas handled) | P0 |
| `RayCast3D`, `ShapeCast3D` | Persistent ray and shape cast nodes plus one-off queries | P0 |
| Joints (hinge, slider, cone-twist, 6DOF, pin) | Rapier joints with limits and motors (doors) | P0 |
| `CharacterBody3D` | Kinematic character controller | P0 |
| `VehicleBody3D` | Rapier raycast vehicle controller | P1 |
| `SoftBody3D` | Rapier 0.21 soft bodies (cloth, rope) | P2 |
| `SpringArm3D` | Camera boom with collision | P0 |
| Physics layers and masks | Named collision layers in the project | P0 |
| Snapshot / restore | (none in Godot) | World snapshots for timeline scrubbing (1.27 MB, 2–3.5 ms) | P0 |

### 5.7 Navigation and NPC AI

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Nav mesh baking | `NavigationRegion3D`, `NavigationMesh` | **navcat** (pure JS, MIT) behind a nav adapter, recast-navigation-js as the fallback (`spike-navigation/`). Bake tiled at edit time from the same arrays as the colliders (44 ms for 4,756 triangles) and store the navmesh as scene data. Colliders carry a nav flag (walkable / blocker only / ignore): thick wall tops otherwise bake as walkable | P1 |
| Path agents | `NavigationAgent3D` | Physics owns position, the crowd owns velocity: each step the body's foot position is written into the agent, the crowd updates, and its velocity feeds the Rapier character controller (drift 2–9 mm mean). Spawn by ray-casting down to the physics ground, never at navmesh height | P1 |
| Avoidance | RVO avoidance, `NavigationObstacle3D` | navcat's crowd, vendored with its fixed-angle `sin`/`cos` replaced by literals. Doors and props become unwalkable by a tile rebuild (about 1 ms). Budget: crowd 0.2 ms for 50 agents, 1.6 ms for 200; the Rapier controllers cost more (about 26 µs per character, 5.2 ms for 200) | P1 |
| Off-mesh links | `NavigationLink3D` | Run-time links with traversal hooks that hand jumps, ladders and doors to physics and animation | P2 |
| Navigation in snapshots | none | Crowd and navmesh state go into the timeline snapshot (navcat: 3.7 ms to take, 2.0 ms to restore, bit-identical re-run; recast-navigation keeps crowd state inside WASM with no snapshot API, which is why it is the fallback) | P1 |
| Behaviour | **nothing built in** (addons: LimboAI, Beehave) | Our own small runtime: behaviour trees with a **utility selector** node, a blackboard, JSON trees, node types in the registry, tree state in world snapshots, a seeded RNG per agent, no promises or wall-clock time inside the step. mistreevous (MIT) for the first spike and as the fallback; behavior3's node descriptors as the model for registry schemas (`research/npc-ai.md`) | P1 |
| Standard roles | none | Presets: wanderer, audience, guard, shopkeeper, follower, conversation partner, performer | P1 |
| Smart objects | none | Items and set pieces advertise what can be done with them (sit, use, look at), which feeds utility scores; ties to VRMXI verbs | P1 |
| Perception | none | Sight cone with Rapier line-of-sight rays, hearing as stimulus events, proximity sensors; a stimulus memory with decay and expiry; a per-step time budget | P1 |
| Action vocabulary | none | One shared list: `say`, `emote`, `gesture`, `lookAt`, `goTo`, `follow`, `interact`, `setGoal`, `wait`. Tree leaves, shot cues, the LLM director and MCP "drive" all use it | P0 |
| Persona-driven characters | none | An optional LLM director **outside** the 60 Hz step answers only with validated calls from the action list (expressions limited to the persona's, gestures to filled slots, targets to perceived ids); a bad reply falls back to the tree. Each reply is logged as an input stamped with its tick, so replay never calls the model; the anime creator bakes decisions, TTS audio and timings into the shot as an editable track. Latency is covered by behaviour (`listen`, `think`, gaze aversion, a filler line past about 1.5 s). Only companion and conversation roles use it, sharing one local model through a queue. Persona traits become numbers that weight utility scores; memory stays in the app | P1 conversation, P2 goal choice |
| AI debugger | Beehave / LimboAI debug views | Running branch, blackboard, memory and utility scores, in the inspector and over MCP | P1 |

### 5.8 Cameras and viewports

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Cameras | `Camera3D` (perspective, ortho, frustum), physical camera attributes | Physical `Camera` node: focal length in mm, sensor size, gate fit, focus distance or tracked focus target, f-stop, dutch angle. The engine does the thin-lens maths and drives the DOF effect (no library takes an f-stop) | P0 |
| Game cameras | (built by users) | Rigs built from virtual-camera behaviours: third person orbit, over the shoulder, first person, top down, fixed, rail/dolly, follow, orbit showcase. camera-controls (MIT) for editor navigation and orbit input | P0 |
| Virtual cameras and blends | `make_current` only | Cinemachine-style `VirtualCamera` (priority, channel, position and aim behaviours) and a `CameraBrain` per output that blends between them; damping on the 60 Hz step so it is deterministic; a sequence's camera track overrides priority. No three.js port of Cinemachine exists, so we build it (`research/cinematics.md`) | P1 |
| Cinematic rigs | none | Two-shot, shot / reverse shot that respects the 180° line, close-up, crane, handheld | P1 |
| Shake and effects | (built by users) | Seeded noise and impulses (trauma shake, handheld, zoom punch), keyable | P1 |
| Viewports | `SubViewport`, `ViewportTexture`, split screen | One renderer with scissored viewports and render targets, never a second `WebGLRenderer`; one brain per viewport; shadow map rendered once per frame. Measured at 720p: 1 view 1.2 ms, 4 views 2.9 ms with a shared shadow map, an in-set monitor adds about 0.7 ms | P1 |
| Remote transforms | `RemoteTransform3D` | Follow / constraint node | P1 |

### 5.9 Input

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Action map | `InputMap`, actions, dead zones | Named actions bound to keys, buttons and axes; rebindable; in the project document | P0 |
| Keyboard and mouse | `InputEventKey`, `InputEventMouse*`, pointer lock | Yes, including pointer lock | P0 |
| Gamepads | `Input.get_joy_*`, vibration | Gamepad API, standard mapping, rumble where supported | P0 |
| Touch | `InputEventScreenTouch/Drag`, gestures | Pointer events, virtual stick for iPhone | P1 |
| Picking | physics picking on `CollisionObject3D` | Pointer → Rapier ray for gameplay; `three-mesh-bvh` for exact mesh picking (skinned VRMs) | P0 |
| Camera input | `CameraFeed` | Webcam / iPhone camera feed | P2 |
| Gesture and body tracking | `XRHandModifier3D`, `XRBodyModifier3D`, `XRFaceModifier3D` | Pose, hand and face tracking mapped to actions or straight onto the VRM. MediaPipe Pose Landmarker is already the studio's choice for body capture (AB-D-0241; it beat Apple Vision in trial T-2, AB-R-0911) | P2 |
| Input recording | none | Record and replay input per step: deterministic replays and test fixtures | P0 |

### 5.10 Audio and voice

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Players | `AudioStreamPlayer`, `AudioStreamPlayer3D` | 2D and positional audio nodes (Web Audio) | P0 |
| Buses and effects | bus layout, reverb, EQ, compressor, limiter, delay … | Mixer buses (music, SFX, voice, ambience) with a basic effect set | P1 |
| Reverb zones | `Area3D` reverb bus | Reverb by area | P2 |
| Interactive music | `AudioStreamInteractive`, playlists | Layered and transitioning music | P2 |
| Microphone | `AudioEffectCapture` | Mic input for companion conversation | P1 |
| Character voice | none | VRMXA voice (§9): TTS / voice clone, played from the character with lip sync | P0 |

### 5.11 Particles and VFX

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| GPU and CPU particles | `GPUParticles3D`, `CPUParticles3D`, `ParticleProcessMaterial` | **three.quarks** (MIT), pinned, behind an adapter that owns the RNG, the fixed step, the maths and snapshots (`spike-particles/`). One API on WebGL and WebGPU; stretched billboards, flipbooks, sub-emitters, trails, mesh and soft particles. 10k particles cost about 0.7 ms per step in WKWebView, one draw call per material. three-nebula is the fallback; not three.proton (last release 2020, one draw call per particle) | P1 |
| Collision and attractors | `GPUParticlesCollision3D`, attractors | three.quarks' collision hook backed by Rapier queries; attractor fields | P2 |
| Sub-emitters and trails | sub-emitters, trails | three.quarks | P2 |
| Effect documents | `.tres` particle materials | VRMXG's own JSON effect document, compiled to three.quarks; quarks.art JSON accepted as an import (its export silently drops materials) | P1 |
| Anime effects | none | A built-in library of hard-edged effects: impact sparks and flash, sparkles, sweat drops, emotes. A stateless GPU kernel is an option for sparks and speed lines (zero CPU, exact scrubbing). Screen-space focus lines and impact frames belong to post-processing (G20) | P1 |
| Determinism | not guaranteed | The adapter swaps in a seeded RNG and the portable maths during each step: bit-identical in Node and WKWebView for every library tested. Scrubbing: snapshots every N frames (about 5 ms and 7.3 MB as JSON for 10k particles; reads three.quarks internals, so the version stays pinned) plus re-simulation (about 0.6 ms per frame) | P1 |

### 5.12 UI and HUD

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| UI toolkit | `Control`, containers, themes, `RichTextLabel` | HTML/Vue overlays for HUD and menus (our strength); no retained-mode UI toolkit inside the canvas | P0 |
| World-space UI | `SubViewport` on a mesh | Diegetic panels: CSS3D or rendered-to-texture | P1 |
| Dialogue | none built in (addons) | Dialogue boxes, choices, speech bubbles tied to voice and persona | P1 |
| Localization | `TranslationServer`, CSV/PO | String tables in the project | P2 |
| Accessibility | AccessKit (4.5+) | DOM UI gives screen readers for free; captions for voice | P1 |

### 5.13 Items and interaction (VRMXI)

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Item definition | none (scenes + scripts) | `.vrmxi`: model, colliders, mass, joints, sensors, internal animations, type, verbs, states | P0 |
| Standard item types | none | Door, container / loot box, pickup, switch / lever, seat, vehicle, ladder, screen / display, spawn point | P0 / P1 |
| Interaction system | (built by users) | Focus (ray or proximity), prompt, verb (`open`, `take`, `sit`, `use`, `talk`), animation slot (`use`, `sit`), result | P0 |
| Inventory | none | Inventory service; equippable items go through the closet protocol, others stay game data (`CLOSET.md` §6) | P1 |

### 5.14 Networking

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| High-level multiplayer | `MultiplayerAPI`, RPC, `MultiplayerSpawner`, `MultiplayerSynchronizer` | Defer. Determinism makes lockstep or rollback possible later | P2 |
| Transports | ENet, WebSocket, WebRTC | WebSocket / WebRTC when needed | P2 |
| HTTP | `HTTPRequest` | `fetch` | P0 |

### 5.15 Persistence

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Save games | `FileAccess`, `ConfigFile`, `ResourceSaver` | Save service: scene state, inventories, flags; through the wrapper on macOS, IndexedDB on the web | P1 |
| Character changes | n/a | Written back to `.vrmxa` by the closet protocol (one file per character at a time, VRMXA §4.1) | P1 |
| App data | n/a | Memory and per-app persona stay in the app, keyed by VRMXA id (VRMXA §11) | P0 |

### 5.16 Capture and cinematics (our biggest gap beyond Godot)

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Offline render | `MovieWriter` (fixed-fps, non-real-time, PNG/WAV/AVI) | Stepped from the shot's start on the fixed 60 Hz simulation clock; frames between steps (24 fps's odd frames, 25/50/29.97 fps) render interpolated presentation (§9 Q7). Frames are rendered at export size into the canvas (render targets in r187 skip tone mapping), read back asynchronously (WebGL2 pixel-pack buffer), and POSTed as raw RGBA ArrayBuffers to the wrapper's custom scheme, 2 in flight, with Swift's reply as backpressure. vImage flips and swizzles; AVAssetWriter writes H.264 or HEVC with B-frames for delivery, ProRes 4444 (un-premultiplied) or HEVC with alpha for compositing, AAC audio. Measured (`spike-frame-export/`): a 10 s shot exports in 1.0 s at 1080p30 and 5.2 s at 4K60; frame-exact A/V sync; bit-identical frames across processes and origins. Time-based post effects take their time from the frame number; audio mixed in an `OfflineAudioContext`. Not used: base64 frames, `takeSnapshot`, PNG sequences, wasm encoders | P0 |
| Browser-only export | n/a | WebCodecs + mediabunny (MPL-2.0) as a fallback: works in WKWebView and needs no more bytes than native at equal quality, but no alpha, no B-frames, slow HEVC, and frames dropped at low bitrates (guard the frame count) | P2 |
| Shot sequencer | `AnimationPlayer` tracks (camera, method calls, audio) | **Built in-house, not Theatre.js**: Theatre's editor is AGPL-3.0 and it has had no release since May 2024. One track core shared by `AnimationPlayer` and `Sequence`. Tracks: camera, animation (with "on twos" stepping), expression, look-at, dialogue (audio + visemes + subtitle), property, event, audio, post, simulation; markers and per-shot overrides. Stored as `sequences[]` in `.vrmxs`: integer frames at 24 fps, keys as `[frame, value, ease]` | P1 |
| Lip sync for shots | none | Viseme keys baked from TTS timing (or Rhubarb) into the dialogue track, editable | P1 |
| Timeline scrubbing | none | Authored tracks are computed from the frame number alone; physics and spring bones re-run from snapshots every N frames (spring-bone state must be in the snapshot, or scrubbed frames won't match played ones); option to bake simulation to keys | P0 |
| Screenshots and thumbnails | `Viewport.get_texture()` | Stills, turntables and thumbnails (G14 needs thumbnail sizes) | P0 |
| Render passes | none | Optional depth, normal, ID mattes for compositing | P2 |

### 5.17 XR

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| OpenXR / WebXR | `openxr`, `webxr` modules | WebXR through three.js later (visionOS is reachable via WebXR in Safari) | P2 |

### 5.18 Editor and tooling

Start minimal (engine notes: "the game development UI can start minimally for testing").

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Scene tree dock | `SceneTreeDock` | Tree view with add / reparent / delete | P0 |
| Inspector | `InspectorDock`, generated from properties | Generated from the node registry (the same schema MCP uses) | P0 |
| 3D viewport | gizmos, snapping, multiple views | `TransformControls`, snapping, orbit / fly navigation | P0 |
| Asset browser | `FileSystemDock`, import dock | Project asset list; drag VRMXA / VRMXW / VRMXI / glTF in | P0 |
| Undo / redo | `EditorUndoRedoManager` | Command stack; MCP edits are undoable too | P0 |
| Play in editor | run scene, remote tree | Play / pause / step in place; inspect the running tree | P0 |
| Debug draw | collision shape and nav visualisation | Collider (Rapier `DebugRenderPipeline`), ray, nav mesh, sensor and AI debug overlays | P0 |
| Profiler and monitors | profiler, visual profiler, monitors, ObjectDB profiler | Frame time, step time, draw calls, memory, physics stats | P1 |
| Asset library | `asset_library` | Later; the closet and item libraries come first | Skip |
| Version control | VCS plugin | Skip; files are diffable text | Skip |
| Project manager | project manager | Simple project open/create | P1 |

### 5.19 Asset pipeline

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Import | glTF, FBX, OBJ, Blend, images, audio | glTF/GLB, VRM, VRMA, BVH (converter exists), images, audio | P0 |
| Compression | Basis/KTX2, meshoptimizer, `etcpak`, ASTC | KTX2, meshopt, Draco for props. **Never run gltf-transform on a `.vrm`/`.vrma`**: it drops every `VRMC_*` extension | P1 |
| Convex decomposition | `vhacd` | Convex decomposition for item colliders | P1 |
| Lightmap UV unwrap | `xatlas_unwrap` | With baked lighting | P2 |

### 5.20 Platforms and export

| Feature | Godot | VRMXG | Pri |
|---|---|---|---|
| Targets | desktop, mobile, web, XR | Web; macOS via the WKWebView shell; iPhone later via the same pattern | P0 / P2 |
| Export | export templates and presets | A build that bundles the runtime, the scene and its assets | P1 |
| Threads | worker thread pools | Single-threaded by default. Loopback serving unlocks threads if ever needed (spike) | — |

### 5.21 MCP and agents (not in Godot)

| Capability | Pri |
|---|---|
| **Describe:** list node types, properties, signals, actions and their JSON Schemas from the registry. Tools stay generic (≈ 900 tokens for 12 tools) and `describe` returns a type's schema on demand; one tool per type costs ≈ 660 tokens per type and doesn't scale (`spike-registry/`, AB-R-0933) | P0 |
| **Inspect:** read the scene tree, a node's state, the camera view (screenshot), physics and AI state | P0 |
| **Edit:** add, remove, reparent and set properties; every change undoable and saved as scene data | P0 |
| **Drive:** play / pause / step, send input actions, trigger interactions, cue a character (say, emote, go to) | P0 |
| **Produce:** set up a shot, render frames, export | P1 |
| **Validate:** run checks on scenes and items (missing colliders, licences, unfitted items) | P1 |

---

## 6. What to take from the reference repos

| Repo | Licence | What it is | Take |
|---|---|---|---|
| **vrmxa-avatar-studio** (ours) | private | The VRMXA / VRMXW editor; same stack (Vue 3.5, three r187, three-vrm 3.5.5, Swift wrapper) | **Reuse, don't rebuild.** `@xocialize/vrmxa-core` already has: bundle read/write/check (`.`), the closet protocol at run time (`./closet`: `putOn`, `takeOff`, `applyOutfit`), Spec-fit (`./fit`), animation sets resolved from equipped tags (`./anim` `sets.js`: `resolveSlots`, `pickClip`), clip corrections, BVH and Mixamo import. Also `stage-effects` (spawn and equip reveal), the stage in `app/src/stage/`, the Swift bridge (`app/src/native.js`) and the AppProbe hooks (`app/src/probe/`) |
| **MavonEngine** (`Core-dev`) | MIT | Early TypeScript engine on three r184 + Rapier 0.21, multiplayer-first, React editor | The closest stack to ours. Typed scene-object registry with per-side factories and `serialize()` (fits VRMXI types); scene JSON v1 (`{id, type, name, transform, props}`); stack-based entity states; Rapier debug renderer; an editor that attaches to the running game; a read-only **dev bridge exposed as an MCP server** (`info`, `entities`, `scene`, `screenshot`, `trace`); headless `BaseGame` for server-side physics; Source-style networking for later |
| **Mage** | BSD-3-Clause | Mature three.js engine (three 0.126) with an editor | Level lifecycle (`prepareScene` … `onDispose`) with one pause / resume contract across every subsystem; entity + attached scripts + per-entity state machine; level JSON importer with a separate "realize physics" pass that refuses solid colliders on backdrop meshes; auto-instancing of repeated meshes; 30 examples as a feature checklist; one public API shared by editor and runtime |
| **mesh2motion** | MIT code, CC0 assets | Open auto-rig and animation app (three r187) | 234 CC0 humanoid clips (attacks, bow, chest-open, chop) to retarget into a starter animation set; a CC0 weapon-prop catalogue with hand-bone attachment (seed VRMXI held items); a bone auto-mapper (synonym table + chain resolver) for importing non-VRM rigs; swing-twist retargeting |
| **Rapier** | Apache-2.0 | The chosen physics | Beyond rigid bodies: character controller (autostep, slopes, snap-to-ground, pushing), raycast vehicle, **PID controller** (hovering items, camera drones), soft bodies with tearing and cutting, multibody joints (ragdolls, chains), `DebugRenderPipeline` for the debug overlay, physics hooks (one-way platforms), serialization |
| **ActionMesh** (Meta) | FAIR Noncommercial — bars commercial use of code, weights **and outputs** | Video → animated mesh (vertex animation, no skeleton) | Ideas only. Not shippable, and vertex animation doesn't fit VRM rigs |

**Consequences for this PRD:**
- M0 is smaller than it looks: the VRMXA player, closet at run time and animation-set resolution
  exist in `vrmxa-core` and become engine dependencies.
- The MCP surface starts the way MavonEngine's does (read-only describe / inspect, screenshot),
  then adds edit and drive.
- The scene format (§4.1) has a concrete starting shape in MavonEngine's scene JSON.
- Open in the studio: WebKit has not yet been checked on three r187
  (`vrmxa-avatar-studio/Docs/handoffs/THREE-R187-ADOPTION.md`); the physics spike ran r187 in
  WKWebView, which covers part of it.

## 7. What VRMXG adds that Godot doesn't have

1. **VRMXA characters as a native type**, with the closet protocol at run time: a character picks
   up a sword in a game and keeps it in its closet.
2. **Animation sets chosen by what is equipped** (tags), with item-brought sets.
3. **Voice, lip sync, eye and mouth states and persona** wired into the character.
4. **Determinism and snapshots** as an engine guarantee, for scrubbing and repeatable renders.
5. **A shot sequencer and offline export** for anime shorts and spokesmodel spots.
6. **Agent-first**: one registry feeds the inspector, the scene format and MCP.
7. **VRMXI game items** that share conventions with VRMXW wearables.

## 8. Phasing

*M0 is planned in detail in [M0-PLAN.md](M0-PLAN.md) (plan AB-P-0013, tasks AB-T-0501 to 0510).*

| Phase | Scope |
|---|---|
| **M0 Runtime core** | Node tree, scenes, signals, fixed-step loop with interpolation, Rapier adapter, VRMXA player, animation slots and state machine, character controller, cameras (presets), input map, picking, debug draw, MCP describe / inspect |
| **M1 Playable** | VRMXI items and interaction, closet protocol at run time, look-at, lip sync, audio, minimal editor (tree, inspector, gizmos, play), MCP edit / drive, frame export |
| **M2 Production** | Shot sequencer, virtual cameras and blends, post stack, particles, navigation and behaviour trees, save, layered animation (G10), IK |
| **M3 Later** | Persona-driven NPCs, ragdolls, vehicles, viewports and split screen, networking, WebXR, WebGPU, camera and gesture input |

## 9. Open questions for the follow-up

1. **Scene format.** *Decided 2026-11-17 (AB-D-0246): our own JSON (`.vrmxs`) as the source of
   truth, glTF for assets and as an export target (§4.1).*
2. **VRMXI.** *Decided: a separate format for items that aren't equipped (§4).* Still open: does
   a pickup VRMXI embed its VRMXW or reference it, and who owns the specification
   (`VRMXA_Specification` or this repo)?
3. **Behaviours.** *Decided 2026-11-17 (AB-D-0247): plain scripts attached to nodes (Godot, Mage
   and MavonEngine all work this way), plus a per-node state machine; no ECS in M0.*
4. **Apps.** *Decided: the editor is a new app, alongside a game UI app and an anime creator app
   (§1).* Still open: do spokesmodel spots belong in the anime creator or get an app of their own,
   and do the three apps share one Swift wrapper?
5. **Particles and navigation.** *Settled by spikes: three.quarks for particles
   (`spike-particles/`), navcat for navigation (`spike-navigation/`).*
6. **NPC AI.** *Recommendation (`research/npc-ai.md`): behaviour trees as the executor with
   utility selection inside them, and an optional LLM director above whose decisions are recorded
   as inputs.* Still open: how browser builds reach a local LLM (the WKWebView shell can go through
   the native bridge to MLXEngine; no general local LLM HTTP server exists in the fleet yet).
7. **Determinism scope.** *Decided 2026-11-17 (AB-D-0248), on `spike-determinism/` and
   `@vrmxg/dmath`:*
   - **Inside the boundary:** physics, navigation, AI, animation sampling and blending, spring
     bones, node constraints, lookAt, expression weights, root motion, particles that affect
     gameplay. Code inside may use only `+ - * /`, `sqrt`, `floor`/`round`/`abs`/`min`/`max`,
     `Math.imul` and the twelve `dmath` functions (so `Math.pow`, `exp`, `log` and `hypot` only with
     `dmath` installed); never the `**` operator (it bypasses a patched `Math.pow`), `sinh`/`cosh`/
     `tanh`/`expm1`/`log1p`/`log2`/`log10` (not in `dmath`), `Math.random`, wall-clock time, or
     `Object3D.rotation` (the Euler mirror).
   - **Presentation only:** rendering and skinning, interpolation between steps, cameras, MToon UV
     animation, post effects, UI and audio timing.
   - **Step rate: 60 Hz, with interpolated presentation for other output rates.** *Decided
     2026-11-17 (AB-D-0245), on `spike-steprate/` (AB-R-0932).* Spring bones stepped at 120 Hz move p95
     2.7–23° differently from the 60 Hz reference (max 55–171°), because `VRMC_springBone` applies
     drag, push and constraints per step; rescaling the parameters doesn't fix it. Interpolating
     between two 60 Hz steps costs an estimated p95 0.4–1.1°, and only in presentation. 120 Hz
     would also double every system's step cost and still miss 25, 50 and 29.97 fps. So frame *n*
     at *fps* steps the clock to `floor(n / fps · 60)` and renders at `α = frac(n / fps · 60)`:
     at 24 fps, even frames are exact steps and odd frames α = 0.5. Bone rotations interpolate
     through `dmath` slerp, so exports stay bit-identical across runs and engines; cameras,
     sequencer tracks and post effects are evaluated at the exact time. A scene that needs a
     finer physics step substeps Rapier inside the 60 Hz tick.
   - **Fallback if `dmath` is ever dropped:** determinism holds per engine build only (repeat runs
     always matched), so a shot must render on the engine it was made on, and a macOS update can
     change JSC under a saved shot. Still open: whether to harden with a build step that rewrites
     `Math.*` inside three and three-vrm.
8. **Reuse from the avatar studio.** *Decided 2026-11-17 (AB-D-0249): the engine depends on
   `@xocialize/vrmxa-core` in place (path/git dependency on `vrmxa-avatar-studio/packages`); the
   avatar studio keeps owning it, and engine needs go there as asks. Extract to a shared repo
   later if release cadence demands.*
9. **Starter content:** retarget mesh2motion's CC0 clips and props into a default animation set
   and item pack?

## 10. Sources

- Godot 4.8-beta source: `reference/godot-master` — `scene/3d/`, `scene/3d/physics/`,
  `scene/3d/navigation/`, `scene/animation/`, `servers/movie_writer/`, `servers/audio/effects/`,
  `modules/`, `editor/docks/`, `editor/animation/`, class reference in `doc/classes/`.
- VRMXA specification: `VRMXA-base-draft.md` §8 (animations), §13 (environment, reader levels);
  `VRMXW-base-draft.md` §8–§9 (attachment, states, item animations); `CLOSET.md` §1, §6;
  `OPEN-ISSUES.md` G10–G12, G14, G18, G20.
- Physics: `physics-engine-research.md`, `spike-physics/README.md`.
- Spikes: `spike-determinism/`, `spike-navigation/`, `spike-particles/`, `spike-frame-export/`,
  `spike-cinematics/` (each `README.md`, raw JSON in `results/`). Research: `research/npc-ai.md`,
  `research/cinematics.md`. AgentBridge: AB-R-0888 (lip sync), AB-D-0241 and AB-R-0911 (MediaPipe),
  AB-B-0038 (browser video encoding).
- Engine notes: `vrmxa-game-engine-notes.md`.
- Reference repos: `reference/Mage-master/ARCHITECTURE.md`, `reference/Core-dev/packages/core/src/`
  (`Scene/`, `Dev/bridgeProtocol.ts`), `reference/mesh2motion-app-main/src/retarget/`,
  `reference/rapier-master/bindings/typescript/src.ts/control/`;
  `vrmxa-avatar-studio/packages/vrmxa-core/package.json` (exports),
  `vrmxa-avatar-studio/Docs/VRMXA-AVATAR-STUDIO-PRD.md` §10, §16.
