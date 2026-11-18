# Export hand test (M1 W8)

Frame export from the editor in its Mac app, on a fresh copy of the sample project (`scripts/hand-test-fixtures.sh`).
The take is the recorded 10 s walk into the cafe (`input/walk-in.json`, the acceptance run's input). AppProbe runs the
rows (`hand-test/HAND-TEST-M1-EXPORT.scenario.md`), the shell's `VRMXG_SHELL_EXPORT` hook standing in for the save
panel; `scripts/check-exports.mjs` then checks the files from outside the app with ffprobe and ffmpeg.

- [x] A 10 s take exports from the editor to H.264 1080p30 with sound: 300 frames, 10.000 s, the sound under it. *AppProbe 2026-11-18, then check-exports.mjs: 300 frames, each at n/30 s (largest error 3e-7 s); AAC 48 kHz stereo, starting at 0, 10.000 s; decoded, it lines up with the engine's mix at lag 0 (correlation 1.0). The save panel wasn't used (VRMXG_SHELL_EXPORT). Nobody has watched the file with sound on yet.*
- [x] The same take exported again gives the same frames: the rendered frames' hashes match frame for frame. *300 of 300 rendered-frame hashes (SHA-256 as they reached the shell) match, 300 distinct; the ProRes exports rendered the same 300. Decoded H.264 frames matched too (300 of 300, twice), but VideoToolbox doesn't promise that (AB-L-0013; the shell's DeterminismExperiment probe).*
- [x] 4K60: 600 frames, 10.000 s; the export time is shown. *7.3 s for the 10 s take (readback 7.4–7.7 ms a frame: the copy out of WebKit's GPU process).*
- [x] ProRes 4444 twice: the decoded frames are identical. *300 of 300 by ffmpeg framemd5; yuva444p12le.*
- [x] 29.97 fps lands exactly: 300 frames in 10.010 s (HEVC, 720p). *Every frame at n · 1001/30000 s; the sound 480,480 samples, lag 0.*
- [x] A still (1080p PNG) saves, and a thumbnail is written into the project. *1920×1080 and 480×270 PNGs. The still went through VRMXG_SHELL_SAVE, not the panel.*

## Results

| Date | Build | Row | Result |
|---|---|---|---|
| 2026-11-18 | Release, ad hoc signed (`scripts/build.sh`) | 1–6 | All passed (`appprobe checklist`, three full runs); `check-exports.mjs` 14 of 14 (`hand-test/results/export-check.json`); screenshots in `hand-test/shots/export/` (r1 the panel after the first export, r6 stills, a frame of take-a at 6.5 s) |
| 2026-11-18 | same | 3–5 | First runs errored: pressing a `<select>`'s popup item through accessibility didn't change it and left the menu open, blocking the next popup. Size, frame rate and codec are segmented buttons now |
