# Viewport and handles hand test (M5 W5, AB-T-0604 and AB-T-0605)

Part of M5's exit check 8 ([M5-PLAN.md](../../../M5-PLAN.md)): the editor good enough to build the sample game's level
by hand. The editor's viewport gets a selection outline, a view cube, a picture-in-picture camera preview, rectangle
select, Duplicate / Copy / Paste of nodes (the Edit menu and the scene tree), and handles that size a collider, a sensor
or a light by dragging. AppProbe runs the rows in the Mac app (`hand-test/HAND-TEST-M5-VIEWPORT.scenario.md`, under the
GPU lock). What the aids look like on each backend is for a person to look at; their maths is tested in Node
(`apps/editor/test/viewport.test.mjs`, `engine/packages/editor-core/test/clipboard.test.mjs`).

- [ ] Edit › Duplicate copies the selected node in place with a fresh id, as one undo step.
- [ ] Copy and Paste from the Edit menu paste a copy with a fresh id, as one undo step.
- [ ] The scene tree's Duplicate, Copy and Paste do the same.
- [ ] Selecting a camera shows what it sees, picture in picture; Preview off hides it.
- [ ] A box collider resized by dragging a face: the inspector follows, and the drag is one undo step.
- [ ] The selection outline follows the selected node's shape, a character's included, on WebGPU and on WebGL. *By eye.*
- [ ] The view cube turns the view to each axis (the six ends), and turns with the view. *By eye: the cube's buttons press through accessibility, the turn is seen.*
- [ ] ⌘-drag draws a rectangle and selects what is wholly inside it; ⇧⌘-drag adds. *Needs the real pointer and a person: not scripted.*
- [ ] Each face of a box, a sphere's radius, a capsule's and a cylinder's height and radius, a point light's range and a spot light's range and cone drag as their handles say; with Snap on, sizes round to 5 cm and angles to 1°; ⌥ grows both sides. *Row 5 drags one face; the rest is the Node tests' maths.*

## Results

| Date | Build | Row | Result |
|---|---|---|---|
