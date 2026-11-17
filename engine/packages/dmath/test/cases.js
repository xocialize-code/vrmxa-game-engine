// Inputs and checks shared by the Node tests and the browser page (test/browser.html), so every
// runtime evaluates exactly the same arguments. Inputs come from an integer xorshift, never from
// Math.random or a transcendental, so they are bit-identical everywhere.
import * as D from '../src/index.js';

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// Ranges are what the engine feeds these functions: angles, unit values, distances, exponents.
// [lo, hi] is uniform; { e: [emin, emax], signed } is log-uniform, built from a random binary
// exponent and mantissa (exact: no log or ** of the engine's own is involved).
const RANGES = {
  sin: [[-10, 10], [-1e5, 1e5]], cos: [[-10, 10], [-1e5, 1e5]], tan: [[-3.2, 3.2], [-1e4, 1e4]],
  asin: [[-1, 1]], acos: [[-1, 1]], atan: [[-4, 4], { e: [-30, 30], signed: true }],
  atan2: [[-10, 10]], exp: [[-20, 20], [-700, 700]], log: [[1e-6, 10], { e: [-1000, 1000] }],
  pow: [[0, 10, -8, 8], [1e-3, 1e3, -40, 40]], cbrt: [[-10, 10], { e: [-1000, 1000], signed: true }],
  hypot: [[-10, 10], { e: [-500, 500], signed: true }],
};

function twoTo(k) { u32[1] = (k + 1023) << 20; u32[0] = 0; return f64[0]; } // exact, -1022 <= k <= 1023

export function inputs(fn, count = 2000, seed = 0x5eed) {
  const r = rng(seed + fn.length * 977 + fn.charCodeAt(0) * 131);
  const out = [];
  const ranges = RANGES[fn];
  for (let i = 0; i < count; i++) {
    const range = ranges[i % ranges.length];
    const pick = () => {
      if (range.e) {
        const [emin, emax] = range.e;
        const v = (1 + r()) * twoTo(emin + Math.floor(r() * (emax - emin + 1)));
        return range.signed && r() < 0.5 ? -v : v;
      }
      return range[0] + r() * (range[1] - range[0]);
    };
    if (fn === 'pow') out.push([pick(), range[2] + r() * (range[3] - range[2])]);
    else if (fn === 'atan2' || fn === 'hypot') out.push([pick(), pick()]);
    else out.push([pick()]);
  }
  return out;
}

// Edge cases checked bit for bit (Object.is) against the engine's native Math.
export const EDGES = {
  sin: [[0], [-0], [Infinity], [-Infinity], [NaN], [1e-10], [Math.PI], [Math.PI / 2], [1e6], [3e6]],
  cos: [[0], [-0], [Infinity], [NaN], [Math.PI], [Math.PI / 2], [1e6]],
  tan: [[0], [-0], [Infinity], [NaN], [Math.PI / 4], [Math.PI / 2], [1e-9], [0.6744], [0.6745]],
  asin: [[0], [-0], [1], [-1], [1.0000001], [NaN], [0.5], [0.975], [-0.975]],
  acos: [[0], [-0], [1], [-1], [1.0000001], [NaN], [0.5], [-0.5]],
  atan: [[0], [-0], [Infinity], [-Infinity], [NaN], [1], [-1], [1e20], [0.4375], [2.4375]],
  atan2: [[0, 0], [-0, 0], [0, -0], [-0, -0], [1, 0], [-1, 0], [0, 1], [0, -1], [-0, -1], [Infinity, Infinity],
    [Infinity, -Infinity], [-Infinity, Infinity], [-Infinity, -Infinity], [1, Infinity], [1, -Infinity],
    [-1, -Infinity], [Infinity, 1], [NaN, 1], [1, NaN], [1e300, 1e-300], [1e-300, -1e300]],
  exp: [[0], [-0], [Infinity], [-Infinity], [NaN], [709.782712893384], [709.79], [-745.13], [-746], [1e-30], [0.34657], [1.0397]],
  log: [[0], [-0], [-1], [Infinity], [-Infinity], [NaN], [1], [Math.E], [5e-324], [2.2250738585072014e-308], [1.0000001]],
  pow: [[2, NaN], [NaN, 0], [NaN, -0], [1, NaN], [1, Infinity], [-1, Infinity], [-1, -Infinity], [0, -1], [-0, -1],
    [-0, -2], [-0, 3], [-0, 0.5], [0, 0.5], [-Infinity, 0.5], [-Infinity, 3], [-Infinity, -3], [-8, 1 / 3], [-2, 3],
    [-2, 4], [2, 1024], [2, -1074], [2, -1075], [10, 308], [10, 309], [0.5, Infinity], [0.5, -Infinity], [2, -Infinity],
    [1.0000001, 1e10], [0.9999999, 1e10], [-1.5, 2 ** 53], [-1.5, 2 ** 53 + 2], [3, 2], [4, 0.5], [1e-310, 0.5], [7, -1]],
  cbrt: [[0], [-0], [Infinity], [-Infinity], [NaN], [27], [-27], [5e-324], [1e-310], [8]],
  hypot: [[], [0], [-0], [3, 4], [Infinity, NaN], [NaN, 1], [-Infinity, 0], [1e300, 1e300], [1e-300, 1e-300], [1, 2, 3], [-0, -0]],
};

