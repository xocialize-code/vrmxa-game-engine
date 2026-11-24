# @vrmxg/game

M5 W2 (AB-T-0617, design in AB-D-0283). Game flow: what makes a scene a game.
- **The game state**: score and counters, flags, timers, goals, win and lose. A scene declares them as nodes; their
  values live in the `game` service, in the world snapshot and in every step's hashes.
- **Scene changes while playing** (title, level, ending) that keep the state and land on the same step in Node,
  Chromium and WKWebView, however long loading takes.
- **Checkpoints** the game writes by itself, on `@vrmxg/save`.

```js
import { GameFlow, installGame } from '@vrmxg/game';

const flow = new GameFlow({
  seed: 7, store,                                    // store: a @vrmxg/save store, for checkpoints
  load: async ({ scene, seed, step }) => {           // the host builds one world per scene
    const tree = new SceneTree({ registry, seed });
    tree.clock.step = step;                          // the session's clock, before instantiate
    installInput(tree); installPhysics(tree, R);
    installGame(tree, { scene });                    // after physics
    installSave(tree, { scene: { ref: scene, doc } });
    return tree.instantiate(doc);
  },
  unload: (tree) => tree.services.get('physics').world.free(),
  onWorld: (tree) => host.setTree(tree),             // the renderer follows the world being played
});
await flow.start('title.vrmxs');
flow.frame(elapsed);                                 // the frame loop, in place of tree.frame
flow.on((event) => hud.update(flow.view()));         // what a HUD binds to: it outlives worlds
```

## Rules are scene data

Five node types, in the registry (`@vrmxg/registry/m0`), so the scene schema validates them, the editor's inspector
edits them and MCP describes and sets them with the tools it has. The nodes declare; the values are the service's.

| Node | Props | Signals | Actions |
|---|---|---|---|
| `GameRules` (one per scene) | `win`, `lose` (conditions), `flags` (the values a game starts with), `keepOutcome` | `won`, `lost`, `ended { result }`, `flagChanged` | `win`, `lose`, `setFlag { flag, value }`, `clearFlag`, `changeScene { to, after, reset }`, `restart` |
| `GameCounter` | `key`, `start`, `min`, `max`, `label`, `scope` (game) | `changed { value, by }` | `add { by }`, `set { value }`, `reset` |
| `GameTimer` | `key`, `seconds` (absent: a stopwatch), `autostart`, `label`, `scope` (scene) | `started`, `stopped`, `timeout` | `start`, `stop`, `reset`, `addTime { seconds }` |
| `GameGoal` | `key`, `text`, `when` (a condition), `optional`, `scope` (scene) | `completed` | `complete` |
| `Checkpoint` | `slot`, `when` (a condition), `once`, `label` | `written { slot }` | `write` |

- `key` is the name in the game state; it defaults to the node's id. **The score is the counter named `score`.**
- `scope`: `game` values are kept across scene changes; `scene` values start again each time the scene is entered.
- A rule is wired like a door: a signal, a connection, an action. The scene carries no code.
- A `GameTimer` with `seconds` is a countdown, however few they are: with none left (`seconds: 0`, or `addTime` taking
  it below nothing) it times out on its next tick. One without `seconds` is a stopwatch: no limit, never a timeout, and
  `addTime` on it is an error, not a guess.
- Any name will do for a counter, a flag, a timer or a goal (`constructor` is a name like another) except `__proto__`.

```json
{"id":"rules","type":"GameRules","props":{"flags":{"tillClosed":false},"lose":{"key":"timers.clock.done","test":"state"}}},
{"id":"orders","type":"GameCounter","parent":"rules","props":{"label":"Orders taken"}},
{"id":"clock","type":"GameTimer","parent":"rules","props":{"seconds":180}},
{"id":"close-till","type":"GameGoal","parent":"rules","props":{"text":"Close the till","when":{"key":"flags.tillClosed","test":"state"}}}
```
```json
{"from":"counter-area","signal":"bodyEntered","to":"orders","call":"add"},
{"from":"rules","signal":"ended","to":"rules","call":"changeScene","args":{"after":2,"to":"ending.vrmxs"}}
```

### Conditions

Data in the shape `@vrmxg/ai`'s tests have, `{ "test": name, ...args }`, so the engine has one small condition
language. `state` compares with ai's own `bb` test, over the game's view (below) where a brain runs it over its
blackboard.

