# @vrmxg/mcp

M0 W7 (AB-T-0508). The VRMXG MCP server: describe node types from the registry, edit a `.vrmxs` scene with undo, and
inspect and drive that scene in a headless engine running in Node.

```sh
node engine/packages/mcp/src/server.js <project-root> <scene.vrmxs> [--behaviours <module.js>] [--vrmxa-core <dir>] [--seed N]
claude mcp add vrmxg -- node "$PWD/engine/packages/mcp/src/server.js" <project-root> <scene.vrmxs>   # register in Claude Code
```

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

The list stays generic: 16 tools, about 1,230 tokens (one tool per node type would cost about 660 tokens each,
AB-R-0933). Errors come back as text the agent can read and act on.

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
