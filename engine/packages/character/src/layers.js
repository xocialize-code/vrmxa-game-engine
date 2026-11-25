// Character layers (M5 W7, AB-T-0609; the design note is LAYERS.md, decision AB-D-0289): named layers over the
// character's animation, each with a bone mask (VRM humanoid bone groups, masks.js), a blend type (overwrite or
// additive) and a weight. A pose pass after the mixer, on the normalized humanoid bones, each layer over the result of
// the ones before it. Deterministic like the rest of the character: weights move by whole steps, times by the fixed
// step, every slerp (keyframe sampling included) through @vrmxg/dmath; the state is plain data in the character's
// snapshot, present only while a layer plays, so a character that never plays one hashes as it did.
import { acos, sin } from '@vrmxg/dmath';
import { MASKS } from './masks.js';

/** The layers a character has without a `layers` prop, applied in this order. */
export const DEFAULT_LAYERS = Object.freeze([
  Object.freeze({ name: 'upperBody', mask: 'upperBody', blend: 'overwrite', weight: 1 }),
  Object.freeze({ name: 'arms', mask: 'arms', blend: 'overwrite', weight: 1 }),
  Object.freeze({ name: 'face', mask: 'face', blend: 'overwrite', weight: 1 }),
  Object.freeze({ name: 'additive', mask: 'fullBody', blend: 'additive', weight: 1 }),
]);
export const BLENDS = Object.freeze(['overwrite', 'additive']);
/** Every humanoid bone the masks name (fullBody's list). */
const ALL_BONES = [...MASKS.lowerBody, ...MASKS.upperBody];
const HZ = 60;

/**
 * A `layers` prop (or the defaults) checked and filled in: [{ name, mask, blend, weight }].
 * @param {any} prop
 */
export function layerDefs(prop) {
  if (prop == null) return DEFAULT_LAYERS;
  if (!Array.isArray(prop)) throw new Error('a character\'s layers prop is a list of { name, mask, blend, weight }');
  const seen = new Set();
  return prop.map((l, i) => {
    if (!l || typeof l.name !== 'string' || !l.name) throw new Error(`layer ${i} needs a name`);
    if (seen.has(l.name)) throw new Error(`two layers are named "${l.name}"`);
    seen.add(l.name);
    const mask = l.mask ?? 'upperBody';
    if (typeof mask === 'string' ? !(mask in MASKS) : !Array.isArray(mask) || mask.some((b) => typeof b !== 'string')) throw new Error(`layer "${l.name}": a mask is one of ${Object.keys(MASKS).join(', ')} or a list of humanoid bone names`);
    const blend = l.blend ?? 'overwrite';
    if (!BLENDS.includes(blend)) throw new Error(`layer "${l.name}": blend is overwrite or additive, not "${blend}"`);
    const weight = l.weight ?? 1;
    if (typeof weight !== 'number' || !(weight >= 0 && weight <= 1)) throw new Error(`layer "${l.name}": weight is a number from 0 to 1`);
    return { name: l.name, mask, blend, weight };
  });
}

/** The humanoid bone names a mask covers. */
export function maskBones(mask) { return Array.isArray(mask) ? mask : (MASKS[mask] ?? ALL_BONES); }

/**
 * Slerp a → b by t into out[o..o+3], through dmath (shortest arc; a normalized lerp when they nearly agree).
 * @param {ArrayLike<number> & { [i: number]: number }} out
 */
export function slerpInto(out, o, ax, ay, az, aw, bx, by, bz, bw, t) {
  let d = ax * bx + ay * by + az * bz + aw * bw;
  if (d < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; d = -d; }
  let ka = 1 - t, kb = t;
  if (d < 0.9995) { const th = acos(d), s = sin(th); ka = sin((1 - t) * th) / s; kb = sin(t * th) / s; }
  const x = ax * ka + bx * kb, y = ay * ka + by * kb, z = az * ka + bz * kb, w = aw * ka + bw * kb;
  const n = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
  out[o] = x / n; out[o + 1] = y / n; out[o + 2] = z / n; out[o + 3] = w / n;
}

