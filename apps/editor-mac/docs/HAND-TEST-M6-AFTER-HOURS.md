# The second game, "After Hours", built in the editor (M6 W10, AB-T-0651)

M6's exit check 6 ([M6-PLAN.md](../../../M6-PLAN.md)): a second game, different from the Morning Rush, built in the Mac
editor by an AppProbe scenario from New Project to Export Game. Every scene, node, behaviour attachment and connection
is made through the editor's UI (the toolbar, the assets panel, the inspector's fields, the Behaviours and Connections
panels, Copy and Paste, Project Settings), with no JSON typed. The one file of the game written by hand is its
behaviour, `content/sample/after-hours/behaviours.js` (the shelf that checks what is put on it, declared the W0 way).

**The game.** In the sample cafe after closing, Mira finds what the day's customers left behind (a scarf and a phone on
the tables, a book in the back room behind the locked staff door, which the light switch beside it opens) and puts each
on its shelf before Hana locks up. The inventory carries more than one thing; Hana gives hints at the counter; two
wrong shelves or the 180 s clock lose it. Its files are in `content/sample/after-hours/`.

**How the scenario is made and held to the bytes.** The game is one build plan
(`content/sample/tools/after-hours-plan.mjs`). `content/sample/tools/make-after-hours.mjs` applies it to the editor's own
`EditorSession` and `ProjectSettings` headless and writes what they save: the committed scenes and game.json.
`acceptance/m6/after-hours-scenario.mjs` runs the same plan and writes, beside each op, the AppProbe steps that make it in
the app. It reads the session as it goes for every id the editor gives, every undo step's name and the scene's hash at
the end of each row. So a step that lands differently fails in its own row, and each scene's save row wants the
committed file's size and hash. Afterwards `acceptance/m6/after-hours-compare.mjs` holds the project's scenes,
game.json and behaviours module to the committed ones byte for byte, and plays the editor's exported build to both
endings in Node.

**What comes in from outside the app.** The editor has no file import yet (taking in starter content is AB-T-0653), so
row 2's trigger screenshot has `apps/editor-mac/scripts/after-hours-files.mjs` copy the game's own files into the new
project, as a builder would in the Finder: the hand-written behaviour, the three lost things and the back room
(`make-after-hours.mjs`), the starter content's shelf, the sample's door and switch, and their licence rows.

**Run it.**

```sh
apps/editor-mac/scripts/build.sh
apps/editor-mac/scripts/hand-test-fixtures-m6-after-hours.sh
node apps/editor-mac/scripts/after-hours-files.mjs &        # waits for row 2's trigger
node acceptance/gpu-lock.mjs run --who after-hours -- appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M6-AFTER-HOURS.scenario.md
T="$HOME/Library/Containers/com.xocialize.vrmxg-editor/Data/tmp"
node acceptance/m6/after-hours-compare.mjs "$T/w10-projects/After Hours" "$T/w10-builds/after-hours"
```

The WebGL twin is `hand-test/HAND-TEST-M6-AFTER-HOURS-webgl.scenario.md` (run the fixtures again first). The rows run in
order in one launch.

