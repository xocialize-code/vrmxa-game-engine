# VRMXG: area contract

## Bridge identity

**AREA-ID: `vrmxg`** (aliases: `vrmxa-game-engine`, `vrmxg-engine`, `vrmx-game-engine`). Work in this directory
answers for that identity on the bridge.
- **Session start:** `bridge assume vrmxg` gives owed asks, open tasks and the context pack in one command.
- **Assumption** is informational, never a lock. A stale last-assumed age in `bridge areas` means nobody is home, and
  you take over by assuming.
- **Filing:** file answers and asks under this id; the roster validates recipients. Records filed before the area
  existed (2026-11-17) carry `project: vrmxa-game-engine`.

## What VRMXG is

VRMXG is a three.js game engine built around our VRMX formats: VRMXA characters, VRMXW wearables and the proposed
VRMXI game items. Its feature set is modelled on Godot 4. It delivers the interactive world (scene, physics,
characters, cameras, input, audio, NPC AI, capture) and lives **outside** the apps that use it: a new editor app, a
game UI app, an anime creator app, and later the avatar studio and the companion app.
- **Stack:** three r187, `@pixiv/three-vrm` 3.5.5, Vue 3, a thin sandboxed WKWebView wrapper in Swift.
- **Constraint:** the wrapper's custom URL scheme gives no `SharedArrayBuffer` (AB-L-0346), so WASM runs
  single-threaded.
- **Determinism is a product requirement:** shots must replay and export bit-identically in WKWebView, Chromium and
  Node. That needs a fixed step and portable maths (AB-L-0345).

## Repository

