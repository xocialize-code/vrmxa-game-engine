# Viewport and handles hand test (M5 W5): AppProbe scenario

Run `apps/editor-mac/scripts/build.sh`, then hold the GPU lock while the scenario draws:

```sh
node acceptance/gpu-lock.mjs run --who viewport-hand-test -- appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M5-VIEWPORT.scenario.md
```

The scenario uses the bundled sample (read only, nothing is saved), so it needs no fixtures. The renderer is the app's
default (WebGPU); `VRMXG_QUERY=renderer=webgl` in the scenario's `env` runs it on WebGL. The viewport's aids are drawn
in a canvas, so they are read through what the page says about them: the preview's frame is a figure named after the
camera (`#camera-preview`, "Camera preview: cam"), and each shape handle has a named mark where it is drawn
(`#handle-x-plus`, "Handle x+ of collider") with another half a metre out along the way it drags
(`#handle-x-plus-out`). Row 5 drags with the **real pointer** (`pointer drag`): AppProbe's background clicks don't
drag, and nothing else reaches a handle in a canvas. It brings the app forward and moves the cursor for about a
second; the Mac must be unlocked.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M5-VIEWPORT.md
fresh: false
```

- [ ] Edit › Duplicate copies the selected node in place with a fresh id, as one undo step.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  act id=scene action=pick value=cafe.vrmxs
  until find("id=doc-state").0.name matches "^Scene cafe.vrmxs [0-9]+ nodes saved valid" timeout=60000
  act id=node-stool-1 action=press
  until find("id=inspector-id").0.name == "Node stool-1"
  menu "Edit › Duplicate" press
  until find("id=node-stool-9").count == 1 timeout=5000   # the copy: stool-1 → stool-9, the first free number
  expect find("id=undo").0.name == "Undo Duplicate stool-1"   # one undo step, named for the original
  expect find("id=inspector-id").0.name == "Node stool-9"   # the copy is selected
  expect find("id=pos-x").0.value == "-3.75"   # in place: the original's position
  menu "Edit › Undo" press
  until find("id=node-stool-9").count == 0   # one Undo takes it away
  ```

- [ ] Copy and Paste from the Edit menu paste a copy with a fresh id, as one undo step.
  ```steps
  act id=node-door-1 action=press
  until find("id=inspector-id").0.name == "Node door-1"
  menu "Edit › Copy" press
  menu "Edit › Paste" press
  until find("id=node-door-2").count == 1 timeout=5000   # the pasted door
  expect find("id=undo").0.name == "Undo Paste door-2"   # one undo step
  expect find("id=inspector-id").0.name == "Node door-2"
  menu "Edit › Undo" press
  until find("id=node-door-2").count == 0
  ```

- [ ] The scene tree's Duplicate, Copy and Paste do the same.
  ```steps
  act id=node-sword action=press
  until find("id=inspector-id").0.name == "Node sword"
  act id=duplicate action=press
  until find("id=node-sword-2").count == 1
  expect find("id=undo").0.name == "Undo Duplicate sword"
  act id=copy action=press
  until find("id=paste").0.name == "Paste 1 node"   # the editor's clipboard holds one node
  act id=paste action=press
  until find("id=node-sword-3").count == 1
  expect find("id=undo").0.name == "Undo Paste sword-3"
  menu "Edit › Undo" press
  menu "Edit › Undo" press
  until find("id=node-sword-2").count == 0
  ```

- [ ] Selecting a camera shows what it sees, picture in picture; Preview off hides it.
  ```steps
  act id=node-cam action=press
  until find("id=camera-preview").0.name == "Camera preview: cam" timeout=5000   # drawn in the corner, named for the camera
  shot "camera preview"
  act id=aid-preview action=press
  until find("id=camera-preview").count == 0   # the switch hides it
  act id=aid-preview action=press
  until find("id=camera-preview").count == 1
  act id=node-sun action=press
  until find("id=camera-preview").count == 0   # not a camera: no preview
  partial: what the preview shows is in the screenshot, for a person to look at
  ```

- [ ] A box collider resized by dragging a face: the inspector follows, and the drag is one undo step.
  ```steps
  act name="Node type to add" action=pick value=Collider
  act id=add-node action=press
  until find("id=undo").0.name == "Undo Add collider"
  act id=view-pz action=press   # the view cube: look from the front, so the right face's handle faces the camera
  pause 1500
  until find("id=handle-x-plus").count == 1   # the right face's handle, where it is drawn
  set X0 = find("id=pos-x").0.value
  find id=handle-x-plus
  set FROM = $.0.ref
  find id=handle-x-plus-out
  set TO = $.0.ref
  pointer drag ref=${FROM} to_ref=${TO} steps=30
  until find("id=undo").0.name == "Undo Resize collider" timeout=5000   # one undo step for the whole drag
  expect find("id=prop-size").0.value matches "^\\[1\\.(45|5|55),1,1\\]$"   # the inspector's size: the face moved half a metre (Snap rounds to 5 cm)
  expect find("id=pos-x").0.value != $X0   # the collider moved right by half the change, so its left face stayed put
  menu "Edit › Undo" press
  until find("id=prop-size").0.value == ""   # one Undo: back to the default size (unset)
  ```
