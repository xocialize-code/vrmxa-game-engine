// Fewer keys for the same curve (M4 W9): a take samples a value on every step or camera frame, and a timeline wants keys
// a person can edit. Ramer–Douglas–Peucker over [frame, value] keys, against the linear blend the tracks evaluate
// (a + (b − a) · t): a key is dropped when the line through its kept neighbours passes within `tolerance` of it.
// Only + − × ÷ and comparisons, in a fixed order, so the same samples give the same keys everywhere.

const deviation = (v, a, b, t) => {
  if (typeof v === 'number') return Math.abs(v - (a + (b - a) * t));
  let worst = 0;
  for (let i = 0; i < v.length; i++) { const d = Math.abs(v[i] - (a[i] + (b[i] - a[i]) * t)); if (d > worst) worst = d; }
  return worst;
};

/**
 * @param {any[][]} keys [[frame, value], …]: frames strictly increasing, values all numbers or all arrays of one length
 * @param {number} tolerance in the value's own unit; 0 keeps every key
 */
export function reduceKeys(keys, tolerance) {
  const n = keys.length;
  if (n <= 2 || !(tolerance > 0)) return keys.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const fa = keys[a][0], va = keys[a][1], fb = keys[b][0], vb = keys[b][1];
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = deviation(keys[i][1], va, vb, (keys[i][0] - fa) / (fb - fa));
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tolerance) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return keys.filter((_, i) => keep[i] === 1);
}

/** Keys for the samples whose value differs from the one before (a held value: one key where it changes). */
export function changeKeys(samples, same = (a, b) => a === b) {
  const out = [];
  let prev;
  for (const [frame, v] of samples) { if (out.length && same(prev, v)) continue; out.push([frame, v]); prev = v; }
  return out;
}
