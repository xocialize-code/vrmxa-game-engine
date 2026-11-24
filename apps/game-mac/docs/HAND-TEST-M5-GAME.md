# The game app on the Mac (M5 W1, AB-T-0616)

M5's exit checks 2, 4 (menus) and 6 (slots) in the Mac app: a game build wrapped on the shell plays from its title menu
to play, pause and quit; its menus work from the keyboard; a save written from the menu loads from the menu in a fresh
launch; closing with unsaved progress asks. The game is the game app's test game (`apps/game/test/fixtures/game`: the
sample cafe with a title, a level and an ending), built by `apps/game-mac/scripts/build.sh`.

AppProbe runs it: `hand-test/HAND-TEST-M5-GAME.scenario.md` (rows 1 to 9, no query), then
`hand-test/HAND-TEST-M5-GAME-webgl.scenario.md` (row 10, WebGL forced). Run `scripts/hand-test-fixtures.sh` first, and
hold the GPU lock while they draw (`node acceptance/gpu-lock.mjs run --who game-mac -- …`).

Gamepads: AppProbe can't press a gamepad's buttons. `acceptance/m5/game.mjs` drives every menu from a stand-in gamepad in
Chromium (the same page); row 11 is for a person with a real one.

- [x] With no query the game draws on WebGPU, and its title menu has focus on New Game. *AppProbe 2026-11-24: `#renderer` read "Renderer WebGPU", New Game had focus, Load Game was disabled with no saves; no error shown.*
- [x] New Game from the keyboard plays the game: the title scene, then the level. *AppProbe 2026-11-24: Return on New Game; `#scene` read the title, then `game/level.vrmxs` after the title's three seconds; the step count moved.*
- [x] Escape pauses (nothing steps while the menu is open), and Enter on Resume plays on. *AppProbe 2026-11-24: Escape opened the pause menu with focus on Resume; the step count stayed put for 1.5 s; Return resumed and it moved again.*
- [x] Save Game → Slot 1 from the pause menu saves, and the slot list says what the slot holds. *AppProbe 2026-11-24: "Saved to Slot 1 at step 357."; the slot read "Slot 1: The Cafe (test game) · level · Get to the counter, 0:05 · …"; `#progress` read "Nothing unsaved".*
- [x] The pause menu from the keyboard alone: the arrows move, Enter chooses, Escape goes back. *AppProbe 2026-11-24: ↑↑ and Return opened Settings, Escape went back, ↓↓ and Return opened Load Game, Escape back, Escape resumed. Focus was followed through the screen each key led to, not read directly.*
- [x] Quit to Title with unsaved progress asks first: Keep Playing stays, Quit Without Saving goes to the title. *AppProbe 2026-11-24: the question "Quit to Title without saving?"; Keep Playing kept the pause menu; Quit to Title Without Saving went to the title, which offered Continue.*
- [x] A save written from the menu loads from the menu in a fresh launch, at the step it was saved. *AppProbe 2026-11-24, partly: the title's Quit ended the app (not watched: AppProbe can't look at an app that has quit); after the relaunch Load Game → Slot 1 said "Loaded Slot 1 at step 357." (row 4 saved at 357) and `#safe-step` read the step row 4's save held, in `game/level.vrmxs`.*
- [x] Closing the window with unsaved progress asks first; Keep Playing keeps the game. *AppProbe 2026-11-24, partly: File › Close Window asked "Close without saving?"; Keep Playing kept the level; asked again, Close Without Saving closed it, and the relaunch came up on the title menu.*
- [x] The renderer chosen in Settings is kept and used the next time the game starts. *AppProbe 2026-11-24: Renderer WebGL in Settings, "Settings saved." (after the shell's settings.write returned), Restart Now: "Renderer WebGL"; back to Automatic, Restart Now: "Renderer WebGPU".*
- [x] With `renderer=webgl` in the query the game draws on WebGL, and it plays. *AppProbe 2026-11-24 (`VRMXG_QUERY=renderer=webgl`): "Renderer WebGL"; New Game reached the level and the step count moved; no error.*
- [ ] (A person, with a real gamepad) Start pauses and resumes, the d-pad moves through every menu, A chooses, B goes back. *Not run: no gamepad here. `acceptance/m5/game.mjs` drives the same page's menus from a stand-in gamepad in Chromium.*

## Results

| Date | Build | Rows | Result |
|---|---|---|---|
| 2026-11-24 | Release, ad hoc signed (`scripts/build.sh`), shell 0.11.0, under the GPU lock | 1–9, then 10 | First runs failed: the corner readouts were hidden from accessibility while a menu was open (`aria-modal`: dropped), the first run's app was left asking about unsaved progress so the next launch handed over to it (killed: an app AppProbe launched ignores SIGTERM), a note with quotes didn't parse, and WebKit's `<select>` showed AppProbe no options (the renderer choice is three buttons now). Then 9 of 9 and 1 of 1. Reports and shots in `hand-test/results/ab-t-0616/` |
| 2026-11-24 | same, after the independent review's fixes (pause refused while a game starts or loads, saves tied to their segment, the plist written safely) | 1–9, then 10 | 9 of 9 and 1 of 1 on the first run; the reports and shots in `hand-test/results/ab-t-0616/` are this run's |
| 2026-11-24 | same, after the coordinator's review (nothing steps while any menu or question is up; saves carry and check their build; what is behind a sheet is inert; the runtime stamped with its sources; the game's own version in the app) | 1–9, then 10 | 9 of 9 and 1 of 1; the reports and shots in `hand-test/results/ab-t-0616/` are this run's |
| 2026-11-24 | same, after the coordinator's second note (Continue and Load Game only for this build's saves; another build's save shown as such) | 1–9, then 10 | 9 of 9 and 1 of 1; the reports and shots in `hand-test/results/ab-t-0616/` are this run's. Another build's save in the slot list is checked in Chromium (`acceptance/m5/game.mjs`), not here |
| 2026-11-24 | same | 11 | Not run: no gamepad |
