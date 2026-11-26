// M6 W0 (AB-T-0644): a project's behaviours declare themselves (a static `describe` on each class, the def
// `behaviour(name, def)` takes, plus `state`) and sit in the registry beside the engine's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, P, prop, describedBehaviours, declareProjectBehaviours } from '../src/index.js';
import { m0Registry } from '../src/m0-nodes.js';

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
  assert.throws(() => r.behaviour('typo', { signal: {} }), /unknown key "signal"/);
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
