# @vrmxg/core

The runtime core (M0 W1, AB-T-0502): a node tree over three.js that runs a `.vrmxs` scene at a fixed 60 Hz, inside
the determinism boundary (AB-D-0248). Install `@vrmxg/dmath` before anything is parsed.

```js
import { installPortableMath } from '@vrmxg/dmath';
import { SceneTree, Behaviour } from '@vrmxg/core';
installPortableMath();

class Hinge extends Behaviour { open() { /* … */ this.emit('opened'); } }
const tree = new SceneTree({ registry, prefabs, behaviours: new Map([['hinge', Hinge]]), seed: 7 })
  .instantiate(sceneDoc);
tree.run(600);                        // 10 s of simulation, identical every run
const alpha = tree.frame(elapsed);    // live play: due steps, then presentation at α
const saved = tree.toDocument();      // back to .vrmxs; changes inside prefabs become overrides
```

## What it does

| Piece | Behaviour |
|---|---|
| **Nodes** (`Node`) | Wrap one `Object3D` (position, quaternion, scale; never Euler `.rotation`); carry their registry type's props, tags, behaviours and an optional state machine; keep unknown keys so scenes round-trip. Later packages subclass them per type |
| **Lifecycle** | Godot's order: `enterTree` parent first, `ready` children first, `exitTree` children first. `physicsProcess(dt)` once per step; `process(dt, α)` once per display frame, presentation only |
| **Signals** | `emit` dispatches immediately, in connection order, to data connections (from the scene, including paths into prefab instances) and code listeners (`on`). Connections into a removed subtree go with it |
| **Actions** | `call(action)`: a behaviour that declares and implements it wins, then the node's own method; otherwise it is recorded in `tree.unhandled` |
| **Behaviours** | Scripts on nodes (AB-D-0247), mapped from scene names to classes by the project; their params are the scene's entry, so edits save. Unknown names keep their data and run nothing |
| **State machines** | Per node; `enter` / `step` / `exit`, stepped after the node's behaviours |
| **Scene I/O** | `instantiate` flattens prefabs (ids `instance/inner`); `add` / `remove` at run time; `toDocument` saves the live tree, turning changes inside instances into overrides (behaviours by `use`) |
| **Clock** | 60 Hz, step-counted. `frameToStep(n, fps)` maps any frame rate (24, 25, 30, 50, 60, 23.976, 29.97, 59.94) to a step and α with integer maths. Live play accumulates host-supplied time; `timeScale` changes steps per wall second, never the step |
| **Pause and time scale** | `clock.paused`; per node `processMode` (`inherit`, `pausable`, `always`, `disabled`) and `timeScale` (multiplies down the tree). A node's `timeScale` and `processMode` are in `getState()` (`ts`, `pm`, only when not the defaults, so a scene that never sets them keeps its hashes) and come back with `setState()` (AB-T-0627). `clock.timeScale` and `clock.paused` are the host's (live play's speed, its pause) and stay outside the state: the host sets them again after a restore |
| **Random** | `RandomStreams`: named sfc32 streams from the scene seed (`node.rng`, `behaviour.rng`, `tree.rng.get(name)`), snapshot-able |
| **Timers and tweens** | Counted in steps; owned by a node and cancelled with it; follow its pause and time scale. Tweens interpolate numbers and arrays, slerp quaternions, with easings |
| **Services** | `loadServices(vrmxg.json, classes)` for project autoloads, `addService(name, service)` for engine systems (physics). They start before the scene; `physicsProcess` runs first in a step, `afterNodes` after the nodes |
| **State** | `getState()` and `stateHash()`: everything simulated, for replay and cross-engine checks |

## One step, in order

1. Autoload services' `physicsProcess`, in declaration order.
2. Timers and tweens, in creation order.
3. Every processing node in tree order (parent before children, siblings in order): the node's `physicsProcess`, its
   behaviours' in attachment order, then its state machine.
4. Services' `afterNodes`, in declaration order: the physics world steps here, after nodes and behaviours set this
   step's inputs, and its contact and sensor events dispatch.
5. The clock advances. Nodes added during a step first run on the next one.

## Tests

`npm test`: the cafe scene instantiates with all 26 nodes, connections and behaviours and saves back byte for byte;
remove and re-add keep the tree and three.js graph consistent; a trigger opens a door through its connection; the
lifecycle order; 600 steps with RNG, timers, tweens and a state machine identical on two runs; pause, process modes
and time scale; the clock's frame mapping; random streams; instance changes saved as valid overrides; unknown types
round-trip; autoloads.
