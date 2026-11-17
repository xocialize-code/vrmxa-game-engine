# VRMXG

A three.js game engine built around the VRMX formats: VRMXA characters, VRMXW wearables and the proposed VRMXI game
items, with a feature set modelled on Godot 4. It runs the interactive world (scene, physics, characters, cameras,
input, audio, NPC AI, capture) for a new editor app, a game UI app and an anime creator app.

| | |
|---|---|
| **State** | 2026-11-17. PRD features pass, eight spikes, the first engine package (`@vrmxg/dmath`), and the M0 plan. No engine runtime yet. |
| **Read first** | [VRMXG-PRD.md](VRMXG-PRD.md) (the product), [M0-PLAN.md](M0-PLAN.md) (what gets built first), [CLAUDE.md](CLAUDE.md) (the area contract and where everything is) |
| **Stack** | three r187, `@pixiv/three-vrm` 3.5.5, Rapier (deterministic build), Vue 3, a thin sandboxed WKWebView wrapper for macOS |
| **Bridge** | Area `vrmxg` on AgentBridge: `bridge assume vrmxg` |

## Layout

| Path | What |
|---|---|
| `engine/packages/` | Engine packages. `dmath` (portable maths, bit-identical in V8 and JSC) is built; the rest arrive with M0 |
| `spike-*/` | Throwaway spikes, each with a README (verdict, results, how to run) and raw results |
| `research/` | Research reports: cinematics, NPC AI |
| `reference/` | Godot and other reference repos, read locally, not committed |

## Tests

```bash
(cd engine/packages/dmath && npm test)
(cd spike-registry && npm ci && npm test)
```

The character, particle and export spikes need VRM models that aren't in the repository (see `.gitignore`); their
READMEs say how to run them on the development Mac.