<!-- rows: the scenario's, kept in step by acceptance/m6/after-hours-scenario.mjs -->
- [ ] File › New Project… makes a game from "One level", named "After Hours": made in a new folder and opened on the template's level.
- [ ] The game's own files come in from outside the app, as a builder copies them into the project's folder: the shelf behaviour written by hand, the lost things, the starter content's shelf, the back room, the sample's door and switch, a licence row for each; File › Open Recent reopens the project and the assets panel lists them.
- [ ] Project Settings: the behaviours module is the hand-written after-hours/behaviours.js (the Behaviours field), one undo step written to game.json; the editor reads the module in place, so the inspector knows the shelf by its describe.
- [ ] The level: New with its file name (after-hours/level.vrmxs), its root named; the environment at night (a gradient sky by its colour wells), the cafe and the back room from the assets panel, the moonlight, the counter lamp and the back room's bulb (colours, turns, numbers), the room tone.
- [ ] The doors and the switch from the assets panel (the front doors and the staff door locked, the staff door and the switch turned to their walls), the four starter shelves.
- [ ] The three lost things where they were left (two on tables, turned; the book on the back room's shelf), and each again on its own shelf, out of sight (state away).
- [ ] Mira with the player behaviour (the Behaviours panel), Hana behind the counter, the camera over the room aimed at its marker.
- [ ] The shelves' areas, each with the game's own shelf behaviour from the Behaviours panel and the item that belongs on it (its VRMXI id typed), and the counter's area; each area's shape pinned and its size a vector.
- [ ] The rules (lost when the clock runs out or after two wrong shelves, built in the condition's menus and rows), two counters, the clock, the goal and the checkpoint under them.
- [ ] Hana's briefing: a Dialogue that starts by itself, three lines, the first offering two choices that branch.
- [ ] Hana's hints: a Dialogue of four lines, the first offering four choices.
- [ ] Connections 1 to 3, from the Connections panel of the node that sends each (signal, target and action picked from lists, arguments by the action's schema): the rules' ready to Hana's lookAt (a node argument), the counter's area to the hints, the switch's verb to the staff door's state.
- [ ] Connections 4 to 15: each shelf's placed and refused, the game's own signals (declared by its describe), to the counter it adds to, the thing shown on its shelf, the wrong-shelf counter and a line from Hana.
- [ ] Connections 16 and 17: won and lost to the scene change (a delay and a scene).
- [ ] The level saved as after-hours/level.vrmxs, read back from disk the same bytes, valid: the committed file's bytes (9611, hash cfe91500a46e3bca).
- [ ] What every scene shares, brought from the level into the next with the toolbar's Copy: env, cafe, moon, counter-lamp, ambience selected (Also select), copied.
- [ ] The title scene: New with its file name (after-hours/title.vrmxs), its root named, what the level shares pasted and given back its ids, then its own nodes.
- [ ] The title scene's connection, from the Connections panel.
- [ ] The title saved as after-hours/title.vrmxs, read back from disk the same bytes, valid: the committed file's bytes (1815, hash ff3dc7cf63041d6e).
- [ ] The won scene: New with its file name (after-hours/won.vrmxs), its root named, what the level shares pasted and given back its ids, then its own nodes.
- [ ] The won scene's connection, from the Connections panel.
- [ ] The won saved as after-hours/won.vrmxs, read back from disk the same bytes, valid: the committed file's bytes (2370, hash 52d5c4dc8d51767b).
- [ ] The lost scene: New with its file name (after-hours/lost.vrmxs), its root named, what the level shares pasted and given back its ids, then its own nodes.
- [ ] The lost scene's connection, from the Connections panel.
- [ ] The lost saved as after-hours/lost.vrmxs, read back from disk the same bytes, valid: the committed file's bytes (2357, hash c579afc86303df94).
- [ ] Project Settings: the title scene is where the game starts, the game's four scenes are in it and the template's level and ending out, each one undo step written to game.json.
- [ ] File › Export Game… writes the game's build, named by its id: its entry the title scene.
<!-- /rows -->

## Results

### M6 W10's runs (2026-11-26): from New Project to Export Game, the committed bytes

AppProbe, 2026-11-26. The editor was built from this branch at 61c561a (`scripts/build.sh`, Release, shell 0.16.0), each
run holding the GPU lock, started with the machine's 1-minute load under 3.
- **WebGPU: 27 of 27** ([`results/m6-after-hours-webgpu/report.md`](hand-test/results/m6-after-hours-webgpu/report.md)).
- **WebGL: 27 of 27** ([`results/m6-after-hours-webgl/report.md`](hand-test/results/m6-after-hours-webgl/report.md)). Receipt AB-R-1198 (both backends).

After each run, `acceptance/m6/after-hours-compare.mjs` checked the project from outside the app
([`compare.json`](hand-test/results/m6-after-hours-webgpu/compare.json), [WebGL's](hand-test/results/m6-after-hours-webgl/compare.json)):
- **The four scenes are the committed ones byte for byte**, ids included: `level.vrmxs` 9,611 bytes (38 nodes, 17
  connections), `title.vrmxs` 1,815, `won.vrmxs` 2,370, `lost.vrmxs` 2,357. All valid. The saved copies are kept as
  `built-*.vrmxs`.
- **game.json** (written by the settings panel) and **the behaviours module** are the committed ones byte for byte.
- **The build Export Game wrote** is whole against its manifest (69 files), and the scripted player wins it (step 3,983,
  no wrong shelf) and loses it (step 2,555, two wrong shelves) in Node.

**Editor gaps the scenario found, fixed on this branch:**
- Project Settings had no way to name the behaviours module. It now has a Behaviours field.
- A colour field took no value through accessibility and no typing. It now has a hex text field beside the well.
- With no scene named, the editor opened the first scene by name. The game's folder `after-hours/` would have come
  before `cafe-cart.vrmxs`, which other scenarios wait for at start. It now opens the first top-level scene.

**What the runs before taught the scenario** (the reports kept under `~/Library/Caches/AppProbe/runs/`):
- **Picking from a web view's select.** Focus, Down, then pressing the item by name worked most of the time. Now and then
  the Down opened nothing, or the menu closed again before its item was pressed. This happened more on WebGL, more under
  load, and most often in the Connections panel at the foot of a long inspector, where focus scrolls the inspector.
  Each pick now waits for the view to settle (700 ms), focuses, waits for the scroll (900 ms), presses Down once, waits
  600 ms (a second Down while a menu opens closes it), then presses Down again only while the item isn't in the tree.
  A menu's items are there only while it is open.
- **What didn't work for picks.** AppProbe's `pick` sees no menu of WebKit's, and `set_value` doesn't change a select.
  An accessibility press opens the menu, but its item's reference went stale as often.
- **Typing.** `set_value` focuses, waits 80 ms, types and presses Tab. Once the keys reached the toolbar's Add, just
  pressed, and added a second node. Text fields are now focused first and given a moment, and every add checks the
  node count.
- **The project's licences.** Export Game was refused until the project's LICENCES.md had rows for the scenes, so the
  files helper adds those too.
- **Load.** Two runs failed under another project's test suite (load average 7); every final run waited for a quiet
  machine first.
