# Export hand test (M1 W8): AppProbe scenario: run of Nov 25, 2026 at 4:03 PM

- **App:** VRMXG Editor 0.1.0 (1), apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `apps/editor-mac/docs/hand-test/HAND-TEST-M1-EXPORT.scenario.md`
- **Checklist:** `apps/editor-mac/docs/HAND-TEST-M1-EXPORT.md`
- **Result:** 6 rows: 6 passed, 0 failed, 0 need you; 0 checklist rows have no steps

## Passed

- **1. A 10 s take exports from the editor to H** (checklist line 8): find("id=doc-state").0.name matches "^Scene cafe"; find("id=project-name").0.name == "Project project"; find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved"; find("id=doc-state").0.name matches "^Scene cafe.vrmxs [0-9]+ nodes saved"; find("id=export-take").0.value == "input/walk-in.json"; find("id=export-result").0.name matches "^Exported take-a.mp4: 300 frames, 10.000 s, H.264 1080p 30 fps, with sound" (11970 ms)
- **2. The same take exported again gives the same frames: the rendered frames' hashes match fra…** (checklist line 9) ◐: partly checked, not: the two files' frame hashes are compared by scripts/check-exports.mjs, outside the app; find("id=export-result").0.name matches "^Exported take-b.mp4: 300 frames, 10.000 s" (4276 ms)
- **3. 4K60: 600 frames, 10** (checklist line 10): find("id=export-result").0.name matches "^Exported take-4k60.mp4: 600 frames, 10.000 s, H.264 4k 60 fps" (10972 ms)
- **4. ProRes 4444 twice: the decoded frames are identical** (checklist line 11) ◐: partly checked, not: decoded frames are compared by scripts/check-exports.mjs (ffmpeg framemd5); find("id=export-result").0.name matches "^Exported prores-a.mov: 300 frames, 10.000 s, ProRes 4444 1080p 30 fps"; find("id=export-result").0.name matches "^Exported prores-b.mov: 300 frames" (8666 ms)
- **5. 29** (checklist line 12): find("id=export-result").0.name matches "^Exported ntsc.mp4: 300 frames, 10.010 s, HEVC 720p 29.97 fps" (3797 ms)
- **6. A still (1080p PNG) saves, and a thumbnail is written into the project** (checklist line 13): find("id=still-result").0.name matches "^Still .*cafe-still.png"; find("id=still-result").0.name matches "^Thumbnail thumbnails/cafe.png" (733 ms)