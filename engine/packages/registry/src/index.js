// @vrmxg/registry — the node registry: the one place node types, their props, signals and actions, and behaviours are
// declared. Everything else (the .vrmxs JSON Schema, validation, the inspector, the MCP tool
// schemas) is generated from it, so adding a type is one definition, not five edits.
//
// A project's own behaviours declare themselves the same way (M6 W0, AB-D-0297 item 4): a behaviour class in the
// project's behaviours module carries a static `describe`, the very `def` `behaviour(name, def)` takes, and `project()`
// (./project.js reads a module) puts them beside the engine's. One field is new for both: `state`, a JSON Schema of the
// state the behaviour keeps (what its getState returns). A behaviour without it has not declared its state, which is
// not the same as declaring none: `{ "type": "null" }` declares none. The registry keeps its own deep-frozen copy.
//
// What two declarations of a state are compared by is `stateShape(behaviour)` (./state.js), and nothing else: the
// canonical JSON (keys sorted at every depth) of the state schema with its annotations (description, title, examples,
// $comment) taken out, or null when the behaviour hasn't declared one. M6 W5's save fingerprint hashes it and W2's hot
// reload compares it, so a reordered key or a reworded description changes neither. Its name and output are a contract:
// changing either changes every save's fingerprint.

import { parseCondition, conditionRefs } from './condition.js';

// ---------------------------------------------------------------- prop types
// Each prop type knows its JSON Schema. `meta` carries what a schema can't: units, the inspector
// widget, whether the prop is simulated (inside the determinism boundary) or presentation.
// Optional meta (only written when given, so a prop without them describes as before): `step` and `precision` for the
// inspector's number field (AB-T-0600), `visibleIf` and `enabledIf`, conditions over the node's other props (AB-T-0602,
// ./condition.js).
// An object prop whose fields name nodes says which in `meta.nodeRefs` (M5 W5): dot paths into its value, `[]` for each
// item of a list (`['target', 'targets[]']`, and `'[].speaker'` for a field of each item of a list prop, M6 W1); a value
// may be "id", "id/inner" or "id#head". Copy and paste remap them, and changing a node's id rewrites them (M6 W1).
// `widget: 'layer'` (M6 W1) marks a collision layer: the inspector offers the game's physics layers (game.json).
const OPTIONAL_META = ['step', 'precision', 'visibleIf', 'enabledIf'];
const base = (schema, opts = {}) => ({
  schema: { ...schema, ...(opts.description ? { description: opts.description } : {}), ...(opts.default !== undefined ? { default: opts.default } : {}) },
  meta: { unit: opts.unit, widget: opts.widget, sim: opts.sim ?? false, ...Object.fromEntries(OPTIONAL_META.filter((k) => opts[k] !== undefined).map((k) => [k, opts[k]])) },
});
// A prop written as bare JSON Schema (how a project's behaviours module writes one: it can't import P, only
// @vrmxg/core), as P would have made it. Keys a schema doesn't have are taken as the prop's meta: `unit`, `widget`,
// `sim`, `step`, `precision`, `visibleIf`, `enabledIf`, and `nodeRef: true` (a node id) or `assetTypes: [...]` (an asset
// reference), as P.nodeRef and P.assetRef mark theirs. A prop P made (it has `schema`) is kept as it is.
const SCHEMA_META = ['unit', 'widget', 'sim', 'nodeRef', 'assetTypes', ...OPTIONAL_META];
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** @param {any} p a prop as P makes it, or bare JSON Schema */
export function prop(p) {
  // P makes { schema, meta }: a bare schema that only has a key called `schema` is still a bare schema
  if (isObject(p) && isObject(p.schema) && isObject(p.meta)) return p;
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error(`a prop is JSON Schema (an object), not ${JSON.stringify(p)}`);
  const schema = Object.fromEntries(Object.entries(p).filter(([k]) => !SCHEMA_META.includes(k)));
  const widget = p.widget ?? (p.nodeRef ? 'node' : p.assetTypes ? 'asset' : undefined);
  return {
    schema, meta: { unit: p.unit, widget, sim: p.sim ?? false, ...Object.fromEntries(OPTIONAL_META.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])) },
    ...(p.nodeRef ? { nodeRef: true } : {}), ...(p.assetTypes ? { assetTypes: p.assetTypes } : {}),
  };
}
const props = (o, owner) => Object.fromEntries(Object.entries(o ?? {}).map(([k, p]) => { try { return [k, prop(p)]; } catch (e) { throw new Error(`${owner}.${k}: ${e.message}`); } }));
// signals and actions: name -> { args: { name: prop }, description }. Nothing else: a typo (`arg:`) is an error, not a
// signal quietly without its arguments.
const MEMBER_KEYS = ['description', 'args'];
const members = (o, owner) => Object.fromEntries(Object.entries(o ?? {}).map(([k, m]) => {
  if (!isObject(m)) throw new Error(`${owner}.${k} is an object ({ description, args }), not ${JSON.stringify(m)}`);
  const unknown = Object.keys(m).filter((x) => !MEMBER_KEYS.includes(x));
  if (unknown.length) throw new Error(`${owner}.${k}: unknown key${unknown.length > 1 ? 's' : ''} ${unknown.map((x) => `"${x}"`).join(', ')} (a signal or action has ${MEMBER_KEYS.join(', ')})`);
  if (m.args != null && !isObject(m.args)) throw new Error(`${owner}.${k}: "args" is an object keyed by name`);
  if (m.description != null && typeof m.description !== 'string') throw new Error(`${owner}.${k}: "description" is text`);
  return [k, { ...(m.description != null ? { description: m.description } : {}), args: props(m.args, `${owner}.${k}`) }];
}));

