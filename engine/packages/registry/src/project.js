// A project's behaviours, as they declare themselves (M6 W0, AB-D-0297 item 4). A project's behaviours module exports
// behaviour classes under the names its scenes use; a class that declares itself carries a static `describe`, the def
// the registry's `behaviour(name, def)` takes ({ description, on, params, signals, actions, state }), its params and
// arguments written as JSON Schema (index.js `prop`):
//
//   export class tableZone extends Behaviour {
//     static describe = {
//       description: 'Takes an order from a seated regular, and her tray when it is hers.',
//       on: ['Area'],
//       params: { customer: { type: 'string', nodeRef: true }, points: { type: 'integer', minimum: 0, default: 10 } },
//       signals: { served: { args: { right: { type: 'boolean' } } } },
//       state: { type: 'object', properties: { done: { type: 'boolean' } } },
//     };
//     …
//   }
//
// A class without its own `describe` is code only: the implementation of one of the engine's behaviours (the sample's
// `wander`), or a behaviour the registry doesn't know (scenes that use it validate with a warning, as before). A
// subclass doesn't inherit its parent's: it may keep other state, so it declares its own or none.
//
// Every schema in a declaration (each param's, each signal's and action's arguments', the state's) is checked when it
// is declared: one that isn't JSON Schema is the declaration's mistake, named here, not every later validation's. The
// check is the draft 2020-12 meta-schema compiled ahead of time (vendor/ajv-meta-2020.js, scripts/make-meta.mjs) and
// what Ajv's compile refuses beyond it (a pattern that isn't a regular expression, an empty enum, `id`, `nullable`
// misused), found by walking the schema: nothing here generates code at run time, so a
// game build declares its behaviours under a Content Security Policy without 'unsafe-eval' (M6 W7, AB-T-0654 item 6),
// and the exporter, the editor and a build give the same verdict on the same declaration. A
// declaration's schemas are set inside larger ones (a scene's), so they are self-contained: no `$ref`, `$id`, `$anchor`
// or the like, which would resolve against whatever schema holds them.

import { validate } from './vendor/ajv-meta-2020.js';

/** @type {((schema: unknown) => boolean) & { errors?: { instancePath: string, message?: string }[] | null }} */
const metaValidate = /** @type {any} */ (validate);

/**
 * The declarations in a project's behaviours: each exported class's `describe`, under the name it is exported as.
 * @param {Map<string, any> | Record<string, any> | null | undefined} mod the module's namespace, or a map of name to class
 *   (what a host's `behaviours()` returns)
 * @returns {Map<string, any>} name -> describe
 */
export function describedBehaviours(mod) {
  const out = new Map();
  for (const [name, v] of mod instanceof Map ? mod : Object.entries(mod ?? {})) {
    if (typeof v !== 'function' || !Object.hasOwn(v, 'describe')) continue;
    if (!v.describe || typeof v.describe !== 'object' || Array.isArray(v.describe)) throw new Error(`the project's behaviour ${name}: its static describe is an object ({ description, on, params, signals, actions, state }), not ${typeof v.describe === 'function' ? 'a function' : JSON.stringify(v.describe)}`);
    out.set(name, v.describe);
  }
  return out;
}

/**
 * Put a project's declared behaviours into a registry, beside its own (replacing the project's earlier ones).
 * @param {import('./index.js').Registry} registry @param {Map<string, any> | Record<string, any> | null | undefined} mod
 * @returns {string[]} the names declared
 */
export function declareProjectBehaviours(registry, mod) {
  return registry.project(describedBehaviours(mod), { check: compiled });
}

// A describe's schemas are compiled once, not at every world a game builds with it (each scene change)
const checked = new WeakMap();
function compiled(b, def) {
  let byName = checked.get(def);
  if (!byName) checked.set(def, (byName = new Map()));
  if (!byName.has(b.name)) byName.set(b.name, schemaProblems(b));
  return byName.get(b.name);
}

/**
 * What in a declared behaviour isn't JSON Schema: each param's schema, each signal's and action's argument's, and the
 * state's, read as the scene validator reads them (draft 2020-12, unknown keywords allowed): the meta-schema, then what
 * Ajv's compile refuses beyond it (compileFault).
 * @param {any} b a behaviour as the registry resolves it @returns {string[]}
 */
export function schemaProblems(b) {
  const out = [];
  const tryCheck = (where, schema) => {
    const scoped = scopeKeys(schema);
    if (scoped.length) { out.push(`behaviour ${b.name}: ${where} uses ${scoped.map((k) => `"${k}"`).join(', ')}: a declaration's schemas are self-contained (it is set inside a scene's schema, where a reference would resolve against that)`); return; }
    const why = schemaFault(schema);
    if (why) out.push(`behaviour ${b.name}: ${where} is not JSON Schema (${why})`);
  };
  for (const [k, p] of Object.entries(b.params ?? {})) tryCheck(`param ${k}`, p.schema);
  for (const kind of ['signals', 'actions']) for (const [m, def] of Object.entries(b[kind] ?? {})) for (const [k, p] of Object.entries(def.args ?? {})) tryCheck(`${kind === 'signals' ? 'signal' : 'action'} ${m}'s argument ${k}`, p.schema);
  if (b.state !== undefined) tryCheck('its state', b.state);
  return out;
}

