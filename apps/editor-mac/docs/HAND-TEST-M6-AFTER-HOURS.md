# The second game, "After Hours", built in the editor (M6 W10, AB-T-0651)

<!-- rows: the scenario's, kept in step by acceptance/m6/after-hours-scenario.mjs -->
- [ ] File › New Project… makes a game from "One level", named "After Hours": made in a new folder and opened on the template's level.
- [ ] The game's own files come in from outside the app, as a builder copies them into the project's folder: the shelf behaviour written by hand, the lost things, the starter content's shelf, the back room, the sample's door and switch, a licence row for each; File › Open Recent reopens the project and the assets panel lists them.
- [ ] Project Settings: the behaviours module is the hand-written after-hours/behaviours.js, one undo step written to game.json; the project opened again loads it, so the inspector knows the shelf by its describe.
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
