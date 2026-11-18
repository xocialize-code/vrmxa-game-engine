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
| `character.js` | `CharacterNode`: intent (`input` or `goTo`) → gravity, jump and the physics kinematic controller, facing turned towards the movement → graph → pose (`mixer.update(0)`) → travel root motion removed from the hips → `vrm.update(dt)` (look-at, expressions, constraints, springs at the fixed step). Actions: `say`, `goTo`, `emote`, `lookAt`. `getState()` / `setState()`: every node's local transform, springs (the vendored three-vrm's state API), look-at, expressions, graph, controller. `BoneAttachmentNode` rides on a humanoid bone |

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
