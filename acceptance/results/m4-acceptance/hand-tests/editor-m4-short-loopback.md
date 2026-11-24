# M4 check 6 in the editor: the one-minute short twice, and the scrub check (M4 W13): AppProbe scenario: run of Nov 23, 2026 at 11:58 PM

- **App:** VRMXG Editor 0.1.0 (1), apps/editor-mac/build/VRMXGEditor.app
- **Scenario:** `apps/editor-mac/docs/hand-test/HAND-TEST-M4-SHORT.scenario.md`
- **Checklist:** `apps/editor-mac/docs/HAND-TEST-M4-SHORT.md`
- **Result:** 3 rows: 3 passed, 0 failed, 0 need you; 0 checklist rows have no steps

## Passed

- **1. "The Regular" opens in the timeline: 18 shots, cameras by rule, a dialogue track for each…** (checklist line 11): find("id=doc-state").0.name matches "^Scene [^ ]+ [0-9]+ nodes"; find("id=project-name").0.name == "Project project"; find("id=doc-state").0.name matches "^Scene [^ ]+ [0-9]+ nodes saved valid"; find("id=doc-state").0.name matches "^Scene sequences/the-regular.vrmxs [0-9]+ nodes saved valid"; find("id=tl-head-shots").count == 1; find("id=tl-head-hana-1-says").count == 1; find("id=tl-head-mira-says").count == 1; find("role=button name='Shot 010 0 to 48' exact=true").count == 1 (4351 ms)
- **2. It exports at 1080p24 with sound to H** (checklist line 12) ◐: partly checked, not: that the two files hold the same frames is checked by scripts/check-short-exports.mjs, outside the app; find("id=export-seconds").0.value matches "^60\.7"; find("id=export-result").0.name matches "^Exported short-a.mp4: 1457 frames, 60.708 s, H.264 1080p 24 fps, with sound .* subtitles short-a.srt, 13 lines$"; find("id=export-result").0.name matches "^Exported short-b.mp4: 1457 frames, 60.708 s, H.264 1080p 24 fps, with sound .* subtitles short-b.srt, 13 lines$" (26695 ms)
- **3. Jumping to frames of every shot, clip and key from snapshots draws exactly the frames the…** (checklist line 13): find("id=export-check-result").0.name matches "^Scrub (matches the export: all [0-9]+ frames|differs)"; find("id=export-check-result").0.name matches "^Scrub matches the export: all [0-9]+ frames" (5999 ms)