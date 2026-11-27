# The second game, "After Hours", built in the editor from New Project to Export Game (M6 W10): AppProbe scenario, WebGL forced

**Written by `acceptance/m6/after-hours-scenario.mjs` from `content/sample/tools/after-hours-plan.mjs`: edit those, not this.**
Run `apps/editor-mac/scripts/build.sh`, launch the app once (its container must exist), then
`apps/editor-mac/scripts/hand-test-fixtures-m6-after-hours.sh` (empty `w10-projects/` and `w10-builds/` in the editor's
container, its own settings and caches), then start the files helper beside the scenario
(`node apps/editor-mac/scripts/after-hours-files.mjs`, which waits for row 2's trigger screenshot), then, holding the GPU
lock, `appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M6-AFTER-HOURS.scenario.md`, and last
`node acceptance/m6/after-hours-compare.mjs <container>/tmp/w10-projects/After\ Hours <container>/tmp/w10-builds/after-hours`.
No row types JSON. Every row ends by holding the app's scene hash to the one the editor's own session gives for the
plan at that point; each scene's last row wants the committed file's size and hash.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M6-AFTER-HOURS.md
env: {"VRMXG_QUERY": "renderer=webgl", "VRMXG_SHELL_NEW_PROJECT": "w10-projects/", "VRMXG_SHELL_BUILD": "w10-builds/", "VRMXG_SHELL_SETTINGS": "w10-ah-settings.json", "VRMXG_SHELL_CACHE": "w10-ah-cache-webgl"}
fresh: false
```

- [ ] File › New Project… makes a game from "One level", named "After Hours": made in a new folder and opened on the template's level.
  ```steps
  wait id=new-project-open enabled=true timeout_ms=40000
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved" timeout=60000   # the bundled sample first
  menu "File › New Project…" press
  wait id=new-project timeout_ms=10000
  expect find("id=template-level").0.value == "1"   # the level template is chosen by default
  act id=new-project-title action=set_value value="After Hours"
  until find("id=new-project-id").0.value == "after-hours"   # the id follows the title
  act id=new-project-create action=press
  wait id=new-project gone=true timeout_ms=30000
  until find("id=doc-state").0.name matches "^Scene level.vrmxs [0-9]+ nodes saved valid" timeout=60000
  expect find("id=project-name").0.name == "Project After Hours"
  expect find("role=alert").count == 0
  expect find("id=renderer").0.name == "Renderer WebGL"
  ```

- [ ] The game's own files come in from outside the app, as a builder copies them into the project's folder: the shelf behaviour written by hand, the lost things, the starter content's shelf, the back room, the sample's door and switch, a licence row for each; File › Open Recent reopens the project and the assets panel lists them.
  ```steps
  screenshot path=/tmp/vrmxg-w10-after-hours/bring-files.png   # the trigger: after-hours-files.mjs copies the files in
  pause 4000
  menu "File › Open Recent › After Hours" press
  until find("id=project-name").0.name == "Project After Hours" timeout=30000
  until find("id=doc-state").0.name matches "^Scene level.vrmxs [0-9]+ nodes saved valid" timeout=60000
  act id=assets-search action=set_value value=scarf
  until find("id=asset-after-hours-items-scarf-vrmxi").count == 1 timeout=15000   # after-hours/items/scarf.vrmxi is in the project
  act id=assets-search action=set_value value=shelf
  until find("id=asset-after-hours-items-shelf-vrmxi").count == 1 timeout=15000   # after-hours/items/shelf.vrmxi is in the project
  act id=assets-search action=set_value value=back-room
  until find("id=asset-after-hours-props-back-room-glb").count == 1 timeout=15000   # after-hours/props/back-room.glb is in the project
  act id=assets-search action=set_value value=switch
  until find("id=asset-items-switch-vrmxi").count == 1 timeout=15000   # items/switch.vrmxi is in the project
  act id=assets-search action=set_value value=" "   # a space: the whole list again
  ```

- [ ] Project Settings: the behaviours module is the hand-written after-hours/behaviours.js, one undo step written to game.json; the project opened again loads it, so the inspector knows the shelf by its describe.
  ```steps
  menu "File › Project Settings…" press
  wait id=project-settings timeout_ms=10000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=settings-behaviours action=focus
  pause 400
  until find("surface=app role=menuitem name='after-hours/behaviours.js' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="after-hours/behaviours.js" exact=true action=press
  until find("id=settings-behaviours").0.value == "after-hours/behaviours.js" timeout=5000
  until find("id=settings-undo").0.name == "Undo Behaviours after-hours/behaviours.js" timeout=5000   # one step, named for what it did
  act id=settings-done action=press
  wait id=project-settings gone=true timeout_ms=5000
  menu "File › Open Recent › After Hours" press
  until find("id=project-name").0.name == "Project After Hours" timeout=30000
  until find("id=doc-state").0.name matches "^Scene level.vrmxs [0-9]+ nodes saved valid" timeout=60000
  expect find("role=alert").count == 0   # the module loaded and its declaration was taken
  ```

- [ ] The level: New with its file name (after-hours/level.vrmxs), its root named; the environment at night (a gradient sky by its colour wells), the cafe and the back room from the assets panel, the moonlight, the counter lamp and the back room's bulb (colours, turns, numbers), the room tone.
  ```steps
  act id=file-name action=set_value value=after-hours/level.vrmxs
  act id=new-scene action=press
  until find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 1 nodes " timeout=20000
  act id=node-root action=press
  until find("id=inspector-id").0.name == "Node root"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Level"
  until find("id=field-name").0.value == "Level" timeout=5000
  until find("id=undo").0.name == "Undo Rename root" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Environment' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Environment" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Environment" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add environment" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 2 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="env"   # the plan's id
  until find("id=undo").0.name == "Undo Change id environment to env" timeout=5000
  expect find("id=inspector-id").0.name == "Node env"
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-background action=focus
  pause 400
  until find("surface=app role=menuitem name='gradient' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="gradient" exact=true action=press
  until find("id=prop-background").0.value == "gradient" timeout=5000
  act id=prop-skyTopColor--hex action=set_value value="#141a2e"   # the colour, as hex
  until find("id=prop-skyTopColor--hex").0.value == "#141a2e" timeout=5000
  act id=prop-skyHorizonColor--hex action=set_value value="#3a4258"   # the colour, as hex
  until find("id=prop-skyHorizonColor--hex").0.value == "#3a4258" timeout=5000
  act id=prop-environmentIntensity action=set_value value="0.2"
  until find("id=prop-environmentIntensity").0.value == "0.2" timeout=5000
  act id=prop-ambientIntensity action=set_value value="0.35"
  until find("id=prop-ambientIntensity").0.value == "0.35" timeout=5000
  act id=prop-exposure action=set_value value="0.9"
  until find("id=prop-exposure").0.value == "0.9" timeout=5000
  act id=assets-search action=set_value value=cafe   # the panel narrowed to this file
  until find("id=asset-sets-cafe-glb").count == 1 timeout=10000
  act id=add-sets-cafe-glb action=press
  until find("id=undo").0.name == "Undo Add cafe" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 3 nodes "   # one node added, not two
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=assets-search action=set_value value=back-room   # the panel narrowed to this file
  until find("id=asset-after-hours-props-back-room-glb").count == 1 timeout=10000
  act id=add-after-hours-props-back-room-glb action=press
  until find("id=undo").0.name == "Undo Add back-room" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 4 nodes "   # one node added, not two
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Back room"
  until find("id=field-name").0.value == "Back room" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='DirectionalLight' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="DirectionalLight" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "DirectionalLight" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add directionallight" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 5 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="moon"   # the plan's id
  until find("id=undo").0.name == "Undo Change id directionallight to moon" timeout=5000
  expect find("id=inspector-id").0.name == "Node moon"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Moonlight"
  until find("id=field-name").0.value == "Moonlight" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=rot-x action=set_value value="-50"
  until find("id=rot-x").0.value == "-50" timeout=5000
  act id=rot-y action=set_value value="40"
  until find("id=rot-y").0.value == "40" timeout=5000
  act id=prop-color--hex action=set_value value="#b9c6ff"   # the colour, as hex
  until find("id=prop-color--hex").0.value == "#b9c6ff" timeout=5000
  act id=prop-intensity action=set_value value="0.7"
  until find("id=prop-intensity").0.value == "0.7" timeout=5000
  act id=prop-shadowExtent action=set_value value="10"
  until find("id=prop-shadowExtent").0.value == "10" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-shadowPreset action=focus
  pause 400
  until find("surface=app role=menuitem name='high' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="high" exact=true action=press
  until find("id=prop-shadowPreset").0.value == "high" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='SpotLight' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="SpotLight" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "SpotLight" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add spotlight" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 6 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="counter-lamp"   # the plan's id
  until find("id=undo").0.name == "Undo Change id spotlight to counter-lamp" timeout=5000
  expect find("id=inspector-id").0.name == "Node counter-lamp"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Counter lamp"
  until find("id=field-name").0.value == "Counter lamp" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="2.9"
  until find("id=pos-y").0.value == "2.9" timeout=5000
  act id=pos-z action=set_value value="-3.2"
  until find("id=pos-z").0.value == "-3.2" timeout=5000
  act id=rot-x action=set_value value="-80"
  until find("id=rot-x").0.value == "-80" timeout=5000
  act id=prop-color--hex action=set_value value="#ffd59a"   # the colour, as hex
  until find("id=prop-color--hex").0.value == "#ffd59a" timeout=5000
  act id=prop-intensity action=set_value value="16"
  until find("id=prop-intensity").0.value == "16" timeout=5000
  act id=prop-range action=set_value value="7"
  until find("id=prop-range").0.value == "7" timeout=5000
  act id=prop-angle action=set_value value="40"
  until find("id=prop-angle").0.value == "40" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='PointLight' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="PointLight" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "PointLight" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add pointlight" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 7 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="back-room-bulb"   # the plan's id
  until find("id=undo").0.name == "Undo Change id pointlight to back-room-bulb" timeout=5000
  expect find("id=inspector-id").0.name == "Node back-room-bulb"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Back room bulb"
  until find("id=field-name").0.value == "Back room bulb" timeout=5000
  act id=pos-x action=set_value value="7.8"
  until find("id=pos-x").0.value == "7.8" timeout=5000
  act id=pos-y action=set_value value="2.5"
  until find("id=pos-y").0.value == "2.5" timeout=5000
  act id=pos-z action=set_value value="-3"
  until find("id=pos-z").0.value == "-3" timeout=5000
  act id=prop-color--hex action=set_value value="#ffe2b0"   # the colour, as hex
  until find("id=prop-color--hex").0.value == "#ffe2b0" timeout=5000
  act id=prop-intensity action=set_value value="5"
  until find("id=prop-intensity").0.value == "5" timeout=5000
  act id=prop-range action=set_value value="6"
  until find("id=prop-range").0.value == "6" timeout=5000
  act id=assets-search action=set_value value=cafe-ambience   # the panel narrowed to this file
  until find("id=asset-sounds-cafe-ambience-wav").count == 1 timeout=10000
  act id=add-sounds-cafe-ambience-wav action=press
  until find("id=undo").0.name == "Undo Add cafe-ambience" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 8 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="ambience"   # the plan's id
  until find("id=undo").0.name == "Undo Change id cafe-ambience to ambience" timeout=5000
  expect find("id=inspector-id").0.name == "Node ambience"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Room tone"
  until find("id=field-name").0.value == "Room tone" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-autoplay action=press
  until find("id=prop-autoplay").0.value == "1" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-bus action=focus
  pause 400
  until find("surface=app role=menuitem name='ambience' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="ambience" exact=true action=press
  until find("id=prop-bus").0.value == "ambience" timeout=5000
  act id=prop-loop action=press
  until find("id=prop-loop").0.value == "1" timeout=5000
  act id=prop-volume action=set_value value="0.4"
  until find("id=prop-volume").0.value == "0.4" timeout=5000
  until find("id=doc-state").0.name matches " hash 16e98560d1d45340$" timeout=10000   # the scene so far is what the editor's session makes of the plan
  ```

- [ ] The doors and the switch from the assets panel (the front doors and the staff door locked, the staff door and the switch turned to their walls), the four starter shelves.
  ```steps
  act id=assets-search action=set_value value=cafe-door   # the panel narrowed to this file
  until find("id=asset-items-cafe-door-vrmxi").count == 1 timeout=10000
  act id=add-items-cafe-door-vrmxi action=press
  until find("id=undo").0.name == "Undo Add cafe-door" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 9 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="front-left"   # the plan's id
  until find("id=undo").0.name == "Undo Change id cafe-door to front-left" timeout=5000
  expect find("id=inspector-id").0.name == "Node front-left"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Front door (left)"
  until find("id=field-name").0.value == "Front door (left)" timeout=5000
  act id=pos-x action=set_value value="-0.5"
  until find("id=pos-x").0.value == "-0.5" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="6.1"
  until find("id=pos-z").0.value == "6.1" timeout=5000
  act id=prop-state action=focus
  pause 250
  act id=prop-state action=set_value value="locked"
  until find("id=prop-state").0.value == "locked" timeout=5000
  act id=assets-search action=set_value value=cafe-door   # the panel narrowed to this file
  until find("id=asset-items-cafe-door-vrmxi").count == 1 timeout=10000
  act id=add-items-cafe-door-vrmxi action=press
  until find("id=undo").0.name == "Undo Add cafe-door" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 10 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="front-right"   # the plan's id
  until find("id=undo").0.name == "Undo Change id cafe-door to front-right" timeout=5000
  expect find("id=inspector-id").0.name == "Node front-right"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Front door (right)"
  until find("id=field-name").0.value == "Front door (right)" timeout=5000
  act id=pos-x action=set_value value="0.5"
  until find("id=pos-x").0.value == "0.5" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="6.1"
  until find("id=pos-z").0.value == "6.1" timeout=5000
  act id=rot-y action=set_value value="180"
  until find("id=rot-y").0.value == "180" timeout=5000
  act id=prop-state action=focus
  pause 250
  act id=prop-state action=set_value value="locked"
  until find("id=prop-state").0.value == "locked" timeout=5000
  act id=assets-search action=set_value value=cafe-door   # the panel narrowed to this file
  until find("id=asset-items-cafe-door-vrmxi").count == 1 timeout=10000
  act id=add-items-cafe-door-vrmxi action=press
  until find("id=undo").0.name == "Undo Add cafe-door" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 11 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="staff-door"   # the plan's id
  until find("id=undo").0.name == "Undo Change id cafe-door to staff-door" timeout=5000
  expect find("id=inspector-id").0.name == "Node staff-door"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Staff door"
  until find("id=field-name").0.value == "Staff door" timeout=5000
  act id=pos-x action=set_value value="6.1"
  until find("id=pos-x").0.value == "6.1" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="-3"
  until find("id=pos-z").0.value == "-3" timeout=5000
  act id=rot-y action=set_value value="90"
  until find("id=rot-y").0.value == "90" timeout=5000
  act id=prop-state action=focus
  pause 250
  act id=prop-state action=set_value value="locked"
  until find("id=prop-state").0.value == "locked" timeout=5000
  act id=assets-search action=set_value value=switch   # the panel narrowed to this file
  until find("id=asset-items-switch-vrmxi").count == 1 timeout=10000
  act id=add-items-switch-vrmxi action=press
  until find("id=undo").0.name == "Undo Add switch" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 12 nodes "   # one node added, not two
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Back room switch"
  until find("id=field-name").0.value == "Back room switch" timeout=5000
  act id=pos-x action=set_value value="5.95"
  until find("id=pos-x").0.value == "5.95" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="-4.2"
  until find("id=pos-z").0.value == "-4.2" timeout=5000
  act id=rot-y action=set_value value="-90"
  until find("id=rot-y").0.value == "-90" timeout=5000
  act id=assets-search action=set_value value=shelf   # the panel narrowed to this file
  until find("id=asset-after-hours-items-shelf-vrmxi").count == 1 timeout=10000
  act id=add-after-hours-items-shelf-vrmxi action=press
  until find("id=undo").0.name == "Undo Add shelf" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 13 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="shelf-coats"   # the plan's id
  until find("id=undo").0.name == "Undo Change id shelf to shelf-coats" timeout=5000
  expect find("id=inspector-id").0.name == "Node shelf-coats"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Coats and scarves"
  until find("id=field-name").0.value == "Coats and scarves" timeout=5000
  act id=pos-x action=set_value value="-5.82"
  until find("id=pos-x").0.value == "-5.82" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="3.5"
  until find("id=pos-z").0.value == "3.5" timeout=5000
  act id=rot-y action=set_value value="90"
  until find("id=rot-y").0.value == "90" timeout=5000
  act id=assets-search action=set_value value=shelf   # the panel narrowed to this file
  until find("id=asset-after-hours-items-shelf-vrmxi").count == 1 timeout=10000
  act id=add-after-hours-items-shelf-vrmxi action=press
  until find("id=undo").0.name == "Undo Add shelf" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 14 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="shelf-phones"   # the plan's id
  until find("id=undo").0.name == "Undo Change id shelf to shelf-phones" timeout=5000
  expect find("id=inspector-id").0.name == "Node shelf-phones"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Phones and keys"
  until find("id=field-name").0.value == "Phones and keys" timeout=5000
  act id=pos-x action=set_value value="4.2"
  until find("id=pos-x").0.value == "4.2" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="-5.82"
  until find("id=pos-z").0.value == "-5.82" timeout=5000
  act id=assets-search action=set_value value=shelf   # the panel narrowed to this file
  until find("id=asset-after-hours-items-shelf-vrmxi").count == 1 timeout=10000
  act id=add-after-hours-items-shelf-vrmxi action=press
  until find("id=undo").0.name == "Undo Add shelf" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 15 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="shelf-books"   # the plan's id
  until find("id=undo").0.name == "Undo Change id shelf to shelf-books" timeout=5000
  expect find("id=inspector-id").0.name == "Node shelf-books"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Books"
  until find("id=field-name").0.value == "Books" timeout=5000
  act id=pos-x action=set_value value="-5.82"
  until find("id=pos-x").0.value == "-5.82" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="-3.2"
  until find("id=pos-z").0.value == "-3.2" timeout=5000
  act id=rot-y action=set_value value="90"
  until find("id=rot-y").0.value == "90" timeout=5000
  act id=assets-search action=set_value value=shelf   # the panel narrowed to this file
  until find("id=asset-after-hours-items-shelf-vrmxi").count == 1 timeout=10000
  act id=add-after-hours-items-shelf-vrmxi action=press
  until find("id=undo").0.name == "Undo Add shelf" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 16 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="shelf-store"   # the plan's id
  until find("id=undo").0.name == "Undo Change id shelf to shelf-store" timeout=5000
  expect find("id=inspector-id").0.name == "Node shelf-store"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Store shelf"
  until find("id=field-name").0.value == "Store shelf" timeout=5000
  act id=pos-x action=set_value value="8"
  until find("id=pos-x").0.value == "8" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="-5.02"
  until find("id=pos-z").0.value == "-5.02" timeout=5000
  until find("id=doc-state").0.name matches " hash 0410d357d30c39d3$" timeout=10000   # the scene so far is what the editor's session makes of the plan
  ```

- [ ] The three lost things where they were left (two on tables, turned; the book on the back room's shelf), and each again on its own shelf, out of sight (state away).
  ```steps
  act id=assets-search action=set_value value=scarf   # the panel narrowed to this file
  until find("id=asset-after-hours-items-scarf-vrmxi").count == 1 timeout=10000
  act id=add-after-hours-items-scarf-vrmxi action=press
  until find("id=undo").0.name == "Undo Add scarf" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 17 nodes "   # one node added, not two
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Scarf"
  until find("id=field-name").0.value == "Scarf" timeout=5000
  act id=pos-x action=set_value value="-3"
  until find("id=pos-x").0.value == "-3" timeout=5000
  act id=pos-y action=set_value value="0.775"
  until find("id=pos-y").0.value == "0.775" timeout=5000
  act id=pos-z action=set_value value="1"
  until find("id=pos-z").0.value == "1" timeout=5000
  act id=rot-y action=set_value value="30"
  until find("id=rot-y").0.value == "30" timeout=5000
  act id=assets-search action=set_value value=phone   # the panel narrowed to this file
  until find("id=asset-after-hours-items-phone-vrmxi").count == 1 timeout=10000
  act id=add-after-hours-items-phone-vrmxi action=press
  until find("id=undo").0.name == "Undo Add phone" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 18 nodes "   # one node added, not two
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Phone"
  until find("id=field-name").0.value == "Phone" timeout=5000
  act id=pos-x action=set_value value="3"
  until find("id=pos-x").0.value == "3" timeout=5000
  act id=pos-y action=set_value value="0.775"
  until find("id=pos-y").0.value == "0.775" timeout=5000
  act id=pos-z action=set_value value="-2"
  until find("id=pos-z").0.value == "-2" timeout=5000
  act id=rot-y action=set_value value="-20"
  until find("id=rot-y").0.value == "-20" timeout=5000
  act id=assets-search action=set_value value=book   # the panel narrowed to this file
  until find("id=asset-after-hours-items-book-vrmxi").count == 1 timeout=10000
  act id=add-after-hours-items-book-vrmxi action=press
  until find("id=undo").0.name == "Undo Add book" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 19 nodes "   # one node added, not two
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Book"
  until find("id=field-name").0.value == "Book" timeout=5000
  act id=pos-x action=set_value value="7.75"
  until find("id=pos-x").0.value == "7.75" timeout=5000
  act id=pos-y action=set_value value="1.165"
  until find("id=pos-y").0.value == "1.165" timeout=5000
  act id=pos-z action=set_value value="-5.02"
  until find("id=pos-z").0.value == "-5.02" timeout=5000
  act id=assets-search action=set_value value=scarf   # the panel narrowed to this file
  until find("id=asset-after-hours-items-scarf-vrmxi").count == 1 timeout=10000
  act id=add-after-hours-items-scarf-vrmxi action=press
  until find("id=undo").0.name == "Undo Add scarf-2" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 20 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="scarf-shelved"   # the plan's id
  until find("id=undo").0.name == "Undo Change id scarf-2 to scarf-shelved" timeout=5000
  expect find("id=inspector-id").0.name == "Node scarf-shelved"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Scarf (on its shelf)"
  until find("id=field-name").0.value == "Scarf (on its shelf)" timeout=5000
  act id=pos-x action=set_value value="-5.82"
  until find("id=pos-x").0.value == "-5.82" timeout=5000
  act id=pos-y action=set_value value="0.615"
  until find("id=pos-y").0.value == "0.615" timeout=5000
  act id=pos-z action=set_value value="3.3"
  until find("id=pos-z").0.value == "3.3" timeout=5000
  act id=rot-y action=set_value value="90"
  until find("id=rot-y").0.value == "90" timeout=5000
  act id=prop-state action=focus
  pause 250
  act id=prop-state action=set_value value="away"
  until find("id=prop-state").0.value == "away" timeout=5000
  act id=assets-search action=set_value value=phone   # the panel narrowed to this file
  until find("id=asset-after-hours-items-phone-vrmxi").count == 1 timeout=10000
  act id=add-after-hours-items-phone-vrmxi action=press
  until find("id=undo").0.name == "Undo Add phone-2" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 21 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="phone-shelved"   # the plan's id
  until find("id=undo").0.name == "Undo Change id phone-2 to phone-shelved" timeout=5000
  expect find("id=inspector-id").0.name == "Node phone-shelved"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Phone (on its shelf)"
  until find("id=field-name").0.value == "Phone (on its shelf)" timeout=5000
  act id=pos-x action=set_value value="4.4"
  until find("id=pos-x").0.value == "4.4" timeout=5000
  act id=pos-y action=set_value value="0.615"
  until find("id=pos-y").0.value == "0.615" timeout=5000
  act id=pos-z action=set_value value="-5.82"
  until find("id=pos-z").0.value == "-5.82" timeout=5000
  act id=prop-state action=focus
  pause 250
  act id=prop-state action=set_value value="away"
  until find("id=prop-state").0.value == "away" timeout=5000
  act id=assets-search action=set_value value=book   # the panel narrowed to this file
  until find("id=asset-after-hours-items-book-vrmxi").count == 1 timeout=10000
  act id=add-after-hours-items-book-vrmxi action=press
  until find("id=undo").0.name == "Undo Add book-2" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 22 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="book-shelved"   # the plan's id
  until find("id=undo").0.name == "Undo Change id book-2 to book-shelved" timeout=5000
  expect find("id=inspector-id").0.name == "Node book-shelved"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Book (on its shelf)"
  until find("id=field-name").0.value == "Book (on its shelf)" timeout=5000
  act id=pos-x action=set_value value="-5.82"
  until find("id=pos-x").0.value == "-5.82" timeout=5000
  act id=pos-y action=set_value value="0.615"
  until find("id=pos-y").0.value == "0.615" timeout=5000
  act id=pos-z action=set_value value="-3.4"
  until find("id=pos-z").0.value == "-3.4" timeout=5000
  act id=rot-y action=set_value value="90"
  until find("id=rot-y").0.value == "90" timeout=5000
  act id=prop-state action=focus
  pause 250
  act id=prop-state action=set_value value="away"
  until find("id=prop-state").0.value == "away" timeout=5000
  until find("id=doc-state").0.name matches " hash 43904d5275c0fedd$" timeout=10000   # the scene so far is what the editor's session makes of the plan
  ```

- [ ] Mira with the player behaviour (the Behaviours panel), Hana behind the counter, the camera over the room aimed at its marker.
  ```steps
  act id=assets-search action=set_value value=mira   # the panel narrowed to this file
  until find("id=asset-characters-mira-vrmxa").count == 1 timeout=10000
  act id=add-characters-mira-vrmxa action=press
  until find("id=undo").0.name == "Undo Add mira" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 23 nodes "   # one node added, not two
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Mira"
  until find("id=field-name").0.value == "Mira" timeout=5000
  act id=pos-x action=set_value value="1"
  until find("id=pos-x").0.value == "1" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="-2.6"
  until find("id=pos-z").0.value == "-2.6" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=beh-add action=focus
  pause 400
  until find("surface=app role=menuitem name='player' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="player" exact=true action=press
  pause 600
  act id=beh-add-button action=press
  until find("id=undo").0.name == "Undo Add player to mira" timeout=5000
  until find("id=beh-player").count == 1 timeout=5000
  act id=assets-search action=set_value value=hana   # the panel narrowed to this file
  until find("id=asset-characters-hana-vrmxa").count == 1 timeout=10000
  act id=add-characters-hana-vrmxa action=press
  until find("id=undo").0.name == "Undo Add hana" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 24 nodes "   # one node added, not two
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Hana"
  until find("id=field-name").0.value == "Hana" timeout=5000
  act id=pos-x action=set_value value="0.6"
  until find("id=pos-x").0.value == "0.6" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="-4.95"
  until find("id=pos-z").0.value == "-4.95" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-controller action=focus
  pause 400
  until find("surface=app role=menuitem name='npc' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="npc" exact=true action=press
  until find("id=prop-controller").0.value == "npc" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Marker' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Marker" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Marker" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add marker" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 25 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="look-at"   # the plan's id
  until find("id=undo").0.name == "Undo Change id marker to look-at" timeout=5000
  expect find("id=inspector-id").0.name == "Node look-at"
  act id=pos-x action=set_value value="1.6"
  until find("id=pos-x").0.value == "1.6" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="-0.8"
  until find("id=pos-z").0.value == "-0.8" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Camera' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Camera" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Camera" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add camera" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 26 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="cam"   # the plan's id
  until find("id=undo").0.name == "Undo Change id camera to cam" timeout=5000
  expect find("id=inspector-id").0.name == "Node cam"
  act id=pos-x action=set_value value="1.6"
  until find("id=pos-x").0.value == "1.6" timeout=5000
  act id=pos-y action=set_value value="10.5"
  until find("id=pos-y").0.value == "10.5" timeout=5000
  act id=pos-z action=set_value value="8.2"
  until find("id=pos-z").0.value == "8.2" timeout=5000
  act id=prop-focalLength action=set_value value="20"
  until find("id=prop-focalLength").0.value == "20" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-preset action=focus
  pause 400
  until find("surface=app role=menuitem name='fixed' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="fixed" exact=true action=press
  until find("id=prop-preset").0.value == "fixed" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-target action=focus
  pause 400
  until find("surface=app role=menuitem name='look-at' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="look-at" exact=true action=press
  until find("id=prop-target").0.value == "look-at" timeout=5000
  until find("id=doc-state").0.name matches " hash f374f8d3a509faa7$" timeout=10000   # the scene so far is what the editor's session makes of the plan
  ```

- [ ] The shelves' areas, each with the game's own shelf behaviour from the Behaviours panel and the item that belongs on it (its VRMXI id typed), and the counter's area; each area's shape pinned and its size a vector.
  ```steps
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Area' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Area" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Area" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add area" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 27 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="zone-coats"   # the plan's id
  until find("id=undo").0.name == "Undo Change id area to zone-coats" timeout=5000
  expect find("id=inspector-id").0.name == "Node zone-coats"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Coats and scarves (in front)"
  until find("id=field-name").0.value == "Coats and scarves (in front)" timeout=5000
  act id=pos-x action=set_value value="-5.1"
  until find("id=pos-x").0.value == "-5.1" timeout=5000
  act id=pos-y action=set_value value="1"
  until find("id=pos-y").0.value == "1" timeout=5000
  act id=pos-z action=set_value value="3.5"
  until find("id=pos-z").0.value == "3.5" timeout=5000
  act id=pin-shape action=press   # the value shown is its default: the pin writes it
  until find("id=pin-shape").count == 0 timeout=5000
  expect find("id=undo").0.name == "Undo Set zone-coats.shape"
  act id=prop-size-x action=set_value value="0.9"
  until find("id=prop-size-x").0.value == "0.9" timeout=5000
  act id=prop-size-y action=set_value value="2"
  until find("id=prop-size-y").0.value == "2" timeout=5000
  act id=prop-size-z action=set_value value="1.2"
  until find("id=prop-size-z").0.value == "1.2" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=beh-add action=focus
  pause 400
  until find("surface=app role=menuitem name='shelf' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="shelf" exact=true action=press
  pause 600
  act id=beh-add-button action=press
  until find("id=undo").0.name == "Undo Add shelf to zone-coats" timeout=5000
  until find("id=beh-shelf").count == 1 timeout=5000
  act id=beh-shelf-item action=focus
  pause 250
  act id=beh-shelf-item action=set_value value="b2c41d6e-7a3f-4e58-9b10-af7e0a0d0c01"
  until find("id=beh-shelf-item").0.value == "b2c41d6e-7a3f-4e58-9b10-af7e0a0d0c01" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Area' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Area" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Area" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add area" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 28 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="zone-phones"   # the plan's id
  until find("id=undo").0.name == "Undo Change id area to zone-phones" timeout=5000
  expect find("id=inspector-id").0.name == "Node zone-phones"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Phones and keys (in front)"
  until find("id=field-name").0.value == "Phones and keys (in front)" timeout=5000
  act id=pos-x action=set_value value="4.2"
  until find("id=pos-x").0.value == "4.2" timeout=5000
  act id=pos-y action=set_value value="1"
  until find("id=pos-y").0.value == "1" timeout=5000
  act id=pos-z action=set_value value="-5.1"
  until find("id=pos-z").0.value == "-5.1" timeout=5000
  act id=pin-shape action=press   # the value shown is its default: the pin writes it
  until find("id=pin-shape").count == 0 timeout=5000
  expect find("id=undo").0.name == "Undo Set zone-phones.shape"
  act id=prop-size-x action=set_value value="1.2"
  until find("id=prop-size-x").0.value == "1.2" timeout=5000
  act id=prop-size-y action=set_value value="2"
  until find("id=prop-size-y").0.value == "2" timeout=5000
  act id=prop-size-z action=set_value value="0.9"
  until find("id=prop-size-z").0.value == "0.9" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=beh-add action=focus
  pause 400
  until find("surface=app role=menuitem name='shelf' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="shelf" exact=true action=press
  pause 600
  act id=beh-add-button action=press
  until find("id=undo").0.name == "Undo Add shelf to zone-phones" timeout=5000
  until find("id=beh-shelf").count == 1 timeout=5000
  act id=beh-shelf-item action=focus
  pause 250
  act id=beh-shelf-item action=set_value value="b2c41d6e-7a3f-4e58-9b10-af7e0a0d0c02"
  until find("id=beh-shelf-item").0.value == "b2c41d6e-7a3f-4e58-9b10-af7e0a0d0c02" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Area' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Area" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Area" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add area" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 29 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="zone-books"   # the plan's id
  until find("id=undo").0.name == "Undo Change id area to zone-books" timeout=5000
  expect find("id=inspector-id").0.name == "Node zone-books"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Books (in front)"
  until find("id=field-name").0.value == "Books (in front)" timeout=5000
  act id=pos-x action=set_value value="-5.1"
  until find("id=pos-x").0.value == "-5.1" timeout=5000
  act id=pos-y action=set_value value="1"
  until find("id=pos-y").0.value == "1" timeout=5000
  act id=pos-z action=set_value value="-3.2"
  until find("id=pos-z").0.value == "-3.2" timeout=5000
  act id=pin-shape action=press   # the value shown is its default: the pin writes it
  until find("id=pin-shape").count == 0 timeout=5000
  expect find("id=undo").0.name == "Undo Set zone-books.shape"
  act id=prop-size-x action=set_value value="0.9"
  until find("id=prop-size-x").0.value == "0.9" timeout=5000
  act id=prop-size-y action=set_value value="2"
  until find("id=prop-size-y").0.value == "2" timeout=5000
  act id=prop-size-z action=set_value value="1.2"
  until find("id=prop-size-z").0.value == "1.2" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=beh-add action=focus
  pause 400
  until find("surface=app role=menuitem name='shelf' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="shelf" exact=true action=press
  pause 600
  act id=beh-add-button action=press
  until find("id=undo").0.name == "Undo Add shelf to zone-books" timeout=5000
  until find("id=beh-shelf").count == 1 timeout=5000
  act id=beh-shelf-item action=focus
  pause 250
  act id=beh-shelf-item action=set_value value="b2c41d6e-7a3f-4e58-9b10-af7e0a0d0c03"
  until find("id=beh-shelf-item").0.value == "b2c41d6e-7a3f-4e58-9b10-af7e0a0d0c03" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Area' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Area" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Area" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add area" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 30 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="counter"   # the plan's id
  until find("id=undo").0.name == "Undo Change id area to counter" timeout=5000
  expect find("id=inspector-id").0.name == "Node counter"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="At the counter"
  until find("id=field-name").0.value == "At the counter" timeout=5000
  act id=pos-x action=set_value value="-1.2"
  until find("id=pos-x").0.value == "-1.2" timeout=5000
  act id=pos-y action=set_value value="1"
  until find("id=pos-y").0.value == "1" timeout=5000
  act id=pos-z action=set_value value="-3.15"
  until find("id=pos-z").0.value == "-3.15" timeout=5000
  act id=pin-shape action=press   # the value shown is its default: the pin writes it
  until find("id=pin-shape").count == 0 timeout=5000
  expect find("id=undo").0.name == "Undo Set counter.shape"
  act id=prop-size-x action=set_value value="1.2"
  until find("id=prop-size-x").0.value == "1.2" timeout=5000
  act id=prop-size-y action=set_value value="2"
  until find("id=prop-size-y").0.value == "2" timeout=5000
  act id=prop-size-z action=set_value value="0.7"
  until find("id=prop-size-z").0.value == "0.7" timeout=5000
  until find("id=doc-state").0.name matches " hash 719265b5a7db6b2c$" timeout=10000   # the scene so far is what the editor's session makes of the plan
  ```

- [ ] The rules (lost when the clock runs out or after two wrong shelves, built in the condition's menus and rows), two counters, the clock, the goal and the checkpoint under them.
  ```steps
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='GameRules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="GameRules" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameRules" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gamerules" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 31 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="rules"   # the plan's id
  until find("id=undo").0.name == "Undo Change id gamerules to rules" timeout=5000
  expect find("id=inspector-id").0.name == "Node rules"
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-lose-test action=focus
  pause 400
  until find("surface=app role=menuitem name='any' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="any" exact=true action=press
  until find("id=prop-lose-test").0.value == "any" timeout=5000
  until find("id=prop-lose-of-0").count == 1 timeout=5000
  pause 500   # a row just made: let it settle before its "new" placeholder is replaced (typed too soon, the value lands after it)
  act id=prop-lose-of-0-key action=focus
  pause 250
  act id=prop-lose-of-0-key action=set_value value="timers.clock.done"
  until find("id=prop-lose-of-0-key").0.value == "timers.clock.done" timeout=5000
  act id=prop-lose-of--add action=press
  until find("id=prop-lose-of-1").count == 1 timeout=5000
  pause 500   # a row just made: let it settle before its "new" placeholder is replaced (typed too soon, the value lands after it)
  act id=prop-lose-of-1-key action=focus
  pause 250
  act id=prop-lose-of-1-key action=set_value value="counters.mistakes"
  until find("id=prop-lose-of-1-key").0.value == "counters.mistakes" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-lose-of-1-op action=focus
  pause 400
  until find("surface=app role=menuitem name='ge' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="ge" exact=true action=press
  until find("id=prop-lose-of-1-op").0.value == "ge" timeout=5000
  act id=prop-lose-of-1-value action=set_value value="2"
  until find("id=prop-lose-of-1-value").0.value == "2" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='GameCounter' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="GameCounter" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameCounter" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gamecounter" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 32 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="shelved"   # the plan's id
  until find("id=undo").0.name == "Undo Change id gamecounter to shelved" timeout=5000
  expect find("id=inspector-id").0.name == "Node shelved"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=field-parent action=focus
  pause 400
  until find("surface=app role=menuitem name='rules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-label action=focus
  pause 250
  act id=prop-label action=set_value value="On their shelves"
  until find("id=prop-label").0.value == "On their shelves" timeout=5000
  act id=prop-max action=set_value value="3"
  until find("id=prop-max").0.value == "3" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='GameCounter' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="GameCounter" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameCounter" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gamecounter" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 33 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="mistakes"   # the plan's id
  until find("id=undo").0.name == "Undo Change id gamecounter to mistakes" timeout=5000
  expect find("id=inspector-id").0.name == "Node mistakes"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=field-parent action=focus
  pause 400
  until find("surface=app role=menuitem name='rules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-label action=focus
  pause 250
  act id=prop-label action=set_value value="Wrong shelves"
  until find("id=prop-label").0.value == "Wrong shelves" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='GameTimer' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="GameTimer" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameTimer" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gametimer" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 34 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="clock"   # the plan's id
  until find("id=undo").0.name == "Undo Change id gametimer to clock" timeout=5000
  expect find("id=inspector-id").0.name == "Node clock"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=field-parent action=focus
  pause 400
  until find("surface=app role=menuitem name='rules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-label action=focus
  pause 250
  act id=prop-label action=set_value value="Until Hana locks up"
  until find("id=prop-label").0.value == "Until Hana locks up" timeout=5000
  act id=prop-seconds action=set_value value="180"
  until find("id=prop-seconds").0.value == "180" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='GameGoal' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="GameGoal" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameGoal" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gamegoal" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 35 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="tidy"   # the plan's id
  until find("id=undo").0.name == "Undo Change id gamegoal to tidy" timeout=5000
  expect find("id=inspector-id").0.name == "Node tidy"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=field-parent action=focus
  pause 400
  until find("surface=app role=menuitem name='rules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-text action=focus
  pause 250
  act id=prop-text action=set_value value="Put the scarf, the phone and the book on their shelves"
  until find("id=prop-text").0.value == "Put the scarf, the phone and the book on their shelves" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-when-test action=focus
  pause 400
  until find("surface=app role=menuitem name='all' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="all" exact=true action=press
  until find("id=prop-when-test").0.value == "all" timeout=5000
  until find("id=prop-when-of-0").count == 1 timeout=5000
  pause 500   # a row just made: let it settle before its "new" placeholder is replaced (typed too soon, the value lands after it)
  act id=prop-when-of-0-key action=focus
  pause 250
  act id=prop-when-of-0-key action=set_value value="counters.shelved"
  until find("id=prop-when-of-0-key").0.value == "counters.shelved" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-when-of-0-op action=focus
  pause 400
  until find("surface=app role=menuitem name='ge' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="ge" exact=true action=press
  until find("id=prop-when-of-0-op").0.value == "ge" timeout=5000
  act id=prop-when-of-0-value action=set_value value="3"
  until find("id=prop-when-of-0-value").0.value == "3" timeout=5000
  act id=prop-when-of--add action=press
  until find("id=prop-when-of-1").count == 1 timeout=5000
  pause 500   # a row just made: let it settle before its "new" placeholder is replaced (typed too soon, the value lands after it)
  act id=prop-when-of-1-key action=focus
  pause 250
  act id=prop-when-of-1-key action=set_value value="counters.mistakes"
  until find("id=prop-when-of-1-key").0.value == "counters.mistakes" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-when-of-1-op action=focus
  pause 400
  until find("surface=app role=menuitem name='lt' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="lt" exact=true action=press
  until find("id=prop-when-of-1-op").0.value == "lt" timeout=5000
  act id=prop-when-of-1-value action=set_value value="2"
  until find("id=prop-when-of-1-value").0.value == "2" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Checkpoint' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Checkpoint" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Checkpoint" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add checkpoint" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 36 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="cp-first"   # the plan's id
  until find("id=undo").0.name == "Undo Change id checkpoint to cp-first" timeout=5000
  expect find("id=inspector-id").0.name == "Node cp-first"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=field-parent action=focus
  pause 400
  until find("surface=app role=menuitem name='rules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-slot action=focus
  pause 250
  act id=prop-slot action=set_value value="first-shelved"
  until find("id=prop-slot").0.value == "first-shelved" timeout=5000
  act id=prop-label action=focus
  pause 250
  act id=prop-label action=set_value value="First thing on its shelf"
  until find("id=prop-label").0.value == "First thing on its shelf" timeout=5000
  act id=pin-once action=press   # the value shown is its default: the pin writes it
  until find("id=pin-once").count == 0 timeout=5000
  expect find("id=undo").0.name == "Undo Set cp-first.once"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-when-test action=focus
  pause 400
  until find("surface=app role=menuitem name='all' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="all" exact=true action=press
  until find("id=prop-when-test").0.value == "all" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-when-test action=focus
  pause 400
  until find("surface=app role=menuitem name='state' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="state" exact=true action=press
  until find("id=prop-when-test").0.value == "state" timeout=5000
  pause 500   # a row just made: let it settle before its "new" placeholder is replaced (typed too soon, the value lands after it)
  act id=prop-when-key action=focus
  pause 250
  act id=prop-when-key action=set_value value="counters.shelved"
  until find("id=prop-when-key").0.value == "counters.shelved" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-when-op action=focus
  pause 400
  until find("surface=app role=menuitem name='ge' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="ge" exact=true action=press
  until find("id=prop-when-op").0.value == "ge" timeout=5000
  act id=prop-when-value action=set_value value="1"
  until find("id=prop-when-value").0.value == "1" timeout=5000
  until find("id=doc-state").0.name matches " hash 1a9506646099d25e$" timeout=10000   # the scene so far is what the editor's session makes of the plan
  ```

- [ ] Hana's briefing: a Dialogue that starts by itself, three lines, the first offering two choices that branch.
  ```steps
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Dialogue' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Dialogue" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Dialogue" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add dialogue" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 37 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="briefing"   # the plan's id
  until find("id=undo").0.name == "Undo Change id dialogue to briefing" timeout=5000
  expect find("id=inspector-id").0.name == "Node briefing"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Hana's briefing"
  until find("id=field-name").0.value == "Hana's briefing" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-autostart action=press
  until find("id=prop-autostart").0.value == "1" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 1 row" timeout=5000
  pause 500
  act id=prop-lines-0-speaker action=focus
  pause 250
  act id=prop-lines-0-speaker action=set_value value="hana"
  until find("id=prop-lines-0-speaker").0.value == "hana" timeout=5000
  act id=prop-lines-0-text action=focus
  pause 250
  act id=prop-lines-0-text action=set_value value="That's the last customer gone, and they've left things behind again: a scarf, a phone and a book. Put each one on its shelf before I lock up."
  until find("id=prop-lines-0-text").0.value == "That's the last customer gone, and they've left things behind again: a scarf, a phone and a book. Put each one on its shelf before I lock up." timeout=5000
  act id=prop-lines-0-choices--set action=press
  until find("id=prop-lines-0-choices-0").count == 1 timeout=5000
  pause 500
  act id=prop-lines-0-choices-0-id action=focus
  pause 250
  act id=prop-lines-0-choices-0-id action=set_value value="ready"
  until find("id=prop-lines-0-choices-0-id").0.value == "ready" timeout=5000
  act id=prop-lines-0-choices-0-text action=focus
  pause 250
  act id=prop-lines-0-choices-0-text action=set_value value="Leave it to me."
  until find("id=prop-lines-0-choices-0-text").0.value == "Leave it to me." timeout=5000
  act id=prop-lines-0-choices-0-to action=focus
  pause 250
  act id=prop-lines-0-choices-0-to action=set_value value="ready"
  until find("id=prop-lines-0-choices-0-to").0.value == "ready" timeout=5000
  act id=prop-lines-0-choices--add action=press
  until find("id=prop-lines-0-choices-1").count == 1 timeout=5000
  pause 500
  act id=prop-lines-0-choices-1-id action=focus
  pause 250
  act id=prop-lines-0-choices-1-id action=set_value value="how"
  until find("id=prop-lines-0-choices-1-id").0.value == "how" timeout=5000
  act id=prop-lines-0-choices-1-text action=focus
  pause 250
  act id=prop-lines-0-choices-1-text action=set_value value="How do I shelve them?"
  until find("id=prop-lines-0-choices-1-text").0.value == "How do I shelve them?" timeout=5000
  act id=prop-lines-0-choices-1-to action=focus
  pause 250
  act id=prop-lines-0-choices-1-to action=set_value value="how"
  until find("id=prop-lines-0-choices-1-to").0.value == "how" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 2 rows" timeout=5000
  pause 500
  act id=prop-lines-1-id action=focus
  pause 250
  act id=prop-lines-1-id action=set_value value="ready"
  until find("id=prop-lines-1-id").0.value == "ready" timeout=5000
  act id=prop-lines-1-speaker action=focus
  pause 250
  act id=prop-lines-1-speaker action=set_value value="hana"
  until find("id=prop-lines-1-speaker").0.value == "hana" timeout=5000
  act id=prop-lines-1-text action=focus
  pause 250
  act id=prop-lines-1-text action=set_value value="Thanks, Mira. Come to the counter if you want a hint."
  until find("id=prop-lines-1-text").0.value == "Thanks, Mira. Come to the counter if you want a hint." timeout=5000
  act id=prop-lines-1-next action=focus
  pause 250
  act id=prop-lines-1-next action=set_value value="end"
  until find("id=prop-lines-1-next").0.value == "end" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 3 rows" timeout=5000
  pause 500
  act id=prop-lines-2-id action=focus
  pause 250
  act id=prop-lines-2-id action=set_value value="how"
  until find("id=prop-lines-2-id").0.value == "how" timeout=5000
  act id=prop-lines-2-speaker action=focus
  pause 250
  act id=prop-lines-2-speaker action=set_value value="hana"
  until find("id=prop-lines-2-speaker").0.value == "hana" timeout=5000
  act id=prop-lines-2-text action=focus
  pause 250
  act id=prop-lines-2-text action=set_value value="Stand at the right shelf and press E. The right shelf, mind!"
  until find("id=prop-lines-2-text").0.value == "Stand at the right shelf and press E. The right shelf, mind!" timeout=5000
  until find("id=doc-state").0.name matches " hash 3d67f8a29e7e9f88$" timeout=10000   # the scene so far is what the editor's session makes of the plan
  ```

- [ ] Hana's hints: a Dialogue of four lines, the first offering four choices.
  ```steps
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Dialogue' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Dialogue" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Dialogue" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add dialogue" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/level.vrmxs 38 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="hints"   # the plan's id
  until find("id=undo").0.name == "Undo Change id dialogue to hints" timeout=5000
  expect find("id=inspector-id").0.name == "Node hints"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Hana's hints"
  until find("id=field-name").0.value == "Hana's hints" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 1 row" timeout=5000
  pause 500
  act id=prop-lines-0-speaker action=focus
  pause 250
  act id=prop-lines-0-speaker action=set_value value="hana"
  until find("id=prop-lines-0-speaker").0.value == "hana" timeout=5000
  act id=prop-lines-0-text action=focus
  pause 250
  act id=prop-lines-0-text action=set_value value="Need a hand?"
  until find("id=prop-lines-0-text").0.value == "Need a hand?" timeout=5000
  act id=prop-lines-0-choices--set action=press
  until find("id=prop-lines-0-choices-0").count == 1 timeout=5000
  pause 500
  act id=prop-lines-0-choices-0-id action=focus
  pause 250
  act id=prop-lines-0-choices-0-id action=set_value value="scarf"
  until find("id=prop-lines-0-choices-0-id").0.value == "scarf" timeout=5000
  act id=prop-lines-0-choices-0-text action=focus
  pause 250
  act id=prop-lines-0-choices-0-text action=set_value value="Where does the scarf go?"
  until find("id=prop-lines-0-choices-0-text").0.value == "Where does the scarf go?" timeout=5000
  act id=prop-lines-0-choices-0-to action=focus
  pause 250
  act id=prop-lines-0-choices-0-to action=set_value value="scarf"
  until find("id=prop-lines-0-choices-0-to").0.value == "scarf" timeout=5000
  act id=prop-lines-0-choices--add action=press
  until find("id=prop-lines-0-choices-1").count == 1 timeout=5000
  pause 500
  act id=prop-lines-0-choices-1-id action=focus
  pause 250
  act id=prop-lines-0-choices-1-id action=set_value value="phone"
  until find("id=prop-lines-0-choices-1-id").0.value == "phone" timeout=5000
  act id=prop-lines-0-choices-1-text action=focus
  pause 250
  act id=prop-lines-0-choices-1-text action=set_value value="And the phone?"
  until find("id=prop-lines-0-choices-1-text").0.value == "And the phone?" timeout=5000
  act id=prop-lines-0-choices-1-to action=focus
  pause 250
  act id=prop-lines-0-choices-1-to action=set_value value="phone"
  until find("id=prop-lines-0-choices-1-to").0.value == "phone" timeout=5000
  act id=prop-lines-0-choices--add action=press
  until find("id=prop-lines-0-choices-2").count == 1 timeout=5000
  pause 500
  act id=prop-lines-0-choices-2-id action=focus
  pause 250
  act id=prop-lines-0-choices-2-id action=set_value value="book"
  until find("id=prop-lines-0-choices-2-id").0.value == "book" timeout=5000
  act id=prop-lines-0-choices-2-text action=focus
  pause 250
  act id=prop-lines-0-choices-2-text action=set_value value="Where is the book?"
  until find("id=prop-lines-0-choices-2-text").0.value == "Where is the book?" timeout=5000
  act id=prop-lines-0-choices-2-to action=focus
  pause 250
  act id=prop-lines-0-choices-2-to action=set_value value="book"
  until find("id=prop-lines-0-choices-2-to").0.value == "book" timeout=5000
  act id=prop-lines-0-choices--add action=press
  until find("id=prop-lines-0-choices-3").count == 1 timeout=5000
  pause 500
  act id=prop-lines-0-choices-3-id action=focus
  pause 250
  act id=prop-lines-0-choices-3-id action=set_value value="fine"
  until find("id=prop-lines-0-choices-3-id").0.value == "fine" timeout=5000
  act id=prop-lines-0-choices-3-text action=focus
  pause 250
  act id=prop-lines-0-choices-3-text action=set_value value="I'm fine, thanks."
  until find("id=prop-lines-0-choices-3-text").0.value == "I'm fine, thanks." timeout=5000
  act id=prop-lines-0-choices-3-to action=focus
  pause 250
  act id=prop-lines-0-choices-3-to action=set_value value="end"
  until find("id=prop-lines-0-choices-3-to").0.value == "end" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 2 rows" timeout=5000
  pause 500
  act id=prop-lines-1-id action=focus
  pause 250
  act id=prop-lines-1-id action=set_value value="scarf"
  until find("id=prop-lines-1-id").0.value == "scarf" timeout=5000
  act id=prop-lines-1-speaker action=focus
  pause 250
  act id=prop-lines-1-speaker action=set_value value="hana"
  until find("id=prop-lines-1-speaker").0.value == "hana" timeout=5000
  act id=prop-lines-1-text action=focus
  pause 250
  act id=prop-lines-1-text action=set_value value="Scarves and coats go on the shelf by the front door."
  until find("id=prop-lines-1-text").0.value == "Scarves and coats go on the shelf by the front door." timeout=5000
  act id=prop-lines-1-next action=focus
  pause 250
  act id=prop-lines-1-next action=set_value value="end"
  until find("id=prop-lines-1-next").0.value == "end" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 3 rows" timeout=5000
  pause 500
  act id=prop-lines-2-id action=focus
  pause 250
  act id=prop-lines-2-id action=set_value value="phone"
  until find("id=prop-lines-2-id").0.value == "phone" timeout=5000
  act id=prop-lines-2-speaker action=focus
  pause 250
  act id=prop-lines-2-speaker action=set_value value="hana"
  until find("id=prop-lines-2-speaker").0.value == "hana" timeout=5000
  act id=prop-lines-2-text action=focus
  pause 250
  act id=prop-lines-2-text action=set_value value="Phones by the staff door, where people come and ask for them."
  until find("id=prop-lines-2-text").0.value == "Phones by the staff door, where people come and ask for them." timeout=5000
  act id=prop-lines-2-next action=focus
  pause 250
  act id=prop-lines-2-next action=set_value value="end"
  until find("id=prop-lines-2-next").0.value == "end" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 4 rows" timeout=5000
  pause 500
  act id=prop-lines-3-id action=focus
  pause 250
  act id=prop-lines-3-id action=set_value value="book"
  until find("id=prop-lines-3-id").0.value == "book" timeout=5000
  act id=prop-lines-3-speaker action=focus
  pause 250
  act id=prop-lines-3-speaker action=set_value value="hana"
  until find("id=prop-lines-3-speaker").0.value == "hana" timeout=5000
  act id=prop-lines-3-text action=focus
  pause 250
  act id=prop-lines-3-text action=set_value value="Someone left it in the back room. The switch by the staff door opens it."
  until find("id=prop-lines-3-text").0.value == "Someone left it in the back room. The switch by the staff door opens it." timeout=5000
  until find("id=doc-state").0.name matches " hash cbf51ce434d6068d$" timeout=10000   # the scene so far is what the editor's session makes of the plan
  ```

- [ ] Connections 1 to 3, from the Connections panel of the node that sends each (signal, target and action picked from lists, arguments by the action's schema): the rules' ready to Hana's lookAt (a node argument), the counter's area to the hints, the switch's verb to the staff door's state.
  ```steps
  act id=node-rules action=press
  until find("id=inspector-id").0.name == "Node rules"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='ready' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="ready" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='hana' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="hana" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='lookAt' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="lookAt" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect rules.ready to hana.lookAt" timeout=5000
  until find("id=conn-0").count == 1 timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-0-arg-target action=focus
  pause 400
  until find("surface=app role=menuitem name='mira' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="mira" exact=true action=press
  until find("id=conn-0-arg-target").0.value == "mira" timeout=5000
  act id=node-counter action=press
  until find("id=inspector-id").0.name == "Node counter"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='bodyEntered' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="bodyEntered" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='hints' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="hints" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='start' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="start" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect counter.bodyEntered to hints.start" timeout=5000
  until find("id=conn-1").count == 1 timeout=5000
  act id=node-switch action=press
  until find("id=inspector-id").0.name == "Node switch"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='verb' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="verb" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='staff-door' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="staff-door" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='enterState' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="enterState" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect switch.verb to staff-door.enterState" timeout=5000
  until find("id=conn-2").count == 1 timeout=5000
  act id=conn-2-arg-state action=focus
  pause 250
  act id=conn-2-arg-state action=set_value value="open"
  until find("id=conn-2-arg-state").0.value == "open" timeout=5000
  until find("id=doc-state").0.name matches " hash 41f4cfd5e9111965$" timeout=10000   # the scene so far is what the editor's session makes of the plan
  ```

- [ ] Connections 4 to 15: each shelf's placed and refused, the game's own signals (declared by its describe), to the counter it adds to, the thing shown on its shelf, the wrong-shelf counter and a line from Hana.
  ```steps
  act id=node-zone-coats action=press
  until find("id=inspector-id").0.name == "Node zone-coats"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='placed' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="placed" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='shelved' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="shelved" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='add' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="add" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect zone-coats.placed to shelved.add" timeout=5000
  until find("id=conn-3").count == 1 timeout=5000
  act id=node-zone-coats action=press
  until find("id=inspector-id").0.name == "Node zone-coats"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='placed' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="placed" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='scarf-shelved' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="scarf-shelved" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='enterState' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="enterState" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect zone-coats.placed to scarf-shelved.enterState" timeout=5000
  until find("id=conn-4").count == 1 timeout=5000
  act id=conn-4-arg-state action=focus
  pause 250
  act id=conn-4-arg-state action=set_value value="shelved"
  until find("id=conn-4-arg-state").0.value == "shelved" timeout=5000
  act id=node-zone-coats action=press
  until find("id=inspector-id").0.name == "Node zone-coats"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='refused' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="refused" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='mistakes' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="mistakes" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='add' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="add" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect zone-coats.refused to mistakes.add" timeout=5000
  until find("id=conn-5").count == 1 timeout=5000
  act id=node-zone-coats action=press
  until find("id=inspector-id").0.name == "Node zone-coats"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='refused' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="refused" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='hana' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="hana" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='say' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="say" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect zone-coats.refused to hana.say" timeout=5000
  until find("id=conn-6").count == 1 timeout=5000
  act id=conn-6-arg-text action=focus
  pause 250
  act id=conn-6-arg-text action=set_value value="Not on the coat shelf, Mira!"
  until find("id=conn-6-arg-text").0.value == "Not on the coat shelf, Mira!" timeout=5000
  act id=node-zone-phones action=press
  until find("id=inspector-id").0.name == "Node zone-phones"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='placed' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="placed" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='shelved' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="shelved" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='add' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="add" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect zone-phones.placed to shelved.add" timeout=5000
  until find("id=conn-7").count == 1 timeout=5000
  act id=node-zone-phones action=press
  until find("id=inspector-id").0.name == "Node zone-phones"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='placed' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="placed" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='phone-shelved' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="phone-shelved" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='enterState' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="enterState" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect zone-phones.placed to phone-shelved.enterState" timeout=5000
  until find("id=conn-8").count == 1 timeout=5000
  act id=conn-8-arg-state action=focus
  pause 250
  act id=conn-8-arg-state action=set_value value="shelved"
  until find("id=conn-8-arg-state").0.value == "shelved" timeout=5000
  act id=node-zone-phones action=press
  until find("id=inspector-id").0.name == "Node zone-phones"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='refused' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="refused" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='mistakes' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="mistakes" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='add' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="add" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect zone-phones.refused to mistakes.add" timeout=5000
  until find("id=conn-9").count == 1 timeout=5000
  act id=node-zone-phones action=press
  until find("id=inspector-id").0.name == "Node zone-phones"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='refused' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="refused" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='hana' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="hana" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='say' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="say" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect zone-phones.refused to hana.say" timeout=5000
  until find("id=conn-10").count == 1 timeout=5000
  act id=conn-10-arg-text action=focus
  pause 250
  act id=conn-10-arg-text action=set_value value="That doesn't go with the phones."
  until find("id=conn-10-arg-text").0.value == "That doesn't go with the phones." timeout=5000
  act id=node-zone-books action=press
  until find("id=inspector-id").0.name == "Node zone-books"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='placed' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="placed" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='shelved' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="shelved" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='add' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="add" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect zone-books.placed to shelved.add" timeout=5000
  until find("id=conn-11").count == 1 timeout=5000
  act id=node-zone-books action=press
  until find("id=inspector-id").0.name == "Node zone-books"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='placed' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="placed" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='book-shelved' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="book-shelved" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='enterState' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="enterState" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect zone-books.placed to book-shelved.enterState" timeout=5000
  until find("id=conn-12").count == 1 timeout=5000
  act id=conn-12-arg-state action=focus
  pause 250
  act id=conn-12-arg-state action=set_value value="shelved"
  until find("id=conn-12-arg-state").0.value == "shelved" timeout=5000
  act id=node-zone-books action=press
  until find("id=inspector-id").0.name == "Node zone-books"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='refused' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="refused" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='mistakes' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="mistakes" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='add' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="add" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect zone-books.refused to mistakes.add" timeout=5000
  until find("id=conn-13").count == 1 timeout=5000
  act id=node-zone-books action=press
  until find("id=inspector-id").0.name == "Node zone-books"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='refused' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="refused" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='hana' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="hana" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='say' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="say" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect zone-books.refused to hana.say" timeout=5000
  until find("id=conn-14").count == 1 timeout=5000
  act id=conn-14-arg-text action=focus
  pause 250
  act id=conn-14-arg-text action=set_value value="The bookshelf is for books!"
  until find("id=conn-14-arg-text").0.value == "The bookshelf is for books!" timeout=5000
  until find("id=doc-state").0.name matches " hash 06ec810b497eab26$" timeout=10000   # the scene so far is what the editor's session makes of the plan
  ```

- [ ] Connections 16 and 17: won and lost to the scene change (a delay and a scene).
  ```steps
  act id=node-rules action=press
  until find("id=inspector-id").0.name == "Node rules"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='won' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="won" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='rules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='changeScene' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="changeScene" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect rules.won to rules.changeScene" timeout=5000
  until find("id=conn-15").count == 1 timeout=5000
  act id=conn-15-arg-after action=set_value value="3"
  until find("id=conn-15-arg-after").0.value == "3" timeout=5000
  act id=conn-15-arg-to action=focus
  pause 250
  act id=conn-15-arg-to action=set_value value="after-hours/won.vrmxs"
  until find("id=conn-15-arg-to").0.value == "after-hours/won.vrmxs" timeout=5000
  act id=node-rules action=press
  until find("id=inspector-id").0.name == "Node rules"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='lost' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="lost" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='rules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='changeScene' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="changeScene" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect rules.lost to rules.changeScene" timeout=5000
  until find("id=conn-16").count == 1 timeout=5000
  act id=conn-16-arg-after action=set_value value="3"
  until find("id=conn-16-arg-after").0.value == "3" timeout=5000
  act id=conn-16-arg-to action=focus
  pause 250
  act id=conn-16-arg-to action=set_value value="after-hours/lost.vrmxs"
  until find("id=conn-16-arg-to").0.value == "after-hours/lost.vrmxs" timeout=5000
  until find("id=doc-state").0.name matches " hash cfe91500a46e3bca$" timeout=10000   # all of it: the committed scene
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] The level saved as after-hours/level.vrmxs, read back from disk the same bytes, valid: the committed file's bytes (9611, hash cfe91500a46e3bca).
  ```steps
  act id=save action=press
  until find("id=saved").0.name == "Saved after-hours/level.vrmxs · 9611 bytes · cfe91500a46e3bca" timeout=20000   # the committed file's size and hash
  act id=verify action=press
  until find("id=verify-result").0.name == "Reopened after-hours/level.vrmxs: same bytes as saved, valid" timeout=30000
  shot "level built"
  ```

- [ ] What every scene shares, brought from the level into the next with the toolbar's Copy: env, cafe, moon, counter-lamp, ambience selected (Also select), copied.
  ```steps
  act id=node-env action=press
  until find("id=inspector-id").0.name == "Node env"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=inspector-also action=focus
  pause 400
  until find("surface=app role=menuitem name='cafe' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="cafe" exact=true action=press
  pause 300
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=inspector-also action=focus
  pause 400
  until find("surface=app role=menuitem name='moon' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="moon" exact=true action=press
  pause 300
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=inspector-also action=focus
  pause 400
  until find("surface=app role=menuitem name='counter-lamp' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="counter-lamp" exact=true action=press
  pause 300
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=inspector-also action=focus
  pause 400
  until find("surface=app role=menuitem name='ambience' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="ambience" exact=true action=press
  pause 300
  until find("id=inspector-id").0.name == "5 nodes: env, cafe, moon, counter-lamp, ambience" timeout=5000
  act id=copy action=press
  until find("id=paste").0.name == "Paste 5 nodes" timeout=5000
  ```

- [ ] The title scene: New with its file name (after-hours/title.vrmxs), its root named, what the level shares pasted and given back its ids, then its own nodes.
  ```steps
  act id=file-name action=set_value value=after-hours/title.vrmxs
  act id=new-scene action=press
  until find("id=doc-state").0.name matches "^Scene after-hours/title.vrmxs 1 nodes " timeout=20000
  act id=node-root action=press
  until find("id=inspector-id").0.name == "Node root"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Title"
  until find("id=field-name").0.value == "Title" timeout=5000
  until find("id=undo").0.name == "Undo Rename root" timeout=5000
  act id=paste action=press   # what the level shares, with fresh ids
  until find("id=undo").0.name == "Undo Paste 5 nodes" timeout=10000
  until find("id=node-env-2").count == 1 timeout=5000
  until find("id=node-cafe-2").count == 1 timeout=5000
  until find("id=node-moon-2").count == 1 timeout=5000
  until find("id=node-counter-lamp-2").count == 1 timeout=5000
  until find("id=node-ambience-2").count == 1 timeout=5000
  act id=node-env-2 action=press
  until find("id=inspector-id").0.name == "Node env-2"
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="env"   # the plan's id
  until find("id=undo").0.name == "Undo Change id env-2 to env" timeout=5000
  expect find("id=inspector-id").0.name == "Node env"
  act id=node-cafe-2 action=press
  until find("id=inspector-id").0.name == "Node cafe-2"
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="cafe"   # the plan's id
  until find("id=undo").0.name == "Undo Change id cafe-2 to cafe" timeout=5000
  expect find("id=inspector-id").0.name == "Node cafe"
  act id=node-moon-2 action=press
  until find("id=inspector-id").0.name == "Node moon-2"
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="moon"   # the plan's id
  until find("id=undo").0.name == "Undo Change id moon-2 to moon" timeout=5000
  expect find("id=inspector-id").0.name == "Node moon"
  act id=node-counter-lamp-2 action=press
  until find("id=inspector-id").0.name == "Node counter-lamp-2"
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="counter-lamp"   # the plan's id
  until find("id=undo").0.name == "Undo Change id counter-lamp-2 to counter-lamp" timeout=5000
  expect find("id=inspector-id").0.name == "Node counter-lamp"
  act id=node-ambience-2 action=press
  until find("id=inspector-id").0.name == "Node ambience-2"
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="ambience"   # the plan's id
  until find("id=undo").0.name == "Undo Change id ambience-2 to ambience" timeout=5000
  expect find("id=inspector-id").0.name == "Node ambience"
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Marker' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Marker" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Marker" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add marker" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/title.vrmxs 7 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="look-at"   # the plan's id
  until find("id=undo").0.name == "Undo Change id marker to look-at" timeout=5000
  expect find("id=inspector-id").0.name == "Node look-at"
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0.1"
  until find("id=pos-y").0.value == "0.1" timeout=5000
  act id=pos-z action=set_value value="6"
  until find("id=pos-z").0.value == "6" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Camera' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Camera" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Camera" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add camera" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/title.vrmxs 8 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="cam"   # the plan's id
  until find("id=undo").0.name == "Undo Change id camera to cam" timeout=5000
  expect find("id=inspector-id").0.name == "Node cam"
  act id=pos-x action=set_value value="3.5"
  until find("id=pos-x").0.value == "3.5" timeout=5000
  act id=pos-y action=set_value value="1.8"
  until find("id=pos-y").0.value == "1.8" timeout=5000
  act id=pos-z action=set_value value="14"
  until find("id=pos-z").0.value == "14" timeout=5000
  act id=prop-focalLength action=set_value value="28"
  until find("id=prop-focalLength").0.value == "28" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-preset action=focus
  pause 400
  until find("surface=app role=menuitem name='fixed' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="fixed" exact=true action=press
  until find("id=prop-preset").0.value == "fixed" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-target action=focus
  pause 400
  until find("surface=app role=menuitem name='look-at' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="look-at" exact=true action=press
  until find("id=prop-target").0.value == "look-at" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='GameRules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="GameRules" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameRules" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gamerules" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/title.vrmxs 9 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="rules"   # the plan's id
  until find("id=undo").0.name == "Undo Change id gamerules to rules" timeout=5000
  expect find("id=inspector-id").0.name == "Node rules"
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='GameTimer' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="GameTimer" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameTimer" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gametimer" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/title.vrmxs 10 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="intro"   # the plan's id
  until find("id=undo").0.name == "Undo Change id gametimer to intro" timeout=5000
  expect find("id=inspector-id").0.name == "Node intro"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=field-parent action=focus
  pause 400
  until find("surface=app role=menuitem name='rules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-label action=focus
  pause 250
  act id=prop-label action=set_value value="The night shift starts in"
  until find("id=prop-label").0.value == "The night shift starts in" timeout=5000
  act id=prop-seconds action=set_value value="6"
  until find("id=prop-seconds").0.value == "6" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='GameGoal' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="GameGoal" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameGoal" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gamegoal" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/title.vrmxs 11 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="title"   # the plan's id
  until find("id=undo").0.name == "Undo Change id gamegoal to title" timeout=5000
  expect find("id=inspector-id").0.name == "Node title"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=field-parent action=focus
  pause 400
  until find("surface=app role=menuitem name='rules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-text action=focus
  pause 250
  act id=prop-text action=set_value value="After Hours: the cafe after closing"
  until find("id=prop-text").0.value == "After Hours: the cafe after closing" timeout=5000
  act id=prop-optional action=press
  until find("id=prop-optional").0.value == "1" timeout=5000
  until find("id=doc-state").0.name matches " hash f8f913c6b4b9270a$" timeout=10000   # the scene so far is what the editor's session makes of the plan
  ```

- [ ] The title scene's connection, from the Connections panel.
  ```steps
  act id=node-intro action=press
  until find("id=inspector-id").0.name == "Node intro"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='timeout' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="timeout" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='rules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='changeScene' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="changeScene" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect intro.timeout to rules.changeScene" timeout=5000
  until find("id=conn-0").count == 1 timeout=5000
  act id=conn-0-arg-to action=focus
  pause 250
  act id=conn-0-arg-to action=set_value value="after-hours/level.vrmxs"
  until find("id=conn-0-arg-to").0.value == "after-hours/level.vrmxs" timeout=5000
  until find("id=doc-state").0.name matches " hash ff3dc7cf63041d6e$" timeout=10000   # all of it: the committed scene
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] The title saved as after-hours/title.vrmxs, read back from disk the same bytes, valid: the committed file's bytes (1815, hash ff3dc7cf63041d6e).
  ```steps
  act id=save action=press
  until find("id=saved").0.name == "Saved after-hours/title.vrmxs · 1815 bytes · ff3dc7cf63041d6e" timeout=20000   # the committed file's size and hash
  act id=verify action=press
  until find("id=verify-result").0.name == "Reopened after-hours/title.vrmxs: same bytes as saved, valid" timeout=30000
  shot "title built"
  ```

- [ ] The won scene: New with its file name (after-hours/won.vrmxs), its root named, what the level shares pasted and given back its ids, then its own nodes.
  ```steps
  act id=file-name action=set_value value=after-hours/won.vrmxs
  act id=new-scene action=press
  until find("id=doc-state").0.name matches "^Scene after-hours/won.vrmxs 1 nodes " timeout=20000
  act id=node-root action=press
  until find("id=inspector-id").0.name == "Node root"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Won"
  until find("id=field-name").0.value == "Won" timeout=5000
  until find("id=undo").0.name == "Undo Rename root" timeout=5000
  act id=paste action=press   # what the level shares, with fresh ids
  until find("id=undo").0.name == "Undo Paste 5 nodes" timeout=10000
  until find("id=node-env-2").count == 1 timeout=5000
  until find("id=node-cafe-2").count == 1 timeout=5000
  until find("id=node-moon-2").count == 1 timeout=5000
  until find("id=node-counter-lamp-2").count == 1 timeout=5000
  until find("id=node-ambience-2").count == 1 timeout=5000
  act id=node-env-2 action=press
  until find("id=inspector-id").0.name == "Node env-2"
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="env"   # the plan's id
  until find("id=undo").0.name == "Undo Change id env-2 to env" timeout=5000
  expect find("id=inspector-id").0.name == "Node env"
  act id=node-cafe-2 action=press
  until find("id=inspector-id").0.name == "Node cafe-2"
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="cafe"   # the plan's id
  until find("id=undo").0.name == "Undo Change id cafe-2 to cafe" timeout=5000
  expect find("id=inspector-id").0.name == "Node cafe"
  act id=node-moon-2 action=press
  until find("id=inspector-id").0.name == "Node moon-2"
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="moon"   # the plan's id
  until find("id=undo").0.name == "Undo Change id moon-2 to moon" timeout=5000
  expect find("id=inspector-id").0.name == "Node moon"
  act id=node-counter-lamp-2 action=press
  until find("id=inspector-id").0.name == "Node counter-lamp-2"
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="counter-lamp"   # the plan's id
  until find("id=undo").0.name == "Undo Change id counter-lamp-2 to counter-lamp" timeout=5000
  expect find("id=inspector-id").0.name == "Node counter-lamp"
  act id=node-ambience-2 action=press
  until find("id=inspector-id").0.name == "Node ambience-2"
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="ambience"   # the plan's id
  until find("id=undo").0.name == "Undo Change id ambience-2 to ambience" timeout=5000
  expect find("id=inspector-id").0.name == "Node ambience"
  act id=assets-search action=set_value value=hana   # the panel narrowed to this file
  until find("id=asset-characters-hana-vrmxa").count == 1 timeout=10000
  act id=add-characters-hana-vrmxa action=press
  until find("id=undo").0.name == "Undo Add hana" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/won.vrmxs 7 nodes "   # one node added, not two
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Hana"
  until find("id=field-name").0.value == "Hana" timeout=5000
  act id=pos-x action=set_value value="0.2"
  until find("id=pos-x").0.value == "0.2" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="-3.3"
  until find("id=pos-z").0.value == "-3.3" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-controller action=focus
  pause 400
  until find("surface=app role=menuitem name='npc' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="npc" exact=true action=press
  until find("id=prop-controller").0.value == "npc" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Marker' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Marker" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Marker" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add marker" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/won.vrmxs 8 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="look-at"   # the plan's id
  until find("id=undo").0.name == "Undo Change id marker to look-at" timeout=5000
  expect find("id=inspector-id").0.name == "Node look-at"
  act id=pos-x action=set_value value="0.2"
  until find("id=pos-x").0.value == "0.2" timeout=5000
  act id=pos-y action=set_value value="-0.1"
  until find("id=pos-y").0.value == "-0.1" timeout=5000
  act id=pos-z action=set_value value="-3.3"
  until find("id=pos-z").0.value == "-3.3" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Camera' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Camera" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Camera" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add camera" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/won.vrmxs 9 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="cam"   # the plan's id
  until find("id=undo").0.name == "Undo Change id camera to cam" timeout=5000
  expect find("id=inspector-id").0.name == "Node cam"
  act id=pos-x action=set_value value="0.9"
  until find("id=pos-x").0.value == "0.9" timeout=5000
  act id=pos-y action=set_value value="1.6"
  until find("id=pos-y").0.value == "1.6" timeout=5000
  act id=pos-z action=set_value value="-0.6"
  until find("id=pos-z").0.value == "-0.6" timeout=5000
  act id=prop-focalLength action=set_value value="35"
  until find("id=prop-focalLength").0.value == "35" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-preset action=focus
  pause 400
  until find("surface=app role=menuitem name='fixed' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="fixed" exact=true action=press
  until find("id=prop-preset").0.value == "fixed" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-target action=focus
  pause 400
  until find("surface=app role=menuitem name='look-at' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="look-at" exact=true action=press
  until find("id=prop-target").0.value == "look-at" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='GameRules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="GameRules" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameRules" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gamerules" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/won.vrmxs 10 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="rules"   # the plan's id
  until find("id=undo").0.name == "Undo Change id gamerules to rules" timeout=5000
  expect find("id=inspector-id").0.name == "Node rules"
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  until find("id=prop-reads").count == 1 timeout=5000
  act id=prop-reads-counters--set action=press
  until find("id=prop-reads-counters").count == 1 timeout=5000
  pause 300
  act id=prop-reads-counters--add action=press
  until find("id=prop-reads-counters-0").count == 1 timeout=5000
  pause 300
  act id=prop-reads-counters-0 action=focus
  pause 250
  act id=prop-reads-counters-0 action=set_value value="shelved"
  until find("id=prop-reads-counters-0").0.value == "shelved" timeout=5000
  act id=prop-reads-counters--add action=press
  until find("id=prop-reads-counters-1").count == 1 timeout=5000
  pause 300
  act id=prop-reads-counters-1 action=focus
  pause 250
  act id=prop-reads-counters-1 action=set_value value="mistakes"
  until find("id=prop-reads-counters-1").0.value == "mistakes" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='GameTimer' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="GameTimer" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameTimer" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gametimer" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/won.vrmxs 11 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="outro"   # the plan's id
  until find("id=undo").0.name == "Undo Change id gametimer to outro" timeout=5000
  expect find("id=inspector-id").0.name == "Node outro"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=field-parent action=focus
  pause 400
  until find("surface=app role=menuitem name='rules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-label action=focus
  pause 250
  act id=prop-label action=set_value value="Back to the title in"
  until find("id=prop-label").0.value == "Back to the title in" timeout=5000
  act id=prop-seconds action=set_value value="12"
  until find("id=prop-seconds").0.value == "12" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Dialogue' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Dialogue" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Dialogue" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add dialogue" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/won.vrmxs 12 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="closing"   # the plan's id
  until find("id=undo").0.name == "Undo Change id dialogue to closing" timeout=5000
  expect find("id=inspector-id").0.name == "Node closing"
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-autostart action=press
  until find("id=prop-autostart").0.value == "1" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 1 row" timeout=5000
  pause 500
  act id=prop-lines-0-id action=focus
  pause 250
  act id=prop-lines-0-id action=set_value value="clean"
  until find("id=prop-lines-0-id").0.value == "clean" timeout=5000
  act id=prop-lines-0-speaker action=focus
  pause 250
  act id=prop-lines-0-speaker action=set_value value="hana"
  until find("id=prop-lines-0-speaker").0.value == "hana" timeout=5000
  act id=prop-lines-0-text action=focus
  pause 250
  act id=prop-lines-0-text action=set_value value="Not one thing on the wrong shelf. Goodnight, Mira!"
  until find("id=prop-lines-0-text").0.value == "Not one thing on the wrong shelf. Goodnight, Mira!" timeout=5000
  act id=prop-lines-0-next action=focus
  pause 250
  act id=prop-lines-0-next action=set_value value="bye"
  until find("id=prop-lines-0-next").0.value == "bye" timeout=5000
  act id=prop-lines-0-when--set action=press
  pause 500   # a row just made: let it settle before its "new" placeholder is replaced (typed too soon, the value lands after it)
  act id=prop-lines-0-when-key action=focus
  pause 250
  act id=prop-lines-0-when-key action=set_value value="counters.mistakes"
  until find("id=prop-lines-0-when-key").0.value == "counters.mistakes" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-lines-0-when-op action=focus
  pause 400
  until find("surface=app role=menuitem name='eq' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="eq" exact=true action=press
  until find("id=prop-lines-0-when-op").0.value == "eq" timeout=5000
  act id=prop-lines-0-when-value action=set_value value="0"
  until find("id=prop-lines-0-when-value").0.value == "0" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 2 rows" timeout=5000
  pause 500
  act id=prop-lines-1-id action=focus
  pause 250
  act id=prop-lines-1-id action=set_value value="mixed"
  until find("id=prop-lines-1-id").0.value == "mixed" timeout=5000
  act id=prop-lines-1-speaker action=focus
  pause 250
  act id=prop-lines-1-speaker action=set_value value="hana"
  until find("id=prop-lines-1-speaker").0.value == "hana" timeout=5000
  act id=prop-lines-1-text action=focus
  pause 250
  act id=prop-lines-1-text action=set_value value="All put away, even with a mix-up. Goodnight!"
  until find("id=prop-lines-1-text").0.value == "All put away, even with a mix-up. Goodnight!" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 3 rows" timeout=5000
  pause 500
  act id=prop-lines-2-id action=focus
  pause 250
  act id=prop-lines-2-id action=set_value value="bye"
  until find("id=prop-lines-2-id").0.value == "bye" timeout=5000
  act id=prop-lines-2-speaker action=focus
  pause 250
  act id=prop-lines-2-speaker action=set_value value="hana"
  until find("id=prop-lines-2-speaker").0.value == "hana" timeout=5000
  act id=prop-lines-2-text action=focus
  pause 250
  act id=prop-lines-2-text action=set_value value="I'll lock up."
  until find("id=prop-lines-2-text").0.value == "I'll lock up." timeout=5000
  until find("id=doc-state").0.name matches " hash 9cd0dff42674dad6$" timeout=10000   # the scene so far is what the editor's session makes of the plan
  ```

- [ ] The won scene's connection, from the Connections panel.
  ```steps
  act id=node-outro action=press
  until find("id=inspector-id").0.name == "Node outro"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='timeout' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="timeout" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='rules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='changeScene' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="changeScene" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect outro.timeout to rules.changeScene" timeout=5000
  until find("id=conn-0").count == 1 timeout=5000
  act id=conn-0-arg-reset action=press
  until find("id=conn-0-arg-reset").0.value == "1" timeout=5000
  act id=conn-0-arg-to action=focus
  pause 250
  act id=conn-0-arg-to action=set_value value="after-hours/title.vrmxs"
  until find("id=conn-0-arg-to").0.value == "after-hours/title.vrmxs" timeout=5000
  until find("id=doc-state").0.name matches " hash 52d5c4dc8d51767b$" timeout=10000   # all of it: the committed scene
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] The won saved as after-hours/won.vrmxs, read back from disk the same bytes, valid: the committed file's bytes (2370, hash 52d5c4dc8d51767b).
  ```steps
  act id=save action=press
  until find("id=saved").0.name == "Saved after-hours/won.vrmxs · 2370 bytes · 52d5c4dc8d51767b" timeout=20000   # the committed file's size and hash
  act id=verify action=press
  until find("id=verify-result").0.name == "Reopened after-hours/won.vrmxs: same bytes as saved, valid" timeout=30000
  shot "won built"
  ```

- [ ] The lost scene: New with its file name (after-hours/lost.vrmxs), its root named, what the level shares pasted and given back its ids, then its own nodes.
  ```steps
  act id=file-name action=set_value value=after-hours/lost.vrmxs
  act id=new-scene action=press
  until find("id=doc-state").0.name matches "^Scene after-hours/lost.vrmxs 1 nodes " timeout=20000
  act id=node-root action=press
  until find("id=inspector-id").0.name == "Node root"
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Lost"
  until find("id=field-name").0.value == "Lost" timeout=5000
  until find("id=undo").0.name == "Undo Rename root" timeout=5000
  act id=paste action=press   # what the level shares, with fresh ids
  until find("id=undo").0.name == "Undo Paste 5 nodes" timeout=10000
  until find("id=node-env-2").count == 1 timeout=5000
  until find("id=node-cafe-2").count == 1 timeout=5000
  until find("id=node-moon-2").count == 1 timeout=5000
  until find("id=node-counter-lamp-2").count == 1 timeout=5000
  until find("id=node-ambience-2").count == 1 timeout=5000
  act id=node-env-2 action=press
  until find("id=inspector-id").0.name == "Node env-2"
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="env"   # the plan's id
  until find("id=undo").0.name == "Undo Change id env-2 to env" timeout=5000
  expect find("id=inspector-id").0.name == "Node env"
  act id=node-cafe-2 action=press
  until find("id=inspector-id").0.name == "Node cafe-2"
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="cafe"   # the plan's id
  until find("id=undo").0.name == "Undo Change id cafe-2 to cafe" timeout=5000
  expect find("id=inspector-id").0.name == "Node cafe"
  act id=node-moon-2 action=press
  until find("id=inspector-id").0.name == "Node moon-2"
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="moon"   # the plan's id
  until find("id=undo").0.name == "Undo Change id moon-2 to moon" timeout=5000
  expect find("id=inspector-id").0.name == "Node moon"
  act id=node-counter-lamp-2 action=press
  until find("id=inspector-id").0.name == "Node counter-lamp-2"
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="counter-lamp"   # the plan's id
  until find("id=undo").0.name == "Undo Change id counter-lamp-2 to counter-lamp" timeout=5000
  expect find("id=inspector-id").0.name == "Node counter-lamp"
  act id=node-ambience-2 action=press
  until find("id=inspector-id").0.name == "Node ambience-2"
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="ambience"   # the plan's id
  until find("id=undo").0.name == "Undo Change id ambience-2 to ambience" timeout=5000
  expect find("id=inspector-id").0.name == "Node ambience"
  act id=assets-search action=set_value value=hana   # the panel narrowed to this file
  until find("id=asset-characters-hana-vrmxa").count == 1 timeout=10000
  act id=add-characters-hana-vrmxa action=press
  until find("id=undo").0.name == "Undo Add hana" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/lost.vrmxs 7 nodes "   # one node added, not two
  act id=field-name action=focus
  pause 250
  act id=field-name action=set_value value="Hana"
  until find("id=field-name").0.value == "Hana" timeout=5000
  act id=pos-x action=set_value value="0.2"
  until find("id=pos-x").0.value == "0.2" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="-3.3"
  until find("id=pos-z").0.value == "-3.3" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-controller action=focus
  pause 400
  until find("surface=app role=menuitem name='npc' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="npc" exact=true action=press
  until find("id=prop-controller").0.value == "npc" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Marker' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Marker" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Marker" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add marker" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/lost.vrmxs 8 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="look-at"   # the plan's id
  until find("id=undo").0.name == "Undo Change id marker to look-at" timeout=5000
  expect find("id=inspector-id").0.name == "Node look-at"
  act id=pos-x action=set_value value="0.2"
  until find("id=pos-x").0.value == "0.2" timeout=5000
  act id=pos-y action=set_value value="-0.1"
  until find("id=pos-y").0.value == "-0.1" timeout=5000
  act id=pos-z action=set_value value="-3.3"
  until find("id=pos-z").0.value == "-3.3" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Camera' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Camera" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Camera" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add camera" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/lost.vrmxs 9 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="cam"   # the plan's id
  until find("id=undo").0.name == "Undo Change id camera to cam" timeout=5000
  expect find("id=inspector-id").0.name == "Node cam"
  act id=pos-x action=set_value value="0.9"
  until find("id=pos-x").0.value == "0.9" timeout=5000
  act id=pos-y action=set_value value="1.6"
  until find("id=pos-y").0.value == "1.6" timeout=5000
  act id=pos-z action=set_value value="-0.6"
  until find("id=pos-z").0.value == "-0.6" timeout=5000
  act id=prop-focalLength action=set_value value="35"
  until find("id=prop-focalLength").0.value == "35" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-preset action=focus
  pause 400
  until find("surface=app role=menuitem name='fixed' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="fixed" exact=true action=press
  until find("id=prop-preset").0.value == "fixed" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-target action=focus
  pause 400
  until find("surface=app role=menuitem name='look-at' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="look-at" exact=true action=press
  until find("id=prop-target").0.value == "look-at" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='GameRules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="GameRules" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameRules" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gamerules" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/lost.vrmxs 10 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="rules"   # the plan's id
  until find("id=undo").0.name == "Undo Change id gamerules to rules" timeout=5000
  expect find("id=inspector-id").0.name == "Node rules"
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  until find("id=prop-reads").count == 1 timeout=5000
  act id=prop-reads-counters--set action=press
  until find("id=prop-reads-counters").count == 1 timeout=5000
  pause 300
  act id=prop-reads-counters--add action=press
  until find("id=prop-reads-counters-0").count == 1 timeout=5000
  pause 300
  act id=prop-reads-counters-0 action=focus
  pause 250
  act id=prop-reads-counters-0 action=set_value value="shelved"
  until find("id=prop-reads-counters-0").0.value == "shelved" timeout=5000
  act id=prop-reads-counters--add action=press
  until find("id=prop-reads-counters-1").count == 1 timeout=5000
  pause 300
  act id=prop-reads-counters-1 action=focus
  pause 250
  act id=prop-reads-counters-1 action=set_value value="mistakes"
  until find("id=prop-reads-counters-1").0.value == "mistakes" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='GameTimer' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="GameTimer" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "GameTimer" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add gametimer" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/lost.vrmxs 11 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="outro"   # the plan's id
  until find("id=undo").0.name == "Undo Change id gametimer to outro" timeout=5000
  expect find("id=inspector-id").0.name == "Node outro"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=field-parent action=focus
  pause 400
  until find("surface=app role=menuitem name='rules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  until find("id=field-parent").0.value == "rules" timeout=5000
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-label action=focus
  pause 250
  act id=prop-label action=set_value value="Back to the title in"
  until find("id=prop-label").0.value == "Back to the title in" timeout=5000
  act id=prop-seconds action=set_value value="12"
  until find("id=prop-seconds").0.value == "12" timeout=5000
  act id=file-name action=focus   # off the menu first, so focusing it again takes
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act role=popupbutton name="Node type to add" action=focus
  pause 400
  until find("surface=app role=menuitem name='Dialogue' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="Dialogue" exact=true action=press
  until find("role=popupbutton name='Node type to add'").0.value == "Dialogue" timeout=5000
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add dialogue" timeout=10000
  expect find("id=doc-state").0.name matches "^Scene after-hours/lost.vrmxs 12 nodes "   # one node added, not two
  act id=field-id action=focus
  pause 300
  act id=field-id action=set_value value="closing"   # the plan's id
  until find("id=undo").0.name == "Undo Change id dialogue to closing" timeout=5000
  expect find("id=inspector-id").0.name == "Node closing"
  act id=pos-x action=set_value value="0"
  until find("id=pos-x").0.value == "0" timeout=5000
  act id=pos-y action=set_value value="0"
  until find("id=pos-y").0.value == "0" timeout=5000
  act id=pos-z action=set_value value="0"
  until find("id=pos-z").0.value == "0" timeout=5000
  act id=prop-autostart action=press
  until find("id=prop-autostart").0.value == "1" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 1 row" timeout=5000
  pause 500
  act id=prop-lines-0-id action=focus
  pause 250
  act id=prop-lines-0-id action=set_value value="shelves"
  until find("id=prop-lines-0-id").0.value == "shelves" timeout=5000
  act id=prop-lines-0-speaker action=focus
  pause 250
  act id=prop-lines-0-speaker action=set_value value="hana"
  until find("id=prop-lines-0-speaker").0.value == "hana" timeout=5000
  act id=prop-lines-0-text action=focus
  pause 250
  act id=prop-lines-0-text action=set_value value="That's two things on the wrong shelf. Let's sort it out tomorrow."
  until find("id=prop-lines-0-text").0.value == "That's two things on the wrong shelf. Let's sort it out tomorrow." timeout=5000
  act id=prop-lines-0-next action=focus
  pause 250
  act id=prop-lines-0-next action=set_value value="end"
  until find("id=prop-lines-0-next").0.value == "end" timeout=5000
  act id=prop-lines-0-when--set action=press
  pause 500   # a row just made: let it settle before its "new" placeholder is replaced (typed too soon, the value lands after it)
  act id=prop-lines-0-when-key action=focus
  pause 250
  act id=prop-lines-0-when-key action=set_value value="counters.mistakes"
  until find("id=prop-lines-0-when-key").0.value == "counters.mistakes" timeout=5000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=prop-lines-0-when-op action=focus
  pause 400
  until find("surface=app role=menuitem name='ge' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="ge" exact=true action=press
  until find("id=prop-lines-0-when-op").0.value == "ge" timeout=5000
  act id=prop-lines-0-when-value action=set_value value="2"
  until find("id=prop-lines-0-when-value").0.value == "2" timeout=5000
  act id=prop-lines--add action=press
  until find("id=prop-lines").0.name == "lines, 2 rows" timeout=5000
  pause 500
  act id=prop-lines-1-id action=focus
  pause 250
  act id=prop-lines-1-id action=set_value value="time"
  until find("id=prop-lines-1-id").0.value == "time" timeout=5000
  act id=prop-lines-1-speaker action=focus
  pause 250
  act id=prop-lines-1-speaker action=set_value value="hana"
  until find("id=prop-lines-1-speaker").0.value == "hana" timeout=5000
  act id=prop-lines-1-text action=focus
  pause 250
  act id=prop-lines-1-text action=set_value value="It's late, Mira. I'm locking up; the rest can wait until tomorrow."
  until find("id=prop-lines-1-text").0.value == "It's late, Mira. I'm locking up; the rest can wait until tomorrow." timeout=5000
  until find("id=doc-state").0.name matches " hash 73ed19a565a7eeff$" timeout=10000   # the scene so far is what the editor's session makes of the plan
  ```

- [ ] The lost scene's connection, from the Connections panel.
  ```steps
  act id=node-outro action=press
  until find("id=inspector-id").0.name == "Node outro"
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-signal action=focus
  pause 400
  until find("surface=app role=menuitem name='timeout' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="timeout" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-to action=focus
  pause 400
  until find("surface=app role=menuitem name='rules' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="rules" exact=true action=press
  pause 600
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=conn-new-call action=focus
  pause 400
  until find("surface=app role=menuitem name='changeScene' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="changeScene" exact=true action=press
  pause 600
  act id=conn-new-add action=press
  until find("id=undo").0.name == "Undo Connect outro.timeout to rules.changeScene" timeout=5000
  until find("id=conn-0").count == 1 timeout=5000
  act id=conn-0-arg-reset action=press
  until find("id=conn-0-arg-reset").0.value == "1" timeout=5000
  act id=conn-0-arg-to action=focus
  pause 250
  act id=conn-0-arg-to action=set_value value="after-hours/title.vrmxs"
  until find("id=conn-0-arg-to").0.value == "after-hours/title.vrmxs" timeout=5000
  until find("id=doc-state").0.name matches " hash c579afc86303df94$" timeout=10000   # all of it: the committed scene
  expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid
  ```

- [ ] The lost saved as after-hours/lost.vrmxs, read back from disk the same bytes, valid: the committed file's bytes (2357, hash c579afc86303df94).
  ```steps
  act id=save action=press
  until find("id=saved").0.name == "Saved after-hours/lost.vrmxs · 2357 bytes · c579afc86303df94" timeout=20000   # the committed file's size and hash
  act id=verify action=press
  until find("id=verify-result").0.name == "Reopened after-hours/lost.vrmxs: same bytes as saved, valid" timeout=30000
  shot "lost built"
  ```

- [ ] Project Settings: the title scene is where the game starts, the game's four scenes are in it and the template's level and ending out, each one undo step written to game.json.
  ```steps
  menu "File › Project Settings…" press
  wait id=project-settings timeout_ms=10000
  pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close
  act id=settings-entry action=focus
  pause 400
  until find("surface=app role=menuitem name='after-hours/title.vrmxs' exact=true").count >= 1 do keys down tries=4   # opens the select's menu
  act surface=app role=menuitem name="after-hours/title.vrmxs" exact=true action=press
  until find("id=settings-entry").0.value == "after-hours/title.vrmxs" timeout=5000
  until find("id=settings-undo").0.name == "Undo Entry scene after-hours/title.vrmxs" timeout=5000
  act id=settings-scene-after-hours/level.vrmxs action=press
  until find("id=settings-undo").0.name == "Undo Add scene after-hours/level.vrmxs" timeout=5000
  act id=settings-scene-after-hours/won.vrmxs action=press
  until find("id=settings-undo").0.name == "Undo Add scene after-hours/won.vrmxs" timeout=5000
  act id=settings-scene-after-hours/lost.vrmxs action=press
  until find("id=settings-undo").0.name == "Undo Add scene after-hours/lost.vrmxs" timeout=5000
  act id=settings-scene-level.vrmxs action=press
  until find("id=settings-undo").0.name == "Undo Remove scene level.vrmxs" timeout=5000
  act id=settings-scene-ending.vrmxs action=press
  until find("id=settings-undo").0.name == "Undo Remove scene ending.vrmxs" timeout=5000
  act id=settings-done action=press
  wait id=project-settings gone=true timeout_ms=5000
  ```

- [ ] File › Export Game… writes the game's build, named by its id: its entry the title scene.
  ```steps
  act id=export-open action=press   # the Export panel, where the result line is
  wait id=export-game timeout_ms=5000
  menu "File › Export Game…" press
  until find("id=export-game-result").0.name matches "^Exported game after-hours: [0-9]+ files, [0-9]+ bytes, entry after-hours/title.vrmxs, runtime vrmxg-game .*/w10-builds/after-hours$" timeout=180000
  expect find("role=alert").count == 0
  partial: the project's files and the build are checked and played outside the app (acceptance/m6/after-hours-compare.mjs)
  ```
