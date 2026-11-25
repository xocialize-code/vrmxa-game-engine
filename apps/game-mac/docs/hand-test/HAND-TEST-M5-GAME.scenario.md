# The game app on the Mac (M5 W1): AppProbe scenario

Run `apps/game-mac/scripts/build.sh` (the game app, the test game exported with it, the Mac app around it), launch the
app once (its container must exist), run `apps/game-mac/scripts/hand-test-fixtures.sh` (empties the scenario's own saves
and settings folder), then, under the GPU lock,
`appprobe checklist scenario=apps/game-mac/docs/hand-test/HAND-TEST-M5-GAME.scenario.md`. Saves and settings go to the
container's `tmp/game-w1/` (the env below), never the app's real folders.

The readouts in the corner carry their values in their accessible names: `#renderer` ("Renderer WebGPU"), `#screen`
("Screen title", "Screen pause", "Screen playing"), `#scene`, `#step-count` ("Step 412"), `#progress` ("Unsaved
progress"). `#message` says what a save or a load did, with its step.

Rows 7 and 8 end the app and relaunch it inside the row (AppProbe can't look at an app that has quit: AB-T-0625), so
they carry `partial:`.

```scenario
app: The Cafe (test game)
launch: ../../build/cafe-test.app
checklist: ../HAND-TEST-M5-GAME.md
env: {"VRMXG_SHELL_SAVES": "game-w1/Saves", "VRMXG_SHELL_SETTINGS": "game-w1/settings.json"}
fresh: false
```

- [ ] With no query the game draws on WebGPU, and its title menu has focus on New Game.
  ```steps
  wait id=new-game enabled=true timeout_ms=60000
  until find("id=renderer").0.name == "Renderer WebGPU" timeout=30000
  expect find("id=screen").0.name == "Screen title"
  expect find("id=load-game enabled=false").count == 1   # no saves yet (the fixtures emptied the folder)
  expect find("role=alert").count == 0
  shot "title"
  ```

- [ ] New Game from the keyboard plays the game: the title scene, then the level.
  ```steps
  keys return   # New Game has focus
  until find("id=screen").0.name == "Screen playing" timeout=30000
  until find("id=scene").0.name == "Scene game/title.vrmxs" timeout=30000
  until find("id=scene").0.name == "Scene game/level.vrmxs" timeout=60000   # the title scene's three seconds, then a scene change
  set before = find("id=step-count").0.name
  pause 1000
  expect find("id=step-count").0.name != $before   # it steps
  shot "level"
  ```

- [ ] The HUD shows the level's goal, score and clock, and Hana's question is answered from the keyboard.
  ```steps
  until find("id=hud-goal").count == 1 timeout=30000   # @vrmxg/game-ui's HUD, mounted at the app's seam
  until find("text=Get to the counter").count >= 1 timeout=10000   # the goal's text (its "Goal:" is a visually hidden word)
  expect find("text=Until the cafe opens").count >= 1   # the clock's label
  wait id=dialogue timeout_ms=30000   # Hana's Dialogue starts on the level's first step
  until find("id=dialogue-choice-ready").count == 1 timeout=15000   # she asks once her line is said (two seconds)
  pause 500   # focus goes to the first choice when she asks
  keys return   # Enter on "Let's do this.": input.choose('dialogue.choose', 'ready'), latched by the next step
  until find("text=Then get to the counter, quick!").count >= 1 timeout=10000   # the branch the choice names
  shot "answered"
  until find("id=dialogue").count == 0 timeout=15000   # her answer said: the conversation is over
  ```

- [ ] Escape pauses (nothing steps while the menu is open), and Enter on Resume plays on.
  ```steps
  keys escape
  until find("id=screen").0.name == "Screen pause"
  wait id=resume timeout_ms=5000
  set paused = find("id=step-count").0.name
  pause 1500
  expect find("id=step-count").0.name == $paused   # nothing steps while paused
  shot "paused"
  keys return   # Resume has focus
  until find("id=screen").0.name == "Screen playing"
  pause 1000
  expect find("id=step-count").0.name != $paused
  ```

- [ ] Save Game → Slot 1 from the pause menu saves, and the slot list says what the slot holds.
  ```steps
  keys escape
  until find("id=screen").0.name == "Screen pause"
  act id=save-game action=press
  until find("id=screen").0.name == "Screen save"
  expect find("id=slot-1").0.name == "Slot 1: empty"
  act id=slot-1 action=press
  until find("id=message").0.name matches "^Saved to Slot 1 at step [0-9]+\\.$" timeout=20000   # said once the shell's saves.write returned
  until find("id=slot-1").0.name matches "^Slot 1: The Cafe \\(test game\\) · level · Get to the counter, 0:[0-9]{2} · " timeout=5000
  expect find("id=progress").0.name == "Nothing unsaved"
  set safe = find("id=safe-step").0.name   # "Safe at step N": the step the save holds (row 7 loads it)
  shot "saved"
  ```

- [ ] The pause menu from the keyboard alone: the arrows move, Enter chooses, Escape goes back.
  ```steps
  keys escape   # back from the save menu
  until find("id=screen").0.name == "Screen pause"
  keys up   # from Resume, up wraps round to Quit to Title
  keys up   # Settings
  keys return
  until find("id=screen").0.name == "Screen settings"
  keys escape
  until find("id=screen").0.name == "Screen pause"
  keys down   # Save Game
  keys down   # Load Game (a save exists now)
  keys return
  until find("id=screen").0.name == "Screen load"
  keys escape
  until find("id=screen").0.name == "Screen pause"
  keys escape   # Escape on the pause menu resumes
  until find("id=screen").0.name == "Screen playing"
  ```

- [ ] Quit to Title with unsaved progress asks first: Keep Playing stays, Quit Without Saving goes to the title.
  ```steps
  pause 1000   # a second of play since the save
  expect find("id=progress").0.name == "Unsaved progress"
  keys escape
  until find("id=screen").0.name == "Screen pause"
  act id=quit-to-title action=press
  wait id=question timeout_ms=5000
  expect find("id=question").0.name == "Quit to Title without saving?"
  act id=answer-cancel action=press
  until find("id=question").count == 0
  expect find("id=screen").0.name == "Screen pause"
  act id=quit-to-title action=press
  wait id=question timeout_ms=5000
  act id=answer-discard action=press
  until find("id=screen").0.name == "Screen title"
  wait id=continue timeout_ms=5000   # the save is offered
  expect find("id=continue").0.name matches "^Continue: Slot 1: "
  ```

- [ ] A save written from the menu loads from the menu in a fresh launch, at the step it was saved.
  ```steps
  partial: that the app has gone isn't seen here (AppProbe can't look at an app that has quit); what a fresh launch finds is
  act id=quit action=press   # the title menu's Quit: the page asks the shell to quit (app.quit, shell 0.11.0)
  pause 3000
  relaunch
  wait id=continue enabled=true timeout_ms=60000
  act id=load-game action=press
  until find("id=screen").0.name == "Screen load"
  act id=slot-1 action=press
  until find("id=message").0.name matches "^Loaded Slot 1 at step [0-9]+\\.$" timeout=60000
  until find("id=scene").0.name == "Scene game/level.vrmxs"
  expect find("id=safe-step").0.name == $safe   # loaded at the step row 4 saved
  shot "loaded"
  ```

- [ ] Closing the window with unsaved progress asks first; Keep Playing keeps the game.
  ```steps
  partial: Close Without Saving ends the app, which AppProbe can't watch; the relaunch shows it went
  pause 1500
  expect find("id=progress").0.name == "Unsaved progress"
  activate   # File › Close Window is the key window's item: enabled only while the app is in front
  menu "File › Close Window" press
  wait id=question timeout_ms=10000
  expect find("id=question").0.name == "Close without saving?"
  act id=answer-cancel action=press
  until find("id=question").count == 0
  set kept = find("id=scene").0.name
  expect $kept == "Scene game/level.vrmxs"   # still the game
  menu "File › Close Window" press
  wait id=question timeout_ms=10000
  act id=answer-discard action=press
  pause 3000
  relaunch
  wait id=new-game enabled=true timeout_ms=60000
  expect find("id=screen").0.name == "Screen title"
  ```

- [ ] The renderer chosen in Settings is kept and used the next time the game starts.
  ```steps
  act id=settings action=press
  until find("id=screen").0.name == "Screen settings"
  act id=backend-webgl action=press
  until find("id=settings-status").0.name == "Settings saved." timeout=5000   # once the shell's settings.write returned
  wait id=restart timeout_ms=5000
  act id=restart action=press   # the page loads again, with the setting
  wait id=new-game enabled=true timeout_ms=60000
  until find("id=renderer").0.name == "Renderer WebGL" timeout=30000
  act id=settings action=press
  until find("id=screen").0.name == "Screen settings"
  act id=backend-auto action=press
  until find("id=settings-status").0.name == "Settings saved." timeout=5000
  act id=restart action=press
  wait id=new-game enabled=true timeout_ms=60000
  until find("id=renderer").0.name == "Renderer WebGPU" timeout=30000
  ```
