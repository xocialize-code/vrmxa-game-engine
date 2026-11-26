# @vrmxg/interact

M1 W3 (AB-T-0515). Characters interacting with VRMXI items: focus, prompts, the verbs `use`, `take`, `talk`, `sit` and
`stand`, and an inventory for items that can't go into a closet. All of it is simulation: deterministic, in the world
snapshot, and the same in Node, Chromium and WKWebView.

```js
import { installInteraction } from '@vrmxg/interact';
const { interact, inventory } = installInteraction(tree);   // after installPhysics, installCharacters, installItems
interact.prompts();                         // [{ actor: 'mira', item: 'sword', verb: 'take', prompt: 'Take' }]
interact.request(hana, door, 'open');       // NPCs and scripts; the player uses the `interact` action (E, gamepad X)
```

| Piece | What |
|---|---|
| Focus | Each step, for the player (and actors added with `addActor`): the item hit by a forward ray from the chest (the actor's own body excluded), else the item whose reach sensor the actor overlaps, else the nearest within `range` (1.5 m) and in front (`facing` 0.5). `focusChanged` fires on the character when it changes |
| Verbs | The item's offered verbs (VRMXI §7). The character turns to the item, plays the verb's animation slot (`use`, `take` → `equip` until VRMXA has `take`, `talk`, `sit` → `sitIdle`, `stand`; graph.js `ACTIONS`), and the item performs it |
| Sit | Seats the character on the nearest free seat point (VRMXI §8.2): hips held `SEATED_HIPS` (0.5 m) above it, following a seat that moves; moving or interacting again stands it up at the seat's exit point, else where it came from |
| Take | The item leaves the world. A takeable item (VRMXI §9) goes into the character's closet when `@vrmxg/closet` is installed; anything else goes into the inventory (`inventory.list(actor)`) |

Tests (`node --test test/`) run a spec.vrm character against the specification's item fixtures (door, stool, key,
switch): focus and prompts, opening a door, sitting and standing, taking into the inventory, and a 360-step run with
interactions that is identical twice and restores from a snapshot taken while seated after a take. They skip without
VRMXA_Specification (with the VRMXI draft) and vrmxa-core beside the repository.
