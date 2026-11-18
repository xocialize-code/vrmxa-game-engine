// The physics of an item's model (VRMXI §5.1, §5.2) as a plan the Item node builds: bodies (nodes with `motion`),
// the colliders and sensors of each (the nearest body at or above their node), and those of the item's fixed frame.
// Poses are in the item's frame at rest (the model's root space).
import { Matrix4, Quaternion, Vector3 } from 'three';

const _p = new Vector3(), _q = new Quaternion(), _s = new Vector3();

function local(n) {
  if (n.matrix) return new Matrix4().fromArray(n.matrix);
  // eslint-disable-next-line vrmxg/deterministic -- glTF JSON's node.rotation is a quaternion array, not three's Euler
  return new Matrix4().compose(_p.fromArray(n.translation ?? [0, 0, 0]), _q.fromArray(n.rotation ?? [0, 0, 0, 1]), _s.fromArray(n.scale ?? [1, 1, 1]));
}

// glTF capsule height is between the cap centres; ours is total (as Godot and the physics adapter take it).
function shapeOf(def) {
  const t = def?.type, d = def?.[t] ?? {};
  switch (t) {
    case 'box': return { shape: 'box', size: d.size ?? [1, 1, 1] };
    case 'sphere': return { shape: 'sphere', radius: d.radius ?? 0.5 };
    case 'capsule': { const r = d.radiusBottom ?? d.radius ?? 0.25; return { shape: 'capsule', radius: r, height: (d.height ?? 0.5) + 2 * r }; }
    case 'cylinder': return { shape: 'cylinder', radius: d.radiusBottom ?? d.radius ?? 0.25, height: d.height ?? 1 };
    default: return null;
  }
}

/**
 * @param {any} gltf the model's glTF JSON
 * @returns {{ bodies: Array<{ node: number, name: string, kinematic: boolean, mass: number | null, rest: { p: number[], q: number[] } }>,
 *   colliders: Array<{ node: number, name: string, body: number | null, sensor: boolean, shape: any, p: number[], q: number[] }>, skipped: string[] }}
 */
export function itemPhysics(gltf) {
  const nodes = gltf.nodes ?? [];
  const shapes = gltf.extensions?.KHR_implicit_shapes?.shapes ?? gltf.extensions?.KHR_collision_shapes?.shapes ?? [];
  const parent = new Map();
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const world = new Map();
  const worldOf = (i) => {
    if (world.has(i)) return world.get(i);
    const m = parent.has(i) ? worldOf(parent.get(i)).clone().multiply(local(nodes[i])) : local(nodes[i]);
    world.set(i, m); return m;
  };
  const khr = (i) => nodes[i].extensions?.KHR_physics_rigid_bodies;
  const bodyOf = (i) => { for (let k = i; k !== undefined; k = parent.get(k)) if (khr(k)?.motion) return k; return null; };
  const pose = (m) => { m.decompose(_p, _q, _s); return { p: _p.toArray(), q: _q.toArray(), s: _s.toArray() }; };

  const bodies = [], colliders = [], skipped = [];
  nodes.forEach((n, i) => {
    const k = khr(i);
    if (!k) return;
    if (k.motion) bodies.push({ node: i, name: n.name, kinematic: !!k.motion.isKinematic, mass: k.motion.mass ?? null, rest: pose(worldOf(i)) });
    if (k.joint) skipped.push(`${n.name}: a joint in the model is ignored (VRMXI §5.1: joints are in the manifest)`);
    /** @type {Array<[string, boolean]>} */
    const kinds = [['collider', false], ['trigger', true]];
    for (const [kind, sensor] of kinds) {
      if (!k[kind]) continue;
      const shape = shapeOf(shapes[k[kind].geometry?.shape]);
      if (!shape) { skipped.push(`${n.name}: ${kind} without a shape this reader knows`); continue; }
      const b = bodyOf(i);
      // relative to its body (or to the item's frame for the fixed frame); scale baked into the shape where uniform
      const rel = b === null ? worldOf(i).clone() : worldOf(b).clone().invert().multiply(worldOf(i));
      const { p, q, s } = pose(rel);
      if (shape.size) shape.size = shape.size.map((v, j) => v * Math.abs(s[j]));
      else { const k2 = Math.abs(s[0]); if (shape.radius !== undefined) shape.radius *= k2; if (shape.height !== undefined) shape.height *= k2; }
      colliders.push({ node: i, name: n.name, body: b, sensor, shape, p, q });
    }
  });
  return { bodies, colliders, skipped };
}
