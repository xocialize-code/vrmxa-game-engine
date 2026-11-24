# Editor hand test (M1 W7)

The editor in its Mac app, on a fresh copy of the sample project (`scripts/hand-test-fixtures.sh`). Rows the Node
tests can't cover: the app's own controls, the shell's project mount and writes, the Edit menu, the viewport.
AppProbe runs them all (`hand-test/HAND-TEST-M1-EDITOR.scenario.md`); a person checks the screenshots.

- [x] The project opens from a folder (Open Project…): its name shows and its assets are listed. *AppProbe 2026-11-18: through the shell's VRMXG_SHELL_PROJECT hook, not the open panel.*
- [x] A new scene is built from the asset list: the set, two characters, two items, each one Add; nothing errors. *AppProbe 2026-11-18: with each asset's Add button (placed where the view looks). Dragging an asset onto the viewport isn't in the scenario; it was checked in the browser with a dropped asset landing on the floor under the pointer.*
- [x] Nodes move and change in the inspector: position, rotation, name and a prop, each one undo step named after it. *AppProbe 2026-11-18: through the inspector's fields. The gizmo isn't in the scenario (it needs a pointer drag); a real pointer drag on its X arrow was checked in the browser: one snapped "Move hana-1" step.*
- [x] The tree reparents and deletes: a door moves under a new group, deleting the group deletes the door with it. *AppProbe 2026-11-18: reparented with the inspector's Parent menu. Dragging rows in the tree wasn't checked.*
- [x] Undo and redo walk the history from the Edit menu and the toolbar, and come back to exactly the same scene. *AppProbe 2026-11-18: compared by the document's hash. ⌘Z itself wasn't pressed; Edit › Undo was.*
- [x] Save writes the scene into the project; reopening it from disk gives the same bytes, and it validates. *AppProbe 2026-11-18: also checked from outside the app: the file in the container is canonical and valid, and its hash matches the app's.*
- [x] Play runs the scene; Stop leaves the scene exactly as before Play (same hash), and the edit view unchanged. *AppProbe 2026-11-18: the built scene has no camera or lights, so Play shows it from the default camera; walking and items in play are M1 check 2 (W10).*
- [x] With unsaved changes, File › Close Window and Quit ask first: Cancel keeps the window and the change; Don't Save quits without saving. *AppProbe 2026-11-24 (shell 0.9.0, AB-T-0593): the sheet on File › Close Window (the app in front) and on Quit, Cancel each time, the change still there 6.5 s later (past the shell's 5 s timeout); then Quit and Don't Save, and a fresh launch opens the scene exactly as row 6 saved it (same hash). The row can't see that the app has gone (AB-T-0625). The read-only sample's sheet (Cancel, Quit Anyway, no Save) and a quit with nothing unsaved were checked from a script, with the process watched (`apps/creator-mac/scripts/check-close-exits.sh`; its output is `apps/creator-mac/docs/hand-test/results/m5-w8-close/exit-check.txt`).*
- [x] Save in the sheet saves the scene and then closes the window. *AppProbe 2026-11-24: a node added, File › Close Window, Save; a fresh launch opens the scene saved, and not the scene of row 6. Opening another scene over unsaved changes still doesn't ask: that isn't this row.*

## Results

| Date | Build | Row | Result |
|---|---|---|---|
| 2026-11-18 | Release, ad hoc signed (`scripts/build.sh`) | 1–7 | All passed (`appprobe checklist`, 19 s); screenshots in `hand-test/shots/` (r2 built, r3 edited, r6 saved, r7 playing) |
| 2026-11-24 | Release, shell 0.9.0, WebGPU (8b04b5e) | 1–9 | All passed; rows 8 and 9 are new (AB-T-0593) and partly checked: the exit itself is watched from a script |
