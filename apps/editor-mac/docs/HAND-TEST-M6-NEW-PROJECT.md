# New Project, Open Recent and project settings hand test (M6 W3, AB-T-0646)

M6's exit check 1 ([M6-PLAN.md](../../../M6-PLAN.md)): a project starts in the editor. File › New Project… makes a game
project from a template (`content/templates/`: an empty game, and one level with a player, a goal and an ending), Open
Recent reopens it, and the project's settings (title and id, entry scene, controls with rebinding, physics layers) are
edited in a panel, each change one undo step written to `game.json`. AppProbe runs the rows in the Mac app
(`hand-test/HAND-TEST-M6-NEW-PROJECT.scenario.md`), the shell's `VRMXG_SHELL_NEW_PROJECT` and `VRMXG_SHELL_BUILD`
hooks standing in for the folder panels. Then, from outside the app:

```sh
T="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
node acceptance/m6/new-project-mac.mjs "$T/m6-projects"                  # what the scenario's settings edits left in game.json
node acceptance/m6/templates-game.mjs "$T/m6-builds/cafe-dash" "$T/m6-builds/blank"   # the builds whole, played in Node and by the game app
```

Run `apps/editor-mac/scripts/build.sh` first, then `apps/editor-mac/scripts/hand-test-fixtures-m6-new-project.sh`
(empty `m6-projects/` and `m6-builds/` in the container, and an empty `/private/tmp/vrmxg-m6-outside`), then
`appprobe checklist scenario=…` for the main scenario and for `-recent.scenario.md` (the last two rows: the real folder
panel, and Open Recent after a relaunch for a project outside the container). The scenario draws
in the editor's own view only (the GPU work is `templates-game.mjs`'s, which takes the GPU lock).

