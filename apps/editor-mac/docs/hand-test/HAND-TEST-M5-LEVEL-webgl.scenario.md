# The sample game's level, built in the editor (M5 W10, M6 W1): AppProbe scenario, WebGL forced

**Written by `acceptance/m5/rush-level-scenario.mjs` from `content/sample/game/level.vrmxs`: edit that, not this.**
Run `apps/editor-mac/scripts/build.sh`, launch the app once (its container must exist), then
`apps/editor-mac/scripts/hand-test-fixtures-m5-level.sh` (the scenario's own copy of the sample, `project-w10-level`, its
game the Morning Rush, with `game/rush-built.vrmxs`: the level's room, its game layer, behaviours and connections taken
out), then, holding the GPU lock, `appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M5-LEVEL.scenario.md`,
and last `node acceptance/m5/rush-level.mjs compare <container>/tmp/project-w10-level/game/rush-built.vrmxs`, which wants
the committed level's bytes. No row types JSON: nodes come from the toolbar and the assets panel (the till dragged onto
the viewport with the real pointer, so the Mac must be unlocked), each is given the committed id in the Id field and its
place by the Before menu, maps and lists are edited key by key and row by row, conditions through their test menus,
behaviours and their params from the Behaviours panel, the 19 connections from the Connections panel; a door prefab's
override is made, seen and reverted.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M5-LEVEL.md
env: {"VRMXG_QUERY": "renderer=webgl", "VRMXG_SHELL_PROJECT": "project-w10-level", "VRMXG_SHELL_SETTINGS": "w10-settings.json", "VRMXG_SHELL_CACHE": "w10-cache-webgl"}
fresh: false
```

- [ ] The level's room opens: the set, the doors and stools, Mira, Hana and the three regulars, with no rules, behaviours or connections yet.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project-w10-level"
  act id=file-name action=set_value value=game/rush-built.vrmxs
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 26 nodes saved valid " timeout=90000
  expect find("id=renderer").0.name == "Renderer WebGL"
  expect find("id=node-aoi").count == 1
  expect find("id=node-hana-1").count == 1
  shot "the room"
  ```

