# Hot reload hand test (M6 W2, AB-T-0645)

M6's exit check 4 ([M6-PLAN.md](../../../M6-PLAN.md)): saving the project's behaviours module in a text editor reloads
it in the editor's play in place, without restarting the scene; a reload that throws keeps the old code running and
shows the error; an exported build never reloads (`apps/game/test/no-watcher.test.mjs`). The editor watches the module
and what it imports through the shell's `project.watch` (shell 0.15.0, the editor's only), imports it fresh through
Export Game's path, and swaps each behaviour on its node: kept state when its declared state shape is unchanged
(`stateShape`), restarted otherwise (`apps/editor/src/reload.js`, tested in `apps/editor/test/reload.test.mjs`).

AppProbe runs the rows in the Mac app (`hand-test/HAND-TEST-M6-HOT-RELOAD.scenario.md`) on a copy of the sample project
whose root `game.json` is the Morning Rush's, so the editor plays the game's own module, `game/behaviours.js`. An
AppProbe scenario can't run a command, so the edits come from `scripts/hot-reload-edits.mjs`, started by the fixtures:
each row writes a screenshot named `edit-<name>.png` into `/tmp/vrmxg-w2-hot-reload`, and the helper saves that edit
into the copy the way a text editor saves (a new file moved over the old). No committed file is changed.

```sh
apps/editor-mac/scripts/build.sh
apps/editor-mac/scripts/hand-test-fixtures-m6-hot-reload.sh     # the copy, and the edit helper beside it
node acceptance/gpu-lock.mjs run --who hot-reload -- appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M6-HOT-RELOAD.scenario.md
```

- [x] The level opens from the copy, with an edit made before Play (a node added) to undo afterwards. *AppProbe 2026-11-26: `game/level.vrmxs` opened valid (48 nodes) with no behaviours error, so the game's module declared its tableZone; Add made the edit ("Undo Add node3d", unsaved changes).*
- [x] Play: the editor watches the game's behaviours module and the module it imports. *AppProbe 2026-11-26: the status read "Hot reload watching game/behaviours.js, behaviours.js" once Play passed step 100.*
- [x] A saved edit takes effect at once: the regulars' tables say "Hot reloaded, version two", their state is kept, and the world runs on from the step it was on. *AppProbe 2026-11-26: the helper saved the edit; within 3 s the status read "reloaded 1 time, last at step 174: tableZone kept" and Aoi, Ren and Yuki said the new line, with Play still running (no new world). The carried state itself (inside, next, done) isn't shown by the editor: `reload.test.mjs` checks it.*
- [x] A throwing edit shows its error in its own field, and the code from before runs on. *AppProbe 2026-11-26: `#behaviour-error` read "didn't reload at step 308, so the code from before is still running: … broken on purpose" and the status "· 1 failed"; 3 s later (longer than a caption lasts) the regulars said version two's line again (step 534).*
- [x] An edit that changes tableZone's declared state restarts it on its nodes, and clears the error. *AppProbe 2026-11-26: "reloaded 2 times, last at step 593: tableZone restarted", the error box gone, and the line "version three".*
- [x] Stop puts the scene back as it was, and Undo and Save are unaffected by the reloads. *AppProbe 2026-11-26: the original text reloaded at step 787 (restarted again, its shape back); Stop read "scene as before Play"; Undo still read "Undo Add node3d", Undo put the scene back to its 48 saved nodes, Redo made the edit again, and Save wrote `game/level.vrmxs`.*
- [x] The last play is listed as reloaded in Export's takes, and baking it is refused: it can't be replayed. *AppProbe 2026-11-26: Export's Take menu listed "Last play (13.5 s, reloaded: can't be replayed)"; Bake into Sequence was refused with "… so it can't be replayed exactly: play it again without reloading" and the level stayed open. Export Video is refused by the same check (`takeWorld`), tested in `reload.test.mjs` and the input service's tests, not pressed here.*

## Results

| Date | Build | Row | Result |
|---|---|---|---|
| 2026-11-26 | Release, ad hoc signed (`scripts/build.sh`), shell 0.15.0, branch `claude/m6-w2-hot-reload-70dbe2` on main 49cd652 | 1–7 | 7 of 7 (`hand-test/results/m6-hot-reload/`). Earlier runs: the first failed rows 2 to 6 on the scenario's mistakes (an unquoted `text=` query split at its space, so row 3 stopped before its edit; the watch list's order); the second passed, but row 4's caption could have been left from before the throw, so the line now comes every four seconds and the row waits longer than a caption lasts; the third added row 7 (the take list and the bake refusal) after a review |
