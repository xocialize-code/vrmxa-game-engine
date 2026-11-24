# Export hand test (M1 W8): AppProbe scenario: run of Nov 24, 2026 at 12:03 AM

- **App:** VRMXG Editor 0.1.0 (1), apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `apps/editor-mac/docs/hand-test/HAND-TEST-M1-EXPORT.scenario.md`
- **Checklist:** `apps/editor-mac/docs/HAND-TEST-M1-EXPORT.md`
- **Result:** 6 rows: 0 passed, 1 failed, 5 errors, 0 need you; 0 checklist rows have no steps

## Failed

### 1. A 10 s take exports from the editor to H

** (checklist line 8)

> A 10 s take exports from the editor to H.264 1080p30 with sound: 300 frames, 10.000 s, the sound under it.

**Failed:** after 10000 ms, still not find("id=doc-state").0.name matches "^Scene cafe.vrmxs": "Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0"

- 👀 shot 1: end
- ❌ `find("id=doc-state").0.name matches "^Scene cafe.vrmxs"`, got `"Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0"`


<details><summary>Steps (11285 ms)</summary>

```
launched VRMXG Editor pid 36113, log ~/Library/Caches/AppProbe/logs/VRMXGEditor-2026-11-24T080323Z.log
20: wait id=open-project enabled=true timeout_ms=40000 → found after 336 ms: button "Open project" #open-project [W:VRMXG Editor/0/0/0/0/0/1@4649] (339 ms)
21: until find("id=doc-state").0.name matches "^Scene cafe.vrmxs" → timed out, last "Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0" (10305 ms)
```
</details>

## Errors (the run's, not necessarily the app's)

### 2. The same take exported again gives the same frames: the rendered frames' hashes match fra…

** (checklist line 9)

> The same take exported again gives the same frames: the rendered frames' hashes match frame for frame.

**Error:** ELEMENT_NOT_FOUND: no element matches id=export-name

- 👀 shot 1: end


<details><summary>Steps (384 ms)</summary>

```
```
</details>

### 3. 4K60: 600 frames, 10

** (checklist line 10)

> 4K60: 600 frames, 10.000 s; the export time is shown.

**Error:** ELEMENT_NOT_FOUND: no element matches id=size-4k

- 👀 shot 1: end


<details><summary>Steps (378 ms)</summary>

```
```
</details>

### 4. ProRes 4444 twice: the decoded frames are identical

** (checklist line 11)

> ProRes 4444 twice: the decoded frames are identical.

**Error:** ELEMENT_NOT_FOUND: no element matches id=size-1080p

- 👀 shot 1: end


<details><summary>Steps (378 ms)</summary>

```
```
</details>

### 5. 29

** (checklist line 12)

> 29.97 fps lands exactly: 300 frames in 10.010 s (HEVC, 720p).

**Error:** ELEMENT_NOT_FOUND: no element matches id=codec-hevc

- 👀 shot 1: end


<details><summary>Steps (364 ms)</summary>

```
```
</details>

### 6. A still (1080p PNG) saves, and a thumbnail is written into the project

** (checklist line 13)

> A still (1080p PNG) saves, and a thumbnail is written into the project.

**Error:** ELEMENT_NOT_FOUND: no element matches id=size-1080p

- 👀 shot 1: end


<details><summary>Steps (377 ms)</summary>

```
```
</details>

## Results rows

In the checklist's format, to copy in (`fill=true` writes the failures in, and ticks the passes).

| # | Step | What happened | Undo name | Task filed |
|---|------|---------------|-----------|------------|
| 1 | A 10 s take exports from the editor to H | after 10000 ms, still not find("id=doc-state").0.name matches "^Scene cafe.vrmxs": "Scene cafe-cart.vrmxs 30 nodes saved valid hash 7636dc6e7e38e7e0" | (none) | |
| 2 | The same take exported again gives the same frames: the rendered frames' hashes match fra… | run error: ELEMENT_NOT_FOUND: no element matches id=export-name | (none) | |
| 3 | 4K60: 600 frames, 10 | run error: ELEMENT_NOT_FOUND: no element matches id=size-4k | (none) | |
| 4 | ProRes 4444 twice: the decoded frames are identical | run error: ELEMENT_NOT_FOUND: no element matches id=size-1080p | (none) | |
| 5 | 29 | run error: ELEMENT_NOT_FOUND: no element matches id=codec-hevc | (none) | |
| 6 | A still (1080p PNG) saves, and a thumbnail is written into the project | run error: ELEMENT_NOT_FOUND: no element matches id=size-1080p | (none) | |