/** A prop definition with conditions added: `conditional(P.number(), { visibleIf: "shape == 'box'" })`. */
export const conditional = (prop, conditions) => ({ ...prop, meta: { ...prop.meta, ...conditions } });
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

export { parseCondition, conditionRefs, conditionHolds, propConditions } from './condition.js';

// A prop's conditions must parse and read only props the same type (or behaviour) has: a mistake here is the
// definition's, caught when it is defined. (A malformed condition met at run time fails closed instead.)
function checkConditions(owner, props) {
  for (const [k, p] of Object.entries(props)) for (const c of ['visibleIf', 'enabledIf']) {
    const text = p?.meta?.[c];
    if (text === undefined) continue;
    let refs;
    try { refs = conditionRefs(parseCondition(text)); } catch (e) { throw new Error(`${owner}.${k} ${c}: ${e.message} in "${text}"`); }
    const unknown = refs.filter((r) => !Object.hasOwn(props, r) || r === k);
    if (unknown.length) throw new Error(`${owner}.${k} ${c} reads ${unknown.map((u) => `"${u}"`).join(', ')}, which ${owner} has no other prop called`);
  }
}

/** @typedef {ReturnType<typeof createRegistry>} Registry */

// What a behaviour's def may hold: a typo (`signal:`) is an error, not a declaration quietly missing.
const BEHAVIOUR_KEYS = ['description', 'on', 'params', 'signals', 'actions', 'state'];

