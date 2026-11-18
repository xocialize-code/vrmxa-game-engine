// Colliders authored in Blender (or anywhere) and exported in a GLB: KHR_physics_rigid_bodies with
// KHR_implicit_shapes (or its earlier name KHR_collision_shapes), and the older OMI_physics_body /
// OMI_physics_shape. These are drafts, so this reads tolerantly: anything it doesn't recognise is
// listed in `skipped`, never fatal. Implicit shapes (box, sphere, capsule, cylinder) only; mesh
// colliders (geometry.node / convexHull) need the mesh's vertices and come with the model loader.
import { Matrix4, Vector3, Quaternion } from 'three';

const _m = new Matrix4(), _p = new Vector3(), _q = new Quaternion(), _s = new Vector3();

function localMatrix(n) {
  if (n.matrix) return new Matrix4().fromArray(n.matrix);
  // eslint-disable-next-line vrmxg/deterministic -- glTF JSON's node.rotation is a quaternion array, not three's Euler
  return new Matrix4().compose(_p.fromArray(n.translation ?? [0, 0, 0]), _q.fromArray(n.rotation ?? [0, 0, 0, 1]), _s.fromArray(n.scale ?? [1, 1, 1]));
}

// glTF capsule height is between the cap centres; ours is total (as Godot), so add the caps.
function shapeOf(def) {
  const t = def?.type;
  const d = def?.[t] ?? {};
  switch (t) {
    case 'box': return { shape: 'box', size: d.size ?? [1, 1, 1] };
    case 'sphere': return { shape: 'sphere', radius: d.radius ?? 0.5 };
    case 'capsule': { const r = d.radiusBottom ?? d.radius ?? d.radiusTop ?? 0.25; return { shape: 'capsule', radius: r, height: (d.height ?? 0.5) + 2 * r }; }
    case 'cylinder': return { shape: 'cylinder', radius: d.radiusBottom ?? d.radius ?? d.radiusTop ?? 0.25, height: d.height ?? 1 };
    default: return null;
  }
}

/**
 * @param {any} gltf the glTF JSON (from a .gltf, or a GLB's JSON chunk)
 * @returns {{ colliders: Array<{ node: number, name?: string, shape: any, p: number[], q: number[], sensor: boolean, motion: any }>, skipped: string[] }}
 *   p / q: the shape's pose in the asset's space (scene root), scale baked into the shape where uniform
 */
export function readPhysics(gltf) {
  const ext = gltf.extensions ?? {};
  const shapes = ext.KHR_implicit_shapes?.shapes ?? ext.KHR_collision_shapes?.shapes ?? null;
  const omiShapes = ext.OMI_physics_shape?.shapes ?? null;
  const colliders = [], skipped = [];
  const nodes = gltf.nodes ?? [];
  const parents = new Map();
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parents.set(c, i)));
  const worldOf = (i) => { const chain = []; for (let k = i; k !== undefined; k = parents.get(k)) chain.unshift(k); return chain.reduce((m, k) => m.multiply(localMatrix(nodes[k])), new Matrix4()); };

  const add = (i, geometry, list, sensor, motion, label) => {
    if (geometry?.shape === undefined) { skipped.push(`node ${i}${nodes[i].name ? ` (${nodes[i].name})` : ''}: ${label} without an implicit shape (mesh colliders come with the model loader)`); return; }
    const s = shapeOf(list?.[geometry.shape]);
    if (!s) { skipped.push(`node ${i}: unsupported shape ${JSON.stringify(list?.[geometry.shape]?.type)}`); return; }
    _m.copy(worldOf(i)).decompose(_p, _q, _s);
    const k = Math.abs(_s.x - _s.y) < 1e-9 && Math.abs(_s.y - _s.z) < 1e-9 ? _s.x : null;
    if (k === null) {
      if (s.shape === 'box') s.size = s.size.map((v, j) => v * Math.abs([_s.x, _s.y, _s.z][j]));
      else skipped.push(`node ${i}: non-uniform scale on a ${s.shape}; shape left unscaled`);
    } else if (k !== 1) {
      if (s.size) s.size = s.size.map((v) => v * Math.abs(k));
      if (s.radius !== undefined) s.radius *= Math.abs(k);
      if (s.height !== undefined) s.height *= Math.abs(k);
    }
    colliders.push({ node: i, name: nodes[i].name, shape: s, p: _p.toArray(), q: _q.toArray(), sensor, motion });
  };

  nodes.forEach((n, i) => {
    const khr = n.extensions?.KHR_physics_rigid_bodies;
    if (khr) {
      if (khr.collider) add(i, khr.collider.geometry, shapes, false, khr.motion ?? null, 'collider');
      if (khr.trigger) add(i, khr.trigger.geometry, shapes, true, null, 'trigger');
    }
    const omi = n.extensions?.OMI_physics_body;
    if (omi) {
      if (omi.collider) add(i, omi.collider, omiShapes, false, omi.motion ?? null, 'collider');
      if (omi.trigger) add(i, omi.trigger, omiShapes, true, null, 'trigger');
    }
  });
  return { colliders, skipped };
}
