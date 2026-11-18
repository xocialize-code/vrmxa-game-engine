# @vrmxg/physics

M0 W2 (AB-T-0503). Physics for the engine: an engine-neutral adapter implemented on Rapier's deterministic build
(`@dimforge/rapier3d-deterministic-compat` 0.21.0, AB-R-0923), the RigidBody, Collider and Area nodes, the hinge
behaviour, ray and shape casts, named collision layers, snapshots and debug render data. Inside the determinism
boundary (AB-D-0248).

```js
import { loadRapier, installPhysics } from '@vrmxg/physics';
const tree = new SceneTree({ registry, prefabs });
const physics = installPhysics(tree, await loadRapier(), project.physics); // before instantiate
tree.instantiate(sceneDoc);
tree.run(600);
physics.raycast([0, 1, -2], [0, 0, 1], 10);     // → { node, colliderNode, distance, point, normal }
const snap = physics.snapshot();               // Rapier bytes + physics behaviours' state
```

## Pieces

| File | What |
|---|---|
| `world.js` | `PhysicsWorld`, the adapter: bodies, colliders (box, sphere, capsule, cylinder, convex, trimesh), revolute joints with limits and motors, stepping with collision events, ray and shape casts, overlaps, awake-body iteration, snapshot / restore, debug lines. Engine code talks to this, never to Rapier, so Jolt stays a swap |
| `server.js` | `PhysicsServer`, the tree service. Steps in the tree's `afterNodes` phase: kinematic bodies take their node's pose, the world steps, awake dynamic bodies write their pose back to their node (local to its parent), sensor and contact events become signals, physics behaviours read the result |
| `nodes.js` | `RigidBody` (owns a body; `mass` shared among its colliders by volume), `Collider` (attaches to the nearest RigidBody above it, or gets a private fixed body), `Area` (a sensor Collider: `bodyEntered` / `bodyExited`) |
| `hinge.js` | The `hinge` behaviour: a revolute joint to a fixed anchor, limits, a position motor; `open` / `close` / `toggle`; `opened` / `closed` within 5° of the target; `locked` keeps it shut |
| `layers.js` | Named collision layers from `vrmxg.json` (`physics.layers`, `physics.collides`), up to 16 |
| `khr.js` | Colliders from a GLB's `KHR_physics_rigid_bodies` + `KHR_implicit_shapes` (or `KHR_collision_shapes`), and `OMI_physics_*`: implicit shapes, read tolerantly; `addAssetColliders` puts them on a model node |

## Rules it follows

- **One Rapier build per project**: the deterministic one. Snapshots carry the build and version and refuse to restore
  into another.
- **The spike's gotchas are handled:** sensors get `KINEMATIC_FIXED` (and `KINEMATIC_KINEMATIC`) so kinematic bodies
  trigger them; queries exclude sensors by default.
- **Box `size` is full extents** (as glTF's KHR shapes); capsule `height` is total, caps included (as Godot).
- **Contact events cost only when used**: a RigidBody's colliders report collisions only once something listens to its
  `contact` signal (a data connection or `on('contact')`).
- **Settled scenes are cheap**: only Rapier's awake bodies are written back to their nodes each step.
- **Character controllers** (`createCharacterController`, used by `@vrmxg/character`): Rapier's kinematic controller plus
  two fixes found in W3. Rapier 0.21's controller lets a capsule sink into box, convex and round-box colliders (not
  trimeshes) until it sticks, in all three builds; one downward ray keeps the capsule 5 mm above its own offset (22
  stalls in 600 steps at 0 mm, none at 5 mm). Controllers aren't in Rapier snapshots, so `restore()` rebuilds them.
- **Kinematic bodies never sleep**: asleep, Rapier ignores their next pose and their collider stays behind.
- **Restored worlds compute what the original did**: shape dimensions read back from a collider are rounded to f32
  (a collider created in this session caches the description's f64 numbers; one from a snapshot reads f32).

## Results (AB-R-0938)

- The door prefab swings open (to about 100°) when a kinematic capsule walks into its trigger and closes when it leaves:
  `bodyEntered → opened → bodyExited → closed`, in Node. A locked door stays shut.
- Two runs are bit-identical at every one of 600 steps. A snapshot at step 300 restored into a new tree re-simulates to
  600 bit-identically, hinge state included.
- **Step cost** (`bench/`, the physics spike's 300-box scene, 600 steps from step 0, WKWebView over loopback): engine
  0.123–0.124 ms per step against AB-R-0923's 0.114 ms (+8.0 to 9.1%); raw Rapier in the same runs 0.113–0.115 ms
  (overhead +0.008 to 0.011 ms: syncing node transforms, which raw Rapier doesn't do). Raw files in `bench/results/`.
  About a third of the remaining overhead is three's Euler `.rotation` mirror, re-synced on every quaternion write;
  switching it off for engine nodes is a later option, since presentation code may read `.rotation`.

## Bench

```bash
node bench/main.js                      # Node
cd bench && npx vite build              # then load bench/dist in the WKWebView harness (spike-cinematics/mac)
```
