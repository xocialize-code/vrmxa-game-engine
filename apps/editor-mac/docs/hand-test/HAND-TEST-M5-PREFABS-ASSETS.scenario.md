# Prefabs and assets hand test (M5 W6): AppProbe scenario

Run `apps/editor-mac/scripts/build.sh` and `apps/editor-mac/scripts/hand-test-fixtures-m5-prefabs-assets.sh` (the
scenario's own folder in the app's container, `project-w6-prefabs`: the sample with `w6-doors.vrmxs`, three instances of
`prefabs/door.vrmxs` and a bench; and its own settings file and thumbnail cache, so the operator's editor settings are
never touched), then hold the GPU lock while the scenario draws (thumbnails draw on an offline host):

```sh
node acceptance/gpu-lock.mjs run --who prefabs-hand-test -- appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M5-PREFABS-ASSETS.scenario.md
```

Every row types no JSON: the overrides are made in the inspector's fields, files come from the assets panel. Row 4
drags with the **real pointer** (`pointer drag`: an HTML drag from a tile to the inspector's slot, which only real mouse
events start); it brings the app forward and moves the cursor for a few seconds, so the Mac must be unlocked. Row 6
relaunches the app to show the panels' sizes were kept. Run the fixture script again before another full run: rows 2
and 6 save into the fixture's folder.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M5-PREFABS-ASSETS.md
env: {"VRMXG_SHELL_PROJECT": "project-w6-prefabs", "VRMXG_SHELL_SETTINGS": "w6-settings.json", "VRMXG_SHELL_CACHE": "w6-cache"}
fresh: false
```

- [ ] An overridden prop on a door instance is marked; its dot reverts it, and the scene's bytes are a never-overridden instance's again.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project-w6-prefabs" timeout=30000
  act id=file-name action=set_value value=w6-doors.vrmxs   # WebKit's popup menus can't be picked over accessibility: open by name
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene w6-doors.vrmxs 7 nodes saved valid" timeout=60000
  set CLEAN = find("id=doc-state").0.name
  expect find("id=node-door-a").0.name contains "6 inside"   # an instance's prefab nodes, folded at first
  act id=fold-door-a action=press
  until find("id=node-door-a/hinge").count == 1   # the prefab's hinge, addressed through the instance
  act id=node-door-a/hinge action=press
  until find("id=inspector-inner").count == 1   # the inspector says it edits a prefab node, as overrides
  expect find("id=prop-mass").0.value == "12"   # the prefab's own mass
  expect find("id=ov-mass").count == 0   # not overridden yet: no mark
  act id=prop-mass action=set_value value=20
  until find("id=undo").0.name == "Undo Override door-a/hinge.mass"   # one undo step, an override
  expect find("id=ov-mass").0.name == "mass overrides the prefab (prefab: 12): revert"   # the mark, with the prefab's value
  expect find("id=overrides-summary").0.name matches "^door-a: 1 overrides of prefabs/door.vrmxs; 3 instances of it in this scene"   # the diff view
  expect find("id=ov-row-hinge_20_props_2e_mass").0.name == "hinge mass: 12 to 20"   # the diff's row: field, prefab value, instance value
  expect find("id=node-door-a").0.name contains "overridden"   # the tree marks the instance
  shot "door-a/hinge's mass overridden: the dot, the Overrides list"
  act id=ov-mass action=press   # the dot reverts
  until find("id=ov-mass").count == 0
  expect find("id=prop-mass").0.value == "12"   # the prefab's value again
  expect find("id=undo").0.name == "Undo Revert door-a/hinge.mass"   # one undo step
  expect find("id=doc-state").0.name == $CLEAN   # saved and the same hash: the bytes of a door never overridden
  act id=undo action=press
  until find("id=ov-mass").count == 1   # Undo brings the override back
  act id=undo action=press
  until find("id=doc-state").0.name == $CLEAN   # and the first Undo of the edit leaves the scene as it opened
  ```

