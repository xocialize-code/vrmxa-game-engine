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
exports behaviour classes under the names scenes use (`export { Wander as wander }`); a class with a static `describe`
(M6 W0) is declared to the registry when the server starts, so `describe` lists it (marked `project`) with its params,
signals, actions and the state it keeps, and `validate` accepts connections from its signals. `animations.json` at the root, a
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
characters with a note. M2 W12 added `sequence {path}`: 20 tools at about 1,770 tokens headless, 21 at about 1,900 for the editor.

| Tool | What |
|---|---|
| `edit` | Several edit ops as one undo step, all or nothing: add, set, remove, reparent, connect, and `setDoc` on `sequence.*` or `settings.*`. Sequences are edited this way: shots, markers and tracks are document values, not node types |
| `sequence` | Without a frame, the outline from the file (shots, markers, tracks, cast; no engine needed). With `path`, the value at a `setDoc` path (`sequence.tracks.4`, `sequence.cast.mira`), so an agent reads what an edit replaces before writing it (M2 W12: with only the outline, check 9's agent stopped rather than overwrite tracks blind). With one, the running world (headless) or the editor's preview world put on that frame exactly as playing would reach it (SequencePlayer's snapshots), with the shot, the live virtual camera, who is speaking and a world hash to compare replays |
| `brain` | inspect (the running branch, utility scores, goal, blackboard, the 12 freshest memories), inject a goal or an action on a step (logged), record the events applied, replay a log: the hook M3's director uses |
| `screenshot` (editor) | `frame`: that frame of the open sequence as an export renders it, with its world hash and pixel statistics; a flat frame is flagged BLANK |

`tools/beats.mjs` runs a scene headless and prints each brain's branch as it changes, the lines and the cuts, with the
frame each lands on: "Morning at the cafe" was cut from it. Checked in the editor in Chromium over the bridge: the
outline, a seek to frame 735 (s4, 766 ms from step 0), three frame screenshots (luma 170–193 ± 47–62, none blank) and a
batch edit undone in one step.

## Directors (M3 W10, AB-T-0549)

`brain` grows four ops, and `replay` takes a take; still 20 tools (about 1,857 tokens headless, 1,987 for the
editor):
- **`director`:** a directed character's requests in flight, its last answer (calls or errors) and the conversation so
  far, with the blackboard's conversation and hearing flags.
- **`talk`:** say text to her through her director, as the person (the player's node). Then `engine_step`, and
  `director` shows the answer.
- **`takes`:** the project's recorded conversations (`takes/*.json`): scene, seconds, events and decisions.
- **`replay` with `take`:** a take's ai log and input, from now on.
- **`profile`:** her persona (name, summary, traits, goals, replies) and role profile. With `profile`, it sets traits
  (0–1). The write is a `setDoc` on the scene's `settings.personas`, so it's one undo step, saves with the scene, and
  undoes exactly. The project's `personas.json` is left as it is.

**Where the directors are:**
- **Headless:** `VRMXG_DIRECTOR=demo` (or a chat-completions URL) gives the engine a director, pumped as it steps.
- **The editor:** opened with `?director=demo` (or a URL), it gives its play world one, pumped by its frame loop.

Both load the project's `personas.json` with the scene's overrides.

**Checked:**
- `test/mcp.test.mjs`, over stdio on the sample cafe with Hana as host:
  - a profile read, set and undone, with the scene exactly restored;
  - talk, then the answer and the order goal;
  - takes listed and replayed.
- A Claude Code session on the editor (`apps/editor-mac/scripts/mcp-session.mjs --m3`, Sonnet, editor tools only,
  `docs/hand-test/results/mcp-editor-session-m3.json`): 19 calls, none failed.
  - It gave Hana a brain, played, read her persona, talked to her ("One latte, coming right up!", goal takeOrder),
    injected an emote and confirmed it in the record.
  - It set her talkativeness, and undid the profile and the brain with the editor's Undo, leaving the scene's settings
    as they were.

The first session run found that the scene schema refused the M3 presets (`host`, `conversationPartner`, `follower`).
The second found that the editor never loaded `personas.json`, and that a profile undo left an empty object behind.
All three are fixed.

## Shorts in the creator (M4 W11, AB-T-0583)

```sh
node engine/packages/mcp/src/server.js --creator [--port 5184]
claude mcp add vrmxg-creator -- node "$PWD/engine/packages/mcp/src/server.js" --creator
```

`--creator` relays calls to the open VRMXG creator through the same bridge (`EditorBridge({ app: 'creator' })`, port
5184 by default, so the editor and the creator can both be linked). Its tools are `@vrmxg/mcp/shorts`
(`shortToolList`, `createShortHandlers`), page-safe like `@vrmxg/mcp/tools`:

| Tool | What |
|---|---|
| `short` | The open short: outline, script, lines (with ids and voices), roles, shots (cameras per shot), cameras, queue, history |
| `describe`, `command` | The app's commands from a `CommandRegistry`: names and summaries, one command's JSON Schema, and a run checked against it (`checkArgs`). Adding a command adds nothing to the tool list |
| `render` | A frame of the short as the export draws it, with its shot, world hash and a blank-frame check |
| `read` | The project's files, or one text file |
| `undo`, `redo` | The app's own history |

Seven tools, about 420 tokens, and four rules at initialize (`SHORT_INSTRUCTIONS`). Every edit goes through
`asAgent(session)`, which adds " (MCP)" to the label of the one step a command makes, and `command` refuses an edit
command that made more than one. Text from files comes back as `{ content: { ref, … }, note }` (`asContent`,
`CONTENT_NOTE`): data to read, never instructions. The creator's commands and target are in `apps/creator/src/agent.js`;
`test/shorts.test.mjs` covers the list's size and schemas, the registry, the mark, content and the `--creator` relay.

## Games (M5 W9, AB-T-0619)

```sh
node engine/packages/mcp/src/server.js <project-root> <scene.vrmxs> --builds <folder> [--runtime <folder>]
```

One tool more, still generic: 21 tools headless (about 1,980 tokens) and 22 for the editor (about 2,110), under the
2,000 and 2,200 the lists are held to (`test/mcp.test.mjs`). A game's rules are nodes (`GameRules`, `GameCounter`,
`GameTimer`, `GameGoal`, `Checkpoint`), so they are read and set with the scene tools; what those can't show is the
game as a whole, which is the `game` tool (`src/game.js`, page-safe):

| `op` | What |
|---|---|
| `rules` (default) | Every scene of `game.json` side by side (`@vrmxg/game`'s `describeRules`): its rules, counters, timers, goals, checkpoints, the keys its conditions read, the flags its connections set, the scenes it changes to; and what only the whole game shows (`checkGame`). The open scene is read as edited. A project with no `game.json` is the open scene alone, as Export Game takes it |
| `state` | The running world's game state, as a HUD reads it (`{ state: view(), note }`). The headless engine installs the game service for a scene that has game nodes (a scene without them keeps its hashes); the editor's play world doesn't run rules yet, and says so |
| `validate` | The project's checks, each problem naming its scene and node, or its file: `game.json`; every scene's schema; the rules (`checkGame`); a `RigidBody` with no `Collider` below it (or a dynamic one with only sensors); a goal nothing can complete; and what an export would refuse, from `@vrmxg/bundle`'s `planBuild`, the exporter's own first half (a reference to no file, a file with no `LICENCES.md` row, with the row to add) |
| `export` | A build through `@vrmxg/bundle`: headless into `--builds/<name>` (without `--builds`, checked and hashed, nothing written: where builds go is the person's to say), in the editor through its Export Game (the shell's folder). Refused while the scene has unsaved changes. A refusal comes back whole: `export refused (<code>): <the exporter's message>` and its files, so the `ignore` line or the missing row is in the answer. What validate finds beyond the exporter's checks is said beside the build |

- **A goal nothing can reach** is read from the game's documents, whole, as play carries values across scenes: no
  connection in any scene calls `complete` on a goal of that key, and its `when` can never hold, because what it reads
  never changes (no connection adds to the counter or sets the flag; no scene starts the timer; no goal or checkpoint
  of that name can come about), or a counter's `min` and `max` keep it from the value. Which goals and checkpoint
  slots can come about is a least fixpoint, so ones that wait on each other are judged together. Each scene starts as
  the service starts it (a counter's start clamped; what it reads at its `reads` default). Anything it can't follow
  counts as reachable. Code can't be read: when the project's behaviours mention the game service, such a goal is a
  warning, not a problem.
- **The open scene is read as edited**, and when it isn't one of `game.json`'s scenes, `rules` and `validate` say so.
- **`validate` (the scene tool) checks the open scene's rules too**, when it has a `GameRules` node: a condition that
  reads a key the scene doesn't declare would stop the scene when it starts, so `validate` lists it and `save` refuses
  it. In a scene with game nodes and no `GameRules` (it may be a prefab whose goal reads its host's counter) the same
  problems are warnings that say both readings.
- **`describe` gives a condition once.** The schema writes the condition language out three levels deep for every
  prop that holds one, which put `describe GameRules` past the answer limit; each such prop is now
  `{ "condition": true }` and the language is given once beside it (`CONDITION`). Every type's description fits.
- What a game's documents say (a goal's text, a label, a file's name) comes back with a note that it is data: `rules`,
  `validate` and `state` carry `note`, and an export refusal ends with it.

**Checked.** `test/game.test.mjs` (over stdio, on copies of `test/fixtures/game-problems`, a project made to have three
problems): validate names the crate with no collider, the goal whose flag nothing sets and the file with no licence
row, and nothing else; each fixed through the tools, it is ok, and an undo brings one back; the rules across two scenes
and a read no scene declares; the scene tools refusing a rule with an undeclared key; an export refused for the
licence (the file named), for unsaved changes and for a string that reads as a missing file (the `ignore` line), then
written whole; an export without `--builds`; the game state of a running world; the checks on hand-made documents
(colliders under plain nodes, sensors only, goals by chains, bounds, `not`, timers) and the review's cases (checkpoints
sharing a slot, a goal completed in another scene, a timer another scene starts, a cycle, checkpoints reading their own
slots, a clamped start, a read value's default); no `game.json`; a scene outside the game; a prefab's rules;
`describe` of every type under the limit.

**In the editor** (`apps/editor-mac/docs/HAND-TEST-M5-MCP.md`): a Claude Code session with only the editor's tools
(`apps/editor-mac/scripts/mcp-session.mjs --m5`, Sonnet) read the sample game's rules, added a customer and a goal
(each one edit), validated, saved and exported it: 17 calls, none failed
(`apps/editor-mac/docs/hand-test/results/mcp-editor-session-m5.json`). Its two steps walk back and forth in the editor's
Undo, to the opened hash and back to the agent's.
