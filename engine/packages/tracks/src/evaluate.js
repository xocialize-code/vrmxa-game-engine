// The track core (M2 W0, AB-T-0523; research/cinematics.md §1.1): every authored track is evaluated as a pure
// function of the frame. No clocks, no tweens left running, no crossFadeTo: the same frame always gives the same
// values, whether it was reached by playing or by jumping to it. One core serves the AnimationPlayer node (doors,
// items, small cutscenes) and, from W1, sequences.
//
// A track:  { id, type, target?, path?, step?, interp?, keys? | clips? }
//   keys    [[frame, value, ease?], …] sorted by frame; `ease` shapes the segment arriving at that key (a name,
//           a bezier [x1, y1, x2, y2], or 'step'); `interp: 'step'` holds every key
//   step    hold on ones / twos / threes: the frame is floored to a multiple of `step` before evaluation (anime
//           timing: a character moving on twos while the camera moves on ones)
//   release true: the track holds its target only from its first key to its last (an expression track: each channel
//           from its own first key to its last); an animation track plays over the animation track before it instead
//           of replacing it, and leaves it alone between its clips. A performance take's tracks (M4 W9) are released,
//           so a take covers its own span and the film's other tracks keep the rest
//
// Types:
//   property    target + path ("props.intensity", "visible"); numbers, number arrays and #rrggbb colours blend,
//               anything else holds
//   transform   target; keys' values { p?, q?, s? }: p and s blend linearly, q by slerp
//   expression  target (a Character); keys: { expressionName: [[frame, value, ease?], …] }
//   event       keys [[frame, { target, call, args? } | { emit, args? }]]: fired as playback crosses them, not on a jump
//   audio       clips [{ start, end, asset, offset?, gain? , bus? }]: which sound plays at the frame, from where
//   animation   target (a Character); clips [{ start, end, slot | clip, speed?, offset?, loop?, blendIn?, blendOut? }]:
//               [{ clip, time (seconds), weight }]; overlapping clips cross-fade by their blend-ins, and the track's
//               weight against the character's own locomotion ramps over the first clip's blendIn and the last's
//               blendOut. With `layer` (M5 W7: a layer the character has, upperBody by default) the clips play on that
//               layer over the body's own animation instead of replacing it, the ramps fading the layer: a wave on the
//               upper body while she walks
import { Quaternion } from 'three';
import { eased } from './ease.js';

export const TRACK_TYPES = ['property', 'transform', 'expression', 'event', 'audio', 'animation'];

/** The frame a track evaluates at: floored to its `step` when it holds on twos or threes. */
export function heldFrame(track, frame) {
  const s = track.step ?? 1;
  return s > 1 ? Math.floor(frame / s) * s : frame;
}

/** Index of the last key at or before `frame` (-1 before the first). Keys are sorted. */
function keyBefore(keys, frame) {
  let lo = 0, hi = keys.length - 1, at = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (keys[m][0] <= frame) { at = m; lo = m + 1; } else hi = m - 1; }
  return at;
}

