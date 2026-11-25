# The sample game's level, built in the editor (M5 W10, AB-T-0620)

M5's exit check 8 for the sample game: its level built in the Mac editor by hand, with no JSON typed. The scenario
(`hand-test/HAND-TEST-M5-LEVEL.scenario.md`, written by `acceptance/m5/rush-level-scenario.mjs`) starts from the level's
room and builds its game layer through the inspector (W4's widgets, W5's Duplicate); `acceptance/m5/rush-level.mjs
compare` then finds every game-layer node of the committed level in the saved file, with the same parent, props and
place. Not built, because the editor can't yet: the three `tableZone` behaviours and the level's connections (AB-T-0638).

- [x] The level's room opens: the set, the doors and stools, Mira, Hana and the three regulars, with no rules yet.
- [x] The rules: a GameRules node with its seven flags (a map, key by key) and its lose condition (any of: the clock done, two wrong orders), built in the condition's menus and rows.
- [x] The counters and the clock under the rules: keys, labels, a maximum typed as arithmetic, the clock's 240 seconds typed as 4*60.
- [x] Three brew timers: one made, Duplicated twice, then all three selected and their seconds typed once for all (one undo step); each given its key.
- [x] The two goals in order and the checkpoint, each with its condition built in the condition's fields.
- [x] The three table areas: one made and sized (a vector), Duplicated twice, then all three selected to see the size they share; each named and placed.
- [x] The three trays and the till from the asset list, each named, placed and given the state it starts in.
- [x] Hana's briefing: a Dialogue that starts by itself, three lines (speaker, text, clip, ids and the line after), the first offering two choices that branch.
- [x] Aoi's order: three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).
- [x] Ren's order: three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).
- [x] Yuki's order: three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).
- [x] Saved, and read back from disk the same bytes, valid; the file is what rush-level.mjs compares with the committed level.

## Results

AppProbe, 2026-11-25, the editor on `main` after W4 and W5 (Release build): **12 of 12 rows**
([`hand-test/results/m5-level/report.md`](hand-test/results/m5-level/report.md)), and the file it saved
([`rush-built.vrmxs`](hand-test/results/m5-level/rush-built.vrmxs)) holds **all 22 game-layer nodes of the committed
level with the same parents, props and places** ([`compare.json`](hand-test/results/m5-level/compare.json)): the rules
with their seven flags and lose condition, three counters, four timers, two goals, the checkpoint, three table areas,
three trays, the till and four dialogues (12 lines, 8 choices, 16 flags set). Valid, reopened from disk byte for byte.

What the earlier runs that day taught the scenario:
- A web view's `<select>` gets AppProbe's typing one letter at a time (its type-ahead cycles through the options that
  start with the first letter: "GameC" picked GameTimer). Every menu is chosen by focusing it, Down (which opens the
  native menu) and pressing the item by name.
- Edit › Duplicate does nothing while an inspector field has focus (the editor takes it as text editing): the rows use
  the toolbar's Duplicate.
- A value typed into a row that has just appeared can land after its "new" placeholder, and a typed file name was once
  dropped (AB-T-0612's kind). The rows pause after making a row; one run of four lost a value this way.

Not here, because the editor can't author them (AB-T-0638): the three `tableZone` behaviours and the level's 19
connections. W6's rows (an asset dragged from the assets panel, a prefab override marked and reverted) come with W6.
