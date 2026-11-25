# A game on the Mac (`apps/game-mac`)

M5 W1 (AB-T-0616, decision AB-D-0286). One game build's folder as the web content of the shared shell (`apps/shell`,
0.11.0). M5-PLAN decision 2: one game is one build, and the Mac app wraps that build. It is not a player that opens
other people's builds.

```sh
apps/game-mac/scripts/build.sh                     # the game app's test game (exported into build/game first)
apps/game-mac/scripts/build.sh <build folder>      # a build from vrmxg-export or the editor's Export Game
apps/game-mac/scripts/build.sh --project content/sample
```

The app is `build/<game id>.app`. Its name is the game's title and its bundle identifier is
`com.xocialize.vrmxg-game.<game id>`, and its version is the game's `release` (else 1.0), all read from the build's manifest, so each game has its own sandbox container
and, with it, its own saves and settings. The executable (`Sources/VRMXGGame/main.swift`) is the same for every game.
It is signed ad hoc; notarising a game for other Macs isn't part of M5.

- **Origins:** loopback by default; `VRMXG_ORIGIN=scheme` for `vrmxg-game://app/`; `VRMXG_QUERY=renderer=webgl` forces a
  backend. The build's project files are served from `project/` beside the page (with no project folder mounted, the
  shell serves the web content's own `project/` there, shell 0.11.0).
- **Closing:** `asksBeforeClosing`. With progress since the last save, closing the window or quitting asks in the page
  (Keep Playing, Save to the last slot and close, or Close Without Saving). The title menu's Quit asks the shell to quit
  (`app.quit`, shell 0.11.0).
- **Saves and settings:** `saves.*` and `settings.*` in `Application Support/<bundle id>/` in the container.
  `VRMXG_SHELL_SAVES` and `VRMXG_SHELL_SETTINGS` move them (the hand test keeps its own under `tmp/game-w1/`).
- **Entitlements:** the sandbox and the loopback server only. A game has no file panels, camera or microphone.

## Hand test

[`docs/HAND-TEST-M5-GAME.md`](docs/HAND-TEST-M5-GAME.md) and its scenarios in `docs/hand-test/`: run
`scripts/build.sh`, launch the app once, `scripts/hand-test-fixtures.sh`, then the two scenarios under the GPU lock.
Quit the app when done: an app AppProbe launched ignores SIGTERM, and one with unsaved progress asks before it quits.
