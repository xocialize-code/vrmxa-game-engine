# Editor hand test (M6 W8): an agent adds a level to "After Hours" and exports it, AppProbe scenario: run of Nov 27, 2026 at 6:43 AM

- **App:** VRMXG Editor 0.1.0 (1), <repo>/apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `<repo>/apps/editor-mac/docs/hand-test/HAND-TEST-M6-MCP-AFTER-HOURS.scenario.md`
- **Checklist:** `<repo>/apps/editor-mac/docs/HAND-TEST-M6-MCP-AFTER-HOURS.md`
- **Result:** 5 rows: 5 passed, 0 failed, 0 need you; 0 checklist rows have no steps

> **Redacted (PR 74):** shots r2-1 to r5-1 had the Export panel's result line ending in the build folder's full path, with the account's home folder in it. An opaque box is painted over that one line in each; nothing else in them is changed. The editor now shows a home folder as `~` there (`export-game.js` `homeShort`). Rows 1 and 5, tightened after this run, were run again on the project the agent saved: `rows-1-5/`.


## Passed

- **1. The project opens on After Hours' first level, linked to the agent's MCP server on its ow…** (checklist line 20): find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved"; find("id=project-name").0.name matches "^Project "; find("id=doc-state").0.name matches "^Scene [^ ]+ [0-9]+ nodes saved"; find("id=doc-state").0.name matches "^Scene after-hours/level\.vrmxs 38 nodes saved valid hash "; find("id=undo").0.name == "Undo"; find("id=mcp-state").0.name matches "^MCP" (6516 ms)
- **2. An agent with only the editor's MCP tools (and the vrmxg skill) adds a second level with …** (checklist line 21) ◐: partly checked, not: the build folder is checked against its manifest outside the app (vrmxg-export --verify), and the agent's calls are in results/mcp-editor-session-m6-after-hours.json; find("id=mcp-state").0.name matches "calls"; find("id=undo").0.name == "Undo Go on to the second night (MCP)"; find("id=doc-state").0.name matches "^Scene after-hours/level\.vrmxs 38 nodes saved valid hash "; find("id=export-game-result").0.name matches "^Exported game after-hours: [0-9]+ files, [0-9]+ bytes, entry after-hours/title\.vrmxs, runtime .*/builds-w8/after-hours$"; find("role=alert").count == 0; $agent != $opened (54046 ms)
- **3. Undo takes the agent's last step back, named for the agent; saved, the first level is the…** (checklist line 22): find("id=undo").0.name == "Undo"; find("id=redo").0.name == "Redo Go on to the second night (MCP)"; find("id=doc-state").0.name matches "unsaved changes"; find("id=doc-state").0.name == $opened (1021 ms)
- **4. Redo brings it back, still marked (MCP); saved, the first level is the agent's** (checklist line 23): find("id=undo").0.name == "Undo Go on to the second night (MCP)"; find("id=redo").0.name == "Redo"; find("id=doc-state").0.name == $agent (974 ms)
- **5. The second level opens in the editor as the agent saved it: valid, with its book, its she…** (checklist line 24): find("id=doc-state").0.name matches "^Scene after-hours/level-2\.vrmxs [0-9]+ nodes saved valid hash "; find("id=undo").0.name == "Undo"; find("role=alert").count == 0 (1594 ms)