# Timeline hand test (M2 W5): AppProbe scenario

Run `apps/editor-mac/scripts/build.sh`, launch the app once, then `apps/editor-mac/scripts/hand-test-fixtures.sh` (a
fresh copy of the sample project, opened through the shell's `VRMXG_SHELL_PROJECT` hook), then
`appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M2-TIMELINE.scenario.md`. The timeline's controls
have ids (`#tl-add-shot`, `#tl-type-animation`, `#tl-head-<track>`); readouts carry their value in their accessible
name (`#tl-scrub`: `Showing frame 130 step 325 alpha 0 world 5e65acbe356561f1`).

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M2-TIMELINE.md
env: {"VRMXG_SHELL_PROJECT": "project"}
fresh: false
```

- [ ] A new sequence films the cafe: it opens with an empty timeline and a CameraBrain on the set's camera.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  until find("id=doc-state").0.name matches "^Scene cafe.vrmxs"
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project"
  act id=seq-name action=set_value value=sequences/hand-test.vrmxs
  act id=new-sequence action=press
  until find("id=doc-state").0.name matches "^Scene sequences/hand-test.vrmxs 1 nodes unsaved changes valid"   # the brain only
  expect find("id=tl-head-shots").count == 1   # the timeline shows, with its shot row
  expect find("id=tl-scrub").0.name == "No preview"
  ```

- [ ] Three shots are laid out from the timeline, each on a virtual camera, each one undo step that also puts a clip on the camera track.
  ```steps
  act id=tl-cam-from-view action=press
  until find("id=undo").0.name == "Undo Add shot-cam from the view"
  act id=tl-cam-from-view action=press
  until find("id=undo").0.name == "Undo Add shot-cam-2 from the view"
  act id=tl-cam-shot-cam action=press
  act id=tl-add-shot action=press
  until find("id=undo").0.name == "Undo Add shot Shot 1"   # one step: the shot and its camera clip
  act id=tl-frame action=set_value value=48
  until find("id=tl-scrub").0.name matches "^Showing frame 48 step 120 "   # the preview built and scrubbed there
  act id=tl-cam-shot-cam-2 action=press
  act id=tl-add-shot action=press
  until find("id=undo").0.name == "Undo Add shot Shot 2"
  act id=tl-frame action=set_value value=96
  until find("id=tl-scrub").0.name matches "^Showing frame 96 step 240 "
  act id=tl-cam-shot-cam action=press
  act id=tl-add-shot action=press
  until find("id=undo").0.name == "Undo Add shot Shot 3"
  expect find("role=button name='Shot Shot 3 96 to 144' exact=true").count == 1   # 48 frames from the playhead
  expect find("role=button name='Clip shot-cam 96 to 144' exact=true").count == 1   # its camera clip
  ```

- [ ] Animation, expression and dialogue tracks for Hana get a clip, a key and a line from the timeline.
  ```steps
  act id=tl-type-animation action=press
  act id=tl-target-hana-1 action=press
  act id=tl-add-track action=press
  until find("id=tl-head-hana-1-animation").count == 1
  act id=tl-head-hana-1-animation action=press
  act id=tl-value action=set_value value=talk
  act id=tl-clip-length action=set_value value=60
  act id=tl-add-clip action=press
  until find("id=undo").0.name == "Undo Add clip to hana-1-animation @96"
  act id=tl-type-expression action=press
  act id=tl-add-track action=press
  until find("id=tl-head-hana-1-expression").count == 1
  act id=tl-head-hana-1-expression action=press
  act id=tl-value action=set_value value=1
  act id=tl-add-key action=press
  until find("id=undo").0.name == "Undo Key hana-1-expression.happy @96"
  act id=tl-type-dialogue action=press
  act id=tl-add-track action=press
  until find("id=tl-head-hana-1-dialogue").count == 1
  act id=tl-head-hana-1-dialogue action=press
  act id=tl-value action=set_value value="Welcome in!"
  act id=tl-add-clip action=press
  until find("id=undo").0.name == "Undo Add clip to hana-1-dialogue @96"
  expect find("role=button name='Clip Welcome in! 96 to 156' exact=true").count == 1
  pause 1500
  shot "built"
  ```

- [ ] A selected key moves with the arrow keys, one undo step per press.
  ```steps
  act role=button name="Key happy at 96" exact=true action=press
  keys right
  until find("id=undo").0.name == "Undo Move key hana-1-expression.happy to 97"
  keys shift+right
  until find("id=undo").0.name == "Undo Move key hana-1-expression.happy to 107"
  expect find("role=button name='Key happy at 107' exact=true").count == 1
  ```

- [ ] Undo walks the whole build back to the empty sequence, and redo returns it to the same document (same hash).
  ```steps
  set built = find("id=doc-state").0.name
  until find("id=undo").0.enabled == false do menu "Edit › Undo*" press tries=20
  expect find("id=doc-state").0.name matches "^Scene sequences/hand-test.vrmxs 1 nodes "   # back to the brain alone
  until find("id=doc-state").0.name == $built do menu "Edit › Redo*" press tries=20   # the same document, hash and all
  expect find("id=redo").0.enabled == false
  ```

- [ ] Save writes the sequence into the project; reopening it from disk gives the same bytes, and it validates.
  ```steps
  act id=save action=press
  until find("id=saved").0.name matches "^Saved sequences/hand-test.vrmxs · [0-9]+ bytes · [0-9a-f]{16}$"
  act id=verify action=press
  until find("id=verify-result").0.name == "Reopened sequences/hand-test.vrmxs: same bytes as saved, valid"
  ```

- [ ] Scrubbing the morning sequence to frame 130 shows the world the runtimes agree on (acceptance check 12's hash for that frame), forwards and backwards.
  ```steps
  act id=file-name action=set_value value=sequences/morning.vrmxs
  act id=open-file action=press   # WebKit's popup menus can't be picked over accessibility: open by name
  until find("id=doc-state").0.name matches "^Scene sequences/morning.vrmxs "
  act id=tl-frame action=set_value value=130
  until find("id=tl-scrub").0.name == "Showing frame 130 step 325 alpha 0 world 5e65acbe356561f1" timeout=60000   # acceptance/results: sequence.scrub, frame 130
  act id=tl-frame action=set_value value=40
  until find("id=tl-scrub").0.name == "Showing frame 40 step 100 alpha 0 world f0ef4e430dc29757"   # backwards, from a snapshot
  act id=tl-frame action=set_value value=200
  until find("id=tl-scrub").0.name == "Showing frame 200 step 500 alpha 0 world d8f38c6b9d156da1"
  shot "scrubbed"
  ```

- [ ] The preview plays in real time, through the shot camera, and the multi-angle view shows the shot and every virtual camera.
  ```steps
  act id=tl-frame action=set_value value=100
  until find("id=tl-scrub").0.name matches "^Showing frame 100 "
  act id=tl-play action=press
  pause 2000
  act id=tl-play action=press
  expect find("id=tl-frame").0.value >= 130   # about 48 frames in 2 s at 24 fps (frames the scrub can't keep up with are skipped)
  act id=tl-angles action=press
  until find("name='Angles: shot, vc-wide, vc-hana, vc-ots, vc-two' exact=true").count >= 1   # the shot, then every virtual camera (a group and its text: two elements)
  shot "angles"
  judge: human
  ```
