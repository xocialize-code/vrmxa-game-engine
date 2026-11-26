# @vrmxg/item

M1 W2 (AB-T-0514). VRMXI game items in the engine, on the draft specification
(`VRMXA_Specification/VRMXI-base-draft.md`, under review in xocialize-code/vrmxa-spec#1): read and check `.vrmxi`
files, Item nodes with their bodies, colliders, sensors, joints, states and verbs, item state in the world snapshot,
and a writer for generated items.

```js
import { installItems, packItem } from '@vrmxg/item';
const items = installItems(tree, { resolve: bytesOf, vrmxaCore, check });  // after installPhysics; vrmxaCore and check injected
await items.prepare(doc); tree.instantiate(doc);
const door = tree.find('door');
door.offered();                       // [{ verb: 'open', prompt: 'Open', to: 'open', … }]
door.perform({ verb: 'open', by: 'mira' });   // raises verb, then stateChanged
door.enterState({ state: 'locked' }); // scene connections and the game set states directly
```

| Piece | What |
|---|---|
| Reading | `readItem` opens the ZIP with vrmxa-core's reader and, when given the specification's checker (VRMXI §13), refuses anything it reports as an error, naming the codes and the file. Without a checker it still refuses what it can't load (no manifest, another format or version, no model, takeable without its wearable or the reverse) |
| `Item` node | Its model cloned in; the model's `motion` nodes become bodies, dynamic (moved by physics, written back into the model) or kinematic (moved by the item's animations, their pose fed to physics each step); colliders and sensors on the nearest body, the rest on one fixed body for the item's frame; bodies share their mass among their colliders by volume. Parts are found by glTF node index (three's loader renames duplicate names) |
| Joints | The manifest's `hinge`, `slider` and `fixed` joints, each to the frame or another body, anchors taken into each body's rest frame, limits and a position motor; jointed bodies don't collide with each other |
| States | Motor targets, shown meshes, morph weights, a `play` / `loop` animation stepped on the simulation clock, the sensors that are on. An item starts in its scene's `state` prop or its first state |
| Verbs | `offered(state)`, `perform({ verb, by })` (raises `verb`, then moves to `to`), `slotOf(verb)` (the character's animation slot, VRMXI §8 defaults) |
| Sensors | Raise `entered` / `exited` with the sensor's name when a character enters or leaves (no collision filter senses characters, VRMXI §5.1) |
| Data for later workstreams | `seatPoints()`, `spawnPoint()`, `wearableBytes()` (the embedded VRMXW, copied byte for byte), `itemTags()` (the item's and its state's) |
| Snapshot | `getState` / `setState`: the current state and animation times; bodies, motor targets and which sensors are on travel in Rapier's bytes |
| Writing | `packItem`: the manifest first, the wearable stored, `files` with sizes and SHA-256s, through vrmxa-core's writer (the sample cafe's door is made this way: `content/sample/tools/make-content.mjs`) |

Not yet: collision filters by layer name (a sensor senses characters, a collider everything), a motor's `maxForce`, an
item placed in a non-rest state starting already at its joints' targets (it moves there in its first steps), and mesh
colliders (VRMXI §16 Q2).

Tests (`npm test`; they need `VRMXA_Specification` with the VRMXI draft and `vrmxa-core` beside the repo, and skip
otherwise): every valid fixture reads and checks clean, every invalid one is refused with the codes `expected.json`
names; every M1 type instantiates with its bodies, sensors and joints; the door opens and closes from its verbs, a locked
door offers nothing; the chest's lid and the switch's lever move by their animations, kinematic bodies following, meshes
shown by state; a sensor reports a character in and out and nothing else; an item snapshotted mid-swing restores and
re-simulates bit for bit.
