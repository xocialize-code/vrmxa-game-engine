// @vrmxg/snapshot — M0 W6 (AB-T-0507). One snapshot of a whole world, and the hashes that prove two runs
// of it are the same run.
//
// A snapshot is plain data (typed arrays included, so structuredClone and postMessage carry it):
//   core      tree.getState(): clock, random streams, timers, every node's transform, props, behaviour
//             params and state, state machine
//   services  every service's own state: physics as Rapier's bytes plus its behaviours (snapshot()),
//             the others through getState() (input's latched frame, the current camera)
//   nodes     every node with its own getState() (characters: pose, springs, look-at, expressions,
//             locomotion graph, controller; cameras: rig and preset)
// It restores onto a tree freshly instantiated from the same scene with the same services installed:
// code isn't data, so a timer created at run time (and its closure) can't come back, and restoreWorld
// says so instead of guessing. An input recording being replayed is outside the snapshot: replay it
// again after restoring (the cursor is the clock's step).
//
// worldHashes() hashes each component separately, every step if you like, so a divergence names where
// it started: compareRuns() returns the first step and the components that differ there.

export const SNAPSHOT_FORMAT = 1;

/**
 * @param {any} tree a SceneTree
 * @param {{ meta?: any }} [opts] anything to carry along (versions, the scene id)
 */
export function captureWorld(tree, { meta = null } = {}) {
  const services = {};
  for (const [name, s] of tree.services) {
    if (typeof s.snapshot === 'function') services[name] = { kind: 'snapshot', data: s.snapshot() };
    else if (typeof s.getState === 'function') services[name] = { kind: 'state', data: s.getState() };
  }
  const nodes = {};
  for (const n of tree.all()) if (typeof n.getState === 'function') nodes[n.id] = n.getState();
  return structuredClone({ format: SNAPSHOT_FORMAT, step: tree.clock.step, meta, core: tree.getState(), services, nodes });
}

/**
 * Restore a snapshot onto a tree instantiated from the scene it was taken from.
 * @param {any} tree @param {any} snap
 */
export function restoreWorld(tree, snap) {
  if (snap.format !== SNAPSHOT_FORMAT) throw new Error(`snapshot format ${snap.format}; this build reads ${SNAPSHOT_FORMAT}`);
  const s = structuredClone(snap);
  tree.setState(s.core);
  for (const [name, { kind, data }] of Object.entries(s.services)) {
    const svc = tree.services.get(name);
    if (!svc) throw new Error(`the snapshot has a "${name}" service this tree doesn't: install the same services before restoring`);
    if (kind === 'snapshot') svc.restore(data); else svc.setState(data);
  }
  for (const [id, state] of Object.entries(s.nodes)) {
    const n = tree.byId.get(id);
    if (!n) throw new Error(`snapshot node "${id}" isn't in this tree`);
    n.setState(state);
  }
  tree.root.object3d.updateMatrixWorld(true);
  return tree;
}

// ---------------------------------------------------------------- hashing

// Two 32-bit lanes over a canonical word stream: numbers as their float64 bits (one NaN; -0 stays -0,
// because bit-identical is the requirement), strings as UTF-16 units, typed arrays element by element
// (bytes four at a time). Little-endian platforms only, which is every platform VRMXG runs on.
const F = new Float64Array(1), W = new Uint32Array(F.buffer);

class Hasher {
  constructor() { this.a = 0x811c9dc5; this.b = 0x2545f491; }
  word(w) {
    this.a = Math.imul(this.a ^ w, 0x01000193);
    this.b = Math.imul(this.b ^ w, 0x5bd1e995); this.b ^= this.b >>> 15;
  }
  num(x) { if (x !== x) { this.word(0x7ff80000); this.word(0); return; } F[0] = x; this.word(W[0]); this.word(W[1]); }
  str(s) { this.word(s.length); for (let i = 0; i < s.length; i++) this.word(s.charCodeAt(i)); }
  value(v) {
    if (v === null || v === undefined) { this.word(v === null ? 1 : 2); return; }
    switch (typeof v) {
      case 'number': this.word(3); this.num(v); return;
      case 'boolean': this.word(v ? 4 : 5); return;
      case 'string': this.word(6); this.str(v); return;
      case 'object': break;
      default: throw new Error(`can't hash a ${typeof v}`);
    }
    if (ArrayBuffer.isView(v)) {
      this.word(7); this.word(/** @type {any} */ (v).length);
      if (v instanceof Uint8Array) {
        const n = v.length; let i = 0;
        for (; i + 4 <= n; i += 4) this.word(v[i] | (v[i + 1] << 8) | (v[i + 2] << 16) | (v[i + 3] << 24));
        for (; i < n; i++) this.word(v[i]);
      } else for (const x of /** @type {any} */ (v)) this.num(x);
      return;
    }
    if (Array.isArray(v)) { this.word(8); this.word(v.length); for (const x of v) this.value(x); return; }
    const keys = Object.keys(v);
    this.word(9); this.word(keys.length);
    for (const k of keys) { this.str(k); this.value(v[k]); }
  }
  hex() {
    const f = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0).toString(16).padStart(8, '0'); };
    return f(this.a) + f(this.b);
  }
}

/** A 64-bit hash (16 hex digits) of plain data, typed arrays included. */
export function hashValue(v) { const h = new Hasher(); h.value(v); return h.hex(); }

