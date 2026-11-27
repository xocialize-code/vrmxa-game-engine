# M0 to M6 acceptance

M0 W9 (AB-T-0510): the six exit checks of [M0-PLAN.md](../M0-PLAN.md) ("What M0 is done looking like"), run on the
sample cafe (`content/sample`) at one commit, in every runtime, and filed as receipts.

```sh
(cd apps/playground && npx vite build)
node acceptance/node.mjs          # the recorded walk, snapshot/restore, devices: results/node.json
node acceptance/chromium.mjs      # the playground at ?mode=acceptance in headless Chromium: results/chromium.json
acceptance/wkwebview.sh           # the same in WKWebView, scheme and loopback (needs spike-cinematics/mac/build)
node acceptance/compare.mjs       # evaluates the six checks: results/summary.json, exit 1 on a failure
```

`apps/playground/src/world.js` builds the sample world the same way everywhere; `src/acceptance.js` holds the checks
that need no renderer; the playground's acceptance mode adds the rendered pass (the walk rendered frame by frame,
every camera preset, debug draw). Check 4 re-runs the W6 harness (`engine/packages/snapshot/harness`); check 5 is a
Claude Code session with the MCP server (`results/mcp-session.json`).

## Result: M6's acceptance (2026-11-27, M5 Max, macOS 27.3 26C5047e)

M6's twelve exit checks ([M6-PLAN.md](../M6-PLAN.md), "What M6 is done looking like") were run at the M6 commit: main at
5d5f42e (W0 to W10, the spikes, and PR #74). Every run used apps built at that commit: the game app's runtime
`0.1.0+01c4bb509d4b`, and the Mac editor, playground and game apps on shell 0.16.0. While the runs went, the tree's
only changes were this PR's: `apps/editor-mac/scripts/mcp-session.mjs` (a new `--w11` mode, which no app loads) and,
from 17:30 UTC, `M6-PLAN.md`'s status text.

**Nine checks pass. Three pass in part (1, 7 and 12).** None failed. Each part that isn't met is listed under the table.
Each check is filed as a receipt (task AB-T-0652); the files are in `results/m6-acceptance/`, and `summary.json` holds
the verdicts. Where an earlier workstream's receipt was taken at an older commit, the check was run again at 5d5f42e, with one
exception: check 10's editor session is PR 74's, recorded at adaa198 and not re-run.
**Whether M6 is done is the operator's call:** nothing here marks it done.

| # | Check | Result | Receipt |
|---|---|---|---|
| 1 | A project starts in the editor | **Partly.** `HAND-TEST-M6-NEW-PROJECT` 8 of 8 (on its third run) and `-recent` 2 of 2. New Project works from both templates, as do the settings (title, rebinding, physics layers), Open Recent, and the real folder panel. The entry scene is set in Project Settings in check 6's scenario (`settings-entry`). `new-project-mac.mjs` and `templates-game.mjs` pass 22 of 22 on what the editor made: each project holds exactly its template's files, every file with a licence row; both builds are whole; the level is won and the empty game runs, in Node and in the game app. **Not met:** the starter content isn't in the templates. `content/templates/level/template.json` copies the sample's cafe, characters and clips (AB-T-0653) | AB-R-1200 |
| 2 | Behaviours and connections are authored in the inspector | **Passed.** `HAND-TEST-M5-LEVEL` 17 of 17 on WebGPU and 17 of 17 on WebGL (on its third run). Through the Behaviours and Connections panels it adds the player behaviour, three brains and three `tableZone`s by their schemas, all 19 connections and every id. The saved level is the committed one byte for byte (check 5) | AB-R-1201 |
| 3 | A project's own behaviours describe themselves | **Passed.**<br>• Both games' modules declare theirs: `tableZone` and `pressToStart` in `game/behaviours.js`, and `shelf` in `after-hours/behaviours.js`, with its `item` param and `placed` and `refused` signals.<br>• The inspector edits `tableZone`'s seven params from its describe (check 2's row 13).<br>• After Hours' 12 connections from `shelf`'s signals validate and save on both backends (check 6).<br>• In PR 74's session, MCP's `behaviour` op attached `shelf` with its `item` param; that op refuses a behaviour with no declaration.<br>• The registry's declaration tests pass in `npm run check` | AB-R-1202 |
| 4 | A behaviour reloads while you play | **Passed.** `HAND-TEST-M6-HOT-RELOAD` 7 of 7:<br>• a saved edit reloads in play, state kept;<br>• a throwing reload keeps the old code and shows the error;<br>• a changed state shape restarts the behaviour;<br>• the session is refused for replay.<br>An exported build never reloads: `apps/game/test/no-watcher.test.mjs` passes | AB-R-1203 |
| 5 | The level is built by hand, all of it | **Passed.** Check 2's runs: `rush-level.mjs compare` finds each backend's saved level equal to `content/sample/game/level.vrmxs`: 12,871 of 12,871 bytes, 48 of 48 nodes and 19 of 19 connections, ids included, valid. M5's check 8 is complete | AB-R-1201 |
| 6 | A second game is built in the editor | **Passed.**<br>• `HAND-TEST-M6-AFTER-HOURS` 27 of 27 on WebGPU (second run) and 27 of 27 on WebGL, from New Project to Export Game.<br>• `after-hours-compare.mjs`: the four scenes, game.json and the hand-written `behaviours.js` are the committed bytes, and each Export Game build is whole and plays to both endings in Node.<br>• The committed sessions (build `61a49e385ae4`, which a fresh export names) replay exactly: Node 2 of 2, the game app in Chromium 4 of 4, and WKWebView 8 of 8 (both origins, both backends). Win: 4,945 steps, final `9da9445d3b8dcec8`. Lose: 3,526 steps, `1911b477d418a6c8`.<br>• Played again through the menus, the game recorded W10's sessions byte for byte | AB-R-1204 |
| 7 | Saves survive an update | **Partly.** `saves.mjs` 10 of 10 on the Morning Rush:<br>• A save loads after a re-export that changes only a texture, the music's samples, the release or a declared behaviour's comment; 1,800 steps on give the same hashes.<br>• It is refused, with the reason named, after a change to a declared state, an undeclared behaviour's code, a scene, an item or the action map.<br>• The old session log is refused by the new build's replay.<br>• The engine's maths refusal is unit-tested only (`compat.test.mjs`), not shown end to end with its message.<br>**Not met:** a re-export that changes only the HUD refuses earlier saves. The fingerprint's engine part counts the runtime's version, which stamps every source the game app bundles, the HUD's among them (AB-T-0679) | AB-R-1205 |
| 8 | A game keeps running and can be shared | **Passed.**<br>• **Device loss:** `device-loss.mjs` 16 of 16, `device-loss-wkwebview.sh` 6 of 6 and `editor-device-loss.mjs` 7 of 7. In the hardened Mac app, WebKit's GPU process was killed twice; the game came back on the WebGL2 fallback each time and ended on the log's hash (4,333 steps, `83a97551fb38a7d6`).<br>• **Static hosts:** `sharing.mjs` 19 of 19. The Rush was won from Python's `http.server` and from Wrangler dev under the build's CSP with no eval.<br>• **Mac build:** `morning-rush.app` passes `codesign --verify --deep --strict` (flags adhoc, runtime) and `HAND-TEST-M5-RUSH` 4 of 4, with Third-Party Notices in its Help menu.<br>• **Notices:** `check-notices.mjs` passes for the editor, playground, creator and game.<br>Signing, notarising and hosting stay the operator's steps | AB-R-1206 |
| 9 | There is a game builder's guide | **Passed.** `HAND-TEST-M6-TUTORIAL` follows `docs/guide/tutorial.md` step by step: 11 of 11 on WebGPU and 11 of 11 on WebGL, and the two runs' levels are byte-identical. Step 12 plays each run's build in Node and in the game app on both backends: 11 of 11 each. As in W9, three rows are checked in part: walking Mira (steps 2 and 10) is step 12's, and step 5's file is the page's own code saved by a helper, not typed. The site isn't deployed (the operator's step) | AB-R-1207 |
| 10 | Agents can build a game too | **Passed.**<br>• **From a template (new, headless):** in the editor, `game op=new` asks the person for a folder, so this ran headless. An agent with only `vrmxg-mcp` (`mcp-session.mjs --w11`, Sonnet) made "Tea Time" from the level template at 5d5f42e. It gave Hana `greet` with four params, added an Area with two connections, then validated, saved and exported: 18 MCP calls (and one ToolSearch), none failed, $0.28. The build verifies whole (60 files) and plays to its ending in Node.<br>• **A level for the second game:** PR 74's session in the Mac editor (5 of 5, 37 calls, none failed), recorded at adaa198 and not re-run. Since then, PR 74's review changed `skills/vrmxg/SKILL.md`'s building rules (which the session loaded: a prop stands on a `Node3D` at its base, its lift from the asset's bounds), the Export line's path display in `export-game.js` (`homeShort`), and a doc comment in `mcp/src/tools.js`. Rows 1 and 5, tightened in that review, were run again on the agent's saved project (`rows-1-5/`) | AB-R-1208 |
| 11 | The spikes have verdicts | **Passed.** `spike-networking/` (lockstep now, rollback once AB-T-0657 to 0659 close) and `spike-webxr/` (no WebXR in WKWebView on the Mac; visionOS Safari has no WebGPU adapter) each have a README with a verdict, run instructions and raw JSON | AB-R-1209 |
| 12 | M0 to M5 still hold; After Hours at 60 fps | **Partly.**<br>• **The frame rate is met in this run:** the Mac game app replayed After Hours' sessions for 665 s at 1080p on WebGPU, steady 60.0 fps (30,301 frames in 505 s). W10 measured 59.58 the same way on the same build this morning, so this is at the bar, not above it.<br>• **Everything else re-run passes:** M5's scripts on both backends, the Rush's committed sessions in Node, Chromium and WKWebView, `npm run check` and the shell's tests.<br>• **Not met:** scene changes drop the frame rate, as in M5: their 5-second windows run 47 to 68 fps, and the worst frame is 210.5 ms while the next world is built.<br>• **Not met:** the canonical matrix fails by its own rules in both full runs. Single WebGPU loads differ from canonical (a film exported twice in one load differs, and an editor digest once), never on WebGL. b5b2527, the commit AB-T-0656 found canonical, fails the same way today, so this is the machine, not M6's code (AB-T-0666).<br>• **Not run:** live play on the Mac; the base Mac (AB-T-0511); M5's other Mac scenarios (the editor's inspector, viewport, prefabs and assets, and export; the game app's `M5-GAME`); M0 to M4's Mac scenarios and M2 to M4's Chromium checks | AB-R-1211, AB-R-1210 |

### Not green

- **Check 1: the templates carry the sample's content, not the starter content (AB-T-0653).** New Project's "One
  level" copies `sample/sets/cafe.glb`, the sample's Mira and Hana, its animation set and its clips. The starter's 37
  CC0 clips and 17 items (M6 W4) aren't in either template, because merging the starter's licence rows into a project
  is AB-T-0653. Every file a template does copy has its licence row.
- **Check 7: a HUD-only re-export refuses earlier saves (AB-T-0679).** The game app's runtime version is
  `0.1.0+<12 hex>`, a stamp of every source file it bundles, `@vrmxg/game-ui` among them. The fingerprint's engine
  part counts that version, and so do the engine's undeclared behaviours. `@vrmxg/bundle`'s README keeps it there on
  purpose until the engine's node types declare their state, and `compat.test.mjs` asserts that a new runtime with the
  same snapshot format and maths still refuses. So the check's HUD example is the one thing in its list that doesn't
  load. Texture, audio, release and a declared behaviour's comment do, end to end.