| Test | Arguments | Holds when |
|---|---|---|
| `state` | `key` (a path into the view), `op`, `value` | `op`: `eq`, `ne`, `gt`, `ge`, `lt`, `le` compare with `value`; `set` (the default): there and not `false`; `unset` |
| `all`, `any` | `of`: a list of conditions | every one, at least one |
| `not` | `of`: a condition | it doesn't |

A rule that is wrong must not win or lose a game by accident, so two things are stricter than a brain's test:

- **A condition reads only what its own scene declares**, and that is checked when the rules start (once every node
  is in, and again when one is added): `counters.<key>` needs a `GameCounter`, `flags.<flag>` an entry in the
  `GameRules`' `flags`, `timers.<key>.<field>` a `GameTimer`, `goals.<key>.<field>` a `GameGoal`,
  `checkpoints.<slot>` a `Checkpoint`. A key that names nothing stops the scene with an error naming the node and the
  key (`GameRules "rules": lose reads "counters.livez": this scene has no counter "livez" (counters: lives)`), and so
  does comparing a stopwatch's `left`. A value carried in from another scene is declared here too (a `GameCounter`
  with the same key; the flag in `flags`), which is also what gives it a value when a game starts in this scene.
- **A comparison with nothing to compare is false**, whichever op: a key that isn't there, or a value that is `null`.
  Test for nothing with `unset`. A path goes through own properties only.

The other keys: `score`, `outcome` (`"won"`, `"lost"`), `scene`, `step`, `sceneSteps`, `arrivals`, `goal.key`,
`decided.result`, `pending.to`, `checkpoint.slot`. Timer fields: `left`, `elapsed`, `seconds` (seconds), `leftSteps`,
`elapsedSteps`, `steps`, `limit`, `running`, `done`. The schema checks a condition's shape three levels deep;
`checkCondition(c)` checks the whole of it and `checkKeys(c, declared)` its keys. `describeRules(doc)` reports both
for a document, without running it.

### The step

The service runs in `afterNodes`, so install it after physics: the step's contacts and sensors have fired and the
actions their connections called are in the state. In order:

