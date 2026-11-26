# VRMXG Playground: which backend draws (M4 check 8, M4 W13): AppProbe scenario, WebGL forced: run of Nov 25, 2026 at 3:57 PM

- **App:** VRMXG Playground 0.1.0 (1), apps/playground-mac/build/VRMXGPlayground.app
- **Scenario:** `apps/playground-mac/docs/hand-test/HAND-TEST-M4-BACKEND-webgl.scenario.md`
- **Checklist:** `apps/playground-mac/docs/HAND-TEST-M4-BACKEND.md`
- **Result:** 1 rows: 1 passed, 0 failed, 0 need you; 0 checklist rows have no steps

## Passed

- **1. With `renderer=webgl` in the query the playground draws on WebGL, and it plays** (checklist line 11): find("id=renderer").0.name == "Renderer WebGL"; find("id=play").0.name == "Pause"; find("id=step-count").0.name != $before; find("role=statictext text=Error").count == 0 (3820 ms)