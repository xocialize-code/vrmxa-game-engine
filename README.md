# VRMXG

A three.js game engine built around the VRMX formats: VRMXA characters, VRMXW wearables and the proposed VRMXI game
items, with a feature set modelled on Godot 4. It runs the interactive world (scene, physics, characters, cameras,
input, audio, NPC AI, capture) for a new editor app, a game UI app and an anime creator app.

| | |
|---|---|
| **State** | 2026-11-18. **M0 done**: the runtime core, the playground and its Mac wrapper, sample content, all six exit checks passing ([acceptance/](acceptance/README.md)). **M1 (playable) in progress**: the shared shell, VRMXI items, interaction, the closet at run time and the editor are in; audio, voice, export, MCP in the editor and M1's acceptance are next ([M1-PLAN.md](M1-PLAN.md)). |
| **Read first** | [VRMXG-PRD.md](VRMXG-PRD.md) (the product), [M0-PLAN.md](M0-PLAN.md) (done), [M1-PLAN.md](M1-PLAN.md) (next), [CLAUDE.md](CLAUDE.md) (the area contract and where everything is) |
| **Stack** | three r187, `@pixiv/three-vrm` 3.5.5, Rapier (deterministic build), Vue 3, a thin sandboxed WKWebView wrapper for macOS |
| **Bridge** | Area `vrmxg` on AgentBridge: `bridge assume vrmxg` |

## Layout

| Path | What |
|---|---|
| `engine/packages/` | Engine packages: `dmath`, `registry`, `scene`, `core`, `physics`, `character`, `input`, `camera`, `snapshot`, `render`, `mcp`, `model`, `item`, `interact`, `closet`, `editor-core` so far ([M1-PLAN.md](M1-PLAN.md) has the rest) |
| `apps/` | `shell` (the shared Mac shell, a Swift package), `playground` (Vite + Vue test app), `editor` (the editor, Vite + Vue) and `playground-mac`, `editor-mac` (each on the shell) |
| `acceptance/` | M0's six exit checks on the sample cafe, in Node, Chromium and WKWebView, and their results |
| `content/sample/` | The sample project M0 runs: the cafe, doors, two characters, clips, a recorded walk; every file's licence in `LICENCES.md` |
| `tools/` | Workspace tooling: the ESLint plugin |
| `spike-*/` | Throwaway spikes, each with a README (verdict, results, how to run) and raw results |
| `research/` | Research reports: cinematics, NPC AI |
| `reference/` | Godot and other reference repos, read locally, not committed |

## Tests

```bash
npm ci
npm run check        # lint (incl. the determinism rule), typecheck, every package's tests
```

| Package | What |
|---|---|
| `engine/packages/dmath` | Portable maths, bit-identical in V8 and JSC (simulation) |
| `engine/packages/registry` | Node types, props, signals, actions, behaviours |
| `engine/packages/scene` | `.vrmxs` schema, canonical I/O, lint, prefab flattening, undoable edits |
| `engine/packages/core` | Node tree, lifecycle, signals, behaviours, state machines, 60 Hz clock, RNG streams, timers, tweens (simulation) |
| `engine/packages/physics` | Rapier (deterministic) adapter, RigidBody / Collider / Area nodes, hinge, queries, layers, snapshots, debug lines (simulation) |
| `engine/packages/character` | VRMXA / VRM characters: locomotion graph on VRMXA slots, controller, look-at, expressions, attachments, snapshot-able state (simulation) |
| `engine/packages/input` | Action map, keyboard / mouse / gamepad, per-step latching, recording and replay, the player controller (simulation) |
| `engine/packages/camera` | Physical Camera node, rig presets with a spring arm, the cameras service, physics and mesh picking (simulation) |
| `engine/packages/snapshot` | World snapshots, per-step component hashes, run comparison; the Node / Chromium / WKWebView determinism harness (simulation) |
| `engine/packages/render` | The render host: WebGL for MToon, interp| `engine/packages/model` | Model nodes: glTF sets and props, colliders from KHR_physics, a GLB writer for generated content (simulation) |
| `engine/packages/item` | VRMXI game items: read and check `.vrmxi`, Item nodes with bodies, sensors, joints, states and verbs (simulation) |
olation at α that never touches simulated state, Environment and light nodes, shadow presets, debug draw |
| `engine/packages/mcp` | The MCP server: describe types, edit `.vrmxs` with undo, inspect and drive the scene in a headless engine |
| `engine/vendor/three-vrm` | `@pixiv/three-vrm` 3.5.5 vendored, plus a spring-bone state API |
| `tools/eslint-plugin-vrmxg` | `vrmxg/deterministic`: the determinism boundary as a lint rule |

The character, particle and export spikes need VRM models that aren't in the repository (see `.gitignore`); their
READMEs say how to run them on the development Mac.
