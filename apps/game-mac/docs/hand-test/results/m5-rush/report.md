# The sample game on the Mac (M5 W10): AppProbe scenario: run of Nov 25, 2026 at 10:46 AM

- **App:** The Morning Rush 0.1.0 (1), apps/game-mac/build/morning-rush.app
- **Scenario:** `apps/game-mac/docs/hand-test/HAND-TEST-M5-RUSH.scenario.md`
- **Checklist:** `apps/game-mac/docs/HAND-TEST-M5-RUSH.md`
- **Result:** 4 rows: 4 passed, 0 failed, 0 need you; 0 checklist rows have no steps

## Passed

- **1. The sample game's title menu, on WebGPU, with a save in Slot 1** (checklist line 20): find("id=renderer").0.name == "Renderer WebGPU"; find("id=screen").0.name == "Screen title"; find("id=load-game enabled=true").count == 1; find("role=alert").count == 0 (1502 ms)
- **2. New Game plays the title scene, then the level; Hana's briefing is answered from the keyb…** (checklist line 21): find("id=screen").0.name == "Screen playing"; find("id=scene").0.name == "Scene game/title.vrmxs"; find("id=scene").0.name == "Scene game/level.vrmxs"; find("id=hud-goal").count == 1; find("text=Serve the three regulars").count >= 1; find("text=Until ten").count >= 1; find("id=dialogue-choice-ready").count == 1; find("text=Here comes Aoi").count >= 1 (17206 ms)
- **3. Left alone, the clock runs out: the game is lost, the lost ending says so, and the title …** (checklist line 22): find("id=scene").0.name == "Scene game/lost.vrmxs"; find("text=and the till is still open").count >= 1; find("id=scene").0.name == "Scene game/title.vrmxs" (246898 ms)
- **4. From the title menu, Load Game → Slot 1 (at the till, everyone served) and E close the ti…** (checklist line 23): find("id=screen").0.name == "Screen pause"; find("id=answer-discard").count == 1; find("id=screen").0.name == "Screen title"; find("id=screen").0.name == "Screen load"; find("id=message").0.name matches "^Loaded Slot 1 at step [0-9]+\\.$"; find("id=scene").0.name == "Scene game/level.vrmxs"; find("text=Close the till").count >= 1; find("id=scene").0.name == "Scene game/won.vrmxs"; find("text=Not one mistake. Best morning rush ever, Mira!").count >= 1; find("id=scene").0.name == "Scene game/title.vrmxs" (18171 ms)