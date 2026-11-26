// M6 W0 (AB-T-0644): a project's behaviours declare themselves (a static `describe` on each class, the def
// `behaviour(name, def)` takes, plus `state`) and sit in the registry beside the engine's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, P, prop, describedBehaviours, declareProjectBehaviours, stateShape } from '../src/index.js';
import { m0Registry } from '../src/m0-nodes.js';
import { canonical } from '../src/state.js';
import { canonical as scriptCanonical } from '../../script/src/hash.js';

class Base { getState() { return null; } }
const zone = (describe) => Object.assign(class extends Base {}, { describe });

test('a prop written as bare JSON Schema reads as P would have made it; one P made is kept', () => {
  assert.deepEqual(prop({ type: 'number', minimum: 0, unit: 'm', step: 0.1 }), { schema: { type: 'number', minimum: 0 }, meta: { unit: 'm', widget: undefined, sim: false, step: 0.1 } });
  const ref = prop({ type: 'string', nodeRef: true, description: 'who' });
  assert.deepEqual(ref, { ...P.nodeRef({ description: 'who' }) });
  assert.deepEqual(prop({ type: 'string', assetTypes: ['audio'] }), P.assetRef(['audio']));
  const made = P.integer({ min: 1 });
  assert.equal(prop(made), made);
  assert.throws(() => prop('number'), /JSON Schema/);
  // a bare schema with a key called `schema` (no `meta`) is still a bare schema
  assert.deepEqual(prop({ type: 'object', schema: { type: 'string' } }).schema, { type: 'object', schema: { type: 'string' } });
});

test('state: kept as declared, absent when not declared (not the same as declaring none)', () => {
  const r = createRegistry();
  r.behaviour('keeps', { state: { type: 'object', properties: { n: { type: 'integer' } } } });
  r.behaviour('none', { state: { type: 'null' } });
  r.behaviour('unsaid', {});
  assert.deepEqual(r.behaviours.get('keeps').state, { type: 'object', properties: { n: { type: 'integer' } } });
  assert.deepEqual(r.behaviours.get('none').state, { type: 'null' });
  assert.equal('state' in r.behaviours.get('unsaid'), false);
  assert.throws(() => r.behaviour('bad', { state: 'object' }), /"state" is a JSON Schema/);
  assert.throws(() => r.behaviour('never', { state: false }), /"state" is a JSON Schema.*"type": "null" \} is what declares none/);
  assert.throws(() => r.behaviour('typo', { signal: {} }), /unknown key "signal"/);
  assert.throws(() => r.behaviour('nowhere', { on: [] }), /"on" is a list of node types \(leave it out/);
});

test('signals and actions are { description, args }, nothing else', () => {
  const r = createRegistry();
  assert.throws(() => r.behaviour('a', { signals: { s: { arg: { x: { type: 'number' } } } } }), /a\.s: unknown key "arg"/);
  assert.throws(() => r.behaviour('b', { actions: { go: 'nope' } }), /b\.go is an object/);
  assert.throws(() => r.behaviour('c', { actions: { go: { args: [] } } }), /c\.go: "args" is an object/);
  r.behaviour('d', { signals: { s: { description: 'said', args: { x: { type: 'number' } } } }, actions: { go: {} } });
  assert.deepEqual(r.behaviours.get('d').signals.s, { description: 'said', args: { x: { schema: { type: 'number' }, meta: { unit: undefined, widget: undefined, sim: false } } } });
  assert.deepEqual(r.behaviours.get('d').actions.go, { args: {} });
});

test('the registry keeps its own frozen copy of a declared state', () => {
  const describe = { state: { type: 'object', properties: { n: { type: 'integer' } } } };
  const r = m0Registry();
  declareProjectBehaviours(r, { z: zone(describe) });
  const kept = r.behaviours.get('z').state;
  describe.state.properties.n.type = 'string';
  describe.state.properties.m = { type: 'boolean' };
  assert.deepEqual(kept, { type: 'object', properties: { n: { type: 'integer' } } }, 'changing the class\'s describe later changes nothing');
  assert.ok(Object.isFrozen(kept) && Object.isFrozen(kept.properties.n));
  assert.throws(() => { 'use strict'; kept.properties.n.type = 'number'; }, TypeError);
});