- **Check 12: the matrix.** Two full runs at 5d5f42e, with `--keep-going` and `canonical.json` untouched:

  | Run (UTC) | Odd loads | Canonical cells |
  |---|---|---|
  | 15:49 to 16:10 (`matrix/`) | Chromium WebGPU `frames` (`filmSecond`; the rerun's `film` and `filmSecond` too) and `editor` (rerun canonical); WKWebView scheme WebGPU `editor` (rerun canonical); WKWebView loopback WebGPU `frames` load 2 (`filmSecond`; its rerun failed `filmTwiceIdentical` too, though its digest was canonical) | 3 of 6 (the WebGL cells) |
  | 19:41 to 20:01 (`matrix-final/`) | WKWebView loopback WebGPU `frames` load 1 (`filmSecond`, rerun canonical) | 5 of 6 |

  Both runs had:
  - 0 AB-T-0589 incidents (every odd load was classed quiet);
  - `compare.mjs` 20 of 20 per backend, and every cell's simulation final `fe69bad3406ab5f6`, Node's;
  - masked SSIM 0.994 to 0.997 per look, and the anime look 0.961 full size (0.993 at ¼), as in M5's run;
  - a 20-character budget at 1080p of 1.68 to 2.30 ms per step;
  - every WebGL cell canonical.

  The odd film frames fail `filmTwiceIdentical`: two exports in the same load differ by single frames. That is
  nondeterminism within a load, not a digest that moved, so there is no commit to bisect.

  The same three-load Chromium WebGPU `frames,editor` run was made at both commits:

  | Commit | `frames` | `editor` |
  |---|---|---|
  | b5b2527 (16:56): main after W6 and PR #63, canonical 6 of 6 for AB-T-0656 ([`b5b2527-frames-editor.log`](results/m6-acceptance/runs/b5b2527-frames-editor.log), run in a throwaway worktree of that commit; no summary kept) | load 1 odd (`filmSecond`), rerun canonical | 3 of 3 |
  | b5b2527 again (20:29), its summary stamped with the commit and a clean tree ([`b5b2527-frames-editor/summary-partial.json`](results/m6-acceptance/b5b2527-frames-editor/summary-partial.json), [`runs/b5b2527-frames-editor-2.log`](results/m6-acceptance/runs/b5b2527-frames-editor-2.log)) | load 1 odd (`film`, `filmSecond`), the rerun odd too | 3 of 3 |
  | 5d5f42e (17:23; [`matrix-frames-editor-5d5f42e/summary-partial.json`](results/m6-acceptance/matrix-frames-editor-5d5f42e/summary-partial.json)) | load 2 odd, rerun canonical | 3 of 3 |

  The same failure at the commit that was canonical is what clears M6's code; the diff since b5b2527 isn't the
  argument (the editor changed a lot in W8 to W10).

  The load check classed every odd load quiet. That isn't proof: IOAccelerator's per-process GPU time, sampled every
  10 s ([`gpu-time-summary.json`](results/m6-acceptance/runs/gpu-time-summary.json)), started at 16:15, after run 1's
  odd loads, and was kept only as a summary, so no odd load can be matched to its window. Over 16:15 to 19:56 it shows
  the runners and WindowServer (up to 16.2%, while someone used the Mac); other apps used at most 10.6% of any 10-second
  window, and that one was a browser. The operator's active desktop isn't ruled out as the trigger. Either way this is
  AB-T-0666 again: on 2026-11-26 the same cell drew single odd frames for about 30 minutes on a GPU classed quiet. This time it came and went for
  four hours (15:26 to 19:56 UTC), most in the first hour. AB-T-0666 is amended with today's runs.
- **Check 12: playback, not live play; the base Mac.** The frame rate replays sessions played in Chromium, as W10's
  did. Over 665 s the run had 28 scene changes, with their windows at 47 to 68 fps. The worst frame was 210.5 ms. The
  web process peaked at 1.48 GB (median 1.04) and the GPU process at 0.51 GB. The 1-minute load at the start was 3.46,
  above W10's gate of 3; the excess was the Claude desktop app and WindowServer. The base Mac waits on AB-T-0511.
- **"M0 to M5 still hold"** is read as: no regression from M5's verdicts. M5's partial checks 4 and 10 stay carried
  (AB-T-0642, AB-T-0511), and its check 8 is now complete (check 5).
- **Checked in part inside passing checks.** These are named in the rows above and leave each check's wording met:
  - check 9's three tutorial rows;
  - check 4's module that first appears while the project is open (AB-T-0670).
- **Carried tasks whose wording isn't an exit check:**
  - AB-T-0626 (the 20-times Play loop) and AB-T-0655 (`tree.detached`);
  - AB-T-0654 (module import in long-lived processes);
  - AB-T-0671 (a hidden ParticleEmitter keeps emitting);
  - AB-T-0672 (the editor's Play has no game service: rules and goals run only in builds, which is why checks 6 and
    9 play builds to their endings);
  - AB-T-0673 (prototype-polluting prop paths).

### Check 12's re-run of M0 to M5

- **Tests:**
  - `npm run check` 1,176 of 1,177 (1 skipped, as in M5);
  - the shell's 68 Swift tests;
  - `acceptance/node.mjs` (walk final `fe69bad3406ab5f6`);
  - `rush-node.mjs all` and `after-hours-node.mjs all` (won, lost, lost on time);
  - `templates-node.mjs` 2 of 2.
- **M5's scripts, at the M6 commit** (`results/m6-acceptance/runs/`, `runner-results/`):
  - `build.mjs --chromium` 10 of 10, and `build-wkwebview.sh` 4 of 4 (build `7d0bb9a4e6ce158c`, walk final `fe69bad3406ab5f6`);
  - `flow` 4 of 4 in WKWebView, final `cfe3f7e9828c49b1`;
  - `dialogue` 4 of 4, `81eaec36719b1754`, M5's finals;
  - `game.mjs` 19 of 19;
  - `layers` in Node, Chromium and WKWebView 4 of 4 (`d14fcfab1e02d846`);
  - `starter.mjs` (38 slots, 17 items, Chromium equal to Node) and `templates-game.mjs` 10 of 10.

  `flow`, `dialogue`, `layers` and `starter` wrote result files identical to the committed ones.
- **The committed session logs, replayed without recording** ([`replay-logs.json`](results/m6-acceptance/replay-logs.json),
  `acceptance/m6/replay-logs.mjs`, new). A fresh export of each game names the build its logs were played on: the
  Rush's `689c41cac7b7` and After Hours' `61a49e385ae4`. Each log replays in Node and in the game app on WebGPU and
  WebGL, and `rush-wkwebview.sh` and `after-hours-wkwebview.sh` give 8 of 8 each. Rush: win 6,298 steps
  (`4381da0665630266`), lose 4,819 (`7827a18e8b107a1c`). `rush.mjs` played fresh sessions through the menus (6,294
  and 4,812 steps) and replayed them on both backends. Those logs are in `runner-results/m5-rush/`; the committed ones
  are unchanged.
- **Not run again:** M0 to M4's Mac scenarios (M1's editor and export, M2's timeline and acceptance, M4's backend
  switch), M2 and M3's Chromium checks, M4's takes, voicing and script runs, M3's live parts, the creator's Mac
  scenarios, M5's editor scenarios other than the level (inspector, viewport, prefabs and assets, export), and the game
  app's `M5-GAME`. The matrix covers M0 to M4's rendering on both backends. M6 changed the editor a lot, so these are a
  real gap, listed under check 12's row.

### Found on the way

- **A symlinked harness voids the matrix's WKWebView cells.** A worktree has no
  `spike-cinematics/mac/build/CinematicsSpike.app`, and the first attempt linked the main checkout's. `matrix.mjs`'s
  `cp -R` copies a link as a link. So `AcceptanceMatrix.app` and `AcceptanceMatrixEditor.app` were one app: the
  playground cell loaded the editor's page and timed out at 900 s. Its web folder was also written into the main
  checkout's harness, which was rebuilt from its own `dist` with `SKIP_WEB=1`. The attempt was stopped and is kept
  for its Chromium cells only (`matrix-first-attempt/`). **Copy the harness into a worktree; don't link it.**
- **One WKWebView replay hung.** The first `rush-wkwebview.sh` (16:23 UTC) sat for 31 minutes with an empty window.
  The scheme WebGPU case timed out at 900 s, and the next case idled at 1% CPU. Alone, the same cases ran at once
  (4,826 and 4,841 frames, no error), and the whole script then passed 8 of 8. Not reproduced.
- **AppProbe scenarios lost rows to typing and menu races, and passed on a rerun.** All runs were on the same build
  and fresh fixtures; every failed report is kept beside the passing one (`*-first-try`, `*-second-try`).
  - New Project: a J key press not received (row 4); Add Layer pressed before the typed name registered (row 5).
  - The level's WebGL run: the Id field not found (row 12); a typed id cut to `a7b-1c2d3e4f5a61`; menu items missing.
  - After Hours' WebGPU run: W10's closing-menu race (row 13).
  - Another session was using the Mac meanwhile ("2 users", WindowServer at 30 to 45%).
  - Making the select and type steps wait for their value is AB-T-0680.
- **The committed `results/m6-device-loss/lose.json` is on an older build** (`ac3cab29`). `device-loss.mjs` records
  its session again every run, so its checks are unaffected. The Mac device-loss run used this run's log
  (`runner-results/m6-device-loss/lose.json`).
- **PR #71 is W9's, not W8's.** It holds W9's follow-ups; W8 is #67, #68 and #74 (`M6-PLAN.md`'s third-wave status says so).

### What ran

```sh
npm ci && (cd spike-determinism/web && npm ci) && (cd docs && npm ci)       # docs/: Wrangler for sharing.mjs
cp -R <main checkout>/spike-cinematics/mac/build/CinematicsSpike.app spike-cinematics/mac/build/   # a copy, not a link
npm run build -w @vrmxg/game-app && (cd apps/playground && npx vite build) && (cd apps/editor && npx vite build) && (cd apps/creator && npx vite build)
SKIP_WEB=1 apps/editor-mac/scripts/build.sh && SKIP_WEB=1 apps/playground-mac/scripts/build.sh
acceptance/m6/after-hours-frames.sh build      # and the Rush's Mac app: export to apps/game-mac/build/rush, SKIP_WEB=1 apps/game-mac/scripts/build.sh it
npm run check && swift test --package-path apps/shell
node acceptance/node.mjs && node acceptance/m5/rush-node.mjs all && node acceptance/m6/after-hours-node.mjs all
node acceptance/m6/templates-node.mjs && node acceptance/m6/saves.mjs
node acceptance/matrix.mjs --keep-going --quiet-wait 120          # run 1; run 2 with --quiet-wait 60
node acceptance/matrix.mjs --runtimes chromium --backends webgpu --checks frames,editor --loads 3 --keep-going --quiet-wait 60   # here, and twice at b5b2527
node acceptance/m6/replay-logs.mjs && acceptance/m5/rush-wkwebview.sh && acceptance/m6/after-hours-wkwebview.sh   # the committed logs
node acceptance/m5/build.mjs --chromium && acceptance/m5/build-wkwebview.sh
node acceptance/m5/flow.mjs && acceptance/m5/flow-wkwebview.sh && node acceptance/m5/dialogue.mjs && acceptance/m5/dialogue-wkwebview.sh
node acceptance/m5/game.mjs && node acceptance/m5/layers.mjs && acceptance/m5/layers-wkwebview.sh
node acceptance/m6/device-loss.mjs && acceptance/m6/device-loss-wkwebview.sh && node acceptance/m6/editor-device-loss.mjs
node acceptance/m6/sharing.mjs && node acceptance/m6/starter.mjs && node acceptance/m6/templates-game.mjs
node acceptance/m5/rush.mjs && node acceptance/m6/after-hours.mjs                        # fresh sessions; then the committed logs restored
node apps/editor-mac/scripts/mcp-session.mjs --w11 <empty folder> --out acceptance/results/m6-acceptance/mcp-new-project-session.json
# AppProbe, the GPU lock held throughout, each with its fixture script first: the editor's M6-NEW-PROJECT (+ -recent),
# M6-HOT-RELOAD, M5-LEVEL (+ -webgl), M6-AFTER-HOURS (+ -webgl, after-hours-files.mjs beside it), M6-TUTORIAL (+ -webgl);
# the game app's M5-RUSH on the hardened morning-rush.app
node acceptance/m6/new-project-mac.mjs <container>/tmp/m6-projects && node acceptance/m6/templates-game.mjs <the two builds>
node acceptance/m5/rush-level.mjs compare <the saved level>
node acceptance/m6/after-hours-compare.mjs "<container>/tmp/w10-projects/After Hours" <container>/tmp/w10-builds/after-hours
node acceptance/m6/tutorial.mjs play <container>/tmp/w9-builds[-webgl]/coin-run
acceptance/m6/device-loss-mac.sh       # then #frame-stats read with AppProbe
acceptance/m6/after-hours-frames.sh prepare   # then AppProbe MCP launch at 1920×1112 with VRMXG_QUERY, poll and sample, kill -9 after 660 s
node acceptance/m5/rush-frames-summary.mjs results/m6-acceptance/frames
```

The runners' own result files were restored after each run; this run's copies are in `results/m6-acceptance/`:

