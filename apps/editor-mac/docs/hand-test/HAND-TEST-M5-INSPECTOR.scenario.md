# Inspector widgets hand test (M5 W4): AppProbe scenario

Run `apps/editor-mac/scripts/build.sh`, launch the app once (its sandbox container must exist), then
`apps/editor-mac/scripts/hand-test-fixtures-m5-inspector.sh` (the scenario's own copy of the sample, `project-inspector`),
then `appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M5-INSPECTOR.scenario.md`, holding
`acceptance/gpu-lock.mjs` while it runs. Fields carry their value in AX value and their state in their accessible
name: `intensity (mixed values)`, `lines, 2 rows`, `Hidden by their conditions: shadowPreset, shadowUpdate`. Nested
fields have ids from their path (`#prop-lines-1-text`, `#prop-lines-1-up`). No row types JSON. A web view's `<select>`
doesn't open its menu for AppProbe's press, so rows choose an option by focusing it and typing its first letters.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M5-INSPECTOR.md
env: {"VRMXG_SHELL_PROJECT": "project-inspector"}
fresh: false
```

- [ ] A scene for the inspector: two point lights and a dialogue, added from the toolbar.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project-inspector"
  act id=file-name action=set_value value=inspector.vrmxs
  act id=new-scene action=press
  until find("id=doc-state").0.name matches "^Scene inspector.vrmxs 1 nodes"
  act role=popupbutton name="Node type to add" action=focus   # a web view's select: its menu doesn't open headless, type-ahead picks
  pause 1500   # the web view's type-ahead keeps what was typed for about a second: start a fresh search
  keys text=Po
  until find("role=popupbutton name='Node type to add'").0.value == "PointLight"
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add pointlight"
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add pointlight-2"
  act id=file-name action=focus   # move focus off the menu first, so focusing it again takes
  act role=popupbutton name="Node type to add" action=focus
  pause 1500   # the web view's type-ahead keeps what was typed for about a second: start a fresh search
  keys text=Dia
  until find("role=popupbutton name='Node type to add'").0.value == "Dialogue"
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add dialogue"
  expect find("id=doc-state").0.name matches "^Scene inspector.vrmxs 4 nodes unsaved changes valid "   # root, two lights, the dialogue
  ```

- [ ] A value typed with arithmetic commits its result: `1.5 * 2 + 0.25` in a light's intensity is 3.25, one undo step.
  ```steps
  act id=node-pointlight action=press
  until find("id=inspector-id").0.name == "Node pointlight"
  act id=prop-intensity action=set_value value="1.5 * 2 + 0.25"
  until find("id=undo").0.name == "Undo Set pointlight.intensity"   # one step, named after the prop
  expect find("id=prop-intensity").0.value == "3.25"   # the arithmetic's result, not the text
  act id=prop-range action=set_value value="nonsense"
  pause 500
  expect find("id=prop-range").0.value == "10"   # not a number: the field goes back to its value, nothing is set
  expect find("id=undo").0.name == "Undo Set pointlight.intensity"
  ```

- [ ] Two lights edited at once: the differing intensity reads as mixed, a typed value sets both as one undo step, and one Undo restores both.
  ```steps
  act id=inspector-select-type action=press   # "Select every PointLight": multi-select without a modifier key
  until find("id=inspector-id").0.name == "2 nodes: pointlight, pointlight-2"
  expect find("id=prop-intensity").0.name == "intensity (mixed values)"   # 3.25 and the default 1
  expect find("id=prop-range").0.name == "range"   # both 10: not mixed
  act id=prop-intensity action=set_value value=2*3
  until find("id=undo").0.name == "Undo Set intensity on 2 nodes"   # one command for both
  expect find("id=prop-intensity").0.name == "intensity"
  expect find("id=prop-intensity").0.value == "6"
  act id=undo action=press   # the toolbar's Undo: after set_value, Edit › Undo would undo typing in the focused field
  until find("id=prop-intensity").0.name == "intensity (mixed values)"   # one Undo: both back
  act id=node-pointlight action=press
  until find("id=inspector-id").0.name == "Node pointlight"
  expect find("id=prop-intensity").0.value == "3.25"
  act id=node-pointlight-2 action=press
  until find("id=inspector-id").0.name == "Node pointlight-2"
  expect find("id=prop-intensity").0.value == "1"   # its default, as before
  act id=inspector-also action=focus   # "Also select": the other way to add to the selection
  pause 1500   # the web view's type-ahead keeps what was typed for about a second: start a fresh search
  keys text=pointlight
  until find("id=inspector-id").0.name == "2 nodes: pointlight-2, pointlight"
  ```

- [ ] A list of structs edited row by row: a dialogue's lines added, typed, moved and removed, each one undo step, no JSON typed.
  ```steps
  act id=node-dialogue action=press
  until find("id=inspector-id").0.name == "Node dialogue"
  expect find("id=prop-lines").0.name == "lines, 0 rows"
  act id=prop-lines-add action=press
  until find("id=prop-lines").0.name == "lines, 1 row"
  expect find("id=undo").0.name == "Undo Set dialogue.lines"
  act id=prop-lines-0-text action=set_value value="Morning! What can I get you?"
  until find("id=prop-lines-0-text").0.value == "Morning! What can I get you?"
  act id=prop-lines-add action=press
  until find("id=prop-lines").0.name == "lines, 2 rows"
  act id=prop-lines-1-text action=set_value value="A flat white, please."
  until find("id=prop-lines-1-text").0.value == "A flat white, please."
  act id=prop-lines-1-up action=press   # move the second line up
  until find("id=prop-lines-0-text").0.value == "A flat white, please."
  act id=undo action=press   # the toolbar's Undo: after set_value, Edit › Undo would undo typing in the focused field
  until find("id=prop-lines-0-text").0.value == "Morning! What can I get you?"   # one Undo puts the move back, and only the move
  expect find("id=prop-lines-1-text").0.value == "A flat white, please."
  act id=prop-lines-0-choices-set action=press   # a nested list in a row: the first line offers a choice
  until find("id=prop-lines-0-choices-0-text").count == 1
  act id=prop-lines-0-choices-0-text action=set_value value="Coffee, please"
  until find("id=prop-lines-0-choices-0-text").0.value == "Coffee, please"
  act id=prop-lines-1-remove action=press
  until find("id=prop-lines").0.name == "lines, 1 row"
  act id=undo action=press   # the toolbar's Undo: after set_value, Edit › Undo would undo typing in the focused field
  until find("id=prop-lines").0.name == "lines, 2 rows"   # the removed row back, as it was
  expect find("id=prop-lines-1-text").0.value == "A flat white, please."
  expect find("id=doc-state").0.name matches " valid "   # every step kept the scene valid
  ```

- [ ] A field hidden by its condition keeps its value through save and reopen, byte for byte.
  ```steps
  act id=node-pointlight action=press
  until find("id=inspector-id").0.name == "Node pointlight"
  expect find("id=props-hidden").0.name == "Hidden by their conditions: shadowPreset, shadowUpdate"   # a point light casts no shadow by default
  act id=prop-castShadow action=press
  until find("id=prop-shadowPreset").count == 1   # shadowPreset applies now (visibleIf: castShadow)
  act id=prop-shadowPreset action=focus
  pause 1500   # the web view's type-ahead keeps what was typed for about a second: start a fresh search
  keys text=hi
  until find("id=undo").0.name == "Undo Set pointlight.shadowPreset"
  act id=prop-castShadow action=press
  until find("id=prop-shadowPreset").count == 0   # hidden again
  expect find("id=props-hidden").0.name == "Hidden by their conditions: shadowPreset, shadowUpdate"
  act id=save action=press
  until find("id=saved").0.name matches "^Saved inspector.vrmxs · [0-9]+ bytes · [0-9a-f]{16}$"
  set saved = find("id=doc-state").0.name
  act id=verify action=press
  until find("id=verify-result").0.name == "Reopened inspector.vrmxs: same bytes as saved, valid"   # read back from disk
  act id=open-file action=press   # open it again from the project
  until find("id=doc-state").0.name == $saved timeout=40000   # the same document, by hash
  act id=node-pointlight action=press
  until find("id=inspector-id").0.name == "Node pointlight"
  act id=prop-castShadow action=press
  until find("id=prop-shadowPreset").count == 1
  expect find("id=prop-shadowPreset").0.value == "high"   # the hidden value came through the file
  ```
