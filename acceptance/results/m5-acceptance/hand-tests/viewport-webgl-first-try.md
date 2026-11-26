# Viewport and handles hand test (M5 W5): AppProbe scenario, WebGL forced: run of Nov 25, 2026 at 3:27 PM

- **App:** VRMXG Editor 0.1.0 (1), apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `apps/editor-mac/docs/hand-test/HAND-TEST-M5-VIEWPORT-webgl.scenario.md`
- **Checklist:** `apps/editor-mac/docs/HAND-TEST-M5-VIEWPORT.md`
- **Result:** 7 rows: 6 passed, 0 failed, 1 errors, 0 need you; 3 checklist rows have no steps

## Errors (the run's, not necessarily the app's)

### 2. Copy and Paste from the Edit menu paste a copy with a fresh id, as one undo step

** (checklist line 11)

> Copy and Paste from the Edit menu paste a copy with a fresh id, as one undo step.

**Error:** DISABLED: Edit › Copy is disabled (Wait for it with wait(role=menuitem, name=…, enabled=true, surface=menubar).)

- 👀 shot 1: end
- ✅ `find("id=inspector-id").0.name == "Node door-1"`

![2-1](shots/r2-1.png)

<details><summary>Steps (692 ms)</summary>

```
52: act id=node-door-1 action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":24,"w":279,"x":2609,"y":586},"help":"","id":"node-door-1","name":"Staff door (door-1), Item","r (42 ms)
53: until find("id=inspector-id").0.name == "Node door-1" → ok (57 ms)
```
</details>

## Passed

