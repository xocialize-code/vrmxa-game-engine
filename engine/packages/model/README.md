# @vrmxg/model

M0 W8 (AB-T-0509). Model nodes: glTF sets and props, parsed once per file before the scene is instantiated and cloned into
every node that uses them (geometry and materials shared), with static colliders and triggers from the asset's
`KHR_physics_rigid_bodies` / `KHR_implicit_shapes` data on one fixed body at the node's pose. Prefab instances included.

```js
import { installModels, writeGLB } from '@vrmxg/model';
const models = installModels(tree, { resolve: (ref) => bytesOf(ref) });  // after installPhysics
await models.prepare(doc); tree.instantiate(doc);
writeGLB({ parts: [{ name: 'floor', size: [10, 0.2, 10], p: [0, -0.1, 0], color: '#a08060', collider: true }] });
```

`colliders` on a Model: `fromAsset` (default), `none`, or `trimesh` / `convex`, which the editor will generate (M1) and
which are reported in `models.skipped` rather than faked. `writeGLB` is a small writer for content we generate (boxes,
flat PBR colours, KHR physics colliders and triggers), not a general exporter; the sample cafe is made with it.

Tests (`npm test`): the writer's output (meshes, materials, shapes, alignment); a Model shows its GLB and gets its
colliders and its trigger at the node's pose; Models in prefab instances, one parsed file shared, generated collider
modes reported, removal frees the body.
