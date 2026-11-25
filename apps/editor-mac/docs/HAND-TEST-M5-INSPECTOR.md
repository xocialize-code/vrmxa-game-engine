# Inspector widgets hand test (M5 W4, AB-T-0599 to 0602)

Part of M5's exit check 8 ([M5-PLAN.md](../../../M5-PLAN.md)): the editor good enough that a level is built by hand,
typing no JSON. The inspector's props get real widgets from their JSON Schema (`@vrmxg/editor-ui`'s `ValueField.vue`:
vectors, lists of structs, maps, curves, choices), numbers are fields you drag or type arithmetic into
(`NumberField.vue`), several selected nodes are edited at once with a mixed state, and a prop whose `visibleIf` doesn't
hold is hidden with its value kept. AppProbe runs the rows in the Mac app (`hand-test/HAND-TEST-M5-INSPECTOR.scenario.md`)
on its own copy of the sample project (`scripts/hand-test-fixtures-m5-inspector.sh`).

- [ ] A scene for the inspector: two point lights and a dialogue, added from the toolbar.
- [ ] A value typed with arithmetic commits its result: `1.5 * 2 + 0.25` in a light's intensity is 3.25, one undo step.
- [ ] Two lights edited at once: the differing intensity reads as mixed, a typed value sets both as one undo step, and one Undo restores both.
- [ ] A list of structs edited row by row: a dialogue's lines added, typed, moved and removed, each one undo step, no JSON typed.
- [ ] A field hidden by its condition keeps its value through save and reopen, byte for byte.
- [ ] Dragging a number (Position X) changes it live and leaves one undo step. *Not scripted: a drag needs the real pointer (AppProbe's `pointer`, which takes the operator's cursor). Checked in Chromium on the editor's dev server, and on the session in Node (`engine/packages/editor-core/test/multi.test.mjs`).*

## Results

| Date | Build | Row | Result |
|---|---|---|---|