// Distance in units in the last place between two finite doubles (0 when Object.is-equal).
export function ulps(a, b) {
  if (Object.is(a, b)) return 0;
  if (a === 0 && b === 0) return Infinity; // +0 vs -0: a real difference, not 0 ulp
  if (a !== a || b !== b || !Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  // BigInt: the 63-bit ordinal does not fit a double's 53-bit mantissa.
  const ord = (x) => { f64[0] = x; const hi = u32[1], lo = u32[0]; const v = (BigInt(hi & 0x7fffffff) << 32n) | BigInt(lo); return hi >>> 31 ? -v : v; };
  const d = ord(a) - ord(b);
  return Number(d < 0n ? -d : d);
}

// FNV-1a over the raw bits of every output: one hex word per function, equal in every engine.
export function digest(values) {
  let h = 0x811c9dc5;
  for (const v of values) {
    f64[0] = v;
    for (const w of [u32[0], u32[1]]) for (let s = 0; s < 32; s += 8) { h ^= (w >>> s) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return h.toString(16).padStart(8, '0');
}

// Runs every function on its random inputs and edge cases. Returns per-function digests and
// accuracy against this runtime's native Math.
export function evaluate() {
  const report = {};
  for (const fn of D.FUNCTIONS) {
    const args = inputs(fn).concat(EDGES[fn]);
    const ours = args.map((a) => D.portable[fn](...a));
    const nat = args.map((a) => D.native[fn](...a));
    const random = inputs(fn).length;
    const hist = { 0: 0, 1: 0, 2: 0, more: 0 };
    let worst = 0, worstArgs = null;
    for (let i = 0; i < random; i++) {
      const d = ulps(ours[i], nat[i]);
      hist[d <= 2 ? d : 'more']++;
      if (d > worst) { worst = d; worstArgs = args[i]; }
    }
    const edgeMismatch = [];
    for (let i = random; i < args.length; i++) {
      // Strict: an edge case must be Object.is-equal (signed zeros, NaN, infinities), except for
      // finite non-zero results, which may sit 1 ulp apart like the random inputs.
      const a = ours[i], b = nat[i];
      const finiteNonZero = Number.isFinite(a) && Number.isFinite(b) && a !== 0 && b !== 0;
      if (!Object.is(a, b) && !(finiteNonZero && ulps(a, b) <= 1)) {
        edgeMismatch.push({ args: args[i].map(String), ours: String(Object.is(a, -0) ? '-0' : a), native: String(Object.is(b, -0) ? '-0' : b) });
      }
    }
    report[fn] = { digest: digest(ours), random, maxUlp: worst, worstArgs, hist, edges: EDGES[fn].length, edgeMismatch };
  }
  return report;
}
