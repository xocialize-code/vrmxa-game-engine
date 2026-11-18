# Playground hand test (M0): AppProbe scenario

Run: `appprobe checklist scenario=apps/playground-mac/docs/hand-test/HAND-TEST-M0.scenario.md` after
`apps/playground-mac/scripts/build.sh` and `apps/playground-mac/scripts/hand-test-fixtures.sh` (which puts `open.vrmxs`
in the app's sandbox, where the shell's `VRMXG_SHELL_OPEN` / `VRMXG_SHELL_SAVE` hooks stand in for the panels). Each readout's accessible name carries its value (`Step 1608`,
`Frame time 16.7 ms · 60 fps`), and WebKit's element ids read as identifiers (`#play`, `#step-count`).

```scenario
app: VRMXG Playground
launch: ../../build/VRMXGPlayground.app
checklist: ../HAND-TEST-M0.md
env: {"VRMXG_SHELL_OPEN": "open.vrmxs", "VRMXG_SHELL_SAVE": "saved.vrmxs"}
fresh: false
```

- [ ] The cafe loads: Play is enabled, the camera list holds `cam`, no error shows.
  ```steps
  wait id=play enabled=true timeout_ms=40000
  expect find("id=play").0.name == "Play"   # loaded and paused
  expect find("role=popupbutton name=cam").count >= 1   # the camera list holds the scene's camera
  expect find("role=statictext text=Error").count == 0   # no load error on the page
  shot "loaded"
  ```

- [ ] The shell answers the page: the status bar names the app, the shell version and the origin.
  ```steps
  until find("id=shell-info").0.name matches "^Shell VRMXG Playground · shell [0-9.]+ · loopback$"   # page -> Swift -> page round trip
  ```

- [ ] Open… and Save as… go through the shell: a scene opens from a file and saves back to one.
  ```steps
  act id=open-scene action=press
  until find("id=notes").0.name matches "^open.vrmxs · [0-9]+ nodes$" timeout=40000   # the opened scene loaded
  act id=save-scene action=press
  until find("id=notes").0.name matches "^saved saved.vrmxs \\([0-9]+ bytes\\)$"   # written through file.save
  ```

- [ ] Play runs the simulation: the button turns into Pause, the step count climbs and the frame-time readout shows milliseconds and fps.
  ```steps
  set before = find("id=step-count").0.name
  act id=play action=press
  until find("id=play").0.name == "Pause"   # the button flipped
  pause 1500
  until find("id=frame-time").0.name matches "^Frame time [0-9.]+ ms · [0-9]+ fps$"   # the readout has a measurement
  expect find("id=step-count").0.name != $before   # the simulation advanced
  set frame = find("id=frame-time").0.name
  note "${frame}"
  shot "playing"
  ```

- [ ] Pause stops it: the step count holds; Step advances it.
  ```steps
  act id=play action=press
  until find("id=play").0.name == "Play"
  pause 300
  set held = find("id=step-count").0.name
  pause 700
  expect find("id=step-count").0.name == $held   # paused: no steps
  act id=step action=press
  pause 300
  expect find("id=step-count").0.name != $held   # Step moved it on
  ```

- [ ] Debug draw: ticking Colliders shows the wireframes (a person looks).
  ```steps
  judge: human
  act id=play action=press
  act role=checkbox name=Colliders exact=true action=press
  act role=checkbox name=Sensors exact=true action=press
  pause 1000
  shot "debug draw"
  ```

- [ ] Replay demo walk: Mira walks in through the entrance door (a person looks).
  ```steps
  judge: human
  act id=replay action=press
  pause 4000
  shot "demo walk"
  ```
