# Creator hand test (M4 W11): an agent makes the short, AppProbe scenario: run of Nov 24, 2026 at 6:03 AM

- **App:** VRMXG Creator 0.1.0 (1), apps/creator-mac/build/VRMXGCreator.app
- **Scenario:** `apps/creator-mac/docs/hand-test/HAND-TEST-M4-MCP.scenario.md`
- **Checklist:** `apps/creator-mac/docs/HAND-TEST-M4-MCP.md`
- **Result:** 4 rows: 4 passed, 0 failed, 0 need you; 0 checklist rows have no steps

## Passed

- **1. The project opens on the sample short, linked to the agent's MCP server, with no undo step** (checklist line 19): find("id=doc-state").0.name matches "^Short cafe-order "; find("id=project-name").0.name == "Project project"; find("id=doc-state").0.name matches "^Short cafe-order sequences/cafe-order.vrmxs [0-9]+ nodes saved valid "; find("id=sb-status").0.name == "Storyboard 11 shots, 11 thumbnails"; find("id=undo").0.name == "Undo"; find("id=mcp-state").0.name matches "^MCP" (9068 ms)
- **2. An agent with only the creator's MCP tools makes the short's edits; the last one is in th…** (checklist line 20): find("id=mcp-state").0.name matches "calls"; find("id=undo").0.name matches "^Undo Shot 030: camera .* \(MCP\)$"; find("id=q-job-1-status").count == 1; find("id=undo").0.name matches "^Undo Shot 030: camera .* \(MCP\)$"; find("id=doc-state").0.name matches "unsaved changes" (35235 ms)
- **3. Undo walks the agent's edits back one step at a time, each named for the agent: the shot'…** (checklist line 21): find("id=undo").0.name == "Undo Voice line \"Is it always this quiet before nine?\" (new words) (MCP)"; find("id=undo").0.name matches "^Undo Cast HANA: .* \(MCP\)$"; find("id=undo").0.name == "Undo Re-script (1 changed) (MCP)"; find("id=undo").0.name == "Undo"; find("id=doc-state").0.name == $opened; find("id=redo").0.name == "Redo Re-script (1 changed) (MCP)" (9566 ms)
- **4. Redo brings the agent's edits back, each still marked (MCP), to the same hash** (checklist line 22): find("id=undo").0.name == "Undo Re-script (1 changed) (MCP)"; find("id=undo").0.name matches "^Undo Cast HANA: .* \(MCP\)$"; find("id=undo").0.name == "Undo Voice line \"Is it always this quiet before nine?\" (new words) (MCP)"; find("id=undo").0.name matches "^Undo Shot 030: camera .* \(MCP\)$"; find("id=redo").0.name == "Redo"; find("id=doc-state").0.name != $opened (10133 ms)