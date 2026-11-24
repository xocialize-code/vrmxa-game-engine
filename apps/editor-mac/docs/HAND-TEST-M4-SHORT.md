# M4 check 6 in the editor: the one-minute short twice, and the scrub check (M4 W13)

M4's exit check 6 ([M4-PLAN.md](../../../M4-PLAN.md) "What M4 is done looking like") on the sample short itself, in the
editor's Mac app (WKWebView on the shell, WebGPU by default): "The Regular" (`sequences/the-regular.vrmxs`) exports
twice to the same frames, and jumping to its frames from snapshots draws exactly the exported frames. The creator has
no Check Against Scrub of its own; it shares the editor's host, so the editor's is the same code. AppProbe runs the
rows (`hand-test/HAND-TEST-M4-SHORT.scenario.md`), on a fresh copy of the sample project
(`scripts/hand-test-fixtures.sh`); `scripts/check-short-exports.mjs` compares the two files' frame hashes from outside
the app.

- [x] "The Regular" opens in the timeline: 18 shots, cameras by rule, a dialogue track for each of them.
  *AppProbe 2026-11-24, over loopback and over the scheme: the sequence opens saved and valid, with its shot row, both dialogue tracks and shot 010 on frames 0 to 48. The shots weren't counted on screen; the sequence file has 18.*
- [x] It exports at 1080p24 with sound to H.264 twice: 1,457 frames, 60.708 s, with its 13 subtitles beside each file.
  *AppProbe 2026-11-24, both origins: each export's result line reads 1457 frames, 60.708 s, H.264 1080p 24 fps, with sound, 13 subtitle lines, in about 11.5 s. `check-short-exports.mjs`: both files hold 1,457 frames at n/24 s with sound from 0, and their per-frame hashes are the same frame for frame, over loopback and over the scheme alike ([loopback](hand-test/results/short-export-check.json), [scheme](hand-test/results/short-export-check-scheme.json)). The frames are the creator's WebGPU delivery's, frame for frame.*
- [x] Jumping to frames of every shot, clip and key from snapshots draws exactly the frames the export rendered.
  *AppProbe 2026-11-24, both origins: "Scrub matches the export: all 70 frames".*

## Results

| Row | Step | What happened |
|---|---|---|
| 1 | `until doc-state matches "^Scene cafe.vrmxs"` | The scenario's own mistake, copied from the M2 scenario: the bundled sample's first scene is `cafe-cart.vrmxs` since M3 W12. Fixed in the scenario (and in the M1 and M2 scenarios it came from) |
