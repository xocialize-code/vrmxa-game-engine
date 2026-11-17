// The node registry: the one place node types, their props, signals and actions, and behaviours are
// declared. Everything else (the .vrmxs JSON Schema, validation, the inspector, the MCP tool
// schemas) is generated from it, so adding a type is one definition, not five edits.

// ---------------------------------------------------------------- prop types
// Each prop type knows its JSON Schema. `meta` carries what a schema can't: units, the inspector
// widget, whether the prop is simulated (inside the determinism boundary) or presentation.
const base = (schema, opts = {}) => ({
  schema: { ...schema, ...(opts.description ? { description: opts.description } : {}), ...(opts.default !== undefined ? { default: opts.default } : {}) },
  meta: { unit: opts.unit, widget: opts.widget, sim: opts.sim ?? false },
});
export const P = {
  number: (o = {}) => base({ type: 'number', ...(o.min !== undefined ? { minimum: o.min } : {}), ...(o.max !== undefined ? { maximum: o.max } : {}) }, o),
  integer: (o = {}) => base({ type: 'integer', ...(o.min !== undefined ? { minimum: o.min } : {}), ...(o.max !== undefined ? { maximum: o.max } : {}) }, o),
  boolean: (o = {}) => base({ type: 'boolean' }, o),
  string: (o = {}) => base({ type: 'string', ...(o.pattern ? { pattern: o.pattern } : {}) }, o),
  enum: (values, o = {}) => base({ enum: values }, o),
  vec3: (o = {}) => base({ type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }, { widget: 'vec3', ...o }),
  quat: (o = {}) => base({ type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 }, { widget: 'quat', ...o }),
  color: (o = {}) => base({ type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, { widget: 'color', ...o }),
  assetRef: (assetTypes, o = {}) => ({ ...base({ type: 'string' }, { widget: 'asset', ...o }), assetTypes }),
  nodeRef: (o = {}) => ({ ...base({ type: 'string' }, { widget: 'node', ...o }), nodeRef: true }),
  list: (item, o = {}) => base({ type: 'array', items: item.schema }, o),
};

// ---------------------------------------------------------------- the registry

export function createRegistry() {
  const types = new Map();      // name -> resolved definition (inheritance flattened)
  const behaviours = new Map();

  function define(name, def) {
    if (types.has(name)) throw new Error(`node type ${name} defined twice`);
    const parent = def.extends ? types.get(def.extends) : null;
    if (def.extends && !parent) throw new Error(`${name} extends unknown type ${def.extends}`);
    types.set(name, {
      name,
      extends: def.extends ?? null,
      description: def.description ?? '',
      abstract: def.abstract ?? false,
      asset: def.asset ?? parent?.asset ?? null,          // { types: [...], required }
      props: { ...(parent?.props ?? {}), ...(def.props ?? {}) },
      signals: { ...(parent?.signals ?? {}), ...(def.signals ?? {}) },   // name -> { args: {name: P}, description }
      actions: { ...(parent?.actions ?? {}), ...(def.actions ?? {}) },   // name -> { args: {name: P}, description }
      children: def.children ?? parent?.children ?? null,                // allowed child types, or null = any
    });
    return api;
  }

  function behaviour(name, def) {
    if (behaviours.has(name)) throw new Error(`behaviour ${name} defined twice`);
    behaviours.set(name, {
      name, description: def.description ?? '', on: def.on ?? null, // node types it can attach to (null = any)
      params: def.params ?? {}, signals: def.signals ?? {}, actions: def.actions ?? {},
    });
    return api;
  }

  // Is `type` the same as, or derived from, `ancestor`?
  function isA(type, ancestor) {
    for (let t = types.get(type); t; t = t.extends ? types.get(t.extends) : null) if (t.name === ancestor) return true;
    return false;
  }

  // Signals and actions a node actually has: its type's plus those of its behaviours.
  function surface(node) {
    const t = types.get(node.type);
    const signals = { ...(t?.signals ?? {}) }, actions = { ...(t?.actions ?? {}) };
    for (const b of node.behaviours ?? []) {
      const d = behaviours.get(b.use);
      if (!d) continue;
      Object.assign(signals, d.signals);
      Object.assign(actions, d.actions);
    }
    return { signals, actions };
  }

  const api = { define, behaviour, types, behaviours, isA, surface, get: (n) => types.get(n) };
  return api;
}
