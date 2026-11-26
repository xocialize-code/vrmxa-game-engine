# The sample game's level, built in the editor (M5 W10, AB-T-0620; completed in M6 W1, AB-T-0638)

M5's exit check 8 and M6's exit check 5: the sample game's level built in the Mac editor by hand, all of it, with no
JSON typed. The scenario (`hand-test/HAND-TEST-M5-LEVEL.scenario.md`, written by `acceptance/m5/rush-level-scenario.mjs`)
starts from the level's room (no game layer, no behaviours, no connections) and builds the rest through the inspector:
W4's widgets, W5's Duplicate, W6's assets panel and prefab overrides, and M6 W1's Id field, Before menu, pins,
Behaviours panel (the player's behaviour, the regulars' brains with their vars, the tables' `tableZone` with its seven
params) and Connections panel (all 19 connections). `acceptance/m5/rush-level.mjs compare` then holds the saved file
against the committed level, byte for byte, ids included.

- [x] The level's room opens: the set, the doors and stools, Mira, Hana and the three regulars, with no rules, behaviours or connections yet.
- [x] Mira plays and the regulars think: the player behaviour added to Mira, a brain to each regular, its preset a path (the brain's kind menu) and its vars a number and a seat (each value's kind menu), from the Behaviours panel.
- [x] The three table areas: one made, its shape pinned and its size set (a vector), Duplicated twice, then all three selected to see the size they share; each given its id, name and place.
- [x] The rules: a GameRules node given its id, its seven flags (a map, key by key) and its lose condition (any of: the clock done, two wrong orders), built in the condition's menus and rows.
- [x] The counters and the clock under the rules, each given its id (its key in the game state follows it): labels, a maximum typed as arithmetic, the clock's 240 seconds typed as 4*60.
- [x] Three brew timers: one made, Duplicated twice, then all three selected and their seconds typed once for all (one undo step); each given its id.
- [x] The two goals in order and the checkpoint, each given its id and its condition built in the condition's fields; the checkpoint's once pinned (its default, written into the file).
- [x] The till dragged from the assets panel onto the viewport (the real pointer), and the three trays added from the panel; each given its id, name, place and the state it starts in, and moved before Mira in the scene's order (the Before menu).
- [x] Hana's briefing: a Dialogue given its id, that starts by itself, three lines (speaker, text, clip, ids and the line after), the first offering two choices that branch.
- [x] Aoi's order: a Dialogue given its id, three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).
- [x] Ren's order: a Dialogue given its id, three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).
- [x] Yuki's order: a Dialogue given its id, three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).
- [x] Each table area's tableZone, the game's own behaviour (declared by its describe), added from the Behaviours panel with its seven params: the regular, her order's dialogue and the player from node menus (the player pinned: its default), her tray's item and her flags typed, the points pinned (their default).
- [x] Connections 1 to 13, from the Connections panel of the node that sends each (signal, target and action picked from lists, arguments by the action's schema): the rules' ready to Hana's lookAt (a node argument), each order's chose to its brew timer and Hana's playLayer (a yes / no pinned false), each brew timer's timeout to its tray's state and Hana's line.
- [x] Connections 14 to 19: the serve goal to the till and Hana, the till's verb to setFlag, the till goal to the score (a number), won and lost to changeScene (a delay and a scene); the level's 19 connections, in order.
- [x] A door prefab placed from the assets panel; a prop of its hinge overridden in the inspector, marked as an override (the dot, the Overrides list), reverted by its dot; the door taken out again with Undo, so the level is as committed.
- [x] Saved, and read back from disk the same bytes, valid; the file is what rush-level.mjs compares with the committed level, byte for byte.

## Results

### M6 W1's run (2026-11-26): all of the level, the committed bytes

AppProbe, 2026-11-26, the editor at 7d68407 (PR #60 after both review rounds, rebased onto main; shell 0.16.0; Release build;
the first passing runs were at 85ba12e, built as 54da857, receipts AB-R-1178 and AB-R-1179), the
Mac unlocked for the real pointer's drag, each run holding the GPU lock: **17 of 17 rows on WebGPU**
([`results/m6-level-webgpu/report.md`](hand-test/results/m6-level-webgpu/report.md)) **and 17 of 17 on WebGL**
([`results/m6-level-webgl/report.md`](hand-test/results/m6-level-webgl/report.md)). Each saved level
([`rush-built.vrmxs`](hand-test/results/m6-level-webgpu/rush-built.vrmxs)) **is `content/sample/game/level.vrmxs` byte for
byte** (12,871 bytes: 48 of 48 nodes and 19 of 19 connections, ids included; [`compare.json`](hand-test/results/m6-level-webgpu/compare.json),
[WebGL's](hand-test/results/m6-level-webgl/compare.json)), valid, reopened from disk byte for byte. Built in the editor
by hand, with no JSON typed: the player behaviour and the three regulars' brains (a preset path through the brain's
kind menu, vars a number and a seat through each value's kind menu), the 22 game-layer nodes with their committed ids
(the Id field), the till and trays moved before Mira (the Before menu), the three `tableZone`s with their seven params
(node menus, text, the player and points pinned as their defaults are), and the 19 connections from the Connections
panel (signal, target, action from lists; a node argument, a yes / no pinned false, numbers and text by the action's
schema). Check 8 of M5 and check 5 of M6 pass on both backends.

What the runs before taught the scenario and the editor (the same day, the reports kept under
`~/Library/Caches/AppProbe/runs/`):
- **A node from the toolbar is placed where the view looks** (z 1.983 by then): the first full run passed every row but
  saved the rules, timers, goals and dialogues there. The scenario now puts each node the level keeps at its parent's
  origin back there.
- **AppProbe types into a field by focusing it and pressing ⌘A after 80 ms**; when the web view's focus landed later,
  the ⌘A missed and the text appended ("dialogueorder-1", "newcounters.served", the cause of M5's "new" placeholder
  note too). The editor's text fields now take focus with their text selected (App.vue), and the Id field selects its
  text on focus. With that, WebGPU passed at the next run; WebGL's first run after it lost three rows to screen capture
  (below), and its next run passed.
- **The Add and Connect buttons' accessible names followed the picks**, so AppProbe's reference went stale between
  finding and pressing them; their names are fixed now (the detail is in the tooltip).
- **Screen capture flakes under load:** one WebGL run lost three rows to ScreenCaptureKit (a timeout, then "the user
  declined TCCs") with every node and connection right; the next WebGL run passed. A row's screenshot failing ends the
  row, so its last steps (the door's Undo in row 16) don't run.

### M5's run (2026-11-25, before M6 W1)


AppProbe, 2026-11-25, the editor on `main` after W6 (82d96bf, shell 0.13.0; Release build), the Mac unlocked for the real
pointer's drag: **13 of 13 rows on WebGPU** ([`results/m5-level-webgpu/report.md`](hand-test/results/m5-level-webgpu/report.md))
**and 13 of 13 on WebGL** (`HAND-TEST-M5-LEVEL-webgl.scenario.md`,
[`results/m5-level-webgl/report.md`](hand-test/results/m5-level-webgl/report.md)). Both saved the same bytes
([`rush-built.vrmxs`](hand-test/results/m5-level-webgpu/rush-built.vrmxs)), which hold **all 22 game-layer nodes of
the committed level with the same parents, props and places** ([`compare.json`](hand-test/results/m5-level-webgpu/compare.json)):
the rules with their seven flags and lose condition, three counters, four timers, two goals, the checkpoint, three
table areas, three trays, the till and four dialogues (12 lines, 8 choices, 16 flags set). Valid, reopened from disk
byte for byte.
- **W6's rows.** Row 7 drags the till's tile from the assets panel onto the viewport with the real pointer: it is
  placed where it lands, then named and placed by its fields. Row 12 places the sample's door prefab from the panel,
  overrides its hinge's mass in the inspector, and checks the marks: the dot on the field ("mass overrides the prefab
  (prefab: 12): revert"), the instance marked in the tree, and the Overrides list (hinge mass 12 → 20; shot r12). The dot
  reverts it, two Undos bring it back and take it away, and a third Undo takes the door out, so the level is saved as
  committed.
- **Not built, because the editor can't author them yet:** the three `tableZone` behaviours and the level's 19
  connections (AB-T-0638). That is the only part of check 8 this scenario doesn't cover.

What earlier runs that day (before W6, the editor at e85c048) taught the scenario:
- A web view's `<select>` gets AppProbe's typing one letter at a time: its type-ahead cycles through the options that
  start with the first letter ("GameC" picked GameTimer). So every menu is chosen by focusing it, pressing Down (which
  opens the native menu), and pressing the item by name.
- Edit › Duplicate does nothing while an inspector field has focus, because the editor takes it as text editing. The
  rows use the toolbar's Duplicate instead.
- A value typed into a row that has just appeared can land after its "new" placeholder, and a typed file name was once
  dropped (AB-T-0612's kind). The rows pause after making a row. Before W6 the scenario passed 12 of 12 on its fourth run.