/**
 * A keyframe track's value at time t into out (linear: slerp for quaternions, lerp for vectors; discrete: held).
 * Clamped to the first and last keys. Tracks with tangents (cubic splines) go through three's own interpolant.
 */
export function sampleTrack(track, t, out) {
  const times = track.times, v = track.values, n = v.length / times.length;
  if (n !== 3 && n !== 4) { const r = track.createInterpolant().evaluate(t); for (let i = 0; i < r.length; i++) out[i] = r[i]; return; }
  const last = times.length - 1;
  let i;
  if (t <= times[0]) i = 0;
  else if (t >= times[last]) i = last;
  else { let lo = 0, hi = last; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; } i = lo; }
  const a = i * n;
  if (i === last || t <= times[i] || track.getInterpolation() === 2300 /* InterpolateDiscrete */) { for (let k = 0; k < n; k++) out[k] = v[a + k]; return; }
  const b = a + n, alpha = (t - times[i]) / (times[i + 1] - times[i]);
  if (n === 4) slerpInto(out, 0, v[a], v[a + 1], v[a + 2], v[a + 3], v[b], v[b + 1], v[b + 2], v[b + 3], alpha);
  else for (let k = 0; k < 3; k++) out[k] = v[a + k] + (v[b + k] - v[a + k]) * alpha;
}

const _src = new Float64Array(4), _acc = new Float64Array(4), _q = new Float64Array(4);

/**
 * The character's layers: their definitions (the node's `layers` prop), their state (what plays on each) and the pose
 * pass. One per Character, made when its body is put on and kept across a body swap.
 */
export class CharacterLayers {
  /** @param {any} character a CharacterNode with its VRM, actions and clip facts */
  constructor(character) {
    this.ch = character;
    /** layer name → what plays on it (plain data, the snapshot's) */ this.state = new Map();
    this.bind();
  }

  /**
   * (Re)read the layer list and the body's bones: a new body, or the `layers` prop changed (replaced or edited in place:
   * it is compared by value, so a track keying `props.layers.0.weight` and a restore that brings a new copy agree). What
   * plays on a layer the list no longer has stops at once.
   */
  bind() {
    const ch = this.ch, h = ch.vrm?.humanoid;
    this.key = JSON.stringify(ch.props.layers ?? null);
    this.defs = layerDefs(ch.props.layers);
    for (const name of [...this.state.keys()]) if (!this.defs.some((d) => d.name === name)) this.state.delete(name);
    /** layer name → its bones on this body: [{ node, hips }] */
    this.bones = new Map(this.defs.map((d) => {
      const seen = new Set(), list = [];
      for (const b of maskBones(d.mask)) { const node = h?.getNormalizedBoneNode(b); if (node && !seen.has(node)) { seen.add(node); list.push({ node, hips: b === 'hips' }); } }
      return /** @type {[string, Array<{ node: any, hips: boolean }>]} */ ([d.name, list]);
    }));
    const rest = h?.normalizedRestPose?.hips?.position;
    this.restHips = rest ? [rest[0], rest[1], rest[2]] : [0, 0, 0];
    /** clip sha → Map(node name → { q, p }) */ this.tracks = new Map();
  }

  /** Re-bind when the `layers` prop's value changed. */
  sync() { if (JSON.stringify(this.ch.props.layers ?? null) !== this.key) this.bind(); }

  def(name) {
    this.sync();
    const d = this.defs.find((x) => x.name === name);
    if (!d) throw new Error(`no layer "${name}" (${this.defs.map((x) => x.name).join(', ')})`);
    return d;
  }

