// Generates JSON Schema (2020-12) from the registry: one for a whole .vrmxs document, one per node
// type and per behaviour (for the inspector and MCP "describe"). Unknown node types, props and
// behaviours stay valid here (round-trip must keep them); lint reports them as warnings.

const ID = { type: 'string', pattern: '^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$', description: 'Stable node id; "/" separates instance levels.' };
const TRANSFORM = {
  type: 'object', additionalProperties: false, description: 'Local transform: metres, Y up, right-handed, +Z forward (VRM 1.0 frame).',
  properties: {
    p: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Position (m).' },
    q: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4, description: 'Rotation quaternion x, y, z, w.' },
    s: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Scale.' },
  },
};

const propsSchema = (props) => ({
  type: 'object', additionalProperties: true,
  properties: Object.fromEntries(Object.entries(props).map(([k, p]) => [k, p.schema])),
});
const argsSchema = (args = {}) => ({
  type: 'object', additionalProperties: false,
  properties: Object.fromEntries(Object.entries(args).map(([k, p]) => [k, p.schema])),
});

export function behaviourSchema(b) {
  return {
    type: 'object', required: ['use'], description: b.description,
    properties: { use: { const: b.name }, ...propsSchema(b.params).properties },
    additionalProperties: true,
  };
}

// The schema of one node of `type`: what the inspector edits and what MCP describe returns.
export function nodeSchema(reg, type) {
  const t = reg.get(type);
  const s = {
    type: 'object', required: ['id', 'type'], description: t.description,
    properties: {
      id: ID, type: { const: type }, parent: ID, name: { type: 'string' }, transform: TRANSFORM,
      tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
      props: propsSchema(t.props),
      behaviours: {
        type: 'array',
        items: {
          type: 'object', required: ['use'], properties: { use: { type: 'string' } },
          // Known behaviours get their params checked; unknown ones pass (kept on round-trip).
          allOf: [...reg.behaviours.values()].map((b) => ({ if: { properties: { use: { const: b.name } }, required: ['use'] }, then: behaviourSchema(b) })),
        },
      },
    },
    additionalProperties: true,
  };
  if (t.asset) {
    s.properties.asset = { type: 'string', description: `Id of an entry in "assets" of type ${t.asset.types.join(' or ')}.` };
    if (t.asset.required) s.required.push('asset');
  }
  if (type === 'Instance') {
    s.properties.overrides = {
      type: 'object', description: 'Partial nodes keyed by inner node id ("hinge", or "frame/hinge" for nested prefabs), deep-merged over the prefab.',
      additionalProperties: { type: 'object', properties: { name: { type: 'string' }, transform: TRANSFORM, props: { type: 'object' }, behaviours: { type: 'array' }, tags: { type: 'array' } }, additionalProperties: false },
    };
  }
  return s;
}

// For describe: the node schema plus signals and actions, which are not document data.
export function describeType(reg, type) {
  const t = reg.get(type);
  const chain = []; for (let x = t; x; x = x.extends ? reg.get(x.extends) : null) chain.push(x.name);
  return {
    type, extends: chain.slice(1), description: t.description,
    asset: t.asset, schema: nodeSchema(reg, type),
    propMeta: Object.fromEntries(Object.entries(t.props).map(([k, p]) => [k, { ...p.meta, ...(p.assetTypes ? { assetTypes: p.assetTypes } : {}), ...(p.nodeRef ? { nodeRef: true } : {}) }])),
    signals: Object.fromEntries(Object.entries(t.signals).map(([k, v]) => [k, { description: v.description, args: argsSchema(v.args) }])),
    actions: Object.fromEntries(Object.entries(t.actions).map(([k, v]) => [k, { description: v.description, args: argsSchema(v.args) }])),
    behaviours: [...reg.behaviours.values()].filter((b) => !b.on || b.on.some((o) => reg.isA(type, o))).map((b) => b.name),
  };
}

// A behaviour, the engine's or the project's (`project: true`, M6 W0). `state` is the JSON Schema of what it keeps,
// when it declares one; absent, it hasn't said.
export function describeBehaviour(reg, name) {
  const b = reg.behaviours.get(name);
  if (!b) throw new Error(`no behaviour "${name}" (the engine's: ${[...reg.behaviours.values()].filter((x) => x.source !== 'project').map((x) => x.name).join(', ')}; the project's: ${[...reg.behaviours.values()].filter((x) => x.source === 'project').map((x) => x.name).join(', ') || 'none'})`);
  const member = (v) => ({ ...(v.description ? { description: v.description } : {}), args: argsSchema(v.args) });
  return {
    behaviour: name, description: b.description, on: b.on, ...(b.source === 'project' ? { project: true } : {}), schema: behaviourSchema(b),
    propMeta: Object.fromEntries(Object.entries(b.params).map(([k, p]) => [k, { ...p.meta, ...(p.assetTypes ? { assetTypes: p.assetTypes } : {}), ...(p.nodeRef ? { nodeRef: true } : {}) }])),
    signals: Object.fromEntries(Object.entries(b.signals).map(([k, v]) => [k, member(v)])),
    actions: Object.fromEntries(Object.entries(b.actions).map(([k, v]) => [k, member(v)])),
    ...(b.state !== undefined ? { state: b.state } : {}),
  };
}

// The whole-document schema. Node items dispatch on "type" with if/then, so a known type gets its
// own checks and an unknown type still passes the base shape (it must survive a round-trip).
export function documentSchema(reg) {
  const defs = {};
  for (const name of reg.types.keys()) defs[`node.${name}`] = nodeSchema(reg, name);
  for (const [name, b] of reg.behaviours) defs[`behaviour.${name}`] = behaviourSchema(b);
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://xocialize.dev/schemas/vrmxs/1.json',
    title: 'VRMXG scene (.vrmxs) v1',
    type: 'object', required: ['format', 'version', 'id', 'nodes'],
    properties: {
      format: { const: 'vrmxs' }, version: { const: 1 }, id: { type: 'string' },
      assets: {
        type: 'array', items: {
          type: 'object', required: ['id', 'type', 'ref'], additionalProperties: true,
          properties: { id: { type: 'string' }, type: { enum: ['vrmxa', 'vrmxw', 'vrmxi', 'vrmxs', 'glb', 'vrma', 'audio', 'texture'] }, ref: { type: 'string', description: 'Path relative to the project root.' }, sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' } },
        },
      },
      nodes: {
        type: 'array',
        items: {
          type: 'object', required: ['id', 'type'], properties: { id: ID, type: { type: 'string' }, parent: ID },
          allOf: [...reg.types.keys()].map((name) => ({ if: { properties: { type: { const: name } }, required: ['type'] }, then: { $ref: `#/$defs/node.${name}` } })),
        },
      },
      connections: {
        type: 'array', items: {
          type: 'object', required: ['from', 'signal', 'to', 'call'], additionalProperties: true,
          properties: { from: ID, signal: { type: 'string' }, to: ID, call: { type: 'string' }, args: { type: 'object' } },
        },
      },
      settings: { type: 'object' },
    },
    additionalProperties: true,
    $defs: defs,
  };
}
