---
title: "What VRMXG is"
description: "What the engine does, who it is for, what is built on it and the principles it keeps."
order: 1
---

# What VRMXG is

VRMXG is a game engine for [three.js](https://threejs.org) built around the VRMX formats: VRMXA characters, VRMXW
wearables and VRMXI game items. It runs the interactive world: the scene, physics, characters, cameras, input, audio,
NPC behaviour and capture. Its feature set is modelled on Godot 4: a tree of composable nodes, reusable scenes,
signals, a fixed-step main loop and a small editor.

It is not a port of Godot. It runs in a browser tab and inside a thin Mac app, on three.js as three.js ships.

The engine lives outside the apps that use it. The apps share one runtime and one scene format, so a set built in the
editor can be played as a game and filmed as a short.

## Who it is for

| Reader | What they do | What they need most |
|---|---|---|
| **Someone making a short** | Writes a script, casts characters, voices the lines, films it and exports it | The creator app, cameras, lip sync, an export that is the same every time |
| **A game builder** | Builds scenes and small games from sets, characters and items | The scene format, items, physics, input, NPCs, save |
| **An agent** | Inspects, builds and drives scenes and shorts through MCP | An engine that describes itself: every node type, prop, signal and action can be looked up |

The same runtime is meant for product spokesmodel spots and for a companion app, each as its own app.

## What is built on it

| App | What it is | State |
|---|---|---|
| **Creator** (`apps/creator`) | The anime creator: a short is a script, built into shots, cast, voiced, hand-edited on a timeline and rendered | In progress (milestone M4) |
| **Editor** (`apps/editor`) | Builds a scene from a project's assets, edits it, plays it in place, and films it on a timeline | Working; its panels are being reworked |
| **Playground** (`apps/playground`) | A test harness for the runtime: open a scene, play, step, switch cameras, read timings | Working |
| **Mac apps** (`apps/*-mac`) | Each web app inside the shared Mac shell (`apps/shell`), which adds files, menus, video export and voice | Working |
| Game UI app | Runs what the editor makes, for players | Planned |

The avatar studio, which makes the characters and wearables, and the companion app are separate projects.

Guides for the creator and the editor are not written yet: both apps are still changing. See
[Running the apps and the sample](./running) for how to start them.

## Principles

1. **VRMXA-native.** Characters, closets, animation sets, voice and persona are engine concepts, not imported meshes.
2. **three.js as provided.** VRMXG's additions live in its own packages. The VRM library is vendored, with a small patch.
3. **Deterministic by default.** A fixed 60 Hz step drives physics, animation, spring bones, NPC behaviour, navigation
   and recorded input. A shot simulates the same every time, so it can be scrubbed, re-rendered and exported. See
   [Determinism](./determinism).
4. **Data first.** Scenes, items, prefabs and settings are plain documents. What the editor can do, a file or an MCP
   call can do. See [The scene format](./scene-format).
5. **Agent first.** The engine describes itself. The MCP tools are generated from the same registry the editor's
   inspector uses. See [Agents and MCP](./agents).
6. **Adapters at the seams.** Physics, particles, navigation and the post stack each sit behind an interface the
   engine owns.
7. **Web first, native wrapped.** Everything runs in a browser tab and in the Mac shell's web view.
8. **Small runtime, optional editor.** The runtime ships in every app; the editor is separate.

## What it is made of

| Part | What |
|---|---|
| Rendering | three.js r187. WebGPU where the page has it, WebGL as a tested fallback |
| Characters | `@pixiv/three-vrm` 3.5.5, vendored, with MToon materials on both renderers |
| Physics | Rapier's deterministic build, behind the engine's adapter |
| Navigation, particles | navcat and three.quarks, each behind a deterministic adapter |
| Apps | Vue 3 and Vite, with the engine kept outside Vue |
| Mac shell | A sandboxed `WKWebView` in a Swift package: file panels, menus, video export, voice |
| Engine | 35 packages under `engine/packages/`: see [Packages](../reference/packages) |

## Where to go next

- To try it: [Running the apps and the sample](./running).
- To understand why everything replays exactly: [Determinism](./determinism).
- To read or write scenes: [The scene format](./scene-format), then the [reference](../reference/).
- To drive it from an agent: [Agents and MCP](./agents).