  /** A clip's tracks by normalized node name. */
  tracksOf(sha) {
    let m = this.tracks.get(sha);
    if (m) return m;
    m = new Map();
    for (const t of this.ch.actions.get(sha)?.getClip().tracks ?? []) {
      const dot = t.name.lastIndexOf('.'), node = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
      if (prop !== 'quaternion' && prop !== 'position') continue;
      const e = m.get(node) ?? {}; e[prop === 'quaternion' ? 'q' : 'p'] = t; m.set(node, e);
    }
    this.tracks.set(sha, m);
    return m;
  }

  /**
   * A clip by sha256 or by name, or a slot as the equipped sets resolve it now (chosen by weight from the character's random stream).
   * @param {{ clip?: string, slot?: string }} o
   */
  resolve({ clip, slot }) {
    const ch = this.ch;
    if (clip) {
      const sha = ch.actions.has(clip) ? clip : ch.clipByName.get(clip);
      if (!sha) throw new Error(`${ch.id}: no clip "${clip}"`);
      return sha;
    }
    if (slot) {
      const list = ch.graph?.slots?.[slot]?.clips ?? [];
      if (!list.length) throw new Error(`${ch.id}: the slot "${slot}" is empty in what she has on`);
      const total = list.reduce((a, e) => a + (e.weight ?? 1), 0);
      let x = ch.graph.rand() * total, chosen = list[list.length - 1];
      for (const e of list) { x -= e.weight ?? 1; if (x <= 0) { chosen = e; break; } }
      if (!ch.actions.has(chosen.clip)) throw new Error(`${ch.id}: the slot "${slot}" names a clip she doesn't have`);
      return chosen.clip;
    }
    throw new Error('a layer plays a clip or a slot');
  }

  /**
   * Throw now if play() would throw (no such layer, no such clip, an empty slot), without drawing from the random
   * stream: a caller that changes the world first (interact's carry) asks before it does.
   * @param {string} name @param {{ clip?: string, slot?: string, loop?: boolean, rate?: number }} o
   */
  check(name, { clip, slot, loop = true, rate = 1 } = {}) {
    this.def(name);
    if (!loop && !(rate > 0)) throw new Error('a one-shot on a layer plays forwards (rate > 0)');
    if (clip) this.resolve({ clip });
    else if (slot) { if (!this.ch.graph?.slots?.[slot]?.clips?.length) throw new Error(`${this.ch.id}: the slot "${slot}" is empty in what she has on`); }
    else throw new Error('a layer plays a clip or a slot');
  }

  /**
   * Play a clip on a layer, fading its weight to `weight` over `fade` seconds; a clip already playing there cross-fades
   * into the new one over the same time (during a cross-fade, from whichever of the two weighs more now). The loop
   * already playing, asked for again without an offset, goes on from where it is. A one-shot (`loop: false`) fades out
   * over its last `fade` seconds of playback and the layer goes idle.
   * @param {string} name @param {{ clip?: string, slot?: string, loop?: boolean, rate?: number, fade?: number, weight?: number, offset?: number }} o
   */
  play(name, { clip, slot, loop = true, rate = 1, fade = 0.25, weight = 1, offset } = {}) {
    this.check(name, { clip, slot, loop, rate });
    const sha = this.resolve({ clip, slot });
    const steps = Math.max(0, Math.round(fade * HZ)), was = this.state.get(name);
    const s = { clip: sha, slot: slot ?? null, loop: !!loop, rate, t: offset ?? 0, w: was?.w ?? 0, fade: null, out: steps, stopping: false, prev: null, xf: null };
    if (was && was.clip === sha && loop && was.loop && offset === undefined) { s.t = was.t; s.prev = was.prev; s.xf = was.xf; } // the same loop goes on
    else if (was && was.w > 0 && steps > 0) {
      const k = was.xf ? 1 - was.xf[0] / was.xf[1] : 1, from = was.prev && k < 0.5 ? was.prev : { clip: was.clip, loop: was.loop, rate: was.rate, t: was.t };
      if (from.clip !== sha) { s.prev = { ...from }; s.xf = [steps, steps]; }
    }
    fadeTo(s, Math.max(0, Math.min(1, weight)), steps);
    this.state.set(name, s);
  }

