# M2 acceptance in the editor (M2 W12): AppProbe scenario: run of Nov 24, 2026 at 12:04 AM

- **App:** VRMXG Editor 0.1.0 (1), apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `apps/editor-mac/docs/hand-test/HAND-TEST-M2-ACCEPTANCE.scenario.md`
- **Checklist:** `apps/editor-mac/docs/HAND-TEST-M2-ACCEPTANCE.md`
- **Result:** 5 rows: 1 passed, 2 failed, 2 errors, 0 need you; 0 checklist rows have no steps

## Failed

### 1. Check 1: "Morning at the cafe" opens in the timeline with five shots on a 24 fps ruler an…

** (checklist line 9)

> Check 1: "Morning at the cafe" opens in the timeline with five shots on a 24 fps ruler and a track of every kind: camera cuts and blends, Hana's animation (held on twos), an expression, look-at, dialogue for both, event keys (steam, the music cue), property keys (the counter light, the music's fade, the look) and a post track.

**Failed:** after 10000 ms, still not find("id=doc-state").0.name matches "^Scene cafe.vrmxs": "Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0"

- 👀 shot 1: end
- ❌ `find("id=doc-state").0.name matches "^Scene cafe.vrmxs"`, got `"Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0"`


<details><summary>Steps (11246 ms)</summary>

```
launched VRMXG Editor pid 36207, log ~/Library/Caches/AppProbe/logs/VRMXGEditor-2026-11-24T080340Z.log
19: wait id=open-project enabled=true timeout_ms=40000 → found after 322 ms: button "Open project" #open-project [W:VRMXG Editor/0/0/0/0/0/1@4649] (324 ms)
20: until find("id=doc-state").0.name matches "^Scene cafe.vrmxs" → timed out, last "Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0" (10294 ms)
```
</details>

### 3. Check 5: the sequence exports at 1080p24 with sound to H

** (checklist line 13)

> Check 5: the sequence exports at 1080p24 with sound to H.264 twice and to ProRes 4444: 1,080 frames, 45.000 s, with its subtitles beside each file.

**Failed:** the sequence is the take, at its own length (and rate: the result says 24 fps): not so (`find("id=export-seconds").0.value matches "^45"` read "10")

- 👀 shot 1: end
- ❌ `find("id=export-seconds").0.value matches "^45"`, got `"10"`


<details><summary>Steps (472 ms)</summary>

```
62: act id=export-open action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":26,"w":59,"x":4510,"y":162},"help":"","id":"export-open","name":"Export","ref":"W:VRMXG Editor/ (33 ms)
63: wait id=export-run timeout_ms=5000 → found after 40 ms: button "Export video" #export-run [W:VRMXG Editor/0/0/0/0/2/1/11@36b9] (40 ms)
64: expect find("id=export-seconds").0.value matches "^45" → got "10" (31 ms)
```
</details>

## Errors (the run's, not necessarily the app's)

### 2. Check 1: an edit is one undo step, undo restores the document exactly, and save then reop…

** (checklist line 11)

> Check 1: an edit is one undo step, undo restores the document exactly, and save then reopen gives the same bytes and validates.

**Error:** ELEMENT_NOT_FOUND: no element matches role=button name="Key happy at 912"

- 👀 shot 1: end


<details><summary>Steps (436 ms)</summary>

```
48: set before = find("id=doc-state").0.name → "Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0" (30 ms)
```
</details>

### 4. Checks 2 and 5: jumping to frames of every shot, line and cue from snapshots draws exactl…

** (checklist line 21)

> Checks 2 and 5: jumping to frames of every shot, line and cue from snapshots draws exactly the frames the export rendered by playing through.

**Error:** ELEMENT_NOT_FOUND: no element matches id=export-check

- 👀 shot 1: end


<details><summary>Steps (384 ms)</summary>

```
```
</details>

## Passed

- **5. Check 8: a game saved in play goes to a file through the shell, and loading it gives the …** (checklist line 23): find("id=doc-state").0.name matches "^Scene cafe.vrmxs "; find("id=play").0.name == "Stop"; find("id=pause-game").0.name == "Resume"; find("id=game-note").0.name matches "^saved slot-1 at step [0-9]+ \([0-9]+ KB\) · [0-9a-f]{16}$"; find("id=play").0.name == "Play"; find("id=game-note").0.name matches "^loaded slot-1 at step [0-9]+ \(paused\) · [0-9a-f]{16} · the world as saved$"; find("id=play").0.name == "Play" (7977 ms)
## Results rows

In the checklist's format, to copy in (`fill=true` writes the failures in, and ticks the passes).

| # | Step | What happened | Undo name | Task filed |
|---|------|---------------|-----------|------------|
| 1 | Check 1: "Morning at the cafe" opens in the timeline with five shots on a 24 fps ruler an… | after 10000 ms, still not find("id=doc-state").0.name matches "^Scene cafe.vrmxs": "Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0" | (none) | |
| 2 | Check 1: an edit is one undo step, undo restores the document exactly, and save then reop… | run error: ELEMENT_NOT_FOUND: no element matches role=button name="Key happy at 912" | (none) | |
| 3 | Check 5: the sequence exports at 1080p24 with sound to H | the sequence is the take, at its own length (and rate: the result says 24 fps): not so (`find("id=export-seconds").0.value matches "^45"` read "10") | (none) | |
| 4 | Checks 2 and 5: jumping to frames of every shot, line and cue from snapshots draws exactl… | run error: ELEMENT_NOT_FOUND: no element matches id=export-check | (none) | |
