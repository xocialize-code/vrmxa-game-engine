---
title: "Tutorial: your first game"
description: "From New Project to a game build that plays: a level with three coins to collect, a behaviour of your own written as a file, attached and wired in the editor, played, and exported."
order: 9
---

# Tutorial: your first game

This tutorial makes **Coin Run**, a small game in the sample cafe. Mira collects three coins on her way to the
counter, Hana calls out each one, and the game is won at the counter. On the way you use every part of building a
game in the editor:

- New Project, from a template;
- building a level from the Scene panel and the inspector, with no JSON typed;
- a behaviour of your own, written as a file, that declares its params, signals and state;
- attaching it and wiring a connection;
- Play in place;
- Export Game, and playing the build in the game app.

It takes about half an hour. The [editor guide](./editor) explains each panel in more depth.

**This tutorial is checked.** An AppProbe scenario follows it step by step in the Mac editor, on WebGPU and on WebGL,
so a change to the editor that breaks a step fails the scenario. Each step's heading below is a row of that scenario.

## Before you start

- The Mac editor built and running: [Running the apps](./running#as-mac-apps) has the commands
  (`apps/editor-mac/scripts/build.sh`, then `open apps/editor-mac/build/VRMXGEditor.app`).
- A text editor for one JavaScript file.
- The keys used here: **WASD** or the arrow keys walk, **Shift** runs, **E** interacts.

## 1. Make the project from the One level template

Choose **File › New Project…**. The sheet lists the templates:

| Template | What you get |
|---|---|
| Empty game | One scene with a light, ground and a camera, and the engine's default controls |
| One level | A level in the cafe that plays from the first minute: Mira to play, Hana at the counter, a goal (get to the counter), a score, and an ending scene. The cafe, both characters, the animation set and two sounds are copied in |

Pick **One level**, type **Coin Run** as the title (the game's id follows it: `coin-run`), and press **Create…**. The
editor asks where the folder goes, makes it, and opens the game's first scene, `level.vrmxs`.

![The New Project sheet with the One level template chosen](/guide/images/tutorial-new-project.jpg)

Every file in the new folder has a row in its `LICENCES.md`: a game build refuses a file without one.

## 2. Play the template once

Press **Play** in the toolbar. The level runs in the editor's viewport: Mira walks with WASD, Hana turns to look at
her, the scene's behaviours and connections run. Press **Play** again to stop. Stopping puts the scene back exactly as
it was before Play, so nothing you do while playing changes your level.

Play in place runs the scene, not the whole game: the game's rules (its counters, goals, winning and the change to the
ending) run in the game app, which step 12 uses. So reaching the counter here doesn't win.

## 3. Count the coins

The game needs a number to count coins in. At the top of the **Scene** panel, choose **GameCounter** in the node type
menu beside **Add**, and press **Add**. In the inspector:

- **Id**: `coins` (a counter's id is its name in the game state);
- **Parent**: `rules` (the level's GameRules node; counters and goals live under it);
- **Position**: 0, 0, 0;
- **label**: `Coins`.

Every change is one step of **Edit › Undo**, and the Undo button's name says what it will undo.

## 4. Add the goal

Add a **GameGoal** the same way, and set:

- **Id**: `collect-coins`, **Parent**: `rules`, **Position**: 0, 0, 0;
- **Before**: `reach-counter`, so it comes before the template's goal (the game shows the first goal that isn't done);
- **text**: `Collect the three coins`;
- **when**: the test **state**, the key `counters.coins`, the op **ge** (greater than or equal) and the value `3`.

The game is won when every goal is done: now the three coins, then the counter.

![The goal's condition in the inspector](/guide/images/tutorial-goal.jpg)

## 5. Write the coin behaviour

A behaviour is code attached to a node. The engine has its own (`player`, `wander`, `brain` and the rest), and a
project can add its own in a JavaScript module. Save this as `behaviours.js` in the project's folder, beside
`game.json`:

```js
import { Behaviour } from '@vrmxg/core';

// A coin: on an Area, collected the first time the player walks into it.
export class coin extends Behaviour {
  static describe = {
    description: 'A coin to collect (an Area): the first time the player walks into it, adds to a game counter and says it was collected.',
    on: ['Area'],
    params: {
      player: { type: 'string', nodeRef: true, default: 'mira', description: 'Who collects it: the player\'s Character.' },
      counter: { type: 'string', minLength: 1, default: 'coins', description: 'The game counter it adds to.' },
      value: { type: 'integer', minimum: 1, default: 1, description: 'How much it adds.' },
    },
    signals: {
      collected: { description: 'The player collected it (once).', args: { value: { type: 'integer', description: 'What it added.' } } },
    },
    state: {
      type: 'object', additionalProperties: false, required: ['touched', 'taken'],
      properties: {
        touched: { type: 'boolean', description: 'The player has walked into it.' },
        taken: { type: 'boolean', description: 'It was collected.' },
      },
    },
  };

  ready() {
    this.touched = false;
    this.taken = false;
    this.tree.listen(this.node, 'bodyEntered', ({ body }) => {
      if (body === (this.params.player ?? 'mira')) this.touched = true;
    });
  }

  physicsProcess() {
    if (this.taken || !this.touched) return;
    const game = this.tree.services.get('game'); // the game's state: there in the game app, not in Play in place
    if (game?.view().outcome) return; // won or lost already
    const value = this.params.value ?? 1;
    this.taken = true;
    game?.add(this.params.counter ?? 'coins', value);
    this.emit('collected', { value });
  }

  getState() { return { touched: this.touched, taken: this.taken }; }
  setState(s) { this.touched = s.touched; this.taken = s.taken; }
}
```

What each part does:

- **The class's name is the behaviour's name** in scenes: `{ "use": "coin" }`.
- **`static describe`** declares it the way the engine's own behaviours are declared, so the editor's inspector edits
  its params, validation knows its signal, and a connection from that signal is valid. `on` says which node types it
  attaches to. Params and the signal's arguments are JSON Schema; `nodeRef: true` makes `player` a node picked from a
  menu. The [behaviours reference](../reference/behaviours#project-behaviours) has every key.
- **`state`** is the JSON Schema of what `getState` returns. A save holds it, and a replay restores it, so a game
  saved before an update still loads if the shape of this state is unchanged.
- **`ready`** runs when the node enters the running tree; **`physicsProcess`** runs once every simulation step
  (60 a second). The listener only notes that Mira walked in; the step does the work, so it happens on the same step
  every time the game is played. That is what makes a recorded session replay exactly. Simulation code uses
  `@vrmxg/dmath` for maths such as `sin` (this one needs none): [Determinism](./determinism) has the rules.
- **`game`** is the game's state: its counters, flags, goals and result. The game app has it; the editor's Play in
  place doesn't (below), so the code asks for it with `?.` and the coin is still collected there.
- **`this.emit('collected', …)`** sends the signal. What happens next is wired in the scene, not in the code.

Then add a row for the file to the project's `LICENCES.md`, at the end of its table (a file without a row can't go
into a build):

```text
| `behaviours.js` | CC0-1.0 | The coin behaviour, written for Coin Run |
```

## 6. Read the behaviour in

The editor reads a project's files when it opens the project, so save the level (**Save**, ⌘S) and open the project
again: **File › Open Recent › Coin Run**. Then choose **File › Project Settings…**, pick `behaviours.js` under
**Behaviours**, and press **Done**.

Play in place runs a `behaviours.js` at the project's root by itself, but a build takes only the module the game
names in `game.json`, which this setting writes. Until it is set, Export Game refuses the project: try **File › Export
Game…** before you set it, and the **Export** panel opens with the refusal on its line, saying what to do.

![Project Settings with behaviours.js chosen](/guide/images/tutorial-settings.jpg)

## 7. Make the first coin

A coin is two nodes: an **Area** (a volume that notices bodies walking in) with the `coin` behaviour on it, and a
**ParticleEmitter** under it so it can be seen.

1. Add an **Area**: **Id** `coin-1`, **Name** `Coin 1`, **Position** 0, 0.5, 4 (where Mira starts, so you see it
   collected the moment you press Play). Press the pin beside **shape** to write its default, a box, into the scene,
   and set **size** to 1, 1, 0.6.
2. In the **Behaviours** panel, choose `coin` and press **Add**. Its three params show with their defaults
   (`mira`, `coins`, `1`), read from the `describe` you wrote.
3. Add a **ParticleEmitter**: **Id** `glint-1`, **Parent** `coin-1`, **Position** 0, 0, 0, and **effect** `sparks`.

The glint is the engine's built-in sparks effect, because the One level template doesn't bring in the starter content
(a CC0 item pack with a coin) yet. A model or an item under the Area would do as well, wired to **hide** instead of
**stop** in the next step. (Hiding doesn't stop a particle effect: it goes on emitting, so an effect is stopped.)

![The coin behaviour in the Behaviours panel, its params from its describe](/guide/images/tutorial-behaviour.jpg)

## 8. Wire the coin

Select `coin-1`. In the **Connections** panel, make two connections, each by picking the signal, the target and the
action from their menus and pressing **Connect**:

- **collected** → `glint-1` → **stop**: its glint stops sparkling once it is collected;
- **collected** → `hana` → **say**, with the text `A coin! Keep going, Mira.`: Hana calls it out.

A connection is data in the scene: the behaviour only says that something happened, and the scene decides what it
does.

![The coin's two connections](/guide/images/tutorial-connections.jpg)

## 9. Two more coins

With `coin-1` selected, press **Duplicate** at the top of the Scene panel twice (or ⌘D). Each copy takes its glint
and its connections with it, retargeted to the copy: `coin-2` stops `glint-2`, and still has Hana say her line. Put
them on the way to the counter:

- `coin-2`: **Name** `Coin 2`, **Position** 0, 0.5, 2.6;
- `coin-3`: **Name** `Coin 3`, **Position** 0, 0.5, 1.3.

(A copy keeps the name it was copied from, so without this all three would read "Coin 1" in the tree.)

Then **Save** (⌘S). The scene is valid: the status bar at the bottom says so.

## 10. Play it

Press **Play**. The coin at Mira's feet is collected at once: its glint stops and Hana says "A coin! Keep going,
Mira." Walk forward (W) through the other two and each does the same. Press **Play** again to stop. The coin counter,
the goals and the win are the game's rules, so you see them in the build (step 12).

While it plays, change something in `behaviours.js` and save it: the editor reloads the module without restarting
the scene ([Hot reload](./editor#hot-reload)).

![Play in place: the first coin collected](/guide/images/tutorial-play.jpg)

## 11. Export the game

Choose **File › Export Game…**. The **Export** panel opens, and the editor checks everything first: every file the
game uses is in the project and has a licence row, and the behaviours module loads and is the one `game.json` names.
Then it asks where the build goes: create an empty folder, `coin-run`, and choose it. The Export panel's line says how
many files and bytes it wrote, and where.

A build is a folder: the game app, your project's files and `vrmxg-build.json`, which lists every file with its hash
and licence.

## 12. Play the build in the game app

The build plays in any browser from a static web server, and as a Mac app:

```bash
node apps/game/scripts/play.mjs <build folder>          # serves it on loopback and prints the address
apps/game-mac/scripts/build.sh <build folder>           # apps/game-mac/build/coin-run.app, named after the game
```

The game app opens on its title menu. Choose **New Game**. The HUD shows the goal, "Collect the three coins"; walk
through them and it changes to "Get to the counter"; reach the counter and the game is won, the ending plays, then
the level starts again.

![The build in the game app: the first coin collected, Hana's line, the HUD's goal](/guide/images/tutorial-game.jpg)

[Export Game](./editor#export-game) in the editor guide has the rest: hosting a build on the web and getting a Mac
app ready to sign.

## Where next

- The [editor guide](./editor): every panel, prefabs and overrides, the assets panel, the viewport's aids.
- The [behaviours reference](../reference/behaviours) and the [node reference](../reference/nodes): every engine
  behaviour, node type, prop, signal and action.
- [The scene format](./scene-format): what the editor writes into `level.vrmxs`.
