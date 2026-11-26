# The inspector's number drag in the Mac editor (M5 W11, check 8)

`HAND-TEST-M5-INSPECTOR`'s row "Dragging a number (Position X) changes it live and leaves one undo step" has no
scenario steps (it needs the real pointer). Run by hand through AppProbe on 2026-11-25 at 23:30 UTC, the editor built
from this branch (Release, shell 0.13.0), WebGPU, project `project-inspector` (the fixture script's copy of the sample),
under the GPU lock:

1. Open Project; the tree's `Stool (stool-1)` pressed: the inspector shows `stool-1 · Item`, Position X `-3.75`, Undo empty.
2. AppProbe `pointer action=drag` (the real pointer, 30 steps) on the Position X number, from its middle 60 px right.
3. Position X reads `-3.15` (0.01 m a pixel); Undo reads "Undo Move stool-1".
4. Undo pressed once: Position X `-3.75`, Undo empty again (the drag was one step), the scene "saved" again
   ([screenshot](editor-number-drag-after-undo.jpg)).

Not seen: the value changing while the pointer was still down (only the result was read); Shift and Alt drags.