- [ ] Mira plays and the regulars think: the player behaviour added to Mira, a brain to each regular, its preset a path (the brain's kind menu) and its vars a number and a seat (each value's kind menu), from the Behaviours panel.
  ```steps
  act id=node-mira action=press
  until find("id=inspector-id").0.name == "Node mira"
  act id=beh-add action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="player" exact=true action=press
  pause 300
  act id=beh-add-button action=press
  until find("id=undo").0.name == "Undo Add player to mira" timeout=5000
  until find("id=beh-player").count == 1 timeout=5000
  act id=node-aoi action=press
  until find("id=inspector-id").0.name == "Node aoi"
  act id=beh-add action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="brain" exact=true action=press
  pause 300
  act id=beh-add-button action=press
  until find("id=undo").0.name == "Undo Add brain to aoi" timeout=5000
  until find("id=beh-brain").count == 1 timeout=5000
  act id=beh-brain-preset--kind action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="path" exact=true action=press
  until find("id=beh-brain-preset--kind").0.value == "path" timeout=5000
  pause 300
  act id=beh-brain-preset action=set_value value="game/brains/regular.json"
  until find("id=beh-brain-preset").0.value == "game/brains/regular.json" timeout=5000
  act id=beh-brain-vars--newkey action=set_value value="arrive"
  act id=beh-brain-vars--addkey action=press
  until find("id=beh-brain-vars-arrive").count == 1 timeout=5000
  pause 300
  act id=beh-brain-vars-arrive--kind action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="number" exact=true action=press
  until find("id=beh-brain-vars-arrive--kind").0.value == "number" timeout=5000
  pause 300
  act id=beh-brain-vars-arrive action=set_value value="8"
  until find("id=beh-brain-vars-arrive").0.value == "8" timeout=5000
  act id=beh-brain-vars--newkey action=set_value value="seat"
  act id=beh-brain-vars--addkey action=press
  until find("id=beh-brain-vars-seat").count == 1 timeout=5000
  pause 300
  act id=beh-brain-vars-seat action=set_value value="stool-2"
  until find("id=beh-brain-vars-seat").0.value == "stool-2" timeout=5000
  act id=node-ren action=press
  until find("id=inspector-id").0.name == "Node ren"
  act id=beh-add action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="brain" exact=true action=press
  pause 300
  act id=beh-add-button action=press
  until find("id=undo").0.name == "Undo Add brain to ren" timeout=5000
  until find("id=beh-brain").count == 1 timeout=5000
  act id=beh-brain-preset--kind action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="path" exact=true action=press
  until find("id=beh-brain-preset--kind").0.value == "path" timeout=5000
  pause 300
  act id=beh-brain-preset action=set_value value="game/brains/regular.json"
  until find("id=beh-brain-preset").0.value == "game/brains/regular.json" timeout=5000
  act id=beh-brain-vars--newkey action=set_value value="arrive"
  act id=beh-brain-vars--addkey action=press
  until find("id=beh-brain-vars-arrive").count == 1 timeout=5000
  pause 300
  act id=beh-brain-vars-arrive--kind action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="number" exact=true action=press
  until find("id=beh-brain-vars-arrive--kind").0.value == "number" timeout=5000
  pause 300
  act id=beh-brain-vars-arrive action=set_value value="35"
  until find("id=beh-brain-vars-arrive").0.value == "35" timeout=5000
  act id=beh-brain-vars--newkey action=set_value value="seat"
  act id=beh-brain-vars--addkey action=press
  until find("id=beh-brain-vars-seat").count == 1 timeout=5000
  pause 300
  act id=beh-brain-vars-seat action=set_value value="stool-3"
  until find("id=beh-brain-vars-seat").0.value == "stool-3" timeout=5000
  act id=node-yuki action=press
  until find("id=inspector-id").0.name == "Node yuki"
  act id=beh-add action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="brain" exact=true action=press
  pause 300
  act id=beh-add-button action=press
  until find("id=undo").0.name == "Undo Add brain to yuki" timeout=5000
  until find("id=beh-brain").count == 1 timeout=5000
  act id=beh-brain-preset--kind action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="path" exact=true action=press
  until find("id=beh-brain-preset--kind").0.value == "path" timeout=5000
  pause 300
  act id=beh-brain-preset action=set_value value="game/brains/regular.json"
  until find("id=beh-brain-preset").0.value == "game/brains/regular.json" timeout=5000
  act id=beh-brain-vars--newkey action=set_value value="arrive"
  act id=beh-brain-vars--addkey action=press
  until find("id=beh-brain-vars-arrive").count == 1 timeout=5000
  pause 300
  act id=beh-brain-vars-arrive--kind action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="number" exact=true action=press
  until find("id=beh-brain-vars-arrive--kind").0.value == "number" timeout=5000
  pause 300
  act id=beh-brain-vars-arrive action=set_value value="60"
  until find("id=beh-brain-vars-arrive").0.value == "60" timeout=5000
  act id=beh-brain-vars--newkey action=set_value value="seat"
  act id=beh-brain-vars--addkey action=press
  until find("id=beh-brain-vars-seat").count == 1 timeout=5000
  pause 300
  act id=beh-brain-vars-seat action=set_value value="stool-5"
  until find("id=beh-brain-vars-seat").0.value == "stool-5" timeout=5000
  expect find("id=beh-brain-vars-arrive").0.value == "60"   # Yuki's, the last one set
  shot "a regular's brain"
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] The three table areas: one made, its shape pinned and its size set (a vector), Duplicated twice, then all three selected to see the size they share; each given its id, name and place.
  ```steps
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="Area" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Area" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add area" timeout=5000
  act id=pin-shape action=press   # the value shown is its default: the pin writes it
  until find("id=pin-shape").count == 0 timeout=5000
  expect find("id=undo").0.name == "Undo Set area.shape"
  act id=prop-size-x action=set_value value="1.1"
  until find("id=prop-size-x").0.value == "1.1" timeout=5000
  act id=prop-size-y action=set_value value="2"
  until find("id=prop-size-y").0.value == "2" timeout=5000
  act id=prop-size-z action=set_value value="1.8"
  until find("id=prop-size-z").0.value == "1.8" timeout=5000
  act id=duplicate action=press   # the toolbar's Duplicate (Edit › Duplicate edits text while an inspector field has focus)
  until find("id=node-area-2").count == 1 timeout=5000
  act id=duplicate action=press   # the toolbar's Duplicate (Edit › Duplicate edits text while an inspector field has focus)
  until find("id=node-area-3").count == 1 timeout=5000
  act id=inspector-select-type action=press   # "Select every Area": several nodes at once without a modifier key
  until find("id=inspector-id").0.name matches "^3 nodes: " timeout=5000
  expect find("id=prop-size-x").0.name != "size X (mixed values)"
  expect find("id=prop-size-z").0.value == "1.8"
  act id=node-area action=press
  until find("id=inspector-id").0.name == "Node area"
  act id=field-id action=set_value value="table-1"   # the committed id
  until find("id=undo").0.name == "Undo Change id area to table-1" timeout=5000
  expect find("id=inspector-id").0.name == "Node table-1"
  act id=field-name action=set_value value="Table 1"
  until find("id=field-name").0.value == "Table 1" timeout=5000
  act id=pos-x action=set_value value="-1.45"
  until find("id=pos-x").0.value == "-1.45" timeout=5000
  act id=pos-y action=set_value value="1"
  until find("id=pos-y").0.value == "1" timeout=5000
  act id=pos-z action=set_value value="1"
  until find("id=pos-z").0.value == "1" timeout=5000
  act id=node-area-2 action=press
  until find("id=inspector-id").0.name == "Node area-2"
  act id=field-id action=set_value value="table-2"   # the committed id
  until find("id=undo").0.name == "Undo Change id area-2 to table-2" timeout=5000
  expect find("id=inspector-id").0.name == "Node table-2"
  act id=field-name action=set_value value="Table 2"
  until find("id=field-name").0.value == "Table 2" timeout=5000
  act id=pos-x action=set_value value="1.45"
  until find("id=pos-x").0.value == "1.45" timeout=5000
  act id=pos-y action=set_value value="1"
  until find("id=pos-y").0.value == "1" timeout=5000
  act id=pos-z action=set_value value="1"
  until find("id=pos-z").0.value == "1" timeout=5000
  act id=node-area-3 action=press
  until find("id=inspector-id").0.name == "Node area-3"
  act id=field-id action=set_value value="table-3"   # the committed id
  until find("id=undo").0.name == "Undo Change id area-3 to table-3" timeout=5000
  expect find("id=inspector-id").0.name == "Node table-3"
  act id=field-name action=set_value value="Table 3"
  until find("id=field-name").0.value == "Table 3" timeout=5000
  act id=pos-x action=set_value value="1.45"
  until find("id=pos-x").0.value == "1.45" timeout=5000
  act id=pos-y action=set_value value="1"
  until find("id=pos-y").0.value == "1" timeout=5000
  act id=pos-z action=set_value value="-2"
  until find("id=pos-z").0.value == "-2" timeout=5000
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] The rules: a GameRules node given its id, its seven flags (a map, key by key) and its lose condition (any of: the clock done, two wrong orders), built in the condition's menus and rows.
  ```steps
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="GameRules" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameRules" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gamerules" timeout=5000
  act id=field-id action=set_value value="rules"   # the committed id
  until find("id=undo").0.name == "Undo Change id gamerules to rules" timeout=5000
  expect find("id=inspector-id").0.name == "Node rules"
  act id=prop-flags--newkey action=set_value value=ordered1
  act id=prop-flags--addkey action=press
  until find("id=prop-flags-ordered1").count == 1 timeout=5000
  act id=prop-flags--newkey action=set_value value=ordered2
  act id=prop-flags--addkey action=press
  until find("id=prop-flags-ordered2").count == 1 timeout=5000
  act id=prop-flags--newkey action=set_value value=ordered3
  act id=prop-flags--addkey action=press
  until find("id=prop-flags-ordered3").count == 1 timeout=5000
  act id=prop-flags--newkey action=set_value value=right1
  act id=prop-flags--addkey action=press
  until find("id=prop-flags-right1").count == 1 timeout=5000
  act id=prop-flags--newkey action=set_value value=right2
  act id=prop-flags--addkey action=press
  until find("id=prop-flags-right2").count == 1 timeout=5000
  act id=prop-flags--newkey action=set_value value=right3
  act id=prop-flags--addkey action=press
  until find("id=prop-flags-right3").count == 1 timeout=5000
  act id=prop-flags--newkey action=set_value value=tillClosed
  act id=prop-flags--addkey action=press
  until find("id=prop-flags-tillClosed").count == 1 timeout=5000
  until find("id=prop-flags").0.name == "flags, 7 entries"
  act id=prop-lose-test action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="any" exact=true action=press
  until find("id=prop-lose-test").0.value == "any" timeout=5000
  until find("id=prop-lose-of-0").count == 1 timeout=5000
  pause 500   # a row just made: let it settle before its "new" placeholder is replaced (typed too soon, the value lands after it)
  act id=prop-lose-of-0-key action=set_value value="timers.clock.done"
  until find("id=prop-lose-of-0-key").0.value == "timers.clock.done" timeout=5000
  act id=prop-lose-of--add action=press
  until find("id=prop-lose-of-1").count == 1 timeout=5000
  pause 500   # a row just made: let it settle before its "new" placeholder is replaced (typed too soon, the value lands after it)
  act id=prop-lose-of-1-key action=set_value value="counters.mistakes"
  until find("id=prop-lose-of-1-key").0.value == "counters.mistakes" timeout=5000
  act id=prop-lose-of-1-op action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="ge" exact=true action=press
  until find("id=prop-lose-of-1-op").0.value == "ge" timeout=5000
  act id=prop-lose-of-1-value action=set_value value="2"
  until find("id=prop-lose-of-1-value").0.value == "2" timeout=5000
  expect find("id=prop-lose-of").0.name == "lose of, 2 rows"
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] The counters and the clock under the rules, each given its id (its key in the game state follows it): labels, a maximum typed as arithmetic, the clock's 240 seconds typed as 4*60.
  ```steps
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="GameCounter" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameCounter" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gamecounter" timeout=5000
  act id=field-id action=set_value value="score"   # the committed id
  until find("id=undo").0.name == "Undo Change id gamecounter to score" timeout=5000
  expect find("id=inspector-id").0.name == "Node score"
  act id=field-parent action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=prop-label action=set_value value="Score"
  until find("id=prop-label").0.value == "Score" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="GameCounter" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameCounter" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gamecounter" timeout=5000
  act id=field-id action=set_value value="served"   # the committed id
  until find("id=undo").0.name == "Undo Change id gamecounter to served" timeout=5000
  expect find("id=inspector-id").0.name == "Node served"
  act id=field-parent action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=prop-label action=set_value value="Served"
  until find("id=prop-label").0.value == "Served" timeout=5000
  act id=prop-max action=set_value value="1+2"   # arithmetic: the field commits its result
  until find("id=prop-max").0.value == "3" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="GameCounter" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameCounter" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gamecounter" timeout=5000
  act id=field-id action=set_value value="mistakes"   # the committed id
  until find("id=undo").0.name == "Undo Change id gamecounter to mistakes" timeout=5000
  expect find("id=inspector-id").0.name == "Node mistakes"
  act id=field-parent action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=prop-label action=set_value value="Wrong orders"
  until find("id=prop-label").0.value == "Wrong orders" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="GameTimer" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameTimer" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gametimer" timeout=5000
  act id=field-id action=set_value value="clock"   # the committed id
  until find("id=undo").0.name == "Undo Change id gametimer to clock" timeout=5000
  expect find("id=inspector-id").0.name == "Node clock"
  act id=field-parent action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=prop-label action=set_value value="Until ten o'clock"
  until find("id=prop-label").0.value == "Until ten o'clock" timeout=5000
  act id=prop-seconds action=set_value value="4*60"   # arithmetic: the field commits its result
  until find("id=prop-seconds").0.value == "240" timeout=5000
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] Three brew timers: one made, Duplicated twice, then all three selected and their seconds typed once for all (one undo step); each given its id.
  ```steps
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="GameTimer" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameTimer" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gametimer" timeout=5000
  act id=field-parent action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=prop-autostart action=press
  until find("id=prop-autostart").0.value == "0" timeout=5000
  act id=duplicate action=press   # the toolbar's Duplicate (Edit › Duplicate edits text while an inspector field has focus)
  until find("id=node-gametimer-2").count == 1 timeout=5000
  expect find("id=undo").0.name == "Undo Duplicate gametimer"
  act id=duplicate action=press   # the toolbar's Duplicate (Edit › Duplicate edits text while an inspector field has focus)
  until find("id=node-gametimer-3").count == 1 timeout=5000
  expect find("id=undo").0.name == "Undo Duplicate gametimer-2"
  act id=node-gametimer action=press
  until find("id=inspector-id").0.name == "Node gametimer"
  act id=inspector-also action=focus
  pause 300
  keys down   # "Also select": its menu
  act surface=app role=menuitem name="gametimer-2" exact=true action=press
  pause 300
  act id=inspector-also action=focus
  pause 300
  keys down   # "Also select": its menu
  act surface=app role=menuitem name="gametimer-3" exact=true action=press
  pause 300
  until find("id=inspector-id").0.name == "3 nodes: gametimer, gametimer-2, gametimer-3" timeout=5000
  act id=prop-seconds action=set_value value="2*3"   # every selected timer, one command
  until find("id=undo").0.name == "Undo Set seconds on 3 nodes" timeout=5000
  expect find("id=prop-seconds").0.value == "6"
  act id=node-gametimer action=press
  until find("id=inspector-id").0.name == "Node gametimer"
  act id=field-id action=set_value value="brew-1"   # the committed id
  until find("id=undo").0.name == "Undo Change id gametimer to brew-1" timeout=5000
  expect find("id=inspector-id").0.name == "Node brew-1"
  act id=node-gametimer-2 action=press
  until find("id=inspector-id").0.name == "Node gametimer-2"
  act id=field-id action=set_value value="brew-2"   # the committed id
  until find("id=undo").0.name == "Undo Change id gametimer-2 to brew-2" timeout=5000
  expect find("id=inspector-id").0.name == "Node brew-2"
  act id=node-gametimer-3 action=press
  until find("id=inspector-id").0.name == "Node gametimer-3"
  act id=field-id action=set_value value="brew-3"   # the committed id
  until find("id=undo").0.name == "Undo Change id gametimer-3 to brew-3" timeout=5000
  expect find("id=inspector-id").0.name == "Node brew-3"
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] The two goals in order and the checkpoint, each given its id and its condition built in the condition's fields; the checkpoint's once pinned (its default, written into the file).
  ```steps
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="GameGoal" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameGoal" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gamegoal" timeout=5000
  act id=field-id action=set_value value="serve"   # the committed id
  until find("id=undo").0.name == "Undo Change id gamegoal to serve" timeout=5000
  expect find("id=inspector-id").0.name == "Node serve"
  act id=field-parent action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=prop-text action=set_value value="Serve the three regulars"
  until find("id=prop-text").0.value == "Serve the three regulars" timeout=5000
  act id=prop-when-test action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="all" exact=true action=press
  until find("id=prop-when-test").0.value == "all" timeout=5000
  until find("id=prop-when-of-0").count == 1 timeout=5000
  pause 500   # a row just made: let it settle before its "new" placeholder is replaced (typed too soon, the value lands after it)
  act id=prop-when-of-0-key action=set_value value="counters.served"
  until find("id=prop-when-of-0-key").0.value == "counters.served" timeout=5000
  act id=prop-when-of-0-op action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="ge" exact=true action=press
  until find("id=prop-when-of-0-op").0.value == "ge" timeout=5000
  act id=prop-when-of-0-value action=set_value value="3"
  until find("id=prop-when-of-0-value").0.value == "3" timeout=5000
  act id=prop-when-of--add action=press
  until find("id=prop-when-of-1").count == 1 timeout=5000
  pause 500   # a row just made: let it settle before its "new" placeholder is replaced (typed too soon, the value lands after it)
  act id=prop-when-of-1-key action=set_value value="counters.mistakes"
  until find("id=prop-when-of-1-key").0.value == "counters.mistakes" timeout=5000
  act id=prop-when-of-1-op action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="lt" exact=true action=press
  until find("id=prop-when-of-1-op").0.value == "lt" timeout=5000
  act id=prop-when-of-1-value action=set_value value="2"
  until find("id=prop-when-of-1-value").0.value == "2" timeout=5000
  expect find("id=prop-when-of").0.name == "when of, 2 rows"
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="GameGoal" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameGoal" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gamegoal" timeout=5000
  act id=field-id action=set_value value="close-till"   # the committed id
  until find("id=undo").0.name == "Undo Change id gamegoal to close-till" timeout=5000
  expect find("id=inspector-id").0.name == "Node close-till"
  act id=field-parent action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=prop-text action=set_value value="Close the till"
  until find("id=prop-text").0.value == "Close the till" timeout=5000
  act id=prop-when-test action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="all" exact=true action=press
  until find("id=prop-when-test").0.value == "all" timeout=5000
  act id=prop-when-test action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="state" exact=true action=press
  until find("id=prop-when-test").0.value == "state" timeout=5000
  pause 500   # a row just made: let it settle before its "new" placeholder is replaced (typed too soon, the value lands after it)
  act id=prop-when-key action=set_value value="flags.tillClosed"
  until find("id=prop-when-key").0.value == "flags.tillClosed" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="Checkpoint" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Checkpoint" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add checkpoint" timeout=5000
  act id=field-id action=set_value value="cp-first"   # the committed id
  until find("id=undo").0.name == "Undo Change id checkpoint to cp-first" timeout=5000
  expect find("id=inspector-id").0.name == "Node cp-first"
  act id=field-parent action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=prop-slot action=set_value value="first-order"
  until find("id=prop-slot").0.value == "first-order" timeout=5000
  act id=prop-label action=set_value value="First order served"
  until find("id=prop-label").0.value == "First order served" timeout=5000
  act id=pin-once action=press   # the value shown is its default: the pin writes it
  until find("id=pin-once").count == 0 timeout=5000
  expect find("id=undo").0.name == "Undo Set cp-first.once"
  act id=prop-when-test action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="all" exact=true action=press
  until find("id=prop-when-test").0.value == "all" timeout=5000
  act id=prop-when-test action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="state" exact=true action=press
  until find("id=prop-when-test").0.value == "state" timeout=5000
  pause 500   # a row just made: let it settle before its "new" placeholder is replaced (typed too soon, the value lands after it)
  act id=prop-when-key action=set_value value="counters.served"
  until find("id=prop-when-key").0.value == "counters.served" timeout=5000
  act id=prop-when-op action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="ge" exact=true action=press
  until find("id=prop-when-op").0.value == "ge" timeout=5000
  act id=prop-when-value action=set_value value="1"
  until find("id=prop-when-value").0.value == "1" timeout=5000
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] The till dragged from the assets panel onto the viewport (the real pointer), and the three trays added from the panel; each given its id, name, place and the state it starts in, and moved before Mira in the scene's order (the Before menu).
  ```steps
  act id=assets-search action=set_value value=till   # the panel narrowed to this file
  until find("id=asset-game-items-till-vrmxi").count == 1 timeout=10000
  find id=asset-game-items-till-vrmxi
  set FROM = $.0.ref
  find name=Viewport exact=true
  set TO = $.0.ref
  pointer drag ref="${FROM}" to_ref="${TO}" steps=30   # the till's tile dropped on the viewport: placed where it lands
  until find("id=undo").0.name == "Undo Add till" timeout=10000
  act id=field-name action=set_value value="Till"
  until find("id=field-name").0.value == "Till" timeout=5000
  act id=pos-x action=set_value value="-1.65"
  until find("id=pos-x").0.value == "-1.65" timeout=5000
  act id=pos-y action=set_value value="1.06"
  until find("id=pos-y").0.value == "1.06" timeout=5000
  act id=pos-z action=set_value value="-3.95"
  until find("id=pos-z").0.value == "-3.95" timeout=5000
  act id=prop-state action=set_value value="locked"
  until find("id=prop-state").0.value == "locked" timeout=5000
  act id=field-before action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="mira" exact=true action=press
  until find("id=field-before").0.value == "mira" timeout=5000
  until find("id=undo").0.name == "Undo Move till before mira" timeout=5000
  act id=assets-search action=set_value value=order-1   # the panel narrowed to this file
  until find("id=asset-game-items-order-1-vrmxi").count == 1 timeout=10000
  act id=add-game-items-order-1-vrmxi action=press   # the panel's Add, for the trays
  until find("id=undo").0.name == "Undo Add order-1" timeout=10000
  act id=field-id action=set_value value="tray-1"   # the committed id
  until find("id=undo").0.name == "Undo Change id order-1 to tray-1" timeout=5000
  expect find("id=inspector-id").0.name == "Node tray-1"
  act id=field-name action=set_value value="Order for table 1"
  until find("id=field-name").0.value == "Order for table 1" timeout=5000
  act id=pos-x action=set_value value="-0.9"
  until find("id=pos-x").0.value == "-0.9" timeout=5000
  act id=pos-y action=set_value value="1.06"
  until find("id=pos-y").0.value == "1.06" timeout=5000
  act id=pos-z action=set_value value="-3.95"
  until find("id=pos-z").0.value == "-3.95" timeout=5000
  act id=prop-state action=set_value value="waiting"
  until find("id=prop-state").0.value == "waiting" timeout=5000
  act id=field-before action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="mira" exact=true action=press
  until find("id=field-before").0.value == "mira" timeout=5000
  until find("id=undo").0.name == "Undo Move tray-1 before mira" timeout=5000
  act id=assets-search action=set_value value=order-2   # the panel narrowed to this file
  until find("id=asset-game-items-order-2-vrmxi").count == 1 timeout=10000
  act id=add-game-items-order-2-vrmxi action=press   # the panel's Add, for the trays
  until find("id=undo").0.name == "Undo Add order-2" timeout=10000
  act id=field-id action=set_value value="tray-2"   # the committed id
  until find("id=undo").0.name == "Undo Change id order-2 to tray-2" timeout=5000
  expect find("id=inspector-id").0.name == "Node tray-2"
  act id=field-name action=set_value value="Order for table 2"
  until find("id=field-name").0.value == "Order for table 2" timeout=5000
  act id=pos-x action=set_value value="-0.1"
  until find("id=pos-x").0.value == "-0.1" timeout=5000
  act id=pos-y action=set_value value="1.06"
  until find("id=pos-y").0.value == "1.06" timeout=5000
  act id=pos-z action=set_value value="-3.95"
  until find("id=pos-z").0.value == "-3.95" timeout=5000
  act id=prop-state action=set_value value="waiting"
  until find("id=prop-state").0.value == "waiting" timeout=5000
  act id=field-before action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="mira" exact=true action=press
  until find("id=field-before").0.value == "mira" timeout=5000
  until find("id=undo").0.name == "Undo Move tray-2 before mira" timeout=5000
  act id=assets-search action=set_value value=order-3   # the panel narrowed to this file
  until find("id=asset-game-items-order-3-vrmxi").count == 1 timeout=10000
  act id=add-game-items-order-3-vrmxi action=press   # the panel's Add, for the trays
  until find("id=undo").0.name == "Undo Add order-3" timeout=10000
  act id=field-id action=set_value value="tray-3"   # the committed id
  until find("id=undo").0.name == "Undo Change id order-3 to tray-3" timeout=5000
  expect find("id=inspector-id").0.name == "Node tray-3"
  act id=field-name action=set_value value="Order for table 3"
  until find("id=field-name").0.value == "Order for table 3" timeout=5000
  act id=pos-x action=set_value value="0.6"
  until find("id=pos-x").0.value == "0.6" timeout=5000
  act id=pos-y action=set_value value="1.06"
  until find("id=pos-y").0.value == "1.06" timeout=5000
  act id=pos-z action=set_value value="-3.95"
  until find("id=pos-z").0.value == "-3.95" timeout=5000
  act id=prop-state action=set_value value="waiting"
  until find("id=prop-state").0.value == "waiting" timeout=5000
  act id=field-before action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="mira" exact=true action=press
  until find("id=field-before").0.value == "mira" timeout=5000
  until find("id=undo").0.name == "Undo Move tray-3 before mira" timeout=5000
  act id=assets-search action=set_value value=" "   # a space: no words, the whole list again (set_value needs a value)
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] Hana's briefing: a Dialogue given its id, that starts by itself, three lines (speaker, text, clip, ids and the line after), the first offering two choices that branch.
  ```steps
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="Dialogue" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Dialogue" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add dialogue" timeout=5000
  act id=field-id action=set_value value="briefing"   # the committed id
  until find("id=undo").0.name == "Undo Change id dialogue to briefing" timeout=5000
  expect find("id=inspector-id").0.name == "Node briefing"
  act id=prop-autostart action=press
  until find("id=prop-autostart").0.value == "1" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 1 row" timeout=5000
  pause 500
  act id=prop-lines-0-speaker action=set_value value="hana-1"
  until find("id=prop-lines-0-speaker").0.value == "hana-1" timeout=5000
  act id=prop-lines-0-text action=set_value value="Morning, Mira! Three regulars are due. Take their orders, bring each one what I make, and close the till before ten."
  until find("id=prop-lines-0-text").0.value == "Morning, Mira! Three regulars are due. Take their orders, bring each one what I make, and close the till before ten." timeout=5000
  act id=prop-lines-0-clip action=set_value value="game/voice/hana-brief.wav"
  until find("id=prop-lines-0-clip").0.value == "game/voice/hana-brief.wav" timeout=5000
  act id=prop-lines-0-choices--set action=press
  until find("id=prop-lines-0-choices-0").count == 1 timeout=5000
  pause 500
  act id=prop-lines-0-choices-0-id action=set_value value="ready"
  until find("id=prop-lines-0-choices-0-id").0.value == "ready" timeout=5000
  act id=prop-lines-0-choices-0-text action=set_value value="On it!"
  until find("id=prop-lines-0-choices-0-text").0.value == "On it!" timeout=5000
  act id=prop-lines-0-choices-0-to action=set_value value="ready"
  until find("id=prop-lines-0-choices-0-to").0.value == "ready" timeout=5000
  act id=prop-lines-0-choices--add action=press
  until find("id=prop-lines-0-choices-1").count == 1 timeout=5000
  pause 500
  act id=prop-lines-0-choices-1-id action=set_value value="coffee"
  until find("id=prop-lines-0-choices-1-id").0.value == "coffee" timeout=5000
  act id=prop-lines-0-choices-1-text action=set_value value="Coffee first?"
  until find("id=prop-lines-0-choices-1-text").0.value == "Coffee first?" timeout=5000
  act id=prop-lines-0-choices-1-to action=set_value value="coffee"
  until find("id=prop-lines-0-choices-1-to").0.value == "coffee" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 2 rows" timeout=5000
  pause 500
  act id=prop-lines-1-id action=set_value value="ready"
  until find("id=prop-lines-1-id").0.value == "ready" timeout=5000
  act id=prop-lines-1-speaker action=set_value value="hana-1"
  until find("id=prop-lines-1-speaker").0.value == "hana-1" timeout=5000
  act id=prop-lines-1-text action=set_value value="That's the spirit. Here comes Aoi!"
  until find("id=prop-lines-1-text").0.value == "That's the spirit. Here comes Aoi!" timeout=5000
  act id=prop-lines-1-clip action=set_value value="game/voice/hana-brief-ready.wav"
  until find("id=prop-lines-1-clip").0.value == "game/voice/hana-brief-ready.wav" timeout=5000
  act id=prop-lines-1-next action=set_value value="end"
  until find("id=prop-lines-1-next").0.value == "end" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 3 rows" timeout=5000
  pause 500
  act id=prop-lines-2-id action=set_value value="coffee"
  until find("id=prop-lines-2-id").0.value == "coffee" timeout=5000
  act id=prop-lines-2-speaker action=set_value value="hana-1"
  until find("id=prop-lines-2-speaker").0.value == "hana-1" timeout=5000
  act id=prop-lines-2-text action=set_value value="After the rush! Here comes Aoi."
  until find("id=prop-lines-2-text").0.value == "After the rush! Here comes Aoi." timeout=5000
  act id=prop-lines-2-clip action=set_value value="game/voice/hana-brief-coffee.wav"
  until find("id=prop-lines-2-clip").0.value == "game/voice/hana-brief-coffee.wav" timeout=5000
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] Aoi's order: a Dialogue given its id, three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).
  ```steps
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="Dialogue" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Dialogue" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add dialogue" timeout=5000
  act id=field-id action=set_value value="order-1"   # the committed id
  until find("id=undo").0.name == "Undo Change id dialogue to order-1" timeout=5000
  expect find("id=inspector-id").0.name == "Node order-1"
  act id=field-name action=set_value value="Aoi's order"
  until find("id=field-name").0.value == "Aoi's order" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 1 row" timeout=5000
  pause 500
  act id=prop-lines-0-speaker action=set_value value="aoi"
  until find("id=prop-lines-0-speaker").0.value == "aoi" timeout=5000
  act id=prop-lines-0-text action=set_value value="Morning! Something warm and milky, please. Not too strong."
  until find("id=prop-lines-0-text").0.value == "Morning! Something warm and milky, please. Not too strong." timeout=5000
  act id=prop-lines-0-clip action=set_value value="game/voice/aoi-ask.wav"
  until find("id=prop-lines-0-clip").0.value == "game/voice/aoi-ask.wav" timeout=5000
  act id=prop-lines-0-choices--set action=press
  until find("id=prop-lines-0-choices-0").count == 1 timeout=5000
  pause 500
  act id=prop-lines-0-choices-0-id action=set_value value="latte"
  until find("id=prop-lines-0-choices-0-id").0.value == "latte" timeout=5000
  act id=prop-lines-0-choices-0-text action=set_value value="A latte, then."
  until find("id=prop-lines-0-choices-0-text").0.value == "A latte, then." timeout=5000
  act id=prop-lines-0-choices-0-to action=set_value value="right"
  until find("id=prop-lines-0-choices-0-to").0.value == "right" timeout=5000
  act id=prop-lines-0-choices-0-set--set action=press
  until find("id=prop-lines-0-choices-0-set").count == 1 timeout=5000
  act id=prop-lines-0-choices-0-set--newkey action=set_value value=ordered1
  act id=prop-lines-0-choices-0-set--addkey action=press
  until find("id=prop-lines-0-choices-0-set-ordered1").count == 1 timeout=5000
  act id=prop-lines-0-choices-0-set-ordered1 action=press
  until find("id=prop-lines-0-choices-0-set-ordered1").0.value == "1" timeout=5000
  act id=prop-lines-0-choices-0-set--newkey action=set_value value=right1
  act id=prop-lines-0-choices-0-set--addkey action=press
  until find("id=prop-lines-0-choices-0-set-right1").count == 1 timeout=5000
  act id=prop-lines-0-choices-0-set-right1 action=press
  until find("id=prop-lines-0-choices-0-set-right1").0.value == "1" timeout=5000
  act id=prop-lines-0-choices--add action=press
  until find("id=prop-lines-0-choices-1").count == 1 timeout=5000
  pause 500
  act id=prop-lines-0-choices-1-id action=set_value value="espresso"
  until find("id=prop-lines-0-choices-1-id").0.value == "espresso" timeout=5000
  act id=prop-lines-0-choices-1-text action=set_value value="A double espresso?"
  until find("id=prop-lines-0-choices-1-text").0.value == "A double espresso?" timeout=5000
  act id=prop-lines-0-choices-1-to action=set_value value="wrong"
  until find("id=prop-lines-0-choices-1-to").0.value == "wrong" timeout=5000
  act id=prop-lines-0-choices-1-set--set action=press
  until find("id=prop-lines-0-choices-1-set").count == 1 timeout=5000
  act id=prop-lines-0-choices-1-set--newkey action=set_value value=ordered1
  act id=prop-lines-0-choices-1-set--addkey action=press
  until find("id=prop-lines-0-choices-1-set-ordered1").count == 1 timeout=5000
  act id=prop-lines-0-choices-1-set-ordered1 action=press
  until find("id=prop-lines-0-choices-1-set-ordered1").0.value == "1" timeout=5000
  act id=prop-lines-0-choices-1-set--newkey action=set_value value=right1
  act id=prop-lines-0-choices-1-set--addkey action=press
  until find("id=prop-lines-0-choices-1-set-right1").count == 1 timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 2 rows" timeout=5000
  pause 500
  act id=prop-lines-1-id action=set_value value="right"
  until find("id=prop-lines-1-id").0.value == "right" timeout=5000
  act id=prop-lines-1-speaker action=set_value value="aoi"
  until find("id=prop-lines-1-speaker").0.value == "aoi" timeout=5000
  act id=prop-lines-1-text action=set_value value="Perfect. Thank you!"
  until find("id=prop-lines-1-text").0.value == "Perfect. Thank you!" timeout=5000
  act id=prop-lines-1-clip action=set_value value="game/voice/aoi-right.wav"
  until find("id=prop-lines-1-clip").0.value == "game/voice/aoi-right.wav" timeout=5000
  act id=prop-lines-1-next action=set_value value="end"
  until find("id=prop-lines-1-next").0.value == "end" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 3 rows" timeout=5000
  pause 500
  act id=prop-lines-2-id action=set_value value="wrong"
  until find("id=prop-lines-2-id").0.value == "wrong" timeout=5000
  act id=prop-lines-2-speaker action=set_value value="aoi"
  until find("id=prop-lines-2-speaker").0.value == "aoi" timeout=5000
  act id=prop-lines-2-text action=set_value value="Oh. Well, if you say so."
  until find("id=prop-lines-2-text").0.value == "Oh. Well, if you say so." timeout=5000
  act id=prop-lines-2-clip action=set_value value="game/voice/aoi-wrong.wav"
  until find("id=prop-lines-2-clip").0.value == "game/voice/aoi-wrong.wav" timeout=5000
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] Ren's order: a Dialogue given its id, three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).
  ```steps
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="Dialogue" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Dialogue" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add dialogue" timeout=5000
  act id=field-id action=set_value value="order-2"   # the committed id
  until find("id=undo").0.name == "Undo Change id dialogue to order-2" timeout=5000
  expect find("id=inspector-id").0.name == "Node order-2"
  act id=field-name action=set_value value="Ren's order"
  until find("id=field-name").0.value == "Ren's order" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 1 row" timeout=5000
  pause 500
  act id=prop-lines-0-speaker action=set_value value="ren"
  until find("id=prop-lines-0-speaker").0.value == "ren" timeout=5000
  act id=prop-lines-0-text action=set_value value="Hi! Something cold, please? It's already warm out."
  until find("id=prop-lines-0-text").0.value == "Hi! Something cold, please? It's already warm out." timeout=5000
  act id=prop-lines-0-clip action=set_value value="game/voice/ren-ask.wav"
  until find("id=prop-lines-0-clip").0.value == "game/voice/ren-ask.wav" timeout=5000
  act id=prop-lines-0-choices--set action=press
  until find("id=prop-lines-0-choices-0").count == 1 timeout=5000
  pause 500
  act id=prop-lines-0-choices-0-id action=set_value value="chocolate"
  until find("id=prop-lines-0-choices-0-id").0.value == "chocolate" timeout=5000
  act id=prop-lines-0-choices-0-text action=set_value value="A hot chocolate."
  until find("id=prop-lines-0-choices-0-text").0.value == "A hot chocolate." timeout=5000
  act id=prop-lines-0-choices-0-to action=set_value value="wrong"
  until find("id=prop-lines-0-choices-0-to").0.value == "wrong" timeout=5000
  act id=prop-lines-0-choices-0-set--set action=press
  until find("id=prop-lines-0-choices-0-set").count == 1 timeout=5000
  act id=prop-lines-0-choices-0-set--newkey action=set_value value=ordered2
  act id=prop-lines-0-choices-0-set--addkey action=press
  until find("id=prop-lines-0-choices-0-set-ordered2").count == 1 timeout=5000
  act id=prop-lines-0-choices-0-set-ordered2 action=press
  until find("id=prop-lines-0-choices-0-set-ordered2").0.value == "1" timeout=5000
  act id=prop-lines-0-choices-0-set--newkey action=set_value value=right2
  act id=prop-lines-0-choices-0-set--addkey action=press
  until find("id=prop-lines-0-choices-0-set-right2").count == 1 timeout=5000
  act id=prop-lines-0-choices--add action=press
  until find("id=prop-lines-0-choices-1").count == 1 timeout=5000
  pause 500
  act id=prop-lines-0-choices-1-id action=set_value value="iced-tea"
  until find("id=prop-lines-0-choices-1-id").0.value == "iced-tea" timeout=5000
  act id=prop-lines-0-choices-1-text action=set_value value="An iced tea."
  until find("id=prop-lines-0-choices-1-text").0.value == "An iced tea." timeout=5000
  act id=prop-lines-0-choices-1-to action=set_value value="right"
  until find("id=prop-lines-0-choices-1-to").0.value == "right" timeout=5000
  act id=prop-lines-0-choices-1-set--set action=press
  until find("id=prop-lines-0-choices-1-set").count == 1 timeout=5000
  act id=prop-lines-0-choices-1-set--newkey action=set_value value=ordered2
  act id=prop-lines-0-choices-1-set--addkey action=press
  until find("id=prop-lines-0-choices-1-set-ordered2").count == 1 timeout=5000
  act id=prop-lines-0-choices-1-set-ordered2 action=press
  until find("id=prop-lines-0-choices-1-set-ordered2").0.value == "1" timeout=5000
  act id=prop-lines-0-choices-1-set--newkey action=set_value value=right2
  act id=prop-lines-0-choices-1-set--addkey action=press
  until find("id=prop-lines-0-choices-1-set-right2").count == 1 timeout=5000
  act id=prop-lines-0-choices-1-set-right2 action=press
  until find("id=prop-lines-0-choices-1-set-right2").0.value == "1" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 2 rows" timeout=5000
  pause 500
  act id=prop-lines-1-id action=set_value value="right"
  until find("id=prop-lines-1-id").0.value == "right" timeout=5000
  act id=prop-lines-1-speaker action=set_value value="ren"
  until find("id=prop-lines-1-speaker").0.value == "ren" timeout=5000
  act id=prop-lines-1-text action=set_value value="Lovely, thanks."
  until find("id=prop-lines-1-text").0.value == "Lovely, thanks." timeout=5000
  act id=prop-lines-1-clip action=set_value value="game/voice/ren-right.wav"
  until find("id=prop-lines-1-clip").0.value == "game/voice/ren-right.wav" timeout=5000
  act id=prop-lines-1-next action=set_value value="end"
  until find("id=prop-lines-1-next").0.value == "end" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 3 rows" timeout=5000
  pause 500
  act id=prop-lines-2-id action=set_value value="wrong"
  until find("id=prop-lines-2-id").0.value == "wrong" timeout=5000
  act id=prop-lines-2-speaker action=set_value value="ren"
  until find("id=prop-lines-2-speaker").0.value == "ren" timeout=5000
  act id=prop-lines-2-text action=set_value value="Hot? Hm. All right, then."
  until find("id=prop-lines-2-text").0.value == "Hot? Hm. All right, then." timeout=5000
  act id=prop-lines-2-clip action=set_value value="game/voice/ren-wrong.wav"
  until find("id=prop-lines-2-clip").0.value == "game/voice/ren-wrong.wav" timeout=5000
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] Yuki's order: a Dialogue given its id, three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).
  ```steps
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="Dialogue" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Dialogue" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add dialogue" timeout=5000
  act id=field-id action=set_value value="order-3"   # the committed id
  until find("id=undo").0.name == "Undo Change id dialogue to order-3" timeout=5000
  expect find("id=inspector-id").0.name == "Node order-3"
  act id=field-name action=set_value value="Yuki's order"
  until find("id=field-name").0.value == "Yuki's order" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 1 row" timeout=5000
  pause 500
  act id=prop-lines-0-speaker action=set_value value="yuki"
  until find("id=prop-lines-0-speaker").0.value == "yuki" timeout=5000
  act id=prop-lines-0-text action=set_value value="Just a green tea for me, please."
  until find("id=prop-lines-0-text").0.value == "Just a green tea for me, please." timeout=5000
  act id=prop-lines-0-clip action=set_value value="game/voice/yuki-ask.wav"
  until find("id=prop-lines-0-clip").0.value == "game/voice/yuki-ask.wav" timeout=5000
  act id=prop-lines-0-choices--set action=press
  until find("id=prop-lines-0-choices-0").count == 1 timeout=5000
  pause 500
  act id=prop-lines-0-choices-0-id action=set_value value="green-tea"
  until find("id=prop-lines-0-choices-0-id").0.value == "green-tea" timeout=5000
  act id=prop-lines-0-choices-0-text action=set_value value="Green tea, coming up."
  until find("id=prop-lines-0-choices-0-text").0.value == "Green tea, coming up." timeout=5000
  act id=prop-lines-0-choices-0-to action=set_value value="right"
  until find("id=prop-lines-0-choices-0-to").0.value == "right" timeout=5000
  act id=prop-lines-0-choices-0-set--set action=press
  until find("id=prop-lines-0-choices-0-set").count == 1 timeout=5000
  act id=prop-lines-0-choices-0-set--newkey action=set_value value=ordered3
  act id=prop-lines-0-choices-0-set--addkey action=press
  until find("id=prop-lines-0-choices-0-set-ordered3").count == 1 timeout=5000
  act id=prop-lines-0-choices-0-set-ordered3 action=press
  until find("id=prop-lines-0-choices-0-set-ordered3").0.value == "1" timeout=5000
  act id=prop-lines-0-choices-0-set--newkey action=set_value value=right3
  act id=prop-lines-0-choices-0-set--addkey action=press
  until find("id=prop-lines-0-choices-0-set-right3").count == 1 timeout=5000
  act id=prop-lines-0-choices-0-set-right3 action=press
  until find("id=prop-lines-0-choices-0-set-right3").0.value == "1" timeout=5000
  act id=prop-lines-0-choices--add action=press
  until find("id=prop-lines-0-choices-1").count == 1 timeout=5000
  pause 500
  act id=prop-lines-0-choices-1-id action=set_value value="coffee"
  until find("id=prop-lines-0-choices-1-id").0.value == "coffee" timeout=5000
  act id=prop-lines-0-choices-1-text action=set_value value="One black coffee."
  until find("id=prop-lines-0-choices-1-text").0.value == "One black coffee." timeout=5000
  act id=prop-lines-0-choices-1-to action=set_value value="wrong"
  until find("id=prop-lines-0-choices-1-to").0.value == "wrong" timeout=5000
  act id=prop-lines-0-choices-1-set--set action=press
  until find("id=prop-lines-0-choices-1-set").count == 1 timeout=5000
  act id=prop-lines-0-choices-1-set--newkey action=set_value value=ordered3
  act id=prop-lines-0-choices-1-set--addkey action=press
  until find("id=prop-lines-0-choices-1-set-ordered3").count == 1 timeout=5000
  act id=prop-lines-0-choices-1-set-ordered3 action=press
  until find("id=prop-lines-0-choices-1-set-ordered3").0.value == "1" timeout=5000
  act id=prop-lines-0-choices-1-set--newkey action=set_value value=right3
  act id=prop-lines-0-choices-1-set--addkey action=press
  until find("id=prop-lines-0-choices-1-set-right3").count == 1 timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 2 rows" timeout=5000
  pause 500
  act id=prop-lines-1-id action=set_value value="right"
  until find("id=prop-lines-1-id").0.value == "right" timeout=5000
  act id=prop-lines-1-speaker action=set_value value="yuki"
  until find("id=prop-lines-1-speaker").0.value == "yuki" timeout=5000
  act id=prop-lines-1-text action=set_value value="Thank you!"
  until find("id=prop-lines-1-text").0.value == "Thank you!" timeout=5000
  act id=prop-lines-1-clip action=set_value value="game/voice/yuki-right.wav"
  until find("id=prop-lines-1-clip").0.value == "game/voice/yuki-right.wav" timeout=5000
  act id=prop-lines-1-next action=set_value value="end"
  until find("id=prop-lines-1-next").0.value == "end" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 3 rows" timeout=5000
  pause 500
  act id=prop-lines-2-id action=set_value value="wrong"
  until find("id=prop-lines-2-id").0.value == "wrong" timeout=5000
  act id=prop-lines-2-speaker action=set_value value="yuki"
  until find("id=prop-lines-2-speaker").0.value == "yuki" timeout=5000
  act id=prop-lines-2-text action=set_value value="That's not what I said. But fine."
  until find("id=prop-lines-2-text").0.value == "That's not what I said. But fine." timeout=5000
  act id=prop-lines-2-clip action=set_value value="game/voice/yuki-wrong.wav"
  until find("id=prop-lines-2-clip").0.value == "game/voice/yuki-wrong.wav" timeout=5000
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] Each table area's tableZone, the game's own behaviour (declared by its describe), added from the Behaviours panel with its seven params: the regular, her order's dialogue and the player from node menus (the player pinned: its default), her tray's item and her flags typed, the points pinned (their default).
  ```steps
  act id=node-table-1 action=press
  until find("id=inspector-id").0.name == "Node table-1"
  act id=beh-add action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="tableZone" exact=true action=press
  pause 300
  act id=beh-add-button action=press
  until find("id=undo").0.name == "Undo Add tableZone to table-1" timeout=5000
  until find("id=beh-tableZone").count == 1 timeout=5000
  act id=beh-tableZone-customer action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="aoi" exact=true action=press
  until find("id=beh-tableZone-customer").0.value == "aoi" timeout=5000
  act id=beh-tableZone-dialogue action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="order-1" exact=true action=press
  until find("id=beh-tableZone-dialogue").0.value == "order-1" timeout=5000
  act id=beh-tableZone-item action=set_value value="6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a61"
  until find("id=beh-tableZone-item").0.value == "6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a61" timeout=5000
  act id=beh-tableZone-ordered action=set_value value="ordered1"
  until find("id=beh-tableZone-ordered").0.value == "ordered1" timeout=5000
  act id=beh-tableZone-player--pin action=press   # the value shown ("mira") written into the file
  until find("id=beh-tableZone-player--clear").count == 1 timeout=5000
  act id=beh-tableZone-points--pin action=press   # the value shown (10) written into the file
  until find("id=beh-tableZone-points--clear").count == 1 timeout=5000
  act id=beh-tableZone-right action=set_value value="right1"
  until find("id=beh-tableZone-right").0.value == "right1" timeout=5000
  act id=node-table-2 action=press
  until find("id=inspector-id").0.name == "Node table-2"
  act id=beh-add action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="tableZone" exact=true action=press
  pause 300
  act id=beh-add-button action=press
  until find("id=undo").0.name == "Undo Add tableZone to table-2" timeout=5000
  until find("id=beh-tableZone").count == 1 timeout=5000
  act id=beh-tableZone-customer action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="ren" exact=true action=press
  until find("id=beh-tableZone-customer").0.value == "ren" timeout=5000
  act id=beh-tableZone-dialogue action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="order-2" exact=true action=press
  until find("id=beh-tableZone-dialogue").0.value == "order-2" timeout=5000
  act id=beh-tableZone-item action=set_value value="6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a62"
  until find("id=beh-tableZone-item").0.value == "6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a62" timeout=5000
  act id=beh-tableZone-ordered action=set_value value="ordered2"
  until find("id=beh-tableZone-ordered").0.value == "ordered2" timeout=5000
  act id=beh-tableZone-player--pin action=press   # the value shown ("mira") written into the file
  until find("id=beh-tableZone-player--clear").count == 1 timeout=5000
  act id=beh-tableZone-points--pin action=press   # the value shown (10) written into the file
  until find("id=beh-tableZone-points--clear").count == 1 timeout=5000
  act id=beh-tableZone-right action=set_value value="right2"
  until find("id=beh-tableZone-right").0.value == "right2" timeout=5000
  act id=node-table-3 action=press
  until find("id=inspector-id").0.name == "Node table-3"
  act id=beh-add action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="tableZone" exact=true action=press
  pause 300
  act id=beh-add-button action=press
  until find("id=undo").0.name == "Undo Add tableZone to table-3" timeout=5000
  until find("id=beh-tableZone").count == 1 timeout=5000
  act id=beh-tableZone-customer action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="yuki" exact=true action=press
  until find("id=beh-tableZone-customer").0.value == "yuki" timeout=5000
  act id=beh-tableZone-dialogue action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="order-3" exact=true action=press
  until find("id=beh-tableZone-dialogue").0.value == "order-3" timeout=5000
  act id=beh-tableZone-item action=set_value value="6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a63"
  until find("id=beh-tableZone-item").0.value == "6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a63" timeout=5000
  act id=beh-tableZone-ordered action=set_value value="ordered3"
  until find("id=beh-tableZone-ordered").0.value == "ordered3" timeout=5000
  act id=beh-tableZone-player--pin action=press   # the value shown ("mira") written into the file
  until find("id=beh-tableZone-player--clear").count == 1 timeout=5000
  act id=beh-tableZone-points--pin action=press   # the value shown (10) written into the file
  until find("id=beh-tableZone-points--clear").count == 1 timeout=5000
  act id=beh-tableZone-right action=set_value value="right3"
  until find("id=beh-tableZone-right").0.value == "right3" timeout=5000
  shot "a table's tableZone"
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] Connections 1 to 13, from the Connections panel of the node that sends each (signal, target and action picked from lists, arguments by the action's schema): the rules' ready to Hana's lookAt (a node argument), each order's chose to its brew timer and Hana's playLayer (a yes / no pinned false), each brew timer's timeout to its tray's state and Hana's line.
  ```steps
  act id=node-rules action=press
  until find("id=inspector-id").0.name == "Node rules"
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="ready" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="hana-1" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="lookAt" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect rules.ready to hana-1.lookAt" timeout=5000
  until find("id=conn-0").count == 1 timeout=5000
  act id=conn-0-arg-target action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="mira" exact=true action=press
  until find("id=conn-0-arg-target").0.value == "mira" timeout=5000
  act id=node-order-1 action=press
  until find("id=inspector-id").0.name == "Node order-1"
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="chose" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="brew-1" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="start" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect order-1.chose to brew-1.start" timeout=5000
  until find("id=conn-1").count == 1 timeout=5000
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="chose" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="hana-1" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="playLayer" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect order-1.chose to hana-1.playLayer" timeout=5000
  until find("id=conn-2").count == 1 timeout=5000
  act id=conn-2-arg-layer action=set_value value="upperBody"
  until find("id=conn-2-arg-layer").0.value == "upperBody" timeout=5000
  act id=conn-2-arg-loop--pin action=press   # the value shown (false) written into the file
  until find("id=conn-2-arg-loop--clear").count == 1 timeout=5000
  act id=conn-2-arg-slot action=set_value value="use"
  until find("id=conn-2-arg-slot").0.value == "use" timeout=5000
  act id=node-brew-1 action=press
  until find("id=inspector-id").0.name == "Node brew-1"
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="timeout" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="tray-1" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="enterState" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect brew-1.timeout to tray-1.enterState" timeout=5000
  until find("id=conn-3").count == 1 timeout=5000
  act id=conn-3-arg-state action=set_value value="ready"
  until find("id=conn-3-arg-state").0.value == "ready" timeout=5000
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="timeout" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="hana-1" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="say" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect brew-1.timeout to hana-1.say" timeout=5000
  until find("id=conn-4").count == 1 timeout=5000
  act id=conn-4-arg-clip action=set_value value="game/voice/hana-up-1.wav"
  until find("id=conn-4-arg-clip").0.value == "game/voice/hana-up-1.wav" timeout=5000
  act id=conn-4-arg-text action=set_value value="Order up for table one!"
  until find("id=conn-4-arg-text").0.value == "Order up for table one!" timeout=5000
  act id=node-order-2 action=press
  until find("id=inspector-id").0.name == "Node order-2"
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="chose" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="brew-2" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="start" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect order-2.chose to brew-2.start" timeout=5000
  until find("id=conn-5").count == 1 timeout=5000
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="chose" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="hana-1" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="playLayer" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect order-2.chose to hana-1.playLayer" timeout=5000
  until find("id=conn-6").count == 1 timeout=5000
  act id=conn-6-arg-layer action=set_value value="upperBody"
  until find("id=conn-6-arg-layer").0.value == "upperBody" timeout=5000
  act id=conn-6-arg-loop--pin action=press   # the value shown (false) written into the file
  until find("id=conn-6-arg-loop--clear").count == 1 timeout=5000
  act id=conn-6-arg-slot action=set_value value="use"
  until find("id=conn-6-arg-slot").0.value == "use" timeout=5000
  act id=node-brew-2 action=press
  until find("id=inspector-id").0.name == "Node brew-2"
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="timeout" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="tray-2" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="enterState" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect brew-2.timeout to tray-2.enterState" timeout=5000
  until find("id=conn-7").count == 1 timeout=5000
  act id=conn-7-arg-state action=set_value value="ready"
  until find("id=conn-7-arg-state").0.value == "ready" timeout=5000
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="timeout" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="hana-1" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="say" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect brew-2.timeout to hana-1.say" timeout=5000
  until find("id=conn-8").count == 1 timeout=5000
  act id=conn-8-arg-clip action=set_value value="game/voice/hana-up-2.wav"
  until find("id=conn-8-arg-clip").0.value == "game/voice/hana-up-2.wav" timeout=5000
  act id=conn-8-arg-text action=set_value value="Order up for table two!"
  until find("id=conn-8-arg-text").0.value == "Order up for table two!" timeout=5000
  act id=node-order-3 action=press
  until find("id=inspector-id").0.name == "Node order-3"
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="chose" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="brew-3" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="start" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect order-3.chose to brew-3.start" timeout=5000
  until find("id=conn-9").count == 1 timeout=5000
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="chose" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="hana-1" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="playLayer" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect order-3.chose to hana-1.playLayer" timeout=5000
  until find("id=conn-10").count == 1 timeout=5000
  act id=conn-10-arg-layer action=set_value value="upperBody"
  until find("id=conn-10-arg-layer").0.value == "upperBody" timeout=5000
  act id=conn-10-arg-loop--pin action=press   # the value shown (false) written into the file
  until find("id=conn-10-arg-loop--clear").count == 1 timeout=5000
  act id=conn-10-arg-slot action=set_value value="use"
  until find("id=conn-10-arg-slot").0.value == "use" timeout=5000
  act id=node-brew-3 action=press
  until find("id=inspector-id").0.name == "Node brew-3"
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="timeout" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="tray-3" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="enterState" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect brew-3.timeout to tray-3.enterState" timeout=5000
  until find("id=conn-11").count == 1 timeout=5000
  act id=conn-11-arg-state action=set_value value="ready"
  until find("id=conn-11-arg-state").0.value == "ready" timeout=5000
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="timeout" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="hana-1" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="say" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect brew-3.timeout to hana-1.say" timeout=5000
  until find("id=conn-12").count == 1 timeout=5000
  act id=conn-12-arg-clip action=set_value value="game/voice/hana-up-3.wav"
  until find("id=conn-12-arg-clip").0.value == "game/voice/hana-up-3.wav" timeout=5000
  act id=conn-12-arg-text action=set_value value="Order up for table three!"
  until find("id=conn-12-arg-text").0.value == "Order up for table three!" timeout=5000
  expect find("id=connections").count == 1
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] Connections 14 to 19: the serve goal to the till and Hana, the till's verb to setFlag, the till goal to the score (a number), won and lost to changeScene (a delay and a scene); the level's 19 connections, in order.
  ```steps
  act id=node-serve action=press
  until find("id=inspector-id").0.name == "Node serve"
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="completed" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="till" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="enterState" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect serve.completed to till.enterState" timeout=5000
  until find("id=conn-13").count == 1 timeout=5000
  act id=conn-13-arg-state action=set_value value="open"
  until find("id=conn-13-arg-state").0.value == "open" timeout=5000
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="completed" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="hana-1" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="say" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect serve.completed to hana-1.say" timeout=5000
  until find("id=conn-14").count == 1 timeout=5000
  act id=conn-14-arg-clip action=set_value value="game/voice/hana-close.wav"
  until find("id=conn-14-arg-clip").0.value == "game/voice/hana-close.wav" timeout=5000
  act id=conn-14-arg-text action=set_value value="That's everyone! Close the till, Mira."
  until find("id=conn-14-arg-text").0.value == "That's everyone! Close the till, Mira." timeout=5000
  act id=node-till action=press
  until find("id=inspector-id").0.name == "Node till"
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="verb" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="setFlag" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect till.verb to rules.setFlag" timeout=5000
  until find("id=conn-15").count == 1 timeout=5000
  act id=conn-15-arg-flag action=set_value value="tillClosed"
  until find("id=conn-15-arg-flag").0.value == "tillClosed" timeout=5000
  act id=node-close-till action=press
  until find("id=inspector-id").0.name == "Node close-till"
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="completed" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="score" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="add" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect close-till.completed to score.add" timeout=5000
  until find("id=conn-16").count == 1 timeout=5000
  act id=conn-16-arg-by action=set_value value="20"
  until find("id=conn-16-arg-by").0.value == "20" timeout=5000
  act id=node-rules action=press
  until find("id=inspector-id").0.name == "Node rules"
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="won" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="changeScene" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect rules.won to rules.changeScene" timeout=5000
  until find("id=conn-17").count == 1 timeout=5000
  act id=conn-17-arg-after action=set_value value="3"
  until find("id=conn-17-arg-after").0.value == "3" timeout=5000
  act id=conn-17-arg-to action=set_value value="game/won.vrmxs"
  until find("id=conn-17-arg-to").0.value == "game/won.vrmxs" timeout=5000
  act id=conn-new-signal action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="lost" exact=true action=press
  pause 300
  act id=conn-new-to action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  pause 300
  act id=conn-new-call action=focus
  pause 300
  keys down   # opens the select's menu
  act surface=app role=menuitem name="changeScene" exact=true action=press
  pause 300
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect rules.lost to rules.changeScene" timeout=5000
  until find("id=conn-18").count == 1 timeout=5000
  act id=conn-18-arg-after action=set_value value="3"
  until find("id=conn-18-arg-after").0.value == "3" timeout=5000
  act id=conn-18-arg-to action=set_value value="game/lost.vrmxs"
  until find("id=conn-18-arg-to").0.value == "game/lost.vrmxs" timeout=5000
  expect find("id=connections").count == 1
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] A door prefab placed from the assets panel; a prop of its hinge overridden in the inspector, marked as an override (the dot, the Overrides list), reverted by its dot; the door taken out again with Undo, so the level is as committed.
  ```steps
  act id=assets-search action=set_value value=door
  until find("id=add-prefabs-door-vrmxs").count == 1 timeout=10000
  act id=add-prefabs-door-vrmxs action=press   # the sample's own door prefab
  until find("id=undo").0.name == "Undo Add door" timeout=10000
  until find("id=node-door").0.name contains "inside" timeout=10000   # built: its prefab nodes are in the tree
  act id=fold-door action=press
  until find("id=node-door/hinge").count == 1
  act id=node-door/hinge action=press
  until find("id=inspector-inner").count == 1   # the inspector edits a prefab node, as overrides
  expect find("id=prop-mass").0.value == "12"   # the prefab's own mass
  expect find("id=ov-mass").count == 0   # not overridden: no mark
  act id=prop-mass action=set_value value=20
  until find("id=undo").0.name == "Undo Override door/hinge.mass" timeout=5000   # one undo step, an override
  expect find("id=ov-mass").0.name == "mass overrides the prefab (prefab: 12): revert"   # the mark, with the prefab's value
  expect find("id=node-door").0.name contains "overridden"   # the tree marks the instance
  shot "the door's hinge mass overridden"
  act id=ov-mass action=press   # the dot reverts
  until find("id=ov-mass").count == 0
  expect find("id=prop-mass").0.value == "12"
  expect find("id=undo").0.name == "Undo Revert door/hinge.mass"
  act id=undo action=press
  until find("id=ov-mass").count == 1   # Undo brings the override back
  act id=undo action=press
  until find("id=ov-mass").count == 0
  act id=undo action=press   # and the door goes
  until find("id=node-door").count == 0 timeout=5000
  act id=assets-search action=set_value value=" "
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] Saved, and read back from disk the same bytes, valid; the file is what rush-level.mjs compares with the committed level, byte for byte.
  ```steps
  act id=save action=press
  until find("id=saved").0.name matches "^Saved game/rush-built.vrmxs · [0-9]+ bytes · [0-9a-f]{16}$" timeout=20000
  act id=verify action=press
  until find("id=verify-result").0.name == "Reopened game/rush-built.vrmxs: same bytes as saved, valid" timeout=30000
  expect find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs 48 nodes saved valid "
  shot "the level built"
  ```
