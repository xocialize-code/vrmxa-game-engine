# The editor guide's pictures (M6 W9, AB-T-0650)

The pictures in [`docs/guide/editor.md`](../../../docs/guide/editor.md) that the tutorial's scenario
([HAND-TEST-M6-TUTORIAL](HAND-TEST-M6-TUTORIAL.md)) doesn't take, taken by
`hand-test/HAND-TEST-M6-GUIDE-SHOTS.scenario.md` at the commit the guide describes (fixtures:
`scripts/hand-test-fixtures-m6-guide.sh`). Copied into `docs/guide/images/` after a look at each for anything personal.

- [x] Prefabs and overrides: a door's hinge, folded open in the tree, overridden in the inspector; the dot and the Overrides list; the dot reverts it. *AppProbe 2026-11-26: "Undo Override door-a/hinge.mass", the dot read "mass overrides the prefab (prefab: 12): revert", reverted, undone back to the scene as opened.*
- [x] The viewport's aids: an area's handles, then the selected camera's picture in picture. *AppProbe 2026-11-26: two pictures; nothing changed in the scene.*
- [x] The assets panel: thumbnails, type filters and search. *AppProbe 2026-11-26: 88 thumbnails, the search narrowed to the doors.*

## Results

| Date | Build | Rows | Result |
|---|---|---|---|
| 2026-11-26 | Release, ad hoc signed, shell 0.16.0, this branch (WebGPU) | 1–3 | 3 of 3. Report: `hand-test/results/m6-guide-shots/` |
