---
title: "Creator commands"
description: "The 7 commands an agent runs in the creator through the command tool, each with its JSON Schema."
order: 40
---

# Creator commands

> Generated from `apps/creator/src/agent.js` (`creatorCommands`) by `scripts/docs-reference.mjs`. Don't edit it: change the code and run `npm run docs:reference`.

What an agent can do in the VRMXG creator. The creator's MCP tool list stays at
7 tools whatever is added here: `describe` lists these commands and returns one command's schema, and
`command` runs one, checked against that schema. See [MCP servers and tools](./mcp#creator-tools).

A command that **edits** makes exactly one step of the creator's Undo, marked `(MCP)`; `undo` takes it back.
A command that doesn't edit (queueing an export, saving) makes no undo step.

| Command | Edits | What |
|---|---|---|
| [`write_script`](#write-script) | yes | Replace the short's whole script (Fountain) and re-script the sequence: one undo step, hand edits kept. |
| [`patch_script`](#patch-script) | yes | Change parts of the script by exact find and replace (each find must occur once), then re-script: one undo step. |
| [`recast`](#recast) | yes | Cast a character file (.vrmxa in the project) into a role, keeping the performance; the role's lines are re-voiced in the new voice in the same undo step. |
| [`revoice`](#revoice) | yes | Voice lines again: one line (with new words if given), one role's lines, or all; another voice or a new take. One undo step, none if nothing changes. |
| [`shot_camera`](#shot-camera) | yes | Put a camera on a shot: an existing virtual camera, or a new one on a rig preset. One undo step; the camera stays through re-scripts. |
| [`queue_export`](#queue-export) | no | Queue the short, as it is now, in the render queue at a delivery preset; run: true renders that job now. |
| [`save`](#save) | no | Save the short: its sequence, its script and shorts.json (in memory when the project is read-only). |

## write_script

Replace the short's whole script (Fountain) and re-script the sequence: one undo step, hand edits kept.

- **Edits the short:** yes, as one undo step

**Arguments**

```json
{
  "additionalProperties": false,
  "type": "object",
  "required": ["text"],
  "properties": {
    "text": {
      "type": "string",
      "minLength": 1,
      "description": "The whole script, title page included."
    }
  }
}
```

## patch_script

Change parts of the script by exact find and replace (each find must occur once), then re-script: one undo step.

- **Edits the short:** yes, as one undo step

**Arguments**

```json
{
  "additionalProperties": false,
  "type": "object",
  "required": ["edits"],
  "properties": {
    "edits": {
      "type": "array",
      "minItems": 1,
      "maxItems": 50,
      "items": {
        "type": "object",
        "required": ["find", "replace"],
        "additionalProperties": false,
        "properties": {
          "find": {
            "type": "string",
            "minLength": 1,
            "description": "Text in the script now, exactly, found once."
          },
          "replace": { "type": "string" }
        }
      }
    }
  }
}
```

## recast

Cast a character file (.vrmxa in the project) into a role, keeping the performance; the role's lines are re-voiced in the new voice in the same undo step.

- **Edits the short:** yes, as one undo step

**Arguments**

```json
{
  "additionalProperties": false,
  "type": "object",
  "required": ["role", "character"],
  "properties": {
    "role": {
      "type": "string",
      "description": "The role: its cue (HANA) or node id (short part=roles)."
    },
    "character": {
      "type": "string",
      "description": "A project ref, e.g. characters/mira.vrmxa (read dir=characters)."
    },
    "voice": {
      "type": "string",
      "enum": [
        "af_heart", "af_bella", "af_sky", "af_nicole", "am_adam",
        "am_michael", "bf_emma", "bm_george"
      ],
      "description": "A Kokoro voice preset."
    },
    "outfit": {
      "type": "string",
      "description": "An outfit id from the character's wardrobe."
    }
  }
}
```

## revoice

Voice lines again: one line (with new words if given), one role's lines, or all; another voice or a new take. One undo step, none if nothing changes.

Select with one of line (an id from short part=lines), role (cue or node id) or all; with none, the lines not yet voiced in their role's voice. text: new words for the one line. voice: speak in this voice instead. new_take: speak again even when a take exists (a take is reused otherwise).

- **Edits the short:** yes, as one undo step

**Arguments**

```json
{
  "additionalProperties": false,
  "type": "object",
  "properties": {
    "line": {
      "type": "string",
      "description": "A line id, e.g. cafe-order-mira-says-2."
    },
    "role": { "type": "string" },
    "all": { "type": "boolean" },
    "text": {
      "type": "string",
      "minLength": 1,
      "description": "New words (with line only)."
    },
    "voice": {
      "type": "string",
      "enum": [
        "af_heart", "af_bella", "af_sky", "af_nicole", "am_adam",
        "am_michael", "bf_emma", "bm_george"
      ],
      "description": "A Kokoro voice preset."
    },
    "new_take": { "type": "boolean" }
  }
}
```

## shot_camera

Put a camera on a shot: an existing virtual camera, or a new one on a rig preset. One undo step; the camera stays through re-scripts.

shot: id or number ("030"). camera: an existing VirtualCamera id (short part=cameras). Or rig (a preset) with target or targets, and optionally p (position [x,y,z]), lens ({ focalLength mm, fStop, dutch }), id and name: a new camera for this shot.

- **Edits the short:** yes, as one undo step

**Arguments**

```json
{
  "additionalProperties": false,
  "type": "object",
  "required": ["shot"],
  "properties": {
    "shot": { "type": "string" },
    "camera": { "type": "string" },
    "rig": {
      "type": "string",
      "enum": [
        "fixed", "security", "follow", "thirdPerson",
        "overShoulder", "firstPerson", "topDown", "orbit",
        "turntable", "dolly", "crane", "closeUp", "twoShot",
        "handheld", "shotReverse"
      ]
    },
    "target": {
      "type": "string",
      "description": "Who it frames (a role's node id)."
    },
    "targets": { "type": "array", "minItems": 1, "items": { "type": "string" } },
    "p": {
      "type": "array",
      "minItems": 3,
      "maxItems": 3,
      "items": { "type": "number" }
    },
    "lens": { "type": "object" },
    "id": { "type": "string" },
    "name": { "type": "string" }
  }
}
```

## queue_export

Queue the short, as it is now, in the render queue at a delivery preset; run: true renders that job now.

- **Edits the short:** no

**Arguments**

```json
{
  "additionalProperties": false,
  "type": "object",
  "properties": {
    "preset": {
      "type": "string",
      "enum": [
        "draft", "review", "master", "h264-1080p24", "h264-4k24",
        "hevc-1080p24", "hevc-4k24", "prores-1080p24",
        "prores-4k24"
      ]
    },
    "name": { "type": "string", "description": "The file name (no extension)." },
    "run": { "type": "boolean" }
  }
}
```

## save

Save the short: its sequence, its script and shorts.json (in memory when the project is read-only).

- **Edits the short:** no

**Arguments**

```json
{ "additionalProperties": false, "type": "object", "properties": {} }
```
