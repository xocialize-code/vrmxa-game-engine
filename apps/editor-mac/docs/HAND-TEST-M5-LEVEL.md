# The sample game's level, built in the editor (M5 W10, AB-T-0620)

M5's exit check 8 for the sample game: its level built in the Mac editor by hand, with no JSON typed. The scenario
(`hand-test/HAND-TEST-M5-LEVEL.scenario.md`, written by `acceptance/m5/rush-level-scenario.mjs`) starts from the level's
room and builds its game layer through the inspector (W4's widgets, W5's Duplicate); `acceptance/m5/rush-level.mjs
compare` then finds every game-layer node of the committed level in the saved file, with the same parent, props and
place. Not built, because the editor can't yet: the three `tableZone` behaviours and the level's connections (AB-T-0638).

- [ ] The level's room opens: the set, the doors and stools, Mira, Hana and the three regulars, with no rules yet.
- [ ] The rules: a GameRules node with its seven flags (a map, key by key) and its lose condition (any of: the clock done, two wrong orders), built in the condition's menus and rows.
- [ ] The counters and the clock under the rules: keys, labels, a maximum typed as arithmetic, the clock's 240 seconds typed as 4*60.
- [ ] Three brew timers: one made, Duplicated twice from the Edit menu, then all three selected and their seconds typed once for all (one undo step); each given its key.
- [ ] The two goals in order and the checkpoint, each with its condition built in the condition's fields.
- [ ] The three table areas: one made and sized (a vector), Duplicated twice, then all three selected to see the size they share; each named and placed.
- [ ] The three trays and the till from the asset list, each named, placed and given the state it starts in.
- [ ] Hana's briefing: a Dialogue that starts by itself, three lines (speaker, text, clip, ids and the line after), the first offering two choices that branch.
- [ ] Aoi's order: three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).
- [ ] Ren's order: three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).
- [ ] Yuki's order: three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).
- [ ] Saved, and read back from disk the same bytes, valid; the file is what rush-level.mjs compares with the committed level.

## Results
