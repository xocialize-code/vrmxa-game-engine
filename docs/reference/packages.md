---
title: "Packages"
description: "The 37 engine packages, one line each, and which side of the determinism boundary each is on."
order: 90
---

# Packages

> Generated from every `engine/packages/*`: its `package.json` and the opening of its README by `scripts/docs-reference.mjs`. Don't edit it: change the code and run `npm run docs:reference`.

The engine is 37 packages under `engine/packages/`, each with its own tests. Until a package has pages of its own
here, its README in the repository is its manual.

**Boundary** says which side of the determinism boundary a package's code is on ([Determinism](../guide/determinism)):
`simulation` packages are held to the `vrmxg/deterministic` lint rule, `tooling` packages work on documents, and the
rest are presentation or run outside the 60 Hz step.

| Package | Version | Boundary | What | Manual |
|---|---|---|---|---|
| `@vrmxg/ai` | 0.1.0 | simulation | NPC brains, as `research/npc-ai.md` recommends. | `engine/packages/ai/README.md` |
| `@vrmxg/audio` | 0.1.0 | simulation | Sound for VRMXG: what plays is simulation, what is heard is presentation. | `engine/packages/audio/README.md` |
| `@vrmxg/bundle` | 0.1.0 | tooling | A project exported as a game build: a web folder with the runtime, the game's files and a manifest that lists every file with its SHA-256 and its licence. | `engine/packages/bundle/README.md` |
| `@vrmxg/camera` | 0.1.0 | simulation | The physical Camera node, gameplay rig presets stepped with the simulation, a spring arm, cinematic VirtualCameras and CameraBrains, Path3D, the `cameras` service, and picking. | `engine/packages/camera/README.md` |
| `@vrmxg/cast` | 0.1.0 | simulation | Casting for the anime creator. | `engine/packages/cast/README.md` |
| `@vrmxg/character` | 0.1.0 | simulation | VRMXA and VRM characters for the scene tree, inside the determinism boundary. | `engine/packages/character/README.md` |
| `@vrmxg/closet` | 0.1.0 | simulation | The closet at run time: what a character wears changes during play, through vrmxa-core's closet protocol (CLOSET.md §5) on the character's own `.vrmxa` bundle. | `engine/packages/closet/README.md` |
| `@vrmxg/core` | 0.1.0 | simulation | The runtime core: a node tree over three.js that runs a `.vrmxs` scene at a fixed 60 Hz, inside the determinism boundary. | `engine/packages/core/README.md` |
| `@vrmxg/coverage` | 0.1.0 | simulation | Coverage cameras for the anime creator. | `engine/packages/coverage/README.md` |
| `@vrmxg/director` | 0.1.0 |  | The LLM director, as `research/npc-ai.md` §4 recommends. | `engine/packages/director/README.md` |
| `@vrmxg/dmath` | 0.1.0 | simulation | Portable transcendental `Math` for VRMXG's deterministic simulation. | `engine/packages/dmath/README.md` |
| `@vrmxg/editor-core` | 0.1.0 |  | The editor's model without UI or three.js: a scene open for editing, its selection, undoable commands, assets placed as nodes, save, and play in place. | `engine/packages/editor-core/README.md` |
| `@vrmxg/editor-ui` | 0.1.0 |  | The Vue components the editor and the creator share, over `@vrmxg/editor-core`'s model. | `engine/packages/editor-ui/README.md` |
| `@vrmxg/export` | 0.1.0 |  | Offline frame export, the pipeline spike-frame-export chose. | `engine/packages/export/README.md` |
| `@vrmxg/game` | 0.1.0 | simulation | Game flow: what makes a scene a game. | `engine/packages/game/README.md` |
| `@vrmxg/input` | 0.1.0 | simulation | Named actions bound to keys, mouse and gamepads, latched once per simulation step, recorded and replayed; and the player controller. | `engine/packages/input/README.md` |
| `@vrmxg/interact` | 0.1.0 | simulation | Characters interacting with VRMXI items: focus, prompts, the verbs `use`, `take`, `talk`, `sit` and `stand`, and an inventory for items that can't go into a closet. | `engine/packages/interact/README.md` |
| `@vrmxg/item` | 0.1.0 | simulation | VRMXI game items in the engine, on the draft specification (`VRMXA_Specification/VRMXI-base-draft.md`): read and check `.vrmxi` files, Item nodes with their bodies … | `engine/packages/item/README.md` |
| `@vrmxg/mcp` | 0.1.0 |  | The VRMXG MCP server: describe node types from the registry, edit a `.vrmxs` scene with undo, and inspect and drive it, either in a headless engine running in Node or in the open VRMXG editor. | `engine/packages/mcp/README.md` |
| `@vrmxg/model` | 0.1.0 | simulation | Model nodes: glTF sets and props, parsed once per file before the scene is instantiated and cloned into every node that uses them (geometry and materials shared) … | `engine/packages/model/README.md` |
| `@vrmxg/nav` | 0.1.0 | simulation | Navigation. It uses [navcat](https://github.com/isaac-mason/navcat) 0.4.1 (MIT), a pure-JS Recast/Detour, behind the engine's adapter, as `spike-navigation/` chose; recast-navigation-js stays the fallback. | `engine/packages/nav/README.md` |
| `@vrmxg/particles` | 0.1.0 | simulation | Particles: [three.quarks](https://github.com/Alchemist0823/three.quarks) 0.18.0 (MIT) behind the deterministic adapter `spike-particles/` proved. | `engine/packages/particles/README.md` |
| `@vrmxg/persona` | 0.1.0 |  | Who each character is, for the director and the brains, from VRMXA §10–§11. | `engine/packages/persona/README.md` |
| `@vrmxg/physics` | 0.1.0 | simulation | Physics for the engine: an engine-neutral adapter implemented on Rapier's deterministic build (`@dimforge/rapier3d-deterministic-compat` 0.21.0), the RigidBody, Collider and Area nodes, the hinge behaviour … | `engine/packages/physics/README.md` |
| `@vrmxg/post` | 0.1.0 |  | The post stack and the anime look, as scene data: an `Environment` node's `post` is a preset name or a list of effects, and the render host draws through it. | `engine/packages/post/README.md` |
| `@vrmxg/registry` | 0.1.0 | tooling | The VRMXG node registry: node types with typed props, signals and actions, and behaviours. Schemas, validation, the inspector and MCP tools are generated from it. | none yet: read `src/` |
| `@vrmxg/render` | 0.1.0 |  | The render host: a three.js WebGL renderer (and now a WebGPU one: see "WebGPU" below) set up for MToon, presentation interpolated at the clock's α without touching simulated state … | `engine/packages/render/README.md` |
| `@vrmxg/save` | 0.1.0 |  | Save games. A save is the world snapshot (`@vrmxg/snapshot`) in a versioned file. | `engine/packages/save/README.md` |
| `@vrmxg/scene` | 0.1.0 | tooling | VRMXG .vrmxs scenes: JSON Schema from the registry, canonical line-stable I/O, lint, prefab flattening, and edits with undo. | none yet: read `src/` |
| `@vrmxg/script` | 0.1.0 | simulation | Scripts for the anime creator. | `engine/packages/script/README.md` |
| `@vrmxg/sense` | 0.1.0 | simulation | The person in front of the camera, as part of the world. | `engine/packages/sense/README.md` |
| `@vrmxg/sequence` | 0.1.0 | simulation | Sequences: a `.vrmxs` of its own that films a set scene, with shots, shot overrides, markers and tracks, played **inside the simulation step** so a shot replays and exports bit for bit; exact scrubbing from snapshots … | `engine/packages/sequence/README.md` |
| `@vrmxg/snapshot` | 0.1.0 | simulation | One snapshot of a whole world, per-step hashes, and the harness that proves a scene replays bit-identically in Node, Chromium and WKWebView. | `engine/packages/snapshot/README.md` |
| `@vrmxg/takes` | 0.1.0 | simulation | Performance takes: one character's performance, recorded over a sequence while it plays, kept as ordinary tracks, and replayed exactly from its log. | `engine/packages/takes/README.md` |
| `@vrmxg/text` | 0.1.0 |  | Text inside the canvas: speech bubbles and name tags in the world, drawn with troika-three-text 0.53.1. | `engine/packages/text/README.md` |
| `@vrmxg/tracks` | 0.1.0 | simulation | The track core: keyed tracks evaluated as a **pure function of the frame**, and the `AnimationPlayer` node that plays them inside the simulation step. | `engine/packages/tracks/README.md` |
| `@vrmxg/voice` | 0.1.0 | simulation | Characters say lines, blink and glance. | `engine/packages/voice/README.md` |
| `@vrmxg/voicing` | 0.1.0 | simulation | M2's line bake, made into the creator's voicing layer. | `engine/packages/voicing/README.md` |
