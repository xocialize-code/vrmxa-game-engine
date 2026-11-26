# VRMXG Editor: which backend draws (M4 check 8, M4 W13): AppProbe scenario: run of Nov 25, 2026 at 4:01 PM

- **App:** VRMXG Editor 0.1.0 (1), apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `apps/editor-mac/docs/hand-test/HAND-TEST-M4-BACKEND.scenario.md`
- **Checklist:** `apps/editor-mac/docs/HAND-TEST-M4-BACKEND.md`
- **Result:** 1 rows: 1 passed, 0 failed, 0 need you; 0 checklist rows have no steps

## Passed

- **1. With no query the editor draws on WebGPU, and the scene shows** (checklist line 10): find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved valid"; find("id=renderer").0.name == "Renderer WebGPU"; find("role=alert").count == 0 (3679 ms)