// Baking (M2 W1): a simulation span recorded into a pose cache, so the shot keeps exactly this take of the simulation
// (a crowd, a cloth fall, an AI walk) even after the simulation's own code or parameters change, as Unreal's
// take recorder or a Houdini cache does. bake() plays the span and records, every step, the transform and state of
// the nodes that moved; inside a simulation track's `baked` clip the sequence service writes those poses after the
// nodes and physics step. The cache is data the sequence ships with (bake.json beside it), like an animation clip.
import { clipAt } from './evaluate.js';

const NUM = (o) => [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()];
/** A rigid body's world pose and velocities: [p 3, q 4, linear 3, angular 3]. */
function bodyOf(tree, n) {
  const w = tree.services.get('physics')?.world;
  if (!w || n.body === undefined) return null;
  const { p, q } = w.bodyPose(n.body), { lv, av } = w.bodyMotion(n.body);
  return [...p, ...q, ...lv, ...av];
}

/**
 * Record the poses of `targets` (node ids; default: every Character and RigidBody) for the sequence's baked spans.
 * The world must be at the span's start or before it (a SequencePlayer seek gets it there).
 * @param {any} tree @param {{ targets?: string[], from?: number, to?: number, state?: boolean }} [o]
 */
export async function bake(tree, { targets = null, from = null, to = null, state = true } = {}) {
  const svc = tree.services.get('sequence');
  const spans = svc.tracks.filter((t) => t.type === 'simulation').flatMap((t) => (t.clips ?? []).filter((c) => c.mode === 'baked'));
  const f0 = from ?? Math.min(...spans.map((c) => c.start)), f1 = to ?? Math.max(...spans.map((c) => c.end));
  if (!Number.isFinite(f0) || !Number.isFinite(f1)) throw new Error('bake: the sequence has no baked simulation clip; pass from and to');
  const ids = targets ?? tree.all().filter((n) => n.type === 'Character' || n.type === 'RigidBody').map((n) => n.id);
  const s0 = svc.stepOf(f0).step, s1 = svc.stepOf(f1).step;
  const poses = new Map();
  const saved = svc.baked; svc.baked = null; // record the live simulation, not an older cache
  while (tree.clock.step < s1) {
    while (!tree.step()) await tree.settle();
    if (tree.clock.step < s0 || tree.clock.step >= s1) continue;
    const at = {};
    for (const id of ids) { const n = /** @type {any} */ (tree.find(id)); if (n) at[id] = { t: NUM(n.object3d), ...(n.body !== undefined ? { b: bodyOf(tree, n) } : {}), ...(state && n.getState ? { state: structuredClone(n.getState()) } : {}) }; }
    poses.set(tree.clock.step, at);
  }
  svc.baked = saved;
  return { from: f0, to: f1, fps: svc.fps, targets: ids, poses };
}

/** Use a cache for the sequence's baked spans. */
export function useBake(tree, cache) { tree.services.get('sequence').baked = cache; }

/** A cache as JSON (Float64 transforms as numbers: exact), and back. */
export const bakeToJSON = (c) => ({ from: c.from, to: c.to, fps: c.fps, targets: c.targets, poses: [...c.poses] });
export const bakeFromJSON = (j) => ({ ...j, poses: new Map(j.poses) });

/** True when a frame falls in a baked span. */
export const isBaked = (seq, frame) => (seq.tracks ?? []).some((t) => t.type === 'simulation' && clipAt(t, frame)?.mode === 'baked');
