---
title: "game.json"
description: "The game document: the scene a game starts in, the scenes it can reach, its behaviours, input map and the files no document names."
order: 82
---

# game.json

> Generated from `@vrmxg/bundle` (`checkGame`, its README) and the sample project by `scripts/docs-reference.mjs`. Don't edit it: change the code and run `npm run docs:reference`.

What Export Game reads to know what the game is (`format: "vrmxg-game"`, `version: 1`). The sample's is
`content/sample/game.json`.

| Key | What |
|---|---|
| `id` | Lowercase letters, digits and hyphens. The default name of the build's folder |
| `title` | Shown by the runtime. Default: the id |
| `entry` | The scene the game starts in |
| `scenes` | Every scene the game can reach. The entry is always one of them |
| `behaviours`, `animations`, `personas` | The project's behaviours module, animation sets and app personas, by ref, where it has them |
| `input` | The action map (`@vrmxg/input`'s `actions`): inline as `{ "actions": { … } }`, or a ref to a JSON file holding that. Absent: the engine's default map |
| `include` | Files no document names, by ref or by pattern (`*` within one folder level) |
| `ignore` | Strings in the game's documents that look like files and aren't: the export would otherwise stop on them |
| `release` | The game's own version, as its players see it: one to three numbers with dots (`"1.2.0"`). The Mac game app takes it as its version. Absent: none in the manifest |

A project with no `game.json` can still be exported from the editor: the open scene is the entry, with the project's
`behaviours.js`, `animations.json` and `personas.json` where it has them (`defaultGame`).

An export follows every string in the game's documents that reads as a path to one of the project's files; one that
names no file stops it, with the line to add. `ignore` lists the strings that only look like files (a line of text
that ends in `.wav`), so the export passes them by.

`format` is always `"vrmxg-game"` and `version` `1`; another version, or a key not in the table, is refused with a message naming it.

## How it is read

The exporter checks the document and fills in its defaults before anything else (`checkGame` in `@vrmxg/bundle`). The
scenes come back sorted, with the entry among them; `include` and `ignore` sorted, each name once; the title trimmed.
What it reads from the sample project's file is what goes into a build's manifest as `game`:

```json
{
  "format": "vrmxg-game",
  "version": 1,
  "id": "cafe",
  "title": "The cafe",
  "entry": "cafe.vrmxs",
  "scenes": ["cafe.vrmxs"],
  "behaviours": "behaviours.js",
  "animations": "animations.json",
  "personas": "personas.json",
  "input": {
    "actions": {
      "move_x": {
        "type": "axis",
        "bindings": [
          { "key": "KeyD", "value": 1 },
          { "key": "KeyA", "value": -1 },
          { "key": "ArrowRight", "value": 1 },
          { "key": "ArrowLeft", "value": -1 },
          { "gamepadAxis": 0, "deadzone": 0.15 }
        ]
      },
      "move_y": {
        "type": "axis",
        "bindings": [
          { "key": "KeyW", "value": 1 },
          { "key": "KeyS", "value": -1 },
          { "key": "ArrowUp", "value": 1 },
          { "key": "ArrowDown", "value": -1 },
          {
            "gamepadAxis": 1,
            "deadzone": 0.15,
            "scale": -1
          }
        ]
      },
      "look_x": {
        "type": "axis",
        "bindings": [
          { "mouse": "dx", "scale": 0.0025 },
          {
            "gamepadAxis": 2,
            "deadzone": 0.1,
            "scale": 0.05
          }
        ]
      },
      "look_y": {
        "type": "axis",
        "bindings": [
          { "mouse": "dy", "scale": 0.0025 },
          {
            "gamepadAxis": 3,
            "deadzone": 0.1,
            "scale": 0.05
          }
        ]
      },
      "zoom": {
        "type": "axis",
        "bindings": [{ "mouse": "wheel", "scale": 0.002 }]
      },
      "jump": {
        "type": "button",
        "bindings": [{ "key": "Space" }, { "gamepadButton": 0 }]
      },
      "run": {
        "type": "button",
        "bindings": [
          { "key": "ShiftLeft" },
          { "key": "ShiftRight" },
          { "gamepadButton": 10 }
        ]
      },
      "interact": {
        "type": "button",
        "bindings": [
          { "key": "KeyE" },
          { "mouseButton": 0 },
          { "gamepadButton": 2 }
        ]
      },
      "camera_next": {
        "type": "button",
        "bindings": [
          { "key": "KeyC" },
          { "gamepadButton": 3 }
        ]
      }
    }
  },
  "include": ["input/walk-in.json"]
}
```

The rules of a game are not here: they are nodes in its scenes (`GameRules`, `GameCounter`, `GameTimer`, `GameGoal`,
`Checkpoint`; see [Node types](./nodes)). The MCP `game` tool reads both together: every scene's rules, a check of
the whole project, and an export.

## The sample project's

`content/sample/game.json`:

```json
{
 "format": "vrmxg-game",
 "version": 1,
 "id": "cafe",
 "title": "The cafe",
 "entry": "cafe.vrmxs",
 "scenes": ["cafe.vrmxs"],
 "behaviours": "behaviours.js",
 "animations": "animations.json",
 "personas": "personas.json",
 "input": { "actions": {
  "move_x": { "type": "axis", "bindings": [{ "key": "KeyD", "value": 1 }, { "key": "KeyA", "value": -1 }, { "key": "ArrowRight", "value": 1 }, { "key": "ArrowLeft", "value": -1 }, { "gamepadAxis": 0, "deadzone": 0.15 }] },
  "move_y": { "type": "axis", "bindings": [{ "key": "KeyW", "value": 1 }, { "key": "KeyS", "value": -1 }, { "key": "ArrowUp", "value": 1 }, { "key": "ArrowDown", "value": -1 }, { "gamepadAxis": 1, "deadzone": 0.15, "scale": -1 }] },
  "look_x": { "type": "axis", "bindings": [{ "mouse": "dx", "scale": 0.0025 }, { "gamepadAxis": 2, "deadzone": 0.1, "scale": 0.05 }] },
  "look_y": { "type": "axis", "bindings": [{ "mouse": "dy", "scale": 0.0025 }, { "gamepadAxis": 3, "deadzone": 0.1, "scale": 0.05 }] },
  "zoom": { "type": "axis", "bindings": [{ "mouse": "wheel", "scale": 0.002 }] },
  "jump": { "type": "button", "bindings": [{ "key": "Space" }, { "gamepadButton": 0 }] },
  "run": { "type": "button", "bindings": [{ "key": "ShiftLeft" }, { "key": "ShiftRight" }, { "gamepadButton": 10 }] },
  "interact": { "type": "button", "bindings": [{ "key": "KeyE" }, { "mouseButton": 0 }, { "gamepadButton": 2 }] },
  "camera_next": { "type": "button", "bindings": [{ "key": "KeyC" }, { "gamepadButton": 3 }] }
 } },
 "include": ["input/walk-in.json"]
}
```
