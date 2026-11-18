// Response curves for utility considerations (research/npc-ai.md §2): an input in 0…1 to a score in 0…1. Polynomials and
// clamps only, so V8 and JavaScriptCore agree to the bit (no exp, no pow with a fractional exponent): `logistic` is a
// smoothstep stand-in, `exponent` takes whole powers.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ipow = (x, n) => { let r = 1; for (let i = 0; i < n; i++) r *= x; return r; };

export const CURVES = {
  /** m·x + b */
  linear: (x, { m = 1, b = 0 } = {}) => m * x + b,
  /** 1 − x */
  inverse: (x) => 1 - x,
  /** x^n (whole n) */
  exponent: (x, { n = 2 } = {}) => ipow(x, Math.max(0, Math.round(n))),
  /** an S: smoothstep between lo and hi */
  logistic: (x, { lo = 0, hi = 1 } = {}) => { const t = clamp01((x - lo) / (hi - lo || 1)); return t * t * (3 - 2 * t); },
  /** a hump at the middle: 4x(1 − x) */
  bell: (x) => 4 * x * (1 - x),
  /** 1 at or above the threshold, else 0 */
  step: (x, { at = 0.5 } = {}) => (x >= at ? 1 : 0),
  /** a constant */
  constant: (_x, { value = 1 } = {}) => value,
};

/** A curve by its description ({ type, ...params }), clamped to 0…1. */
export function curve(c, x) {
  const f = CURVES[c?.type ?? 'linear'];
  if (!f) throw new Error(`unknown curve "${c?.type}" (${Object.keys(CURVES).join(', ')})`);
  return clamp01(f(clamp01(x), c ?? {}));
}
