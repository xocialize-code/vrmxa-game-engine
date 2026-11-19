# M2 acceptance in the editor (M2 W12): AppProbe scenario

Run `apps/editor-mac/scripts/build.sh`, launch the app once, then `apps/editor-mac/scripts/hand-test-fixtures.sh` (a
fresh project, an empty `exports/`), then
`appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M2-ACCEPTANCE.scenario.md`, then
`node apps/editor-mac/scripts/check-sequence-exports.mjs`. Exports land in the container's `tmp/exports/` with their
evidence beside them (`<file>.frames.json`, `<file>.wav`) and their subtitles (`<file>.srt`).

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M2-ACCEPTANCE.md
env: {"VRMXG_SHELL_PROJECT": "project", "VRMXG_SHELL_EXPORT": "exports/"}
fresh: false
```

- [ ] Check 1: "Morning at the cafe" opens in the timeline with five shots on a 24 fps ruler and a track of every kind: camera cuts and blends, Hana's animation (held on twos), an expression, look-at, dialogue for both, event keys (steam, the music cue), property keys (the counter light, the music's fade, the look) and a post track.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  until find("id=doc-state").0.name matches "^Scene cafe.vrmxs"
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project"
  act id=file-name action=set_value value=sequences/cafe-morning.vrmxs
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene sequences/cafe-morning.vrmxs [0-9]+ nodes saved valid"
  expect find("role=button name='Shot Morning 0 to 168' exact=true").count == 1
  expect find("role=button name='Shot Served 870 to 1080' exact=true").count == 1   # the fifth shot ends at 45 s
  expect find("id=tl-head-cameras").count == 1   # cuts, and blends into vc-ots and the last shot
  expect find("id=tl-head-hana-talk").count == 1   # animation, on twos
  expect find("id=tl-head-hana-face").count == 1   # expression
  expect find("id=tl-head-eyes-mira").count == 1   # look-at
  expect find("id=tl-head-hana-says").count == 1   # dialogue
  expect find("id=tl-head-mira-says").count == 1
  expect find("id=tl-head-steam").count == 1   # event keys
  expect find("id=tl-head-music-cue").count == 1
  expect find("id=tl-head-counter-light").count == 1   # property keys
  expect find("id=tl-head-music-fade").count == 1
  expect find("id=tl-head-look").count == 1
  expect find("id=tl-head-fade").count == 1   # post
  act id=tl-frame action=set_value value=699
  until find("id=tl-scrub").0.name matches "^Showing frame 699 step 17[0-9]{2} alpha 0.5 world [0-9a-f]{16}$" timeout=90000   # the steam starts
  pause 1500
  shot "film"
  ```

- [ ] Check 1: an edit is one undo step, undo restores the document exactly, and save then reopen gives the same bytes and validates.
  ```steps
  set before = find("id=doc-state").0.name
  act role=button name="Key happy at 912" exact=true action=press
  keys right
  until find("id=undo").0.name == "Undo Move key hana-face.happy to 913"
  menu "Edit › Undo*" press
  until find("id=doc-state").0.name == $before   # the same document, hash and all
  act id=save action=press
  until find("id=saved").0.name matches "^Saved sequences/cafe-morning.vrmxs · [0-9]+ bytes · [0-9a-f]{16}$"
  act id=verify action=press
  until find("id=verify-result").0.name == "Reopened sequences/cafe-morning.vrmxs: same bytes as saved, valid"
  ```

- [ ] Check 5: the sequence exports at 1080p24 with sound to H.264 twice and to ProRes 4444: 1,080 frames, 45.000 s, with its subtitles beside each file.
  ```steps
  act id=export-open action=press
  wait id=export-run timeout_ms=5000
  expect find("id=export-seconds").0.value matches "^45"   # the sequence is the take, at its own length (and rate: the result says 24 fps)
  act id=size-1080p action=press
  act id=codec-h264 action=press
  act id=export-name action=set_value value=film-a
  act id=export-run action=press
  until find("id=export-result").0.name matches "^Exported film-a.mp4: 1080 frames, 45.000 s, H.264 1080p 24 fps, with sound .* subtitles film-a.srt, 4 lines$" timeout=600000
  act id=export-name action=set_value value=film-b
  act id=export-run action=press
  until find("id=export-result").0.name matches "^Exported film-b.mp4: 1080 frames, 45.000 s" timeout=600000
  act id=codec-prores4444 action=press
  act id=export-name action=set_value value=film-prores
  act id=export-run action=press
  until find("id=export-result").0.name matches "^Exported film-prores.mov: 1080 frames, 45.000 s, ProRes 4444 1080p 24 fps, with sound .* subtitles film-prores.srt, 4 lines$" timeout=900000
  shot "exported"
  partial: frame counts, timestamps, the sound's alignment, the frame hashes across the three files and the subtitles are checked by scripts/check-sequence-exports.mjs, outside the app
  ```

- [ ] Checks 2 and 5: jumping to frames of every shot, line and cue from snapshots draws exactly the frames the export rendered by playing through.
  ```steps
  act id=export-check action=press
  until find("id=export-check-result").0.name matches "^Scrub matches the export: all [0-9]+ frames" timeout=300000   # each frame jumped to backwards from snapshots, drawn at 1080p with the post stack, hashed as the export hashed it
  shot "scrub-check"
  ```

- [ ] Check 8: a game saved in play goes to a file through the shell, and loading it gives the world as saved.
  ```steps
  act id=export-open action=press
  act id=file-name action=set_value value=cafe.vrmxs
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene cafe.vrmxs "
  act id=play action=press
  until find("id=play").0.name == "Stop"
  pause 3000
  act id=pause-game action=press
  until find("id=pause-game").0.name == "Resume"
  act id=save-game action=press
  until find("id=game-note").0.name matches "^saved slot-1 at step [0-9]+ \([0-9]+ KB\) · [0-9a-f]{16}$"
  act id=play action=press
  until find("id=play").0.name == "Play"
  act id=load-game action=press
  until find("id=game-note").0.name matches "^loaded slot-1 at step [0-9]+ \(paused\) · [0-9a-f]{16} · the world as saved$" timeout=60000
  shot "game-loaded"
  act id=play action=press
  until find("id=play").0.name == "Play"
  ```