  /** Fade a layer out over `fade` seconds; it goes idle at 0. */
  stop(name, { fade = 0.25 } = {}) {
    this.sync();
    const s = this.state.get(name);
    if (!s) { this.def(name); return; }
    if (!s) return;
    s.stopping = true;
    fadeTo(s, 0, Math.max(0, Math.round(fade * HZ)));
  }

  /** Fade what plays on a layer to another weight (nothing plays: nothing to do). */
  weight(name, weight, { fade = 0.25 } = {}) {
    this.sync();
    const s = this.state.get(name);
    if (!s) this.def(name);
    if (s && !s.stopping) fadeTo(s, Math.max(0, Math.min(1, weight)), Math.max(0, Math.round(fade * HZ)));
  }

  /** True while something plays on the layer. */
  playing(name) { const s = this.state.get(name); return !!s && !s.stopping; }

  /** Advance one step: times by dt, weights by a step of their fades; a one-shot starts fading out near its end. */
  step(dt) {
    this.sync();
    for (const [name, s] of this.state) {
      s.t += dt * s.rate;
      if (s.prev) s.prev.t += dt * s.prev.rate;
      if (s.xf && --s.xf[0] <= 0) { s.xf = null; s.prev = null; }
      if (s.fade) { const f = s.fade; f[2]--; s.w = f[2] > 0 ? f[1] + (f[0] - f[1]) * (f[2] / f[3]) : f[1]; if (f[2] <= 0) s.fade = null; }
      if (!s.loop && !s.stopping) {
        const d = this.duration(s.clip);
        const left = (d - s.t) / s.rate; // seconds of playback to the clip's end
        if (left <= s.out / HZ) { s.stopping = true; fadeTo(s, 0, Math.max(0, Math.round(left * HZ))); }
      }
      if (s.stopping && !s.fade && s.w <= 0) this.state.delete(name);
    }
  }

  duration(sha) { return this.ch.clipInfo.get(sha)?.duration || 1; }
  /** A clip's local time: wrapped when it loops, else held at its ends. */
  local(sha, t, loop) { const d = this.duration(sha); return loop ? t - Math.floor(t / d) * d : Math.min(Math.max(0, t), d); }

  /**
   * The pose pass, after the mixer: every layer in order over the pose below it. `trackLayers` is what a sequence's
   * layer tracks ask for this step ({ [layer]: { weight, clips: [{ clip | slot, time, loop, weight }] } }).
   */
  apply(trackLayers = null) {
    this.sync();
    const ch = this.ch;
    if (!this.state.size && !hasTrackLayer(trackLayers)) return;
    // what each layer plays: [{ bones, blend, groups: [{ w, sources: [{ sha, time, weight }] }] }]
    const plan = [];
    for (const d of this.defs) {
      const groups = [], s = this.state.get(d.name), tl = trackLayers?.[d.name];
      if (s && s.w * d.weight > 0) {
        const k = s.xf ? 1 - s.xf[0] / s.xf[1] : 1, sources = [];
        if (s.prev && k < 1) sources.push({ sha: s.prev.clip, time: this.local(s.prev.clip, s.prev.t, s.prev.loop), weight: 1 - k });
        sources.push({ sha: s.clip, time: this.local(s.clip, s.t, s.loop), weight: k });
        groups.push({ w: s.w * d.weight, sources });
      }
      if (tl && tl.weight * d.weight > 0) {
        const sources = [];
        for (const c of tl.clips ?? []) { const r = ch.resolveTrackClip(c); if (r && c.weight > 0) sources.push({ sha: r.clip, time: r.time, weight: c.weight }); }
        if (sources.length) groups.push({ w: Math.min(1, tl.weight) * d.weight, sources });
      }
      if (groups.length) plan.push({ bones: this.bones.get(d.name) ?? [], blend: d.blend, groups });
    }
    // Every clip a layer plays is one of the mixer's (resolve and resolveTrackClip ask for its action), so every bone a
    // layer writes is bound in the mixer, which writes it back to its value at rest whenever no clip weights it
    // (writeEveryBinding): nothing a layer wrote outlives the step it was written on.
    for (const p of plan) for (const { node, hips } of p.bones) {
      for (const g of p.groups) {
        if (mix(this, g.sources, node.name, 'q', node.quaternion, _acc)) {
          const b = node.quaternion;
          if (p.blend === 'additive') { slerpInto(_q, 0, 0, 0, 0, 1, _acc[0], _acc[1], _acc[2], _acc[3], g.w); mulInto(b, _q); }
          else { slerpInto(_q, 0, b.x, b.y, b.z, b.w, _acc[0], _acc[1], _acc[2], _acc[3], g.w); b.set(_q[0], _q[1], _q[2], _q[3]); }
        }
        if (hips && mix(this, g.sources, node.name, 'p', node.position, _acc)) {
          const b = node.position, r = this.restHips;
          if (p.blend === 'additive') b.set(b.x + g.w * (_acc[0] - r[0]), b.y + g.w * (_acc[1] - r[1]), b.z + g.w * (_acc[2] - r[2]));
          else b.set(b.x + (_acc[0] - b.x) * g.w, b.y + (_acc[1] - b.y) * g.w, b.z + (_acc[2] - b.z) * g.w);
        }
      }
    }
  }

