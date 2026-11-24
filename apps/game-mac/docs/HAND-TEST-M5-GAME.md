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

- [ ] With no query the game draws on WebGPU, and its title menu has focus on New Game.
- [ ] New Game from the keyboard plays the game: the title scene, then the level.
- [ ] Escape pauses (nothing steps while the menu is open), and Enter on Resume plays on.
- [ ] Save Game → Slot 1 from the pause menu saves, and the slot list says what the slot holds.
- [ ] The pause menu from the keyboard alone: the arrows move, Enter chooses, Escape goes back.
- [ ] Quit to Title with unsaved progress asks first: Keep Playing stays, Quit Without Saving goes to the title.
- [ ] A save written from the menu loads from the menu in a fresh launch, at the step it was saved.
- [ ] Closing the window with unsaved progress asks first; Keep Playing keeps the game.
- [ ] The renderer chosen in Settings is kept and used the next time the game starts.
- [ ] With `renderer=webgl` in the query the game draws on WebGL, and it plays.
- [ ] (A person, with a real gamepad) Start pauses and resumes, the d-pad moves through every menu, A chooses, B goes back.

## Results

| Row | Step | What happened |
|---|---|---|
