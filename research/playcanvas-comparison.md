# VRMXG and PlayCanvas: a comparison

*2026-11-23. The operator asked for an objective comparison with PlayCanvas, and whether its editor UI would suit our
scene builder and a VRMXI editor. This is a reading of their source and docs, not a benchmark: nothing here was run or
timed.*

## Summary

- **They are different products that overlap in the editor.** PlayCanvas is a general-purpose web engine with its own
  renderer and a hosted, collaborative editor. VRMXG is a character-first, deterministic engine on three.js for films
  and small games, with local files and no server.
- **PlayCanvas is clearly ahead in three places:** the renderer (its own, on WebGL 2 and WebGPU), the editor's polish,
  and everything around the product (docs, examples, tests, import pipeline).
- **VRMXG is clearly ahead where our product lives:** determinism and replay, VRM characters, cinematics and exact
  video export, navigation, NPC AI and voice. PlayCanvas has none of these in its engine.
- **Their editor can't be our editor.** It is MIT, but it only runs against PlayCanvas's hosted backend, and its
  viewport is their engine. Their UI library (PCUI) is a poor fit for a Vue app and has no accessibility markup at
  all, which our app tests depend on.
- **Their editor is worth copying as a design.** The recommendations below list eleven things to add or adjust, most
  of them in the inspector and viewport, and all of them things the VRMXI editor will need too.
- **Several of our choices are confirmed by their own docs:** Rapier over ammo.js, HTML overlays over an in-canvas UI,
  and building a sequencer ourselves.

## What was reviewed

All shallow clones in `reference/playcanvas/` (git-ignored), every one MIT:

| Repo | Version | Last commit |
|---|---|---|
| `engine` | 2.25.0-beta.11 | 2026-11-23 |
| `editor` | 2.37.0-beta.0 | 2026-11-23 |
| `pcui` | 6.2.0 | 2026-11-11 |
| `pcui-graph` | 5.2.5 | 2026-11-11 |
| `observer` | 1.8.1 | 2026-11-11 |
| `editor-api` | 1.1.28 (archived, now vendored in `editor`) | 2025-12-18 |
| `developer-site` | the source of developer.playcanvas.com, 709 pages | 2026-11-23 |

Three readers surveyed the engine, the editor with PCUI, and the docs. I spot-checked the claims this document leans
on (the variable time step, the alpha physics seam, the backend the editor needs, PCUI's missing ARIA, the MCP
method count) against the source.

## At a glance

| | PlayCanvas | VRMXG |
|---|---|---|
| Purpose | General web 3D: games, ads, configurators, splat scenes | Anime shorts, companions and small games around VRMXA characters |
| Renderer | Its own. WebGL 2 by default, WebGPU opt-in and labelled beta. Every shader in GLSL and WGSL | three r187. WebGL and WebGPU, with a patched three-vrm for MToon |
| Size | Engine about 281,000 lines; editor about 184,000 | Engine packages about 45,500 lines; apps about 6,500; shell 1,700 of Swift |
| Tests | About 4,640 test cases; 322 examples | About 460 test cases, plus the acceptance matrix and AppProbe scenarios |
| Time step | Variable, clamped to 0.1 s. Only physics steps at a fixed 1/60 s | Fixed 60 Hz for everything; presentation interpolated |
| Determinism | None: unseeded `Math.random` in particles, no input recording, no snapshots | Bit-identical across Node, Chromium and WKWebView; snapshots and replay |
| Physics | ammo.js (Bullet). No character controller, no shape casts | Rapier's deterministic build, with a character controller and snapshots |
| Characters | Skinned glTF. No VRM, MToon, retargeting, root motion or IK | VRMXA-native: MToon, spring bones, closet, expressions, lip sync, look-at |
| Animation | State graph with layers, masks and four blend-tree types | Slot-driven state machine and blend spaces; masked blend trees are P1 |
| Cinematics | None in the engine or editor | Scripts to sequences, virtual cameras, coverage by rule, a timeline |
| Video export | None (a screenshot tutorial) | Exact frames to AVAssetWriter; H.264, HEVC, ProRes; a one-minute 4K delivery in 34 to 66 s (AB-R-1081) |
| Navigation and AI | None; docs point to recast-navigation-js | navcat, behaviour trees, perception, a persona director |
| Voice | None | TTS, lip sync, voicing of script lines |
| Scene format | JSON keyed by GUID, held by their server. The engine can load a scene but not write one | `.vrmxs` files: stable ids, one line per node, unknown data kept |
| Editor | Hosted, real-time collaborative, with branches and checkpoints | Local files, a Mac app, no server |
| In-game UI | An in-canvas UI system | HTML and Vue overlays |
| Agents | An MCP server with 131 methods, `llms.txt`, published Skills | Generic MCP tools generated from the node registry (7 to 10 tools) |
| Docs | 709 pages, a Unity migration guide | READMEs and plans |
| Also | Gaussian splats (their deepest area), WebXR, localisation, glTF and USDZ export | VRMXI items, wearables, the closet protocol |

## Where PlayCanvas is ahead

