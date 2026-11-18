// Save files are JSON. A snapshot holds typed arrays (Rapier's bytes, characters' poses and springs), which travel as
// { "$typed": "Float64Array", "b64": "…" }: base64 of the array's bytes, little-endian, exact. Our own base64 (no
// Buffer, no btoa), so the same bytes come out in Node, Chromium and WKWebView.
const TYPES = { Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array };
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const REV = new Uint8Array(128); for (let i = 0; i < 64; i++) REV[ABC.charCodeAt(i)] = i;

export function toBase64(bytes) {
  let out = '', i = 0;
  for (; i + 2 < bytes.length; i += 3) { const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]; out += ABC[n >> 18] + ABC[(n >> 12) & 63] + ABC[(n >> 6) & 63] + ABC[n & 63]; }
  if (i < bytes.length) { const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8); out += ABC[n >> 18] + ABC[(n >> 12) & 63] + (i + 1 < bytes.length ? ABC[(n >> 6) & 63] : '=') + '='; }
  return out;
}
export function fromBase64(s) {
  const len = s.length, pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0, out = new Uint8Array((len / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const n = (REV[s.charCodeAt(i)] << 18) | (REV[s.charCodeAt(i + 1)] << 12) | (REV[s.charCodeAt(i + 2)] << 6) | REV[s.charCodeAt(i + 3)];
    if (o < out.length) out[o++] = n >> 16; if (o < out.length) out[o++] = (n >> 8) & 255; if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/** A value with typed arrays as JSON-safe markers (deep). Non-finite numbers are kept as markers too. */
export function encode(v) {
  if (v === null || v === undefined) return v ?? null;
  if (typeof v === 'number') return Number.isFinite(v) ? (Object.is(v, -0) ? { $num: '-0' } : v) : { $num: String(v) };
  if (typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v)) return { $typed: v.constructor.name, b64: toBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  if (Array.isArray(v)) return v.map(encode);
  if (v instanceof Map) return { $map: [...v].map(([k, x]) => [encode(k), encode(x)]) };
  const o = {};
  for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = encode(x);
  return o;
}
/** The inverse of encode. */
export function decode(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(decode);
  if ('$typed' in v) { const T = TYPES[v.$typed]; if (!T) throw new Error(`unknown typed array ${v.$typed}`); const b = fromBase64(v.b64); return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT); }
  if ('$num' in v) return v.$num === '-0' ? -0 : Number(v.$num);
  if ('$map' in v) return new Map(v.$map.map(([k, x]) => [decode(k), decode(x)]));
  const o = {};
  for (const [k, x] of Object.entries(v)) o[k] = decode(x);
  return o;
}