- [x] File › New Project… makes a game from "One level": named in the sheet, made in a new folder, opened on its level. *AppProbe 2026-11-26: the menu item opened the sheet with "One level" chosen; the title "Cafe Dash" made the id `cafe-dash`; Create made `m6-projects/Cafe Dash/` (VRMXG_SHELL_NEW_PROJECT, so the save panel wasn't used) and the editor opened `level.vrmxs` (14 nodes, valid). `new-project-mac.mjs`: exactly the template's 37 files, each with a licence row, and the project plans as a build.*
- [x] Play in place plays the new level, and Stop puts the scene back as it was. *AppProbe 2026-11-26: Play ran past step 100 (Mira, Hana, the rules), Stop read "scene as before Play". Mira wasn't walked to the counter in the editor: a held key isn't an AppProbe step; the game app does it (row 9).*
- [x] Project Settings: a title change is one undo step, written to game.json; Edit › Undo and Redo work on the settings while the panel is open. *AppProbe 2026-11-26: the panel's Undo read "Undo Title Cafe Dash Deluxe"; Edit › Undo put the title back and Edit › Redo set it again; `new-project-mac.mjs` read the title from game.json.*
- [x] Rebinding: Jump takes the key pressed (J); a key another action has (E, Interact's) asks first, Move It moves it, and Undo puts both back. *AppProbe 2026-11-26: real key presses through the app's event queue; "E is Interact now. Move it to Jump?", Move It left Interact on Left click only, Edit › Undo gave Interact its E back and Jump its J in one step; game.json holds Jump on KeyJ and the rest of the default map. A gamepad button wasn't captured: no pad here (AB-T-0642).*
- [x] Physics layers: added by name, and the collision matrix changes both layers at once. *AppProbe 2026-11-26: "player" then "pickup" added ("default" kept first); unticking default × pickup was one step ("Undo default passes through pickup"); game.json holds `collides { default: [default, player], pickup: [player, pickup] }`. That the game runs with them: the exported build plays to its ending in the game app (row 9). A collider on a layer other than the first wasn't placed.*
- [x] Export Game writes the new game's build, named by its id. *AppProbe 2026-11-26: File › Export Game… wrote `m6-builds/cafe-dash` ("Exported game cafe-dash: … entry level.vrmxs, runtime vrmxg-game …").*
- [x] New Project from "Empty game": the project opens on its one scene, plays, and exports. *AppProbe 2026-11-26: "Blank" opened on `main.vrmxs` (6 nodes), Play ran past step 100, Stop put it back, Export Game wrote `m6-builds/blank`; `new-project-mac.mjs`: the template's 3 files, game.json the template's but for its id and title.*
- [x] File › Open Recent reopens the first project, with no panel, on its level. *AppProbe 2026-11-26: the submenu listed Blank first; Cafe Dash reopened (its bookmark, no panel) on `level.vrmxs`. Reopening after a relaunch is covered by the shell's tests (`ProjectFolderTests`), not here.*
- [x] The builds are whole, and the game app plays each: the level to its ending (`templates-game.mjs`, outside the app). *2026-11-26: both Mac builds whole against their manifests; in headless Chromium the game app's title menu, New Game, then W held: "Cafe Dash Deluxe" showed "Goal: Get to the counter", was won at step 159 (score 10) and changed to `ending.vrmxs`; "Blank" ran; the same builds played in Node (won at step 144). `acceptance/results/m6-templates-game.json`. Not played in the Mac game app (apps/game-mac).*
- [x] The folder panel: New Project with no hook asks where the folder goes and what it is called; Cancel makes nothing and leaves the sheet open. *AppProbe 2026-11-26 (`-recent.scenario.md`): the system's save panel opened in `/private/tmp/vrmxg-m6-outside` with "Outside Game" filled in; its Cancel (pressed through accessibility) left the New Project sheet up, no error; the next row's project folder was new. Typing another name or folder into the panel wasn't tried: AppProbe's keys don't reach it.*
- [x] File › Open Recent reopens a project outside the app's container after a relaunch (the sandbox's grant kept as a bookmark). *AppProbe 2026-11-26 (`-recent.scenario.md`): the panel's Create made the project outside the container; after `relaunch`, File › Open Recent listed "Outside Game" first and enabled, and reopened it on `level.vrmxs` with no panel. A folder moved between launches: the shell's tests (`ProjectFolderTests`), not here.*

## Results

| Date | Build | Row | Result |
|---|---|---|---|
| 2026-11-26 | Release, ad hoc signed (`scripts/build.sh`), shell 0.14.0, on main at 55cdf04 with this branch's changes | 1–8 | First run: 5 of 8. Row 4's step read the conflict line's accessible name (empty) instead of its text, and rows 6 and 7 looked for the result line with the Export panel closed: the scenario's mistakes, fixed. Second run: 8 of 8. Two app findings from driving it by hand first, fixed before the runs: adding "default" as the first layer was refused as a duplicate, and Edit › Undo with a settings check box focused went to WebKit's text undo (a focused check box counted as typing) |
| 2026-11-26 | same | 9 | `new-project-mac.mjs` 12 of 12; `templates-game.mjs` 10 of 10 on the two Mac builds (WebGPU in Chromium) |
| 2026-11-26 | same | 10 | Not run: AppProbe can't type into the system's save panel, so a person has to try it |
| 2026-11-26 | Release, ad hoc signed, shell 0.14.0, after the review of PR #52 (layers by explicit renames, a layer in use refused, recents through their bookmarks inside their security scope) | 1–8 | 8 of 8 (a first run lost row 4's key press while `npm run check` ran beside it, and rows 5 to 7 followed from it; run again on a quiet machine, 8 of 8). `new-project-mac.mjs` 12 of 12, `templates-game.mjs` 10 of 10 |
| 2026-11-26 | same | 10, 11 | `-recent.scenario.md`: 2 of 2 on its third run (the first two read the panel's fields with the wrong queries). The real save panel, Cancel and Create pressed through accessibility, the project made in `/private/tmp/vrmxg-m6-outside`, then a relaunch and File › Open Recent: listed enabled, reopened. No "kept without a security scope" line in the app's log |
