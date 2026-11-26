# VRMXG

A three.js game engine built around the VRMX formats: VRMXA characters, VRMXW wearables and the proposed VRMXI game
items, with a feature set modelled on Godot 4. It runs the interactive world (scene, physics, characters, cameras,
input, audio, NPC AI, capture) for a new editor app, a game UI app and an anime creator app.

| | |
|---|---|
| **State** | 2026-11-26. M0 to M5 are done: the runtime, the editor, the anime creator, the game app and a sample game, "The Morning Rush" ([acceptance/](acceptance/README.md)). **M6 (games others can build) is in progress**: behaviours and connections in the editor, hot reload, new projects and starter content, saves across updates and sharing a game are in ([M6-PLAN.md](M6-PLAN.md)). |
| **Read first** | [VRMXG-PRD.md](VRMXG-PRD.md) (the product), [M6-PLAN.md](M6-PLAN.md) (now), [CLAUDE.md](CLAUDE.md) (the area contract and where everything is) |
| **Stack** | three r187, `@pixiv/three-vrm` 3.5.5, Rapier (deterministic build), Vue 3, a thin sandboxed WKWebView wrapper for macOS |
| **Bridge** | Area `vrmxg` on AgentBridge: `bridge assume vrmxg` |

## Layout

| Path | What |
|---|---|
| `engine/packages/` | Engine packages: `dmath`, `registry`, `scene`, `core`, `physics`, `character`, `input`, `camera`, `snapshot`, `render`, `mcp`, `model`, `item`, `interact`, `closet`, `editor-core`, `audio`, `voice` so far ([M1-PLAN.md](M1-PLAN.md) has the rest) |
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
| `engine/packages/render` | The render host: WebGPU in the apps where the browser has it (`auto`), WebGL otherwise, MToon, interpolation at α that never touches simulated state, Environment and light nodes, shadow presets, debug draw, `warmUp()` |
| `engine/packages/model` | Model nodes: glTF sets and props, colliders from KHR_physics, a GLB writer for generated content (simulation) |
| `engine/packages/item` | VRMXI game items: read and check `.vrmxi`, Item nodes with bodies, sensors, joints, states and verbs (simulation) |
| `engine/packages/mcp` | The MCP server: describe types, edit `.vrmxs` with undo, inspect and drive the scene in a headless engine |
| `engine/vendor/three-vrm` | `@pixiv/three-vrm` 3.5.5 vendored, plus a spring-bone state API |
| `tools/eslint-plugin-vrmxg` | `vrmxg/deterministic`: the determinism boundary as a lint rule |

The character, particle and export spikes need VRM models that aren't in the repository (see `.gitignore`); their
READMEs say how to run them on the development Mac.

## Licence

The engine's code is licensed under either of [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option.
Unless you say otherwise, any contribution you submit for inclusion is dual-licensed the same way, with no additional
terms.

Vendored and ported code keeps its own licence, with its notice beside it:
- the patched `@pixiv/three-vrm` (MIT, `engine/vendor/three-vrm/LICENSE`);
- navcat (`engine/packages/nav/src/vendor/LICENSE-navcat`);
- TalkingHead's English lip-sync rules (MIT);
- Ajv's meta-schema, precompiled (MIT, `engine/packages/registry/src/vendor/ajv-meta-2020.js`);
- fdlibm's notice in `@vrmxg/dmath`.

Every game build and Mac app carries `THIRD-PARTY-LICENCES` for the packages it bundles.

Content has its own terms, file by file, in each folder's `LICENCES.md` (`content/sample/`, `content/starter/`,
`content/templates/`). Content we made ("Xocialize original") is released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), as are the starter clips and items. The sample
characters wrap the VRMXA specification's base model, which is under the VRM Public License 1.0, as are three of the
sample's items (`sword-pickup`, `switch` and `stool`, the specification's fixtures). A few generated files carry
their model's terms (MIT, Apache-2.0, DINOv3), each named in its row.

**Built with DINOv3.** Five of the sample's props (`content/sample/props/`: the espresso machine, bench, street lamp,
planter tree and vending machine) were made with TRELLIS.2, whose DINOv3 conditioner is under the
[DINOv3 License](https://ai.meta.com/resources/models-and-libraries/dinov3-license/).

**Building the apps.** The engine's packages, tests and the Node acceptance runs need only this repository. The apps
(playground, editor, creator and game runtime) also need `vrmxa-core`, the VRMXA format library, checked out beside
it as `../vrmxa-core` at the commit [vrmxa-core.json](vrmxa-core.json) pins (`node scripts/vrmxa-core.mjs` clones it
there), and every app build bundles it. It is public, [xocialize-code/vrmxa-core](https://github.com/xocialize-code/vrmxa-core),
and licensed MIT OR Apache-2.0 like the engine. It reads the characters' base model from `VRMXA_Specification` beside
it.