test('stateShape: the canonical state schema without annotations, the one thing a declared state is compared by', () => {
  const a = { state: { type: 'object', description: 'what it keeps', title: 'S', $comment: 'x', additionalProperties: false, required: ['done'],
    properties: { done: { type: 'boolean', description: 'served', examples: [true] }, description: { type: 'string', title: 'a property called description' } } } };
  const b = { state: { properties: { description: { type: 'string' }, done: { type: 'boolean' } }, required: ['done'], additionalProperties: false, type: 'object' } };
  assert.equal(stateShape(a), stateShape(b), 'reordered keys and reworded annotations: the same shape');
  assert.equal(stateShape(a), '{"additionalProperties":false,"properties":{"description":{"type":"string"},"done":{"type":"boolean"}},"required":["done"],"type":"object"}');
  assert.notEqual(stateShape(a), stateShape({ state: { ...b.state, required: ['done', 'description'] } }), 'what it accepts changed: another shape');
  // `required` and a list of types are sets: their order doesn't matter
  assert.equal(stateShape({ state: { required: ['b', 'a'], type: ['string', 'null'] } }), stateShape({ state: { required: ['a', 'b'], type: ['null', 'string'] } }));
  assert.equal(stateShape({ state: { required: ['b', 'a'] } }), '{"required":["a","b"]}');
  assert.equal(stateShape({ state: { type: 'null' } }), '{"type":"null"}');
  assert.equal(stateShape({}), null, 'not declared');
  assert.equal(stateShape(null), null);
  // deeper schemas too: lists of schemas, items, $defs; data keywords (enum, const, default) are kept whole
  const deep = { state: { anyOf: [{ type: 'null', description: 'none' }, { type: 'array', items: { enum: ['a', 'b'], title: 't' } }], $defs: { x: { const: { description: 'data' }, title: 'y' } } } };
  assert.equal(stateShape(deep), '{"$defs":{"x":{"const":{"description":"data"}}},"anyOf":[{"type":"null"},{"items":{"enum":["a","b"]},"type":"array"}]}');
  // from the registry, as W5 reads it
  const r = m0Registry();
  declareProjectBehaviours(r, { z: zone(a) });
  assert.equal(stateShape(r.behaviours.get('z')), stateShape(a));
  // its canonical JSON is @vrmxg/script's
  for (const v of [a.state, deep.state, [1, { b: 2, a: [null, 'x'] }], { u: undefined, v: 1 }, 'text', 3.5, null]) assert.equal(canonical(v), scriptCanonical(v));
});

