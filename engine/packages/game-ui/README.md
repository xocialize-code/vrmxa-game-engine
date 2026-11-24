# @vrmxg/game-ui

M5 W3 (AB-T-0618; decision AB-D-0287; receipt AB-R-1113). The player-facing overlays over the canvas, as DOM with
accessible names, so AppProbe and a screen reader read them:
- **the HUD**: the goal, the score and counters, the timers, what the player carries, the prompt for what is in reach,
  the result, "Saved";
- **dialogue**: the box (who speaks, the line word by word as it is said), the choices, captions. Speech bubbles and
  name tags in the scene come from `@vrmxg/text`;
- **settings controls**: volume per audio bus, and the rebinding list.

Every control is reachable from the keyboard and a gamepad, driven by input actions. What each overlay shows is a
plain function, tested in Node; the components are compiled and rendered on the server in the tests.

```js
import GameOverlay from '@vrmxg/game-ui/GameOverlay.vue';       // the root an app mounts over its canvas
import VolumeControls from '@vrmxg/game-ui/VolumeControls.vue'; // inside the app's own settings menu
import RebindList from '@vrmxg/game-ui/RebindList.vue';
import { useNav } from '@vrmxg/game-ui/use-nav.js';             // the app's menus navigate the same way
import { GameSettings, hudModel, dialogueModel } from '@vrmxg/game-ui'; // the decisions, with no Vue
```

## Mounting it (the contract for the game app, W1)

