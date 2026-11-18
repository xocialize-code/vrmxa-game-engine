# @vrmxg/closet

M1 W4 (AB-T-0516). The closet at run time: what a character wears changes during play, through vrmxa-core's closet
protocol (CLOSET.md §5) on the character's own `.vrmxa` bundle. Taking a takeable game item (VRMXI §9) copies its
embedded wearable into the closet byte for byte and puts it on.

```js
import { installCloset } from '@vrmxg/closet';
import * as closet from '@xocialize/vrmxa-core/closet';
const wardrobe = installCloset(tree, { vrmxaCore, closet, spec });   // spec: spec.vrm's bytes, needed for redraws
await chars.prepare(doc); await wardrobe.prepare(doc);              // after the character library, before instantiate
tree.instantiate(doc); await wardrobe.showWorn();
wardrobe.take(mira, swordPickup);        // what interact's `take` calls for a takeable item
wardrobe.setItemState(mira, swordId, 'stowed');
wardrobe.unequip(mira, topId);           // a look change: the body swaps 30 steps later
wardrobe.applyOutfit(mira, outfitId);    // CLOSET.md §5.5; on the step if only pinned items change
```

The closet's operations are asynchronous and the simulation steps synchronously, so the work is split by what changes:

| Change | On the step | Afterwards (not simulation) |
|---|---|---|
| A pinned item (VRMXW `pin`: a sword held or stowed) put on, moved between states or taken off; an outfit that only changes pinned items | The item's tags and its state's join or leave the character's equipped tags; its animation slots follow at once (the Short sword held: the sword idle) | The bundle is updated, one operation at a time per character; the item's model hangs on its state's bone as presentation (`userData.presentation`: no snapshot, no hash, no interpolation) |
| An item that changes the look (worn on the body), or an outfit that changes one | Exactly `latency` steps later (30), the redrawn body is swapped in (`CharacterNode.swapVRM`) with the new tags. If the redraw isn't ready, that step is held: `tree.step()` returns false, live play hitches, scripts `await tree.settle()` | The bundle is updated, avatar.vrm redrawn (`redrawAvatar`) and parsed |

A pinned item drawn into the current body (vrmxa-core draws it under its bone, nodes marked `extras.vrmxaFit.item`) is
shown as drawn while it stays in that state; otherwise the drawn copy is hidden and a copy from its model.glb hangs on
the new bone (without the character's fine-tuning until the next redraw).

The swap keeps everything that isn't the body: controller, locomotion graph, facing, look target, equipped tags. The
new body's springs start at rest and its expressions at zero, the same in every run.

Snapshots hold what is worn. A restore brings the bundle back in line (a taken wearable is read again from the Item it
came from) and re-hangs the models. Two limits in M1: a snapshot taken while a redraw is pending can't be restored, and
a snapshot can't restore onto a body with a different look (that needs an asynchronous restore).

Tests (`node --test test/`): Mira (vrmxa-core's full fixture) takes the specification's sword pickup and holds it on
that step, with her idle changed; her own sword moves between its bones; taking off her top swaps the body on exactly
the scheduled step, the step held until the redraw is ready (152 ms headless on an M5 Max); a run with a take is
identical twice and restores from a snapshot after the take; a look change lands on the same step in two runs whose
redraws finish at different wall-clock times.
