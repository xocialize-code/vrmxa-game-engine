# Hot reload (M6 W2): AppProbe scenario

Run `apps/editor-mac/scripts/build.sh`, launch the app once (its container must exist), then
`apps/editor-mac/scripts/hand-test-fixtures-m6-hot-reload.sh` (the scenario's own copy of the sample, `project-w2-hot-reload`,
with the Morning Rush's `game.json` at its root, and the edit helper beside it), then, holding the GPU lock,
`appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M6-HOT-RELOAD.scenario.md`. Each row's
`screenshot path=/tmp/vrmxg-w2-hot-reload/edit-<name>.png` is the trigger: the helper (`scripts/hot-reload-edits.mjs`)
then saves that edit into the copy's `game/behaviours.js`, and the picture is kept as the moment before it. The rows run
in order in one launch (`fresh: false`): each builds on the last.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M6-HOT-RELOAD.md
env: {"VRMXG_SHELL_PROJECT": "project-w2-hot-reload", "VRMXG_SHELL_SETTINGS": "w2-settings.json", "VRMXG_SHELL_CACHE": "w2-cache"}
fresh: false
```

- [ ] The level opens from the copy, with an edit made before Play (a node added) to undo afterwards.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project-w2-hot-reload"
  act id=file-name action=set_value value=game/level.vrmxs
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene game/level.vrmxs [0-9]+ nodes saved valid " timeout=90000   # the level, with its tableZones known (the game's module declares them)
  set nodes = find("id=doc-state").0.name
  act id=add-node action=press
  until find("id=undo").0.name matches "^Undo Add " timeout=5000
  set undoName = find("id=undo").0.name
  expect find("id=doc-state").0.name matches "unsaved changes"   # an edit waiting to be saved or undone
  expect find("id=behaviour-error").count == 0   # the module declared itself
  ```

- [ ] Play: the editor watches the game's behaviours module and the module it imports.
  ```steps
  act id=play action=press
  until find("text=Playing · step").0.name matches "step [1-9][0-9]{2}" timeout=60000
  until find("id=reload-state").0.name == "Hot reload watching game/behaviours.js, behaviours.js" timeout=10000   # the game's module, then the sample's it re-exports (the order the module graph reads them)
  ```

- [ ] A saved edit takes effect at once: the regulars' tables say "Hot reloaded, version two", their state is kept, and the world runs on from the step it was on.
  ```steps
  expect find("text='Hot reloaded'").count == 0   # nobody says it before the edit
  screenshot path=/tmp/vrmxg-w2-hot-reload/edit-say.png
  until find("id=reload-state").0.name matches "reloaded 1 time, last at step [1-9][0-9]+: .*tableZone kept" timeout=10000   # its declared state shape is unchanged
  set at = find("id=reload-state").0.name
  until find("text='Hot reloaded, version two'").count > 0 timeout=10000   # the new code runs: a regular says the line (every four seconds)
  shot "the line from the edited code"
  expect find("id=behaviour-error").count == 0
  expect find("text=Playing · step").0.name matches "step [1-9][0-9]{2,}"   # still playing: no new world
  partial: the regulars' tableZone state (inside, next, done) being carried over is read in reload.test.mjs, not here: the editor doesn't show a behaviour's state
  ```

- [ ] A throwing edit shows its error in its own field, and the code from before runs on.
  ```steps
  screenshot path=/tmp/vrmxg-w2-hot-reload/edit-throw.png
  until find("id=behaviour-error").count == 1 timeout=10000
  expect find("id=behaviour-error").0.name matches "didn't reload at step [0-9]+, so the code from before is still running: .*broken on purpose"   # the module's own error
  until find("id=reload-state").0.name matches "reloaded 1 time.* · 1 failed" timeout=5000
  pause 3000   # longer than a caption stays up (about 2.3 s): a line seen after this was said after the failed reload
  until find("text='Hot reloaded, version two'").count > 0 timeout=10000   # version two says its line again: the old code runs on
  shot "the error, and the line from the code before it"
  expect find("text=Playing · step").0.name matches "step [1-9][0-9]{2,}"
  ```

- [ ] An edit that changes tableZone's declared state restarts it on its nodes, and clears the error.
  ```steps
  screenshot path=/tmp/vrmxg-w2-hot-reload/edit-shape.png
  until find("id=reload-state").0.name matches "reloaded 2 times, last at step [0-9]+: .*tableZone restarted" timeout=10000   # a key added to its declared state
  until find("id=behaviour-error").count == 0 timeout=5000   # a reload that took clears it
  until find("text='Hot reloaded, version three'").count > 0 timeout=10000
  shot "version three"
  ```

- [ ] Stop puts the scene back as it was, and Undo and Save are unaffected by the reloads.
  ```steps
  screenshot path=/tmp/vrmxg-w2-hot-reload/edit-restore.png
  until find("id=reload-state").0.name matches "reloaded 3 times.*tableZone restarted" timeout=10000   # the original text, its shape back
  act id=play action=press
  until find("id=stop-result").0.name matches "^Stopped: scene as before Play" timeout=10000
  expect find("id=undo").0.name == $undoName   # the edit made before Play is still the one to undo
  act id=undo action=press
  until find("id=doc-state").0.name == $nodes timeout=5000   # undone: the scene as it opened, saved
  act id=redo action=press
  until find("id=undo").0.name == $undoName timeout=5000
  act id=save action=press
  until find("id=saved").0.name matches "^Saved game/level.vrmxs · [0-9]+ bytes" timeout=10000
  expect find("id=doc-state").0.name matches " saved valid "
  expect find("id=behaviour-error").count == 0
  ```

- [ ] The last play is listed as reloaded in Export's takes, and baking it is refused: it can't be replayed.
  ```steps
  act id=export-open action=press
  until find("id=export-panel").count == 1 timeout=5000
  act id=export-take action=focus
  pause 300
  keys down   # opens the select's menu
  until find("surface=app role=menuitem name='reloaded: can'").count == 1 timeout=5000   # the last play: "Last play (… s, reloaded: can't be replayed)"
  act surface=app role=menuitem name="reloaded: can" action=press
  until find("id=export-take").0.value matches "^Last play .*reloaded: can't be replayed" timeout=5000
  act id=export-bake action=press
  until find("text='so it can'").count > 0 timeout=5000   # the error line: "… reloaded the project's behaviours while it ran, so it can't be replayed exactly"
  expect find("text='be replayed exactly: play it again without reloading'").count > 0   # refused, with why: nothing was baked
  expect find("id=doc-state").0.name matches "^Scene game/level.vrmxs "   # still the level: no sequence was made and opened
  partial: exporting a video of it is refused by the same check (takeWorld), tested in reload.test.mjs and the input service's tests, not pressed here
  ```