1. **It owns its renderer.** A graphics bug is theirs to fix. We wait on three.js and three-vrm, and carry a patch.
   That is the cost of principle 2 ("three.js as provided"), and I wouldn't change it: their renderer is most of
   their 281,000 lines.
2. **A broader post stack.** TAA, SMAA, SSAO, auto exposure, volumetric fog, lens flare and a dynamic sky, as one
   pluggable list (`extras/render-passes/camera-frame.js`). Ours is narrower and tuned for the anime look.
3. **Gaussian splats.** Streaming, level of detail, shadows and relighting, with their own editor (SuperSplat). It is
   the most documented part of the product.
4. **An editor with years of polish.** Multi-select editing, numbers you drag to change, per-field copy and paste,
   prefab overrides with apply and revert, asset thumbnails, typed drag and drop, a view cube, selection outlines, a
   camera preview, and editors for curves, gradients, sprites, materials and animation graphs.
5. **Editor parts in the engine itself.** A full gizmo set with shape handles, an ID-buffer picker with rectangle
   select, an outline renderer and a grid (`src/extras/`).
6. **An import pipeline.** FBX to GLB, texture compression, fonts to MSDF, Draco, UV unwrapping. It runs on their
   servers.
7. **Maturity around the code.** About ten times our test count, 322 examples, 709 pages of docs, tree-shakeable
   builds, and types checked by `tsc` from JSDoc.
8. **Agent tooling as a product.** Their MCP server can also start the running game, capture it, read its logs and
   inject input. They publish `llms.txt` indexes and Skills, and most doc pages point agents at the MCP server.

## Where VRMXG is ahead

1. **Determinism.** Their loop uses a variable time step, particles call `Math.random`, and nothing records input.
   A shot there can't be replayed or re-exported identically. This is our product requirement and their absence.
2. **Characters.** No VRM, no MToon or any toon material, no humanoid retargeting, no root motion, no IK. Their own
   Unity migration guide lists the last three as missing.
3. **Cinematics and export.** No timeline, sequencer or video export in the engine or editor. Their docs suggest
   scripts with curve attributes.
4. **Navigation, NPC AI, dialogue, save.** All absent; the docs point to outside libraries.
5. **Physics for characters.** No character controller and no shape casts. Vehicles and soft bodies mean writing
   Bullet code by hand.
6. **A scene format built for files.** Theirs lives on a server and the engine has no serializer. Ours diffs line by
   line, survives round trips with unknown data, and is what MCP and undo address.
7. **No server.** Their editor needs REST, a real-time server, a messenger and a relay. Ours opens a folder.
8. **An editor that can be tested through accessibility.** Our controls carry ids and names, and AppProbe drives
   them. PCUI has no `aria-*` or `role` attributes anywhere in its source.
9. **A smaller agent surface.** Their MCP exposes 131 methods. Ours stays at 7 to 10 generic tools because the
   registry describes the rest on demand. Both approaches work; ours costs fewer tokens per session.

## Choices they made differently, and what their docs say

- **Physics.** They ship ammo.js, and their own page on alternatives calls it heavy, lists Rapier and Jolt, and notes
  that Rapier's WebAssembly builds are deterministic across platforms out of the box. They have started a pluggable
  physics layer (marked alpha) to allow it. Our choice stands.
- **In-game UI.** They built an in-canvas UI system, then document that it is invisible to screen readers, has no
  text input, and that HTML overlays are the answer for both. Our choice stands.
- **Play mode.** Their editor has no play-in-place. A separate Launch page stays linked to the editor, and edits are
  never discarded. Ours builds the game from a copy and restores on Stop, which is what determinism needs.
- **Scripting.** Script attributes are JSDoc tags parsed into the inspector, and a script can implement `swap()` to
  hot-reload. Our behaviours already declare their parameters in the registry, which does the same job.
- **Version control and collaboration.** Built into their backend. We skip both because scenes are diffable files.

## Their editor and PCUI as our UI

**The editor app: no.**
- It is a frontend only. The server supplies the HTML shell, the component schema, the scene data, and the heavy
  operations (applying a prefab, large deletes, asset import) as server jobs.
- Running it locally still means opening `playcanvas.com/editor/scene/<id>?use_local_frontend` with an account.
- A new seam lets a host declare which services it lacks, but the reads every page needs, and the real-time
  connection, are still required. No offline or mock backend exists.
- The viewport, gizmos, picking and thumbnails are their engine. Ours would have to be rewritten against three.js.

**PCUI as our component library: no.**
- It has no Vue wrapper, so we would write about 30 by hand.
- It binds to its own Observer objects, so state would live in two reactive systems.
- It has no accessibility markup. Checkboxes, tree rows, menus and panel headers are plain `div`s. Our AppProbe
  scenarios, and the PRD's accessibility goal, would lose their footing.
- It is dark-only, themed at compile time, and the editor stops `mousedown` and the context menu globally.

**As a design to copy: yes.** It is MIT, so single pieces of logic can also be ported with their notice. The best
candidates:

| Piece | Where | Why |
|---|---|---|
| Number field you drag to scrub, with arithmetic | `pcui/src/components/NumericInput/` | The most-used inspector control |
| Tree drag, reorder and multi-select rules | `pcui/src/components/TreeView/` | Edge cases already worked out |
| Prefab override logic | `editor/src/editor/templates/compute-overrides.ts`, `revert-overrides.ts` | Plain functions over entity JSON |
| `visibleif` / `enabledif` evaluator | `editor/src/editor/scripting/expr-eval/` | Safe expressions, no `eval` |
| Curve and gradient pickers | `editor/src/editor/pickers/picker-curve.ts`, `picker-gradient.ts` | For the design, not the code: they use engine classes |
| Typed drop targets | `editor/src/common/pcui/element/element-drop-target.ts` | Viewport and inspector slots share one system |

## Recommendations

Sizes: S about a day, M a few days. Everything in the first group goes into `@vrmxg/editor-ui`, so the editor, the
creator and a VRMXI editor all get it. The operator approved all eleven on 2026-11-23; each is filed as a bridge task.

### Add to the editors

| # | What | Size | Why now | Task |
|---|---|---|---|---|
| 1 | **Real widgets instead of JSON text.** Seven registry props show as a JSON box today (tracks, the post stack, answers, senses and more). Add vector, list-of-struct, map and curve widgets | M | The largest gap a person sees. A VRMXI's colliders, joints, states and verbs are all lists of structs | AB-T-0599 |
| 2 | **A number field you drag, that accepts arithmetic** | S | Every transform and every prop uses it | AB-T-0600 |
| 3 | **Multi-select editing** with a "mixed values" state | M | We select several nodes already, but edit one | AB-T-0601 |
| 4 | **Conditional fields** (`visibleIf`, `enabledIf`) in the registry's prop schema | S | Shorter inspectors, and MCP's `describe` can say when a prop applies | AB-T-0602 |
| 5 | **Prefab overrides you can see:** a mark on each overridden field, revert, apply to the prefab, a diff view | M | Our format has overrides by id, and the editor shows none of it. Ours can be undoable; their apply is not | AB-T-0603 |
| 6 | **Viewport aids:** a selection outline, a view cube, a camera preview, rectangle select, duplicate and copy and paste | M | Standard in every scene editor | AB-T-0604 |
| 7 | **Shape handles:** drag a box, sphere or capsule to size it, for colliders, sensors and lights | M | Needed for the VRMXI editor; today sizes are typed | AB-T-0605 |
| 8 | **Assets panel:** thumbnails (we render storyboard thumbnails already), type filters and search, and dropping an asset or node onto an inspector slot | M | The asset list is plain names | AB-T-0606 |
| 9 | **Small things:** tree search, resizable and collapsible panels that remember their size, a shortcuts sheet, per-field copy and paste | S each | Cheap polish | AB-T-0607 |

### Adjust in the engine and tooling

| # | What | Size | Why | Task |
|---|---|---|---|---|
| 10 | **An `llms.txt`-style index and a VRMXG skill** for agents: the registry, the MCP tools, the formats | S | "Agent first" is a principle, and theirs is ahead in packaging it | AB-T-0608 |
| 11 | **Masked, layered blend trees** modelled on their anim graph (layers with a weight, a mask, overwrite or additive) | M | This is our open item G10; theirs is a working design to follow | AB-T-0609 |

### Watch, not build

- **Gaussian splat sets.** Captured places as backgrounds for shorts. Worth a spike after M4, with two questions
  first: does a splat render identically across runs, and how does it sit beside MToon characters.
- **An animation state graph editor** (PRD P1). Their node-graph library wraps JointJS; a Vue-native graph library
  would suit us better. Not evaluated here.
- **A user manual.** If others are to build on VRMXG, this is the largest gap against a "solid offering".
- **Import-time compression** (KTX2, meshopt). Already P1 in the PRD; they show it belongs in the import step.

### Keep as it is

- Rapier, the fixed step and `dmath`.
- HTML and Vue for in-game UI.
- Files and git instead of built-in version control and collaboration.
- Play from a copy of the document.
- three.js as provided.

## A VRMXI editor

A separate UI stack isn't needed. An item is a small scene: a model, colliders, joints, sensors, states and verbs.
The creator showed the pattern: a new app on the editor's host and `@vrmxg/editor-ui`.

What it needs beyond the scene editor is mostly the list above:
- the struct and list widgets (1), for colliders, joints, states and verbs;
- shape handles (7), to fit colliders to the model;
- conditional fields (4), since a hinge and a slider show different limits;
- a state preview, stepping the item through its states and verbs in the viewport;
- the VRMXI checker's results beside the fields they concern.

So items 1, 4 and 7 come first if the VRMXI editor is next.

## Not checked

- Nothing was run. There is no performance comparison, and none would be fair across two renderers without a
  shared scene.
- The PlayCanvas editor was read, not used: the notes on its feel come from its source and docs.
- PCUI's built size wasn't measured.
- How WebKit exposes PCUI controls to accessibility is inferred from the markup, not tested.
