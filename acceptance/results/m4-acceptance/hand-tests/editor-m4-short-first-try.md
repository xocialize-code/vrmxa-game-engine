# M4 check 6 in the editor: the one-minute short twice, and the scrub check (M4 W13): AppProbe scenario: run of Nov 23, 2026 at 11:54 PM

- **App:** VRMXG Editor 0.1.0 (1), apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `apps/editor-mac/docs/hand-test/HAND-TEST-M4-SHORT.scenario.md`
- **Checklist:** `apps/editor-mac/docs/HAND-TEST-M4-SHORT.md`
- **Result:** 3 rows: 0 passed, 2 failed, 1 errors, 0 need you; 0 checklist rows have no steps

## Failed

### 1. "The Regular" opens in the timeline: 18 shots, cameras by rule, a dialogue track for each…

** (checklist line 11)

> "The Regular" opens in the timeline: 18 shots, cameras by rule, a dialogue track for each of them.

**Failed:** after 10000 ms, still not find("id=doc-state").0.name matches "^Scene cafe.vrmxs": "Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0"

- 👀 shot 1: end
- ❌ `find("id=doc-state").0.name matches "^Scene cafe.vrmxs"`, got `"Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0"`


<details><summary>Steps (11660 ms)</summary>

```
launched VRMXG Editor pid 34872, log ~/Library/Caches/AppProbe/logs/VRMXGEditor-2026-11-24T075440Z.log
21: wait id=open-project enabled=true timeout_ms=40000 → found after 554 ms: button "Open project" #open-project [W:VRMXG Editor/0/0/0/0/0/1@4649] (557 ms)
22: until find("id=doc-state").0.name matches "^Scene cafe.vrmxs" → timed out, last "Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0" (10133 ms)
```
</details>

### 2. It exports at 1080p24 with sound to H

** (checklist line 12)

> It exports at 1080p24 with sound to H.264 twice: 1,457 frames, 60.708 s, with its 13 subtitles beside each file.

**Failed:** the sequence is the take, at its own length: not so (`find("id=export-seconds").0.value matches "^60\.7"` read "10")

- 👀 shot 1: end
- ❌ `find("id=export-seconds").0.value matches "^60\.7"`, got `"10"`


<details><summary>Steps (473 ms)</summary>

```
36: act id=export-open action=press → {"action":"press","delivery":"delivered","element":{"frame":{"h":26,"w":59,"x":4510,"y":162},"help":"","id":"export-open","name":"Export","ref":"W:VRMXG Editor/ (33 ms)
37: wait id=export-run timeout_ms=5000 → found after 41 ms: button "Export video" #export-run [W:VRMXG Editor/0/0/0/0/2/1/11@36b9] (41 ms)
38: expect find("id=export-seconds").0.value matches "^60\.7" → got "10" (31 ms)
```
</details>

## Errors (the run's, not necessarily the app's)

### 3. Jumping to frames of every shot, clip and key from snapshots draws exactly the frames the…

** (checklist line 13)

> Jumping to frames of every shot, clip and key from snapshots draws exactly the frames the export rendered.

**Error:** ELEMENT_NOT_FOUND: no element matches id=export-check

- 👀 shot 1: end


<details><summary>Steps (396 ms)</summary>

```
```
</details>

## Results rows

In the checklist's format, to copy in (`fill=true` writes the failures in, and ticks the passes).

| # | Step | What happened | Undo name | Task filed |
|---|------|---------------|-----------|------------|
| 1 | "The Regular" opens in the timeline: 18 shots, cameras by rule, a dialogue track for each… | after 10000 ms, still not find("id=doc-state").0.name matches "^Scene cafe.vrmxs": "Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0" | (none) | |
| 2 | It exports at 1080p24 with sound to H | the sequence is the take, at its own length: not so (`find("id=export-seconds").0.value matches "^60\.7"` read "10") | (none) | |
| 3 | Jumping to frames of every shot, clip and key from snapshots draws exactly the frames the… | run error: ELEMENT_NOT_FOUND: no element matches id=export-check | (none) | |
