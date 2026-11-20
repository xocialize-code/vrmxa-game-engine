// Synthetic feature frames for the tests (M3 W5): a person at 15 fps, as the capture paths report them (detect.js
// header), doing scripted things. Seeded jitter so the detector sees noise, the same every run.

/** A hand at a wrist position, open, pointing or in a fist (joints laid out upwards from the wrist). */
export function hand(side, [wx, wy], shape = 'open', s = 0.12) {
  const fingers = [[-0.55, 0.45], [-0.2, 1], [0, 1.05], [0.2, 1], [0.4, 0.85]]; // thumb … little, directions × s
  const out = (i) => shape === 'open' || (shape === 'point' && i === 1);
  const tips = fingers.map(([dx, dy], i) => (out(i) ? [wx + dx * s, wy + dy * s] : [wx + dx * s * 0.35, wy + dy * s * 0.45]));
  const pips = fingers.map(([dx, dy]) => [wx + dx * s * 0.6, wy + dy * s * 0.6]);
  return { side, wrist: [wx, wy], tips, pips };
}

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; }; }

/**
 * A session: [from ms, to ms, what] segments. what(t, local t) → { face?: partial | null, hands?: [] }.
 * @returns {any[]} frames
 */
export function session(segments, { fps = 15, seed = 7, jitter = 0.004 } = {}) {
  const r = rng(seed), end = Math.max(...segments.map((s) => s[1])), frames = [];
  for (let t = 0; t <= end; t += 1000 / fps) {
    const seg = segments.find(([a, b]) => t >= a && t < b);
    const what = seg ? seg[2](t, t - seg[0]) : { face: null };
    const face = what.face === null ? null : { x: 0, y: 0.25, w: 0.4, yaw: 0, pitch: 0, roll: 0, ...(what.face ?? {}) };
    if (face) { face.x += r() * jitter; face.y += r() * jitter; face.yaw += r() * jitter * 2; face.pitch += r() * jitter * 2; }
    frames.push({ t: Math.round(t * 10) / 10, face, hands: what.hands ?? [] });
  }
  return frames;
}

const S = Math.sin, TAU = 2 * Math.PI;
/** Standing there, looking at the screen. */
export const still = () => ({});
/** Waving the right hand by the face, 2.5 swings a second, ±0.18. */
export const wave = (t, l) => ({ hands: [hand('right', [0.35 + 0.18 * S(TAU * 2.5 * l / 1000), 0.3])] });
/** One nod: the head down 0.28 rad and back over 600 ms. */
export const nod = (t, l) => ({ face: { pitch: l < 600 ? -0.28 * S(Math.PI * l / 600) : 0 } });
/** A head shake: yaw ±0.3, two swings in 900 ms. */
export const shake = (t, l) => ({ face: { yaw: l < 900 ? 0.3 * S(TAU * l / 900) : 0 } });
/** Pointing to the person's right, held. */
export const point = () => ({ hands: [hand('right', [0.45, 0.1], 'point')] });
/** An open hand held up, still (not a wave). */
export const palm = () => ({ hands: [hand('right', [0.35, 0.3])] });
/** Looking down and staying down (not a nod). */
export const lookDown = (t, l) => ({ face: { pitch: -0.3 * Math.min(1, l / 300) } });
/** Turning the head one way and staying (not a shake). */
export const turn = (t, l) => ({ face: { yaw: 0.35 * Math.min(1, l / 300) } });

/** The tests' session: appears, waves, nods, shakes, points, leaves. */
export const SCRIPT = [
  [0, 1500, still], [1500, 3500, wave], [3500, 4500, still], [4500, 5400, nod], [5400, 6500, still],
  [6500, 7600, shake], [7600, 8500, still], [8500, 9500, point], [9500, 10500, still],
];
export const scriptFrames = () => session([...SCRIPT, [10500, 13000, () => ({ face: null })]]);