- [ ] Apply writes the override into the prefab after a sheet that names the file and its instances; every other instance follows; Undo reverses it; Save writes the prefab's file.
  ```steps
  act id=node-door-a/hinge action=press
  until find("id=inspector-inner").count == 1
  act id=prop-mass action=set_value value=20
  until find("id=undo").0.name == "Undo Override door-a/hinge.mass"
  act id=ov-apply-hinge_20_props_2e_mass action=press
  until find("id=ask").count == 1   # the sheet before anything is written
  expect find("id=ask").0.name == "Apply to prefabs/door.vrmxs?"   # which file
  expect find("id=ask-text").0.name contains "3 in this scene"   # how many instances follow
  shot "the Apply sheet"
  act id=ask-apply action=press
  until find("id=undo").0.name == "Undo Apply door-a/hinge.mass to prefabs/door.vrmxs" timeout=5000   # one undo step across the scene and the prefab
  expect find("id=ov-mass").count == 0   # the override is gone: the prefab has the value now
  expect find("id=prop-mass").0.value == "20"
  expect find("id=doc-state").0.name contains "unsaved changes"   # the prefab is written on Save
  act id=fold-door-b action=press
  until find("id=node-door-b/hinge").count == 1
  act id=node-door-b/hinge action=press
  until find("id=inspector-id").0.name == "Node door-b/hinge"
  expect find("id=prop-mass").0.value == "20"   # another instance follows
  expect find("id=ov-mass").count == 0   # and isn't overriding: it is the prefab's value
  act id=undo action=press
  until find("id=prop-mass").0.value == "12" timeout=5000   # Undo puts the prefab back: door-b reads 12 again
  act id=redo action=press
  until find("id=prop-mass").0.value == "20" timeout=5000
  act id=save action=press
  until find("id=doc-state").0.name matches "^Scene w6-doors.vrmxs 7 nodes saved valid" timeout=10000   # the scene and the prefab saved
  act id=file-name action=set_value value=prefabs/door.vrmxs   # open the prefab's own file from disk
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene prefabs/door.vrmxs 6 nodes saved valid" timeout=60000
  act id=node-hinge action=press
  until find("id=inspector-id").0.name == "Node hinge"
  expect find("id=prop-mass").0.value == "20"   # the prefab's file holds the applied mass
  ```

- [ ] The assets panel shows a thumbnail for each placeable asset; filtering to Items lists only `.vrmxi` files; search narrows it.
  ```steps
  act id=file-name action=set_value value=w6-doors.vrmxs
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene w6-doors.vrmxs 7 nodes" timeout=60000
  until find("id=assets-status").0.name matches "^Thumbnails: [0-9]+ thumbnails" timeout=180000   # every placeable file drawn (or read from the cache)
  expect find("id=asset-props-bench-glb").0.name contains ", thumbnail"   # a model
  expect find("id=asset-items-stool-vrmxi").0.name contains ", thumbnail"   # an item
  expect find("id=asset-prefabs-door-vrmxs").0.name contains ", thumbnail"   # a prefab
  expect find("id=asset-characters-mira-vrmxa").0.name contains ", thumbnail"   # a character (its bundle's own)
  expect find("id=asset-sounds-switch-wav").0.name contains ", thumbnail"   # a sound (its waveform)
  shot "the assets panel with thumbnails"
  act id=assets-filter-items action=press
  until find("id=asset-props-bench-glb").count == 0   # a model isn't an item
  expect find("id=asset-items-stool-vrmxi").count == 1
  expect find("id=asset-items-cafe-door-vrmxi").count == 1
  expect find("id=asset-characters-mira-vrmxa").count == 0
  expect find("id=asset-sounds-switch-wav").count == 0
  act id=assets-filter-all action=press
  act id=assets-search action=set_value value="door prefab"
  until find("id=asset-props-bench-glb").count == 0
  expect find("id=asset-prefabs-door-vrmxs").count == 1   # every word matches
  expect find("id=asset-prefabs-double-door-vrmxs").count == 1
  expect find("id=asset-items-cafe-door-vrmxi").count == 0   # an item named door isn't a prefab
  act id=assets-search action=set_value value=""
  act id=assets-folder-prefabs action=press   # a folder of the project
  until find("id=asset-props-bench-glb").count == 0
  expect find("id=asset-prefabs-door-vrmxs").count == 1
  act id=assets-folder-all action=press
  until find("id=asset-props-bench-glb").count == 1
  ```

