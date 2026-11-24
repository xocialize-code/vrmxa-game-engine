# VRMXG editor for the Mac

M1 W7 (AB-T-0519). The editor's web build on the shared shell (`apps/shell`, AB-D-0253), with `pageUndo` so Edit ›
Undo / Redo reach the editor's history. File › Open Project… mounts a folder at `/project/`; Save writes the scene back
into it (`project.write`). No Xcode project: `scripts/build.sh` runs the Vite build, `swift build` and an ad hoc
signature.

```sh
apps/editor-mac/scripts/build.sh                  # the game runtime, the editor, build/VRMXGEditor.app (SKIP_WEB=1 reuses apps/editor/dist)
open apps/editor-mac/build/VRMXGEditor.app
apps/editor-mac/scripts/hand-test-fixtures.sh     # a fresh copy of the sample project in the app's sandbox
```

**Hand test (AppProbe, AB-R-0959, 2026-11-18).** [`docs/HAND-TEST-M1-EDITOR.md`](docs/HAND-TEST-M1-EDITOR.md) and its scenario,
7 of 7 rows passed: the project opens from a folder; a new scene is built from the asset list (set, two characters, two
items); position, rotation, name and a prop change in the inspector, each one named undo step; a door moves under a new
group and goes with it when the group is deleted; undo and redo from the Edit menu and the toolbar come back to the
same scene by hash; Save writes it, and read back from disk it is the same bytes and valid; Play runs it and Stop leaves
the scene and the edit view as before. Screenshots in `docs/hand-test/shots/`.

**Export Game (M5 W0, AB-T-0615).** File › Export Game… (⇧⌘E) and the Export panel's Export Game… write the open
project as a game build into a folder (`build.begin`, `build.write`, `build.end` in `apps/shell`). `scripts/build.sh`
builds the runtime a game is exported with before the editor. [`docs/HAND-TEST-M5-EXPORT-GAME.md`](docs/HAND-TEST-M5-EXPORT-GAME.md)
and its two scenarios run it, and `acceptance/m5/build.mjs --mac` compares the builds with Node's, byte for byte.
