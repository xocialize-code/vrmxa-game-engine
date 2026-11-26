# VRMXG Playground: which backend draws (M4 check 8, M4 W13): AppProbe scenario: run of Nov 25, 2026 at 3:57 PM

- **App:** VRMXG Playground 0.1.0 (1), apps/playground-mac/build/VRMXGPlayground.app
- **Scenario:** `apps/playground-mac/docs/hand-test/HAND-TEST-M4-BACKEND.scenario.md`
- **Checklist:** `apps/playground-mac/docs/HAND-TEST-M4-BACKEND.md`
- **Result:** 1 rows: 1 passed, 0 failed, 0 need you; 0 checklist rows have no steps

## Passed

- **1. With no query the playground draws on WebGPU, and it plays** (checklist line 10): find("id=renderer").0.name == "Renderer WebGPU"; find("id=play").0.name == "Pause"; find("id=step-count").0.name != $before; find("role=statictext text=Error").count == 0 (3696 ms)