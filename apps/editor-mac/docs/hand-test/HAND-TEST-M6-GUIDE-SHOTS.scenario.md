# The editor guide's pictures (M6 W9): AppProbe scenario

The editor guide ([`docs/guide/editor.md`](../../../../docs/guide/editor.md)) shows what the tutorial's scenario
(`HAND-TEST-M6-TUTORIAL`) doesn't reach: a prefab instance's override, the viewport's aids and the assets panel. This
takes those pictures at the commit the guide describes, and checks the guide's words on the way. Run
`apps/editor-mac/scripts/build.sh`, then `apps/editor-mac/scripts/hand-test-fixtures-m6-guide.sh` (the scenario's own
copy of the sample, `w9-guide-project`, with `w9-tour.vrmxs`), then, holding the GPU lock (thumbnails draw on an
offline host), `appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M6-GUIDE-SHOTS.scenario.md`.
Nothing is saved: every edit is undone.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M6-GUIDE-SHOTS.md
env: {"VRMXG_SHELL_PROJECT": "w9-guide-project", "VRMXG_SHELL_SETTINGS": "w9-guide-settings.json", "VRMXG_SHELL_CACHE": "w9-guide-cache"}
fresh: false
```

- [ ] Prefabs and overrides: a door's hinge, folded open in the tree, overridden in the inspector; the dot and the Overrides list; the dot reverts it.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  act id=open-project action=press
  until find("id=project-name").0.name == "Project w9-guide-project" timeout=30000
  act id=file-name action=set_value value=w9-tour.vrmxs
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene w9-tour.vrmxs 10 nodes saved valid" timeout=60000
  set CLEAN = find("id=doc-state").0.name
  act id=fold-door-a action=press   # "Fold it open in the tree to see its nodes"
  until find("id=node-door-a/hinge").count == 1
  act id=node-door-a/hinge action=press
  until find("id=inspector-inner").count == 1   # "Selecting one edits it as an override of that instance only"
  act id=prop-mass action=set_value value=20
  until find("id=undo").0.name == "Undo Override door-a/hinge.mass"
  expect find("id=ov-mass").0.name == "mass overrides the prefab (prefab: 12): revert"   # "a dot marks each overridden prop, with the prefab's own value beside it"
  expect find("id=overrides-summary").count == 1   # "The instance's Overrides list"
  shot "editor-override"
  act id=ov-mass action=press   # "Click the dot to revert"
  until find("id=ov-mass").count == 0
  act id=undo action=press
  act id=undo action=press
  until find("id=doc-state").0.name == $CLEAN timeout=5000
  ```

- [ ] The viewport's aids: an area's handles, then the selected camera's picture in picture.
  ```steps
  act id=node-zone action=press
  until find("id=inspector-id").0.name == "Node zone"
  pause 1500
  shot "editor-handles"
  act id=node-cam action=press
  until find("id=inspector-id").0.name == "Node cam"
  pause 1500
  shot "editor-preview"
  expect find("id=doc-state").0.name == $CLEAN   # selecting changes nothing
  ```

- [ ] The assets panel: thumbnails, type filters and search.
  ```steps
  until find("text=thumbnails").count > 0 timeout=60000
  act id=assets-search action=set_value value=door
  pause 3000
  shot "editor-assets"
  act id=assets-search action=set_value value=" "
  ```