1. timers tick (a timer follows its node's pause and time scale);
2. goals, in the scene's order: one whose condition holds is done;
3. checkpoints whose condition became true are asked for;
4. the `timeout` signals of the timers that reached zero in 1;
5. **the result, once**: won if anything asked for a win this step or the rules' `win` holds (without one: every goal
   that isn't optional done); otherwise lost if anything asked for a loss or the rules' `lose` holds;
6. the checkpoints asked for are taken, unless 5 just decided the game.

- **The `win` and `lose` actions ask; step 5 decides.** So a win and a loss on the same step is a win whatever asked
  for each and wherever in the step it fired: a condition, a timeout's connection, a goal's, a contact's. Asked for
  after the rules ran (by a later service, or by a tool between steps), it is decided by the next step's rules.
- **No checkpoint on or after the step the game is decided.** One asked for on that step is skipped (`checkpointSkipped`),
  so a checkpoint never holds a lost game.
- A result holds the clocks that were running, and while the game is decided no goal is done and the first result
  stands. A timer started afterwards runs (an ending's own clock). A new game, or a scene whose `GameRules` doesn't
  `keepOutcome`, starts undecided.

## The contract for a HUD and for tools (W3, W9)

Bind to the **flow**: it outlives worlds. (Without a flow, the service has the same `view()`, `on()` and `version`.)

**`flow.view()`** is the whole state as plain data: a fresh object each call, which `structuredClone`, JSON and
`postMessage` carry. Changing it changes nothing.

| Field | What |
|---|---|
| `scene`, `step`, `sceneSteps`, `arrivals` | The scene being played, the clock, steps since this scene was entered, scene changes so far |
| `score` | The counter `score` (0 without one) |
| `counters` | `{ key: number }`. `labels`: `{ key: label }` for the counters this scene declares with one |
| `flags` | `{ flag: boolean \| number \| string }` |
| `timers` | `{ key: { seconds, elapsed, left, steps, elapsedSteps, leftSteps, limit, running, done, declared, label } }`. Seconds are steps / 60. `limit`: a countdown; for a stopwatch it is `false` and `seconds`, `left`, `steps` and `leftSteps` are `null`. `declared`: this scene has the node (a timer carried from another scene is data and doesn't run) |
| `goals` | `{ key: { done, step } }`, every goal the game knows |
| `objectives` | This scene's goals in order: `[{ key, text, done, optional }]` |
| `goal` | The one to show: the first not done (`{ key, text }`), or `null` |
| `outcome`, `decided` | `null`, `"won"` or `"lost"`; `decided` adds the step and the scene: `{ result, step, scene }` |
| `pending` | A scene change asked for: `{ to, at, reset }` (`at`: the step boundary it happens on), or `null` |
| `checkpoint`, `checkpoints` | The last checkpoint taken, `{ slot, id, requested }`, and the last per slot. Taken means the rules took it; `checkpointWritten` says the file exists |

**`flow.on(fn)`** gives changes as `{ type, …, step }`, and returns a function that stops it. Events are queued during
the step and delivered at presentation (`tree.present`, or `flow.flush()`), never inside the step, so a listener can't
change what a step computes. **`flow.version`** changes whenever the view would (a running clock moves it every step):
re-read the view when it does.

| `type` | Fields |
|---|---|
| `counter` | `key`, `value`, `by` |
| `flag` | `flag`, `value` (`null`: cleared) |
| `timer` | `key`, `event`: `started`, `stopped`, `reset`, `changed`, `timeout` |
| `goal` | `key`, `done` |
| `outcome` | `result` |
| `pending` | `to`, `at` |
| `checkpoint` | `id`, `slot`: taken, in the step |
| `checkpointSkipped` | `id`, `slot`, `reason`: asked for and not taken. `decided`: the game was decided on that step. `scene`: the scene changed while it waited for a step that could save |
| `checkpointWritten` | `id`, `slot`, `step`, `stored`: the file exists (in `flow.checkpoints`; `stored`: and in the store). **Say "saved" on this one** |
| `checkpointFailed` | `id`, `slot`, `step`, `error`: no file, or not in the store (the store's write failed; the world couldn't be saved at the boundary) |
| `scene` | `from`, `to`, `reset`: the world changed |
| `loaded` | `scene`, `step`, and `recording` when an input recording was in progress (it is stopped and handed over here) |
| `restored` | A snapshot was restored |

**Changing the state** is simulation: do it inside the step, from a node's action or a behaviour
(`tree.services.get('game')`: `add(key, by)`, `set(key, value)`, `setFlag(flag, value)`, `clearFlag`, `startTimer`,
`stopTimer`, `resetTimer`, `addTime`, `completeGoal`, `win`, `lose`, `changeScene({ to, after, reset })`, `restart`).
`win` and `lose` ask: `outcome` changes at the end of that step's rules.
A menu or dialogue choice reaches it as a latched, recorded input, so a replay makes the same change on the same step.
A tool that sets a value between steps (MCP, while paused) changes the run from there on, as an edit does.

**The rules themselves** are node props: MCP reads and sets them as it does any node. `describeRules(doc)` reads a
document without running it: the rules node, counters, timers, goals, checkpoints, the scenes its connections change
to, the state keys its conditions read, and what would stop it starting.

## Scene changes

`changeScene({ to, after, reset })` (the `GameRules` action) only records the request in the game state. The step it
is asked in finishes whole.

- **One fresh world per scene.** The flow asks the host for a world of the next scene, `load({ scene, seed, step,
  reason })`, built as a load builds one, and carries the session into it. A tree is never emptied and refilled: a
  refilled tree differs from a fresh one in ways a snapshot can't be restored onto (timer ids, Rapier's handles), and
  a save taken after the change must load into a fresh world.
- **When.** At the step boundary where the clock reaches the request's `at`: the step after the request, or `after`
  seconds later (rounded to steps). Building starts as soon as the request is seen, so a world is often ready by then.
  If it isn't, `flow.step()` returns `false` and nothing steps (a hitch in live play; `await flow.settle()` in a
  script). The next scene's first step is `at` + 1 in every runtime, whatever loading took.
- **One timeline.** The next world starts on the step the last one ended on: one input recording, one run of hashes
  and every save's step share a clock. The host sets `tree.clock.step` before `instantiate`; the flow refuses a world
  at another step or with another seed, and says how to build it.
- **Seeds.** `worldSeed(session seed, changes so far)`: a scene entered twice differs, a replay doesn't.
- **What is carried.** The game state (`scope` decides, per value); the input service's latched frame, a recording in
  progress and a replay (`always`); save's flags and the inventory (`carry`). `reset: true` carries only the session:
  a new game. A later request replaces a pending one, as Godot's `change_scene` does. If carrying throws (a service
  that can't take the other's state), the change fails with that error on every step, the world built for it is freed
  once, and the session stays in the scene it was in.
