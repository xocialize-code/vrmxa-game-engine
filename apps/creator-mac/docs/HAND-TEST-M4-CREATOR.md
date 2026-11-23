# Creator hand test (M4 W5, AB-T-0577)

The anime creator on the Mac shell, the way a person uses it: a project of shorts, a script opened from outside the
project, a hand edit, a script edit, a cast, Save and Export. The scenario beside it
([`hand-test/HAND-TEST-M4-CREATOR.scenario.md`](hand-test/HAND-TEST-M4-CREATOR.scenario.md)) runs every row with
AppProbe. Set up with `apps/creator-mac/scripts/build.sh`, then `apps/creator-mac/scripts/hand-test-fixtures.sh`, and
run under the machine's GPU lock (it draws):

```sh
node acceptance/gpu-lock.mjs run --who creator-hand-test -- appprobe checklist scenario=apps/creator-mac/docs/hand-test/HAND-TEST-M4-CREATOR.scenario.md
```

- [x] The project opens with its short, and the short with its sequence, storyboard and timeline; nothing is an undo step. *AppProbe 2026-11-23: the sample short, 11 cards with thumbnails, the timeline, the preview at frame 24; no undo step.*
- [x] File › Open… opens a Fountain script from outside the project: a new short, built with cameras by rule, shows its sequence, storyboard and timeline. *AppProbe 2026-11-23: through VRMXG_SHELL_OPEN (the panel itself wasn't driven); 5 shots by rule, the establishing camera on shot 010.*
- [x] A hand edit on the timeline is one undo step. *AppProbe 2026-11-23: a gesture clip ten frames on with ⇧→, "Move clip hana-1-act 1".*
- [x] Editing the script re-scripts the sequence as one undo step and keeps the hand edit; Edit › Undo and Redo bring the script back with the document. *AppProbe 2026-11-23: through find and replace (the textarea itself wasn't typed in); "Re-script (1 changed)", the hand edit kept, the same hash after Undo and after Redo.*
- [x] A script with an error changes nothing and points at its line; fixing it changes nothing either. *AppProbe 2026-11-23: "[[gret]]" names line 17; no undo step either way.*
- [x] A character opened from the Finder is cast in the selected role, as one undo step. *AppProbe 2026-11-23: Open Documents with the scenario's open step; copied into characters/, "Cast HANA: Mira". What the cast character looks like in the viewport wasn't checked.*
- [x] Save writes the short into the project: its sequence, its script and shorts.json. *AppProbe 2026-11-23: the saved line names the sequence and the script; shorts.json was read on disk by hand.*
- [x] File › Export… queues the short and renders it through the shell. *AppProbe 2026-11-23: 397 frames, first-light-720p24.mp4 (16.5 s, 720p, AAC) and its .srt, checked on disk by hand.*
- [x] The File and Short menus carry the creator's own items. *AppProbe 2026-11-23: every item enabled. Each item's event was not pressed except Open…, Export… and Save.*
- [x] New Short makes a short in the chosen set from a script template. *AppProbe 2026-11-23: "Third Take" in cafe.vrmxs, 2 shots.*

## Results

| Row | Step | What happened | Undo |
|---|---|---|---|
