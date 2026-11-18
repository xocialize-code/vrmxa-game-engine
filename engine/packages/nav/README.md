# @vrmxg/nav

M2 W6 (AB-T-0529). Navigation. It uses [navcat](https://github.com/isaac-mason/navcat) 0.4.1 (MIT), a pure-JS
Recast/Detour, behind the engine's adapter, as `spike-navigation/` chose (AB-R-0925); recast-navigation-js stays the
fallback.

```js
import { installNav } from '@vrmxg/nav';
const nav = installNav(tree);           // world.js and the MCP engine do this; the navmesh bakes on the first step
mira.goTo({ point: [-0.8, 0, 1.2] });   // characters' goTo now follows the navmesh (or a node: goTo({ target }))
nav.findPath(a, b);                     // { points, length, complete }
nav.setBlocked('gate', [x0, y0, z0, x1, y1, z1]);
nav.addLink({ start, end, radius: 0.4 }); // an off-mesh link at run time (a jump, a ladder)
```

**Bake.** The navmesh is built from the physics world's fixed colliders (`soup.js`), which are the same shapes the characters collide with:
- Boxes give 12 triangles, trimeshes their own triangles, and round shapes a box.
- Moving bodies (hinged doors, items, characters) and sensors are left out, so doorways stay walkable.
- A box whose top is more than 2.2 m above the floor loses its top face, so thick walls don't bake walkable strips (spike gotcha 2).
- The mesh is tiled into 4.8 m tiles of 0.1 m voxels, for an agent of radius 0.3, height 1.7, climb 0.3 and slope 45°.
- The cafe bakes in 16–50 ms: 110 polygons in 18 tiles.

**Obstacles.** An Item in its `locked` state blocks its box. The tiles under it are rebuilt with the box marked unwalkable, and freed again when it unlocks. The cafe's locked staff door is one. `setBlocked(key, box)` does the same for anything.

**Links.** `addLink` and `removeLink` change the navmesh at run time and survive tile rebuilds.

**The crowd.** Every Character gets a crowd agent. Each step, before the nodes:
1. The agent takes its body's foot position, because physics is authoritative (Unity's `updatePosition = false`).
2. The character's goTo (a node or a point) becomes the agent's move target.
3. The crowd steps: corridors, steering and avoidance between agents.
4. The agent's velocity becomes the character's `navMove`, which its own Rapier controller follows.
5. Arrival is within 0.25 m of the navmesh point nearest the goal, or after standing still for half a second short of it (the path ends at tables). A goal off the mesh is reached where the mesh ends.
6. An agent more than 0.5 m from its body is put back on it and replans.

**Determinism.**
- navcat's crowd block is vendored (`src/vendor/navcat-blocks.js`, with navcat's MIT licence beside it), its obstacle avoidance's `Math.cos` / `Math.sin` going through `@vrmxg/dmath`. Nothing else changed.
- The rest of navcat runs with dmath installed over `Math`.
- No randomness, no clocks: navcat's build-context timers only log.

**Snapshot.**
- The crowd is plain JS and is deep-copied every time (the default query filter, an object of functions, travels as a marker).
- The navmesh is copied only once a door or a link has changed it; until then a fresh bake equals it.
- The per-step hash reads a compact state vector: each agent's position, velocity, corridor and target, plus the blocked boxes and the navmesh version.

Measured:
- Acceptance check 14: Hana and Mira on the navmesh, identical at every step in Node, Chromium and WKWebView; a snapshot mid-walk re-simulates.
- `engine/packages/ai/results/npcs.json`: with ten characters the nav step costs 0.09 ms in Node.

Tests (`npm test`):
- the soup and wall tops;
- paths through a doorway, blocked, and back;
- links shortening a path;
- the snapshot carrying the navmesh only once changed;
- on the cafe (needs vrmxa-avatar-studio): Hana walks round the counter to behind it and Mira walks in; two runs are identical; a snapshot mid-walk replays.

Not yet:
- door traversal animations on links (navcat's crowd has the hooks);
- per-character agent sizes;
- area costs;
- the navmesh in the debug draw (`debugTriangles()` is there for it).
