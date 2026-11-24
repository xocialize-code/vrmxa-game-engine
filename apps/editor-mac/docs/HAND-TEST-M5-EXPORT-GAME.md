# Export Game hand test (M5 W0, AB-T-0615)

M5's exit check 1 ([M5-PLAN.md](../../../M5-PLAN.md)): the editor's Export Game writes the open project as a game build
(`@vrmxg/bundle`: the runtime, the game's files under `project/`, and `vrmxg-build.json` listing every file with its
SHA-256 and licence), and the build is the same bytes as Node's. AppProbe runs the rows in the Mac app
(`hand-test/HAND-TEST-M5-EXPORT-GAME.scenario.md`, then `-refusal.scenario.md` on a project with an unlicensed file),
the shell's `VRMXG_SHELL_BUILD` hook standing in for the folder panel. `acceptance/m5/build.mjs --mac … --refused … --kept …`
then compares each build with Node's from outside the app, byte for byte.

- [x] Export Game writes the bundled sample as a build: the runtime, the game's files and a manifest. *AppProbe 2026-11-24: the result line read "Exported game cafe: 60 files, 22176386 bytes, entry cafe.vrmxs, runtime vrmxg-stepper 0.1.0" with the build's digest and the manifest's hash; no error shown. Then `build.mjs --mac`: the folder holds exactly the 60 files its manifest lists, each with its hash. The folder panel wasn't used (VRMXG_SHELL_BUILD), and nobody opened the build from this folder.*
- [x] The same export again, into another folder, gives the same build. *AppProbe 2026-11-24, then `build.mjs --mac`: `game-a` and `game-b` are the same 61 files byte for byte, and the same as Node's two exports (manifest 22e106b1ecdbd602…).*
- [x] The same project opened as a folder exports the same build. *AppProbe 2026-11-24: Open Project (VRMXG_SHELL_PROJECT) mounted the copy in the container, read through `/project/`; `game-c` is Node's build byte for byte.*
- [x] File › Export Game… does the same from the menu. *AppProbe 2026-11-24: the menu item pressed through accessibility; `game-d` is Node's build byte for byte. The shortcut (⇧⌘E) wasn't pressed.*
- [x] Exporting again into a folder that holds an earlier build replaces it, whole. *AppProbe 2026-11-24: exported into `game-a` a second time; the result line read "Exported game cafe…" again, and `build.mjs --mac` found `game-a` still Node's build byte for byte, with no staging folder left. A failure half way through wasn't provoked in the app: the shell's and the page's tests cover it (`BuildFolderTests.swift`, `apps/editor/test`).*
- [x] A folder that holds someone's file is refused: the result says what is in the way, and the file is left alone. *AppProbe 2026-11-24: the result line read "Game export refused (not_empty): game-stray holds files that aren't a build's (notes.txt): export into an empty folder"; `build.mjs --kept` found `notes.txt` there and nothing else.*
- [x] A file with no row in LICENCES.md stops the export: the result names the file, and no build folder is made. *AppProbe 2026-11-24 on `project-unlicensed`: the result line read "Game export refused (no_licence): no row in LICENCES.md for props/found-on-the-web.glb…"; `build.mjs --refused` found no `game-refused` folder.*
- [ ] The folder panel: Export Game with no hook asks for a folder, and Cancel exports nothing. *Not scripted: AppProbe can't type into the system panel.*

## Results

| Date | Build | Row | Result |
|---|---|---|---|
| 2026-11-24 | Release, ad hoc signed (`scripts/build.sh`), with W0's changes on main at ffe7c81 | 1–4 | All passed on the first run (`appprobe checklist`, 4 of 4); `acceptance/m5/build.mjs --chromium --mac … --refused …` 12 of 12 (`acceptance/results/m5-build.json`, receipt AB-R-1102); reports in `hand-test/results/ab-t-0615/` |
| 2026-11-24 | same | 5 | Passed (the refusal's scenario, 1 of 1) |
| 2026-11-24 | same | 6 | Not run: the system's folder panel can't be typed into through AppProbe, so a person has to try it |
| 2026-11-24 | Release, ad hoc signed, after the review's fixes (staged writes, folder rules, references, pieces) | 1–6, the refusal | Run again: 6 of 6 and 1 of 1; `build.mjs --chromium --mac … --refused … --kept …` 14 of 14. The scenario opens its own copy of the project now (`project-game`): a first run failed rows 3 to 5 because another session's fixtures had replaced the shared `tmp/project` with a copy that has no `game.json`, and the editor rightly exported the open scene instead. The screenshot steps are gone: they timed out while another session's AppProbe was capturing (AB-T-0430), and the picture showed a path of this machine |
