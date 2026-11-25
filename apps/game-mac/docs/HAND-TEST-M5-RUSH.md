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

- [ ] The sample game's title menu, on WebGPU, with a save in Slot 1.
- [ ] New Game plays the title scene, then the level; Hana's briefing is answered from the keyboard; the HUD shows the goal and the clock.
- [ ] Left alone, the clock runs out: the game is lost, the lost ending says so, and the title comes back as a new game.
- [ ] From the title menu, Load Game → Slot 1 (at the till, everyone served) and E close the till: the game is won, the won ending says so, and the title comes back.

## Results