- **Not carried in M5:** a character's run-time closet changes (characters arrive as the next scene declares them),
  a closet redraw still in flight when the change lands (it is dropped with the old world), and anything asked for
  and not yet decided (a checkpoint waiting for a step that can save: `checkpointSkipped`).

## Saves and checkpoints

- `flow.save(o)` is `@vrmxg/save`'s file of the world being played (taken between steps), with `extra.game` for a
  slot list: `{ scene, score, goal, outcome }`.
- `await flow.load(file)` reads the scene from the file, builds that world, restores it and plays it. A file that
  can't load leaves the world being played alone, and the error says why. A load jumps the clock, so an input
  recording in progress is stopped and handed over (the `loaded` event's and `onWorld`'s `recording`); replay one
  again after it. `flow.step()` is held while a save loads, and `settle()` waits for it.
- A **checkpoint** is a `Checkpoint` node: by its action (a trigger's connection) or when its condition becomes true.
  The step's rules take it (step 6 above); the flow saves the world at the boundary after that step.
  - **Never a decided game**: none is taken on or after the step the game is won or lost.
  - **Never a world that can't be saved**: while a closet redraw is in flight it stays asked for, in the state, and is
    taken on the first step that can save. If the scene changes first it is skipped, and says so.
  - **State, file and events agree.** The state says a checkpoint was taken only once the rules took it;
    `checkpointWritten` follows when the file exists, or `checkpointFailed` when it doesn't.
- **Where the files go.** `flow.checkpoints` has each slot's latest file. With a `store` they are also written there
  under `CHECKPOINT_PREFIX` and the slot: `auto-checkpoint`. **A save menu keeps the player's saves out of `auto-`
  names** and may list those slots as checkpoints.
- `await flow.loadCheckpoint(slot)` loads this session's own latest file for the slot (whether or not the store has
  written it yet, or failed to), else the store's.
- A save or a checkpoint taken before a scene change, loaded into a new session, goes on with the unbroken run's
  hashes, across the change and the ones after it.

## Known limit: a timer under a slowed or disabled node

A `GameTimer` follows its node's `timeScale` and `processMode`. `@vrmxg/core` doesn't keep either in the world
snapshot yet (AB-T-0627), so a save or a checkpoint taken while a timer's node, or one above it, is slowed or
disabled restores with the node at full speed, and the timer runs differently from there on. Until that task lands,
stop a timer with its `stop` action, and slow the whole game with the clock, not a node.

## Measured

`acceptance/m5` (AB-R-1105, 2026-11-24, M5 Max; AB-R-1101 was the first run, before review changed the state's shape): the test game in `test/fixtures` (a title, a level and an ending
with physics, recorded input and random streams) for 600 steps, through seven scene changes, two of them resets.
- Every step's hashes are identical in Node 26, headless Chromium and WKWebView over the custom scheme and over
  loopback, with loading that takes nothing, a steady 4 ms and a varied 0 to 12 ms per world: final hash
  `68a9e4b580a0e7bf`.
- A save taken at step 60 (before the change at 148) and the checkpoint the game wrote at step 67, each loaded into a
  new session, give the unbroken run's hashes to step 600 in all of them. Both are the same file in every runtime.

## Tests

`npm test` (no models needed, so it runs on CI):
- conditions: every op, composition, the problems named with their path; the registry's tests and ops are the
  package's; a comparison with nothing to compare is false; keys checked against what the scene declares;
- scene data: the fixture scenes validate and are canonical; thirteen wrong rules are refused by the schema;
- counters, flags, timers (pause, time scale, added time), goals in order, win and lose and their tie, the view and
  the events;
- the state in the snapshot and the hashes; a restore mid-game;
- the session: 600 steps and seven changes on their steps; the same hashes again and with slow loading; held steps;
  saves at five points loaded and played on; a load mid-session; a refused file;
- checkpoints written at their point, loaded, not written twice; a lost game; a recording made across changes;
- a host that builds the wrong world; a failed load; a replaced request; what is carried and what a reset drops;
- `edges.test.mjs`, one test per rule found in review: no checkpoint on a deciding step; `loadCheckpoint` with a slow
  and a failing store; a countdown driven to nothing; a stopwatch; any name but `__proto__`; a checkpoint that waits
  for a savable step, one a scene change overtakes, one the boundary can't save; a win and a loss on one step from
  every source; a carry that throws; a recording across a load; waiting for a load.