- **1. Edit › Duplicate copies the selected node in place with a fresh id, as one undo step** (checklist line 10): find("id=doc-state").0.name matches "^Scene cafe.vrmxs [0-9]+ nodes saved valid"; find("id=renderer").0.name == "Renderer WebGL"; find("id=inspector-id").0.name == "Node stool-1"; find("id=node-stool-9").count == 1; find("id=undo").0.name == "Undo Duplicate stool-1"; find("id=inspector-id").0.name == "Node stool-9"; find("id=pos-x").0.value == "-3.75"; find("id=node-stool-9").count == 0 (6632 ms)
- **3. The scene tree's Duplicate, Copy and Paste do the same** (checklist line 12): find("id=inspector-id").0.name == "Node sword"; find("id=node-sword-2").count == 1; find("id=undo").0.name == "Undo Duplicate sword"; find("id=paste").0.name == "Paste 1 node"; find("id=node-sword-3").count == 1; find("id=undo").0.name == "Undo Paste sword-3"; find("id=node-sword-2").count == 0 (2364 ms)
- **4. Selecting a camera shows what it sees, picture in picture; Preview off hides it** (checklist line 13) ◐: partly checked, not: what the preview shows is in the screenshot, for a person to look at; find("id=camera-preview").0.name == "Camera preview: cam"; find("id=camera-preview").count == 0; find("id=camera-preview").count == 1; find("id=camera-preview").count == 0 (1180 ms)
- **5. A box collider resized by dragging each face: the inspector follows, and each drag is one…** (checklist line 14) ◐: partly checked, not: the sphere, capsule, cylinder and light handles are dragged by the Node tests' maths only (apps/editor/test/viewport.test.mjs); find("id=doc-state").0.name matches "^Scene prefabs/door.vrmxs [0-9]+ nodes saved valid"; find("id=inspector-id").0.name == "Node panel"; find("id=prop-size-x").0.value == "0.88"; find("id=prop-size-y").0.value == "2"; find("id=prop-size-z").0.value == "0.04"; find("id=handle-x-plus").count == 1; find("id=undo").0.name == "Undo Resize panel"; find("id=prop-size-x").0.value matches "^1\\.(35|4|45)$"; find("id=prop-size-y").0.value matches "^2$"; find("id=prop-size-z").0.value matches "^0\\.04$"; find("id=pos-x").0.value != $X0; find("id=prop-size-x").0.value == "0.88"; find("id=prop-size-y").0.value == "2"; find("id=prop-size-z").0.value == "0.04"; find("id=pos-x").0.value == $X0; find("id=undo").0.name == "Undo Resize panel"; find("id=prop-size-x").0.value matches "^1\\.(35|4|45)$"; find("id=prop-size-y").0.value matches "^2$"; find("id=prop-size-z").0.value matches "^0\\.04$"; find("id=pos-x").0.value != $X0; find("id=prop-size-x").0.value == "0.88"; find("id=prop-size-y").0.value == "2"; find("id=prop-size-z").0.value == "0.04"; find("id=pos-x").0.value == $X0; find("id=undo").0.name == "Undo Resize panel"; find("id=prop-size-x").0.value matches "^0\\.88$"; find("id=prop-size-y").0.value matches "^2\\.(45|5|55)$"; find("id=prop-size-z").0.value matches "^0\\.04$"; find("id=prop-size-x").0.value == "0.88"; find("id=prop-size-y").0.value == "2"; find("id=prop-size-z").0.value == "0.04"; find("id=pos-x").0.value == $X0; find("id=undo").0.name == "Undo Resize panel"; find("id=prop-size-x").0.value matches "^0\\.88$"; find("id=prop-size-y").0.value matches "^2\\.(45|5|55)$"; find("id=prop-size-z").0.value matches "^0\\.04$"; find("id=prop-size-x").0.value == "0.88"; find("id=prop-size-y").0.value == "2"; find("id=prop-size-z").0.value == "0.04"; find("id=pos-x").0.value == $X0; find("id=handle-z-plus").count == 1; find("id=undo").0.name == "Undo Resize panel"; find("id=prop-size-x").0.value matches "^0\\.88$"; find("id=prop-size-y").0.value matches "^2$"; find("id=prop-size-z").0.value matches "^0\\.(5|55|6)$"; find("id=prop-size-x").0.value == "0.88"; find("id=prop-size-y").0.value == "2"; find("id=prop-size-z").0.value == "0.04"; find("id=pos-x").0.value == $X0; find("id=undo").0.name == "Undo Resize panel"; find("id=prop-size-x").0.value matches "^0\\.88$"; find("id=prop-size-y").0.value matches "^2$"; find("id=prop-size-z").0.value matches "^0\\.(5|55|6)$"; find("id=prop-size-x").0.value == "0.88"; find("id=prop-size-y").0.value == "2"; find("id=prop-size-z").0.value == "0.04"; find("id=pos-x").0.value == $X0 (13832 ms)
- **6. Box select: with Box on, a plain drag on the viewport selects what lies wholly inside the…** (checklist line 15) ◐: partly checked, not: ⇧ to add, and ⌘-drag without Box, need a modifier AppProbe's pointer can't hold (the Node tests and Chromium cover them); find("id=doc-state").0.name matches "^Scene cafe.vrmxs [0-9]+ nodes saved valid"; find("id=inspector-id").0.name == "Node sun"; find("id=node-sun").count == 1; find("id=box-select").0.value == "1"; find("id=inspector-multi").count == 1; find("id=inspector-multi").0.name matches "^Editing [0-9]+ nodes: .*\\bstool-1\\b"; find("id=inspector-multi").0.name !contains "root"; find("id=box-select").0.value == "0" (6915 ms)
- **7. A scene drawn through the post stack: the edit view shows the scene under the aids, with …** (checklist line 16) ◐: partly checked, not: that the scene shows under the aids is judged from the pictures (a person, and a judge that can't fail the row); the page has no reading of its own pixels; find("id=project-name").0.name == "Project project-w5-viewport"; find("id=doc-state").0.name matches "^Scene cafe-post.vrmxs [0-9]+ nodes saved valid"; find("id=renderer").0.name == "Renderer WebGL"; find("id=inspector-id").0.name == "Node cupboard"; find("id=camera-preview").0.name == "Camera preview: cam" (8960 ms)
## Results rows

In the checklist's format, to copy in (`fill=true` writes the failures in, and ticks the passes).

| # | Step | What happened | Undo name | Task filed |
|---|------|---------------|-----------|------------|
| 2 | Copy and Paste from the Edit menu paste a copy with a fresh id, as one undo step | run error: DISABLED: Edit › Copy is disabled (Wait for it with wait(role=menuitem, name=…, enabled=true, surface=menubar).) | (none) | |

## Checklist rows with no steps (3, unticked)

- line 17, Viewport and handles hand test (M5 W5, AB-T-0604 and AB-T-0605): The selection outline follows the selected node's shape, a character's included, on WebGPU and on WebGL. *By e
- line 19, Viewport and handles hand test (M5 W5, AB-T-0604 and AB-T-0605): ⌘-drag draws a rectangle and selects what is wholly inside it; ⇧ adds; a hidden node isn't picked; Escape drop
- line 20, Viewport and handles hand test (M5 W5, AB-T-0604 and AB-T-0605): Each face of a box, a sphere's radius, a capsule's and a cylinder's height and radius, a point light's range a
