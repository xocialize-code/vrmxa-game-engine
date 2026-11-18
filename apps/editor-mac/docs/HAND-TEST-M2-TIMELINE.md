# Timeline hand test (M2 W5)

The editor's timeline in its Mac app, on a fresh copy of the sample project (`scripts/hand-test-fixtures.sh`). Rows the
Node tests (`engine/packages/editor-core/test/timeline.test.mjs`) can't cover: the panel's own controls, the shell's
project writes, the scrub preview in WKWebView. AppProbe runs them (`hand-test/HAND-TEST-M2-TIMELINE.scenario.md`); a
person checks the screenshots.

- [x] A new sequence films the cafe: it opens with an empty timeline and a CameraBrain on the set's camera. *AppProbe 2026-11-18: named in the sequence field, the set the default cafe.vrmxs (its popup wasn't changed).*
- [x] Three shots are laid out from the timeline, each on a virtual camera, each one undo step that also puts a clip on the camera track. *AppProbe 2026-11-18: both cameras made with Camera from view; the playhead moved by the Frame field, each move a scrub of the preview.*
- [x] Animation, expression and dialogue tracks for Hana get a clip, a key and a line from the timeline. *AppProbe 2026-11-18: with the panel's buttons. Dragging a clip wasn't in the scenario; a real pointer drag of a key was checked in the browser (one "Move key … to 123" step).*
- [x] A selected key moves with the arrow keys, one undo step per press. *AppProbe 2026-11-18: → and ⇧→ (1 and 10 frames).*
- [x] Undo walks the whole build back to the empty sequence, and redo returns it to the same document (same hash). *AppProbe 2026-11-18: from the Edit menu, compared by the document's hash.*
- [x] Save writes the sequence into the project; reopening it from disk gives the same bytes, and it validates. *AppProbe 2026-11-18: validated with its set (the brain's camera is a set node).*
- [x] Scrubbing the morning sequence to frame 130 shows the world the runtimes agree on (acceptance check 12's hash for that frame), forwards and backwards. *AppProbe 2026-11-18: frames 130, 40 and 200, each the hash Node, Chromium and WKWebView record for that frame. Opened by name (Open), since WebKit's popups can't be picked over accessibility.*
- [x] The preview plays in real time, through the shot camera, and the multi-angle view shows the shot and every virtual camera. *AppProbe 2026-11-18: the playhead passed frame 130 after 2 s from 100 (frames the scrub can't keep up with are skipped); the angle grid judged from its screenshot (`hand-test/results/m2-timeline/shots/r8-1.png`): Hana's close-up as the shot, then the four virtual cameras.*

## Results

| Date | Build | Row | Result |
|---|---|---|---|
| 2026-11-18 | Release, ad hoc signed (`scripts/build.sh`) | 1–8 | All passed, twice in a row (`appprobe checklist`); row 8 judged by its screenshot. Report and screenshots in `hand-test/results/m2-timeline/`. Earlier runs found four app bugs, fixed: a header press deleting its track (the delete button sat inside it), the frame field losing typed text when the preview rebuilt, a stale camera choice from the previous sequence, typed fields not selecting their text when ⌘A missed |