- [ ] A `.glb` dropped on a Model's asset slot sets it as one undo step; a `.wav` dropped there is refused; the picked file's Use does the same as a drop.
  ```steps
  act id=node-bench action=press
  until find("id=slot-asset").0.name == "Asset slot: props/bench.glb; takes glb"   # the Model's asset slot and what it takes
  act id=assets-search action=set_value value=street-lamp   # one tile left, where the pointer can reach it
  until find("id=asset-props-street-lamp-glb").count == 1
  find id=asset-props-street-lamp-glb
  set FROM = $.0.ref
  find id=slot-asset
  set TO = $.0.ref
  pointer drag ref="${FROM}" to_ref="${TO}" steps=30   # the real pointer: the lamp's tile onto the slot
  until find("id=undo").0.name == "Undo Set bench.asset" timeout=5000   # one undo step
  expect find("id=slot-asset").0.name matches "^Asset slot: props/street-lamp.glb"
  act id=assets-search action=set_value value=switch.wav
  until find("id=asset-sounds-switch-wav").count == 1
  find id=asset-sounds-switch-wav
  set FROM = $.0.ref
  find id=slot-asset
  set TO = $.0.ref
  pointer drag ref="${FROM}" to_ref="${TO}" steps=30   # a sound onto a Model's slot
  pause 800
  expect find("id=slot-asset").0.name matches "^Asset slot: props/street-lamp.glb"   # refused: the slot is unchanged
  expect find("id=undo").0.name == "Undo Set bench.asset"   # no step was made
  act id=assets-search action=set_value value=bench
  until find("id=asset-props-bench-glb").count == 1
  act id=asset-props-bench-glb action=press   # pick the bench's file (no drag)
  until find("id=slot-asset-use").0.name == "Use props/bench.glb as the asset"
  act id=slot-asset-use action=press
  until find("id=slot-asset").0.name matches "^Asset slot: props/bench.glb" timeout=5000
  act id=asset-sounds-switch-wav action=press
  pause 300
  act id=assets-search action=set_value value=""
  ```

- [ ] Tree search keeps the matches and their ancestors (an instance's inner nodes included) and clears back to the whole tree.
  ```steps
  act id=tree-search action=set_value value=type:collider
  until find("id=tree-matches").0.name == "3 matching nodes"   # each door's panel
  expect find("id=node-door-c/panel").count == 1   # an inner node, shown though its instance is folded
  expect find("id=node-door-c").count == 1   # its ancestors stay
  expect find("id=node-bench").count == 0   # the rest goes
  act id=tree-search action=set_value value=bench
  until find("id=tree-matches").0.name == "1 matching nodes"
  expect find("id=node-bench").0.name contains "matches the search"
  act id=tree-search action=set_value value=""
  until find("id=tree-matches").count == 0
  expect find("id=node-sun").count == 1   # the whole tree again
  ```

- [ ] The panels resize from their edges and fold, and their sizes survive a relaunch.
  ```steps
  expect find("id=split-scene").0.value == "280"   # the default width
  act id=split-scene action=focus
  keys keys="right right right"   # a focused edge moves 16 px a press
  until find("id=split-scene").0.value == "328"
  act id=panel-inspector-fold action=press
  until find("id=panel-inspector-expand").count == 1   # the Inspector folded to a rail
  act id=split-assets action=focus
  keys keys="up up"   # the bottom panel grows upward
  until find("id=split-assets").0.value == "232"
  pause 1000   # the sizes are written to the settings a moment after the last change
  relaunch
  wait id=open-project enabled=true timeout_ms=40000
  until find("id=split-scene").0.value == "328" timeout=10000   # kept across the relaunch
  expect find("id=panel-inspector-expand").count == 1   # still folded
  expect find("id=split-assets").0.value == "232"
  act id=panel-inspector-expand action=press
  until find("id=panel-inspector-fold").count == 1
  ```

- [ ] Help › Keyboard Shortcuts shows the sheet of every shortcut.
  ```steps
  menu "Help › Keyboard Shortcuts" press
  until find("id=shortcuts").count == 1
  expect find("name='Duplicate: ⌘D'").count == 1   # a menu item's key
  expect find("name='Move gizmo: W'").count == 1   # a key of the window's
  expect find("name='Keyboard Shortcuts: ⌘/'").count == 1   # its own
  shot "the shortcuts sheet"
  act id=shortcuts-close action=press
  until find("id=shortcuts").count == 0
  ```

- [ ] Copy a field and paste it into a field of the same type as one undo step; a field of another type refuses the paste.
  ```steps
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project-w6-prefabs" timeout=30000
  act id=file-name action=set_value value=w6-doors.vrmxs
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene w6-doors.vrmxs 7 nodes" timeout=60000
  act id=node-bench action=press
  until find("id=inspector-id").0.name == "Node bench"
  act id=pos-copy action=press   # the bench's position
  until find("id=note").0.name == "Copied position"
  act id=node-sun action=press
  until find("id=inspector-id").0.name == "Node sun"
  act id=pos-paste action=press
  until find("id=undo").0.name == "Undo Paste position on sun" timeout=5000   # one undo step
  expect find("id=pos-z").0.value == "2.5"   # the bench's position
  act id=copy-intensity action=press   # a number
  act id=node-bench action=press
  until find("id=inspector-id").0.name == "Node bench"
  expect find("id=paste-castShadow").0.name matches "\\(a number doesn't paste into a boolean\\)$"   # refused: another type
  act id=undo action=press
  ```
