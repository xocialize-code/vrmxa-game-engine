# Editor hand test (M1 W7): AppProbe scenario

Run `apps/editor-mac/scripts/build.sh`, launch the app once (its sandbox container must exist), then
`apps/editor-mac/scripts/hand-test-fixtures.sh` (a fresh copy of the sample project in the container's temporary folder,
which the shell's `VRMXG_SHELL_PROJECT` hook opens without the panel), then
`appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M1-EDITOR.scenario.md`. Readouts carry their value
in their accessible name (`Scene built-cafe.vrmxs 6 nodes unsaved changes valid hash …`, `Undo Move mira`); WebKit's
element ids read as identifiers (`#doc-state`, `#node-mira`, `#pos-x`, `#prop-walkSpeed`, `#add-sets-cafe-glb`).

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M1-EDITOR.md
env: {"VRMXG_SHELL_PROJECT": "project"}
fresh: false
```

- [ ] The project opens from a folder (Open Project…): its name shows and its assets are listed.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  until find("id=doc-state").0.name matches "^Scene cafe.vrmxs"   # the bundled sample loaded first
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project"   # the folder mounted through project.open
  expect find("id=add-sets-cafe-glb").count == 1   # the asset list is the project's
  expect find("id=add-items-sword-pickup-vrmxi").count == 1
  ```

- [ ] A new scene is built from the asset list: the set, two characters, two items, each one Add; nothing errors.
  ```steps
  act id=new-scene action=press
  until find("id=doc-state").0.name matches "^Scene built-cafe.vrmxs 1 nodes"   # an empty scene: its root
  act id=add-sets-cafe-glb action=press
  until find("id=doc-state").0.name matches " 2 nodes "
  act id=add-characters-mira-vrmxa action=press
  until find("id=doc-state").0.name matches " 3 nodes "
  act id=add-characters-hana-vrmxa action=press
  until find("id=doc-state").0.name matches " 4 nodes "
  act id=add-items-cafe-door-vrmxi action=press
  until find("id=doc-state").0.name matches " 5 nodes "
  act id=add-items-sword-pickup-vrmxi action=press
  until find("id=doc-state").0.name matches " 6 nodes unsaved changes valid "   # all five placed, the scene valid
  expect find("id=undo").0.name == "Undo Add sword-pickup"   # each Add is one undo step
  pause 2500
  expect find("role=statictext text=Error").count == 0   # the edit view built without an error
  shot "built"
  ```

- [ ] Nodes move and change in the inspector: position, rotation, name and a prop, each one undo step named after it.
  ```steps
  act id=node-mira action=press
  until find("id=inspector-id").0.name == "Node mira"
  act id=pos-x action=set_value value=-0.5
  until find("id=undo").0.name == "Undo Move mira"   # one step, named after the node
  act id=pos-z action=set_value value=9.5
  act id=rot-y action=set_value value=180
  until find("id=undo").0.name == "Undo Rotate mira"
  act id=node-hana action=press
  until find("id=inspector-id").0.name == "Node hana"
  act id=field-name action=set_value value=Hana
  until find("id=undo").0.name == "Undo Rename hana"
  act id=prop-walkSpeed action=set_value value=1.2
  until find("id=undo").0.name == "Undo Set hana.walkSpeed"   # a prop from the registry-generated inspector
  shot "edited"
  ```

- [ ] The tree reparents and deletes: a door moves under a new group, deleting the group deletes the door with it.
  ```steps
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add node3d"
  act id=node-cafe-door action=press
  until find("id=inspector-id").0.name == "Node cafe-door"
  act id=field-parent action=press
  act role=menuitem name=node3d exact=true surface=app action=press
  until find("id=undo").0.name == "Undo Move cafe-door under node3d"
  act id=node-node3d action=press
  act id=delete action=press
  until find("id=undo").0.name == "Undo Delete node3d"
  expect find("id=node-cafe-door").count == 0   # the door went with its group
  expect find("id=doc-state").0.name matches " 5 nodes "   # root, set, two characters, the sword
  ```

- [ ] Undo and redo walk the history from the Edit menu and the toolbar, and come back to exactly the same scene.
  ```steps
  set before = find("id=doc-state").0.name
  menu "Edit › Undo" press
  until find("id=node-cafe-door").count == 1   # the delete undone from the Edit menu: group and door back
  menu "Edit › Undo" press
  until find("id=redo").0.name == "Redo Move cafe-door under node3d"
  act id=undo action=press
  until find("id=redo").0.name == "Redo Add node3d"
  act id=redo action=press
  act id=redo action=press
  act id=redo action=press
  until find("id=doc-state").0.name == $before   # the same scene, by hash
  menu "Edit › Undo" press
  until find("id=node-cafe-door").count == 1   # keep the door: undo the delete again
  ```

- [ ] Save writes the scene into the project; reopening it from disk gives the same bytes, and it validates.
  ```steps
  act id=save action=press
  until find("id=saved").0.name matches "^Saved built-cafe.vrmxs · [0-9]+ bytes · [0-9a-f]{16}$"
  until find("id=doc-state").0.name matches " saved valid "
  act id=verify action=press
  until find("id=verify-result").0.name == "Reopened built-cafe.vrmxs: same bytes as saved, valid"   # read back from disk through /project/
  shot "saved"
  ```

- [ ] Play runs the scene; Stop leaves the scene exactly as before Play (same hash), and the edit view unchanged.
  ```steps
  set before = find("id=doc-state").0.name
  act id=play action=press
  until find("id=play").0.name == "Stop" timeout=40000
  pause 2000
  shot "playing"
  act id=play action=press
  until find("id=stop-result").0.name matches "^Stopped: scene as before Play \\([0-9a-f]{16}\\), view unchanged$"
  expect find("id=doc-state").0.name == $before   # the document byte for byte as before Play
  ```
