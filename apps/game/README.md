# The game app (`apps/game`)

M5 W1 (AB-T-0616, decision AB-D-0286). The runtime every game build is made with: a Vue page that opens the build
beside it, steps a `GameFlow` session (`@vrmxg/game`) and draws its world on WebGPU, with the WebGL fallback and the
`renderer=` switch, as the other apps do. It has the app's own screens: a title menu, pause, save slots and settings.
Everything player-facing over the game (the HUD, prompts, dialogue, captions) is M5 W3's `@vrmxg/game-ui`, mounted in one place:
`src/overlay/GameOverlay.vue`.

```sh
npm run build -w @vrmxg/game-app                       # apps/game/dist: the runtime, with its table (vrmxg-runtime.json)
node engine/packages/bundle/src/cli.js content/sample out/cafe   # vrmxg-export uses it by default
node apps/game/scripts/play.mjs out/cafe               # play a build in a browser tab (loopback)
node apps/game/scripts/play.mjs --test-game            # export the test game first, then play it
VRMXG_BUILD=out/cafe npm run dev -w @vrmxg/game-app    # the app with hot reload, playing that build
```

On the Mac a build becomes an app of its own: `apps/game-mac` (the shell around one build's folder).

## How a build gets its runtime

`vite build` here runs `@vrmxg/bundle/vite`'s `vrmxgRuntime({ name: 'vrmxg-game' })`, which lists every output file with
its SHA-256 and licence and writes `THIRD-PARTY-LICENCES.txt`. An export copies that folder in as it is (AB-D-0282):
`vrmxg-export` reads `apps/game/dist` (and stops, saying so, when it isn't built), and the editor's web build carries a
copy as `game-runtime/` for Export Game (`apps/editor/vite.config.js`; `apps/editor-mac/scripts/build.sh` builds this app
first). The runtime's bytes are part of a build's identity, so a change here changes every build's `runtime.digest`;
Node and the Mac editor still give the same bytes, since both copy the same folder.

## The page

| Query | What |
|---|---|
| (none) | The game: title menu, play, pause, slots, settings |
| `renderer=webgpu\|webgl\|auto` | The backend, over the setting (the switch every app obeys) |
| `trace` | Also a hash of the world after every step, in the session's log (`window.__game.log()`, `__game.lastLog` after Quit to Title) |
| `replay=<log>[,<log>…]` | (M5 W10) Plays recorded sessions back (`GameSession.log()` files, fetched beside the page): each segment from its start, the recorded input, everything drawn as live play draws it, no menus. `window.__result` (`READY`): each replay's per-step hashes (the log's own when the replay is exact), the frame times, the backend. A log from another build is refused. `acceptance/m5/rush.mjs` (Chromium) and `rush-wkwebview.sh` (WKWebView) compare the hashes |
| `replay=…&loop=<s>` | The same, again and again until that many seconds have passed, without per-step hashes: the frame-rate run (`acceptance/m5/rush-frames.sh`) |
| `stats` | A frame-time readout (`#frame-stats`, once a second: frames, fps, p99, the worst, how many over 25 ms, the canvas size; with `replay`, the replays played and scene changes seen). Presentation only |
| `check=<take>&steps=<n>` | The harness mode the minimal runtime had: no renderer and no menus; recorded input replayed in the entry scene, a hash after every step (`window.__result`, `READY`). `acceptance/m5/build.mjs` and `build-wkwebview.sh` use it |

## Menus

A stack of screens: the title menu (Continue, New Game, Load Game, Settings, Quit in the Mac app), the pause menu
(Resume, Save Game, Load Game, Settings, Quit to Title), the save and load menus (six player slots, and the game's
checkpoints to load), settings (the renderer, volume, the controls). Each is DOM: real buttons with accessible names,
focus on the first, and:

| | Keyboard | Gamepad (standard mapping) |
|---|---|---|
| Move | Tab, the arrows (wrap round), Home, End | the d-pad, the left stick past half-way; held, it repeats |
| Choose | Enter, Space | A |
| Back | Escape | B |
| Pause, resume | Escape | Start |
| A slider or a choice | its own arrows | left and right |

The decisions are plain functions tested in Node (`src/nav.js`, `src/menus.js`). When a menu closes, whatever key or
button is still held (Space on Resume is the sample's jump; so is A) is hidden from the game until it is let go
(`HeldGate`), so a menu's button never reaches the simulation.

## A session and its log (`src/session.js`)

`GameSession` wraps a `GameFlow` and keeps a log a replay needs: the build's digest, and segments, each with where it
starts (a new game at the entry scene, or a save file) and the input recorded from there. `replaySession(log, …)` replays
it anywhere; `acceptance/m5/game.mjs` plays the app in Chromium through its menus and replays the log in Node.
`session.replay(log)` (M5 W10) plays a log back inside the app: the host's frame loop steps each segment's recorded
frames (`replaying.left`) and starts the next (`replayNext`), so the replay is drawn and timed as play is.

| Menu action | How it reaches the simulation |
|---|---|
| New Game | Starts the session: `flow.start(entry)` at step 0, input recorded from step 0 |
| Continue, Load | Starts a segment from the save file (`flow.load`); the recording before it is kept as the segment before |
| Save | `flow.saveTo(slot)` between two steps: it reads the world and changes nothing in it |
| Pause, Resume | No step is taken while a menu is open; nothing is recorded for that time |
| Settings | Presentation only (the backend applies on the next start) |
| Quit to Title | Ends the session |
| What a game's own scene offers (the test game's "skip the title") | An action in the recorded input frame |

**A save belongs to the build that made it.** Every file the session writes (a player's save, a checkpoint) carries the
build's digest in `extra.build` (app data the save format already carries: no format change). A file from another build
is refused with a message saying so: every export of a game shares its bundle id and so its Saves folder, and
`@vrmxg/save` checks the scene document, the maths and the physics build, not the prefabs, the behaviours, the action map
or the engine, so such a file could load and then play on differently. `replaySession(log, { digest })` refuses a log
played on another build.

**So any re-export of a game refuses every earlier save.** The build's digest covers every file of the build: a changed
texture, a scene, a behaviour, a `release` bump in `game.json`, or a newer runtime gives a new digest, and the saves the
earlier build wrote are listed as "made with another version" and can't be loaded (Continue skips them). That is M5's
rule, chosen as the safe one: a save loads only into exactly the build that made it.

**Nothing steps while a menu or a question is up**, whatever else happens: a question that comes up while a save loads
(the Mac shell's close question) holds the game after the load too (`StepGate` in `src/nav.js`). When stepping starts
again, every key, button and stick still held, and the mouse's movement over the menu, are hidden from the game until let
go (`HeldGate`). Everything behind a question is `inert`, and Tab wraps round inside the top menu.

Progress counts as kept only once the store has it: `safeStep` moves after a save's write succeeds, or once a
checkpoint's file is in the store (`checkpointWritten` with `stored`). Closing the window, quitting (the Mac shell's
close question), Quit to Title and loading over unsaved progress ask first (`src/closing.js`), offering to save into the
last slot used.

## Where saves and settings live

| | Browser tab | Mac app |
|---|---|---|
| Saves | IndexedDB `vrmxg-game-<id>` | the shell's `saves.*`: `Application Support/<bundle id>/Saves` in the game's own container |
| Settings | `localStorage['vrmxg.game.<id>.settings']` | the shell's `settings.read` / `settings.write` (shell 0.11.0): `Application Support/<bundle id>/settings.json` |

Player slots are `slot-1` to `slot-6` (`flow.saveTo`); `auto-…` slots are the game's checkpoints, listed and loaded,
never written from the menu. The settings document (`vrmxg-game-settings`, version 1: `backend`, and `ui`, `@vrmxg/game-ui`'s
`GameSettings` document with the player's volumes and bindings, which that package reads and checks) is read field by
field, so one bad value costs only itself; a change applies at once and says "saved" only once written. `gameUiStore`
hands `GameSettings` the `ui` field, so the backend and the player's settings are one document in one place, and a write
that doesn't reach the store throws, so `GameSettings` knows; the settings menu's status line says a failed write,
whichever control made it (`settingsNote`). A document of the first form (with `volume` and `bindings` at the top) has
them moved into `ui` once, as it is read, and written back.

## The seam for `@vrmxg/game-ui` (M5 W3)

`src/overlay/GameOverlay.vue` mounts the package's `GameOverlay` (the HUD, the dialogue box with its choices, captions)
over the canvas, bound to the session's `GameFlow`; a new game or a load from the title makes a new flow, and the
overlay is mounted again for it. It is handed the player's `GameSettings`, which it puts on every world.
- **The settings menu** holds the package's `VolumeControls` and `RebindList` beside the renderer choice, in one
  `useNav` root (`MenuScreen nav="game-ui"`), so the keys and a gamepad move across all of them; the app's own gamepad
  poll steps aside there. Every other menu is a nav root too (`data-nav-root`), so the overlay never takes the keys from
  a menu opened over a conversation.
- **Rebinding and volumes** are kept through the app's settings store (the `ui` field). The host puts them on every
  world's input service before its first step and on the audio output. From the title, with no world yet, the menus have
  an input service of their own (`host.menuInput`: the game's map with the app's devices, never stepped), so rebinding
  works there too and the next game gets it.
- **Who holds the devices.** While a menu or a question is up, the menus hold the world's input with their own claim
  (`input.hold('menu')`, released when they close); the overlay holds it with its own while a conversation is on screen.
  Neither releases the other's. Claims aren't in the snapshot, so they change no hash.
- **Conversations** are scene data (`Dialogue` nodes, `@vrmxg/voice`): the shared world builder
  (`apps/playground/src/world.js`) installs the dialogue service for a scene that has one, after input, voice and game,
  so this runtime, the playground, the editor's Play and the bundle's `play.js` all run them (part of AB-T-0630; MCP's
  engine is the rest). A `Dialogue` inside a prefab counts: the scene is judged with its instances flattened
  (`hasNodeType`). A scene without one gets no service, so no other scene's hashes move. A choice reaches the
  simulation as `input.choose('dialogue.choose', id)`, latched by the next step and kept in the recording, so a session
  with a choice replays in Node to the same hashes.

## The test game

`test/fixtures/game`: the sample cafe with a title (three seconds of the cafe from the street, skipped by jump or
interact), a level (`cafe.vrmxs` with rules: get to the counter within a minute; a checkpoint inside the door; Hana asks
"Ready for the rush?" at the start, a `Dialogue` with two choices that set a flag) and an
ending (five seconds, then the title as a new game). `scripts/test-game.mjs` reads it as a project (the sample's files,
its own under `game/`, its `game.json`, its licence rows added) and exports it. It is a fixture to prove the app; the
sample game itself is M5 W10.

## Checked

- `npm test` here (40 tests; all but one need no models): the player's settings through `GameSettings` in the `ui` field,
  the first form's volume and bindings migrated once, a failed volume write said in the status line; a `Dialogue` inside
  a prefab; a question up while a load ends holds the game, and what was
  used on it doesn't reach the game; a save from another build, or one that doesn't say, is refused; a log replays only
  on its build; a second New Game or load during one is refused (in the session and in the host); a session through scene changes, a save and a load replays to
  the same per-step hashes; Continue in a fresh session; a checkpoint slot refused; a save or a checkpoint whose write
  fails stays unsaved; a save still being written when another loads, or a load that outlives its session (one test per
  finding of the independent review); the test game's whole loop (title, the level won with the door's checkpoint, the
  ending, the title again) with Hana answered by a recorded choice, replayed (needs vrmxa-core, skipped on CI); settings read field by field, written in order, a failed write said; slot rows; the gamepad (edges, repeat on
  an injected clock, a button held when first seen); `HeldGate`; the question before progress is lost.
- `node acceptance/m5/game.mjs` (19 checks, Chromium, under the GPU lock): the test game through the menus; the HUD's
  goal, score and clock; Hana's question answered with Enter on the overlay's first choice, the choice in the recording;
  the log replayed in Node to the same hash after every step (AB-R-1116); a fresh launch loading the save; every menu
  from a stand-in gamepad and from the keyboard; a key rebound in Settings kept, and on the menus' input after a
  relaunch; the A that opens Settings not pressing the control it focuses; the backend readout.
- `acceptance/m5/build.mjs --chromium` and `build-wkwebview.sh`: M5 check 1 with this app as the runtime.
- The Mac app: `apps/game-mac/docs/HAND-TEST-M5-GAME.md`.

## Known limits

- Speech bubbles and name tags are troika's (GLSL): none on WebGPU until AB-T-0556 (the box and captions say every line).
- A real gamepad was not used: Chromium's runs use a stand-in pad (`navigator.getGamepads`), and AppProbe can't press one.
- A backend change applies when the game starts again (Restart Now on the title menu).
