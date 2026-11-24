# Export Game hand test (M5 W0): AppProbe scenario, a project with an unlicensed file

Run after `HAND-TEST-M5-EXPORT-GAME.scenario.md` (same build, same fixtures):
`appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M5-EXPORT-GAME-refusal.scenario.md`.
`hand-test-fixtures.sh` makes `project-unlicensed`: the sample with `props/found-on-the-web.glb`, which its `game.json`
includes and its `LICENCES.md` doesn't list.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M5-EXPORT-GAME.md
env: {"VRMXG_SHELL_PROJECT": "project-unlicensed", "VRMXG_SHELL_BUILD": "builds/"}
fresh: false
```

- [ ] A file with no row in LICENCES.md stops the export: the result names the file, and no build folder is made.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved" timeout=60000
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project-unlicensed"
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved" timeout=60000
  act id=export-open action=press
  wait id=export-game timeout_ms=5000
  act id=game-name action=set_value value=game-refused
  act id=export-game action=press
  until find("id=export-game-result").0.name matches "^Game export refused \\(no_licence\\): no row in LICENCES.md for props/found-on-the-web.glb" timeout=120000   # the refusal names the file
  partial: that no folder was made is checked by acceptance/m5/build.mjs --refused, outside the app
  ```