export function createRegistry() {
  const types = new Map();      // name -> resolved definition (inheritance flattened)
  const behaviours = new Map();   // name -> definition; `source`: 'engine' (defined here) or 'project' (project())

  function define(name, def) {
    if (types.has(name)) throw new Error(`node type ${name} defined twice`);
    const parent = def.extends ? types.get(def.extends) : null;
    if (def.extends && !parent) throw new Error(`${name} extends unknown type ${def.extends}`);
    const props = { ...(parent?.props ?? {}), ...(def.props ?? {}) };
    checkConditions(name, props);
    types.set(name, {
      name,
      extends: def.extends ?? null,
      description: def.description ?? '',
      abstract: def.abstract ?? false,
      asset: def.asset ?? parent?.asset ?? null,          // { types: [...], required }
      props,
      signals: { ...(parent?.signals ?? {}), ...(def.signals ?? {}) },   // name -> { args: {name: P}, description }
      actions: { ...(parent?.actions ?? {}), ...(def.actions ?? {}) },   // name -> { args: {name: P}, description }
      children: def.children ?? parent?.children ?? null,                // allowed child types, or null = any
    });
    api.version++;
    return api;
  }

  // A behaviour's definition as stored, checked. Throws, naming the behaviour, on what it can't take.
  function resolveBehaviour(name, def, source) {
    if (!def || typeof def !== 'object' || Array.isArray(def)) throw new Error(`behaviour ${name}: its definition is an object ({ description, on, params, signals, actions, state })`);
    const unknown = Object.keys(def).filter((k) => !BEHAVIOUR_KEYS.includes(k));
    if (unknown.length) throw new Error(`behaviour ${name}: unknown key${unknown.length > 1 ? 's' : ''} ${unknown.map((k) => `"${k}"`).join(', ')} (a definition has ${BEHAVIOUR_KEYS.join(', ')})`);
    if (def.on != null && (!Array.isArray(def.on) || !def.on.length || def.on.some((t) => typeof t !== 'string'))) throw new Error(`behaviour ${name}: "on" is a list of node types (leave it out to attach to any)`);
    const strange = (def.on ?? []).filter((t) => !types.has(t));
    if (source === 'project' && strange.length) throw new Error(`behaviour ${name} attaches to ${strange.map((t) => `"${t}"`).join(', ')}, which ${strange.length > 1 ? 'are not node types' : 'is not a node type'}`);
    for (const k of ['params', 'signals', 'actions']) if (def[k] != null && (typeof def[k] !== 'object' || Array.isArray(def[k]))) throw new Error(`behaviour ${name}: "${k}" is an object keyed by name`);
    if (def.state !== undefined && def.state !== true && !isObject(def.state)) throw new Error(`behaviour ${name}: "state" is a JSON Schema (an object${def.state === false ? '; false would mean no state is valid, and { "type": "null" } is what declares none' : ''})`);
    const params = props(def.params, name);
    checkConditions(name, params);
    return {
      name, description: def.description ?? '', on: def.on ?? null, // node types it can attach to (null = any)
      params, signals: members(def.signals, name), actions: members(def.actions, name),
      // absent: not declared (not "keeps nothing"). A copy, frozen: changing the class's describe later changes nothing here
      ...(def.state !== undefined ? { state: deepFreeze(structuredClone(def.state)) } : {}),
      source,
    };
  }

  function behaviour(name, def) {
    if (behaviours.has(name)) throw new Error(behaviours.get(name).source === 'project' ? `behaviour ${name} is the project's: an engine behaviour can't take its name` : `behaviour ${name} defined twice`);
    behaviours.set(name, resolveBehaviour(name, def, 'engine'));
    api.version++;
    return api;
  }

  /**
   * The project's behaviours (M6 W0): `decls` maps each name to its declaration (the `describe` of the class the
   * project exports under that name; ./project.js reads them from a module). They replace the project's earlier ones
   * (another project opened, a module reloaded); the engine's stay. All or nothing: on an error nothing changes.
   * A name the engine's behaviours already have is an error: which one a scene meant couldn't be told.
   * @param {Map<string, any> | Record<string, any>} decls
   * @param {{ check?: ((behaviour: any, def: any) => string[]) | null }} [o] check: more problems with a resolved
   *   declaration (./project.js compiles its schemas)
   * @returns {string[]} the names declared
   */
  function project(decls, { check = null } = {}) {
    const entries = decls instanceof Map ? [...decls] : Object.entries(decls ?? {});
    const out = [], problems = [];
    for (const [name, def] of entries) {
      const was = behaviours.get(name);
      if (was?.source === 'engine') { problems.push(`the project's behaviour ${name} has the name of one of the engine's (${was.description ? `"${was.description}"` : name}): rename it`); continue; }
      let b;
      try { b = resolveBehaviour(name, def, 'project'); } catch (e) { problems.push(e.message); continue; }
      const more = check ? check(b, def) : [];
      if (more.length) problems.push(...more); else out.push(b);
    }
    if (problems.length) throw new Error(`the project's behaviours can't be declared: ${problems.join('; ')}`);
    for (const [name, b] of [...behaviours]) if (b.source === 'project') behaviours.delete(name);
    for (const b of out) behaviours.set(b.name, b);
    api.version++;
    return out.map((b) => b.name);
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

  // version: counts every change, so what was compiled from the registry (a scene validator) knows to compile again
  const api = { define, behaviour, project, types, behaviours, isA, surface, get: (n) => types.get(n), version: 0 };
  return api;
}

function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) deepFreeze(x); }
  return v;
}

export { describedBehaviours, declareProjectBehaviours, schemaProblems, schemaFault } from './project.js';
export { stateShape } from './state.js';
