# The game app on the Mac (M5 W1): AppProbe scenario, WebGL forced: run of Nov 24, 2026 at 2:28 PM

- **App:** The Cafe (test game) 0.1.0 (1), <repo>/apps/game-mac/build/cafe-test.app
- **Scenario:** `<repo>/apps/game-mac/docs/hand-test/HAND-TEST-M5-GAME-webgl.scenario.md`
- **Checklist:** `<repo>/apps/game-mac/docs/HAND-TEST-M5-GAME.md`
- **Result:** 1 rows: 1 passed, 0 failed, 0 need you; 10 checklist rows have no steps

## Passed

- **1. With `renderer=webgl` in the query the game draws on WebGL, and it plays** (checklist line 24): find("id=renderer").0.name == "Renderer WebGL"; find("id=screen").0.name == "Screen playing"; find("id=scene").0.name == "Scene game/level.vrmxs"; find("id=step-count").0.name != $before; find("role=alert").count == 0 (11076 ms)
## Checklist rows with no steps (10, unticked)

- line 15, The game app on the Mac (M5 W1, AB-T-0616): With no query the game draws on WebGPU, and its title menu has focus on New Game.
- line 16, The game app on the Mac (M5 W1, AB-T-0616): New Game from the keyboard plays the game: the title scene, then the level.
- line 17, The game app on the Mac (M5 W1, AB-T-0616): Escape pauses (nothing steps while the menu is open), and Enter on Resume plays on.
- line 18, The game app on the Mac (M5 W1, AB-T-0616): Save Game → Slot 1 from the pause menu saves, and the slot list says what the slot holds.
- line 19, The game app on the Mac (M5 W1, AB-T-0616): The pause menu from the keyboard alone: the arrows move, Enter chooses, Escape goes back.
- line 20, The game app on the Mac (M5 W1, AB-T-0616): Quit to Title with unsaved progress asks first: Keep Playing stays, Quit Without Saving goes to the title.
- line 21, The game app on the Mac (M5 W1, AB-T-0616): A save written from the menu loads from the menu in a fresh launch, at the step it was saved.
- line 22, The game app on the Mac (M5 W1, AB-T-0616): Closing the window with unsaved progress asks first; Keep Playing keeps the game.
- line 23, The game app on the Mac (M5 W1, AB-T-0616): The renderer chosen in Settings is kept and used the next time the game starts.
- line 25, The game app on the Mac (M5 W1, AB-T-0616): (A person, with a real gamepad) Start pauses and resumes, the d-pad moves through every menu, A chooses, B goe
