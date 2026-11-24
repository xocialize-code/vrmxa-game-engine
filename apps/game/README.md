# The game app (`apps/game`)

M5 W1 (AB-T-0616, decision AB-D-0286). The runtime every game build is made with: a Vue page that opens the build
beside it, steps a `GameFlow` session (`@vrmxg/game`) and draws its world on WebGPU, with the WebGL fallback and the
`renderer=` switch, as the other apps do. It has the app's own screens: a title menu, pause, save slots and settings.
Everything player-facing over the game (the HUD, prompts, dialogue) is M5 W3's `@vrmxg/game-ui`, and mounts in one place:
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

| Menu action | How it reaches the simulation |
|---|---|
| New Game | Starts the session: `flow.start(entry)` at step 0, input recorded from step 0 |
| Continue, Load | Starts a segment from the save file (`flow.load`); the recording before it is kept as the segment before |
| Save | `flow.saveTo(slot)` between two steps: it reads the world and changes nothing in it |
| Pause, Resume | No step is taken while a menu is open; nothing is recorded for that time |
| Settings | Presentation only (the backend applies on the next start) |
| Quit to Title | Ends the session |
| What a game's own scene offers (the test game's "skip the title") | An action in the recorded input frame |

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
never written from the menu. The settings document (`vrmxg-game-settings`, version 1: `backend`, `volume` per bus,
`bindings` kept for W3) is read field by field, so one bad value costs only itself; a change applies at once and says
"saved" only once written.

## The seam for `@vrmxg/game-ui` (M5 W3)

`src/overlay/GameOverlay.vue` is handed the session (`session.flow`: `view()`, `on()`, `version`), the input service of
the world being played (`input()`, where a dialogue choice becomes a latched, recorded input), the settings store, a
`version` that changes with the game's view, and `playing`. It draws nothing yet. The settings menu has plain volume
sliders and a read-only list of the controls in two groups marked `data-mount="game-ui-volume"` and
`data-mount="game-ui-controls"`: W3's controls take their place.

## The test game

`test/fixtures/game`: the sample cafe with a title (three seconds of the cafe from the street, skipped by jump or
interact), a level (`cafe.vrmxs` with rules: get to the counter within a minute; a checkpoint inside the door) and an
ending (five seconds, then the title as a new game). `scripts/test-game.mjs` reads it as a project (the sample's files,
its own under `game/`, its `game.json`, its licence rows added) and exports it. It is a fixture to prove the app; the
sample game itself is M5 W10.

## Checked

- `npm test` here (22 tests, no models needed): a session through scene changes, a save and a load replays to the same
  per-step hashes; Continue in a fresh session; a checkpoint slot refused; a save or a checkpoint whose write fails stays
  unsaved; settings read field by field, written in order, a failed write said; slot rows; the gamepad (edges, repeat on
  an injected clock, a button held when first seen); `HeldGate`; the question before progress is lost.
- `node acceptance/m5/game.mjs` (13 checks, Chromium, under the GPU lock): the test game through the menus, the log
  replayed in Node to the same hash after every step, a fresh launch loading the save, every menu from a stand-in
  gamepad and from the keyboard, the backend readout.
- `acceptance/m5/build.mjs --chromium` and `build-wkwebview.sh`: M5 check 1 with this app as the runtime.
- The Mac app: `apps/game-mac/docs/HAND-TEST-M5-GAME.md`.

## Known limits

- No HUD, prompts or dialogue: W3's package mounts in the overlay.
- The volume sliders and the controls list are placeholders for W3's controls; rebinding isn't there yet.
- A real gamepad was not used: Chromium's runs use a stand-in pad (`navigator.getGamepads`), and AppProbe can't press one.
- A backend change applies when the game starts again (Restart Now on the title menu).
