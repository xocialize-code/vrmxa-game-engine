# Export Game hand test (M5 W0): AppProbe scenario

Run `apps/editor-mac/scripts/build.sh` (it builds the runtime a game is exported with, then the editor), launch the app
once (its sandbox container must exist), then `apps/editor-mac/scripts/hand-test-fixtures.sh` (the scenario's own copy of the project, `project-game`, and a
fresh `builds/`), then `appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M5-EXPORT-GAME.scenario.md`,
then the refusal's scenario beside this one, then, from outside the app:

```sh
B="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp/builds"
node acceptance/m5/build.mjs --mac "$B/game-a" "$B/game-b" "$B/game-c" "$B/game-d" --refused "$B/game-refused" --kept "$B/game-stray"
```

Builds land in the container's `tmp/builds/<name>/` (`VRMXG_SHELL_BUILD` with a trailing `/` is a folder of builds).
Nothing here draws beyond the editor's own view, so the run needs no GPU lock.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M5-EXPORT-GAME.md
env: {"VRMXG_SHELL_PROJECT": "project-game", "VRMXG_SHELL_BUILD": "builds/"}
fresh: false
```

- [ ] Export Game writes the bundled sample as a build: the runtime, the game's files and a manifest.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved" timeout=60000   # the bundled sample's first scene
  expect find("id=project-name").0.name == "Project Sample (bundled)"   # the project inside the app, read by fetch
  act id=export-open action=press
  wait id=export-game timeout_ms=5000
  act id=game-name action=set_value value=game-a
  act id=export-game action=press
  until find("id=export-game-result").0.name matches "^Exported game cafe: [0-9]+ files, [0-9]+ bytes, entry cafe.vrmxs, runtime vrmxg-game [0-9.]+ · build [0-9a-f]{16} · manifest [0-9a-f]{16} · .*/builds/game-a$" timeout=120000   # written through build.begin, build.write, build.end
  expect find("role=alert").count == 0   # no error line
  partial: the folder's files are checked against the manifest by acceptance/m5/build.mjs, outside the app
  ```

- [ ] The same export again, into another folder, gives the same build.
  ```steps
  act id=game-name action=set_value value=game-b
  act id=export-game action=press
  until find("id=export-game-result").0.name matches "^Exported game cafe: .*/builds/game-b$" timeout=120000
  partial: the two folders are compared byte for byte, with Node's, by acceptance/m5/build.mjs --mac
  ```

- [ ] The same project opened as a folder exports the same build.
  ```steps
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project-game"   # the scenario's own copy in the container, read through /project/
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved" timeout=60000
  act id=game-name action=set_value value=game-c
  act id=export-game action=press
  until find("id=export-game-result").0.name matches "^Exported game cafe: .*/builds/game-c$" timeout=120000
  partial: compared with Node's build by acceptance/m5/build.mjs --mac
  ```

- [ ] File › Export Game… does the same from the menu.
  ```steps
  act id=game-name action=set_value value=game-d
  menu "File › Export Game…" press
  until find("id=export-game-result").0.name matches "^Exported game cafe: .*/builds/game-d$" timeout=120000
  partial: compared with Node's build by acceptance/m5/build.mjs --mac
  ```

- [ ] Exporting again into a folder that holds an earlier build replaces it, whole.
  ```steps
  act id=game-name action=set_value value=game-a
  act id=export-game action=press
  until find("id=export-game-result").0.name matches "^Exported game cafe: .*/builds/game-a$" timeout=120000   # the earlier build was there: staged, then moved in over it
  expect find("role=alert").count == 0   # no error line
  partial: that game-a is still Node's build, with no staging folder left, is checked by acceptance/m5/build.mjs --mac
  ```

- [ ] A folder that holds someone's file is refused: the result says what is in the way, and the file is left alone.
  ```steps
  act id=game-name action=set_value value=game-stray
  act id=export-game action=press
  until find("id=export-game-result").0.name matches "^Game export refused \\(not_empty\\): game-stray holds files that aren't a build's \\(notes.txt\\): export into an empty folder" timeout=120000   # the shell's refusal, in the result line
  partial: that notes.txt is still there, alone, is checked by acceptance/m5/build.mjs --kept
  ```
