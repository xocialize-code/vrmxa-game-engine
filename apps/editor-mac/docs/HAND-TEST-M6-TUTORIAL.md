# The game builder's tutorial, followed in the editor (M6 W9, AB-T-0650)

M6's exit check 9 ([M6-PLAN.md](../../../M6-PLAN.md)): the docs site's tutorial
([`docs/guide/tutorial.md`](../../../docs/guide/tutorial.md), "Coin Run") goes from New Project to an exported game that
plays, and a scenario follows it step by step in the Mac editor, so it can't drift from the app. Each row is a step of
the page, by its heading (`acceptance/test/tutorial.test.mjs` holds them together, and holds the WebGL twin to this
one). AppProbe runs rows 1 to 11 (`hand-test/HAND-TEST-M6-TUTORIAL.scenario.md`, and `-webgl.scenario.md`); row 12 runs
outside the app. The guide's screenshots are the runs' `shot`s.

```sh
apps/editor-mac/scripts/build.sh
apps/editor-mac/scripts/hand-test-fixtures-m6-tutorial.sh            # webgpu; "webgl" for the twin's folders
node acceptance/gpu-lock.mjs run --who m6-tutorial -- appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M6-TUTORIAL.scenario.md
node acceptance/m6/tutorial.mjs play "$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp/w9-builds/coin-run"
```

