# @vrmxg/particles

M2 W4 (AB-T-0527). Particles: [three.quarks](https://github.com/Alchemist0823/three.quarks) 0.18.0 (MIT) behind the
deterministic adapter `spike-particles/` proved (AB-R-0926). The adapter, not the library, owns what makes it
replay: the randomness, the maths, the step and the snapshot.

```js
import { installParticles } from '@vrmxg/particles';
const particles = installParticles(tree, { resolve });  // world.js and the MCP engine do this
await particles.prepare(doc);                            // reads project effect files the scene names
// in a scene: { "id": "espresso-steam", "type": "ParticleEmitter", "transform": { "p": [1.3, 1.55, -4.1] }, "props": { "effect": "steam" } }
```

| Piece | What |
|---|---|
| `ParticleEmitter` | Shows an effect where it stands. Props: `effect` (built in: `steam`, `dust`, `sparks`; or a project `.json`), `mode`, `autoplay`, `speed`. Actions `play`, `stop` (live particles finish their lives), `restart`; signal `finished` (a non-looping effect ended and its last particle died) |
| Modes | `simulation` (default): stepped at 60 Hz before the nodes, in the snapshot and the world hash, scrubs exactly. `presentation`: stepped with the presented frame, outside the snapshot, for visual-only dressing |
| Randomness | quarks draws from `Math.random`; each emitter's step runs with it swapped for a stream seeded from (scene seed, emitter id, step) alone. A step's randomness never depends on history, so no RNG state is saved and a restored world draws what a straight run draws |
| Maths | `@vrmxg/dmath` installed over `Math`: V8 and JavaScriptCore agree to the bit |
| Snapshot | Each emitter's particles (every field as numbers and arrays) and its systems' emission state are its node state. When an emitter registers it spawns one throwaway particle, because quarks' per-particle value generators learn their slot in a particle's memory only on the first spawn. Without it, a world restored before it ever emitted read NaN rotations |
| Effect documents | `{ "format": "vrmxg-effect", "version": 1, "systems": [...] }`, one quarks system each: life, speed, size, start angle, colours, rate and bursts, a shape (point, sphere, hemisphere, cone, circle; cones point up by default), gravity and force, size / speed / colour / opacity over life, spin, an atlas tile, blending, billboard or stretched rendering. `checkEffect` names what's wrong |
| Drawing | One quarks `BatchedRenderer` per tree draws every emitter, one draw per material and render mode. The 8-tile atlas is drawn from pixel maths (dot, puff, spark, flash, ring, line, drop, star), so there are no image files. quarks disposes a system whose root isn't a `Scene`, so a tree outside a render host hangs under a private Scene until a host takes it |

Measured (acceptance check 13: 43 emitters, up to 1,207 particles in the cafe): identical at every step in Node,
Chromium and WKWebView, a snapshot mid-effect re-simulates identically, and the particle step costs 0.12–0.22 ms.

Tests (`npm test`):
- effect documents and the atlas;
- steam rising, dust settling, sparks bursting and falling;
- the same particles every run, and another seed giving others;
- snapshot and restore mid-effect and at step 0;
- every built-in effect restored mid-effect into a fresh world, matching the run step by step;
- stop and finished;
- presentation emitters staying out of the hash;
- batching.

Not yet: collisions (quarks' `ApplyCollision` with Rapier), sub-emitters and trails in effect documents, interpolated
particle positions between steps (they draw at the last step), soft particles.
