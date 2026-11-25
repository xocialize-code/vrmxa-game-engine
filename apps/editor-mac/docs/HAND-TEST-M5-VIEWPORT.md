# Viewport and handles hand test (M5 W5, AB-T-0604 and AB-T-0605)

Part of M5's exit check 8 ([M5-PLAN.md](../../../M5-PLAN.md)): the editor good enough to build the sample game's level
by hand. The editor's viewport gets a selection outline, a view cube, a picture-in-picture camera preview, rectangle
select, Duplicate / Copy / Paste of nodes (the Edit menu and the scene tree), and handles that size a collider, a sensor
or a light by dragging. AppProbe runs the rows in the Mac app (`hand-test/HAND-TEST-M5-VIEWPORT.scenario.md`, under the
GPU lock). What the aids look like on each backend is for a person to look at; their maths is tested in Node
(`apps/editor/test/viewport.test.mjs`, `engine/packages/editor-core/test/clipboard.test.mjs`).

- [x] Edit › Duplicate copies the selected node in place with a fresh id, as one undo step. *AppProbe 2026-11-24, WebGPU and WebGL: stool-1 → stool-9 at the original's position, selected, "Undo Duplicate stool-1", one Undo removed it. ⌘D itself wasn't pressed (the menu item was).*
- [x] Copy and Paste from the Edit menu paste a copy with a fresh id, as one undo step. *AppProbe 2026-11-24, both backends: WebKit's own Copy and Paste items, taken by the page's clipboard events: door-1 → door-2, "Undo Paste door-2". Pasting into another editor window wasn't tried.*
- [x] The scene tree's Duplicate, Copy and Paste do the same. *AppProbe 2026-11-24, both backends: sword → sword-2 (Duplicate), Paste read "Paste 1 node" after Copy, then sword-3.*
- [x] Selecting a camera shows what it sees, picture in picture; Preview off hides it. *AppProbe 2026-11-24, both backends: "Camera preview: cam" in the bottom right, gone with Preview off and for the sun. The screenshot shows the follow rig's shot of Mira from behind; whether that matches Play's first frame wasn't compared.*
- [x] A box collider resized by dragging each face: the inspector follows, and each drag is one undo step. *AppProbe 2026-11-24, both backends, the real pointer: the door prefab's panel ([0.88, 2, 0.04]) dragged half a metre out at each of its six faces; each time the inspector's size read the new value (1.4, 2.5 or 0.55 on that axis), the position moved for the x faces, the Undo item read "Undo Resize panel", and one Undo put it back.*
- [ ] Box select: with Box on, a plain drag on the viewport selects what lies wholly inside the rectangle.
- [ ] A scene drawn through the post stack: the edit view shows the scene under the aids, with the outline, handles and preview.
- [ ] The selection outline follows the selected node's shape, a character's included, on WebGPU and on WebGL. *By eye 2026-11-24: the stool's outline in the Mac app's screenshots on both backends; a character's (Mira, skinned) was seen in Chromium on both backends before the review found that a stand-in kept the bind matrix of where the character loaded, so a character placed away from the origin was outlined in the wrong place. The fix is checked in Node (`viewport.test.mjs`: a character bound at the origin, then placed and posed: every stand-in vertex lands on the source's; the test fails without the fix), not by eye in the Mac app since.*
- [x] The view cube turns the view to each axis (the six ends), and turns with the view. *2026-11-24: Front and Right pressed through accessibility in the Mac app (row 5's handles moved where those views put them); Top and Right in Chromium, reading camera-controls' angles. Bottom, Left and Back weren't pressed in the app; their angles are the Node tests'.*
- [ ] ⌘-drag draws a rectangle and selects what is wholly inside it; ⇧ adds; a hidden node isn't picked; Escape drops a drag. *Not in the Mac app with ⌘ or ⇧: AppProbe's pointer can't hold a modifier (row 6 drags with Box on instead). Checked 2026-11-24 in Chromium on WebGPU with synthetic pointer events: a rectangle round four stools selected exactly stool-3 to stool-6; Escape dropped a drag.*
- [ ] Each face of a box, a sphere's radius, a capsule's and a cylinder's height and radius, a point light's range and a spot light's range and cone drag as their handles say; with Snap on, sizes round to 5 cm and angles to 1°; ⌥ grows both sides. *Row 5 drags each face of a box in the app, with Snap on; the other shapes, the lights and ⌥ are the Node tests' maths only.*

## Results

| Date | Build | Row | Result |
|---|---|---|---|
| 2026-11-24 | Release, ad hoc signed (`scripts/build.sh`), shell 0.12.0, at b0b908c with the scenario's later rows | 1–5 | All passed on WebGPU (`HAND-TEST-M5-VIEWPORT.scenario.md`) and on WebGL (`-webgl.scenario.md`), 5 of 5 each, under the GPU lock; row 5 with one face, then again with all six faces, 1 of 1 on each backend. A first run failed rows 1 and 5 on picking from WebKit's popup menus (they can't be picked over accessibility): the rows open scenes by name now |
