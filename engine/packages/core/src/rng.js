// Seeded random streams: the only randomness the simulation may use (AB-D-0248). sfc32 on 32-bit
// integer arithmetic (Math.imul, shifts, adds), so every engine produces the same sequence. Each
// system draws from its own named stream, derived from the scene seed, so adding a draw in one system
// doesn't shift another's sequence; state is four integers, cheap to snapshot.

/** FNV-1a of a string, for deriving a stream's seed from its name. */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export class RandomStream {
  /** @param {number} seed @param {string} [name] */
  constructor(seed, name = '') {
    const h = hash32(name);
    this.a = (seed ^ 0x9e3779b9) >>> 0; this.b = (h ^ 0x243f6a88) >>> 0; this.c = (seed + h) >>> 0; this.d = 1;
    for (let i = 0; i < 12; i++) this.u32(); // mix
  }

  /** The next 32-bit unsigned integer (sfc32). */
  u32() {
    let { a, b, c, d } = this;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    this.a = a >>> 0; this.b = b; this.c = c; this.d = d;
    return t;
  }

  /** Uniform in [0, 1). */
  float() { return this.u32() / 4294967296; }
  /** Uniform in [min, max). */
  range(min, max) { return min + (max - min) * this.float(); }
  /** Integer in [0, n). */
  int(n) { return Math.floor(this.float() * n); }
  /** True with probability p. */
  chance(p) { return this.float() < p; }
  /** One element of an array. */
  pick(list) { return list[this.int(list.length)]; }

  getState() { return [this.a, this.b, this.c, this.d]; }
  setState([a, b, c, d]) { this.a = a; this.b = b; this.c = c; this.d = d; }
}

/** Named streams from one scene seed. */
export class RandomStreams {
  constructor(seed = 1) { this.seed = seed >>> 0; /** @type {Map<string, RandomStream>} */ this.streams = new Map(); }
  /** @param {string} name e.g. "ai", "particles", "node:door-1" */
  get(name) {
    let s = this.streams.get(name);
    if (!s) { s = new RandomStream(this.seed, name); this.streams.set(name, s); }
    return s;
  }
  getState() { return { seed: this.seed, streams: Object.fromEntries([...this.streams].map(([k, s]) => [k, s.getState()])) }; }
  setState(st) {
    this.seed = st.seed; this.streams.clear();
    for (const [k, v] of Object.entries(st.streams)) { const s = new RandomStream(this.seed, k); s.setState(v); this.streams.set(k, s); }
  }
}
