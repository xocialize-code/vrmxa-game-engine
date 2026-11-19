# @vrmxg/character

M0 W3 (AB-T-0504). VRMXA and VRM characters for the scene tree, inside the determinism boundary (AB-D-0248).

```js
import { installPhysics, loadRapier } from '@vrmxg/physics';
import { installCharacters } from '@vrmxg/character';

installPhysics(tree, await loadRapier());                       // first: characters get a capsule and a controller
const lib = installCharacters(tree, { resolve: (ref) => bytesOf(ref), vrmxaCore }); // vrmxa-core injected (AB-D-0249)
await lib.prepare(sceneDoc);                                     // VRMs parse asynchronously, one per Character node
tree.instantiate(sceneDoc);
tree.find('mira').input.move = [0, 1.4];                         // m/s; .input.jump = true to jump
```

## Pieces

| File | What |
|---|---|
| `load.js` | `parseVRM` (VRM 0.x turned to face +Z, facing kept off `vrm.scene`) and `parseVRMA`, with optional stub textures for headless runs |
| `library.js` | The `characters` service: reads `.vrmxa` bundles through `vrmxa-core` (`readBundle`, `equippedState` for worn tags, `resolveSlots`) or plain `.vrm`; parses one VRM per Character node and each clip once; per-asset and project animation sets |
| `graph.js` | `LocomotionGraph`: a state machine on VRMXA slots (idle ⇄ move, jump → fall → land), a 1D walk/run blend by the clips' authored speeds with a shared phase, crossfades on every change (slot `blendIn`), clip choice by weight from the character's random stream. A stateless driver: it sets every action's time and weight each step; its state is a few numbers |
| `character.js` | `CharacterNode`: intent (`input` or `goTo`) → gravity, jump and the physics kinematic controller, facing turned towards the movement → graph → pose (`mixer.update(0)`) → travel root motion removed from the hips → `vrm.update(dt)` (look-at, expressions, constraints, springs at the fixed step). Actions: `say`, `goTo`, `emote`, `lookAt`; `lookAway({ side })` (M3 W2: thinking) aims the gaze 0.4 m to one side of the look target and 0.3 m up, in `ctrl` so it snapshots. `getState()` / `setState()`: every node's local transform, springs (the vendored three-vrm's state API), look-at, expressions, graph, controller. `BoneAttachmentNode` rides on a humanoid bone |

## Layers and IK (M2 W8)

**Layers.** These are proposed to VRMXA as G10, "a mask per clip or slot". A slot entry may carry a `mask`: `fullBody` (the default), `upperBody`, `lowerBody`, `arms`, `hands` or `face`, and a masked clip plays over the state's full-body pose on its bones only (`masks.js` lists them by VRM humanoid bone):
- **hold:** a set's `hold` slot layers over every state except sitting and the full-body actions, fading with them. The sample's sword set holds its idle on the upper body, so with the sword in hand Mira walks and runs with it raised.
- **gestures:** a masked one-shot (`startAction('greet')` with an `arms` entry) plays over locomotion instead of replacing it, so she waves while walking. `graph.gesturing` is true while it plays.

Masked clips are subclips made when the body is put on, in a fixed order, so the mixer accumulates the same way in every run. A layer's share f of its bones is weighted B·f/(1−f) against the full-body weight B (the mixer averages by weight). Both layers are in the graph's state.

**IK.** `ik.js` is an analytic two-bone solve (law of cosines through the portable `Math.acos`, quaternions from unit vectors). It runs on the normalized bones after the mixer and before `vrm.update`:
- **feet:** rays down from above each ankle and the root. A foot over lower ground drops the pelvis; each leg then reaches its own ground, smoothed over a few steps. Flat ground runs no IK at all, so poses and hashes stay as they were. `footIK: false` turns it off.
- **hands:** `reach({ hand, point | target, part?, seconds })` bends the arm to a point, a node or an item's part, fading in and out. The interaction service reaches for an item's `Grip`, `Knob` or `Handle` part (or a verb's `grip`) on interact, so opening the cupboard reaches for its knob.

The feet's offsets and the reach are in the character's controller state, so they are in the snapshot. So is an emote
(`ctrl.emote = { name, until }`, cleared at the start of the step it ends on). It used to be a closure timer, which a
snapshot can't hold, so a scrub into the film refused the world (M2 W12).

## Rules it follows

- **One VRM per node, never cloned.** `library.prepare(doc)` before `instantiate`; `prepareNode` before a runtime add.
- **No private three-vrm fields in engine code.** Spring state goes through `@vrmxg/three-vrm` 3.5.5-vrmxg.1's
  `VRMSpringBoneManager.getState/setState`; look-at uses its public `yaw` / `pitch`.
- **Slots follow what is worn.** `equippedState` gives the bundle's tags; `setEquippedTags` re-resolves the slots.
- **Travel clips move the character** at their authored speed; their forward drift is removed from the hips.
- **Without physics** characters walk on flat ground at y = 0 (tests, tooling).

## Results (AB-R-0939)

Tests (`npm test`; they skip, and say so, without `VRMXA_Specification` and `vrmxa-avatar-studio` beside the repo):
walk, run and jump from scripted input (idle → move → jump → fall → land → idle; 1.4 and 4 m/s blends; facing; a
~1 m jump); slots switch to an item's set on its tag through vrmxa-core's `resolveSlots`; two runs bit-identical at every
step; a snapshot mid-crossfade restored into a new tree re-simulates bit-identically; look-at, emote, say, goTo and a
hand attachment; travel root motion.

**Step cost** (`bench/`, WKWebView over loopback, the full `tree.step()` with physics, controllers, graphs and springs,
VRoid-class characters with 106 spring joints walking circles): 20 characters 1.92–2.01 ms per step, 0.10 ms each
(AB-R-0924 measured about 3 ms for 20 including render-matrix work). Raw files in `bench/results/`.

## Bench

```bash
node bench/make-assets.mjs     # copies the local vroid10.vrm and the generated clips into bench/public/models (git-ignored)
cd bench && npx vite build     # then load bench/dist in the WKWebView harness (spike-cinematics/mac)
```
