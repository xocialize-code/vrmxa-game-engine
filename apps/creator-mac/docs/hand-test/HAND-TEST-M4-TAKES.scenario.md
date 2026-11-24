# Creator hand test (M4 W9): performance takes, AppProbe scenario

Run `apps/creator-mac/scripts/build.sh`, then, under the GPU lock (it draws; the lock also keeps it apart from the
other creator scenarios, which use the same container):

```sh
node acceptance/gpu-lock.mjs run --who creator-takes-hand-test -- sh -c 'apps/creator-mac/scripts/hand-test-fixtures.sh && appprobe checklist scenario=apps/creator-mac/docs/hand-test/HAND-TEST-M4-TAKES.scenario.md'
```

- **Nobody at the keys, no model, no camera.** `VRMXG_QUERY` stands in for all three: `puppet=demo` presses a scripted
  performance's keys (walk, look, nod, walk, wave), `director=demo` answers from `@vrmxg/director`'s demo model, and
  `face=synthetic` gives `@vrmxg/takes`' synthetic face session. The rows check the take controls, the undo steps, the
  tracks and the log files; what a real keyboard, model and camera feel like is the operator's (`../HAND-TEST-M4-TAKES.md`).
- **Readouts.** `#take-status` carries the deck's state in its accessible name (`Take 1 recording: puppet, mira, 3.2 s`,
  `Take 1 recorded: … 3 tracks; keep or discard`, `Take: Kept Take 1: Mira, puppet (7.1 s): 3 tracks, log performances/…`).
  A kept take is `#take-item-take-1`; its tracks are timeline rows (`#tl-head-mira-walk-take-1`). A director take's
  conversation is `#take-said-0`, `#take-said-1` …. The undo step is read from the toolbar's `#undo`.

```scenario
app: VRMXG Creator
launch: ../../build/VRMXGCreator.app
checklist: ../HAND-TEST-M4-TAKES.md
env: {"VRMXG_SHELL_PROJECT": "project", "VRMXG_QUERY": "puppet=demo&director=demo&face=synthetic"}
fresh: false
```

- [ ] The project opens on the sample short with the take panel ready: its characters can perform, and nothing is an undo step.
  ```steps
  wait id=open-project enabled=true timeout_ms=60000
  until find("id=doc-state").0.name matches "^Short cafe-order " timeout=60000
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project"
  until find("id=doc-state").0.name matches "^Short cafe-order sequences/cafe-order.vrmxs [0-9]+ nodes saved valid " timeout=60000
  until find("id=sb-status").0.name == "Storyboard 11 shots, 11 thumbnails" timeout=120000
  until find("id=tl-scrub").0.name matches "^Showing frame 24 step 60 " timeout=60000
  set opened = find("id=doc-state").0.name
  expect find("id=take-status").0.name == "Take: ready (0 kept)"
  expect find("id=take-who-mira").0.name == "Mira performs"
  expect find("id=take-who-hana-1").0.name == "Hana performs"
  expect find("id=take-kind-puppet").0.value == "1"   # a puppet take is the first kind
  expect find("id=undo").0.name == "Undo"
  ```

- [ ] A puppet take records from the playhead while the film plays, and Stop leaves it waiting: nothing is in the short yet.
  ```steps
  act id=take-who-mira action=press
  act id=take-record action=press
  until find("id=take-status").0.name matches "^Take 1 recording: puppet, mira, " timeout=60000
  expect find("id=undo").0.enabled == false   # the short isn't edited while a take records
  until find("id=take-status").0.name matches "^Take 1 recording: puppet, mira, (6|7|8)\.[0-9] s$" timeout=30000   # the scripted keys have walked, looked, nodded, walked and waved
  act id=take-stop action=press
  until find("id=take-status").0.name matches "^Take 1 recorded: puppet, mira, [0-9.]+ s, 3 tracks; keep or discard$" timeout=30000
  expect find("id=doc-state").0.name == $opened   # the short is as it was
  expect find("id=undo").0.name == "Undo"
  expect find("id=take-keep").count == 1
  expect find("id=take-discard").count == 1
  shot "puppet-review"
  ```

- [ ] Keep adds the take as one undo step: its tracks are timeline rows after the film's own, and its log is in the project.
  ```steps
  act id=take-keep action=press
  until find("id=undo").0.name matches "^Undo Take 1: Mira, puppet \([0-9.]+ s\)$" timeout=30000
  expect find("id=take-status").0.name matches "^Take: Kept Take 1: Mira, puppet \([0-9.]+ s\): 3 tracks, log performances/cafe-order/take-1\.json$"
  expect find("id=take-item-take-1").0.name matches "^Take 1: puppet, mira, frames [0-9]+ to [0-9]+, 3 tracks$"
  expect find("id=tl-head-mira-walk-take-1").count == 1   # her walk: a move track
  expect find("id=tl-head-mira-gaze-take-1").count == 1   # her eyes: a property track on props.gaze
  expect find("id=tl-head-mira-act-take-1").count == 1    # her gestures: an animation track
  expect find("id=doc-state").0.name matches " unsaved changes valid "
  set kept = find("id=doc-state").0.name
  until find("id=tl-scrub").0.name matches "^Showing frame " timeout=60000   # the preview, with the take in it
  shot "puppet-kept"
  ```

