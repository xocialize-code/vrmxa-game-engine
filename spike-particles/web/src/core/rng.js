// Seeded RNG the adapter owns. sfc32: four 32-bit words of state, integer-only arithmetic, so it
// produces the same stream in V8 and JSC. State is a plain array: snapshot and restore are copies.
export class Rng {
  constructor(seed = 1) { this.seed(seed); }
  seed(seed) {
    // splitmix32 to spread a small seed over the four words
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x9e3779b9) | 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = next(); this.b = next(); this.c = next(); this.d = next();
    for (let i = 0; i < 12; i++) this.u32();
    return this;
  }
  u32() {
    let { a, b, c, d } = this;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t >>> 0;
  }
  /** [0, 1) with 32 bits of mantissa, exactly representable, identical everywhere. */
  next() { return this.u32() / 4294967296; }
  getState() { return [this.a, this.b, this.c, this.d]; }
  setState(s) { [this.a, this.b, this.c, this.d] = s; return this; }
}

/**
 * Runs fn with Math.random replaced by rng.next. This is how the adapter seeds libraries that draw
 * from the global Math.random (three.quarks, three.proton, @newkrok/three-particles). Single-threaded
 * JS makes the swap safe as long as fn is synchronous.
 */
const nativeRandom = Math.random;
export function withRandom(rng, fn) {
  const prev = Math.random;
  Math.random = () => rng.next();
  try { return fn(); } finally { Math.random = prev; }
}
export { nativeRandom };
