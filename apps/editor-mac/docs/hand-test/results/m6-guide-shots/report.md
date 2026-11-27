# The editor guide's pictures (M6 W9): AppProbe scenario: run of Nov 26, 2026 at 8:42 PM

- **App:** VRMXG Editor 0.1.0 (1), apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `apps/editor-mac/docs/hand-test/HAND-TEST-M6-GUIDE-SHOTS.scenario.md`
- **Checklist:** `apps/editor-mac/docs/HAND-TEST-M6-GUIDE-SHOTS.md`
- **Result:** 3 rows: 3 passed, 0 failed, 0 need you; 0 checklist rows have no steps

## Passed

- **1. Prefabs and overrides: a door's hinge, folded open in the tree, overridden in the inspect…** (checklist line 8): find("id=project-name").0.name == "Project w9-guide-project"; find("id=doc-state").0.name matches "^Scene w9-tour.vrmxs 10 nodes saved valid"; find("id=node-door-a/hinge").count == 1; find("id=inspector-inner").count == 1; find("id=undo").0.name == "Undo Override door-a/hinge.mass"; find("id=ov-mass").0.name == "mass overrides the prefab (prefab: 12): revert"; find("id=overrides-summary").count == 1; find("id=ov-mass").count == 0; find("id=doc-state").0.name == $CLEAN (6894 ms)
- **2. The viewport's aids: an area's handles, then the selected camera's picture in picture** (checklist line 9): find("id=inspector-id").0.name == "Node zone"; find("id=inspector-id").0.name == "Node cam"; find("id=doc-state").0.name == $CLEAN (3820 ms)
- **3. The assets panel: thumbnails, type filters and search** (checklist line 10): find("text=thumbnails").count > 0 (4329 ms)