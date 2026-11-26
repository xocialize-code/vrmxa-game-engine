# The game app on the Mac (M5 W1): AppProbe scenario, WebGL forced: run of Nov 25, 2026 at 2:33 PM

- **App:** The Cafe (test game) 0.1.0 (1), apps/game-mac/build/cafe-test.app
- **Scenario:** `apps/game-mac/docs/hand-test/HAND-TEST-M5-GAME-webgl.scenario.md`
- **Checklist:** `apps/game-mac/docs/HAND-TEST-M5-GAME.md`
- **Result:** 1 rows: 1 passed, 0 failed, 0 need you; 1 checklist rows have no steps

## Passed

- **1. With `renderer=webgl` in the query the game draws on WebGL, and it plays** (checklist line 26): find("id=renderer").0.name == "Renderer WebGL"; find("id=screen").0.name == "Screen playing"; find("id=scene").0.name == "Scene game/level.vrmxs"; find("id=step-count").0.name != $before; find("role=alert").count == 0 (6656 ms)
## Checklist rows with no steps (1, unticked)

- line 27, The game app on the Mac (M5 W1, AB-T-0616): (A person, with a real gamepad) Start pauses and resumes, the d-pad moves through every menu, A chooses, B goe
