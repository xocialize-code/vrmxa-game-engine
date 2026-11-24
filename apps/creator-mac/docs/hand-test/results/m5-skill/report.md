# Creator hand test (M5 W9): a fresh agent with only the vrmxg skill makes the short, AppProbe scenario: run of Nov 24, 2026 at 2:17 PM

- **App:** VRMXG Creator 0.1.0 (1), apps/creator-mac/build/VRMXGCreator.app
- **Scenario:** `apps/creator-mac/docs/hand-test/HAND-TEST-M5-SKILL.scenario.md`
- **Checklist:** `apps/creator-mac/docs/HAND-TEST-M5-SKILL.md`
- **Result:** 2 rows: 2 passed, 0 failed, 0 need you; 0 checklist rows have no steps

## Passed

- **1. The project opens on the sample short, linked to the agent's MCP server, with no undo step** (checklist line 18): find("id=doc-state").0.name matches "^Short cafe-order "; find("id=project-name").0.name == "Project project-w9-skill"; find("id=doc-state").0.name matches "^Short cafe-order sequences/cafe-order.vrmxs [0-9]+ nodes saved valid "; find("id=sb-status").0.name == "Storyboard 11 shots, 11 thumbnails"; find("id=undo").0.name == "Undo"; find("id=mcp-state").0.name matches "^MCP" (9146 ms)
- **2. An agent with only the vrmxg skill and the creator's MCP tools makes the short's edits; t…** (checklist line 19): find("id=mcp-state").0.name matches "calls"; find("id=undo").0.name matches "^Undo Shot 030: camera .* \(MCP\)$"; find("id=q-job-1-status").count == 1; find("id=undo").0.name matches "^Undo Shot 030: camera .* \(MCP\)$"; find("id=doc-state").0.name matches "unsaved changes"; find("id=mcp-state").0.name matches "· short · [0-9]+ calls$" (25312 ms)