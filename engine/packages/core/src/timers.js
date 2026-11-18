// Step-driven timers and tweens. Time is counted in steps (integers), never in wall seconds, so a
// timer fires on the same step on every run. Each belongs to a node and dies with it; a paused node's
// timers don't advance, and a node's time scale stretches them (accumulated in fractional steps).
import { HZ } from './clock.js';
import { Quaternion } from 'three';

const toSteps = (seconds) => Math.max(1, Math.round(seconds * HZ));

export const EASINGS = {
  linear: (t) => t,
  quadIn: (t) => t * t,
  quadOut: (t) => t * (2 - t),
  quadInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  cubicIn: (t) => t * t * t,
  cubicOut: (t) => { const u = t - 1; return u * u * u + 1; },
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  smoothstep: (t) => t * t * (3 - 2 * t),
  sineInOut: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t), // Math.cos is portable once dmath is installed
};

export class TimerService {
  constructor() { /** @type {Map<number, any>} */ this.items = new Map(); this.nextId = 1; }

  /**
   * Run `fn` after `seconds` (rounded to whole steps, at least one). `repeat` re-arms it.
   * @param {import('./node.js').Node} owner
   * @param {number} seconds
   * @param {() => void} fn
   * @param {{ repeat?: boolean }} [opts]
   */
  after(owner, seconds, fn, { repeat = false } = {}) {
    const id = this.nextId++;
    this.items.set(id, { kind: 'timer', id, owner, steps: toSteps(seconds), left: toSteps(seconds), fn, repeat, acc: 0 });
    return id;
  }

  /**
   * Tween a value on `target` at a dotted path ("position", "props.intensity", "quaternion") from its
   * current value (or `from`) to `to` over `seconds`. Numbers and number arrays interpolate per
   * component; a quaternion path ("quaternion") slerps.
   * @param {any} owner @param {any} target @param {string} path @param {any} to @param {number} seconds
   * @param {{ from?: any, ease?: string, onDone?: () => void }} [opts]
   */
  tween(owner, target, path, to, seconds, { from, ease = 'linear', onDone } = {}) {
    const id = this.nextId++;
    const start = from ?? clone(read(target, path));
    this.items.set(id, { kind: 'tween', id, owner, target, path, from: start, to, steps: toSteps(seconds), done: 0, ease: EASINGS[ease] ?? EASINGS.linear, onDone, acc: 0 });
    return id;
  }

  cancel(id) { this.items.delete(id); }
  cancelOwnedBy(owner) { for (const [id, t] of this.items) if (t.owner === owner) this.items.delete(id); }

  /**
   * Advance everything by one simulation step, in creation order.
   * @param {(node: any) => number} scaleOf effective time scale of a node (0 when paused)
   */
  step(scaleOf) {
    for (const t of [...this.items.values()]) {
      if (!this.items.has(t.id)) continue;
      t.acc += scaleOf(t.owner);
      while (t.acc >= 1 && this.items.has(t.id)) {
        t.acc -= 1;
        if (t.kind === 'timer') {
          if (--t.left > 0) continue;
          if (t.repeat) t.left = t.steps; else this.items.delete(t.id);
          t.fn();
        } else {
          t.done++;
          const k = t.ease(Math.min(1, t.done / t.steps));
          write(t.target, t.path, lerpValue(t.from, t.to, k, t.path));
          if (t.done >= t.steps) { this.items.delete(t.id); t.onDone?.(); }
        }
      }
    }
  }

  getState() { return { nextId: this.nextId, items: [...this.items.values()].map(({ fn, onDone, owner, target, ease, ...rest }) => ({ ...rest, owner: owner?.id })) }; }

  /**
   * Restore counters onto the timers this tree already has, matched by id. Timers hold code (closures),
   * so a snapshot can only resume timers the same code created in the same order (in ready(), say):
   * one created at run time and missing here can't be brought back, and that is an error, not a guess.
   */
  setState(s) {
    const want = new Map(s.items.map((t) => [t.id, t]));
    for (const [id, t] of want) if (!this.items.has(id)) throw new Error(`timer ${id} (${t.kind} owned by "${t.owner}") was created at run time; a snapshot can't recreate its code`);
    for (const id of [...this.items.keys()]) if (!want.has(id)) this.items.delete(id);
    for (const [id, t] of want) {
      const live = this.items.get(id);
      for (const k of ['left', 'steps', 'acc', 'done', 'repeat', 'from', 'to', 'path']) if (k in t) live[k] = structuredClone(t[k]);
    }
    this.nextId = s.nextId;
  }
}

function read(obj, path) { return path.split('.').reduce((o, k) => o?.[k], obj); }
function write(obj, path, value) {
  const ks = path.split('.'); const last = ks.pop();
  const o = ks.reduce((x, k) => x[k], obj);
  const cur = o[last];
  if (cur && typeof cur.fromArray === 'function' && Array.isArray(value)) cur.fromArray(value); // Vector3, Quaternion, Color
  else o[last] = value;
}
function clone(v) { return v && typeof v.toArray === 'function' ? v.toArray() : Array.isArray(v) ? [...v] : v; }

const qa = new Quaternion(), qb = new Quaternion();
function lerpValue(a, b, k, path) {
  if (typeof a === 'number') return a + (b - a) * k;
  if (Array.isArray(a)) {
    if (path.endsWith('quaternion') && a.length === 4) return qa.fromArray(a).slerp(qb.fromArray(b), k).toArray();
    return a.map((x, i) => x + (b[i] - x) * k);
  }
  return k < 1 ? a : b;
}
