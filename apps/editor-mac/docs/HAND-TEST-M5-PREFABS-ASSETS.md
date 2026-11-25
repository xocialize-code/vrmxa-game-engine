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

- [x] An overridden prop on a door instance is marked; its dot reverts it, and the scene's bytes are a never-overridden instance's again. *AppProbe 2026-11-25, WebGPU and WebGL: door-a/hinge's mass typed as 20 ("Undo Override door-a/hinge.mass"), the dot read "mass overrides the prefab (prefab: 12): revert", the Overrides list "hinge mass: 12 to 20", the tree row "overridden"; the dot put 12 back ("Undo Revert door-a/hinge.mass") and the status line was the opening one again, "saved" with the same hash. A drag of the field and a gizmo move of an inner node weren't tried in the app (the Node tests fold a drag).*
- [x] Apply writes the override into the prefab after a sheet that names the file and its instances; every other instance follows; Undo reverses it; Save writes the prefab's file. *AppProbe 2026-11-25, both backends: the sheet "Apply to prefabs/door.vrmxs?" said 3 in this scene; after Apply door-b/hinge read 20 with no mark; Undo put 12 back on door-b, Redo 20; Save, then the prefab opened from disk read 20 (the file differs from the sample's by that one line, checked from the shell). Apply All and a nested path's Apply are the Node tests'.*
- [x] The assets panel shows a thumbnail for each placeable asset; filtering to Items lists only `.vrmxi` files; search narrows it. *AppProbe 2026-11-25, both backends: a model, an item, a prefab, a character (its bundle's own) and a sound (its waveform) each had a thumbnail; Items hid the models, characters and sounds; "door prefab" left the two prefabs; the prefabs folder its two files. A whole scene (not a prefab) shows the picture the editor's Thumbnail button saved, or none: it isn't rendered as a small world.*
- [x] A `.glb` dropped on a Model's asset slot sets it as one undo step; a `.wav` dropped there is refused; the picked file's Use does the same as a drop. *AppProbe 2026-11-25, both backends, the real pointer: the street lamp's tile dragged onto the bench's slot ("Undo Set bench.asset"); the switch sound dragged there left the slot and the Undo item unchanged; picking the bench's tile and Use put it back.*
- [x] Tree search keeps the matches and their ancestors (an instance's inner nodes included) and clears back to the whole tree. *AppProbe 2026-11-25, both backends: `type:collider` matched the three doors' panels, shown under their folded instances, the bench hidden; `bench` matched one; a cleared search showed the whole tree.*
- [x] The panels resize from their edges and fold, and their sizes survive a relaunch. *AppProbe 2026-11-25, both backends: the Scene panel's edge focused and moved 48 px by keys (280 → 328), the Inspector folded, the Assets panel 200 → 232; after a relaunch all three were as left (the scenario's own settings file). A pointer drag of an edge wasn't tried in the app.*
- [x] Help › Keyboard Shortcuts shows the sheet of every shortcut. *AppProbe 2026-11-25, both backends: the menu item opened the sheet with "Duplicate: ⌘D", "Move gizmo: W" and "Keyboard Shortcuts: ⌘/"; that every bound key is listed is `apps/editor/test/shortcuts.test.mjs`'s check.*
- [x] Copy a field and paste it into a field of the same type as one undo step; a field of another type refuses the paste. *AppProbe 2026-11-25, both backends: the bench's position pasted onto the sun ("Undo Paste position on sun", Z 2.5); a copied intensity (a number) left the bench's castShadow (a boolean) Paste disabled, saying why.*

## Results

| Date | Build | Row | Result |
|---|---|---|---|
| 2026-11-25 | Release, ad hoc signed (`scripts/build.sh`), shell 0.13.0, at the PR's commit with the review's fixes | 1–8 | 8 of 8 on WebGPU (`HAND-TEST-M5-PREFABS-ASSETS.scenario.md`) and 8 of 8 on WebGL (`-webgl.scenario.md`), under the GPU lock. Earlier runs found two bugs, fixed before these: the inspector went blank after a field copy (structuredClone of Vue's reactive clip) and a tile's pick didn't answer an accessibility press (now a button). The M1 editor (9 of 9), M5 inspector (5 of 5) and M5 viewport scenarios ran on the same build: the viewport's row 2 once found Edit › Copy disabled right after selecting a tree row, and passed on a re-run (rows 1–2, 2 of 2) |
