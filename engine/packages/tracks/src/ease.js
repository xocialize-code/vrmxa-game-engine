// Easing and interpolation for keys: only + - * / and comparisons (inside the determinism boundary, AB-D-0248), so a
// curve evaluates to the same bits in every engine. A key's ease shapes the segment arriving at it.

/** Named eases: t in [0, 1] → [0, 1]. */
export const EASES = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => { const u = 1 - t; return 1 - u * u * u; },
  easeInOut: (t) => t * t * (3 - 2 * t),
};

/**
 * A CSS-style cubic bezier [x1, y1, x2, y2] (x in [0, 1]): y at x, by bisection on the curve's parameter with a fixed
 * number of halvings, so the result doesn't depend on a tolerance test.
 */
/** @param {number[]} curve [x1, y1, x2, y2] @param {number} x */
export function cubicBezier(curve, x) {
  const [x1, y1, x2, y2] = curve;
  const bx = (s) => 3 * x1 * s * (1 - s) * (1 - s) + 3 * x2 * s * s * (1 - s) + s * s * s;
  const by = (s) => 3 * y1 * s * (1 - s) * (1 - s) + 3 * y2 * s * s * (1 - s) + s * s * s;
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (bx(m) < x) lo = m; else hi = m; }
  return by((lo + hi) / 2);
}

/** The eased fraction for a key's ease: a name, a bezier array, or 'step' (hold the previous value until the key). */
export function eased(ease, t) {
  if (ease === undefined || ease === null) return t;
  if (ease === 'step') return t >= 1 ? 1 : 0;
  if (Array.isArray(ease)) return cubicBezier(ease, t);
  const f = EASES[ease];
  if (!f) throw new Error(`unknown ease "${ease}" (${[...Object.keys(EASES), 'step', '[x1, y1, x2, y2]'].join(', ')})`);
  return f(t);
}