The app owns its menus (title, pause, save slots, the settings menu's frame). The package gives the overlay and the
settings controls; the app hands them three things: **the session** (a `@vrmxg/game` `GameFlow`), **the input
service** (the flow's world's, which changes with every scene change and load), and **the settings** (a
`GameSettings` over a store the app supplies).

```js
// 1. Settings: the app picks where they live (the shell's storage, IndexedDB, a file). The package picks no storage API.
const store = { read: () => shell.settings.read('game'), write: (s) => shell.settings.write('game', s) }; // null when nothing is stored
const settings = await new GameSettings({ store }).load();

// 2. The session, and the app's devices on each world's input service (a scene change carries the latched frame, the
//    recording and the bindings; the devices are the app's to add).
const flow = new GameFlow({ load, unload, store: saves, scenes, onWorld: (tree) => {
  const input = tree.services.get('input');
  input.addDevice(keyboard); input.addDevice(gamepad);
  host.attach(tree);
} });
await flow.start('title.vrmxs');
settings.applyTo({ input: flow.tree.services.get('input'), audio: output }); // before the first step; the overlay re-applies on every world
```

```html
<!-- 3. Over the canvas, in a positioned box the size of it -->
<div class="stage"><canvas ref="canvas" /><GameOverlay :flow="flow" :settings="settings" /></div>

<!-- 4. In the app's settings menu: wrap the controls in one useNav root so a gamepad moves across all of them -->
<section ref="menu" role="dialog" aria-label="Settings">
  <VolumeControls :settings="settings" :audio="output" :input="() => flow.tree.services.get('input')" @back="close" />
  <RebindList :input="() => flow.tree.services.get('input')" :settings="settings" :hide="['look_x', 'look_y', 'zoom']" @back="close" />
</section>
<!-- script: useNav(menu, { input: () => flow.tree.services.get('input'), onBack: close }) -->
```

| Component | Props → events |
|---|---|
| `GameOverlay.vue` | `flow` (required), `settings` (a `GameSettings`: put on every world's input service, before its first step after a load), `player` (whose prompt and inventory; default: the player's), `hold` (when the overlay takes the devices: `conversation` (default), `choice`, `never`), `hud`, `captions` (booleans), `model` (draw this model as is: tests, a server render) → `choose(id)`, `advance`. Exposes `sync(force)`, `choose(id)`, `advance()` |
| `Hud.vue` | `model` (`hudModel(...)`). No controls |
| `DialogueBox.vue` | `model` (`dialogueModel(...)`) → `choose(id)`, `advance` |
| `Captions.vue` | `lines` (`captionsModel(...)`) |
| `VolumeControls.vue` | `settings`, `audio` (an `@vrmxg/audio` `AudioOutput`, or anything with `setBus`), `input` (for its gamepad) → `back`. Exposes `focusFirst()` |
| `RebindList.vue` | `input` (the input service, or a getter), `settings`, `labels` (a game's names for its actions), `hide` → `back`. Exposes `focusFirst()` |

**Ids and accessible names** (what AppProbe scenarios use): `#hud-goal` ("Goal: …"), `#hud-score` ("Score 10"),
`#hud-counter-<key>`, `#hud-timer-<key>` (`role="timer"`, "Until closing 0:09, hurry"), `#hud-carrying` ("Carrying:
…"), `#hud-prompt` ("Press E or Gamepad X to Take Key", in a polite live region), `#hud-outcome`, `#hud-notice-<id>`;
`#dialogue` (`role="dialog"`, "Conversation with Hana"), `#dialogue-line` ("Hana: …", live), `#dialogue-choice-<id>`
("Choice 1 of 3: …"), `#dialogue-continue`; `#captions`, `#caption-<actor>`; `#volume-<bus>` (a slider, "Music volume",
value text "40 percent"), `#mute-<bus>` (`aria-pressed`); `#rebind-<row>-keyboard`, `#rebind-<row>-gamepad` ("Jump,
keyboard: Space. Change"; while waiting: "Press a key for Jump, or Escape to cancel"), `#rebind-reset`, `#rebind-note`.

## It updates from the step

`OverlayBinding` binds to the flow: it outlives worlds. Once a frame the overlay calls `sync()`, which returns a fresh
model only when the step, the game's version (`flow.version`), the conversation, the bindings or the settings changed,
and redraws then. Nothing reads a wall clock: a timer is printed from its steps (a countdown rounded up, so it reads 0:00
only when it is out; a stopwatch from `elapsedSteps`; which one from `limit`), and "Saved" lasts 150 steps of the game's
clock. "Saved" comes on `checkpointWritten` (the file exists), never on the game's `checkpoint` (only taken);
`checkpointFailed` says "Couldn't save".

`hudModel(view, { prompts, player, names, carrying, bindings, notices, loading })` is the HUD from `flow.view()` (the
fields `@vrmxg/game`'s README tables), `interact.prompts()`, `inventory.list(player)` and `input.bindings()`:
- the score shows when the game counts one (a counter named `score`); the other counters when this scene labels them;
- the timers this scene declares with a label (a timer carried from another scene is data, not shown);
- the prompt is the player's, with the key and the gamepad button that answer it, from the bindings now (a rebinding
  redraws it).

## A choice is a recorded input

The box emits a choice's id; the overlay hands it to the simulation as `input.choose('dialogue.choose', id)`, which the
next step latches and a recording keeps (`@vrmxg/input`, M5 W3). The step reads it, the dialogue service takes the
branch, and a replay of the recording takes the same branch on the same step, with no UI at all. A skip is
`dialogue.advance`. The conversation itself is scene data, a `Dialogue` node run by `@vrmxg/voice`'s dialogue service
(its README has the format).

While a conversation is on screen the overlay holds the devices (`input.muted`): the keys and the gamepad answer it and
don't also walk the player away, and a button held when it ends stays up until let go. This gates live devices only;
what is latched is recorded, and a replay never looks at it.

## Keyboard and gamepad

Navigation is the UI's own action map (`UI_ACTIONS`, read through `@vrmxg/input`'s `ActionMap`): arrows or WASD and the
d-pad or left stick move between controls (left and right change a slider), Enter or Space and A press, Escape or
Backspace and B are `back`. The digits 1 to 9 pick a choice. A focused button's Enter and Space stay the browser's own
click, and a slider keeps its own arrows, so nothing is pressed twice. The gamepad is polled once a frame through
`input.peek()`, which reads the devices without taking anything from the step; a held direction repeats after 24
frames, every 6.

`useNav(root, { input, onBack, grab, paused, onKey })` marks its root `data-nav-root`; controls are the elements under it
with `data-nav`. **One scope acts at a time: the outermost root around the focused control.** So the settings controls,
which navigate on their own, become one list inside an app menu that has its own `useNav` root. With focus in no root
(the canvas), the overlay takes the gamepad while a conversation is on screen, and focus goes to the first choice when
the conversation asks.

## Settings

`GameSettings` holds the player's settings: `{ version, volumes: { master, music, sfx, voice, ambience: { volume,
muted } }, bindings }` (bindings are `input.overrides()`: only what differs from the game's map). They are the
player's, not the simulation's: never in a snapshot or a recording.
- `load()` reads the store (a relaunch); `applyTo({ input, audio })` puts the bindings on an input service (the next
  step uses them) and the volumes on an audio output.
- `setVolume(bus, { volume, muted }, audio)` and `rebind(input, action, bindings)` / `resetBindings(input, action?)`
  apply at once and save. Writes land in the order they were asked for.
- What the store held is read whatever it is (gaps filled, damage replaced); stored bindings that don't fit this game
  (an action it doesn't have, a binding it doesn't take) are left out and listed in `ignored`, never thrown.
- A recording made before a rebinding replays the same after it: a recording names actions and holds values.

`rebindRows(input.bindings(), { labels, hide })`: a button action is one row with a keyboard slot and a gamepad slot;
an axis is a row per direction for its keys and d-pad buttons; mouse movement and sticks are listed on the row, fixed.
`applyCapture(bindings, row, slot, binding)` replaces one slot and keeps the rest; `captureKey(code)` and
`captureButton(before, now)` read the new key or button; `conflicts` names the other actions a binding already does.

## Not yet

- Speech bubbles and name tags are troika's (`@vrmxg/text`), GLSL only: on WebGPU the captions and the box still say
  every line, but nothing is drawn in the scene until the text renderer has a WebGPU path (AB-T-0556).
- Touch (PRD P1) and localisation (strings stay in the project's scenes, so string tables can come later).
- The pause, title and save-slot menus are the game app's (W1).

## Tests

`npm test` (no models needed, so it runs on CI, except one):
- `format`, `hud`, `dialogue-ui`, `nav`, `settings`: every decision as a plain function;
- `components`: each component compiled and rendered on the server: ids, accessible names, every control `data-nav`;
- `session`: the test game (`test/fixtures`: a counter where Hana takes the order through a `Dialogue` with three
  choices, a ball to deliver, an ending whose goodbye reads the order) played through `OverlayBinding`: the choice is
  in the recording and replaying it gives the same per-step hashes across the scene change; the overlay holds the
  devices while Hana talks; the HUD from the step; a rebinding used by the next step, kept across a relaunch, and an
  older recording replaying the same after it; settings put on a world a save loads into;
- `interact` (needs spec.vrm and the VRMXI fixtures beside the repository): the prompt for a key in reach and the key
  carried, on a real character.

Acceptance: `acceptance/m5/dialogue.mjs` and `dialogue-wkwebview.sh` (AB-R-1113): the test game in Node, headless
Chromium and WKWebView over the scheme and loopback, the real overlay mounted in the browsers and the choice clicked
on its focused button; every step's hashes the same everywhere, final `81eaec36719b1754`. The playground's demo page
(`apps/playground/game-ui.html`) and its check (`apps/playground/scripts/game-ui-check.mjs`) drive the overlay from the
keyboard and an emulated gamepad, rebind a key and reload.
