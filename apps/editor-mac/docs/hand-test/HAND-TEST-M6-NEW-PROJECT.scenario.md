# New Project, Open Recent and project settings (M6 W3): AppProbe scenario

Run `apps/editor-mac/scripts/build.sh`, then `apps/editor-mac/scripts/hand-test-fixtures-m6-new-project.sh` (empty
`m6-projects/` and `m6-builds/` in the editor's container), then
`appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M6-NEW-PROJECT.scenario.md`. Afterwards,
`node acceptance/m6/new-project-mac.mjs <container>/tmp/m6-projects` checks what the settings rows wrote, and
`node acceptance/m6/templates-game.mjs <container>/tmp/m6-builds/cafe-dash <container>/tmp/m6-builds/blank` plays the
builds (row 9). Projects land in `tmp/m6-projects/<name>/` (`VRMXG_SHELL_NEW_PROJECT` with a trailing `/` is a folder
to make them in), builds in `tmp/m6-builds/<id>/`.

The rows run in order in one launch (`fresh: false`): each builds on the last.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M6-NEW-PROJECT.md
env: {"VRMXG_SHELL_NEW_PROJECT": "m6-projects/", "VRMXG_SHELL_BUILD": "m6-builds/"}
fresh: false
```

- [ ] File › New Project… makes a game from "One level": named in the sheet, made in a new folder, opened on its level.
  ```steps
  wait id=new-project-open enabled=true timeout_ms=40000
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved" timeout=60000   # the bundled sample first
  menu "File › New Project…" press
  wait id=new-project timeout_ms=10000
  expect find("id=template-level").0.value == "1"   # the level template is chosen by default
  expect find("id=template-empty").count == 1
  act id=new-project-title action=set_value value="Cafe Dash"
  until find("id=new-project-id").0.value == "cafe-dash"   # the id follows the title
  act id=new-project-create action=press
  wait id=new-project gone=true timeout_ms=30000
  until find("id=doc-state").0.name matches "^Scene level.vrmxs 14 nodes saved valid" timeout=60000   # opened on the game's entry, not the first file by name
  expect find("id=project-name").0.name == "Project Cafe Dash"   # the new folder, mounted at /project/
  expect find("role=alert").count == 0
  partial: the folder's files and their licences are checked outside the app (new-project-mac.mjs)
  ```

- [ ] Play in place plays the new level, and Stop puts the scene back as it was.
  ```steps
  act id=play action=press
  until find("text=Playing · step").0.name matches "step [1-9][0-9]{2}" timeout=60000   # Mira, Hana, the rules: more than 100 steps run
  act id=play action=press
  until find("id=stop-result").0.name matches "^Stopped: scene as before Play" timeout=20000
  partial: nobody walks Mira to the counter here (a held key isn't a step AppProbe has); the game app does it, row 9
  ```

- [ ] Project Settings: a title change is one undo step, written to game.json; Edit › Undo and Redo work on the settings while the panel is open.
  ```steps
  menu "File › Project Settings…" press
  wait id=project-settings timeout_ms=10000
  expect find("id=settings-title").0.value == "Cafe Dash"
  expect find("id=settings-id").0.value == "cafe-dash"
  act id=settings-title action=set_value value="Cafe Dash Deluxe"
  until find("id=settings-undo").0.name == "Undo Title Cafe Dash Deluxe"   # one step, named for what it did
  menu "Edit › Undo" press
  until find("id=settings-title").0.value == "Cafe Dash"   # the menu's Undo is the panel's while it is open
  expect find("id=settings-redo").0.name == "Redo Title Cafe Dash Deluxe"
  menu "Edit › Redo" press
  until find("id=settings-title").0.value == "Cafe Dash Deluxe"
  expect find("id=settings-error").count == 0
  partial: game.json on disk is read by new-project-mac.mjs (title "Cafe Dash Deluxe")
  ```

- [ ] Rebinding: Jump takes the key pressed (J); a key another action has (E, Interact's) asks first, Move It moves it, and Undo puts both back.
  ```steps
  act id=settings-bind-jump-keyboard action=press
  until find("id=settings-bind-jump-keyboard").0.name == "Press a key for Jump, or Escape to cancel"
  keys keys=j
  until find("id=settings-bind-jump-keyboard").0.name == "Jump, keyboard: J. Change"
  expect find("id=settings-undo").0.name == "Undo Jump: J"
  act id=settings-bind-jump-keyboard action=press
  keys keys=e
  until find("text=E is Interact now. Move it to Jump?").count > 0   # asked first
  act id=settings-rebind-move action=press
  until find("id=settings-bind-jump-keyboard").0.name == "Jump, keyboard: E. Change"
  expect find("id=settings-bind-interact-keyboard").0.name == "Interact, keyboard: Left click. Change"   # moved, not doubled
  menu "Edit › Undo" press
  until find("id=settings-bind-jump-keyboard").0.name == "Jump, keyboard: J. Change"
  expect find("id=settings-bind-interact-keyboard").0.name == "Interact, keyboard: E, Left click. Change"   # both back in one step
  partial: a gamepad button wasn't captured (no pad here, AB-T-0642); new-project-mac.mjs reads jump's KeyJ from game.json
  ```

- [ ] Physics layers: added by name, and the collision matrix changes both layers at once.
  ```steps
  act id=settings-new-layer action=set_value value=player commit=none
  act id=settings-add-layer action=press
  until find("id=settings-layer-1").0.value == "player"   # "default" kept first: where every collider is now
  expect find("id=settings-layer-0").0.value == "default"
  act id=settings-new-layer action=set_value value=pickup commit=none
  act id=settings-add-layer action=press
  until find("id=settings-layer-2").0.value == "pickup"
  act id=settings-collide-default-pickup action=press
  until find("id=settings-collide-default-pickup").0.value == "0"
  expect find("id=settings-undo").0.name == "Undo default passes through pickup"
  act id=settings-done action=press
  wait id=project-settings gone=true timeout_ms=5000
  partial: new-project-mac.mjs reads collides { default: [default, player], pickup: [player, pickup] } from game.json
  ```

- [ ] Export Game writes the new game's build, named by its id.
  ```steps
  act id=export-open action=press   # the Export panel, where the result line is (it stays open for row 7)
  wait id=export-game timeout_ms=5000
  menu "File › Export Game…" press
  until find("id=export-game-result").0.name matches "^Exported game cafe-dash: [0-9]+ files, [0-9]+ bytes, entry level.vrmxs, runtime vrmxg-game .*/m6-builds/cafe-dash$" timeout=120000
  expect find("role=alert").count == 0
  partial: the build is checked and played outside the app (row 9)
  ```

- [ ] New Project from "Empty game": the project opens on its one scene, plays, and exports.
  ```steps
  menu "File › New Project…" press
  wait id=new-project timeout_ms=10000
  act id=template-empty action=press
  until find("id=template-empty").0.value == "1"
  act id=new-project-title action=set_value value="Blank"
  until find("id=new-project-id").0.value == "blank"
  act id=new-project-create action=press
  wait id=new-project gone=true timeout_ms=30000
  until find("id=doc-state").0.name matches "^Scene main.vrmxs 6 nodes saved valid" timeout=60000
  expect find("id=project-name").0.name == "Project Blank"
  act id=play action=press
  until find("text=Playing · step").0.name matches "step [1-9][0-9]{2}" timeout=60000
  act id=play action=press
  until find("id=stop-result").0.name matches "^Stopped: scene as before Play" timeout=20000
  menu "File › Export Game…" press
  until find("id=export-game-result").0.name matches "^Exported game blank: .*entry main.vrmxs.*/m6-builds/blank$" timeout=120000
  ```

- [ ] File › Open Recent reopens the first project, with no panel, on its level.
  ```steps
  expect menu("File › Open Recent").items.0.name == "Blank"   # newest first
  menu "File › Open Recent › Cafe Dash" press
  until find("id=project-name").0.name == "Project Cafe Dash" timeout=30000
  until find("id=doc-state").0.name matches "^Scene level.vrmxs 14 nodes saved valid" timeout=60000
  expect find("id=open-recent").0.value == "Recent…"   # the toolbar's list too: it resets after a pick
  ```

- [ ] The builds are whole, and the game app plays each: the level to its ending (`templates-game.mjs`, outside the app).
  ```steps
  skip: run outside the app: node acceptance/m6/templates-game.mjs <container>/tmp/m6-builds/cafe-dash <container>/tmp/m6-builds/blank
  ```

- [ ] The folder panel: New Project with no hook asks where the folder goes and what it is called; Cancel makes nothing and leaves the sheet open.
  ```steps
  skip: AppProbe can't type into the system's save panel; a person tries it
  ```
