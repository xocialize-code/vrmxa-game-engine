# Export hand test (M1 W8): AppProbe scenario

Run `apps/editor-mac/scripts/build.sh`, launch the app once (its sandbox container must exist), then
`apps/editor-mac/scripts/hand-test-fixtures.sh` (a fresh project, and an empty `exports/`), then
`appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M1-EXPORT.scenario.md`, then
`node apps/editor-mac/scripts/check-exports.mjs` (frame counts, timestamps, the sound's alignment and the frame hashes,
from outside the app). Exports land in the container's `tmp/exports/` with their evidence beside them
(`<file>.frames.json`: the rendered frames' hashes; `<file>.wav`: the mixed sound).

```scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M1-EXPORT.md
env: {"VRMXG_SHELL_PROJECT": "project", "VRMXG_SHELL_EXPORT": "exports/", "VRMXG_SHELL_SAVE": "exports/cafe-still.png"}
fresh: false
```

- [ ] A 10 s take exports from the editor to H.264 1080p30 with sound: 300 frames, 10.000 s, the sound under it.
  ```steps
  wait id=open-project enabled=true timeout_ms=40000
  until find("id=doc-state").0.name matches "^Scene cafe.vrmxs"
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project"
  until find("id=doc-state").0.name matches "^Scene cafe.vrmxs [0-9]+ nodes saved"   # the project's cafe, loaded
  act id=export-open action=press
  wait id=export-run timeout_ms=5000
  expect find("id=export-take").0.value == "input/walk-in.json"   # the recorded walk is the default take
  act id=export-name action=set_value value=take-a
  act id=export-run action=press
  until find("id=export-result").0.name matches "^Exported take-a.mp4: 300 frames, 10.000 s, H.264 1080p 30 fps, with sound"   # frame-exact, through AVAssetWriter
  shot "exported"
  ```

- [ ] The same take exported again gives the same frames: the rendered frames' hashes match frame for frame.
  ```steps
  act id=export-name action=set_value value=take-b
  act id=export-run action=press
  until find("id=export-result").0.name matches "^Exported take-b.mp4: 300 frames, 10.000 s"
  partial: the two files' frame hashes are compared by scripts/check-exports.mjs, outside the app
  ```

- [ ] 4K60: 600 frames, 10.000 s; the export time is shown.
  ```steps
  act id=size-4k action=press
  act id=fps-60 action=press
  act id=export-name action=set_value value=take-4k60
  act id=export-run action=press
  until find("id=export-result").0.name matches "^Exported take-4k60.mp4: 600 frames, 10.000 s, H.264 4k 60 fps"   # timeout covers a slow machine
  ```

- [ ] ProRes 4444 twice: the decoded frames are identical.
  ```steps
  act id=size-1080p action=press
  act id=fps-30 action=press
  act id=codec-prores4444 action=press
  act id=export-name action=set_value value=prores-a
  act id=export-run action=press
  until find("id=export-result").0.name matches "^Exported prores-a.mov: 300 frames, 10.000 s, ProRes 4444 1080p 30 fps"
  act id=export-name action=set_value value=prores-b
  act id=export-run action=press
  until find("id=export-result").0.name matches "^Exported prores-b.mov: 300 frames"
  partial: decoded frames are compared by scripts/check-exports.mjs (ffmpeg framemd5)
  ```

- [ ] 29.97 fps lands exactly: 300 frames in 10.010 s (HEVC, 720p).
  ```steps
  act id=codec-hevc action=press
  act id=size-720p action=press
  act id=fps-2997 action=press
  act id=export-name action=set_value value=ntsc
  act id=export-run action=press
  until find("id=export-result").0.name matches "^Exported ntsc.mp4: 300 frames, 10.010 s, HEVC 720p 29.97 fps"   # 300 · 1001 / 30000 s
  ```

- [ ] A still (1080p PNG) saves, and a thumbnail is written into the project.
  ```steps
  act id=size-1080p action=press
  act id=save-still action=press
  until find("id=still-result").0.name matches "^Still .*cafe-still.png"
  act id=thumbnail action=press
  until find("id=still-result").0.name matches "^Thumbnail thumbnails/cafe.png"
  shot "stills"
  ```
