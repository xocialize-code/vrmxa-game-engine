# Creator hand test (M4 W5, AB-T-0577; export rows M4 W10, AB-T-0582)

The anime creator on the Mac shell, the way a person uses it: a project of shorts, a script opened from outside the
project, a hand edit, a script edit, a cast, Save and Export. The scenario beside it
([`hand-test/HAND-TEST-M4-CREATOR.scenario.md`](hand-test/HAND-TEST-M4-CREATOR.scenario.md)) runs every row with
AppProbe. Set up with `apps/creator-mac/scripts/build.sh`, then `apps/creator-mac/scripts/hand-test-fixtures.sh`, and
run under the machine's GPU lock (it draws):

```sh
node acceptance/gpu-lock.mjs run --who creator-hand-test -- appprobe checklist scenario=apps/creator-mac/docs/hand-test/HAND-TEST-M4-CREATOR.scenario.md
```

- [x] The project opens with its short, and the short with its sequence, storyboard and timeline; nothing is an undo step. *AppProbe 2026-11-23: the sample short, 11 cards with thumbnails, the timeline, the preview at frame 24; no undo step.*
- [x] File › Open… opens a Fountain script from outside the project: a new short, built with cameras by rule, shows its sequence, storyboard and timeline. *AppProbe 2026-11-23: through VRMXG_SHELL_OPEN (the panel itself wasn't driven); 5 shots by rule, a draft (•) until saved.*
- [x] A hand edit on the timeline is one undo step. *AppProbe 2026-11-23: a gesture clip ten frames on with ⇧→, "Move clip hana-1-act 1".*
- [x] Editing the script re-scripts the sequence as one undo step and keeps the hand edit; Edit › Undo and Redo bring the script back with the document. *AppProbe 2026-11-23: through find and replace; "Re-script (1 changed)", the hand edit kept, the same hash after Undo and after Redo.*
- [x] A script with an error changes nothing and points at its line; fixing it changes nothing either. *AppProbe 2026-11-23: "[[gret]]" names line 17; no undo step either way.*
- [x] Typing in the script pane applies once typing stops, as one undo step; Undo while typing is still unapplied takes the typing back, and nothing applies after it. *AppProbe 2026-11-23: typed at the end of the pane with keys: "Re-script (1 added)" after 0.7 s; typing then Undo at once: "Redo Re-script (1 changed)", and 1.5 s later nothing more applied.*
- [x] A character opened from the Finder is cast in the selected role, as one undo step. *AppProbe 2026-11-23: Open Documents with the scenario's open step; copied into characters/, "Cast HANA: Mira". A name clash was checked in Node (placeFile) and by hand, not here. What the cast character looks like wasn't checked.*
- [x] Save writes the short into the project: its sequence, its script and shorts.json. *AppProbe 2026-11-23: the saved line names the sequence and the script; shorts.json read on disk after the run (saved shorts only).*
- [x] File › Export… queues the short and renders it through the shell. *AppProbe 2026-11-23: 397 frames, first-light-720p24.mp4 and its .srt, checked on disk after the run.*
- [x] Cancel stops a running render and leaves no movie behind; File › Export… renders only the job it adds. *AppProbe 2026-11-23: cancelled while its world was being built (the frames take about 2 s, too quick to catch); no .mov on disk afterwards. Export… left job-3 queued.*
- [ ] A delivery preset renders the film for delivery into the project's deliveries folder: sound, an .srt, a still and a thumbnail per shot, a turntable per character and delivery.json, every file read back from the disk. *(M4 W10)*
- [ ] ProRes 4444 at 4K draws on WebGL when the job says so, the extras as ticked; H.264 at 4K with the redraw check draws every frame twice. *(M4 W10)*
- [x] The File and Short menus carry the creator's own items. *AppProbe 2026-11-23: every item enabled. Not each item pressed: Open…, Export… and Save were.*
- [x] Leaving a short with unsaved changes asks first: Cancel stays, Don't Save goes back to the saved short. *AppProbe 2026-11-23: Cancel kept the edit; Don't Save reopened The Order from disk; First Light reopened with its saved script.*
- [x] New Short makes a short in the chosen set from a script template. *AppProbe 2026-11-23: "Third Take" in cafe.vrmxs, 2 shots, marked not saved.*

## Results

| Row | Step | What happened | Undo |
|---|---|---|---|