- [x] 1. Make the project from the One level template *AppProbe 2026-11-26, both backends: "One level" chosen, the title gave the id `coin-run`, Create made the folder (VRMXG_SHELL_NEW_PROJECT, so the save panel wasn't used) and opened `level.vrmxs` (14 nodes, valid).*
- [x] 2. Play the template once *Partial. AppProbe 2026-11-26, both backends: Play ran past step 100, and Stop read "scene as before Play". Nobody walks Mira here: a held key isn't an AppProbe step. The Play in place has no game service, so nothing is won here (AB-T-0672).*
- [x] 3. Count the coins *AppProbe 2026-11-26, both backends: GameCounter added, id `coins`, parent `rules`, label Coins; the Undo button read "Undo Set coins.label".*
- [x] 4. Add the goal *AppProbe 2026-11-26, both backends: GameGoal `collect-coins` under `rules`, before `reach-counter`, its condition built in the condition's fields (state, counters.coins, ge, 3); the scene stayed valid.*
- [x] 5. Write the coin behaviour *Partial. AppProbe 2026-11-26, both backends: the trigger screenshot made `acceptance/m6/tutorial.mjs files` save the page's own `behaviours.js` and licence row into the project. Not typed into a text editor; row 6 reads the file in.*
- [x] 6. Read the behaviour in *AppProbe 2026-11-26, both backends:*
  - *Save, then File › Open Recent › Coin Run reopened it (16 nodes, valid, no behaviour error).*
  - *File › Export Game… before naming the module opened the Export panel with "Game export refused (unnamed_behaviours): behaviours.js runs when you play here, but game.json doesn't name it…" on its line, and the window's alert stayed empty.*
  - *Project Settings showed the unnamed-module note. Behaviours › behaviours.js was one undo step ("Undo Behaviours behaviours.js"), and the note went.*
- [x] 7. Make the first coin *AppProbe 2026-11-26, both backends: Area `coin-1` placed, shape pinned, size set; `coin` added from the Behaviours panel ("Undo Add coin to coin-1") with its describe's defaults mira, coins, 1; ParticleEmitter `glint-1` under it with the sparks effect.*
- [x] 8. Wire the coin *AppProbe 2026-11-26, both backends: collected → glint-1 → stop and collected → hana → say ("Undo Connect coin-1.collected to glint-1.stop", "… to hana.say"), the line typed in the argument's field; the scene stayed valid.*
- [x] 9. Two more coins *AppProbe 2026-11-26, both backends:*
  - *Duplicate twice made coin-2 and coin-3, with glint-2 and glint-3.*
  - *coin-2's connections read glint-2 and hana.*
  - *The copies were named Coin 2 and Coin 3; saved, 22 nodes, valid.*
  - *The saved level is byte-identical across the two backends' runs (`results/m6-tutorial-*/level.vrmxs`).*
- [x] 10. Play it *Partial. AppProbe 2026-11-26, both backends: with `env` selected, Play showed Hana's caption "A coin! Keep going, Mira." from the coin at the spawn (#captions, the text matched).*
  - *Not checked here: the counter, the goals and walking through the other coins. The editor's Play has no game service (AB-T-0672) and AppProbe can't hold a key; step 12 checks them in the build.*
  - *The page's sentence on hot reload isn't exercised here: HAND-TEST-M6-HOT-RELOAD covers it.*
  - *In Node, in a world built without the game service, walking Mira through the coins for 400 steps raised no error, stopped all three glints and showed Hana's line.*
- [x] 11. Export the game *AppProbe 2026-11-26, both backends: File › Export Game… opened the Export panel, closed since row 6. The build went into the exact folder `VRMXG_SHELL_BUILD` names (`w9-builds/coin-run`, made empty by the fixtures), standing in for the empty folder the reader creates in the panel. Both backends' builds have the digest b335b1e9….*
- [x] 12. Play the build in the game app *Skipped in AppProbe; run outside the app on 2026-11-26 as `tutorial.mjs play`, on each backend's build:*
  - *Each build is whole and carries `behaviours.js`.*
  - *Node: coins at steps 2, 68 and 123, each glint stopped by its connection, the goals in order, won at 174, then the ending.*
  - *The game app in Chromium, on WebGPU and WebGL: the title menu, New Game, the HUD's "Goal: Collect the three coins" and Hana's caption at step 15, three coins, "Get to the counter", won, then `ending.vrmxs`, with no page errors (`results/m6-tutorial-*/play-build.json`).*
  - *Not played in the Mac game app (apps/game-mac).*

## Results

| Date | Build | Backend | Rows | Result |
|---|---|---|---|---|
| 2026-11-26 | Release, ad hoc signed (`scripts/build.sh`), shell 0.16.0, on main at eef7080 with this branch's changes | WebGPU | 1–11 | First runs found the scenario's mistakes and four of the app's: menu picks needed a pause (row 8), connection rows are numbered across the scene (the template has four), the Scene panel's node type menu shrank to nothing beside its heading (fixed: App.vue's CSS), hiding an Area doesn't stop its ParticleEmitter (AB-T-0671: the tutorial wires stop), and Play in place has no game service (AB-T-0672: the behaviour reads it with `?.`). Then 11 of 11 |
| 2026-11-26 | same | WebGL | 1–11 | 11 of 11 (one earlier run lost row 7's menu pick: the row now waits for the menu's value) |
| 2026-11-26 | same | both | 12 | `tutorial.mjs play`: 11 of 11 checks on each build (Node, Chromium WebGPU and WebGL) |

| 2026-11-26 | Release, ad hoc signed, rebased on b7c6b91, after PR #69's review | WebGPU, WebGL | 1–12 | The review's fixes:<br>• row 6 now tries Export Game before the module is named and expects the refusal on the Export line;<br>• row 9 names the copies;<br>• row 11 relies on File › Export Game… opening the panel, into an exact build folder.<br>WebGL: 11 of 11. WebGPU: one run lost row 6's menu pick, and rows 7 to 11 followed from it; with a longer pause before the pick, 11 of 11. Step 12: 11 of 11 checks on each build. **Of the 12 rows, 8 are fully checked, 3 partly (2, 5 and 10, as their notes say) and 1 outside AppProbe (12).** The WebGL run had the scenario before that pause was added (a timing line only) |

Reports: `hand-test/results/m6-tutorial-webgpu/`, `hand-test/results/m6-tutorial-webgl/` (the AppProbe report, the saved `level.vrmxs`, step 12's checks).
