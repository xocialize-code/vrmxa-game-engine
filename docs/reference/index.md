---
title: "Overview"
description: "What the generated reference covers, and what each page is generated from."
order: 0
---

# Reference

> Generated from the code by `scripts/docs-reference.mjs`. Don't edit it: change the code and run `npm run docs:reference`.

Every page in this section is written by a script from the engine's own code and data, and `npm run check` fails
when one is out of date. If a page here disagrees with the engine, the build is broken, not the page.

| Page | What | Generated from |
|---|---|---|
| [Node types](./nodes) | The 28 node types of a VRMXG scene, with each one's props, signals and actions. | `@vrmxg/registry` (`m0Registry`) |
| [Behaviours](./behaviours) | The 8 behaviours the registry declares, with their params and the signals and actions they add, and how a project declares its own. | `@vrmxg/registry` (`m0Registry`) |
| [MCP servers and tools](./mcp) | The vrmxg-mcp server's three modes (headless, editor, creator) and every tool with its input schema. | `@vrmxg/mcp` (`toolList`, `shortToolList`, `src/server.js`) |
| [Creator commands](./creator-commands) | The 8 commands an agent runs in the creator through the command tool, each with its JSON Schema. | `apps/creator/src/agent.js` (`creatorCommands`) |
| [The .vrmxs scene file](./vrmxs) | Every field of a .vrmxs scene document, with the JSON Schema it is checked against. | `@vrmxg/scene` (`documentSchema`) over the registry |
| [The Fountain subset](./fountain) | The screenplay syntax a VRMXG script is written in: elements, tags, parenthetical words and timing defaults. | `@vrmxg/script` (`src/vocab.js`, its README) and the sample script |
| [shorts.json](./shorts-json) | The file that lists a project's shorts for the creator: each short's script, sequence, marks, set and cameras. | `apps/creator/src/shorts.js` and the sample project |
| [delivery.json](./delivery-json) | What a delivery folder holds, the render queue's presets, and the manifest that names every file with its hash. | `@vrmxg/editor-core` (presets), `@vrmxg/export` (`deliveryFiles`) and `apps/creator/src/delivery.js` |
| [game.json](./game-json) | The game document: the scene a game starts in, the scenes it can reach, its behaviours, input map and the files no document names. | `@vrmxg/bundle` (`checkGame`, its README) and the sample project |
| [vrmxg-build.json](./build-json) | A game build's manifest: the game, the runtime it was made with, and every file with its SHA-256 and licence. | `@vrmxg/bundle` (`makeManifest`, its README) |
| [Packages](./packages) | The 39 engine packages, one line each, and which side of the determinism boundary each is on. | every `engine/packages/*`: its `package.json` and the opening of its README |

For agents, [`llms.txt`](/llms.txt) indexes the whole site, and every page is also served as Markdown: add `.md` to
its address.
