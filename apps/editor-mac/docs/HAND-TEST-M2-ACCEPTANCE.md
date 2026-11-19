# M2 acceptance in the editor (M2 W12)

The rows of M2's exit checks ([M2-PLAN.md](../../../M2-PLAN.md) "What M2 is done looking like") that need the editor's
Mac app, on a fresh copy of the sample project (`scripts/hand-test-fixtures.sh`) with "Morning at the cafe"
(`sequences/cafe-morning.vrmxs`). AppProbe runs them (`hand-test/HAND-TEST-M2-ACCEPTANCE.scenario.md`);
`scripts/check-sequence-exports.mjs` checks the exported files from outside the app; check 9 is a Claude Code session
(`scripts/mcp-session.mjs --m2`).

- [x] Check 1: "Morning at the cafe" opens in the timeline with five shots on a 24 fps ruler and a track of every kind: camera cuts and blends, Hana's animation (held on twos), an expression, look-at, dialogue for both, event keys (steam, the music cue), property keys (the counter light, the music's fade, the look) and a post track.
  *AppProbe 2026-11-18: the five shots and all 13 track headers are present, and a scrub to frame 699 (the steam) shows step 1747 at α 0.5 (world f279b7d7d26f3e47). What the tracks look like on screen was not judged.*
- [x] Check 1: an edit is one undo step, undo restores the document exactly, and save then reopen gives the same bytes and validates.
  *AppProbe 2026-11-18: moving Hana's happy key from 912 to 913 is "Undo Move key hana-face.happy to 913". Edit › Undo gives back the same document state, hash included. Save then Reopen & compare says "same bytes as saved, valid".*
- [x] Check 5: the sequence exports at 1080p24 with sound to H.264 twice and to ProRes 4444: 1,080 frames, 45.000 s, with its subtitles beside each file.
  *AppProbe 2026-11-18, then `check-sequence-exports.mjs` 10/10:*
  - *every file has 1,080 frames, each at n/24 s (largest error 3.3e-7 s);*
  - *sound is at lag 0 with correlation 1;*
  - *the three files' frames are identical, and ProRes decodes to 1,080 distinct frames;*
  - *each `.srt` has the 4 lines at their frames.*

  *The exports took 6.9–7.5 s each in the Mac app (scheme origin).*
- [x] Checks 2 and 5: jumping to frames of every shot, line and cue from snapshots draws exactly the frames the export rendered by playing through.
  *AppProbe 2026-11-18: "Scrub matches the export: all 26 frames" (0, 84, 120, … 1079). Each frame is drawn at the export size on a fresh world, jumping backwards, and hashed as the export hashes its frames.*
- [x] Check 8: a game saved in play goes to a file through the shell, and loading it gives the world as saved.
  *AppProbe 2026-11-18: saved slot-1 at step 215 (236 KB, world cc6e53587c13f158), stopped, then Load Game reads "the world as saved" (step 215, the same hash). This row crashed the app on the first run (see Results).*

## Results

| Date | Build | Row | Result |
|---|---|---|---|
| 2026-11-18 | shell 0.3.x, before the fix | Check 8 | **Crash** on the first `saves.*` call (SIGABRT, `swift_abortRetainUnowned` in `SaveMethods.register(on:)`): the shell made `SaveMethods` as a temporary, and its handlers held it unowned. The shell now keeps it for the app's life (`ShellAppDelegate.saves`, shell 0.4.0) |
| 2026-11-18 | before the LUT fix | Check 5 | The Mac export's frames differed from a scrub with the same world: the LUT grade loads asynchronously, and an offline frame drew before it arrived. `RenderHost.frameAt` now awaits `PostStack.settle()` |
| 2026-11-18 | before the aspect fix | Check 9 | After the agent's `screenshot`, frame 1120 scrubbed to a different world (247d041cb7b35c39) from the forward render (cce1afb14536dba1). The still resized the preview world's output and gave it the viewport's aspect, which the VirtualCameras' composer frames with in the step. A sequence world now fixes its aspect at 16:9 (`CameraService.fixAspect`, in `SequenceService.prepare`) |
| 2026-11-18 | M2 commit | Check 9 | `mcp-session.mjs --m2` (Sonnet, editor tools only). The agent made 20 calls (2 refused: `get_node hana-1` is a set node). It read the tracks with `sequence {path}`. In two batch edits it added vc-goodbye, shot 6 "Goodbye" (1080–1176), Hana's happy keys at 1092 and 1164, Mira's line at 1100–1150 and an inline brain tree for Mira. It rendered frame 1120 (world b556847fa65a5368), played 600 steps and read Hana's brain (utility > sequence > wait, tend 0.5). The editor's Undo read "Undo Goodbye details (MCP)", then "Undo Goodbye shot (MCP)", and two undos gave back 30ec2200fdd408c3, saved and valid. The scrub to 1120 after the agent's still and play restored from 2760 to the same b556847fa65a5368 |
| 2026-11-18 | M2 commit | All five rows | AppProbe 5/5 (`hand-test/results/m2-acceptance/report.md`); `check-sequence-exports.mjs` 10/10 |