const isColour = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const rgb = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const hex = (a) => `#${a.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;

/** Blend two key values by t in [0, 1]: numbers, number arrays and colours; anything else holds `a`. */
export function blend(a, b, t) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x) => typeof x === 'number')) return a.map((x, i) => x + (b[i] - x) * t);
  if (isColour(a) && isColour(b)) { const ca = rgb(a), cb = rgb(b); return hex(ca.map((x, i) => x + (cb[i] - x) * t)); }
  return t >= 1 ? b : a;
}

/**
 * A keyed value at a frame.
 * @param {Array<[number, any, any?]>} keys @param {number} frame @param {{ interp?: string, mix?: (a: any, b: any, t: number) => any }} [o]
 */
export function sampleKeys(keys, frame, { interp = 'linear', mix = blend } = {}) {
  if (!keys?.length) return undefined;
  const i = keyBefore(keys, frame);
  if (i < 0) return keys[0][1];
  if (i === keys.length - 1 || interp === 'step') return keys[i][1];
  const [f0, v0] = keys[i], [f1, v1, ease] = keys[i + 1];
  const t = f1 === f0 ? 1 : (frame - f0) / (f1 - f0);
  return mix(v0, v1, eased(ease, t));
}

const _qa = [0, 0, 0, 1], _qb = [0, 0, 0, 1], _qo = [0, 0, 0, 1];
/** Transform values { p, q, s } blended: p and s linearly, q by slerp (three's slerpFlat: dmath-safe). */
export function blendTransform(a, b, t) {
  const out = {};
  for (const k of ['p', 's']) if (a[k] || b[k]) out[k] = blend(a[k] ?? b[k], b[k] ?? a[k], t);
  if (a.q || b.q) {
    const qa = a.q ?? b.q, qb = b.q ?? a.q;
    for (let i = 0; i < 4; i++) { _qa[i] = qa[i]; _qb[i] = qb[i]; }
    Quaternion.slerpFlat(_qo, 0, _qa, 0, _qb, 0, t);
    out.q = [_qo[0], _qo[1], _qo[2], _qo[3]];
  }
  return out;
}

/** Linear ramp 0 → 1 over [a, a + n] frames (1 when n ≤ 0). */
const ramp = (f, a, n) => (n > 0 ? Math.max(0, Math.min(1, (f - a) / n)) : f >= a ? 1 : 0);

/**
 * The animation a track asks for at a frame: { weight, clips: [{ clip, slot?, time, weight }] } (weights within the
 * track sum to 1), or null when no clip covers the frame. `time` is seconds into the clip at `fps`.
 * @param {any} track @param {number} frame @param {number} fps
 */
export function sampleAnimation(track, frame, fps) {
  const f = heldFrame(track, frame);
  const clips = track.clips ?? [];
  const live = clips.filter((c) => f >= c.start && f < c.end);
  if (!live.length) return null;
  live.sort((a, b) => a.start - b.start);
  // later clips fade in over their blendIn, taking their share from everything before them
  const weights = live.map(() => 0);
  let remaining = 1;
  for (let i = live.length - 1; i >= 0; i--) {
    const c = live[i], w = i === 0 ? 1 : ramp(f, c.start, c.blendIn ?? 0);
    weights[i] = remaining * w; remaining -= weights[i];
  }
  const out = live.map((c, i) => {
    const local = ((f - c.start) / fps) * (c.speed ?? 1) + (c.offset ?? 0);
    return { ...(c.slot ? { slot: c.slot } : { clip: c.clip }), time: local, loop: c.loop ?? true, weight: weights[i] };
  }).filter((c) => c.weight > 0);
  // the track's own weight against the character's locomotion: in over the first clip's blendIn, out over the last's blendOut
  const first = clips.reduce((a, c) => (c.start < a.start ? c : a), clips[0]);
  const last = clips.reduce((a, c) => (c.end > a.end ? c : a), clips[0]);
  const wIn = ramp(f, first.start, first.blendIn ?? 0);
  const wOut = (last.blendOut ?? 0) > 0 ? Math.max(0, Math.min(1, (last.end - f) / last.blendOut)) : 1;
  return { weight: Math.min(wIn, wOut), clips: out };
}

/** Which audio clips play at a frame: [{ asset, offset (seconds into the sound), gain, bus, start }]. */
export function sampleAudio(track, frame, fps) {
  return (track.clips ?? []).filter((c) => frame >= c.start && frame < c.end).map((c) => ({ asset: c.asset, offset: (c.offset ?? 0) + (frame - c.start) / fps, gain: c.gain ?? 1, bus: c.bus ?? track.bus ?? 'sfx', start: c.start }));
}

/** Event keys in (from, to]: what playback fires when it moves from frame `from` to frame `to`. */
export function eventsBetween(track, from, to) {
  return (track.keys ?? []).filter(([f]) => f > from && f <= to).map(([frame, e]) => ({ frame, ...e }));
}

/**
 * Evaluate a track at a frame (pure): property → value, transform → { p, q, s }, expression → { name: weight },
 * animation → sampleAnimation, audio → sampleAudio. Events have no value at a frame (eventsBetween).
 * @param {any} track @param {number} frame @param {number} [fps]
 */
export function evaluateTrack(track, frame, fps = 30) {
  const f = heldFrame(track, frame);
  switch (track.type) {
    case 'property': return sampleKeys(track.keys, f, { interp: track.interp });
    case 'transform': return sampleKeys(track.keys, f, { interp: track.interp, mix: blendTransform });
    case 'expression': return Object.fromEntries(Object.entries(track.keys ?? {}).map(([name, keys]) => [name, sampleKeys(keys, f, { interp: track.interp })]));
    case 'animation': return sampleAnimation(track, frame, fps);
    case 'audio': return sampleAudio(track, f, fps);
    case 'event': return undefined;
    default: throw new Error(`unknown track type "${track.type}" (${TRACK_TYPES.join(', ')})`);
  }
}

/** Problems with a track's data, as messages (empty when it is fine). */
export function checkTrack(track) {
  const out = [], id = track.id ?? '(track)';
  if (!TRACK_TYPES.includes(track.type)) return [`${id}: unknown type "${track.type}" (${TRACK_TYPES.join(', ')})`];
  if (['property', 'transform', 'expression', 'animation'].includes(track.type) && !track.target) out.push(`${id}: a ${track.type} track needs a target`);
  if (track.type === 'property' && !track.path) out.push(`${id}: a property track needs a path`);
  const sorted = (keys, label) => { for (let i = 1; i < (keys?.length ?? 0); i++) if (keys[i][0] < keys[i - 1][0]) { out.push(`${id}: ${label} keys aren't in frame order (${keys[i - 1][0]} then ${keys[i][0]})`); return; } };
  if (track.type === 'expression') for (const [n, k] of Object.entries(track.keys ?? {})) sorted(k, n);
  else if (track.keys) sorted(track.keys, track.type);
  for (const c of track.clips ?? []) {
    if (!(c.end > c.start)) out.push(`${id}: a clip must end after it starts (${c.start} → ${c.end})`);
    if (track.type === 'animation' && !c.slot === !c.clip) out.push(`${id}: an animation clip names a slot or a clip, one of them`);
  }
  if (track.step !== undefined && !(Number.isInteger(track.step) && track.step >= 1 && track.step <= 4)) out.push(`${id}: step is 1, 2, 3 or 4`);
  if (track.release !== undefined && typeof track.release !== 'boolean') out.push(`${id}: release is true or false`);
  if (track.layer !== undefined && (track.type !== 'animation' || typeof track.layer !== 'string' || !track.layer)) out.push(`${id}: layer names one of a character's layers, on an animation track`);
  return out;
}