/**
 * One hash per component of the world's simulated state: clock, rng, timers, one per node (its core
 * record), one per node with its own state (state:id), physics (every body's pose; Rapier's full bytes
 * too with `physicsBytes`, which costs a serialisation), and one per other service with state.
 * @param {any} tree @param {{ physicsBytes?: boolean }} [opts]
 * @returns {Record<string, string>}
 */
export function worldHashes(tree, { physicsBytes = false } = {}) {
  const core = tree.getState();
  /** @type {Record<string, string>} */
  const out = { clock: hashValue(core.clock), rng: hashValue(core.rng), timers: hashValue(core.timers) };
  for (const n of core.nodes) out[`node:${n.id}`] = hashValue(n);
  for (const n of tree.all()) if (typeof n.getState === 'function') out[`state:${n.id}`] = hashValue(n.getState());
  for (const [name, s] of tree.services) {
    if (typeof s.stateVector === 'function') {
      out[name] = hashValue(s.stateVector());
      if (physicsBytes && s.world?.snapshot) out[`${name}:bytes`] = hashValue(s.world.snapshot());
    } else if (typeof s.getState === 'function') out[`service:${name}`] = hashValue(s.getState());
  }
  return out;
}

/**
 * Step a tree and hash it after every step.
 * @param {any} tree @param {number} steps
 * @param {{ physicsBytesEvery?: number, onStep?: (step: number) => void }} [opts] onStep runs before each step
 * @returns {Array<{ step: number, h: Record<string, string> }>} step = the clock after stepping
 */
export function recordRun(tree, steps, { physicsBytesEvery = 0, onStep } = {}) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    onStep?.(tree.clock.step);
    if (!tree.step()) throw new Error(`recordRun: step ${tree.clock.step} is held by pending work (a closet redraw?): record with recordRunAsync`);
    const step = tree.clock.step;
    out.push({ step, h: worldHashes(tree, { physicsBytes: physicsBytesEvery > 0 && step % physicsBytesEvery === 0 }) });
  }
  return out;
}

/**
 * recordRun for runs whose steps a service may hold (closet redraws): waits them out.
 * @param {any} tree @param {number} steps
 * @param {{ physicsBytesEvery?: number, onStep?: (step: number) => void }} [opts]
 */
export async function recordRunAsync(tree, steps, { physicsBytesEvery = 0, onStep } = {}) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    onStep?.(tree.clock.step);
    while (!tree.step()) await tree.settle();
    const step = tree.clock.step;
    out.push({ step, h: worldHashes(tree, { physicsBytes: physicsBytesEvery > 0 && step % physicsBytesEvery === 0 }) });
  }
  return out;
}

/**
 * Compare two recorded runs step by step. null when identical; otherwise the first step that differs,
 * the first differing component in hash order (clock, rng, timers, nodes, node states, services) and all
 * of them at that step. Steps only one run has count as a difference.
 * @param {Array<{ step: number, h: Record<string, string> }>} a
 * @param {Array<{ step: number, h: Record<string, string> }>} b
 */
export function compareRuns(a, b) {
  const byStep = new Map(b.map((r) => [r.step, r.h]));
  for (const { step, h } of a) {
    const g = byStep.get(step);
    if (!g) return { step, component: '(missing)', components: ['(missing)'], a: null, b: null };
    const keys = [...new Set([...Object.keys(h), ...Object.keys(g)])];
    const diff = keys.filter((k) => h[k] !== g[k]);
    if (diff.length) return { step, component: diff[0], components: diff, a: h[diff[0]] ?? null, b: g[diff[0]] ?? null };
  }
  if (b.length !== a.length) { const step = b.find((r) => !a.some((x) => x.step === r.step))?.step ?? -1; return { step, component: '(missing)', components: ['(missing)'], a: null, b: null }; }
  return null;
}

/** compareRuns, as an assertion: throws naming the step and component. */
export function assertSameRun(a, b, label = 'runs') {
  const d = compareRuns(a, b);
  if (d) throw new Error(`${label} diverge at step ${d.step} in ${d.component}${d.components.length > 1 ? ` (and ${d.components.slice(1, 6).join(', ')}${d.components.length > 6 ? ', …' : ''})` : ''}: ${d.a} vs ${d.b}`);
}

/**
 * A recorded run, compact for storage and transport: the component names once, then per step its clock and
 * only the components whose hash changed since the previous step ({ index: hash }).
 * @param {Array<{ step: number, h: Record<string, string> }>} run
 */
export function packRun(run) {
  const components = [...new Set(run.flatMap((r) => Object.keys(r.h)))];
  let prev = {};
  const steps = run.map((r) => {
    /** @type {Record<number, string | null>} */ const changed = {};
    components.forEach((c, i) => { if (r.h[c] !== prev[c]) changed[i] = r.h[c] ?? null; });
    prev = r.h;
    return [r.step, changed];
  });
  return { components, steps };
}

/** The inverse of packRun. @param {{ components: string[], steps: Array<[number, Record<string, string | null>]> }} packed */
export function unpackRun({ components, steps }) {
  /** @type {Record<string, string>} */ let cur = {};
  return steps.map(([step, changed]) => {
    cur = { ...cur };
    for (const [i, h] of Object.entries(changed)) { if (h === null) delete cur[components[Number(i)]]; else cur[components[Number(i)]] = h; }
    return { step, h: cur };
  });
}
