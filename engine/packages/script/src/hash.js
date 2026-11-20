// Hashes for ids and fingerprints: FNV-1a (32 bit) over the UTF-16 code units of a canonical JSON text. Integer
// arithmetic only (Math.imul), so every engine gives the same hex.

/** FNV-1a of a string → 8 hex digits. */
export function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** JSON with object keys sorted at every depth: equal data, equal text. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}

/** The fingerprint of a value (minus the named fields of an object). */
export function fingerprint(v, omit = []) {
  if (v && typeof v === 'object' && !Array.isArray(v) && omit.length) { const o = { ...v }; for (const k of omit) delete o[k]; return fnv(canonical(o)); }
  return fnv(canonical(v));
}
