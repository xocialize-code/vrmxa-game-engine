// FNV-1a over the raw bits of float64 values: two states hash equal only if every bit matches.
const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
export class Hasher {
  constructor() { this.h = 0x811c9dc5; this.count = 0; }
  word(w) {
    let h = this.h;
    for (let i = 0; i < 4; i++) { h ^= (w >>> (i * 8)) & 0xff; h = Math.imul(h, 0x01000193); }
    this.h = h;
  }
  num(x) { f64[0] = x; this.word(u32[0]); this.word(u32[1]); this.count++; }
  hex() { return (this.h >>> 0).toString(16).padStart(8, '0'); }
}
export function hashNumbers(arr) { const h = new Hasher(); for (const x of arr) h.num(x); return h.hex(); }