| Folder | What |
|---|---|
| `runs/` | Every command's log |
| `runner-results/` | The runners' JSON |
| `matrix/`, `matrix-final/` | The two full matrix runs: summaries and cell JSON; not the per-step runs, `node.json` or odd-frame PNGs |
| `matrix-frames-rerun/` | The three-load Chromium WebGPU `frames` rerun after run 1 (its cell JSON; it stopped at load 1's failure) |
| `matrix-frames-editor-5d5f42e/`, `b5b2527-frames-editor/` | The three-load Chromium WebGPU `frames,editor` runs at each commit: `summary-partial.json` (a subset run's summary, with its commit) and the cell JSON |
| `hand-tests/` | AppProbe reports and `results.json`, without their screenshots; home paths are written as `~` |
| `frames/` | The frame-rate run |
| `mcp-new-project*` | The headless agent session and the level it saved |

## Result: M5's acceptance (2026-11-25, M5 Max, macOS 27.3 26C5047e)

**M5 is done (2026-11-26), by the operator's call**, with checks 4, 8 and 10 passing in part and carried on as
AB-T-0642, AB-T-0638 and AB-T-0511.

M5's ten exit checks ([M5-PLAN.md](../M5-PLAN.md) "What M5 is done looking like") were run at the M5 commit: main at
981eaef (W0 to W10 and the status PR #46). The matrix, the Mac runs after 22:15 UTC and the M2 and M3 re-runs ran at
c03f0d8, which adds only a change to `apps/playground/scripts/gpu-load.mjs` (below); no engine or app code differs.
**Seven checks pass. Three pass in part (4, 8 and 10):** each has a piece that isn't met or wasn't run, listed under
the table. None failed. Each check is filed as a receipt (task AB-T-0621); the files are in `results/m5-acceptance/`,
and `summary.json` holds the verdicts. **Since the PR's review (2026-11-26):** check 9 was run again on the sample game
itself (W9's scenario runs on the cafe project, whose game has no rules: AB-R-1151 is superseded by AB-R-1154), and the
rows for checks 4, 8 and 10 say more exactly what was and wasn't shown. **Whether M5 is done is the operator's call:** nothing here marks it done.

| # | Check | Result | Receipt |
|---|---|---|---|
| 1 | A project exports as a game | **Passed.** `m5/build.mjs`: Node 8 of 8, Chromium 10 of 10, and with the Mac editor's builds 14 of 14. Four Export Game builds from the Mac editor (the bundled sample twice, the project opened as a folder, File › Export Game…) are Node's build byte for byte: 74 files, manifest `e1b28f2b3d674eb6`, build `c283200a4c3ac809`. An unlicensed file and a reference in the wrong case each stop the export by name; a folder holding someone's file is refused and left alone. The recorded walk plays from the build to `fe69bad3406ab5f6` in Node, Chromium and WKWebView (scheme and loopback, two web views each). AppProbe 6 of 6 and 1 of 1 | AB-R-1143 |
| 2 | The game app plays it | **Passed.** `m5/game.mjs` 19 of 19 in Chromium: title menu, start, pause, saves, quit, WebGPU with no query and WebGL when forced; the session replays in Node, every step. The Mac game app: 10 of 10 rows with no query (WebGPU), 1 of 1 with `renderer=webgl`. The sample game plays through the app on both backends (check 7) | AB-R-1144 |
| 3 | The game has rules | **Passed.** `m5/flow*`: 600 steps and seven scene changes hash the same at every step in Node, Chromium and WKWebView over both origins, with steady and varied loading: final `cfe3f7e9828c49b1`, as AB-R-1107. The sample game goes title → level → won or lost → title by its rules, in Node (won at step 5331 with 50 points, lost on two mistakes at 3847, lost on time at 14760) and through the app | AB-R-1145 |
| 4 | There is a HUD and there are menus | **Partly.** The HUD's goal, score, clock and what Mira carries are read in Chromium and, through the accessibility tree, in the Mac app. The pause menu works from the keyboard in both and from a stand-in gamepad in Chromium; in Settings, the backend is changed and kept in both, and a key rebound and kept in Chromium. **Not run:** the HUD's interaction prompt read from the page (only `@vrmxg/game-ui`'s unit tests read `#hud-prompt`), a volume changed, a gamepad binding rebound, a real gamepad (none was attached: GameController listed 0 controllers), VoiceOver in a running app | AB-R-1146 |
| 5 | You talk to characters through a dialogue UI | **Passed.** `m5/dialogue*`: the choice clicked on the overlay is in the recording at step 203; Node, Chromium and WKWebView over both origins give the same per-step hashes and the replay takes the same branch: final `81eaec36719b1754`. The sample game's four choices a win are recorded and replay in every runtime (check 7) | AB-R-1147 |
| 6 | You can save and carry on | **Passed.** `m5/flow*`: the save at step 60 and the checkpoint at step 67 are the same files in every runtime, and each goes on to step 600 with the unbroken run's hashes across five scene changes. `m5/game.mjs`: Slot 1 saved from the menu loads at its step, in a fresh launch too. The Mac game app: a slot loads in a fresh launch at its step; the sample game's save at the till (`rush-save.mjs`, step 5326) loads and one E wins | AB-R-1148 |
| 7 | A play session replays exactly | **Passed, on fresh recordings.** `m5/rush.mjs` won (6,299 steps, final `43d3a2f6c26f5a1a`) and lost (4,808 steps, `c151a6a6a058981f`) the sample game through the game app's title menu in Chromium, build `168e7920` (the build W10 recorded on). Each log replays to the same hash after every step in Node, in the app on WebGPU and WebGL, and in WKWebView over both origins on both backends (8 of 8) | AB-R-1149 |
| 8 | The editor is good enough to build it | **Partly.** The level's game layer built by hand in the Mac editor with no JSON typed: 13 of 13 rows on WebGPU and 13 of 13 on WebGL, the same bytes as W10's, all 22 game-layer nodes found with the committed props, parents and places, but under the ids the editor gives them (only `till` keeps its id). W4 to W6's scenarios: inspector 5 of 5, viewport 7 of 7 on each backend, prefabs and assets 11 of 11 on each. A number dragged with the real pointer is one undo step. **Not met:** behaviours on the new nodes and the level's 19 connections (AB-T-0638), and the committed ids, which those connections name | AB-R-1150 |
| 9 | Agents can build and check a game | **Passed, on the sample game.** With The Morning Rush open on its level (`HAND-TEST-M5-MCP-RUSH`, new), an agent with only the editor's MCP tools (Sonnet) read the game's rules (its counters, timers, goals and lose condition), added a fourth regular, Kai, and a goal under the existing rules (`greeted`, `greet-kai`, the area that counts it), validated, saved and exported: 15 MCP calls, none failed, $0.28. The export (116 files) verifies whole and holds both; the editor's Undo named each edit (MCP), went back to the opened level, and Redo brought them back (AppProbe 4 of 4). `docs/llms.txt` and the `vrmxg` skill are in the repository, the index checked by `npm run check` | AB-R-1154 |
| 10 | M0 to M4 still hold; 60 fps | **Partly.** **M0 to M4 hold on both backends:** the matrix is green in all six cells against `canonical.json` (not re-blessed), 0 incidents (AB-R-1152), and everything else re-run below passes. **The frame rate:** the recorded sessions played back by the Mac game app at 1080p on WebGPU run 59.5 fps in steady play. **Not met:** 60 fps: steady play is 59.47 fps, below 60 and below W10's 60.11, and scene changes drop to 40 to 70 fps windows with a 523 ms worst frame. **Not run:** live play on the Mac, the base Mac (AB-T-0511) | AB-R-1153 |

### Not green

- **Check 4: no real gamepad, no VoiceOver, and three things not exercised.** No gamepad was connected to this Mac
  (GameController's `controllers()` was empty), so every gamepad row is Chromium's stand-in through
  `navigator.getGamepads` (`m5/game.mjs`), and `HAND-TEST-M5-GAME`'s row 12 is still for a person with a pad. The
  overlays are DOM with accessible names, and AppProbe reads them through the same accessibility tree VoiceOver uses;
  nobody listened to VoiceOver read them in the app. **Not exercised in an app:** the HUD's interaction prompt
  (`rush-player.js` reads the interact service's model, not the DOM; only `@vrmxg/game-ui`'s unit tests read
  `#hud-prompt`); a volume (every stored volume stays 1 in Chromium, and the Mac app's scenario changes only the
  renderer, row 10, and moves through the menus, row 6); and rebinding a gamepad button (only a key, Jump to J).
- **Check 8: behaviours, connections and ids (AB-T-0638).** The scenario starts from the level's room with its
  behaviours, and builds everything else; the three `tableZone` behaviours and the 19 connections stay unauthored, so
  the level a person can make in the editor doesn't play by itself. **And the ids differ:** `rush-level.mjs` matches
  nodes by type and key or name, and 21 of the 22 come out under the ids the editor gives (`table-1` → `area`,
  `served` → `gamecounter-2`, `serve` → `gamegoal`, `order-3` → `dialogue-4`; only `till` keeps its id:
  [`level-compare-webgpu.json`](results/m5-acceptance/hand-tests/level-compare-webgpu.json)). The inspector renames a
  node but can't set its id, and the committed level's connections and `tableZone` params name the committed ids, so
  they can't be carried onto the built level as they are; wiring it in the editor would have to name the editor's ids.
  AB-T-0638 is amended with both (and its count: 19 connections, not 15). Also: the dragged number's value wasn't watched while the
  pointer was down (only its result and its one undo step:
  [`hand-tests/editor-number-drag.md`](results/m5-acceptance/hand-tests/editor-number-drag.md)), box select's ⌘ and
  ⇧ can't be pressed through AppProbe's pointer, and the selection outline is still judged only in screenshots.
- **Check 10: below 60 fps, scene changes, playback, the base Mac.** 755 s of the two sessions played back by the Mac app, 44,523
  frames, 8 replays and 24 scene changes: **steady play 59.47 fps** (37,584 frames in 632 s, 2.87 per mille over 25 ms;
  W10 measured 60.11, AB-R-1137). The windows that hold a scene change run 40 to 70 fps, and the worst frame is 523 ms
  while the next world is built. The web process ran 0.42 to 2.35 GB (median 1.62), the GPU process 0.56 GB at most. The
  GPU was otherwise quiet (median 26 %); the operator's Edge helpers ran at up to 24 % CPU throughout. It is playback of
  sessions played live in Chromium (whose own replays drew at p99 16.8 ms), not live play on the Mac. The base-Mac
  figure waits on the hardware (AB-T-0511). No lost GPU device this time (AB-T-0639 is still open).

### Check 10's re-run of M0 to M4

- **The matrix** (`node acceptance/matrix.mjs --keep-going`, c03f0d8, clean tree, 23:31 to 23:51 UTC; files
  `results/m5-acceptance/matrix/`): every load of every check in all six cells matched its canonical digest, the same
  digests as AB-R-1087. `compare.mjs` 20 of 20 on each backend; every cell's simulation final is Node's
  (`fe69bad3406ab5f6`). Masked SSIM 0.994 to 0.997 per look, the anime look 0.993 at ¼ (0.961 full size), the mask
  0.017 % of the frame. Budget, 20 characters at 1080p: step 2.20 ms (Chromium WebGPU), 2.04 (Chromium WebGL), 2.23
  (WKWebView loopback WebGPU), 1.69 (WebGL).
- **Chromium, both backends** (`results/m5-acceptance/m0-m4-rerun/`): M2's editor export and check against scrub,
  M3's conversation export, ragdoll, split screen and dialogue give M4's re-run's results exactly, timings aside (two
  views cost 1.0 against 0.5 ms for one on WebGL, 2.2 against 1.2 on WebGPU). M4's takes (final `e50ac8a7e928dc3f`),
  voicing (`e68bfb9a96f255c5`, mouths `58b2c9d48f735177`) and script (`58cebece…f902`, re-script `490c1711…c991`) in
  Node, Chromium and WKWebView, as recorded; the backend switch in the built playground, editor and creator passes.
- **Tests:** `npm run check` 973 of 974 (1 skipped: an MCP test needs a git-ignored model); the shell's 58 Swift tests.
- **The Mac apps** (AppProbe, `results/m5-acceptance/hand-tests/`): M0 5 of 5 (its two shots judged: the colliders'
  wireframes, Mira through the entrance), M1 editor 9 of 9, M1 export 6 of 6 with `check-exports.mjs` 14 of 14, M2
  acceptance 5 of 5 with `check-sequence-exports.mjs` 10 of 10, M2 timeline 7 of 7 (its multi-angle shot judged, the same
  as M4's), M4 backend 4 of 4 in the playground and the editor. The two export checks are whole on a quiet GPU (on
  2026-11-24, under load, they gave 11 of 14 and 9 of 10).
- **Not run again:** M3's live parts (the spoken conversation, the camera, the companion), the creator's Mac scenarios,
  M4's deliveries from the creator (the matrix's frames and editor checks cover exact frames per backend), and the
  editor's MCP sessions of M1 to M4.

### Found on the way

- **Another project's GPU jobs were invisible to the GPU check.** Gaea's plugin workers (`gaea-boogu-worker`,
  `gaea-ace-step-worker`; a headless Gaea at 18 GB) ran outside the GPU lock and held the GPU at up to 99 %, and
  `gpu-load.mjs` knew neither name, so the matrix's first attempt classed that load quiet: Chromium WebGPU's editor
  load 2 differed from canonical on its first try and its rerun (its own scrub check 26 of 26 both times), which by the
  rules is a failure ([`matrix-first-attempt/`](results/m5-acceptance/matrix-first-attempt/)). `gpu-load.mjs` now counts
  Gaea and its workers (c03f0d8); the matrix was re-run whole once the job had ended, and passed. Chromium WebGL's cell
  in the first attempt, its editor load 2 at 98 % GPU included, matched canonical.
- **Flaky scenario steps, each passed on a second run:** the level's first WebGPU run lost row 5 to the known typing
  race (a value typed into a new row landing after its placeholder: "newflags.tillClosed"); a WebGL run lost row 7's
  real-pointer drag (it moved an area instead of dropping the till); the WebGL viewport's first run met Edit › Copy
  still disabled. The first WebGL level run started from the file the WebGPU run had saved (my fixtures, not the app).
  The failed reports are kept beside the passing ones (`*-failed.md`, `*-first-try.md`).
- **AppProbe's CLI cuts a value at its commas** (`env=VRMXG_QUERY=replay=a.json,b.json…` reached the app as
  `replay=a.json`) **and truncates long names** in `find`'s output (the frame-rate readout's last word, "scene cha…").
  The frame-rate app was launched through AppProbe's MCP `launch` (the environment as an object), and the readout's
  cut word was mended after the run (`frames/readout-as-read.log` is the text as read; every number was whole).
- **Validate warns that two of the sample game's goals can't be reached, for two different reasons.** `serve` is
  reached from code: `tableZone` calls `game.add('served', 1)` (`content/sample/game/behaviours.js`), which
  `unreachableGoals` can't follow. `press-start` on `title.vrmxs` is an optional, label-only goal (no `when`) that
  nothing ever completes: `pressToStart` only changes the scene. It is harmless because optional goals don't count
  towards a win, and validate doesn't say so: it ignores `optional`. Both are warnings, not problems, only because
  `codeMayChangeState` downgrades every unreachable goal in the project once its behaviours module mentions the game
  service, so a mistyped goal key in a project with behaviours would show only as a warning too (AB-T-0641). The agent
  in check 9 listed the warnings and said it hadn't checked them.
- **The lose session recorded today is W10's byte for byte**; the win took 6,299 steps against W10's 6,292 (live play
  in a browser lands its inputs on different steps).

### What ran

```sh
npm ci && npm run build -w @vrmxg/game-app && (cd apps/playground && npx vite build) && (cd apps/editor && npx vite build) && (cd apps/creator && npx vite build)
npm run check && (cd apps/shell && swift test)
node acceptance/node.mjs && node acceptance/m5/rush-node.mjs all
node acceptance/m5/build.mjs --chromium && acceptance/m5/build-wkwebview.sh
node acceptance/m5/flow.mjs && acceptance/m5/flow-wkwebview.sh
node acceptance/m5/dialogue.mjs && acceptance/m5/dialogue-wkwebview.sh
node acceptance/m5/game.mjs
node acceptance/m5/layers.mjs && acceptance/m5/layers-wkwebview.sh
node acceptance/m5/rush.mjs && acceptance/m5/rush-wkwebview.sh
node acceptance/matrix.mjs --keep-going --quiet-wait 120
node acceptance/m2/editor-chromium.mjs --url <the built editor> --renderer webgpu   # and webgl; m3/conversation-export, ragdoll, split on both, dialogue on WebGL
node acceptance/m4/takes.mjs && acceptance/m4/takes-wkwebview.sh                   # and voicing, script-chromium, script-wkwebview, backend-switch
# AppProbe (each under the GPU lock, its fixture script first): the editor's M5-EXPORT-GAME (+ refusal), M5-LEVEL (+ webgl),
# M5-INSPECTOR, M5-VIEWPORT (+ webgl), M5-PREFABS-ASSETS (+ webgl), M5-MCP-RUSH with mcp-session.mjs --rush (and W9's M5-MCP with --m5, on the cafe), M1-EDITOR, M1-EXPORT
# with check-exports.mjs, M2-ACCEPTANCE with check-sequence-exports.mjs, M2-TIMELINE, M4-BACKEND (+ webgl); the game app's
# M5-GAME (+ webgl) and M5-RUSH; the playground's M0 and M4-BACKEND (+ webgl)
node acceptance/m5/build.mjs --mac <the four builds> --refused <folder> --kept <folder>
node acceptance/m5/rush-level.mjs compare <the saved level>   # since M6 W1: the committed level's bytes, ids, behaviours and connections included
acceptance/m5/rush-frames.sh prepare   # then AppProbe MCP launch at 1920×1112 with VRMXG_QUERY, rush-frames.sh sample, #frame-stats read every 5 s
node acceptance/m5/rush-frames-summary.mjs <folder>
```

The runners' own result files (`results/m5-*.json`, `m4-w3/`, `m2-*`, `m3-*`, the hand tests' `results/`) were left as
their workstreams committed them; this run's copies are under `results/m5-acceptance/` (`runs/`, `matrix/`, `rush/`,
`frames/`, `m0-m4-rerun/`, `hand-tests/`).

## M5's checks as they land

