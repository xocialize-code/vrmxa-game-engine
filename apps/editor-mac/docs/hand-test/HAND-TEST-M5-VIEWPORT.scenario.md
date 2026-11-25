# Viewport and handles hand test (M5 W5): AppProbe scenario

Run `apps/editor-mac/scripts/build.sh` and `apps/editor-mac/scripts/hand-test-fixtures-m5-viewport.sh` (the
scenario's own folder in the app's container, `project-w5-viewport`: the sample with `cafe-post.vrmxs`, the cafe with the
anime post stack on its Environment), then hold the GPU lock while the scenario draws:

```sh
node acceptance/gpu-lock.mjs run --who viewport-hand-test -- appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M5-VIEWPORT.scenario.md
```

It runs on the app's default renderer (WebGPU); `HAND-TEST-M5-VIEWPORT-webgl.scenario.md`, the same rows, launches it
with `VRMXG_QUERY=renderer=webgl`. Rows 1 to 6 use the bundled sample (read only, nothing is saved); row 7 opens
the fixture's project. The viewport's aids are drawn in a canvas, so they are read through what the page says about
them: the preview's frame is a figure named after the camera (`#camera-preview`, "Camera preview: cam"), each shape
handle has a named mark where it is drawn (`#handle-x-plus`, "Handle x+ of panel") with another half a metre out along
the way it drags (`#handle-x-plus-out`), and two marks sit near the viewport's corners (`#viewport-near-top-left`,
`#viewport-near-bottom-right`) for Box select's drag. Rows 5 and 6 drag with the **real pointer** (`pointer drag`):
AppProbe's background clicks don't drag, and nothing else reaches a canvas. It brings the app forward and moves the
cursor for about fifteen seconds (seven drags); the Mac must be unlocked. Row 7's picture is for a person (and a judge,
which never fails a row) to look at.

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M5-VIEWPORT.md
env: {"VRMXG_SHELL_PROJECT": "project-w5-viewport"}
fresh: false
```

- [ ] Edit › Duplicate copies the selected node in place with a fresh id, as one undo step.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  act id=file-name action=set_value value=cafe.vrmxs   # WebKit's popup menus can't be picked over accessibility: open by name
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene cafe.vrmxs [0-9]+ nodes saved valid" timeout=60000
  expect find("id=renderer").0.name == "Renderer WebGPU"   # the app's default backend
  act id=node-stool-1 action=press
  until find("id=inspector-id").0.name == "Node stool-1"
  act id=frame action=press   # frame the stool: its outline, for the by-eye row
  pause 800
  shot "stool-1 selected: outline and gizmo"
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

- [ ] A box collider resized by dragging each face: the inspector follows, and each drag is one undo step.
  ```steps
  wait id=file-name timeout_ms=40000   # the page is up (the row runs on its own too)
  act id=file-name action=set_value value=prefabs/door.vrmxs   # the door prefab: its panel is a box collider on the hinge's body
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene prefabs/door.vrmxs [0-9]+ nodes saved valid" timeout=60000
  act id=node-panel action=press
  until find("id=inspector-id").0.name == "Node panel"
  expect find("id=prop-size-x").0.value == "0.88"   # the panel as the prefab has it (the inspector's vector field, M5 W4)
  expect find("id=prop-size-y").0.value == "2"
  expect find("id=prop-size-z").0.value == "0.04"
  act id=view-pz action=press   # the view cube: look from the front, so the x and y faces' handles face the camera
  pause 1500
  until find("id=handle-x-plus").count == 1   # the right face's handle, where it is drawn
  set X0 = find("id=pos-x").0.value
  find id=handle-x-plus
  set FROM = $.0.ref
  find id=handle-x-plus-out
  set TO = $.0.ref
  pointer drag ref="${FROM}" to_ref="${TO}" steps=30   # the real pointer: from the x + face's handle to half a metre out
  until find("id=undo").0.name == "Undo Resize panel" timeout=5000   # one undo step for the whole drag
  expect find("id=prop-size-x").0.value matches "^1\\.(35|4|45)$"   # the inspector's size: the face moved half a metre (Snap rounds to 5 cm)
  expect find("id=prop-size-y").0.value matches "^2$"
  expect find("id=prop-size-z").0.value matches "^0\\.04$"
  expect find("id=pos-x").0.value != $X0   # the collider moved right by half the change, so its left face stayed put
  shot "the panel after the drag: handles and outline"
  menu "Edit › Undo" press
  until find("id=prop-size-x").0.value == "0.88"   # one Undo: back as it was
  expect find("id=prop-size-y").0.value == "2"
  expect find("id=prop-size-z").0.value == "0.04"
  expect find("id=pos-x").0.value == $X0
  find id=handle-x-minus
  set FROM = $.0.ref
  find id=handle-x-minus-out
  set TO = $.0.ref
  pointer drag ref="${FROM}" to_ref="${TO}" steps=30   # the real pointer: from the x − face's handle to half a metre out
  until find("id=undo").0.name == "Undo Resize panel" timeout=5000   # one undo step for the whole drag
  expect find("id=prop-size-x").0.value matches "^1\\.(35|4|45)$"   # the left face, out to the left
  expect find("id=prop-size-y").0.value matches "^2$"
  expect find("id=prop-size-z").0.value matches "^0\\.04$"
  expect find("id=pos-x").0.value != $X0   # moved left this time
  menu "Edit › Undo" press
  until find("id=prop-size-x").0.value == "0.88"   # one Undo: back as it was
  expect find("id=prop-size-y").0.value == "2"
  expect find("id=prop-size-z").0.value == "0.04"
  expect find("id=pos-x").0.value == $X0
  find id=handle-y-plus
  set FROM = $.0.ref
  find id=handle-y-plus-out
  set TO = $.0.ref
  pointer drag ref="${FROM}" to_ref="${TO}" steps=30   # the real pointer: from the y + face's handle to half a metre out
  until find("id=undo").0.name == "Undo Resize panel" timeout=5000   # one undo step for the whole drag
  expect find("id=prop-size-x").0.value matches "^0\\.88$"   # the top face, up
  expect find("id=prop-size-y").0.value matches "^2\\.(45|5|55)$"
  expect find("id=prop-size-z").0.value matches "^0\\.04$"
  menu "Edit › Undo" press
  until find("id=prop-size-x").0.value == "0.88"   # one Undo: back as it was
  expect find("id=prop-size-y").0.value == "2"
  expect find("id=prop-size-z").0.value == "0.04"
  expect find("id=pos-x").0.value == $X0
  find id=handle-y-minus
  set FROM = $.0.ref
  find id=handle-y-minus-out
  set TO = $.0.ref
  pointer drag ref="${FROM}" to_ref="${TO}" steps=30   # the real pointer: from the y − face's handle to half a metre out
  until find("id=undo").0.name == "Undo Resize panel" timeout=5000   # one undo step for the whole drag
  expect find("id=prop-size-x").0.value matches "^0\\.88$"   # the bottom face, down
  expect find("id=prop-size-y").0.value matches "^2\\.(45|5|55)$"
  expect find("id=prop-size-z").0.value matches "^0\\.04$"
  menu "Edit › Undo" press
  until find("id=prop-size-x").0.value == "0.88"   # one Undo: back as it was
  expect find("id=prop-size-y").0.value == "2"
  expect find("id=prop-size-z").0.value == "0.04"
  expect find("id=pos-x").0.value == $X0
  act id=view-px action=press   # from the right side: the front and back faces' handles are to either side now
  pause 1500
  until find("id=handle-z-plus").count == 1
  find id=handle-z-plus
  set FROM = $.0.ref
  find id=handle-z-plus-out
  set TO = $.0.ref
  pointer drag ref="${FROM}" to_ref="${TO}" steps=30   # the real pointer: from the z + face's handle to half a metre out
  until find("id=undo").0.name == "Undo Resize panel" timeout=5000   # one undo step for the whole drag
  expect find("id=prop-size-x").0.value matches "^0\\.88$"   # the front face, out (the panel is 4 cm thick)
  expect find("id=prop-size-y").0.value matches "^2$"
  expect find("id=prop-size-z").0.value matches "^0\\.(5|55|6)$"
  menu "Edit › Undo" press
  until find("id=prop-size-x").0.value == "0.88"   # one Undo: back as it was
  expect find("id=prop-size-y").0.value == "2"
  expect find("id=prop-size-z").0.value == "0.04"
  expect find("id=pos-x").0.value == $X0
  find id=handle-z-minus
  set FROM = $.0.ref
  find id=handle-z-minus-out
  set TO = $.0.ref
  pointer drag ref="${FROM}" to_ref="${TO}" steps=30   # the real pointer: from the z − face's handle to half a metre out
  until find("id=undo").0.name == "Undo Resize panel" timeout=5000   # one undo step for the whole drag
  expect find("id=prop-size-x").0.value matches "^0\\.88$"   # the back face, out
  expect find("id=prop-size-y").0.value matches "^2$"
  expect find("id=prop-size-z").0.value matches "^0\\.(5|55|6)$"
  menu "Edit › Undo" press
  until find("id=prop-size-x").0.value == "0.88"   # one Undo: back as it was
  expect find("id=prop-size-y").0.value == "2"
  expect find("id=prop-size-z").0.value == "0.04"
  expect find("id=pos-x").0.value == $X0
  partial: the sphere, capsule, cylinder and light handles are dragged by the Node tests' maths only (apps/editor/test/viewport.test.mjs)
  ```

- [ ] Box select: with Box on, a plain drag on the viewport selects what lies wholly inside the rectangle.
  ```steps
  act id=file-name action=set_value value=cafe.vrmxs
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene cafe.vrmxs [0-9]+ nodes saved valid" timeout=60000
  act id=node-sun action=press
  until find("id=inspector-id").0.name == "Node sun"
  act id=delete action=press   # (deselect: delete the sun, then undo it back, which leaves nothing selected)
  menu "Edit › Undo" press
  until find("id=node-sun").count == 1
  act id=frame action=press   # nothing selected: Frame fits the whole cafe
  pause 800
  act id=view-py action=press   # from the top: the room laid out flat
  pause 2000
  act id=box-select action=press
  until find("id=box-select").0.value == "1"
  find id=viewport-near-top-left
  set FROM = $.0.ref
  find id=viewport-near-bottom-right
  set TO = $.0.ref
  pointer drag ref="${FROM}" to_ref="${TO}" steps=30   # the real pointer: a plain drag, no modifier
  until find("id=inspector-multi").count == 1 timeout=5000   # several nodes selected
  expect find("id=inspector-multi").0.name matches "^Editing [0-9]+ nodes: .*\\bstool-1\\b"   # the stools, among what lay inside
  expect find("id=inspector-multi").0.name !contains "root"   # not the scene's root, which holds everything
  shot "box select from the top"
  act id=box-select action=press   # Box off again
  until find("id=box-select").0.value == "0"
  partial: ⇧ to add, and ⌘-drag without Box, need a modifier AppProbe's pointer can't hold (the Node tests and Chromium cover them)
  ```

- [ ] A scene drawn through the post stack: the edit view shows the scene under the aids, with the outline, handles and preview.
  ```steps
  act id=open-project action=press   # the fixture's project (VRMXG_SHELL_PROJECT), with cafe-post.vrmxs
  until find("id=project-name").0.name == "Project project-w5-viewport" timeout=20000
  act id=file-name action=set_value value=cafe-post.vrmxs
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene cafe-post.vrmxs [0-9]+ nodes saved valid" timeout=60000
  expect find("id=renderer").0.name == "Renderer WebGPU"
  act id=node-cupboard action=press
  until find("id=inspector-id").0.name == "Node cupboard"
  act id=frame action=press
  pause 1500
  shot "post stack: the cupboard selected"
  judge "Is a room with furniture visible in the 3D view, rather than a black or empty area?" expect=yes
  act id=node-cam action=press
  until find("id=camera-preview").0.name == "Camera preview: cam" timeout=5000
  shot "post stack: the camera preview"
  judge "Is a room visible in the large 3D view, with a smaller picture in its bottom right corner?" expect=yes
  partial: that the scene shows under the aids is judged from the pictures (a person, and a judge that can't fail the row); the page has no reading of its own pixels
  ```
