# Inspector widgets hand test (M5 W4, AB-T-0599 to 0602)

Part of M5's exit check 8 ([M5-PLAN.md](../../../M5-PLAN.md)): the editor good enough that a level is built by hand,
typing no JSON. The inspector's props get real widgets from their JSON Schema (`@vrmxg/editor-ui`'s `ValueField.vue`:
vectors, lists of structs, maps, curves, choices), numbers are fields you drag or type arithmetic into
(`NumberField.vue`), several selected nodes are edited at once with a mixed state, and a prop whose `visibleIf` doesn't
hold is hidden with its value kept. AppProbe runs the rows in the Mac app (`hand-test/HAND-TEST-M5-INSPECTOR.scenario.md`)
on its own copy of the sample project (`scripts/hand-test-fixtures-m5-inspector.sh`).

- [x] A scene for the inspector: two point lights and a dialogue, added from the toolbar. *AppProbe 2026-11-24: Undo read "Add pointlight", "Add pointlight-2", "Add dialogue"; the scene 4 nodes, valid. The type menu was chosen by focus and type-ahead, since a web view's select doesn't open its menu headless.*
- [x] A value typed with arithmetic commits its result: `1.5 * 2 + 0.25` in a light's intensity is 3.25, one undo step. *AppProbe 2026-11-24: the field read 3.25 and Undo "Set pointlight.intensity"; "nonsense" in range went back to 10 and set nothing.*
- [x] Two lights edited at once: the differing intensity reads as mixed, a typed value sets both as one undo step, and one Undo restores both. *AppProbe 2026-11-24: Select every PointLight gave "2 nodes: pointlight, pointlight-2"; intensity read "intensity (mixed values)"; `2*3` gave Undo "Set intensity on 2 nodes" and 6; one toolbar Undo brought back 3.25 and 1, each read on its node. Also select built the same selection. Shift-click in the tree wasn't tried (AppProbe holds no modifier key).*
- [x] A list of structs edited row by row: a dialogue's lines added, typed, moved and removed, each one undo step, no JSON typed. *AppProbe 2026-11-24: lines went 0 → 1 → 2 rows, each line typed in its own field; moving line 2 up and one Undo put back exactly the move; a nested list (a choice in line 1) set and typed; a removed row came back whole with one Undo; the scene stayed valid.*
- [x] A field hidden by its condition keeps its value through save and reopen, byte for byte. *AppProbe 2026-11-24: shadowPreset set to high while castShadow was on, then hidden by turning it off; Save, then Reopen and compare read "same bytes as saved, valid"; opened again, the scene had the same hash, and turning castShadow on showed high.*
- [ ] Dragging a number (Position X) changes it live and leaves one undo step. *Not scripted: a drag needs the real pointer (AppProbe's `pointer`, which takes the operator's cursor). Checked in Chromium on the editor's dev server, and on the session in Node (`engine/packages/editor-core/test/multi.test.mjs`).*

## Results

| Date | Build | Row | Result |
|---|---|---|---|
| 2026-11-24 | Release, ad hoc signed (`scripts/build.sh`), shell 0.11.0, W4 at 7634c32 (after the review's fixes) | 1–5 | 5 of 5 (`appprobe checklist`, report in `hand-test/results/m5-w4-inspector/`), holding `acceptance/gpu-lock.mjs`. Two earlier runs failed on the scenario, not the app: a web view's select ignores AppProbe's press (now focus and type-ahead, with a 1.5 s pause, since type-ahead keeps a second of typing), and Edit › Undo after `set_value` undid typing in the focused field (now the toolbar's Undo). `HAND-TEST-M1-EDITOR` rows 1–7 on the same build, against its own copy of the project: 7 of 7 |
| 2026-11-24 | Release, ad hoc signed, rebased over W7 (main 770bb77), W4 at c7070f6 with the coordinator's review fixes (ids now `--up`, `--add`…) | 1–5 | 5 of 5, holding the GPU lock; `HAND-TEST-M1-EDITOR` rows 1–7 on the same build, against its own copy of the project: 7 of 7 |