/**
 * Why a value isn't a JSON Schema (draft 2020-12) the scene validator can compile, or null when it is one.
 * @param {unknown} schema @returns {string | null}
 */
export function schemaFault(schema) {
  if (typeof schema !== 'boolean' && (!schema || typeof schema !== 'object' || Array.isArray(schema))) return 'schema must be object or boolean';
  if (!metaValidate(schema)) return `schema is invalid: ${(metaValidate.errors ?? []).map((e) => `data${e.instancePath} ${e.message}`).join(', ')}`;
  return compileFault(schema);
}

// Where a schema holds schemas (draft 2020-12's applicators, and the older names the meta-schema still accepts)
const ONE = ['additionalProperties', 'propertyNames', 'items', 'contains', 'not', 'if', 'then', 'else', 'unevaluatedItems', 'unevaluatedProperties', 'additionalItems'];
const MANY = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const BY_NAME = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas', 'dependencies'];
const JSON_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null', 'object', 'array']);
// The keywords Ajv compiles code for (its rules): a schema with none of them is always valid and skipped, and only one
// with some is checked for `$async`. Annotations (title, description, default, examples, deprecated, readOnly,
// writeOnly, content*), unknown keywords, $defs, definitions and additionalItems (draft 2019) are not rules
const RULES = new Set(['type', 'nullable', 'enum', 'const', 'format', '$comment', 'multipleOf', 'maximum', 'exclusiveMaximum', 'minimum', 'exclusiveMinimum',
  'maxLength', 'minLength', 'pattern', 'maxItems', 'minItems', 'uniqueItems', 'maxContains', 'minContains', 'maxProperties', 'minProperties', 'required',
  'dependentRequired', 'prefixItems', 'items', 'contains', 'additionalProperties', 'properties', 'patternProperties', 'dependentSchemas', 'propertyNames',
  'dependencies', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'unevaluatedItems', 'unevaluatedProperties', '$ref', '$dynamicRef', '$recursiveRef']);

/**
 * What Ajv's compile refuses in a schema that passes the meta-schema, found in it or any schema it holds: a pattern that
 * isn't a regular expression with the `u` flag (a `pattern`, a `patternProperties` key), an empty `enum`, the
 * draft-04 `id`, `nullable` without a type or contradicting a `null` type (Ajv's OpenAPI keyword), and `$async` in a
 * schema inside it that has rules. Ajv compiles only the schemas it uses; this looks in
 * unreferenced `$defs` too, and in an ignored `additionalItems`, `if` or `then`: stricter on purpose.
 * @param {any} s @param {boolean} [nested] s is inside the declaration's schema @returns {string | null} the first
 *   refusal, in Ajv's words where it has them
 */
function compileFault(s, nested = false) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const re = (p) => { try { new RegExp(p, 'u'); return null; } catch (e) { return `${e.message}`; } };
  if (typeof s.pattern === 'string') { const e = re(s.pattern); if (e) return e; }
  for (const k of Object.keys(s.patternProperties ?? {})) { const e = re(k); if (e) return e; }
  if (Array.isArray(s.enum) && s.enum.length === 0) return 'enum must have non-empty array';
  if (Object.hasOwn(s, 'id')) return 'NOT SUPPORTED: keyword "id", use "$id" for schema ID';
  // an asynchronous schema inside the synchronous one (at the top, Ajv would make the whole validator asynchronous)
  if (nested && s.$async && Object.keys(s).some((k) => RULES.has(k))) return 'async schema in sync schema';
  if (Object.hasOwn(s, 'nullable')) {
    const types = (Array.isArray(s.type) ? s.type : s.type ? [s.type] : []).filter((t) => JSON_TYPES.has(t));
    if (types.includes('null')) { if (s.nullable === false) return 'type: null contradicts nullable: false'; }
    else if (!types.length && s.nullable !== undefined) return '"nullable" cannot be used without "type"';
    if (typeof s.nullable !== 'boolean') return 'nullable value must be "boolean"';
  }
  const sub = (x) => compileFault(x, true);
  for (const k of ONE) { const e = Array.isArray(s[k]) ? s[k].map(sub).find(Boolean) : sub(s[k]); if (e) return e; }
  for (const k of MANY) if (Array.isArray(s[k])) for (const x of s[k]) { const e = sub(x); if (e) return e; }
  for (const k of BY_NAME) if (s[k] && typeof s[k] === 'object') for (const x of Object.values(s[k])) { const e = sub(x); if (e) return e; }
  return null;
}

// Keywords that name or resolve against a schema's place in the whole: refused in a declaration's schemas.
const SCOPE_KEYS = new Set(['$ref', '$id', '$anchor', '$dynamicRef', '$dynamicAnchor', '$recursiveRef', '$recursiveAnchor', '$schema', '$vocabulary']);
// Keywords whose values are data, not schemas: a `$ref` key inside one is a value's, not a reference.
const DATA_KEYS = new Set(['enum', 'const', 'default', 'examples']);
function scopeKeys(schema, found = new Set()) {
  if (Array.isArray(schema)) { for (const s of schema) scopeKeys(s, found); return [...found]; }
  if (!schema || typeof schema !== 'object') return [...found];
  for (const [k, v] of Object.entries(schema)) {
    if (SCOPE_KEYS.has(k)) found.add(k);
    else if (!DATA_KEYS.has(k)) scopeKeys(v, found);
  }
  return [...found];
}
