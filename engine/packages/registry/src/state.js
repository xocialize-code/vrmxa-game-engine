// What a behaviour's declared state is compared by (M6 W0, AB-D-0297 item 4): `stateShape`. M6 W5's save fingerprint
// hashes it and W2's hot reload compares it; nothing else about a declared state is compared. Keep its name and its
// output as they are: a change to either changes every save's fingerprint.

// Annotations: they say what a schema means to a person and change nothing it accepts.
const ANNOTATIONS = new Set(['description', 'title', 'examples', '$comment']);
// Keywords whose value is a map of name -> schema (the names are data, never annotations: a property may be called
// "description"), a list of schemas, or one schema. Any other keyword's value is data and kept whole (enum, const,
// default, required, ...).
const SCHEMA_MAPS = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']);
const SCHEMA_LISTS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
// Keywords whose value is a set of names, whatever order it is written in: sorted.
const SETS = new Set(['required', 'type']);
const SCHEMAS = new Set(['items', 'additionalItems', 'additionalProperties', 'unevaluatedItems', 'unevaluatedProperties', 'not', 'if', 'then', 'else', 'contains', 'propertyNames']);

function strip(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema; // true, false
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (ANNOTATIONS.has(k)) continue;
    if (SCHEMA_MAPS.has(k) && v && typeof v === 'object' && !Array.isArray(v)) out[k] = Object.fromEntries(Object.entries(v).map(([n, s]) => [n, strip(s)]));
    else if (SCHEMA_LISTS.has(k) && Array.isArray(v)) out[k] = v.map(strip);
    else if (SCHEMAS.has(k)) out[k] = Array.isArray(v) ? v.map(strip) : strip(v); // items as a list: draft 7's tuples
    else if (SETS.has(k) && Array.isArray(v) && v.every((x) => typeof x === 'string')) out[k] = [...new Set(v)].sort();
    else out[k] = v;
  }
  return out;
}

/**
 * JSON with object keys sorted at every depth: equal data, equal text. The same function as @vrmxg/script's
 * `canonical` (hash.js); a test holds them to the same output.
 * @param {any} v @returns {string}
 */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}

/**
 * The shape of the state a behaviour declares: the canonical JSON of its `state` schema with the annotations
 * (description, title, examples, $comment) taken out at every depth, and `required` and a list of `type`s sorted (each
 * is a set). Two declarations keep the same state exactly when
 * their shapes are equal. null: the behaviour hasn't declared its state (not the same as declaring none, whose shape is
 * '{"type":"null"}').
 * @param {{ state?: any } | null | undefined} behaviour a registry entry (`registry.behaviours.get(name)`) or a describe
 * @returns {string | null}
 */
export function stateShape(behaviour) {
  if (!behaviour || behaviour.state === undefined) return null;
  return canonical(strip(behaviour.state));
}
