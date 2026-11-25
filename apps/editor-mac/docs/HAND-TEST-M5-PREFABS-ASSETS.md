# Prefabs and assets hand test (M5 W6, AB-T-0603, AB-T-0606 and AB-T-0607)

Part of M5's exit check 8 ([M5-PLAN.md](../../../M5-PLAN.md)): the editor good enough to build the sample game's level
by hand, typing no JSON. A prefab instance's inner nodes are in the scene tree and edited in the inspector as the
instance's overrides, each marked, reverted or applied to the prefab (with a diff view); the assets panel has
thumbnails, type filters, search and folders, and its files drop onto the viewport and onto inspector slots of the right
kind; and four small things: tree search, panels you resize and fold that keep their size, a shortcuts sheet from the
Help menu, and per-field copy and paste. AppProbe runs the rows in the Mac app
(`hand-test/HAND-TEST-M5-PREFABS-ASSETS.scenario.md`, under the GPU lock) on the fixture project
`project-w6-prefabs` (`scripts/hand-test-fixtures-m5-prefabs-assets.sh`). The rules themselves are tested in Node
(`engine/packages/scene/test/overrides.test.mjs`, `engine/packages/editor-core/test/overrides.test.mjs`,
`engine/packages/editor-ui/test/w6.test.mjs`, `apps/editor/test/thumbs.test.mjs`, `apps/editor/test/shortcuts.test.mjs`).

- [ ] An overridden prop on a door instance is marked; its dot reverts it, and the scene's bytes are a never-overridden instance's again.
- [ ] Apply writes the override into the prefab after a sheet that names the file and its instances; every other instance follows; Undo reverses it; Save writes the prefab's file.
- [ ] The assets panel shows a thumbnail for each placeable asset; filtering to Items lists only `.vrmxi` files; search narrows it.
- [ ] A `.glb` dropped on a Model's asset slot sets it as one undo step; a `.wav` dropped there is refused; the picked file's Use does the same as a drop.
- [ ] Tree search keeps the matches and their ancestors (an instance's inner nodes included) and clears back to the whole tree.
- [ ] The panels resize from their edges and fold, and their sizes survive a relaunch.
- [ ] Help › Keyboard Shortcuts shows the sheet of every shortcut.
- [ ] Copy a field and paste it into a field of the same type as one undo step; a field of another type refuses the paste.

## Results

| Date | Build | Row | Result |
|---|---|---|---|
