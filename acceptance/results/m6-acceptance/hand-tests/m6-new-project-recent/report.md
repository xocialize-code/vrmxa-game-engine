# New Project through the folder panel, and Open Recent after a relaunch (M6 W3): AppProbe scenario: run of Nov 27, 2026 at 10:06 AM

- **App:** VRMXG Editor 0.1.0 (1), <repo>/apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `<repo>/apps/editor-mac/docs/hand-test/HAND-TEST-M6-NEW-PROJECT-recent.scenario.md`
- **Checklist:** `<repo>/apps/editor-mac/docs/HAND-TEST-M6-NEW-PROJECT.md`
- **Result:** 2 rows: 2 passed, 0 failed, 0 need you; 0 checklist rows have no steps

## Passed

- **1. The folder panel: New Project with no hook asks where the folder goes and what it is call…** (checklist line 31) ◐: partly checked, not: that nothing was written is checked by the next row's folder listing (the project folder is new there); find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved"; find("surface=app id=saveAsNameTextField").0.value == "Outside Game"; find("surface=app role=popupbutton name=Where").0.value == "vrmxg-m6-outside"; find("id=new-project-create").0.name == "Create project"; find("id=new-project-error").count == 0; find("id=new-project").count == 1 (4914 ms)
- **2. File › Open Recent reopens a project outside the app's container after a relaunch (the sa…** (checklist line 32): find("id=project-name").0.name == "Project Outside Game"; find("id=doc-state").0.name matches "^Scene level.vrmxs 14 nodes saved valid"; find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved"; menu("File › Open Recent").items.0.name == "Outside Game"; menu("File › Open Recent").items.0.enabled == true; find("id=project-name").0.name == "Project Outside Game"; find("id=doc-state").0.name matches "^Scene level.vrmxs 14 nodes saved valid"; find("role=alert").count == 0 (9053 ms)