# Voice release check (AB-T-0614): Kokoro stays loaded after a cast, and leaves when a render starts: run of Nov 24, 2026 at 6:10 AM

- **App:** VRMXG Creator 0.1.0 (1), apps/creator-mac/build/VRMXGCreator.app
- **Scenario:** `/tmp/claude-501/-Volumes-Satechi-Development-vrmxa-game-engine/4a62f026-7cb5-42a4-9f47-ab4b92150e82/scratchpad/voice-release.scenario.md`
- **Result:** 3 rows: 3 passed, 0 failed, 0 need you

## Passed

- **1. The project opens, a draft short opens from a script, then the app idles**: find("id=doc-state").0.name matches "^Short cafe-order "; find("id=project-name").0.name == "Project project"; find("id=sb-status").0.name == "Storyboard 11 shots, 11 thumbnails"; find("id=open-result").0.name == "Opened first-light.fountain (script) → short first-light"; find("id=sb-status").0.name == "Storyboard 5 shots, 5 thumbnails" (20271 ms)
- **2. A cast voices the role's lines through the shell, then the app idles for twenty seconds**: find("id=undo").0.name == "Undo Cast HANA: Mira" (23932 ms)
- **3. An export renders, then the app idles**: find("id=q-job-1-status").0.name matches "^job-1 (done|failed)"; find("id=q-job-1-status").0.name matches "^job-1 done" (12001 ms)