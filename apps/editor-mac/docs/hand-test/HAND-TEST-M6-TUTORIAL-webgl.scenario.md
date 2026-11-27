# The game builder's tutorial, "Coin Run", followed in the editor (M6 W9): AppProbe scenario, WebGL forced

Each row is a step of [`docs/guide/tutorial.md`](../../../../docs/guide/tutorial.md), named by its heading
(`acceptance/test/tutorial.test.mjs` fails when a row and a heading part), and its steps do what the page tells the
reader to do, in the page's words where a comment helps. No row types JSON: nodes come from the toolbar, props from the
inspector, the behaviour from the Behaviours panel, the connections from the Connections panel, the behaviours module
from Project Settings.

Run `apps/editor-mac/scripts/build.sh`, launch the app once (its container must exist), then
`apps/editor-mac/scripts/hand-test-fixtures-m6-tutorial.sh` (empty `w9-projects/` and `w9-builds/` in the container,
and the scenario's text editor in the background: `acceptance/m6/tutorial.mjs files`, which saves the page's
`behaviours.js` and licence row into the new project when step 5 writes its trigger screenshot), then, holding the GPU
lock, `appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M6-TUTORIAL.scenario.md`. Last, step 12
outside the app: `node acceptance/m6/tutorial.mjs play <container>/tmp/w9-builds/coin-run`. `VRMXG_SHELL_BUILD`
names that exact folder (the fixtures make it empty), standing in for the folder the reader creates in the panel. The WebGL twin
(`-webgl.scenario.md`, fixtures `… webgl`) differs only in its `env` (`VRMXG_QUERY=renderer=webgl`, its own folders)
and the renderer line; the test holds the two equal otherwise.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M6-TUTORIAL.md
env: {"VRMXG_QUERY": "renderer=webgl", "VRMXG_SHELL_NEW_PROJECT": "w9-projects-webgl/", "VRMXG_SHELL_BUILD": "w9-builds-webgl/coin-run", "VRMXG_SHELL_SETTINGS": "w9-settings-webgl.json", "VRMXG_SHELL_CACHE": "w9-cache-webgl"}
fresh: false
```

- [ ] 1. Make the project from the One level template
  ```steps
  wait id=new-project-open enabled=true timeout_ms=40000
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved" timeout=90000   # the bundled sample first
  expect find("id=renderer").0.name == "Renderer WebGL"
  menu "File › New Project…" press   # "Choose File › New Project…"
  wait id=new-project timeout_ms=10000
  act id=template-level action=press   # "Pick One level"
  until find("id=template-level").0.value == "1"
  act id=new-project-title action=set_value value="Coin Run"   # "type Coin Run as the title"
  until find("id=new-project-id").0.value == "coin-run"   # "the game's id follows it: coin-run"
  shot "tutorial-new-project"
  act id=new-project-create action=press   # "and press Create…"
  wait id=new-project gone=true timeout_ms=30000
  until find("id=doc-state").0.name matches "^Scene level.vrmxs 14 nodes saved valid" timeout=90000   # "opens the game's first scene, level.vrmxs"
  expect find("id=project-name").0.name == "Project Coin Run"
  expect find("role=alert").count == 0
  ```

- [ ] 2. Play the template once
  ```steps
  act id=play action=press   # "Press Play in the toolbar"
  until find("text=Playing · step").0.name matches "step [1-9][0-9]{2}" timeout=90000
  act id=play action=press   # "Press Play again to stop"
  until find("id=stop-result").0.name matches "^Stopped: scene as before Play" timeout=20000   # "Stopping puts the scene back exactly as it was"
  partial: nobody walks Mira to the counter in the editor (a held key isn't an AppProbe step); step 12 walks the build
  ```

- [ ] 3. Count the coins
  ```steps
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="GameCounter" exact=true action=press   # "choose GameCounter"
  until find("role=popupbutton name='Node type to add'").0.value == "GameCounter" timeout=5000
  act id=add-node action=press   # "and press Add"
  until find("id=undo").0.name == "Undo Add gamecounter" timeout=5000
  pause 300
  act id=field-id action=set_value value="coins"   # "Id: coins"
  until find("id=undo").0.name == "Undo Change id gamecounter to coins" timeout=5000
  act id=field-parent action=focus   # "Parent: rules"
  pause 300
  keys down
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=pos-x action=set_value value="0"   # "Position: 0, 0, 0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-label action=set_value value="Coins"   # "label: Coins"
  until find("id=prop-label").0.value == "Coins" timeout=5000
  until find("id=undo").0.name == "Undo Set coins.label" timeout=5000   # "the Undo button's name says what it will undo"
  ```

- [ ] 4. Add the goal
  ```steps
  act id=file-name action=focus
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down
  act surface=app role=menuitem name="GameGoal" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameGoal" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gamegoal" timeout=5000
  pause 300
  act id=field-id action=set_value value="collect-coins"   # "Id: collect-coins"
  until find("id=undo").0.name == "Undo Change id gamegoal to collect-coins" timeout=5000
  act id=field-parent action=focus   # "Parent: rules"
  pause 300
  keys down
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=field-before action=focus   # "Before: reach-counter"
  pause 300
  keys down
  act surface=app role=menuitem name="reach-counter" exact=true action=press
  until find("id=field-before").0.value == "reach-counter" timeout=5000
  act id=prop-text action=set_value value="Collect the three coins"   # "text: Collect the three coins"
  until find("id=prop-text").0.value == "Collect the three coins" timeout=5000
  act id=prop-when-test action=focus   # "when: the test state"
  pause 300
  keys down
  act surface=app role=menuitem name="state" exact=true action=press
  until find("id=prop-when-test").0.value == "state" timeout=5000
  pause 500
  act id=prop-when-key action=set_value value="counters.coins"   # "the key counters.coins"
  until find("id=prop-when-key").0.value == "counters.coins" timeout=5000
  act id=prop-when-op action=focus   # "the op ge"
  pause 300
  keys down
  act surface=app role=menuitem name="ge" exact=true action=press
  until find("id=prop-when-op").0.value == "ge" timeout=5000
  act id=prop-when-value action=set_value value="3"   # "and the value 3"
  until find("id=prop-when-value").0.value == "3" timeout=5000
  expect find("id=doc-state").0.name matches " valid "
  shot "tutorial-goal"
  ```

- [ ] 5. Write the coin behaviour
  ```steps
  screenshot path=/tmp/vrmxg-w9-tutorial-webgl/write-behaviour.png   # the trigger: the scenario's text editor saves the page's behaviours.js and its licence row into the project now
  pause 2000
  partial: the file is written by acceptance/m6/tutorial.mjs from the page's own code block, not typed into a text editor; the next row reads it in
  ```

- [ ] 6. Read the behaviour in
  ```steps
  act id=save action=press   # "save the level (Save, ⌘S)"
  until find("id=saved").0.name matches "^Saved level.vrmxs" timeout=20000
  menu "File › Open Recent › Coin Run" press   # "open it again: File › Open Recent › Coin Run"
  until find("id=project-name").0.name == "Project Coin Run" timeout=30000
  until find("id=doc-state").0.name matches "^Scene level.vrmxs 16 nodes saved valid" timeout=90000   # the counter and the goal kept
  expect find("id=behaviour-error").count == 0   # the module loaded and declared itself
  menu "File › Export Game…" press   # "try File › Export Game… now"
  wait id=export-panel timeout_ms=10000   # "the Export panel opens"
  until find("id=export-game-result").0.name matches "^Game export refused .unnamed_behaviours.: behaviours.js runs when you play here, but game.json doesn't name it.*Project Settings › Behaviours" timeout=30000   # "with the refusal on its line, saying what to do"
  expect find("role=alert").count == 0   # on the Export line, not the window's error
  act id=export-open action=press   # "Close the panel (the toolbar's Export)": row 11 opens it from the menu
  wait id=export-panel gone=true timeout_ms=5000
  menu "File › Project Settings…" press   # "Then choose File › Project Settings…"
  wait id=project-settings timeout_ms=10000
  expect find("id=settings-behaviours-note").count == 1   # Play would run it, a build wouldn't: said until it is named
  act id=settings-behaviours action=focus   # "under Behaviours, pick behaviours.js"
  pause 500   # the settings sheet just opened: let the menu's control settle (a pick was once lost here)
  keys down
  pause 300
  act surface=app role=menuitem name="behaviours.js" exact=true action=press
  until find("id=settings-undo").0.name == "Undo Behaviours behaviours.js" timeout=10000
  expect find("id=settings-behaviours-note").count == 0
  expect find("id=settings-error").count == 0
  shot "tutorial-settings"
  act id=settings-done action=press   # "and press Done"
  wait id=project-settings gone=true timeout_ms=5000
  ```

- [ ] 7. Make the first coin
  ```steps
  act id=file-name action=focus
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down
  act surface=app role=menuitem name="Area" exact=true action=press   # "Add an Area"
  until find("role=popupbutton name='Node type to add'").0.value == "Area" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add area" timeout=5000
  pause 300
  act id=field-id action=set_value value="coin-1"   # "Id coin-1"
  until find("id=undo").0.name == "Undo Change id area to coin-1" timeout=5000
  act id=field-name action=set_value value="Coin 1"   # "Name Coin 1"
  until find("id=field-name").0.value == "Coin 1" timeout=5000
  act id=pos-x action=set_value value="0"   # "Position 0, 0.5, 4"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0.5"
  until find("id=pos-y").0.value == "0.5" timeout=5000
  act id=pos-z action=set_value value="4"
  until find("id=pos-z").0.value == "4" timeout=5000
  act id=pin-shape action=press   # "Press the pin beside shape"
  until find("id=pin-shape").count == 0 timeout=5000
  act id=prop-size-x action=set_value value="1"   # "and set size to 1, 1, 0.6"
  until find("id=prop-size-x").0.value == "1" timeout=5000
  act id=prop-size-y action=set_value value="1"
  until find("id=prop-size-y").0.value == "1" timeout=5000
  act id=prop-size-z action=set_value value="0.6"
  until find("id=prop-size-z").0.value == "0.6" timeout=5000
  act id=beh-add action=focus   # "In the Behaviours panel, choose coin"
  pause 300
  keys down
  act surface=app role=menuitem name="coin" exact=true action=press
  pause 300
  until find("id=beh-add").0.value == "coin" timeout=5000
  act id=beh-add-button action=press   # "and press Add"
  until find("id=undo").0.name == "Undo Add coin to coin-1" timeout=5000
  until find("id=beh-coin").count == 1 timeout=5000
  expect find("id=beh-coin-player").0.value == "mira"   # "Its three params show with their defaults (mira, coins, 1)"
  expect find("id=beh-coin-counter").0.value == "coins"
  expect find("id=beh-coin-value").0.value == "1"
  shot "tutorial-behaviour"
  act id=file-name action=focus
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down
  act surface=app role=menuitem name="ParticleEmitter" exact=true action=press   # "Add a ParticleEmitter"
  until find("role=popupbutton name='Node type to add'").0.value == "ParticleEmitter" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add particleemitter" timeout=5000
  pause 300
  act id=field-id action=set_value value="glint-1"   # "Id glint-1"
  until find("id=undo").0.name == "Undo Change id particleemitter to glint-1" timeout=5000
  act id=field-parent action=focus   # "Parent coin-1"
  pause 300
  keys down
  act surface=app role=menuitem name="coin-1" exact=true action=press
  until find("id=field-parent").0.value == "coin-1" timeout=5000
  act id=pos-x action=set_value value="0"   # "Position 0, 0, 0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-effect action=set_value value="sparks"   # "and effect sparks"
  until find("id=prop-effect").0.value == "sparks" timeout=5000
  expect find("id=doc-state").0.name matches " valid "
  ```

- [ ] 8. Wire the coin
  ```steps
  act id=node-coin-1 action=press   # "Select coin-1"
  until find("id=inspector-id").0.name == "Node coin-1"
  pause 300
  # "collected → glint-1 → stop"
  act id=conn-new-signal action=focus
  pause 300
  keys down
  act surface=app role=menuitem name="collected" exact=true action=press
  pause 300
  until find("id=conn-new-signal").0.value == "collected" timeout=5000
  act id=conn-new-to action=focus
  pause 300
  keys down
  act surface=app role=menuitem name="glint-1" exact=true action=press
  pause 300
  until find("id=conn-new-to").0.value == "glint-1" timeout=5000
  act id=conn-new-call action=focus
  pause 300
  keys down
  act surface=app role=menuitem name="stop" exact=true action=press
  pause 300
  until find("id=conn-new-call").0.value == "stop" timeout=5000
  act id=conn-new-add action=press   # "and pressing Connect"
  until find("id=undo").0.name == "Undo Connect coin-1.collected to glint-1.stop" timeout=5000
  until find("id=conn-4").count == 1 timeout=5000   # the scene's fifth connection: the template has four
  # "collected → hana → say, with the text A coin! Keep going, Mira."
  act id=conn-new-signal action=focus
  pause 300
  keys down
  act surface=app role=menuitem name="collected" exact=true action=press
  pause 300
  until find("id=conn-new-signal").0.value == "collected" timeout=5000
  act id=conn-new-to action=focus
  pause 300
  keys down
  act surface=app role=menuitem name="hana" exact=true action=press
  pause 300
  until find("id=conn-new-to").0.value == "hana" timeout=5000
  act id=conn-new-call action=focus
  pause 300
  keys down
  act surface=app role=menuitem name="say" exact=true action=press
  pause 300
  until find("id=conn-new-call").0.value == "say" timeout=5000
  act id=conn-new-add action=press   # "and pressing Connect"
  until find("id=undo").0.name == "Undo Connect coin-1.collected to hana.say" timeout=5000
  until find("id=conn-5").count == 1 timeout=5000
  act id=conn-5-arg-text action=set_value value="A coin! Keep going, Mira."
  until find("id=conn-5-arg-text").0.value == "A coin! Keep going, Mira." timeout=5000
  expect find("id=doc-state").0.name matches " valid "   # a connection from the project behaviour's signal is valid
  shot "tutorial-connections"
  ```

- [ ] 9. Two more coins
  ```steps
  act id=duplicate action=press   # "press Duplicate at the top of the Scene panel twice"
  until find("id=node-coin-2").count == 1 timeout=5000
  act id=duplicate action=press
  until find("id=node-coin-3").count == 1 timeout=5000
  expect find("id=node-glint-2").count == 1   # "Each copy takes its glint and its connections with it"
  expect find("id=node-glint-3").count == 1
  act id=node-coin-2 action=press
  until find("id=inspector-id").0.name == "Node coin-2"
  pause 300
  expect find("id=conn-6-to").0.value == "glint-2"   # "retargeted to the copy: coin-2 stops glint-2" (its copies are the scene's connections 7 and 8)
  expect find("id=conn-7-to").0.value == "hana"   # "and still has Hana say her line"
  act id=field-name action=set_value value="Coin 2"   # "coin-2: Name Coin 2"
  until find("id=field-name").0.value == "Coin 2" timeout=5000
  act id=pos-x action=set_value value="0"   # "Position 0, 0.5, 2.6"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0.5"
  until find("id=pos-y").0.value == "0.5" timeout=5000
  act id=pos-z action=set_value value="2.6"
  until find("id=pos-z").0.value == "2.6" timeout=5000
  act id=node-coin-3 action=press
  until find("id=inspector-id").0.name == "Node coin-3"
  pause 300
  act id=field-name action=set_value value="Coin 3"   # "coin-3: Name Coin 3"
  until find("id=field-name").0.value == "Coin 3" timeout=5000
  act id=pos-x action=set_value value="0"   # "Position 0, 0.5, 1.3"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0.5"
  until find("id=pos-y").0.value == "0.5" timeout=5000
  act id=pos-z action=set_value value="1.3"
  until find("id=pos-z").0.value == "1.3" timeout=5000
  act id=save action=press   # "Then Save"
  until find("id=saved").0.name matches "^Saved level.vrmxs · [0-9]+ bytes" timeout=20000
  until find("id=doc-state").0.name matches "^Scene level.vrmxs 22 nodes saved valid" timeout=20000   # "The scene is valid"
  expect find("id=node-coin-3").0.name contains "Coin 3"   # the copies named
  shot "editor-window"
  ```

- [ ] 10. Play it
  ```steps
  act id=node-env action=press   # off the coins: no inspector field holds the line, so only her caption can match it
  until find("id=inspector-id").0.name == "Node env"
  act id=play action=press   # "Press Play"
  until find("id=captions").count > 0 timeout=90000   # "The coin at Mira's feet is collected at once … Hana says" her line: its caption shows
  expect find("text='Keep going, Mira'").count > 0   # her line, from the connection (the inspector shows env: no field holds it)
  shot "tutorial-play"
  until find("text=Playing · step").0.name matches "step [1-9][0-9]{2}" timeout=60000
  expect find("id=behaviour-error").count == 0
  act id=play action=press   # "Press Play again to stop"
  until find("id=stop-result").0.name matches "^Stopped: scene as before Play" timeout=20000
  partial: walking through the other two coins to the counter is step 12's, outside the app (a held key isn't an AppProbe step)
  ```

- [ ] 11. Export the game
  ```steps
  expect find("id=export-panel").count == 0   # closed since row 6
  menu "File › Export Game…" press   # "Choose File › Export Game…"
  wait id=export-panel timeout_ms=10000   # "The Export panel opens"
  until find("id=export-game-result").0.name matches "^Exported game coin-run: [0-9]+ files, [0-9]+ bytes, entry level.vrmxs, runtime vrmxg-game .*/w9-builds[^/]*/coin-run$" timeout=180000   # "create an empty folder, coin-run, and choose it" (VRMXG_SHELL_BUILD names that folder: the shell writes into exactly it)
  expect find("role=alert").count == 0
  ```

- [ ] 12. Play the build in the game app
  ```steps
  skip: run outside the app: node acceptance/m6/tutorial.mjs play <container>/tmp/w9-builds/coin-run (Node, and the game app in Chromium on WebGPU and WebGL)
  ```
