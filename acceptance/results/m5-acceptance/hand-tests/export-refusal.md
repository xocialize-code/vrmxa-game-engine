# Export Game hand test (M5 W0): AppProbe scenario, a project with an unlicensed file: run of Nov 25, 2026 at 2:32 PM

- **App:** VRMXG Editor 0.1.0 (1), apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `apps/editor-mac/docs/hand-test/HAND-TEST-M5-EXPORT-GAME-refusal.scenario.md`
- **Checklist:** `apps/editor-mac/docs/HAND-TEST-M5-EXPORT-GAME.md`
- **Result:** 1 rows: 1 passed, 0 failed, 0 need you; 2 checklist rows have no steps

## Passed

- **1. A file with no row in LICENCES** (checklist line 16) ◐: partly checked, not: that no folder was made is checked by acceptance/m5/build.mjs --refused, outside the app; find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved"; find("id=project-name").0.name == "Project project-unlicensed"; find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved"; find("id=export-game-result").0.name matches "^Game export refused \\(no_licence\\): no row in LICENCES.md for props/found-on-the-web.glb" (13226 ms)
## Checklist rows with no steps (2, unticked)

- line 17, Export Game hand test (M5 W0, AB-T-0615): Closing the window while a game is being exported asks first: Keep Exporting keeps the window; Stop and Close 
- line 18, Export Game hand test (M5 W0, AB-T-0615): The folder panel: Export Game with no hook asks for a folder, and Cancel exports nothing. *Not scripted: AppPr
