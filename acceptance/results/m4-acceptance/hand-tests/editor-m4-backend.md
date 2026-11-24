# VRMXG Editor: which backend draws (M4 check 8, M4 W13): AppProbe scenario: run of Nov 24, 2026 at 6:12 AM

- **App:** VRMXG Editor 0.1.0 (1), apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `apps/editor-mac/docs/hand-test/HAND-TEST-M4-BACKEND.scenario.md`
- **Checklist:** `apps/editor-mac/docs/HAND-TEST-M4-BACKEND.md`
- **Result:** 1 rows: 1 passed, 0 failed, 0 need you; 1 checklist rows have no steps

## Passed

- **1. With no query the editor draws on WebGPU, and the scene shows** (checklist line 10): find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved valid"; find("id=renderer").0.name == "Renderer WebGPU"; find("role=alert").count == 0 (2353 ms)
## Checklist rows with no steps (1, unticked)

- line 11, Which backend draws in the editor's Mac app (M4 check 8, M4 W13): With `renderer=webgl` in the query the editor draws on WebGL, and the scene shows.
