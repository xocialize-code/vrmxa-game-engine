# Editor hand test (M6 W8): an agent adds a level to "After Hours" and exports it, AppProbe scenario: run of Nov 27, 2026 at 7:02 AM

- **App:** VRMXG Editor 0.1.0 (1), <repo>/apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `<repo>/apps/editor-mac/docs/hand-test/HAND-TEST-M6-MCP-AFTER-HOURS.scenario.md`
- **Checklist:** `<repo>/apps/editor-mac/docs/HAND-TEST-M6-MCP-AFTER-HOURS.md`
- **Result:** 2 rows: 2 passed, 0 failed, 0 need you; 0 checklist rows have no steps

## Passed

- **1. The project opens on After Hours' first level, polling for the agent's MCP server on its …** (checklist line 20): find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved"; find("id=project-name").0.name matches "^Project "; find("id=doc-state").0.name matches "^Scene [^ ]+ [0-9]+ nodes saved"; find("id=doc-state").0.name matches "^Scene after-hours/level\.vrmxs 38 nodes saved valid hash "; find("id=undo").0.name == "Undo"; find("id=mcp-state").0.name matches "^MCP(: waiting for vrmxg-mcp --editor$| connected)" (6695 ms)
- **5. The second level opens in the editor as the agent saved it: valid, 41 nodes, with its two…** (checklist line 24): find("id=doc-state").0.name matches "^Scene after-hours/level-2\.vrmxs 41 nodes saved valid hash "; find("id=undo").0.name == "Undo"; find("id=node-book-2").count == 1; find("id=node-book-2-shelved").count == 1; find("id=behaviours").0.name == "Behaviours of zone-store: shelf"; find("id=connections").0.name == "Connections from zone-store: 4"; find("role=alert").count == 0 (2054 ms)