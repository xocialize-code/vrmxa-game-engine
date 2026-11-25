# The sample game on the Mac (M5 W10): AppProbe scenario

Build the app around the sample game's build, launch it once, run `apps/game-mac/scripts/hand-test-fixtures-rush.sh`
(the scenario's own saves folder, `tmp/game-w10/`, with the save in Slot 1), then, under the GPU lock,
`appprobe checklist scenario=apps/game-mac/docs/hand-test/HAND-TEST-M5-RUSH.scenario.md`. See `../HAND-TEST-M5-RUSH.md`.
Row 3 waits out the level's four-minute clock: the Mac must stay unlocked through it.

```scenario
app: The Morning Rush
launch: ../../build/morning-rush.app
checklist: ../HAND-TEST-M5-RUSH.md
env: {"VRMXG_SHELL_SAVES": "game-w10/Saves", "VRMXG_SHELL_SETTINGS": "game-w10/settings.json"}
fresh: false
```

- [ ] The sample game's title menu, on WebGPU, with a save in Slot 1.
  ```steps
  wait id=new-game enabled=true timeout_ms=60000
  until find("id=renderer").0.name == "Renderer WebGPU" timeout=30000
  expect find("id=screen").0.name == "Screen title"
  expect find("id=load-game enabled=true").count == 1   # the fixtures' save
  expect find("role=alert").count == 0
  shot "title"
  ```

- [ ] New Game plays the title scene, then the level; Hana's briefing is answered from the keyboard; the HUD shows the goal and the clock.
  ```steps
  act id=new-game action=press
  until find("id=screen").0.name == "Screen playing" timeout=30000
  until find("id=scene").0.name == "Scene game/title.vrmxs" timeout=30000
  until find("id=scene").0.name == "Scene game/level.vrmxs" timeout=60000   # six seconds of the street, then the cafe
  until find("id=hud-goal").count == 1 timeout=30000
  until find("text=Serve the three regulars").count >= 1 timeout=10000
  expect find("text=Until ten").count >= 1   # the clock's label, "Until ten o'clock" (a query can't hold an apostrophe)
  wait id=dialogue timeout_ms=30000   # Hana's briefing starts on the level's first step
  until find("id=dialogue-choice-ready").count == 1 timeout=20000   # she asks once her line is said (seven seconds)
  pause 500
  keys return   # "On it!": a recorded choice
  until find("text=Here comes Aoi").count >= 1 timeout=10000   # her answer: "That's the spirit. Here comes Aoi!"
  shot "briefed"
  ```

- [ ] Left alone, the clock runs out: the game is lost, the lost ending says so, and the title comes back as a new game.
  ```steps
  until find("id=scene").0.name == "Scene game/lost.vrmxs" timeout=300000   # 240 s on the clock, then three seconds
  until find("text=and the till is still open").count >= 1 timeout=20000   # "Ten o'clock, and the till is still open. We'll do better tomorrow."
  shot "lost"
  until find("id=scene").0.name == "Scene game/title.vrmxs" timeout=30000   # twelve seconds, then the title as a new game
  ```

- [ ] From the title menu, Load Game → Slot 1 (at the till, everyone served) and E close the till: the game is won, the won ending says so, and the title comes back.
  ```steps
  keys escape
  until find("id=screen").0.name == "Screen pause"
  act id=quit-to-title action=press
  until find("id=answer-discard").count == 1 timeout=5000
  act id=answer-discard action=press
  until find("id=screen").0.name == "Screen title"
  act id=load-game action=press
  until find("id=screen").0.name == "Screen load"
  act id=slot-1 action=press
  until find("id=message").0.name matches "^Loaded Slot 1 at step [0-9]+\\.$" timeout=60000
  until find("id=scene").0.name == "Scene game/level.vrmxs" timeout=10000
  until find("text=Close the till").count >= 1 timeout=10000   # the goal left, and the till's prompt
  pause 500
  keys e   # interact: Mira closes the till
  until find("id=scene").0.name == "Scene game/won.vrmxs" timeout=30000
  until find("text=Not one mistake. Best morning rush ever, Mira!").count >= 1 timeout=20000
  shot "won"
  until find("id=scene").0.name == "Scene game/title.vrmxs" timeout=40000
  ```