test('a schema that isn\'t JSON Schema is refused when declared, not at every validation after', () => {
  const r = m0Registry();
  assert.throws(() => declareProjectBehaviours(r, { z: zone({ params: { a: { type: 'nonsense' } } }) }), /behaviour z: param a is not JSON Schema/);
  assert.throws(() => declareProjectBehaviours(r, { z: zone({ signals: { s: { args: { x: { pattern: '(' } } } } }) }), /signal s's argument x is not JSON Schema/);
  assert.throws(() => declareProjectBehaviours(r, { z: zone({ actions: { go: { args: { x: { minimum: 'one' } } } } }) }), /action go's argument x is not JSON Schema/);
  assert.throws(() => declareProjectBehaviours(r, { z: zone({ state: { type: 'object', properties: { n: { type: 'int' } } } }) }), /behaviour z: its state is not JSON Schema/);
  assert.ok(!r.behaviours.has('z'), 'nothing declared');
  // self-contained: a reference would resolve against the scene schema it is set in
  assert.throws(() => declareProjectBehaviours(r, { z: zone({ params: { a: { $ref: '#/$defs/n', $defs: { n: { type: 'number' } } } } }) }), /param a uses "\$ref": a declaration's schemas are self-contained/);
  assert.throws(() => declareProjectBehaviours(r, { z: zone({ state: { type: 'object', properties: { n: { $id: 'urn:n', type: 'integer' } } } }) }), /its state uses "\$id"/);
  // a `$ref` key in data is a value
  assert.deepEqual(declareProjectBehaviours(r, { z: zone({ params: { a: { type: 'object', default: { $ref: 'x' } } } }) }), ['z']);
});

test('a subclass doesn\'t inherit its parent\'s describe: it may keep other state', () => {
  const parent = zone({ state: { type: 'null' } });
  class child extends parent { getState() { return { n: 1 }; } }
  assert.deepEqual([...describedBehaviours({ parent, child }).keys()], ['parent']);
  const own = Object.assign(class extends parent {}, { describe: { state: { type: 'object' } } });
  assert.deepEqual(describedBehaviours({ own }).get('own'), { state: { type: 'object' } });
});

test('the classes of a module that carry a describe are its declarations, under the names they are exported as', () => {
  const tableZone = zone({ on: ['Area'], params: { points: { type: 'integer', default: 10 } } });
  const mod = { tableZone, alias: tableZone, wander: class extends Base {}, helper: () => 1, VALUE: 3 };
  assert.deepEqual([...describedBehaviours(mod).keys()], ['tableZone', 'alias']);
  assert.deepEqual([...describedBehaviours(new Map([['z', tableZone]])).keys()], ['z']);
  assert.deepEqual([...describedBehaviours(null).keys()], []);
  assert.throws(() => describedBehaviours({ bad: zone(() => ({})) }), /bad: its static describe is an object/);
});

test('project behaviours sit beside the engine\'s; a clash with an engine behaviour is an error and changes nothing', () => {
  const r = m0Registry(), engine = r.behaviours.size, v0 = r.version;
  const served = { args: { right: { type: 'boolean' } } };
  assert.deepEqual(declareProjectBehaviours(r, { tableZone: zone({ on: ['Area'], signals: { served }, state: { type: 'null' } }) }), ['tableZone']);
  assert.ok(r.version > v0, 'the version moves: what was compiled from the registry compiles again');
  const b = r.behaviours.get('tableZone');
  assert.equal(b.source, 'project');
  assert.equal(r.behaviours.get('wander').source, 'engine');
  assert.deepEqual(b.signals.served.args.right.schema, { type: 'boolean' });
  // a node with it has its signal
  assert.ok(r.surface({ type: 'Area', behaviours: [{ use: 'tableZone' }] }).signals.served);
  // a clash: the error names it, and the project's earlier declarations stay
  assert.throws(() => declareProjectBehaviours(r, { other: zone({}), wander: zone({}) }), /behaviour wander has the name of one of the engine's/);
  assert.ok(r.behaviours.has('tableZone') && !r.behaviours.has('other'));
  // another project (or the module again): the earlier ones go, the engine's stay
  declareProjectBehaviours(r, { pressToStart: zone({}) });
  assert.ok(!r.behaviours.has('tableZone') && r.behaviours.has('pressToStart'));
  assert.equal(r.behaviours.size, engine + 1);
  declareProjectBehaviours(r, {});
  assert.equal(r.behaviours.size, engine);
  // and an engine behaviour can't take a project's name later
  declareProjectBehaviours(r, { late: zone({}) });
  assert.throws(() => r.behaviour('late', {}), /is the project's/);
});

test('a project behaviour must attach to node types the registry has, and its conditions read its own params', () => {
  const r = m0Registry();
  assert.throws(() => declareProjectBehaviours(r, { z: zone({ on: ['Zone'] }) }), /attaches to "Zone", which is not a node type/);
  assert.throws(() => declareProjectBehaviours(r, { z: zone({ params: { a: { type: 'number', visibleIf: 'b > 1' } } }) }), /z\.a visibleIf reads "b"/);
  assert.deepEqual(declareProjectBehaviours(r, { z: zone({ params: { b: { type: 'number' }, a: { type: 'number', visibleIf: 'b > 1' } } }) }), ['z']);
  assert.equal(r.behaviours.get('z').params.a.meta.visibleIf, 'b > 1');
});
