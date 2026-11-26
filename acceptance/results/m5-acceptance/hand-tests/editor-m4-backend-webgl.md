# VRMXG Editor: which backend draws (M4 check 8, M4 W13): AppProbe scenario, WebGL forced: run of Nov 25, 2026 at 4:02 PM

- **App:** VRMXG Editor 0.1.0 (1), apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `apps/editor-mac/docs/hand-test/HAND-TEST-M4-BACKEND-webgl.scenario.md`
- **Checklist:** `apps/editor-mac/docs/HAND-TEST-M4-BACKEND.md`
- **Result:** 1 rows: 1 passed, 0 failed, 0 need you; 0 checklist rows have no steps

## Passed

- **1. With `renderer=webgl` in the query the editor draws on WebGL, and the scene shows** (checklist line 11): find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved valid"; find("id=renderer").0.name == "Renderer WebGL"; find("role=alert").count == 0 (3321 ms)