  /** The layers' state, or null when nothing plays (so an unlayered character's state is as it was). */
  getState() {
    if (!this.state.size) return null;
    return structuredClone({ playing: Object.fromEntries(this.state) });
  }
  setState(s) {
    this.state = new Map(Object.entries(structuredClone(s?.playing ?? {})));
  }
}

function fadeTo(s, to, steps) {
  if (steps <= 0 || s.w === to) { s.w = to; s.fade = null; } else s.fade = [s.w, to, steps, steps];
}

function hasTrackLayer(tl) { if (!tl) return false; for (const k in tl) if (tl[k]) return true; return false; }

/**
 * Mix a group's sources on one node's channel (q or p) into out: the first source's value, then each next one slerped
 * in by its share of the weight so far. A source without the channel stands in with the pose below (`below`). False
 * when no source animates it.
 */
function mix(L, sources, node, ch, below, out) {
  let any = false;
  for (const x of sources) if (L.tracksOf(x.sha).get(node)?.[ch]) { any = true; break; }
  if (!any) return false;
  let acc = 0, first = true;
  for (const x of sources) {
    const t = L.tracksOf(x.sha).get(node)?.[ch];
    if (t) sampleTrack(t, x.time, _src);
    else if (ch === 'q') { _src[0] = below.x; _src[1] = below.y; _src[2] = below.z; _src[3] = below.w; }
    else { _src[0] = below.x; _src[1] = below.y; _src[2] = below.z; }
    acc += x.weight;
    if (first) { for (let i = 0; i < 4; i++) out[i] = _src[i]; first = false; continue; }
    if (!(acc > 0)) continue;
    const k = x.weight / acc;
    if (ch === 'q') slerpInto(out, 0, out[0], out[1], out[2], out[3], _src[0], _src[1], _src[2], _src[3], k);
    else for (let i = 0; i < 3; i++) out[i] += (_src[i] - out[i]) * k;
  }
  return true;
}

/** q ← q · r (three's Quaternion and a plain [x, y, z, w]). */
function mulInto(q, r) {
  const ax = q.x, ay = q.y, az = q.z, aw = q.w, bx = r[0], by = r[1], bz = r[2], bw = r[3];
  q.set(ax * bw + aw * bx + ay * bz - az * by, ay * bw + aw * by + az * bx - ax * bz, az * bw + aw * bz + ax * by - ay * bx, aw * bw - ax * bx - ay * by - az * bz);
}
