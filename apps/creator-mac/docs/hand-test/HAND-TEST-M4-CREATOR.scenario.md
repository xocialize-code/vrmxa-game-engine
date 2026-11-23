# Creator hand test (M4 W5): AppProbe scenario

Run `apps/creator-mac/scripts/build.sh`, launch the app once (so its container exists), then
`apps/creator-mac/scripts/hand-test-fixtures.sh` (a fresh copy of the sample project, a script and a character in an
inbox beside it, all inside the app's sandbox), then, under the GPU lock,
`appprobe checklist scenario=apps/creator-mac/docs/hand-test/HAND-TEST-M4-CREATOR.scenario.md`.
- **Files:** File › Open… takes the script through the shell's binary open (`VRMXG_SHELL_OPEN`, AB-A-0314). The
  character comes the Finder's way (`open`: an Open Documents event, shell 0.7.0). Export writes into `exports/`
  (`VRMXG_SHELL_EXPORT`).
- **Controls:** they have ids (`#script-find`, `#role-hana-1`, `#q-job-1-status`). Readouts carry their value in their
  accessible name (`#doc-state`: `Short first-light sequences/first-light.vrmxs 7 nodes saved valid hash …`).
- **Typing:** each typed value is checked and the typing retried until the field holds it: keys sent while the page is
  busy (a rebuild after Redo, an export) were once dropped.
- **Questions:** the window asks in a sheet of its own (`#ask`, buttons `#ask-save`, `#ask-discard`, `#ask-cancel`).
- **Undo:** with `pageUndo`, Edit › Undo's title stays "Undo". The short's undo step is read from the toolbar's `#undo`.

```scenario
app: VRMXG Creator
launch: ../../build/VRMXGCreator.app
checklist: ../HAND-TEST-M4-CREATOR.md
env: {"VRMXG_SHELL_PROJECT": "project", "VRMXG_SHELL_OPEN": "inbox/first-light.fountain", "VRMXG_SHELL_EXPORT": "exports/"}
fixtures: ~/Library/Containers/com.xocialize.vrmxg-creator/Data/tmp/inbox
fresh: false
```

- [ ] The project opens with its short, and the short with its sequence, storyboard and timeline; nothing is an undo step.
  ```steps
  wait id=open-project enabled=true timeout_ms=60000
  until find("id=doc-state").0.name matches "^Short cafe-order " timeout=60000
  act id=open-project action=press
  until find("id=project-name").0.name == "Project project"
  until find("id=doc-state").0.name matches "^Short cafe-order sequences/cafe-order.vrmxs [0-9]+ nodes saved valid " timeout=60000
  until find("id=sb-status").0.name == "Storyboard 11 shots, 11 thumbnails" timeout=120000   # a card per shot, each drawn
  expect find("id=short-cafe-order").0.name == "Short The Order (cafe-order)"
  expect find("id=tl-head-shots").count == 1   # the timeline, with its shot row
  expect find("id=undo").0.name == "Undo"   # opening the short built nothing new: its script builds the committed sequence
  until find("id=tl-scrub").0.name matches "^Showing frame 24 step 60 " timeout=60000   # the preview, at the first shot's thumbnail frame
  ```

- [ ] File › Open… opens a Fountain script from outside the project: a new short, built with cameras by rule, shows its sequence, storyboard and timeline.
  ```steps
  menu "File › Open…" press
  until find("id=open-result").0.name == "Opened first-light.fountain (script) → short first-light" timeout=30000
  until find("id=doc-state").0.name matches "^Short first-light sequences/first-light.vrmxs [0-9]+ nodes unsaved changes valid " timeout=60000
  until find("id=sb-status").0.name == "Storyboard 5 shots, 5 thumbnails" timeout=120000
  expect find("id=coverage-rule").0.value == "1"   # a new short's cameras come by rule (M4 W8)
  expect find("role=button name='Clip vc-est-int-cafe-dawn 0 to 48' exact=true").count == 1   # the establishing camera on the first shot
  expect find("id=tl-head-mira-says").count == 1   # Mira's dialogue track
  expect find("id=short-first-light").0.name == "Short First Light (first-light), not saved"   # a draft until Save
  until find("id=tl-scrub").0.name matches "^Showing frame 24 " timeout=60000
  pause 1000
  shot "opened"
  ```

- [ ] A hand edit on the timeline is one undo step.
  ```steps
  act role=button name="Clip greet 203 to 239" exact=true action=press
  keys shift+right
  until find("id=undo").0.name == "Undo Move clip hana-1-act 1"
  expect find("role=button name='Clip greet 213 to 249' exact=true").count == 1   # ten frames on
  ```

- [ ] Editing the script re-scripts the sequence as one undo step and keeps the hand edit; Edit › Undo and Redo bring the script back with the document.
  ```steps
  set before = find("id=doc-state").0.name
  until find("id=script-find").0.value == "first cup today." do act id=script-find action=set_value value="first cup today." tries=3
  until find("id=script-replace").0.value == "first cup of the day." do act id=script-replace action=set_value value="first cup of the day." tries=3
  act id=script-replace-all action=press
  until find("id=undo").0.name == "Undo Re-script (1 changed)"   # one step
  expect find("role=button name='Clip greet 213 to 249' exact=true").count == 1   # the hand edit was kept
  expect find("role=button name='first cup of the day.'").count == 1   # the dialogue clip has the new words
  expect find("id=script-state").0.name matches "applied unsaved$"
  set after = find("id=doc-state").0.name
  menu "Edit › Undo" press
  until find("id=undo").0.name == "Undo Move clip hana-1-act 1"   # one undo takes back the whole re-script
  expect find("id=doc-state").0.name == $before   # the document as before, hash and all
  expect find("id=script value='first cup today.'").count == 1   # the script pane shows the script it was built from
  menu "Edit › Redo" press
  until find("id=doc-state").0.name == $after
  expect find("id=script value='first cup of the day.'").count == 1
  ```

- [ ] A script with an error changes nothing and points at its line; fixing it changes nothing either.
  ```steps
  set after = find("id=doc-state").0.name
  until find("id=script-find").0.value == "[[greet]]" do act id=script-find action=set_value value="[[greet]]" tries=3
  until find("id=script-replace").0.value == "[[gret]]" do act id=script-replace action=set_value value="[[gret]]" tries=3
  act id=script-replace-all action=press
  until find("id=script-errors").count == 1
  expect find("role=button name='Error at line 17: [[gret]]'").count == 1   # the error names its line
  expect find("id=doc-state").0.name == $after   # nothing changed
  expect find("id=undo").0.name == "Undo Re-script (1 changed)"   # and no undo step
  until find("id=script-find").0.value == "[[gret]]" do act id=script-find action=set_value value="[[gret]]" tries=3
  until find("id=script-replace").0.value == "[[greet]]" do act id=script-replace action=set_value value="[[greet]]" tries=3
  act id=script-replace-all action=press
  until find("id=script-errors").count == 0
  until find("id=script-state").0.name matches " applied "
  expect find("id=doc-state").0.name == $after   # the same script builds the same document
  expect find("id=undo").0.name == "Undo Re-script (1 changed)"
  ```

- [ ] Typing in the script pane applies once typing stops, as one undo step; Undo while typing is still unapplied takes the typing back, and nothing applies after it.
  ```steps
  set start = find("id=doc-state").0.name
  act id=script action=focus
  keys keys="cmd+down return return"
  keys text="Hana smiles."
  until find("id=undo").0.name == "Undo Re-script (1 added)"   # applied 0.7 s after the last key, one step
  expect find("id=script-state").0.name matches " applied unsaved$"
  keys text=" She waves."
  act id=undo action=press   # before the 0.7 s are up
  until find("id=redo").0.name == "Redo Re-script (1 changed)"   # the unapplied typing became a step, and Undo took it back
  pause 1500
  expect find("id=undo").0.name == "Undo Re-script (1 added)"   # the apply timer didn't fire after the undo
  expect find("id=redo").0.name == "Redo Re-script (1 changed)"   # and redo is still there
  act id=undo action=press
  until find("id=doc-state").0.name == $start   # back where the row started
  expect find("id=script value='Hana smiles.'").count == 0
  ```

- [ ] A character opened from the Finder is cast in the selected role, as one undo step.
  ```steps
  act id=role-hana-1 action=press
  open ${fixtures}/mira-guest.vrmxa
  until find("id=undo").0.name == "Undo Cast HANA: Mira" timeout=30000
  expect find("id=role-hana-1").0.name matches "cast characters/mira-guest\.vrmxa"   # copied into the project, by ref
  expect find("id=cast-result").0.name matches "^Cast Mira as hana-1: Cast HANA: Mira"
  ```

- [ ] Save writes the short into the project: its sequence, its script and shorts.json.
  ```steps
  menu "File › Save" press
  until find("id=saved").0.name matches "^Saved sequences/first-light.vrmxs · [0-9]+ bytes · [0-9a-f]{16} · scripts/first-light.fountain$"
  expect find("id=doc-state").0.name matches " saved valid "
  expect find("id=script-state").0.name matches "applied saved$"
  ```

- [ ] File › Export… queues the short and renders it through the shell.
  ```steps
  menu "File › Export…" press
  until find("id=q-job-1-status").0.name matches "^job-1 (rendering|starting)" timeout=30000
  until find("id=q-job-1-status").0.name matches "^job-1 (done|failed)" timeout=300000
  expect find("id=q-job-1-status").0.name matches "^job-1 done: 397 frames · first-light-720p24\\.mp4 · frames [0-9a-f]{16}$"   # the re-scripted short, 16.5 s at 24 fps, H.264 720p with its .srt
  shot "exported"
  ```

- [ ] Cancel stops a running render and leaves no movie behind; File › Export… renders only the job it adds.
  ```steps
  act id=q-preset-master action=press
  act id=q-add action=press
  until find("id=q-job-2-status").0.name == "job-2 queued"
  act id=q-run action=press
  until find("id=q-job-2-status").0.name == "job-2 starting" timeout=30000   # running: its world is being built (about 4 s; the frames themselves take about 2 s, too quick to catch here: export.test.mjs covers a cancel at and after the last frame)
  act role=button name="Cancel job-2" exact=true action=press
  until find("id=q-job-2-status").0.name == "job-2 cancelled" timeout=60000   # stopped between frames, not rendered to the end
  act id=q-preset-draft action=press
  act id=q-add action=press
  until find("id=q-job-3-status").0.name == "job-3 queued"
  menu "File › Export…" press
  until find("id=q-job-4-status").0.name matches "^job-4 done: 397 frames" timeout=300000
  expect find("id=q-job-3-status").0.name == "job-3 queued"   # Export… rendered its own job only
  ```

- [ ] The File and Short menus carry the creator's own items.
  ```steps
  expect menu("File › New Short").enabled == true
  expect menu("File › Open Script…").enabled == true
  expect menu("File › Open Character…").enabled == true
  expect menu("File › Open Set…").enabled == true
  expect menu("File › Export…").enabled == true
  expect menu("Short › Apply Script").enabled == true
  expect menu("Short › Render Queue").enabled == true
  ```

- [ ] Leaving a short with unsaved changes asks first: Cancel stays, Don't Save goes back to the saved short.
  ```steps
  until find("id=script-find").0.value == "Then you'd better come in." do act id=script-find action=set_value value="Then you'd better come in." tries=3
  until find("id=script-replace").0.value == "Come in, then." do act id=script-replace action=set_value value="Come in, then." tries=3
  act id=script-replace-all action=press
  until find("id=undo").0.name == "Undo Re-script (1 changed)"
  set edited = find("id=doc-state").0.name
  act id=short-cafe-order action=press
  until find("id=ask-text").0.name == "First Light has changes that aren't saved."
  act id=ask-cancel action=press
  until find("id=ask").count == 0
  expect find("id=doc-state").0.name == $edited   # still First Light, the change still there
  act id=short-cafe-order action=press
  until find("id=ask").count == 1
  act id=ask-discard action=press
  until find("id=doc-state").0.name matches "^Short cafe-order sequences/cafe-order.vrmxs [0-9]+ nodes saved valid " timeout=60000
  act id=short-first-light action=press   # The Order is unchanged: no question
  until find("id=doc-state").0.name matches "^Short first-light sequences/first-light.vrmxs [0-9]+ nodes saved valid " timeout=60000
  expect find("id=ask").count == 0
  expect find("id=script value='better come in.'").count == 1   # the saved script, without the discarded change
  expect find("id=short-first-light").0.name == "Short First Light (first-light)"   # saved in row 8: no longer a draft
  ```

- [ ] New Short makes a short in the chosen set from a script template.
  ```steps
  until find("id=new-short-title").0.value == "Third Take" do act id=new-short-title action=set_value value="Third Take" tries=3
  act id=set-cafe-vrmxs action=press
  act id=new-short action=press
  until find("id=doc-state").0.name matches "^Short third-take sequences/third-take.vrmxs [0-9]+ nodes unsaved changes " timeout=60000
  until find("id=sb-status").0.name matches "^Storyboard 2 shots" timeout=60000   # its heading and its action
  expect find("id=short-third-take").0.name == "Short Third Take (third-take), not saved"   # a draft until saved
  expect find("id=script value='Set: cafe.vrmxs'").count == 1
  ```
