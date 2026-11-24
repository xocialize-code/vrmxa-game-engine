// The set's solid boxes (AB-T-0597): what a camera may not stand in or behind. coverByRule({ blockers }) keeps its cameras
// clear of them, and lintLine(doc, { blockers }) reports a camera that isn't. They come from the set's colliders: its
// Collider nodes, and each Model's colliders from its asset (KHR physics), which the app or tool reads from the file
// (this package reads none). Boxes only: a sphere, capsule or cylinder counts as the box around it; sensors, convex
// hulls and triangle meshes are left out. Numbers are rounded to the micrometre, so the same set gives the same boxes
// in every engine.
import { rotate } from './geometry.js';
import { allNodes } from './lint.js';

const um = (v) => { const r = Math.round(v * 1e6) / 1e6; return r === 0 ? 0 : r; };
const mulQ = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const I = [0, 0, 0, 1];

/** A shape's box: a box's extents, or the box around a sphere, capsule or cylinder (their axis is y). */
function extents(shape) {
  if (shape.shape === 'box' && Array.isArray(shape.size)) return shape.size;
  if (shape.shape === 'sphere' && shape.radius > 0) return [shape.radius * 2, shape.radius * 2, shape.radius * 2];
  if ((shape.shape === 'capsule' || shape.shape === 'cylinder') && shape.radius > 0) return [shape.radius * 2, shape.height ?? shape.radius * 2, shape.radius * 2];
  return null;
}

/**
 * @param {any} set the set's document
 * @param {Record<string, any[]>} [colliders] a Model asset's colliders by the asset's ref or id, as @vrmxg/physics'
 *   readPhysics(gltf).colliders gives them: [{ name?, shape: { shape, size | radius, height }, p, q, sensor }]
 * @returns {{ name: string, p: number[], q: number[], size: number[] }[]} in the set's space, in the set's order
 */
export function setBlockers(set, colliders = {}) {
  const nodes = allNodes(set), byId = new Map(nodes.map((n) => [n.id, n]));
  const parentOf = new Map();
  const walk = (ns, parent) => { for (const n of ns ?? []) { parentOf.set(n.id, n.parent ?? parent); walk(n.children, n.id); } };
  walk(set?.nodes, undefined);
  /** A node's pose in the set: its own under its parents' (scale applies to what hangs under it). */
  const worldOf = (n) => {
    const chain = [];
    for (let x = n, k = 0; x && k < 64; x = byId.get(parentOf.get(x.id)), k++) chain.unshift(x);
    let p = [0, 0, 0], q = I, s = [1, 1, 1];
    for (const x of chain) {
      const t = x.transform ?? {}, lp = t.p ?? [0, 0, 0], r = rotate(q, [lp[0] * s[0], lp[1] * s[1], lp[2] * s[2]]);
      p = [p[0] + r[0], p[1] + r[1], p[2] + r[2]];
      if (t.q) q = mulQ(q, t.q);
      if (t.s) s = [s[0] * t.s[0], s[1] * t.s[1], s[2] * t.s[2]];
    }
    return { p, q, s };
  };
  const assets = new Map((set?.assets ?? []).map((a) => [a.id, a]));
  const out = [];
  const add = (name, w, shape, lp = [0, 0, 0], lq = I) => {
    const size = extents(shape);
    if (!size) return;
    const r = rotate(w.q, [lp[0] * w.s[0], lp[1] * w.s[1], lp[2] * w.s[2]]);
    out.push({ name, p: [um(w.p[0] + r[0]), um(w.p[1] + r[1]), um(w.p[2] + r[2])], q: mulQ(w.q, lq).map(um), size: size.map((v, i) => um(Math.abs(v * w.s[i]))) });
  };
  for (const n of nodes) {
    if (n.type === 'Collider') add(n.id, worldOf(n), { shape: n.props?.shape ?? 'box', size: n.props?.size ?? [1, 1, 1], radius: n.props?.radius, height: n.props?.height });
    else if (n.type === 'Model' && (n.props?.colliders ?? 'fromAsset') === 'fromAsset') {
      const a = assets.get(n.asset), list = colliders[a?.ref] ?? colliders[n.asset] ?? [];
      const w = worldOf(n);
      for (const c of list) if (!c.sensor && c.shape) add(`${n.id}/${c.name ?? c.node ?? 'collider'}`, w, c.shape, c.p ?? [0, 0, 0], c.q ?? I);
    }
  }
  return out;
}

/**
 * setBlockers with the files read by the caller's readers: `bytes(ref)` gives a file of the project, and
 * `readColliders(bytes)` a GLB's colliders: (b) => readPhysics(readGLBJson(b)).colliders, from @vrmxg/physics and
 * @vrmxg/model. A Model whose file can't be read contributes nothing.
 * @param {any} set @param {{ bytes: (ref: string) => Promise<Uint8Array> | Uint8Array, readColliders: (bytes: Uint8Array) => any[] }} o
 */
export async function loadSetBlockers(set, { bytes, readColliders }) {
  const assets = new Map((set?.assets ?? []).map((a) => [a.id, a]));
  const colliders = {};
  for (const n of allNodes(set)) {
    const ref = n.type === 'Model' ? assets.get(n.asset)?.ref : null;
    if (!ref || colliders[ref] || !/\.glb$/i.test(ref)) continue;
    try { colliders[ref] = readColliders(await bytes(ref)); } catch { colliders[ref] = []; }
  }
  return setBlockers(set, colliders);
}
