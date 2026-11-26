# Export Game hand test (M5 W0): AppProbe scenario: run of Nov 25, 2026 at 2:32 PM

- **App:** VRMXG Editor 0.1.0 (1), apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `apps/editor-mac/docs/hand-test/HAND-TEST-M5-EXPORT-GAME.scenario.md`
- **Checklist:** `apps/editor-mac/docs/HAND-TEST-M5-EXPORT-GAME.md`
- **Result:** 6 rows: 6 passed, 0 failed, 0 need you; 2 checklist rows have no steps

## Passed

- **1. Export Game writes the bundled sample as a build: the runtime, the game's files and a man…** (checklist line 10) ◐: partly checked, not: the folder's files are checked against the manifest by acceptance/m5/build.mjs, outside the app; find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved"; find("id=project-name").0.name == "Project Sample (bundled)"; find("id=export-game-result").0.name matches "^Exported game cafe: [0-9]+ files, [0-9]+ bytes, entry cafe.vrmxs, runtime vrmxg-game [0-9.]+(\\+[0-9a-f]{12})? · build [0-9a-f]{16} · manifest [0-9a-f]{16} · .*/builds/game-a$"; find("role=alert").count == 0 (6231 ms)
- **2. The same export again, into another folder, gives the same build** (checklist line 11) ◐: partly checked, not: the two folders are compared byte for byte, with Node's, by acceptance/m5/build.mjs --mac; find("id=export-game-result").0.name matches "^Exported game cafe: .*/builds/game-b$" (1493 ms)
- **3. The same project opened as a folder exports the same build** (checklist line 12) ◐: partly checked, not: compared with Node's build by acceptance/m5/build.mjs --mac; find("id=project-name").0.name == "Project project-game"; find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved"; find("id=export-game-result").0.name matches "^Exported game cafe: .*/builds/game-c$" (8621 ms)
- **4. File › Export Game… does the same from the menu** (checklist line 13) ◐: partly checked, not: compared with Node's build by acceptance/m5/build.mjs --mac; find("id=export-game-result").0.name matches "^Exported game cafe: .*/builds/game-d$" (1663 ms)
- **5. Exporting again into a folder that holds an earlier build replaces it, whole** (checklist line 14) ◐: partly checked, not: that game-a is still Node's build, with no staging folder left, is checked by acceptance/m5/build.mjs --mac; find("id=export-game-result").0.name matches "^Exported game cafe: .*/builds/game-a$"; find("role=alert").count == 0 (1622 ms)
- **6. A folder that holds someone's file is refused: the result says what is in the way, and th…** (checklist line 15) ◐: partly checked, not: that notes.txt is still there, alone, is checked by acceptance/m5/build.mjs --kept; find("id=export-game-result").0.name matches "^Game export refused \\(not_empty\\): game-stray holds files that aren't a build's \\(notes.txt\\): export into an empty folder" (1260 ms)
## Checklist rows with no steps (2, unticked)

- line 17, Export Game hand test (M5 W0, AB-T-0615): Closing the window while a game is being exported asks first: Keep Exporting keeps the window; Stop and Close 
- line 18, Export Game hand test (M5 W0, AB-T-0615): The folder panel: Export Game with no hook asks for a folder, and Cancel exports nothing. *Not scripted: AppPr
