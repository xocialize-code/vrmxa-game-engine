# M4 check 6 in the editor: the one-minute short twice, and the scrub check (M4 W13): AppProbe scenario

Run `apps/editor-mac/scripts/build.sh`, launch the app once, then `apps/editor-mac/scripts/hand-test-fixtures.sh` (a
fresh project, an empty `exports/`), then, under the GPU lock,
`appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M4-SHORT.scenario.md`, then
`node apps/editor-mac/scripts/check-short-exports.mjs` (the two files' frame hashes, from outside the app).
- **The origin:** the app loads over loopback. For the custom scheme, add `"VRMXG_ORIGIN": "scheme"` to `env` (a copy of
  this file beside it will do) and pass `--tag scheme` to the check script, so the two runs' results are kept apart.
- **The backend:** the view's, WebGPU by default (M4 W3). `#backend` isn't read here; the export's frame digest is the
  backend's own (`acceptance/results/m4-acceptance/`).

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M4-SHORT.md
env: {"VRMXG_SHELL_PROJECT": "project", "VRMXG_SHELL_EXPORT": "exports/"}
fresh: false
```

- [ ] "The Regular" opens in the timeline: 18 shots, cameras by rule, a dialogue track for each of them.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  until find("id=doc-state").0.name matches "^Scene [^ ]+ [0-9]+ nodes" timeout=60000   # the bundled sample's first scene (cafe-cart.vrmxs since M3 W12)
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project"
  until find("id=doc-state").0.name matches "^Scene [^ ]+ [0-9]+ nodes saved valid" timeout=60000   # the project's first scene, before the sequence is asked for
  act id=file-name action=set_value value=sequences/the-regular.vrmxs
  act id=open-file action=press
  until find("id=doc-state").0.name matches "^Scene sequences/the-regular.vrmxs [0-9]+ nodes saved valid" timeout=60000
  expect find("id=tl-head-shots").count == 1
  expect find("id=tl-head-hana-1-says").count == 1
  expect find("id=tl-head-mira-says").count == 1
  expect find("role=button name='Shot 010 0 to 48' exact=true").count == 1   # the first of the 18 shots
  ```

- [ ] It exports at 1080p24 with sound to H.264 twice: 1,457 frames, 60.708 s, with its 13 subtitles beside each file.
  ```steps
  act id=export-open action=press
  wait id=export-run timeout_ms=5000
  expect find("id=export-seconds").0.value matches "^60\.7"   # the sequence is the take, at its own length
  act id=size-1080p action=press
  act id=codec-h264 action=press
  act id=export-name action=set_value value=short-a
  act id=export-run action=press
  until find("id=export-result").0.name matches "^Exported short-a.mp4: 1457 frames, 60.708 s, H.264 1080p 24 fps, with sound .* subtitles short-a.srt, 13 lines$" timeout=900000
  act id=export-name action=set_value value=short-b
  act id=export-run action=press
  until find("id=export-result").0.name matches "^Exported short-b.mp4: 1457 frames, 60.708 s, H.264 1080p 24 fps, with sound .* subtitles short-b.srt, 13 lines$" timeout=900000
  shot "exported"
  partial: that the two files hold the same frames is checked by scripts/check-short-exports.mjs, outside the app
  ```

- [ ] Jumping to frames of every shot, clip and key from snapshots draws exactly the frames the export rendered.
  ```steps
  act id=export-check action=press
  until find("id=export-check-result").0.name matches "^Scrub (matches the export: all [0-9]+ frames|differs)" timeout=900000   # each frame jumped to backwards from snapshots, drawn at 1080p with the post stack, hashed as the export hashed it
  expect find("id=export-check-result").0.name matches "^Scrub matches the export: all [0-9]+ frames"
  shot "scrub-check"
  ```
