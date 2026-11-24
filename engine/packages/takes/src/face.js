// A face take (M4 W9): the camera's view of the person's face drives one character's expressions and head.
//
// The log is the face samples a capture path gave (the Mac shell's, or a recorded or synthetic session), as measured and
// stamped with the step each applies on:
//   { step, blinkL, blinkR, jaw, smile, browUp, browDown, yaw, pitch, roll }
// blinkL … browDown run 0 to 1 and are the person's own (blinkL: their left eye shut; jaw: the mouth open; browDown: a
// frown). yaw, pitch and roll are their head in radians: yaw to their left, pitch up, roll to their left shoulder.
// Which path made them is setup.source; nothing below depends on it.
//
// FaceFilter makes a character's face from them, one sample at a time and never looking ahead, so the live monitor
// (recorder.js) and the derivation below give the same values:
//   - a resting face: the median of the first `neutralSamples` (hold still as the take starts), or setup.neutral. Until
//     it is known her face stays as the film has it;
//   - each value less its rest, past a dead zone, times a gain, smoothed over a few steps (a time constant in steps, so
//     it is the same curve whatever rate the camera ran at);
//   - blinks from each eye's own rest (some eyes are narrower, and a capture path may read an open eye as a third shut)
//     through a soft threshold, so an eye is open or shut and little between, and the squint of a smile stays open; both
//     eyes together are `blink`, and only what one eye does beyond the other is a wink (`blinkLeft`, `blinkRight`);
//   - mirrored by default, as a mirror would show the person: their left eye is her right, and she turns the way their
//     head turns on screen.
// faceTracks keys what the filter gives on the step of each sample, thins the keys, and ends every channel at rest:
//   expressions → a released expression track (blink, aa, happy, surprised, angry; a persona's own names through setup.expressions)
//   the head    → a released property track on props.head ([yaw, pitch, roll] over her animation)
import { exp } from '@vrmxg/dmath';
import { frameOfStep, r3, r4, clamp } from './take.js';
import { reduceKeys } from './reduce.js';

export const FACE_FIELDS = ['blinkL', 'blinkR', 'jaw', 'smile', 'browUp', 'browDown', 'yaw', 'pitch', 'roll'];
/** What a face take can drive; setup.channels picks among them. */
export const FACE_CHANNELS = ['blink', 'mouth', 'smile', 'brows', 'head'];

export const FACE_DEFAULTS = {
  mirror: true,
  channels: FACE_CHANNELS,
  /** samples the resting face is the median of (about a second at 15 a second) */ neutralSamples: 15,
  /** the resting face, when the take brings its own: { blinkL, blinkR, jaw, smile, browUp, browDown, yaw, pitch, roll } */ neutral: null,
  /** smoothing time constants, in steps (1/60 s) */ tau: { blink: 1.5, jaw: 2.5, smile: 5, brow: 5, head: 4 },
  /** below this much past rest, nothing */ dead: { jaw: 0.05, smile: 0.06, brow: 0.08 },
  gain: { jaw: 1.2, smile: 1.15, brow: 1.25, head: [1, 1, 1] },
  /**
   * how far from its rest to shut an eye reads open at, and shut at. The spike's faces (spike-face/README.md): a smile
   * narrows an eye 0.13 to 0.30 of the way with Vision (up to 0.18 with MediaPipe), and a blink shuts it 0.41 to 0.99
   * of the way (0.28 to 0.77)
   */
  blink: [0.25, 0.55],
  /** how far the head turns: [yaw, pitch, roll] in rad */ limit: [0.7, 0.45, 0.4],
  /** the VRM expressions each part drives, and how strongly (VRM 1.0 presets; a character without one ignores it) */
  expressions: { blink: 'blink', blinkLeft: 'blinkLeft', blinkRight: 'blinkRight', jaw: 'aa', smile: 'happy', browUp: 'surprised', browDown: 'angry' },
  weights: { jaw: 1, smile: 0.9, browUp: 0.5, browDown: 0.5 },
  /** steps after the last sample by which every channel is back at rest */ settle: 8,
  /** tolerances when the keys are thinned: expression weights, and the head in rad */ tolerance: { expression: 0.03, head: 0.012 },
};