- **Check 1, a project exports as a game** (W0, AB-T-0615, 2026-11-24): the sample project (`content/sample`, its
  `game.json`) exported with `@vrmxg/bundle`. The build's contract is that package's README (AB-D-0282).
  ```sh
  npm run build -w @vrmxg/game-app           # the runtime a build is made with (the game app since M5 W1; before it, @vrmxg/bundle's minimal one)
  node acceptance/m5/build.mjs --chromium    # Node and headless Chromium: results/m5-build.json
  acceptance/m5/build-wkwebview.sh           # the build played in WKWebView, scheme and loopback (under the runner lock): results/m5-build-wkwebview.json
  # the Mac editor: apps/editor-mac/docs/hand-test/HAND-TEST-M5-EXPORT-GAME.scenario.md, then
  node acceptance/m5/build.mjs --chromium --mac <builds…> --refused <folder> --kept <folder>
  ```
  **Passed, 16 of 16 and 4 of 4** (M5 Max, macOS 27.3 beta, Node 26.12.1, Chrome for Testing 156.0.8078.4). First run before
  any review (receipt AB-R-1102), again after each of two review rounds (AB-R-1106, AB-R-1108), again once the branch
  was rebased over W2 and W8 (AB-R-1109), and again after a third review. Each changed the runtime, so the digests
  below are the last run's:
  - **The build:** 60 files, 22,211,863 bytes: 50 of the project's files under `project/` and the runtime's
    10 (`vrmxg-stepper 0.1.0`, digest `2e08d965b6837eb4…`); build digest `d03301c5fe1744dc…`.
  - **The same bytes from Node and from the Mac editor.** Two exports in two Node processes, and four from the Mac
    editor's Export Game (the bundled sample twice, the same project opened as a folder, and File › Export Game…): all
    six folders are the same, byte for byte, 61 files each with the manifest (SHA-256 `e6b6c09e6584ea8e…6ed6`), and each holds
    exactly what its manifest lists. One of the four was then exported over again in the Mac editor (an earlier build
    replaced, staged and moved in whole) and is still Node's build, with no staging folder left.
  - **Every file has its hash and licence** in the manifest: a project file's licence is its row in the project's
    `LICENCES.md`; a runtime file's names the packages bundled into it, whose licence texts ship in
    `THIRD-PARTY-LICENCES.txt`. 33 of the 50 project files are licensed by a pattern row, and say so (`licenceFrom`).
  - **A file with no licence row stops the export**: `no row in LICENCES.md for props/found-on-the-web.glb`, with
    nothing written. In the Mac editor the same refusal shows in the export's result line and no folder is made. **So
    does a reference in another case than the file**: `cafe.vrmxs names Sets/cafe.glb, and the project's file is
    sets/cafe.glb`.
  - **A folder that holds someone's file is refused and left alone**: in the Mac editor, an export into a folder
    holding `notes.txt` is refused in the result line, and the folder holds `notes.txt` and nothing else afterwards.
  - **The loader opens the build and it plays as the project does.** The recorded walk (`input/walk-in.json`, 600
    steps, a hash of all 65 components after every step, Rapier's whole state every 60th): the project played straight
    from its folder, the build through the loader in Node, the build's own runtime in Chromium, and in WKWebView over
    the scheme and over loopback (two fresh web views each) all give the same 601 hashes, final `fe69bad3406ab5f6`. The loader
    read 48 files and checked each against the manifest; a ref the manifest doesn't list is refused by name.

  - **What a module imports is read the same in every engine.** Fourteen awkward modules (division after `x--`, a
    `/*` inside a regular expression, a brace in a template's string, minified code, computed imports that must be
    refused) go through the lexer in Node, Chromium and WKWebView on both origins: the same reading in all, and the
    game's own module graph the same. The exporter runs in one engine and the loader in another.

  **Not checked:** the folder panel a person sees (the hook `VRMXG_SHELL_BUILD` stood in for it), and a build made on
  another machine or by CI. The runtime in the build is the minimal one (`vrmxg-stepper`, no renderer) until the game
  app exists (M5 W1), so nothing here draws a frame of the game. The digests are this branch's: the runtime bundles
  the engine, so they change whenever the engine does, and stay equal between Node and the editor.

## M5 W1: the game app (`m5/game.mjs`, AB-T-0616)

M5's checks 2, 4 (menus) and 6 (slots) in a browser, ahead of M5's own acceptance (W11). The game app (`apps/game`) is
the runtime every build is made with since W1 (AB-D-0286), so check 1 above now plays builds made with it (in its
`?check` harness mode: no renderer, no menus) and still gives the final hash `fe69bad3406ab5f6` in Node, Chromium and
WKWebView on both origins. The game here is the app's test game (`apps/game/test/fixtures/game`: the sample cafe with a
title, a level and an ending).
```sh
npm run build -w @vrmxg/game-app
node acceptance/m5/game.mjs        # Chromium, under the GPU lock: results/m5-game.json
# the Mac app: apps/game-mac/docs/HAND-TEST-M5-GAME.md (AppProbe)
```
**Passed, 19 of 19** (M5 Max, macOS 27.3 beta, Node 26, Chrome for Testing 156.0.8078.4): the title menu on WebGL when
forced; New Game, the title scene skipped with Space (a recorded input); the HUD (`@vrmxg/game-ui`, mounted at the app's seam) and Hana's question answered with Enter on the overlay (a recorded choice); the level played with W held; Escape pauses and
nothing steps; Save Game → Slot 1; Load Game over unsaved play asks, then goes back to the save's step, and Tab can't leave the question; a save an earlier export made is listed as such, can't be picked, and Continue skips it; Quit to Title
asks; **the session's log, played in Chromium through the menus with a hash of the world after every step made in the
page, replays in Node to the same hash on every step** (over 800 steps with Hana's choice, two segments: the new game, and the save it loaded);
a fresh launch offers Continue and loads the save at its step; every menu from a stand-in gamepad and from the keyboard;
the renderer setting and a rebound key kept (the key on the menus' input after a relaunch); the A that opens Settings not pressing the control it focuses; with no query the page draws on WebGPU where it has it. The Mac app's AppProbe checklist
passes 10 of 10 and 1 of 1 (WebGL forced; the HUD and a conversation with a choice in row 3), a save written from the menu loading in a fresh launch at its step.

**Not checked:** a real gamepad (Chromium's is a stand-in through `navigator.getGamepads`; AppProbe can't press one);
the replay in WKWebView (the Mac app's session isn't read back: Chromium's is); a session that reaches the ending in the
browser (the Node test `apps/game/test/test-game.test.mjs` plays the whole loop and replays it).

## M5 W2: game flow (`m5/flow*`, AB-T-0617)

M5's checks 3 and 6, ahead of M5's own acceptance (W11): a game that changes scene replays exactly, and a save or a
checkpoint taken before a change goes on with the unbroken run's hashes across it. The game is `@vrmxg/game`'s test
game (`engine/packages/game/test/fixtures`: a title, a level and an ending with physics, recorded input and random
streams): 600 steps, seven scene changes, two of them resets. Nothing draws, so nothing here needs a quiet GPU; the
WKWebView run still takes the runner lock, because every harness run writes the same file in the app's container.

```sh
node acceptance/m5/flow.mjs          # Node, and headless Chromium over loopback → results/m5-flow.json
acceptance/m5/flow-wkwebview.sh      # WKWebView, scheme and loopback → results/m5-flow-wkwebview.json
```

**Result (AB-R-1107, 2026-11-24, M5 Max, macOS 27.3 beta; AB-R-1101 and AB-R-1105 are the runs before each of two review rounds changed the game state's shape, and with it the hashes).** Every one of the 600 steps hashes the same in Node
26.12, Chromium 156 and WKWebView over the custom scheme and over loopback: final hash `cfe3f7e9828c49b1`. Each world's
loading was given no delay (Node), a steady 4 ms and a varied 0 to 12 ms (both browsers, and Node again): the changes
land on steps 11, 148, 208, 267, 404, 464 and 523 every time, with the step held at seven boundaries while a world
loaded. The save taken at step 60 and the checkpoint the game wrote at step 67 are each the same file in every
runtime, and loaded into a new session each gives the unbroken run's hashes to step 600 (540 and 533 steps, five
scene changes).


## M5 W7: character layers (`m5/layers*`, AB-T-0609)

Masked, layered blending over a character's animation (`engine/packages/character/LAYERS.md`, AB-D-0289), ahead of the
sample game (W10). The scenario is `apps/playground/src/layers-check.js`: Mira walks the sample cafe on scripted input
for 420 steps while a wave (the sample's `greet`) plays on her upper body, then the carried tray (`carry.vrma`, added to
the animation document the check loads), a wave on her arms layer over the carry, breathing on the additive layer, and
the tray put down. The same walk with no layer runs beside it. A hash of all 64 components after every step; a
snapshot at step 215, mid cross-fade (the arms' wave fading in over the carry), restored into a fresh world.

```sh
(cd apps/playground && npx vite build)
node acceptance/m5/layers.mjs        # Node, headless Chromium twice, and three stills → results/m5-layers.json, m5-layers-{walk,carry,wave}.png
acceptance/m5/layers-wkwebview.sh    # WKWebView, scheme and loopback, twice each → results/m5-layers-wkwebview.json
```

**Result (2026-11-24, M5 Max, macOS 27.3 beta, Node 26.12.1, Chrome for Testing 156.0.8078.4).** Every step hashes the
same in Node, in Chromium (two fresh pages) and in WKWebView over the scheme and over loopback (two fresh web views
each): final `d14fcfab1e02d846` (the walk alone `1963599cbeda6559`; the per-step run's digest `d09da290f29a9421…`). Restored at step 215, every following step is the
unbroken run's. The lower body (hips, legs, feet, toes) is the walk alone's, bit for bit, on all 303 steps the fullBody
additive layer isn't playing; while it plays, breathing lifts the hips up to 8.5 mm. The wave turns the right upper arm
up to 2.68 rad from walking's, the carry holds the left forearm 1.53 rad from rest, and the wave over the carry 2.66 rad;
nothing of the layers is left in the character's state at the end. Stills: `m5-layers-walk.png` (no layer),
`m5-layers-carry.png` (the tray over the walk), `m5-layers-wave.png` (a wave on the arms layer over the carry).

**Nothing that doesn't use a layer moved:** on this branch, Node's runs of M0 to M3's checks give the eleven simulation
digests in `canonical.json` (all six cells), `compare.mjs` passes 20 of 20 against them, the matrix's acceptance row gives the canonical digest `78ab33e0d7508476` in all six cells with `compare.mjs` 20 of 20 on each backend (`results/m5-layers-matrix-acceptance.json`, run after the coordinating review's fixes), and the M4 takes and voicing
Node runs give their committed finals and run digests.

## Result: M4's acceptance (2026-11-24, M5 Max, macOS 27.3 beta 26C5047e)

M4's ten exit checks ([M4-PLAN.md](../M4-PLAN.md) "What M4 is done looking like") were run at the M4 commit: main at
7984207, which is 8c79fef (W0 to W12 and the four fixes before the acceptance) plus commits that hold only results.
**Seven checks pass. Three pass in part (3, 5 and 8):** each has a piece that isn't met or wasn't run, listed under the
table. None failed outright. Each check is filed as a receipt (task AB-T-0585); the files are in
`results/m4-acceptance/`, with `summary.json` holding the verdicts as they stood at 7984207.

**Since the acceptance (2026-11-24, later the same day): eight pass, and two pass in part (5 and 8).** Check 3's
missing piece is done: the creator's Mac app speaks through the shell's own `tts.speak` (AB-T-0614, AB-R-1098). Check
8's four AppProbe rows ran once the screen was unlocked, and passed (AB-R-1099). Both are marked in the table and under
"Not green".

**M4 was called done on 2026-11-24 with that result**, by the operator: checks 5 and 8 pass in part, and what they lack
is carried on (a face take from a real camera, AB-T-0557; the companion on WebGPU, AB-A-0329; the base-Mac budget,
AB-T-0511), with the beta's odd WebGPU frame (AB-T-0591).

| # | Check | Result | Receipt |
|---|---|---|---|
| 1 | A script becomes a sequence | **Passed.** The sample script builds the same bytes in Node, Chromium and WKWebView over both origins (58cebece…f902, 11,207 bytes; the re-script after hand edits 490c1711…c991, 6,255 bytes). In the creator's Mac app a Fountain script opens as a short with its sequence, storyboard and timeline; an edit re-scripts as one undo step and keeps a hand edit; an error changes nothing and names its line (AppProbe 15 of 15) | AB-R-1088 |
| 2 | You cast it | **Passed, on fixture characters.** A `.vrmxa` opened from the Finder is cast in the selected role as one undo step. A recast keeps the performance and re-voices the role's 4 lines in the new voice, one step. Persona voice, allowed expressions and the wardrobe through the closet: `@vrmxg/cast`, 22 of 22 tests, the studio's Hana and Mira among them. The sample's own two characters carry no usable persona voice, so their voices come from the role map (AB-A-0330) | AB-R-1089 |
| 3 | The lines are voiced | **Passed, since AB-T-0614** (partly at 7984207). The voiced sample replays exactly from its baked track in Node, Chromium and WKWebView (final e68bfb9a96f255c5, mouths 58b2c9d48f735177, 1,951 steps), and a regeneration is one undo step. At 7984207 the creator's Mac app had no `tts.speak`, and lines were spoken through the loopback Kokoro server. Since AB-T-0614 it speaks through the shell's own: with no query and no server, a recast re-voiced 4 lines and a reworded line was spoken, each one undo step, and 5 takes on disk name the shell as their speaker (AppProbe 4 of 4; nobody listened to them) | AB-R-1090, AB-R-1098 |
| 4 | The cameras cover it | **Passed.** Cameras by rule cover both sample shorts (The Regular: 18 shots). A thumbnail per shot from snapshots is exact in all six matrix cells. In the Mac app a new short builds by rule with a thumbnail per shot, and a new camera on shot 030 is one undo step | AB-R-1091 |
| 5 | A performance can be acted | **Partly.** A puppet take, a director take and a face take each replay exactly from their logs in Node, Chromium and WKWebView (film 2fde5736d2e7edee, final e50ac8a7e928dc3f, 2,079 steps), and each is recorded, kept as one undo step and edited in the Mac app (AppProbe 8 of 8, with scripted keys, the demo model and a synthetic face). **Not run:** a face take from a real camera (AB-T-0557), and the rows a person makes at a real keyboard, model and camera | AB-R-1092 |
| 6 | It renders on WebGPU | **Passed.** The one-minute short, The Regular (1,457 frames), exports to the same frames in 9 of 9 WebGPU pairs in WKWebView, over the scheme and over loopback, at 1080p and 4K. Check Against Scrub draws 70 of 70 frames exactly as exported, in the Mac editor over both origins and in Chromium on both backends. WebGL is within SSIM 0.9929 of WebGPU on every shot at 1080p, unmasked. The matrix was green in all six cells (AB-R-1087) | AB-R-1093 |
| 7 | It exports for delivery | **Passed.** From the creator's render queue, every preset (H.264, HEVC, ProRes 4444 with alpha, at 1080p24 and 4K24) delivers twice the same: 29 of 29 pairs, 64 films. The files hold every frame at n/24 s, sound at lag 0, an `.srt` with all 13 lines, a still and a thumbnail per shot and a turntable per character. **The one-minute short at 4K takes 60 to 67 s as delivered** (redraw-checked), 32 to 37 s single draw, against 4 minutes | AB-R-1094 |
| 8 | The engine is on WebGPU everywhere | **Partly.** The playground, the editor and the creator pick WebGPU, fall back to WebGL without it, and obey the query switch (24 of 24 loads). Every check runs on both backends in Chromium and WKWebView, with the same simulation and exact frames per backend (AB-R-1087). The 20-character step on WebGPU is 2.19 ms. **Not met:** the companion still draws on WebGL only (AB-A-0329). **Not run:** the base-Mac budget (AB-T-0511). The four AppProbe rows that read the renderer readout in the Mac apps weren't run at the acceptance; they ran later that day and passed | AB-R-1097, AB-R-1099 |
| 9 | Agents can make a short | **Passed.** A Claude Code session with only the creator's 7 MCP tools (about 415 tokens) patched the script, recast a role, re-voiced a line, changed a shot's camera, rendered a frame and queued an export: 20 calls, none failed. The creator's Undo and Redo walked its four edits, each marked (MCP) (AppProbe 4 of 4) | AB-R-1095 |
| 10 | M0 to M3 still hold | **Passed.** `compare.mjs` gives 20 of 20 on each backend in Node, Chromium and WKWebView (AB-R-1087). `npm run check` passes (572 tests: 571 pass, and 1 is skipped for a git-ignored model this worktree lacks), as do the shell's 31 Swift tests. M2's and M3's Chromium checks pass on both backends. The M0 to M2 Mac scenarios pass, three of them only after their stale first step was fixed | AB-R-1096 |

**The matrix was not run again.** It ran green on a quiet machine at 8c79fef on 2026-11-24 (AB-R-1087, "AB-T-0595" below,
`results/ab-t-0595/verify-3/`). No file outside `acceptance/README.md` and `acceptance/results/` has changed since, so
that run stands for check 8's matrix, check 4's thumbnails and check 10's re-run on both backends.

**The quiet-machine runs** (the 4K time, every pair of exports, the scrub checks, takes, scripts, voicing) ran from 07:15
to 07:58 UTC, an hour after a reboot, on a machine nobody was using. The GPU's load was sampled every 5 s: no GPU-using process
but our own showed (`results/m4-acceptance/gpu-load.json`, `preflight.json`). Timings are from the Mac apps over
loopback, a fresh launch per preset (AB-L-0346).

### Not green

- **Check 3: the creator's Mac app had no shell voice. Done since (AB-T-0614, AB-R-1098).** At 7984207
  `apps/creator-mac` linked `apps/shell` without its voice product, so a recast or a re-voiced line in the Mac app
  needed `content/sample/tools/tts-server.py` beside it. It now links the speaking part of the voice product
  (`VoiceMethods.mlx(parts: [.tts])`: Kokoro alone, no microphone). `HAND-TEST-M4-MCP` passes 4 of 4 with no server
  and no query (the agent: 19 calls, none failed), and `HAND-TEST-M4-CREATOR` 15 of 15. Kokoro holds 2,506 MB in the
  app while loaded; the page asks the shell to unload it before each render queue job, and the app is at 78 MB a
  second after an export starts (`apps/creator-mac/docs/hand-test/results/ab-t-0614/`). The folder panel a person sees
  the first time a line is spoken wasn't driven: the hand tests name the models folder with `VRMXG_SHELL_MODELS`.
- **Check 5: no face take from a real face.** The face take is proven on `@vrmxg/takes`' synthetic session. The live
  check waits on the operator at a camera (AB-T-0557), as do the three checklist rows of `HAND-TEST-M4-TAKES.md` that
  have no steps.
- **Check 8: the companion.** `../vrmxa-companion` (b63b19a) still makes its host with `new RenderHost({ canvas })`,
  WebGL only. The ask to its area is open (AB-A-0329); nothing in this repository changes for it.
- **Check 8: the base-Mac budget** on either backend wasn't taken: there is no base M-series Mac here (AB-T-0511).
- **Check 8: four AppProbe rows weren't run. Run since, 4 of 4 (AB-R-1099).** `HAND-TEST-M4-BACKEND` reads the
  `#renderer` readout in the playground's and the editor's Mac apps, with no query and with WebGL forced: WebGPU and
  WebGL as asked, in both apps (`results/m4-acceptance/hand-tests/*-m4-backend*.md`). At the acceptance the screen had
  locked by then, and AppProbe can't read a window behind the lock. What stands in: the readout shows WebGPU in the screenshots of the scenarios that did run
  (`results/m4-acceptance/hand-tests/*.jpg`), the creator's Mac app delivered 8 pairs on WebGL with `renderer=webgl`,
  and the matrix's WKWebView cells force each backend by the same switch.
- **The beta's odd frame is still there** (AB-T-0591, AB-D-0279). In 26,844 frames drawn once on WebGPU (24 films) none
  was odd. In 26,844 frames drawn twice by the delivery's redraw check, one first draw was odd: frame 24 of the first
  film after a launch. The check outvoted it, and the film delivered is the canonical one (AB-D-0280).

### Found on the way

- **Three of the editor's Mac scenarios had gone stale.** M1 editor, M1 export and M2 acceptance waited for the editor
  to open `cafe.vrmxs` first. Since M3's content (2026-11-19) the sample's first scene is `cafe-cart.vrmxs`, so each
  failed on its first step and the rows after it fell with it (`hand-tests/*-as-it-stood.md`). The waits are fixed, as
  M2's timeline scenario already was, and the M1 export scenario now opens `cafe.vrmxs` itself. They then pass 7 of 7,
  6 of 6 (14 of 14 file checks) and 5 of 5 (10 of 10 file checks). The app was not at fault.
- **M3's split-screen cost check threw on WebGPU**: it called `gl.finish()` itself. It now waits through
  `host.finish()`. Two views cost 0.8 ms against 0.5 for one on WebGL, and 2.3 against 1.2 on WebGPU.
- **Check 1's re-script hash had moved** since W4 recorded it (7d761dd9…9180, 6,183 bytes): the script package changed
  after it (W7 keeps a hand-retimed line's length; AB-T-0588 keeps what the script generated with a hand group), and
  nobody had re-run the check. It isn't traced to one commit. All four runtimes agree, and the sample's hash is
  unchanged.
- **The creator has no Check Against Scrub of its own.** Check 6's scrub ran in the editor's Mac app on the short's
  sequence, which is the same host code, and in the built creator in Chromium. The editor's export of the short is
  frame for frame the creator's WebGPU delivery.
- **Music and sound effects on their buses** (check 3) are shown by `@vrmxg/voicing`'s tests only: neither sample
  short has a music track.

### The one-minute short's delivery times

The Regular at 24 fps, 1,457 frames, with 18 stills, 18 thumbnails and two turntables, in the creator's Mac app.

| Size | Backend | Draws | Film, s | Whole delivery, s | Films |
|---|---|---|---|---|---|
| 4K | WebGPU | twice (the preset's check) | 49.5–53.7 | 60.2–66.9 | 9 |
| 4K | WebGPU | once | 25.2–27.2 | 32.3–36.6 | 8 |
| 4K | WebGL | once | 23.1–23.4 | 29.5–31.8 | 2 |
| 1080p | WebGPU | twice | 19.8–20.5 | 28.9–30.5 | 3 |
| 1080p | WebGPU | once | 11.9–12.0 | 16.3–19.6 | 4 |
| 1080p | WebGL | once | 10.6–10.7 | 15.1–17.5 | 2 |

The frames per backend: 4K `d6857616bf5cc6a6` and 1080p `67110d3e140b32f2` on WebGPU, over loopback and over the
scheme; 4K `50d84453cb8356e4` and 1080p `97fbec1bd9a0af5f` on WebGL. At 4K with the check, the readback is 21 to 24 ms
of a 34 to 37 ms frame. The Order's digests are in `results/m4-acceptance/delivery/summary.json`.

### What ran

```sh
# the quiet-machine runs (each takes the GPU lock)
OUT=$PWD/acceptance/results/m4-acceptance/delivery   # for every delivery run below
SHORT=the-regular PRESETS="h264-4k24 hevc-4k24 prores-4k24" TAG=the-regular acceptance/m4/delivery-wkwebview.sh            # as delivered
SHORT=the-regular PRESETS="h264-4k24 hevc-4k24 prores-4k24" CHECK=off TAG=the-regular-single acceptance/m4/delivery-wkwebview.sh
SHORT=the-regular PRESETS=h264-1080p24 CHECK=off ORIGIN=scheme TAG=the-regular-single acceptance/m4/delivery-wkwebview.sh   # and loopback, and 4K over the scheme
RENDERER=webgl SHORT=the-regular PRESETS="h264-4k24" TAG=the-regular acceptance/m4/delivery-wkwebview.sh                    # and 1080p
acceptance/m4/delivery-wkwebview.sh; CHECK=off TAG=single acceptance/m4/delivery-wkwebview.sh; RENDERER=webgl acceptance/m4/delivery-wkwebview.sh
FILES=1 REPEAT=1 SHORT=the-regular TAG=the-regular-files acceptance/m4/delivery-wkwebview.sh   # each preset's files read with ffprobe
node acceptance/m4/delivery-summary.mjs acceptance/results/m4-acceptance/delivery
node acceptance/m4/short-scrub.mjs --renderer webgpu   # and webgl: the short twice and Check Against Scrub, in Chromium
node acceptance/m4/short-look.mjs <webgpu stills> <webgl stills>   # the 1080p deliveries' stills, shot by shot
node acceptance/m4/takes.mjs && acceptance/m4/takes-wkwebview.sh
node acceptance/m4/script-chromium.mjs && acceptance/m4/script-wkwebview.sh
node acceptance/m4/voicing.mjs && acceptance/m4/voicing-wkwebview.sh
# AppProbe, the launched app left in front (AB-T-0612): fixtures first, each under the GPU lock
appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M4-SHORT.scenario.md && node apps/editor-mac/scripts/check-short-exports.mjs
appprobe checklist scenario=apps/creator-mac/docs/hand-test/HAND-TEST-M4-CREATOR.scenario.md   # and M4-TAKES, M4-MCP with mcp-session.mjs
appprobe checklist scenario=apps/playground-mac/docs/hand-test/HAND-TEST-M0.scenario.md        # and the editor's M1 and M2 scenarios
# the rest
node acceptance/m4/backend-switch.mjs
node acceptance/m3/conversation-export.mjs --url <the built editor> --renderer webgpu   # and m2/editor-chromium, m3/dialogue, split, ragdoll, on both backends
(cd apps/shell && swift test) && npm run check
```

M4's acceptance added `acceptance/m4/short-scrub.mjs`, `short-look.mjs`, `delivery-files.mjs` and `backend-switch.mjs`,
`OUT` and `FILES` on `delivery-wkwebview.sh`, and the scenarios `HAND-TEST-M4-SHORT` (editor) and `HAND-TEST-M4-BACKEND`
(playground and editor). No engine or app code changed.

**Not run again from M0 to M3:** M3's live parts (the spoken conversation in the playground's Mac app, the camera, the
companion app) and the editor's MCP sessions of M1 to M3.

## M4 W3: the backend matrix (AB-T-0575)

Every rendering check runs on both backends, WebGPU and WebGL, in headless Chromium and in WKWebView over the custom
scheme and over loopback: 3 runtimes × 2 backends, 6 cells. One entry point runs the matrix and writes one results JSON
per cell.

```sh
(cd apps/playground && npx vite build) && (cd apps/editor && npx vite build)   # and spike-cinematics/mac/scripts/build.sh once
node acceptance/matrix.mjs                  # the whole matrix: results/m4-w3/<runtime>-<backend>.json and summary.json
node acceptance/matrix.mjs --runtimes chromium --backends webgpu --checks backends,post --loads 2   # a part: summary-partial.json
node acceptance/matrix.mjs --bless          # write acceptance/canonical.json from this run (every load must agree)
node acceptance/matrix.mjs --keep-going     # record a failure and carry on (diagnosis only: the run still fails)
```

**The checks** are the playground's and the editor's own check modes, so the same code runs in every cell:

| Check | Mode | Loads per cell | What one load must show | What its digest covers |
|---|---|---|---|---|
| acceptance | playground `?mode=acceptance` | 1 | M0–M3's exit checks; scored by `compare.mjs` per backend against the one Node run | every check's simulation final (backend-independent: the same in all six cells and Node) |
| backends | `?mode=backends` | 3 | five distinct offline frames and a still at 1280×720 | each frame and the still (and on WebGL the `gl.readPixels` hashes) |
| frames | `?mode=frames` | 2 | particles as headless and restored, the film exported twice the same, stills, readback at every size, alpha | particles, both films, sound, still, readback per size, alpha; the film frame by frame (`canonical.json`) |
| post | `?mode=post` | 2 | every look at 1080p (a new pipeline's first frame = its next), two exports the same | every look (first and again) and both exports' frames |
| coverage | `?mode=coverage` | 2 | a thumbnail per shot, the same from snapshots in either order | the sequence and every thumbnail |
| budget | `?mode=budget` | 1 (Chromium, WKWebView loopback) | 20 characters, each step drawn at 1080p; the step under 5 ms (mean) | none (timings) |
| editor | editor `?mode=check-export` | 2 | the film exported, then 26 frames scrubbed to from snapshots and drawn forward: all equal to the export | the export's digest, sound and the checked frames |

Every cell asks for its backend explicitly (`&renderer=webgpu|webgl`). The budget runs where timings mean something: the
scheme origin's timer resolves 1 ms (AB-L-0346), and each WKWebView load is a fresh web view.

### Exactness (AB-D-0278, AB-T-0589)

- **The GPU lock.** Exact frames only hold on a quiet GPU: on macOS 27.3 beta, Metal draws a rare odd MSAA frame while
  another process loads the GPU (AB-T-0589). [`gpu-lock.mjs`](gpu-lock.mjs) is a machine-level lock: `mkdir
  /tmp/vrmxg-gpu.lock` (atomic) with `owner.json` (pid, who, since). A lock whose pid is gone is stale and is taken over;
  one without `owner.json` is stale after a minute. **Every runner that draws for a result takes it, from any repository
  or session:**
  ```sh
  node acceptance/gpu-lock.mjs run --who my-runner -- <command> [args…]   # hold it while a command runs
  node acceptance/gpu-lock.mjs status                                     # who holds it
  ```
  or `import { acquireGpuLock } from '…/acceptance/gpu-lock.mjs'; const release = await acquireGpuLock({ who });`. A
  child of a holder (`VRMXG_GPU_LOCK_HELD` names the holder's pid) doesn't take it again, so a locked runner can call
  other locked runners (`node acceptance/gpu-lock.mjs held` exits 0 when `VRMXG_GPU_LOCK_HELD` names the live owner;
  the shell runners check that before re-running themselves under the lock). Taking over a stale lock is serialised by
  `<lock>.takeover`, and a taker reads `owner.json` back, so two waiters that saw the same dead owner can't both hold it
  (`acceptance/test/gpu-lock.test.mjs`). The matrix takes it per cell, starting its Chromium only once it holds it, and
  again for the SSIM step. Every runner here that draws takes it too: `acceptance/chromium.mjs`, `wkwebview.sh`, `m2/`,
  `m3/`, and `apps/playground/scripts/` (`chromium-check.mjs`, every `*-chromium.mjs`, and every `*-wkwebview.sh`).
  `VRMXG_GPU_LOCK` moves the directory.
- **A quiet GPU before each cell.** With the lock held and nothing of the matrix's running, it waits for three samples in
  a row (5 s apart) with the GPU's utilisation ≤ 30 % and no GPU-using process at ≥ 5 % CPU. It waits up to
  `--quiet-wait` minutes (20), then stops; `--allow-load` carries on, records the cell in `notQuiet`, and the run can't
  pass. Each cell's JSON has its `preflight`. (On 2026-11-23 the person's own Chrome, with a busy "Google Chrome Helper
  (Aperitif)", held the GPU at ~65 % with nothing else running; gpu-load.mjs didn't know that helper's name until then.)
- **The GPU's load in every result.** Each load records `gpuLoad` (`apps/playground/scripts/gpu-load.mjs`, sampled
  every 3 s): the GPU's utilisation (min, median, max) and every GPU-using process seen (WebKit, Chrome for Testing, the
  person's own browsers with every helper, python, MLX, the harnesses, the native Metal repro, other apps' busy GPU
  helpers), names only. Utilisation counts our own drawing
  too (a quiet post load in Chromium sits at a median 30–55 %), so it is recorded, not judged. A load ran **under load**
  when another GPU-using process was at ≥ 5 % CPU: anything but our own runtime's processes (Chromium in a Chromium
  cell; WebKit and the harness this runner started in a WKWebView cell, so a busy Safari would pass unseen: close it).
- **Every load must match the canonical digest** for its backend and runtime ([`canonical.json`](canonical.json)). Every
  entry is written by `--bless`, and only for a check in which every load passed and agreed; each entry records its own
  `made` (time, commit, whether the tree was dirty, loads, runtime and backend). Outside `--bless`, a check with no
  canonical entry is **unpinned**: its first passing load is the reference for that run, it is listed in the summary's
  `unpinned`, and the matrix can't pass.
- **A load that isn't clean is rerun once** (a clean load passes every verdict and matches the canonical digest). The
  failed load is logged in its cell's JSON (`incidents` or `failure`): the items that differ, its verdicts, its GPU load,
  and the frames that differ from the canonical frame hashes (the film checks every frame against `canonical.json` in the
  page and keeps the odd frames' images). The rerun keeps the same frames, and the runner compares the two images: the
  16 × 9 tiles that differ, how many pixels, the largest difference and the first 32 pixels. Images go to
  `results/m4-w3/odd/` (git-ignored). Then ([`classify.mjs`](classify.mjs), tested in `test/classify.test.mjs`):
  - **A functional verdict failed** (an error, a time-out, the wrong backend or a silent fall-back to WebGL, frames that
    repeat, a flat frame, the scrub, the budget): a **failure**, whatever the rerun did.
  - **Only pixels differed** (the digest, or the verdicts that compare a load's own frames with each other: the film's two
    exports, the post exports, a look's first frame and its next, a restored or reused host's frames), the rerun is clean
    and the failed load ran under load: **AB-T-0589** (the beta's Metal issue), one incident per load in the summary's
    `incidents`; that load counts.
  - Otherwise (the rerun isn't clean, or the GPU was quiet): a **failure**. The matrix stops there (`--keep-going` records
    it and carries on) and exits 1. A quiet-GPU odd frame whose rerun matches is a failure, not AB-T-0589, by decision
    **AB-D-0279** (the operator, 2026-11-23), even though repro 5 shows the beta's issue on a quiet GPU too; the re-test
    on the macOS release build is AB-T-0591.

### The look between backends: SSIM ≥ 0.98 at 1080p, translucency aside

The post check draws every look on the same frame of the recorded walk (step 420) at 1920×1080 on each backend; the
matrix compares each look's WebGPU frame with its WebGL frame (`apps/playground/scripts/post-compare.mjs`: SSIM on
luma, 8×8 windows every 4 px).
- **What is masked:** the pixels where translucency shows. The post check draws the frame twice with no post, once as it
  is and once with every visible object whose material blends (`transparent`, or blending other than normal or none;
  alpha cut-outs are opaque) hidden. The pixels that differ are the mask: translucent surfaces in view (not those hidden
  behind opaque ones) and the shadows they cast. Each backend makes its own mask; their union is left out, and every 8×8
  window that touches it is dropped from the SSIM. A mask over 1 % of the frame is an error (a broken mask mustn't hide
  the look). On the walk's frame that is the VRoid characters' eye iris and
  highlight, eyebrows, eyelashes and eyeliner (blended face materials), 0.017 % of the frame. Mask previews:
  `results/m4-w3/mask-*.png`.
- **Why:** translucency blends in linear light on WebGPU, which is three's design and the physically correct blend, and
  in sRGB on WebGL where no post runs (AB-D-0273, M4 decision 4). Translucent pixels differ by design.
- **Grain** is per-pixel noise each backend's stack draws differently, so the `anime` look (grain 0.18) is judged at ¼ size
  (4×4 means), where noise averages out and the look doesn't. Every other look is judged at full size.

### Result (2026-11-23, M5 Max, macOS 27.3 beta 26C5047e, Chrome for Testing 156.0.8078.4 headless on Metal)

Two full runs at 73d48dd with a clean tree, on a quiet GPU (every cell's pre-flight passed). First a bless pass
(`--bless --keep-going`), which wrote every entry of `canonical.json`, each with its own `made`. Then a verify pass
against it (`--keep-going`). The verify pass's files are `results/m4-w3/`, and the bless pass's summary is
`results/m4-w3/bless/summary.json`. Receipts: AB-R-1070 (the matrix), AB-R-1071 (the look), AB-R-1072 (the budget),
AB-R-1073 (repro 5 on this beta). **The verify summary has `ok: false`**, for the two reasons under "Not green".

| Cell | acceptance | backends (3 loads) | frames (2) | post (2) | coverage (2) | budget | editor (2) |
|---|---|---|---|---|---|---|---|
| Chromium, WebGPU | ✔ | ✔ `d34ebf75` | ✔ `31fd2949` | ✔ `c6a9dc4b` | ✔ `a1fb8342` | ✔ | ✖ scrub 24/26, unpinned |
| Chromium, WebGL | ✔ | ✔ `4c6c9ea7` | ✔ `70a6468d` | ✔ `321c6f7b` | ✔ `a99d0123` | ✔ | ✔ `59bbb42b` |
| WKWebView scheme, WebGPU | ✔ | ✔ `72ee1422` | ✔ `48000a47` | ✔ `8defe4bd` | ✔ `de0ac1cd` | — | ✖ scrub 24/26, unpinned |
| WKWebView scheme, WebGL | ✔ | ✔ `1cd4c92e` | ✔ `0911935a` | ✔ `2327291e` | ✔ `104c9bf9` | — | ✔ `b6f43f98` |
| WKWebView loopback, WebGPU | ✔ | ✔ `72ee1422` | ✖ one quiet odd frame | ✔ `8defe4bd` | ✔ `de0ac1cd` | ✔ | ✖ scrub 24/26, unpinned |
| WKWebView loopback, WebGL | ✔ | ✔ `1cd4c92e` | ✔ `0911935a` | ✔ `2327291e` | ✔ `104c9bf9` | ✔ | ✔ `b6f43f98` |

- **Every other load matched its canonical digest.** The bless pass gave the same digests as two earlier full runs, and
  scheme and loopback give the same digests on both backends. No load was AB-T-0589 (0 incidents).
- **The simulation doesn't depend on the renderer.** `compare.mjs` passes 20 of 20 on each backend against the one Node
  run, and every check's final is the same in all six cells and Node (simulation `fe69bad3406ab5f6`).
- **The films** digest to `af463f8e404b4e2b` (Chromium) and `aa30672928beb2b1` (WebKit) on WebGPU, W2's values. On WebGL
  they digest to `46a23bf918eb4da7` and `64caa818cf9d37ef`. W2's file (recorded before W1's merge) has `4c2265c8` and
  `696295fc`; what moved them since isn't traced. Particles' final is `09ef4d21b00189d1` everywhere.
- **The look:** every look's masked SSIM is 0.994–0.997 in all three runtimes. The anime look with grain is 0.961 at
  full size and 0.993 at ¼. The mask is 0.017 % of the frame.
- **The budget** (20 characters, the cafe plus 18 wanderers, each step drawn at 1080p):

  | Runtime | Backend | Step ms (mean, p95) | Draw, CPU ms (mean) | Frame with the GPU's work, ms (mean, p95, max) |
  |---|---|---|---|---|
  | WKWebView loopback | WebGPU | 2.12, 2.38 | 6.77 | 13.04, 16.46, 20.34 |
  | WKWebView loopback | WebGL | 1.68, 1.96 | 2.55 | 4.23, 4.90, 5.62 |
  | Chromium | WebGPU | 2.19, 2.5 | 5.73 | 11.82, 12.5, 13.5 |
  | Chromium | WebGL | 1.97, 2.3 | 3.02 | 4.99, 5.4, 6.0 |

  The step stays under M0's 5 ms on both backends (a verdict now). WebGPU's draw costs more than twice WebGL's CPU time
  in both engines. Its frame time includes `onSubmittedWorkDone`'s own round trip, so it overstates the GPU time. A base
  M-series Mac is still unmeasured (AB-T-0511).
- **Not green:**
  - **The editor's Check Against Scrub on WebGPU:** 24 of 26 in all three runtimes, on every load and rerun (frames 735
    and 869). Their world hash matches, and drawing forward matches the export. It happens only with the TSL post stack
    on and on frames with the espresso's steam (`apps/editor/README.md`). It's a functional failure, never blessed, so
    the check is unpinned. WebGL gives 26 of 26, and the export itself is exact on WebGPU. Fixed and pinned by AB-T-0590
    (below).
  - **One quiet odd frame:** WKWebView over loopback on WebGPU, load 1, the film's second export, **frame 656**. It
    differed in tiles 89–90 (x 1080–1320, y 600–720): 630 pixels, by at most 8 levels, on the espresso machine's base
    (`results/m4-w3/odd-frame656.png`: the failed frame, the rerun's and their difference ×30, at 2×). The rerun was
    clean. The GPU was quiet: the pre-flight passed at 0 %, and no other GPU-using process was over 5 % CPU (Microsoft
    Edge was open at under 3 %). By decision AB-D-0279 that is a failure, not AB-T-0589. It fits the beta's Metal issue:
    it's the same mesh, and repro 5 re-run quietly on this beta (26C5047e) gave 1 odd MSAA draw in 19,999. The re-test
    on the macOS release build is AB-T-0591.
- **Earlier runs, for the record:**
  - Two earlier full runs gave the same digests.
  - Their "quiet" odd film frames (frame 670 in WKWebView, one in Chromium) ran while the operator's Chrome held the GPU
    at about 65 %. Its "Google Chrome Helper (Aperitif)" wasn't in gpu-load.mjs's list then.

### AB-T-0590: the editor's scrub on WebGPU fixed and pinned (2026-11-23, same machine and beta)

- **The cause:** three.quarks' WebGPU materials decode a particle's colour (sRGB to linear) only when compiled for an
  sRGB output. r187 keeps the first compile for every later draw: its cache key has no colour space. An export draws
  frame 0 without its look (AB-T-0595), so the steam was compiled decoded and kept that inside the TSL scene pass. The
  scrub compiled it inside the pass, undecoded.
- **The fix:** `@vrmxg/particles/webgpu` decodes per draw, with a uniform that follows `renderer.outputColorSpace`
  (`engine/packages/particles/README.md`).
- **The check's warm-up:** Check Against Scrub also draws one throwaway frame on its fresh host first. Under GPU load, a
  fresh WebGPU host's first post frame could differ: frame 1079, the scrub's first row, in 7 of 8 loads. The cause is
  AB-T-0596.
- **The bless:** one runtime at a time (`--bless --runtimes <r> --backends webgpu`) for every WebGPU digest check, at
  f7d971f (main 171b262 with the fix), clean tree, quiet GPU. Every load agreed.
- **The verify pass:** the whole matrix but the budget (`--checks editor,acceptance,backends,frames,post,coverage`),
  same commit, quiet GPU.
- **Results:** **`ok: true`**. Every load matched its canonical digest with no rerun, and there were 0 AB-T-0589
  incidents. `compare.mjs` gives 20/20 on each backend, the simulation is `fe69bad3406ab5f6` in all six cells, and every
  look's masked SSIM is ≥ 0.98. Files: `results/ab-t-0590/` (`verify/`, and `bless/` for the WebGPU cells).
- **What moved:**
  - The editor check on WebGPU is pinned: 26 of 26 on every load. Chromium `c069a63f`; WKWebView `db9d4ace` over the
    scheme and over loopback.
  - The `frames` check's film on WebGPU moved in exactly frames 701–869, the espresso steam's life (its event fires at
    699). Chromium `31fd2949` → `189535cb`; WKWebView `48000a47` → `053b9501`.
  - Nothing else moved: acceptance, backends, post and coverage are the same entries on both backends, and WebGL is
    unchanged.

### AB-T-0595: frame 0 of every film re-blessed (2026-11-23, same machine and beta)

- **The cause:** a film's frame 0 maps to step 0 at α 0, and at step 0 nothing has run. Every film opened on a T-posed
  character seen from the set's own camera, with no post stack (`results/ab-t-0595/frame0-before.png`, `frame0-after.png`).
- **The fix:** `RenderHost.frameAt` draws step 1 as simulated for any blend that would reach back to step 0
  (`engine/packages/render/README.md`). No step's hash changes: the simulation is `fe69bad3406ab5f6` in all six cells
  and Node, as before.
- **The warm-up:** frame 0 is now the first thing a fresh host draws, and on WebGPU that first draw differed from
  export to export (four hashes in four exports in Chromium, one tile, the espresso machine: AB-T-0596). `exportTake`
  now draws and reads frame 0 once and throws it away on WebGPU (`warm`), and the editor check's forward pass does the
  same. With it frame 0 is the same in every export measured.
- **The bless:** `--bless --keep-going --checks frames,editor`, clean tree. Five cells at 1ac8f24 (before main's W9
  merge), Chromium on WebGPU at 1e3f921 (after it), second try. In every blessed check both loads agreed.
- **What moved: frame 0 and nothing else.** In each cell exactly one of the film's 1080 frame hashes changed, index 0.
  The scheme and loopback cells agree on both backends.

  | Cell | Frame 0 | `frames` digest | `editor` digest |
  |---|---|---|---|
  | Chromium, WebGPU | `6784a9d1` → `59d79e2b` | `189535cb` → `d6784fc3` | `c069a63f` → `8d9ab549` |
  | Chromium, WebGL | `da834908` → `dd425a58` | `70a6468d` → `28e30891` | `59bbb42b` → `582bf85a` |
  | WKWebView (both origins), WebGPU | `a9fc143d` → `1d3e3ff5` | `053b9501` → `04966d26` | `db9d4ace` → `540ef404` |
  | WKWebView (both origins), WebGL | `74e40e78` → `f36199f7` | `0911935a` → `86c02b57` | `b6f43f98` → `500f6ed8` |

  The films' digests moved with it: WebGPU `a68717ef` → `50d39224` (Chromium) and `099f33bd` → `92ac29aa` (WebKit);
  WebGL `46a23bf9` → `38a9f72f` and `64caa818` → `6124f814`. The acceptance, backends, post and coverage entries are
  untouched.
- **The verify: not green.** Three runs of the whole matrix at 177cb59 (main's W9 merged in), each cell's pre-flight
  quiet. The first stopped at its first failure; the other two ran with `--keep-going`
  (`results/ab-t-0595/verify/` and `verify-2/`).
  - **What passed in both full runs:** every WebGL check in every load; acceptance, backends, post and coverage in all
    six cells; the budget in its four; `compare.mjs` 20/20 on each backend; every look's masked SSIM ≥ 0.98; nothing
    unpinned.
  - **What failed:** odd frames in WebGPU films, which a quiet pre-flight makes a failure (AB-D-0279). Run 2:
    WKWebView scheme, film frames 636 and 606, and the editor's export in one load. Run 3: Chromium, film frames 1079,
    783 and 693; WKWebView loopback, film frame 578; the editor's export in one load of each WKWebView WebGPU cell.
    Frame 636 differed from its own clean redraw in 39 pixels of one tile, by at most 3 levels. None was frame 0.
  - **Every WebGPU `frames` and `editor` check did match canonical in clean loads** in one run or the other, so the
    blessed digests stand. No single run was free of odd frames.
  - **Why, as far as it is known:** this is the odd WebGPU frame of AB-T-0589 and AB-T-0591. The operator was working
    on the machine during the runs (WindowServer at about 46 % CPU when looked at, which the pre-flight doesn't
    count), and in single-cell reruns another session's headless Chrome showed in the load samples. Whether these
    changes also raised the rate can't be told from these runs: the odd frames are of the same kind, and several in
    the same shot (the espresso machine, frames 600 to 870), as the ones recorded before them.
  - **Owed then:** one green run on a machine nobody is using.
- **The green run (2026-11-24, 06:22 to 06:41 UTC):** the whole matrix with `--keep-going` on main at 8c79fef (these
  changes merged), clean tree, fresh builds of the playground, the editor and the harness, seven minutes after a
  reboot with nothing else open, same machine and beta (26C5047e). **`ok: true`:** every load of every check in all
  six cells matched its canonical digest with no rerun, 0 failures, 0 AB-T-0589 incidents; `compare.mjs` 20/20 on each
  backend; the simulation `fe69bad3406ab5f6` in all six cells; the looks' SSIM verdict passes. Files:
  `results/ab-t-0595/verify-3/`.
  - **What it settles:** the blessed digests hold on a quiet machine, and the odd frames in the two runs above came
    with the machine in use.
  - **What it doesn't:** it is one run. It shows no sign that the warm-up draw raised the odd-frame rate, as main's
    run before these changes showed none (AB-T-0590), but a rate that small needs many runs to compare. The beta's odd
    frame itself is still AB-T-0591's.

## M4's checks as they land

- **Check 1, scripts** (W4, AB-T-0576): the same script gives the same sequence, byte for byte, in every runtime.
  `acceptance/m4/script-scenario.js` builds the sample script (`content/sample/scripts/cafe-order.fountain`) over the
  cafe, and re-scripts a small script after hand edits (a gesture moved, a smile keyed bigger, a look turned to the
  camera, a track deleted; then a line added above and words changed). Each runtime hashes the canonical `.vrmxs` text:
  ```sh
  node acceptance/m4/script-chromium.mjs     # Node and headless Chromium over loopback: results/m4-script.json
  acceptance/m4/script-wkwebview.sh          # WKWebView, scheme and loopback: results/m4-script-wkwebview.json
  ```
  Node, Chromium, WKWebView scheme and loopback all give sample 58cebece…f902 (11,207 bytes) and re-script
  490c1711…c991 (6,255 bytes) at the M4 commit (7d761dd9…9180, 6,183 bytes, when W4 recorded it: the script package
  has changed since, see "Found on the way" above). The package's tests hold the sample's hash too
  (`engine/packages/script/test/golden.json`).

- **Check 3, the lines are voiced** (W7, AB-T-0579): every line of the sample script's sequence
  (`sequences/cafe-order.vrmxs`) is baked into its dialogue track in its character's voice: Hana in `af_heart`, Mira in
  `af_bella`, through `content/sample/tools/bake-lines.mjs --fit` (`@vrmxg/voicing`, Kokoro through the loopback
  stand-in). Three lines were lengthened to their speech and re-scripted, so nobody talks over anybody. The sequence
  then replays from the baked track, with no renderer, for 1,951 steps. It checks:
  - each step's world hashes and both mouths' weights;
  - the line each character starts;
  - a snapshot taken mid-line, restored into a fresh world;
  - no line's speech running into another's.

  Regenerating one line or one character is one undo step: `engine/packages/voicing/test/voicing.test.mjs`.
  ```sh
  (cd apps/playground && npx vite build) && node acceptance/m4/voicing.mjs   # Node and headless Chromium: results/m4-voicing.json
  acceptance/m4/voicing-wkwebview.sh                                         # WKWebView, scheme and loopback: results/m4-voicing-wkwebview.json
  ```
  Node, Chromium and WKWebView (scheme and loopback, two loads each) all give final e68bfb9a96f255c5 and mouths
  58b2c9d48f735177, and the mid-line restore ends the same (AB-R-1077; Kokoro's audio isn't byte-reproducible, AB-L-0375).

- **Check 5, a performance can be acted** (W9, AB-T-0581): a take is a log, and it replays exactly from it. The sample
  has three take logs over "The Regular" (`content/sample/performances/the-regular/`, recorded in Node by
  `tools/make-takes.mjs` with the real recorder: a puppet take of Mira from scripted keys, a director take of Hana
  answered by a scripted model, a face take of Mira from a synthetic face session). `apps/playground/src/takes-check.js`
  makes each log into tracks (`@vrmxg/takes`' pure function), keeps all three in the film, and plays it with no
  renderer for 2,079 steps. It checks:
  - each take's tracks and the film's canonical text, hashed;
  - each step's world hashes (90 components);
  - a snapshot taken while Mira walks, restored into a fresh world;
  - that the takes do what was performed: Mira walks from her mark, hops and turns her eyes; Hana says the two
    directed lines on their frames and walks over to her; Mira's face blinks, smiles, talks and turns.

  Each kind recorded live, kept as one undo step and edited: `engine/packages/takes/test/`, `apps/creator/test/takes.test.mjs`
  and the Mac app's `apps/creator-mac/docs/HAND-TEST-M4-TAKES.md`.
  ```sh
  (cd apps/playground && npx vite build) && node acceptance/m4/takes.mjs   # Node and headless Chromium: results/m4-takes.json
  acceptance/m4/takes-wkwebview.sh                                         # WKWebView, scheme and loopback: results/m4-takes-wkwebview.json
  ```
  Node, Chromium and WKWebView (scheme and loopback, two loads each) all give the same tracks from each log, film
  2fde5736d2e7edee (43,177 bytes), final e50ac8a7e928dc3f and the same per-step run, and the restore ends the
  same (AB-R-1086 has the numbers as first recorded: film 7314d57e8b7a5b5c, final 42bc50c5a9e11f0f. The Regular's
  cameras after the window-table move changed with AB-T-0597, so the three logs were recorded again on purpose
  on 2026-11-23: only the film's hash in each log changed, and each log gives the same tracks as before). The face take's source is the spike's verdict (`spike-face/README.md`, AB-R-1085, AB-D-0281); a
  real camera waits on AB-T-0557.

- **Check 7, delivery** (W10, AB-T-0582): the creator's render queue renders each delivery preset (H.264, HEVC and
  ProRes 4444 with alpha, at 1080p24 and 4K24) in the Mac app (WKWebView on the shell, AVAssetWriter): the film with
  its sound and `.srt`, a still and a thumbnail per shot, a turntable per character and `delivery.json`, into the
  project's `deliveries/`. Each preset is rendered twice in one app run, and the runs must agree on the film's frames
  (the shell hashes each frame before encoding), its sound, every still and thumbnail, and the turntables' frames:
  ```sh
  apps/creator-mac/scripts/build.sh && acceptance/m4/delivery-wkwebview.sh    # every preset, WebGPU, loopback: results/m4-delivery/
  RENDERER=webgl acceptance/m4/delivery-wkwebview.sh                          # the same on WebGL
  SHORT=the-regular PRESETS=prores-4k24 acceptance/m4/delivery-wkwebview.sh   # the one-minute sample short
  node acceptance/m4/delivery-summary.mjs                                     # results/m4-delivery/summary.json
  ```
  Measured 2026-11-23 on the M5 Max (macOS 27.3 beta 26C5047e): 56 films in 24 pairs of runs: sound, stills, thumbnails
  and turntables agree in all 24, and the films' frames in 22. Both odd pairs are WebGPU, on a quiet GPU, and in the
  first export after the app launched (one frame, frame 66 of the-regular, in the one with per-frame hashes): the
  odd-frame case AB-D-0279 counts as a failure, rerun clean. WebGL's 16 films never differed. The frame digests per
  backend: cafe-order 1080p `2b22bd5a4a461080` / 4K `8ef069d9fe5648e7` (WebGPU), `48e228afa392d691` / `bd329ec3c8922ca0`
  (WebGL); the-regular 4K `459255e681a6087d` (WebGPU), `198615bc571ad04e` (WebGL, the same whether the view or only the
  export is on WebGL). The one-minute short at 4K: the film in 26–27 s, the whole delivery in 34–37 s, against the
  4-minute target. The redraw check (each frame drawn twice) costs 1.98× a frame at 4K, and the one-minute 4K delivery
  takes 66 s with it. It found no odd draw in these 4,593 frames, and in the creator's hand test it outvoted one (frame
  58, the first draw) and delivered the canonical film (AB-R-1081 timing, AB-R-1082 identity). Since AB-D-0280 a
  delivery preset drawn on WebGPU checks by default, until AB-T-0591's release-OS re-test; these results were taken
  before that, with the check off unless `CHECK=redraw` (`delivery-wkwebview.sh` now takes `CHECK=off` for a
  single draw).

- **W2, particles and readback on WebGPU** (AB-T-0574): check 13 drawn on both backends, the morning film exported
  twice, stills and the readback's cost, in the playground's `?mode=frames` (`apps/playground/README.md`, "Particles and
  readback"). The WebGL acceptance re-run at W2 (`node.mjs`, `chromium.mjs`, `wkwebview.sh`, `compare.mjs`) passes 20 of
  20 in every runtime, and every final, every per-step run, the draw calls, triangles, debug counts, presets and post
  SSIM equal the committed M3 results (`results/m4-w2-rerun-summary.json`; the other result files are kept as M3 left
  them). One field moved: check 13's headless `batches` is 0, because since W2 the particles' batch renderer comes from a
  render host and nothing draws headless.

## Result: M3 is done (2026-11-19, M5 Max)

M3's ten exit checks ([M3-PLAN.md](../M3-PLAN.md) "What M3 is done looking like") were run at the M3 commit 37ca5e3 in
every runtime, in the playground's Mac app and in the companion app. Each is filed as a receipt:

| # | Check | Result | Receipt |
|---|---|---|---|
| 1 | A persona drives the character | Hana's VRMXA persona becomes a role profile that weights her utility, stored as app persona, and the director's prompt, layered in §11's order. Tools are filtered per character and moment: emotions she is allowed, gestures her set fills, targets she has seen. 15 bad-reply fixtures and 6 in-world faults are each rejected, and her tree carries on (AB-R-1010) | AB-R-1038 |
| 2 | You talk, she answers | In the playground's Mac app, the shell's voice goes from microphone and VAD through STT, the director and TTS with word timings, with lip sync. From end of speech to her first audio: median 1.26 s, max 1.43 s over 10 steady turns (AB-R-1037). She nods while you speak, looks away as she thinks and says a filler past 1.5 s. In a browser the same conversation works typed, through the loopback stand-in (AB-R-1022) | AB-R-1039 |
| 3 | Her decisions act in the world | An order she hears becomes her serving goal, and M2's server tree makes and brings it. A follower waits by the door when asked, then follows (`takes/follow.json`). Goal choice runs on salient events. Two directors share one model: the character spoken to goes first, and at most two requests are at the model (`director/test/queue.test.mjs`) | AB-R-1040 |
| 4 | It replays exactly | Check 17: the two-minute conversation replays with no model, identical at every step in every runtime, final 605004a4a0349dde. A save halfway continues to the same end (AB-R-1020) | AB-R-1041 |
| 5 | A conversation becomes a shot | The take baked into a sequence exports at 1080p24 with sound twice, to the same 2,929 frames, and 27 scrubs draw exactly the exported frames (AB-R-1021). Regenerating a line is one undo step. A take's aspect is fixed at 16:9 (AB-T-0538) | AB-R-1042 |
| 6 | She sees you | Native Vision in the shell, off until turned on; no frame leaves the device (AB-R-1029). She notices the viewer and looks, and answers a wave and a nod. The stimuli are logged by step and replay hash for hash, also from a snapshot. Live in the Mac app, wave and nod worked in low light; a re-test in good light is AB-T-0557 | AB-R-1043 |
| 7 | Bodies and play | Checks 18 to 20: a ragdoll fall down the stairs and a get-up, a cart driven and parked, and two-player split screen. Each is identical in every runtime, and its replay and mid-run snapshot are exact (AB-R-1028, 1030, 1031) | AB-R-1044 |
| 8 | The companion app starts | `../vrmxa-companion` v0 at 87ef3e2, on the shell and the engine's packages by path. She idles with variety (the three extras; after a stroll she faces the camera, within 4°), looks at you while attending, and holds a spoken conversation through the shell's voice and the director. After a quit and relaunch she says "Welcome back, Sam.", from memory encrypted at rest. At 20 fps idle she uses 19.6 % of a core and 2.9 % GPU, against 35.0 % and 8.2 % engaged (AB-R-1047). Hand test 7/9 scripted (the room checked by eye; the glance half of look-at not clear in a still), voice 4/4 | AB-R-1048 |
| 9 | Agents can direct a conversation | A Claude Code session with only the editor's MCP tools read Hana's director state, talked to her, injected a decision, played a conversation and edited her profile. The editor's Undo walked both edits back. 19 calls, none failed; 20 tools ≈ 1,857 tokens (AB-R-1027) | AB-R-1045 |
| 10 | M0, M1 and M2 still hold | `npm run check` is green. `compare.mjs` passes 20 of 20 in Node, Chromium and WKWebView scheme and loopback. Every final but the conversation's moved at 37ca5e3 when the default idle became three weighted variants | AB-R-1046 |

The acceptance found two things to fix, both fixed at 37ca5e3:
- check 2 asserted the idle clip by name, which no longer holds once the default set picks among variants;
- the conversation preset's option type lacked `face`.

## M3's checks as they landed

M3 added checks as its workstreams landed.
- **Check 17** (W4, AB-T-0543): a recorded conversation replays with no model. `takes/conversation.json`, made by
  `tools/make-conversation.mjs`, is two minutes of Mira talking with Hana (the host), with the director's split turn on
  a scripted model; its ai log holds 30 events, 12 of them decisions. Replayed from its input and log alone:
  - it hashes identically at every step in Node, Chromium and WKWebView (scheme and loopback), final 605004a4a0349dde;
  - a snapshot at step 3,600, restored with the log's later entries, plays to the same end;
  - checks 1–16 are unchanged, so 17 of 17 pass.
- **The baked conversation** (`node acceptance/m3/conversation-export.mjs`, `results/m3-conversation-export.json`):
  - the take baked into `sequences/conversation.vrmxs` (12 lines baked to audio with `tools/bake-lines.mjs`) exports
    in the editor at 1080p24 with sound twice, to the same 2,929 frames (digest e8cfde98e135a744, audio 3d65d16c);
  - jumping to 27 frames of its shot, lines and decisions from snapshots draws exactly the exported frames.

- **The dialogue UI** (W6, `node acceptance/m3/dialogue-chromium.mjs` against the playground's dev server,
  `results/m3-dialogue-chromium.json` and `m3-dialogue-*.png`):
  - a typed line to Hana (`?director=demo`) shows her "…" bubble, then her reply word by word over her head, with the
    caption;
  - a picked reply ("Could I get a latte, please?") sets her `takeOrder` goal;
  - the recorded conversation replayed for 3,000 steps with the bubbles and captions read every step hashes the same
    at every 300th step as with both off;
  - the bubbles are drawn in the canvas (`@vrmxg/text`, troika, the text spike's verdict AB-T-0536): a frame with
    Hana's bubble hashes the same drawn twice and on another load of the page.

- **Check 18** (W7, AB-T-0546): ragdolls. Mira and Hana stand on a landing 0.9 m up at the top of four steps outside the
  cafe (`apps/playground/src/stairs.js`: box colliders added to the sample scene, which itself is unchanged); both are
  knocked down the stairs at step 30 (45 N·s on the torso):
  - each falls as a ragdoll from the one humanoid mapping (eleven parts, sized from the skeleton, nothing per model),
    lies still, and gets up at the foot of the stairs, blending back into animation (Mira: down at step 244, up at 356;
    Hana: down at 144, up at 256);
  - it hashes identically at every step in Node, Chromium and WKWebView (scheme and loopback), final 2a28db30b92d6f78
    (09ba2116fa74e9f2 since W12: the stairs are a drawn model, `sets/stairs.glb`, and getting up plays the `getUp` clip;
    the same falls, to the step and the millimetre);
  - a snapshot 40 steps into the fall re-simulates to the same end;
  - checks 1–17 are unchanged, so 18 of 18 pass.
- **Check 19** (W8, AB-T-0547): vehicles. A two-seat cart (`items/cart.vrmxi`, a VRMXI `vehicle`: the section proposed in
  `VRMXI-vehicle-proposal.md`) stands on the pavement outside the cafe (`apps/playground/src/vehicle.js`):
  - Mira gets in with the interact key at step 31, drives a recorded route (along the pavement, a lane change, the
    brakes) and gets out at step 421 with the cart parked; it goes from x 4 to x −1.96 and 1.2 m across, at up to
    4.15 m/s; the camera chases it for 390 steps;
  - it hashes identically at every step in Node, Chromium and WKWebView (scheme and loopback), final 3eb1af557e12014c;
  - the input recording replays into a fresh world with the same hashes, and a snapshot mid-drive re-simulates to the
    end;
  - checks 1–18 are unchanged, so 19 of 19 pass.
- **Check 20** (W9, AB-T-0548): split screen. Two players on one keyboard and one gamepad (`apps/playground/src/split.js`,
  input's `twoPlayerActions`): Mira is player 1 on WASD and the mouse, Hana player 2 on the arrows and the gamepad, each
  with a follow camera of their own:
  - each walks relative to their own camera and they run apart (Mira 4.67 m left, Hana 4.67 m right); Hana jumps; the
    gamepad's right stick turns player 2's camera (−0.89 rad) and leaves player 1's alone;
  - it hashes identically at every step in Node, Chromium and WKWebView (scheme and loopback), final 85c5829125340355;
    the recording of both players (9 axes, 8 buttons) replays into a fresh world with the same hashes, and a snapshot
    re-simulates;
  - checks 1–19 are unchanged, so 20 of 20 pass.
- **Split screen's cost** (`node acceptance/m3/split-chromium.mjs` against the playground's dev server, `?split`,
  `results/m3-split-chromium.json` and `m3-split.png`). At 1920×1080 in Chromium, two views take 1.0 ms a frame against
  0.5 ms for one (the median of 40; a second run gave 0.8 against 0.5). That is 241 draw calls against 178: the shadow
  map is drawn once (M2's `renderViews`), where two full views would be about 356.
- **The fall seen** (`node acceptance/m3/ragdoll-chromium.mjs` against the playground's dev server, `?fall`):
  `results/m3-ragdoll-{tumbling,lying,rising,up}.png`, with the stairs in debug draw until W12 brings visible ones.

## Result: M2 is done (2026-11-18, M5 Max)

M2's ten exit checks ([M2-PLAN.md](../M2-PLAN.md) "What M2 is done looking like") were run at the M2 commit 2df012b in
every runtime and in the editor's Mac app. Each is filed as a receipt:

| # | Check | Result | Receipt |
|---|---|---|---|
| 1 | A sequence is authored in the editor | AppProbe in the Mac app (`apps/editor-mac/docs/HAND-TEST-M2-ACCEPTANCE.md`). "Morning at the cafe" opens with 5 shots on a 24 fps ruler and 13 tracks, one of every kind. An edit is one undo step, undo restores the document exactly, and save then reopen gives the same bytes and validates | AB-R-0994 |
| 2 | Scrubbing is exact | Check Against Scrub jumps to 26 frames, every shot, line and cue, from snapshots. All 26 equal the export's frames in Chromium, WKWebView scheme and loopback (digest 30245c02a5ca6afd) and the Mac app. A still between scrubs leaves the shot where it was (`editor-chromium.mjs` stillThenScrub) | AB-R-0995 |
| 3 | Cameras are cinematic | Check 10: CameraBrain blends are identical everywhere, with a snapshot mid-blend. The film's 8 camera changes are identical everywhere. The aspect the composer frames with is fixed per sequence world | AB-R-0996 |
| 4 | It looks like anime | Check 11: 4K against 1080p SSIM 0.9861 (0.9507 with grain); costs in every browser. Check 13: particles identical, with a snapshot mid-effect. Offline frames wait for the LUT grade | AB-R-0997 |
| 5 | It exports | The 45 s film from the Mac editor, to H.264 1080p24 twice and to ProRes 4444. Each has 1,080 frames at n/24 s, the sound at lag 0 (correlation 1) and an .srt with 4 lines. The frames are identical across the three files and equal to the scrubs. 6.9–7.5 s per export | AB-R-0998 |
| 6 | The cafe lives | Check 14: Hana serves Mira on the navmesh from behaviour trees, identical everywhere, with a snapshot mid-order (final 5cda8e0f430bba8f). The film's cast runs the same brains | AB-R-0999 |
| 7 | Bodies move better | G10 layers, foot IK and hand reach in the character tests. The items take with the sword held is identical everywhere (check 8). Emotes are snapshot state | AB-R-1000 |
| 8 | Save and load | Check 15: a load continues with the unbroken run's per-step hashes in every runtime. In the Mac editor a game saves through the shell and loads "the world as saved" | AB-R-1001 |
| 9 | Agents can direct | A Claude Code session used only the editor's MCP tools: it added a shot, a camera, expression keys, a line and a behaviour tree, rendered frame 1120 and read Hana's brain. The editor's Undo named both edits and walked them back to the saved bytes. 20 tools ≈ 1,773 tokens (21 ≈ 1,902 for the editor) | AB-R-1002 |
| 10 | M0 and M1 still hold | `compare.mjs` 16/16 in Node, Chromium and WKWebView scheme and loopback. The NPC run (check 14) and the sequence (checks 12 and 16) hash identically everywhere | AB-R-1003 |

The acceptance found six bugs, all fixed at 2df012b with tests:
- a closure timer for emotes, which snapshots can't hold;
- a camera lens that wasn't re-derived on restore;
- the interpolator's pair, which survived a restore;
- LUT loads that offline frames didn't wait for;
- the viewport's aspect leaking into a sequence world's simulation through a still;
- the shell's save handlers, which were released while captured unowned, a crash.

It also found two gaps, closed at the same commit: an agent couldn't read a track to edit it (`sequence {path}`), and the session could reach past the editor's tools. Lessons AB-L-0360 to 0363.

The editor's checks:

```sh
npm --prefix apps/editor run dev -- --port 5182 &   # then:
node acceptance/m2/editor-chromium.mjs       # export + Check Against Scrub + stillThenScrub: results/m2-editor-chromium.json
acceptance/m2/editor-wkwebview.sh            # the same in WKWebView (?mode=check-export): results/m2-editor-wkwebview-*.json
apps/editor-mac/scripts/hand-test-fixtures.sh   # then AppProbe: apps/editor-mac/docs/hand-test/HAND-TEST-M2-ACCEPTANCE.scenario.md
node apps/editor-mac/scripts/check-sequence-exports.mjs
node apps/editor-mac/scripts/mcp-session.mjs --m2   # with the film open in the Mac editor
```

## Result: M1 is done (2026-11-18, M5 Max)

M1's seven exit checks ([M1-PLAN.md](../M1-PLAN.md) "What M1 is done looking like"), run at the M1 commits b48351a (the
runtimes) and 0067c0a (the editor's Mac app), each filed as a receipt:

| # | Check | Result | Receipt |
|---|---|---|---|
| 1 | The editor builds a scene | AppProbe 7/7 in the Mac app: the cafe built from the asset list; inspector, tree, undo and redo; Save, reopen, same bytes, valid; Play / Stop | AB-R-0967 |
| 2 | Play in place, with items | The items take (`content/sample/input/play-items.json`, 1,668 steps) played in the editor: the prompts Take sword, Open cupboard and Switch off showed in turn, then the sword went into Mira's closet (held), the cupboard opened, she sat on a stool and the lights went off. Stop restored the scene's hash (`apps/editor-mac/docs/hand-test/shots/play-items/`) | AB-R-0968 |
| 3 | Hana talks | Her line starts as Mira passes. Mouth up to 1.0, lip sync +20 ms against the clip; she looks at Mira, blinks 6 times, and the caption shows. Identical everywhere (check 9) | AB-R-0969 |
| 4 | It sounds right | The take with sound hashes as the silent run; the doors and the switch are positional, ambience and music are on their buses, and Hana's voice is heard; the offline mix renders identically twice (check 7) | AB-R-0970 |
| 5 | Agents can drive it | A Claude Code session drove the open editor: 16 calls, none failed. Its edit was undone from the editor's Edit › Undo; 18 tools ≈ 1,446 tokens | AB-R-0971 |
| 6 | It exports a shot | H.264 1080p30 with sound: 300 frames, each at n/30 s, the sound at lag 0. Rendered frames are identical across exports, ProRes decodes identically. 1.9–2.1 s (4K60 7.8 s) | AB-R-0972 |
| 7 | M0 still holds | `compare.mjs` 9/9 in Node, Chromium and WKWebView scheme and loopback. Walk f2371e0ef65e9f16; items take f105d15ede18d945, with the snapshot after the equip identical | AB-R-0973 |

`compare.mjs` now has nine checks: M0's six, plus 7 (audio, on the items take), 8 (the items take everywhere, with
the snapshot across the equip) and 9 (Hana). Before running it, run
`VRMXG_LIPSYNC_OUT=$PWD/acceptance/results/lipsync.json node --test engine/packages/voice/test/` to record the lip-sync lag.

## Result: M0 is done (2026-11-17, M5 Max)

| # | Check | Result | Receipt |
|---|---|---|---|
| 1 | The cafe runs in the playground in WKWebView and Chromium | Chromium, WKWebView scheme and loopback: 600 rendered frames, set, player, NPC, door opened at step 130, both lights, all six presets, no console errors; the Mac wrapper passes its AppProbe scenario | AB-R-0946 |
| 2 | Walk, run, jump through the action map with slots, blend, root motion | idle/move/jump/fall/land; 1.4 → 4 m/s with run weight 1; travel root motion; 1.02 m jump; idle-sword because Mira wears the sword; keyboard, gamepad and mouse; identical everywhere | AB-R-0947 |
| 3 | Bit for bit everywhere, snapshot and restore | 600 steps × 43 components identical in Node, Chromium, WKWebView scheme and loopback (`a44f1d6333b4b6ce`); snapshot 300 → 600 identical; the rendered world equals the headless one | AB-R-0948 |
| 4 | 20 characters + physics < 5 ms in WKWebView loopback | 2.11 ms mean, p95 2.38 (M5 Max). A base M-series Mac is still to measure: AB-T-0511 | AB-R-0949 |
| 5 | MCP describes, inspects the running engine, edits with undo | A Claude Code session: describe, engine through the walk, hinge read live at 100.1°, add / set / undo, validate, save; 10 calls, none failed | AB-R-0950 |
| 6 | Debug draw: colliders, sensors, rays, capsules | 38 of 38 colliders (33 solid, 3 door triggers, 2 capsules) and the spring-arm ray, in every browser | AB-R-0951 |

**Re-run at M1 W2 (AB-R-0955).** The files in `results/` are now that re-run: the cafe's doors are VRMXI items, and all
six checks pass, with the same final hash `f0e803b406afaa51` in Node, Chromium and WKWebView over both origins (check 5's
MCP session is still the W9 one).

**Re-run at M1 W4 (AB-R-0958).** The cafe now has the specification's sword pickup on a table, and every runtime's
world installs interaction (`@vrmxg/interact`, AB-R-0956) and the closet (`@vrmxg/closet`, AB-R-0957). All six checks
pass with the final hash `868739057945df05` in Node, Chromium and WKWebView over both origins. The sword set now asks
for a sword in hand (`held:sword`): Mira's idle is the default (her own sword is stowed) until the device run walks her
to the table and takes the sword, which check 2 now requires (idle set default → sword, the same in every runtime).
Check 6 counts four reach sensors and two rays (the spring arm's, the interaction focus's). Rebuild the playground
before the browser runs: a stale `dist/` diverges at step 0.

**Re-run at M1 W5 and W6 (AB-R-0960, AB-R-0961).** The cafe now has sound (door, switch, room tone, music on their buses), a light switch by the
counter, and Hana greets Mira when she comes close (a voice line, lip-synced, captioned). All checks pass with the final
hash `b5711aac29b64f2d` in Node, Chromium and WKWebView over both origins, and a seventh: the walk heard through a Web
Audio output hashes exactly as the silent run, and its recording mixed offline twice is the same samples (each runtime
its own mix hash). Found on the way: the `ready` signal every node declares was never emitted, so the cafe's
`door-1.ready → hana-1.lookAt` connection had never run; it does now.

Found on the way and fixed: travel root motion could never turn a walk into a run (the blend read the speed root motion
had already clamped); the sample's sword set named a tag Mira doesn't wear. Known gaps: the WKWebView harness's canvas
readback comes back blank for the playground page (the wrapper's window captures are the visual record:
`results/wkwebview-wrapper-*.png`), and the base-Mac budget (AB-T-0511).
