---
title: "Running the apps and the sample"
description: "What you need installed, how to start the playground, the editor and the creator, and what the sample project holds."
order: 2
---

# Running the apps and the sample

This page gets the apps running on the sample project. It is not a guide to using them: the creator's and the editor's
guides come later, once their interfaces settle.

## What you need

- **Node 26** or newer.
- **[vrmxa-core](https://github.com/xocialize-code/vrmxa-core) checked out beside the repository**, as `../vrmxa-core`
  at the commit `vrmxa-core.json` pins: `node scripts/vrmxa-core.mjs` clones it there. The apps bundle this character
  library; without it they don't build. It reads the characters' base model from `VRMXA_Specification` beside it.
- **A Mac** for the Mac apps: macOS 15 or newer for the editor and the creator, macOS 26 for the playground (it links
  the shell's voice). They build with Swift Package Manager; there is no Xcode project.

```bash
npm ci               # installs the workspace and applies the three-vrm patch
npm run check        # lint, type check, every package's tests, and that the generated reference is current
```

## In a browser

Each app is a Vite dev server that opens the sample project.

| App | Start it | Address | In a browser |
|---|---|---|---|
| Playground | `npm run dev -w @vrmxg/playground` | `http://localhost:5181` | Plays the sample scenes |
| Editor | `npm run dev --prefix apps/editor` | `http://localhost:5182` | The sample project is read-only |
| Creator | `npm run dev --prefix apps/creator` | `http://localhost:5185` | Opened files and saves stay in memory |

In the playground, WASD or the arrow keys move, Shift runs, Space jumps, C changes the camera preset and the mouse turns
the camera. A gamepad works too. **Replay demo walk** plays ten seconds of recorded input.

All three draw with WebGPU where the page has it and fall back to WebGL. Add `?renderer=webgl` or `?renderer=webgpu` to
the address to force one.

## As Mac apps

The Mac apps are the same web builds inside the shared shell, which adds what a browser can't do: opening a project
folder and saving into it, the system menus, video export and voice.

```bash
apps/playground-mac/scripts/build.sh     # build/VRMXGPlayground.app
apps/editor-mac/scripts/build.sh         # build/VRMXGEditor.app
apps/creator-mac/scripts/build.sh        # build/VRMXGCreator.app
open apps/creator-mac/build/VRMXGCreator.app
```

Each script runs the web build, `swift build` and an ad hoc signature. `SKIP_WEB=1` reuses a web build that is already
there. In the editor and the creator, **File › Open Project…** mounts a folder as the project and **Save** writes into it.

## The sample project

`content/sample/` is a whole project: every scene, script, character and sound the apps and the tests run on. Asset
paths in its scenes are relative to that folder. Every file in it has a licence, listed in `content/sample/LICENCES.md`
and checked in CI.

| What | Where |
|---|---|
| The cafe: a room with a counter, tables, doors that open as you walk into them, two lights | `cafe.vrmxs` |
| The park: a paved square beside the cafe | `park.vrmxs` |
| Two characters: Mira (the player) and Hana (an NPC) | `characters/` |
| Variations on the cafe: a conversation, a follower, stairs, a cart, split screen | `cafe-talk.vrmxs`, `cafe-follow.vrmxs`, `cafe-stairs.vrmxs`, `cafe-cart.vrmxs`, `cafe-split.vrmxs` |
| Prefabs: the door and the double door | `prefabs/` |
| Two shorts, each a script and the sequence built from it: "The Order" and "The Regular" | `scripts/`, `sequences/`, `shorts.json` |
| Hand-made sequences: "Morning at the cafe" and others | `sequences/` |
| Recorded input and conversation takes | `input/`, `takes/` |
| Animation clips, sounds, voice lines, a colour look, a particle effect, NPC brains | `animations/`, `sounds/`, `voice/`, `looks/`, `effects/`, `brains/` |

**A short is built by tools, one per step.** Each can be run again and changes nothing once its step is done:

```bash
node content/sample/tools/make-script-sequence.mjs                            # every short: script → sequence, with cameras
node content/sample/tools/cast-short.mjs sequences/the-regular.vrmxs          # cast the roles, with their voices
node content/sample/tools/bake-lines.mjs sequences/the-regular.vrmxs --fit    # voice the lines (needs a local voice server)
node content/sample/tools/replay-short.mjs                                    # play it twice in Node and compare the hashes
```

The formats behind these are in the reference: [the Fountain subset](../reference/fountain) and
[shorts.json](../reference/shorts-json).

## From an agent

The MCP server opens the sample project the same way:

```bash
node engine/packages/mcp/src/server.js content/sample cafe.vrmxs \
  --behaviours behaviours.js --vrmxa-core ../../../vrmxa-core
```

The two module paths are relative to the project folder (`content/sample`), not to where the command runs.

See [Agents and MCP](./agents).

## Tests

```bash
npm test                         # every package, then the acceptance's own tests
npm test -w @vrmxg/core          # one package
```

Some character tests need models that are not in the repository, so they don't run in CI. The checks
that prove a scene replays the same in every browser are described in [Acceptance and exactness](./acceptance).
