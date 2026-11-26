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
// Every schema in a declaration (each param's, each signal's and action's arguments', the state's) is compiled when it
// is declared: one that isn't JSON Schema is the declaration's mistake, named here, not every later validation's. A
// declaration's schemas are set inside larger ones (a scene's), so they are self-contained: no `$ref`, `$id`, `$anchor`
// or the like, which would resolve against whatever schema holds them.

import { Ajv2020 } from 'ajv/dist/2020.js';

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
 * state's, compiled as the scene validator compiles them (draft 2020-12, unknown keywords allowed).
 * @param {any} b a behaviour as the registry resolves it @returns {string[]}
 */
export function schemaProblems(b) {
  const ajv = new Ajv2020({ strict: false, allErrors: true }), out = [];
  const tryCompile = (where, schema) => {
    const scoped = scopeKeys(schema);
    if (scoped.length) { out.push(`behaviour ${b.name}: ${where} uses ${scoped.map((k) => `"${k}"`).join(', ')}: a declaration's schemas are self-contained (it is set inside a scene's schema, where a reference would resolve against that)`); return; }
    try { ajv.compile(schema); } catch (e) { out.push(`behaviour ${b.name}: ${where} is not JSON Schema (${e.message})`); }
  };
  for (const [k, p] of Object.entries(b.params ?? {})) tryCompile(`param ${k}`, p.schema);
  for (const kind of ['signals', 'actions']) for (const [m, def] of Object.entries(b[kind] ?? {})) for (const [k, p] of Object.entries(def.args ?? {})) tryCompile(`${kind === 'signals' ? 'signal' : 'action'} ${m}'s argument ${k}`, p.schema);
  if (b.state !== undefined) tryCompile('its state', b.state);
  return out;
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