[xocialize-code/vrmxa-game-engine](https://github.com/xocialize-code/vrmxa-game-engine), private, `main`. CI
(`.github/workflows/ci.yml`) runs on Node 26 for every push and pull request. `reference/` and all VRM models are
git-ignored; commit only what this session owns, staging by path. `npm run check` at the root runs lint (with
`vrmxg/deterministic` on packages marked `"vrmxg": { "determinism": "simulation" }`), the type check and every package's tests.

## Where things are

| Path | What |
|---|---|
| [VRMXG-PRD.md](VRMXG-PRD.md) | The PRD (features pass): Godot feature map with P0–P2, format family, scene format, phasing, open questions. The spike table at the top links every receipt |
| [M0-PLAN.md](M0-PLAN.md), [M1-PLAN.md](M1-PLAN.md), [M2-PLAN.md](M2-PLAN.md), [M3-PLAN.md](M3-PLAN.md), [M4-PLAN.md](M4-PLAN.md) | M0 (done 2026-11-17, AB-P-0013) and M1 (playable, done 2026-11-18, AB-P-0014: tasks AB-T-0512 to 0522, receipts AB-R-0967 to 0973) and M2 (production, done 2026-11-18, AB-P-0015: tasks AB-T-0523 to 0535, receipts AB-R-0994 to 1003), and M3 (characters you talk to, done 2026-11-19, AB-P-0016: tasks AB-T-0539 to 0552, receipts AB-R-1038 to 1046 and 1048; WebGPU research AB-T-0553, 0554), and M4 (the anime creator on WebGPU, started 2026-11-20, AB-P-0018: tasks AB-T-0572 to 0585, decisions AB-D-0270 to 0276) |
| [vrmxa-game-engine-notes.md](vrmxa-game-engine-notes.md) | The operator's original notes |
| [physics-engine-research.md](physics-engine-research.md) | Physics research: Rapier, Jolt as fallback |
| `engine/packages/dmath/` | `@vrmxg/dmath`, the first engine package: portable transcendental maths, bit-identical in V8 and JSC (AB-R-0931). Install it before anything parses a VRM. Its version is part of a replay's identity |
| `apps/shell/` | The shared Mac shell for every VRMXG app (Swift package; AB-D-0253): origins, native bridge, panels, menus; `swift test` there |
| `apps/playground/`, `apps/playground-mac/` | The M0 playground (Vue) and its Mac app on the shell; AppProbe scenario in `apps/playground-mac/docs/hand-test/` |
| `apps/editor/`, `apps/editor-mac/` | The editor (M1 W7: tree, inspector, gizmos, asset list, undo, save, play in place) over `engine/packages/editor-core`, and its Mac app on the shell; AppProbe scenario in `apps/editor-mac/docs/hand-test/` |
| `apps/creator/`, `apps/creator-mac/` | The anime creator (M4 W5, AB-T-0577): a project of shorts, the script pane, storyboard, timeline, viewport, cast and render queue, on the editor's host; its Mac app on the shell (shell 0.7.0: app menus, Open Documents); AppProbe scenario in `apps/creator-mac/docs/hand-test/` |
| `engine/packages/editor-ui/` | The Vue components the editor and the creator share (M4 W5): the timeline, the storyboard strip, the render queue panel; their decisions as plain functions, tested in Node with the components rendered on the server |
| `engine/patches/`, `scripts/patch-three-vrm.mjs` | The three-vrm patch for `MToonNodeMaterial` on r187 (AB-D-0274): AB-T-0553's six lines plus patch 5, shadows in the toon shading (AB-T-0586), applied to `node_modules` on install; `--check --require-patched` in CI fails when three-vrm changes the file or the install didn't patch it. WebGPU's host is in `@vrmxg/render` (M4 W0), its post stack in `@vrmxg/post/tsl` (M4 W1, `TSLPostStack`) |
| `acceptance/` | M0's exit checks (W9): `node.mjs`, `chromium.mjs`, `wkwebview.sh`, `compare.mjs`; results and receipts AB-R-0946 to 0951. M4 W3's backend matrix: `matrix.mjs` (every rendering check on WebGPU and WebGL, Chromium and WKWebView scheme and loopback; `canonical.json`). **Every GPU runner takes `gpu-lock.mjs`** (README, "Exactness") |
| `content/sample/` | The sample project (cafe, doors, Mira, Hana, clips, demo walk). Every file needs a row in `LICENCES.md` (CI checks) |
| `spike-physics/` | Rapier in the real stack, plus the WKWebView wrapper the other spikes copy (AB-R-0923) |
| `spike-determinism/` | Character determinism and the `dmath` shim (AB-R-0924) |
| `spike-navigation/` | navcat vs recast-navigation-js (AB-R-0925) |
| `spike-particles/` | three.quarks behind a deterministic adapter (AB-R-0926) |
| `spike-frame-export/` | Offline render to AVAssetWriter (AB-R-0927) |
| `spike-cinematics/` | pmndrs post stack on MToon (AB-R-0928, WKWebView AB-R-0929) |
| `spike-steprate/` | 60 Hz vs 120 Hz simulation step: keep 60 Hz, interpolate presentation (AB-R-0932, decision AB-D-0245) |
| `spike-camera/` | Camera capture: native AVCapture + Vision in the shell beats in-page MediaPipe (main-thread cost); the scheme origin is a secure context for getUserMedia (M3 W5, AB-T-0544) |
| `spike-avatar-studio/` | Moving the Avatar Studio onto the engine: not needed for M4, and it wouldn't close the UI gaps (same stack). The CLI makes a character the engine casts as is; by hand, the UI lacks a library with a starter wardrobe (U1) and MCP (U2) first. Then the shell (M4 W5) and the stage (after M4 W0) |
| `spike-registry/` | Node registry → `.vrmxs` schema, lint, undoable edits, generic MCP tools (AB-R-0933); the seed of `engine/packages/registry`, `scene` and `mcp` |
| `research/` | `cinematics.md` (sequencer, cameras, post, viewports), `npc-ai.md` (behaviour trees, utility, LLM director) |
| `reference/` | Godot 4.8-beta source and other reference repos. Read-only |
| `../VRMXA_Specification/` | The VRMXA / VRMXW specs and the closet protocol (owned elsewhere) |
| `../vrmxa-companion/` | The companion app (M3 W11, AB-D-0262): its own project and bridge area, on `apps/shell` and the engine's packages by path |
| `../vrmxa-avatar-studio/` | The avatar studio, the first consumer of the VRMX formats |

## Rules

- Spikes are throwaway. Each one has a README with a verdict, run instructions and raw JSON in `results/`. File
  measurements as receipts with `--package` and `--version`.
- Take timings over the loopback origin, in a fresh `WKWebView`: the scheme origin's timer resolves only 1 ms, and a
  web view that has loaded the scheme keeps that timer after navigating to loopback (AB-L-0346).
- Pick one Rapier build per project. The SIMD build's results differ from the scalar builds', and snapshots replay
  only on the build that made them.
- Keep fdlibm's licence notice with any port of it.
- Simulation code uses `@vrmxg/dmath` for transcendental maths, never the engine's own `Math.sin` and the rest, and never
  the `**` operator (it bypasses a patched `Math.pow`). Changing `src/index.js` changes replay hashes: regenerate
  `test/golden.json` on purpose and bump the version.