/** A take's setup over the defaults. */
export function faceSetup(setup = {}) {
  const o = { ...FACE_DEFAULTS, ...setup };
  for (const k of ['tau', 'dead', 'gain', 'expressions', 'weights', 'tolerance']) o[k] = { ...FACE_DEFAULTS[k], ...(setup[k] ?? {}) };
  return o;
}

const REST = ['blinkL', 'blinkR', 'jaw', 'smile', 'browUp', 'browDown', 'yaw', 'pitch', 'roll'];
const median = (list) => { const a = [...list].sort((x, y) => x - y), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const num = (v) => (typeof v === 'number' && v === v ? v : 0);
const soft = (v, lo, hi) => { const c = clamp((v - lo) / (hi - lo), 0, 1); return c * c * (3 - 2 * c); };

export class FaceFilter {
  constructor(setup = {}) {
    this.o = faceSetup(setup);
    /** the resting face, once known */ this.rest = this.o.neutral ? Object.fromEntries(REST.map((k) => [k, num(this.o.neutral[k])])) : null;
    this.first = [];
    /** the step of the last sample taken in */ this.at = null;
    /** smoothed values (the person's own, before the mirror) */ this.v = { blinkL: 0, blinkR: 0, jaw: 0, smile: 0, browUp: 0, browDown: 0, yaw: 0, pitch: 0, roll: 0 };
  }

  /** True once the resting face is known: from then on values() is her face. */
  get ready() { return !!this.rest && this.at !== null; }

  /** One sample in (in step order). */
  push(s) {
    const o = this.o;
    if (!this.rest) {
      this.first.push(s);
      if (this.first.length < o.neutralSamples) return;
      this.rest = Object.fromEntries(REST.map((k) => [k, median(this.first.map((x) => num(x[k])))]));
      this.first = [];
    }
    const dt = this.at === null ? null : s.step - this.at;
    this.at = s.step;
    const ease = (key, x, tau) => { const k = dt === null ? 1 : dt <= 0 ? 0 : 1 - exp(-dt / tau); this.v[key] += (x - this.v[key]) * k; };
    const past = (key, dead, gain) => { const r = this.rest[key], span = 1 - r - dead; return span > 0 ? clamp(((num(s[key]) - r - dead) / span) * gain, 0, 1) : 0; };
    const shut = (key) => { const r = Math.min(0.8, this.rest[key]); return soft((num(s[key]) - r) / (1 - r), o.blink[0], o.blink[1]); };
    ease('blinkL', shut('blinkL'), o.tau.blink);
    ease('blinkR', shut('blinkR'), o.tau.blink);
    ease('jaw', past('jaw', o.dead.jaw, o.gain.jaw), o.tau.jaw);
    ease('smile', past('smile', o.dead.smile, o.gain.smile), o.tau.smile);
    ease('browUp', past('browUp', o.dead.brow, o.gain.brow), o.tau.brow);
    ease('browDown', past('browDown', o.dead.brow, o.gain.brow), o.tau.brow);
    ['yaw', 'pitch', 'roll'].forEach((key, i) => ease(key, clamp((num(s[key]) - this.rest[key]) * o.gain.head[i], -o.limit[i], o.limit[i]), o.tau.head));
  }

  /**
   * Her face now: { expressions: { name: weight }, head: [yaw, pitch, roll] | null }, only the channels the take drives.
   * Weights are kept to three decimals and angles to four, which is what the keys hold.
   */
  values() {
    const o = this.o, v = this.v, on = (c) => o.channels.includes(c), e = o.expressions, w = o.weights, out = {};
    const put = (name, x) => { if (name) out[name] = r3(Math.max(out[name] ?? 0, x)); };
    if (on('blink')) {
      const left = o.mirror ? v.blinkR : v.blinkL, right = o.mirror ? v.blinkL : v.blinkR, both = Math.min(left, right);
      put(e.blink, both); put(e.blinkLeft, left - both); put(e.blinkRight, right - both);
    }
    if (on('mouth')) put(e.jaw, v.jaw * w.jaw);
    if (on('smile')) put(e.smile, v.smile * w.smile);
    if (on('brows')) { put(e.browUp, v.browUp * w.browUp); put(e.browDown, v.browDown * w.browDown); }
    const head = on('head') ? [r4(o.mirror ? -v.yaw : v.yaw), r4(v.pitch), r4(o.mirror ? -v.roll : v.roll)] : null;
    return { expressions: out, head };
  }
}

/** Her face on the step of each sample, as the filter gives it: [{ step, expressions, head }] (from the first ready one). */
export function faceSamples(take) {
  const f = new FaceFilter(take.setup), out = [];
  for (const s of take.log.face) {
    if (s.step < take.start || s.step >= take.end) continue;
    f.push(s);
    if (f.ready) out.push({ step: s.step, ...f.values() });
  }
  return out;
}

/**
 * A face take's tracks (pure): a released expression track and a released props.head track, each channel starting from
 * rest, keyed where the samples fell, thinned, and back at rest `settle` steps after the last sample.
 * @param {any} take @returns {any[]}
 */
export function faceTracks(take) {
  const o = faceSetup(take.setup), fps = take.fps, samples = faceSamples(take);
  if (!samples.length) return [];
  const mark = { take: take.id, by: 'face' }, id = (what) => `${take.target}-${what}-${take.id}`;
  const first = samples[0].step, last = samples[samples.length - 1].step;
  const before = first > take.start ? frameOfStep(first - 1, fps) : null, after = frameOfStep(last + Math.max(1, o.settle), fps);
  const tracks = [], keys = {};
  for (const name of Object.keys(samples[0].expressions).sort()) {
    const ks = samples.map((s) => [frameOfStep(s.step, fps), s.expressions[name]]);
    if (!ks.some((k) => k[1] !== 0)) continue; // a channel that never left rest keys nothing
    keys[name] = reduceKeys([...(before !== null ? [[before, 0]] : []), ...ks, [after, 0]], o.tolerance.expression);
  }
  if (Object.keys(keys).length) tracks.push({ id: id('face'), type: 'expression', target: take.target, release: true, ...mark, keys });
  if (samples[0].head && samples.some((s) => s.head.some((x) => x !== 0))) {
    const ks = samples.map((s) => [frameOfStep(s.step, fps), s.head]);
    tracks.push({ id: id('head'), type: 'property', target: take.target, path: 'props.head', release: true, ...mark, keys: reduceKeys([...(before !== null ? [[before, [0, 0, 0]]] : []), ...ks, [after, [0, 0, 0]]], o.tolerance.head) });
  }
  return tracks;
}

const BS = (b, ...names) => { let m = 0; for (const n of names) m = Math.max(m, num(b[n])); return m; };
/**
 * A face sample from the 52 ARKit-style blendshape scores MediaPipe's face landmarker gives (and its head angles): the
 * person's own left and right, as the model names them.
 * @param {Record<string, number>} b scores by name @param {{ yaw?: number, pitch?: number, roll?: number }} [head]
 */
export function faceFromBlendshapes(b, head = {}) {
  return {
    blinkL: r4(num(b.eyeBlinkLeft)), blinkR: r4(num(b.eyeBlinkRight)), jaw: r4(num(b.jawOpen)),
    smile: r4((num(b.mouthSmileLeft) + num(b.mouthSmileRight)) / 2),
    browUp: r4(Math.max(num(b.browInnerUp), (num(b.browOuterUpLeft) + num(b.browOuterUpRight)) / 2)),
    browDown: r4(BS(b, 'browDownLeft', 'browDownRight')),
    yaw: r4(num(head.yaw)), pitch: r4(num(head.pitch)), roll: r4(num(head.roll)),
  };
}

/**
 * A face sample from a camera feature frame's face (the Mac shell's `camera.frame`, with `face.shape` when the shell
 * measures it: M4 W9), or null when the frame has no face or no shape. Feature frames are mirrored as a selfie preview,
 * so their angles are turned back into the person's own.
 */
export function faceFromFeatures(frame) {
  const f = frame?.face, s = f?.shape;
  if (!f || !s) return null;
  return {
    blinkL: r4(num(s.blinkL)), blinkR: r4(num(s.blinkR)), jaw: r4(num(s.jaw)), smile: r4(num(s.smile)), browUp: r4(num(s.browUp)), browDown: r4(num(s.browDown)),
    yaw: r4(num(s.yaw ?? f.yaw)), pitch: r4(num(s.pitch ?? f.pitch)), roll: r4(num(s.roll ?? f.roll)),
  };
}