- [ ] Edit › Undo takes the whole take out and Redo brings it back; the take's tracks are edited like any others.
  ```steps
  menu "Edit › Undo" press
  until find("id=doc-state").0.name == $opened   # the short as it was opened, hash and all
  expect find("id=take-item-take-1").count == 0
  expect find("id=tl-head-mira-walk-take-1").count == 0
  menu "Edit › Redo" press
  until find("id=doc-state").0.name == $kept
  expect find("id=take-item-take-1").count == 1
  act role=button name="Clip nod 104 to" action=press   # her nod, a clip on the take's animation track
  keys shift+right
  until find("id=undo").0.name == "Undo Move clip mira-act-take-1 0"   # a hand edit of a take's clip: one step, like any clip
  menu "Edit › Undo" press
  until find("id=doc-state").0.name == $kept
  ```

- [ ] A director take: what is typed is said to her, her answer is the take, and Keep adds her line as a dialogue clip.
  ```steps
  act id=take-kind-director action=press
  act id=take-who-hana-1 action=press
  act id=take-record action=press
  until find("id=take-status").0.name matches "^Take 2 recording: director, hana-1, " timeout=60000
  until find("id=take-say").count == 1
  until find("id=take-say").0.value == "Good morning, Hana!" do act id=take-say action=set_value value="Good morning, Hana!" tries=3
  act id=take-say-send action=press
  until find("id=take-said-0").0.name == "You: Good morning, Hana!"
  until find("id=take-said-1").0.name == "Hana: Good morning! Lovely to see you." timeout=30000   # the model's line, said by her
  pause 3000   # her face and her wave follow the line
  act id=take-stop action=press
  until find("id=take-status").0.name matches "^Take 2 recorded: director, hana-1, [0-9.]+ s, 3 tracks; keep or discard$" timeout=30000
  act id=take-keep action=press
  until find("id=undo").0.name matches "^Undo Take 2: Hana, director \([0-9.]+ s\)$" timeout=30000
  expect find("id=tl-head-hana-1-says-take-2").count == 1   # her line
  expect find("id=tl-head-hana-1-face-take-2").count == 1   # her smile
  expect find("id=tl-head-hana-1-act-take-2").count == 1    # her wave
  expect find("role=button name='Good morning! Lovely to see you.'").count == 1   # the dialogue clip carries the words
  shot "director-kept"
  ```

- [ ] A face take (the synthetic session): it waits for a resting face, then her face and head follow; Keep adds an expression track and a head track.
  ```steps
  act id=take-kind-face action=press
  act id=take-who-mira action=press
  expect find("id=take-ch-blink").0.value == "1"
  expect find("id=take-ch-head").0.value == "1"
  act id=take-record action=press
  until find("id=take-status").0.name matches "^Take 3 recording: face, mira, [0-9.]+ s, [0-9]+ face samples \(hold still\)$" timeout=60000
  until find("id=take-status").0.name matches "^Take 3 recording: face, mira, (7|8|9)\.[0-9] s, [0-9]+ face samples$" timeout=30000   # past the blinks, the smile, the brows and the talking
  shot "face-recording"
  act id=take-stop action=press
  until find("id=take-status").0.name matches "^Take 3 recorded: face, mira, [0-9.]+ s, 2 tracks; keep or discard$" timeout=30000
  act id=take-keep action=press
  until find("id=undo").0.name matches "^Undo Take 3: Mira, face \([0-9.]+ s\)$" timeout=30000
  expect find("id=tl-head-mira-face-take-3").count == 1
  expect find("id=tl-head-mira-head-take-3").count == 1
  expect find("id=doc-state").0.name matches " unsaved changes valid "
  ```

- [ ] Discard throws a take away: nothing is written and nothing is an undo step. Remove takes a kept take out as one step.
  ```steps
  set three = find("id=doc-state").0.name
  act id=take-kind-puppet action=press
  act id=take-record action=press
  until find("id=take-status").0.name matches "^Take 4 recording: puppet, mira, (2|3)\.[0-9] s$" timeout=60000
  act id=take-stop action=press
  until find("id=take-status").0.name matches "^Take 4 recorded: puppet, mira, " timeout=30000
  act id=take-discard action=press
  until find("id=take-status").0.name == "Take: Discarded take 4"
  expect find("id=doc-state").0.name == $three
  expect find("id=undo").0.name matches "^Undo Take 3: Mira, face "
  expect find("id=take-item-take-4").count == 0
  act id=take-remove-take-2 action=press
  until find("id=undo").0.name == "Undo Remove take 2"
  expect find("id=take-item-take-2").count == 0
  expect find("id=tl-head-hana-1-says-take-2").count == 0
  expect find("id=take-item-take-1").count == 1   # the others stay
  expect find("id=take-item-take-3").count == 1
  menu "Edit › Undo" press
  until find("id=doc-state").0.name == $three
  expect find("id=take-item-take-2").count == 1
  ```

- [ ] Save writes the short with its takes; the logs are in the project folder.
  ```steps
  menu "File › Save" press
  until find("id=saved").0.name matches "^Saved sequences/cafe-order.vrmxs · [0-9]+ bytes · [0-9a-f]{16}" timeout=30000
  expect find("id=doc-state").0.name matches " saved valid "
  expect find("id=memory-files").count == 0   # nothing was left in memory: the logs went to disk as each take was kept
  expect find("id=take-item-take-1").0.name matches ", 3 tracks$"   # each kept take has its log ("no log in the project" otherwise)
  expect find("id=take-item-take-3").0.name matches ", 2 tracks$"
  shot "saved"
  ```
