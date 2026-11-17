// Shared helpers: state hash, timing stats, seeded navmesh points.

/** FNV-1a over the raw bits of a typed array: equal hashes ⇔ bit-identical state. */
export function hashState(arr) {
  const u = new Uint32Array(arr.buffer, arr.byteOffset, arr.byteLength / 4);
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) {
    let x = u[i];
    for (let b = 0; b < 4; b++) { h ^= x & 0xff; h = Math.imul(h, 0x01000193); x >>>= 8; }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { mean: +mean.toFixed(3), p50: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3), max: +s[s.length - 1].toFixed(3) };
}

/** A seeded random point on the navmesh (integer-hash PRNG, then snapped by the backend). */
export function randomNavPoint(be, rand) {
  for (let tries = 0; tries < 64; tries++) {
    const p = be.closestPoint([-18 + rand() * 36, 2, -18 + rand() * 36]);
    if (p) return p;
  }
  throw new Error('no navmesh point found');
}

/**
 * Deep copy that keeps shared references shared and passes functions through by reference (navcat
 * query filters are objects of functions). Enough to snapshot navcat's navmesh + crowd, which are
 * plain JS objects, arrays and typed arrays.
 */
export function cloneDeep(v, seen = new Map()) {
  if (v === null || typeof v !== 'object') return v;
  if (seen.has(v)) return seen.get(v);
  if (ArrayBuffer.isView(v)) { const c = v.slice(); seen.set(v, c); return c; }
  if (Array.isArray(v)) { const c = new Array(v.length); seen.set(v, c); for (let i = 0; i < v.length; i++) c[i] = cloneDeep(v[i], seen); return c; }
  if (v instanceof Map) { const c = new Map(); seen.set(v, c); for (const [k, x] of v) c.set(k, cloneDeep(x, seen)); return c; }
  if (v instanceof Set) { const c = new Set(); seen.set(v, c); for (const x of v) c.add(cloneDeep(x, seen)); return c; }
  const c = Object.create(Object.getPrototypeOf(v)); seen.set(v, c);
  for (const k of Object.keys(v)) c[k] = cloneDeep(v[k], seen);
  return c;
}

/** mulberry32 with its state exposed, so a snapshot can carry it. */
export function rngState(seed) {
  const st = { a: seed >>> 0 };
  const next = () => {
    st.a = (st.a + 0x6d2b79f5) >>> 0;
    let t = st.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.state = st;
  return next;
}
