import { Hasher } from './hash.js';
// A particle state is a list of rows of numbers (one row per live particle). Two hashes:
//  ordered:   rows in the library's own storage order (catches any difference at all)
//  unordered: rows sorted first, so two runs that hold the same particles in a different slot
//             order still match (needed when a restore rebuilds the pool in another order)
export function hashRows(rows) {
  const o = new Hasher();
  for (const r of rows) for (const x of r) o.num(x);
  const sorted = [...rows].sort((a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; });
  const u = new Hasher();
  for (const r of sorted) for (const x of r) u.num(x);
  return { ordered: o.hex(), unordered: u.hex(), particles: rows.length };
}
/** Per-frame seed: the stream for frame f depends only on (seed, f), never on history. */
export function frameSeed(seed, frame, salt = 0) {
  let h = (seed ^ Math.imul(frame + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
