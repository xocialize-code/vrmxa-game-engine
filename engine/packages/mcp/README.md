# @vrmxg/mcp

M0 W7 (AB-T-0508), M1 W9 (AB-T-0521). The VRMXG MCP server: describe node types from the registry, edit a `.vrmxs`
scene with undo, and inspect and drive it, either in a headless engine running in Node or in the open VRMXG editor.

```sh
node engine/packages/mcp/src/server.js <project-root> <scene.vrmxs> [--behaviours <module.js>] [--vrmxa-core <dir>] [--seed N]
node engine/packages/mcp/src/server.js --editor [--port 5183]
claude mcp add vrmxg -- node "$PWD/engine/packages/mcp/src/server.js" <project-root> <scene.vrmxs>   # register in Claude Code
claude mcp add vrmxg-editor -- node "$PWD/engine/packages/mcp/src/server.js" --editor
```

**The editor (`--editor`).** The server listens on 127.0.0.1:5183; the editor (the Mac app, or a browser with `?mcp`)
polls `POST /vrmxg-mcp/exchange` and runs each call in the page with the same handlers (`@vrmxg/mcp/tools`) over the
editor:
- **Edits** go through the editing session's command log: each one is a step of the editor's own Undo, named
  "Add cam-overview (MCP)". They are refused while playing, as the editor's own edits are.
- **`play`** plays, stops, pauses and resumes. Stop leaves the scene exactly as before.
- **`engine_step`** runs at once while paused, and in real time while playing, with input held or replayed.
- **`call_action`** cues a character (say, goTo, lookAt); **`interact`** has a character do an item's verb.
- **`get_node live` / `tree live` / `physics`** read the play world.
- **`screenshot`** returns the view as a PNG.

The editor's status bar says whether it is connected. `test/drive-editor.mjs` drives an open editor through it, as an
agent would.

| Tools | What |
|---|---|
| `describe` | Node types and behaviours, or one type's JSON Schema, units, signals, actions and accepted behaviours, on demand |
| `tree`, `get_node` | The scene as stored (`flatten` expands prefabs). With `live: true`, the running engine: world positions; a node's transform, behaviours' `inspect()` (the hinge gives its angle), body velocity and sleep, character controller and animation state, camera rig |
| `add_node`, `set`, `remove_node`, `reparent`, `connect`, `undo`, `redo` | Edits through `@vrmxg/scene`'s editor: checked against the type's schema, undoable |
| `validate`, `save` | Schema and reference checks; save writes the canonical form and refuses a scene with errors |
| `engine_load` | Start the headless engine (input, Rapier physics, characters, cameras) from the scene as edited |
| `engine_step` | Step at 60 Hz, with input actions held (`{"move_y": 1, "run": true}`) or a recording replayed; returns the signals fired |
| `physics` | Moving bodies (pose, velocity, sleeping), what each sensor holds, solid contacts |
| `call_action` | Call an action on a live node: `open` on a hinge, `goTo` or `say` on a character |
| `interact` | A character does an item's verb (take, use, sit, open), as an NPC's request would |
| `play`, `screenshot` | The editor only (instead of `engine_load`): play / stop / pause / resume, and a PNG of the view |

The list stays generic: 17 tools headless (about 1,350 tokens), 18 for the editor (about 1,450). One tool per node type
would cost about 660 tokens each (AB-R-0933). Errors come back as text the agent can read and act on.

The package splits into Node parts (`server.js`, `headless.js`, `engine.js`, `bridge.js`, `project.js`) and page-safe
parts: `@vrmxg/mcp/tools` (the list and the handlers over a target) and `@vrmxg/mcp/live` (`LiveView`: the live tree,
node state, physics, actions, interactions and stepping over any running SceneTree).

**Project.** Asset refs are paths under the project root. Prefabs load on demand. `--behaviours` names a module that
exports behaviour classes under the names scenes use (`export { Wander as wander }`). `animations.json` at the root, a
`vrmxa-animations` document whose clips' `file` paths are under the root, gives every character fallback animation sets.
`.vrmxa` characters need `--vrmxa-core` (the avatar studio's package, injected: AB-D-0249).

Tests (`npm test`, the official MCP client against the server on stdio, on temporary copies): the tool list size; an agent
describes Camera, makes a mistake the schema refuses, adds a camera to the cafe, sets, undoes, redoes, saves, and the file
validates; a kinematic walker held on `move_y` walks into the entrance trigger, the door opens (signals, the hinge at
-100°, the sensor holding the walker), walks out (closed), and `call_action open` opens it with nobody there. Where the
W6 harness assets exist: the cafe with Mira replaying the recorded input, the entrance door open and its angle read.

**Result (AB-R-0944, 2026-11-17).** Registered in a Claude Code session (`claude -p --mcp-config`,
Sonnet), an agent described Camera, added `cam-overview` to a copy of the cafe, saved, and `validate` returned ok with no
errors or warnings: four tool calls, none failed (`results/claude-code-session.json`).

**Result in the editor (M1 W9, 2026-11-18).** The editor's Mac app was open on the sample project, and
`apps/editor-mac/scripts/mcp-session.mjs` ran a Claude Code session against it (`claude -p`, Sonnet, `vrmxg-mcp
--editor`): 16 tool calls, none failed, $0.21 (`apps/editor-mac/docs/hand-test/results/mcp-editor-session.json`). The
session did, in order:
- added `cam-overview` (orbit, targeting Hana, 85 mm);
- played;
- held `move_y` for 60 steps: Mira walked 1.4 m;
- had Mira take the sword: she then holds it (`held:sword`);
- cued Hana's welcome line;
- read live states;
- took a screenshot;
- stopped: the scene came back to the same hash.

Afterwards the editor's toolbar read "Undo Add cam-overview (MCP)", and Edit › Undo took the camera back out. The scene
returned to its saved hash and Redo then named the session's edit (`docs/hand-test/shots/mcp/after-undo.png`). The first
run split its calls between two editors polling the same bridge (a browser tab left open). The bridge now serves one
editor at a time and tells any other that the link is taken.

## Sequences, brains and frames (M2 W11, AB-T-0534)

Three tools more, still generic (20 tools, about 1,730 tokens headless; 21 and 1,860 for the editor), and the server's
`instructions` at initialize (the five rules that save an agent a round trip). Answers are compact JSON, cut at 24,000
characters with a note.

| Tool | What |
|---|---|
| `edit` | Several edit ops as one undo step, all or nothing: add, set, remove, reparent, connect, and `setDoc` on `sequence.*` or `settings.*`. Sequences are edited this way: shots, markers and tracks are document values, not node types |
| `sequence` | Without a frame, the outline from the file (shots, markers, tracks; no engine needed). With one, the running world (headless) or the editor's preview world put on that frame exactly as playing would reach it (SequencePlayer's snapshots), with the shot, the live virtual camera, who is speaking and a world hash to compare replays |
| `brain` | inspect (the running branch, utility scores, goal, blackboard, the 12 freshest memories), inject a goal or an action on a step (logged), record the events applied, replay a log: the hook M3's director uses |
| `screenshot` (editor) | `frame`: that frame of the open sequence as an export renders it, with its world hash and pixel statistics; a flat frame is flagged BLANK |

`tools/beats.mjs` runs a scene headless and prints each brain's branch as it changes, the lines and the cuts, with the
frame each lands on: "Morning at the cafe" was cut from it. Checked in the editor in Chromium over the bridge: the
outline, a seek to frame 735 (s4, 766 ms from step 0), three frame screenshots (luma 170–193 ± 47–62, none blank) and a
batch edit undone in one step.
