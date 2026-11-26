# New Project through the folder panel, and Open Recent after a relaunch (M6 W3): AppProbe scenario

Run `apps/editor-mac/scripts/hand-test-fixtures-m6-new-project.sh` first (it empties `/private/tmp/vrmxg-m6-outside`),
then `appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M6-NEW-PROJECT-recent.scenario.md`.

No new-project hook here: the project is made through the system's save panel, which `VRMXG_SHELL_PANEL_DIR` only
starts in a folder outside the app's sandbox container; the steps press the panel's own Cancel and Create buttons. A
folder the person picks there is one the sandbox grants for this launch only: after a relaunch the app reaches it
through the security-scoped bookmark the shell kept, which is what the review of PR #52 asked to see work.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M6-NEW-PROJECT.md
env: {"VRMXG_SHELL_PANEL_DIR": "/private/tmp/vrmxg-m6-outside"}
fresh: false
```

- [ ] The folder panel: New Project with no hook asks where the folder goes and what it is called; Cancel makes nothing and leaves the sheet open.
  ```steps
  wait id=new-project-open enabled=true timeout_ms=40000
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved" timeout=60000
  menu "File › New Project…" press
  wait id=new-project timeout_ms=10000
  act id=new-project-title action=set_value value="Outside Game"
  act id=new-project-create action=press
  wait window=save-panel id=OKButton timeout_ms=15000
  expect find("surface=app id=saveAsNameTextField").0.value == "Outside Game"   # the name the sheet gave
  expect find("surface=app role=popupbutton name=Where").0.value == "vrmxg-m6-outside"   # where the panel starts here
  act window=save-panel id=CancelButton action=press
  until find("id=new-project-create").0.name == "Create project" timeout=10000   # back on the sheet, nothing made
  expect find("id=new-project-error").count == 0   # Cancel isn't an error
  expect find("id=new-project").count == 1
  partial: that nothing was written is checked by the next row's folder listing (the project folder is new there)
  ```

- [ ] File › Open Recent reopens a project outside the app's container after a relaunch (the sandbox's grant kept as a bookmark).
  ```steps
  act id=new-project-create action=press
  wait window=save-panel id=OKButton timeout_ms=15000
  act window=save-panel id=OKButton action=press
  until find("id=project-name").0.name == "Project Outside Game" timeout=30000
  until find("id=doc-state").0.name matches "^Scene level.vrmxs 14 nodes saved valid" timeout=60000
  relaunch
  wait id=new-project-open enabled=true timeout_ms=40000
  until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved" timeout=60000   # a fresh launch: the bundled sample
  expect menu("File › Open Recent").items.0.name == "Outside Game"
  expect menu("File › Open Recent").items.0.enabled == true   # found through its bookmark, inside its security scope
  menu "File › Open Recent › Outside Game" press
  until find("id=project-name").0.name == "Project Outside Game" timeout=30000
  until find("id=doc-state").0.name matches "^Scene level.vrmxs 14 nodes saved valid" timeout=60000
  expect find("role=alert").count == 0
  ```
