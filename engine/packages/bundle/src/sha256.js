// SHA-256 (FIPS 180-4) in plain JavaScript. A build's hashes have to be the same in Node, Chromium and WKWebView, and
// they have to be there without a secure context or a promise per file, so the exporter and the loader use this one
// implementation everywhere rather than whichever `crypto` the runtime has. The tests compare it with node:crypto.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const W = new Int32Array(64);

function block(h, d, o) {
  for (let i = 0; i < 16; i++, o += 4) W[i] = (d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3];
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15], b = W[i - 2];
    W[i] = (W[i - 16] + (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + W[i - 7] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10))) | 0;
  }
  let a = h[0], b = h[1], c = h[2], e = h[4], f = h[5], g = h[6], dd = h[3], hh = h[7];
  for (let i = 0; i < 64; i++) {
    const t1 = (hh + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
    const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    hh = g; g = f; f = e; e = (dd + t1) | 0; dd = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + dd) | 0;
  h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
}

/**
 * The SHA-256 of some bytes, as 64 lowercase hex digits.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function sha256(bytes) {
  const h = new Int32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const n = bytes.length, whole = n - (n % 64);
  for (let o = 0; o < whole; o += 64) block(h, bytes, o);
  // the tail: what is left, 0x80, zeros, and the length in bits as 64 bits big-endian
  const rest = n - whole, tail = new Uint8Array(rest + 9 <= 64 ? 64 : 128);
  tail.set(bytes.subarray(whole));
  tail[rest] = 0x80;
  const bits = n * 8, view = new DataView(tail.buffer);
  view.setUint32(tail.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(tail.length - 4, bits >>> 0);
  for (let o = 0; o < tail.length; o += 64) block(h, tail, o);
  let hex = '';
  for (let i = 0; i < 8; i++) hex += (h[i] >>> 0).toString(16).padStart(8, '0');
  return hex;
}

/** The SHA-256 of a string's UTF-8 bytes. @param {string} text */
export const sha256Text = (text) => sha256(new TextEncoder().encode(text));
