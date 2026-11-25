# The sample game on the Mac (M5 W10, AB-T-0620)

M5's exit check 7 and 10's Mac half for the sample game, "The Morning Rush" (`content/sample/game`, design AB-D-0293):
exported with `vrmxg-export --game game/game.json`, wrapped by `apps/game-mac`, played from its title menu to each
ending. Build it and its fixtures:

```sh
node engine/packages/bundle/src/cli.js content/sample apps/game-mac/build/rush --game game/game.json
apps/game-mac/scripts/build.sh apps/game-mac/build/rush          # apps/game-mac/build/morning-rush.app
apps/game-mac/scripts/hand-test-fixtures-rush.sh                 # after one launch: the container must exist
node acceptance/gpu-lock.mjs run --who rush-mac -- appprobe checklist scenario=apps/game-mac/docs/hand-test/HAND-TEST-M5-RUSH.scenario.md
```

The lost ending is reached by playing and waiting out the four-minute clock. AppProbe can't hold a key down, so it can't
walk Mira to a table; the won ending is reached from Slot 1, a save the fixtures script takes from the recorded win session
(Mira at the open till, every regular served), and one press of E. The whole win, played, is the recorded session in
`acceptance/results/m5-rush/win.json` (`acceptance/m5/rush.mjs`), which the game app replays in WKWebView
(`acceptance/m5/rush-wkwebview.sh`) and in this app for the frame-rate run (`acceptance/m5/rush-frames.sh`).

- [x] The sample game's title menu, on WebGPU, with a save in Slot 1.
- [x] New Game plays the title scene, then the level; Hana's briefing is answered from the keyboard; the HUD shows the goal and the clock.
- [x] Left alone, the clock runs out: the game is lost, the lost ending says so, and the title comes back as a new game.
- [x] From the title menu, Load Game → Slot 1 (at the till, everyone served) and E close the till: the game is won, the won ending says so, and the title comes back.

## Results

AppProbe, 2026-11-25, on the final build (digest 3dd9f1f3, runtime vrmxg-game 0.1.0+20e43b594e25), Release shell:
**4 of 4** ([`hand-test/results/m5-rush/report.md`](hand-test/results/m5-rush/report.md)). Row 3 waited out the
level's four minutes with the briefing answered and nobody served: "Ten o'clock, and the till is still open…", then the
title. Row 4 loaded Slot 1 (the fixture: the recorded win replayed to step 5326, Mira at the open till) and one E won:
"Not one mistake. Best morning rush ever, Mira!", then the title. An earlier build (b9667d97, before the review's
replay fixes) passed the same four rows; its first run lost row 2 to an apostrophe in a query.

**Frame rate** (exit check 10, `acceptance/m5/rush-frames.sh`; receipt AB-R-1137): 758 s of the recorded sessions played
back in this app at 1920×1080 on WebGPU, 8 replays and 24 scene changes. Steady play 60.1 fps (36,424 frames in
606 s, 2.3 per mille over 25 ms); a world being built at a scene change hitches, worst 667 ms. Web process 0.46 to
2.25 GB (median 1.53), falling back at every new game; GPU process 0.56 GB at most
([`hand-test/results/m5-rush-frames/summary.json`](hand-test/results/m5-rush-frames/summary.json)). A second run on the
final runtime stopped at 425 s when WebKit killed its GPU process after a Metal command buffer failed, while two other
projects' GPU jobs ran outside the GPU lock ([`m5-rush-frames-gpu-crash/`](hand-test/results/m5-rush-frames-gpu-crash/));
the game app has no recovery from a lost device yet (AB-T-0639).
