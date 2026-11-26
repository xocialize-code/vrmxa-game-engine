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
// A class without `describe` is code only: the implementation of one of the engine's behaviours (the sample's `wander`),
// or a behaviour the registry doesn't know (scenes that use it validate with a warning, as before).

/**
 * The declarations in a project's behaviours: each exported class's `describe`, under the name it is exported as.
 * @param {Map<string, any> | Record<string, any> | null | undefined} mod the module's namespace, or a map of name to class
 *   (what a host's `behaviours()` returns)
 * @returns {Map<string, any>} name -> describe
 */
export function describedBehaviours(mod) {
  const out = new Map();
  for (const [name, v] of mod instanceof Map ? mod : Object.entries(mod ?? {})) {
    if (typeof v !== 'function' || v.describe === undefined) continue;
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
  return registry.project(describedBehaviours(mod));
}
