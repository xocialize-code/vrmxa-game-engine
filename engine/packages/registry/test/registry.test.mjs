import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, P } from '@vrmxg/registry';
import { m0Registry } from '@vrmxg/registry/m0';

test('define flattens inheritance: props, signals and actions accumulate; overrides win', () => {
  const r = createRegistry();
  r.define('Base', { props: { a: P.number({ default: 1 }), b: P.boolean() }, signals: { s1: {} }, actions: { act1: { args: {} } } });
  r.define('Mid', { extends: 'Base', props: { b: P.string(), c: P.vec3() }, signals: { s2: {} } });
  r.define('Leaf', { extends: 'Mid', actions: { act2: { args: {} } } });
  const leaf = r.get('Leaf');
  assert.deepEqual(Object.keys(leaf.props).sort(), ['a', 'b', 'c']);
  assert.equal(leaf.props.b.schema.type, 'string', 'child prop replaces parent prop');
  assert.deepEqual(Object.keys(leaf.signals).sort(), ['s1', 's2']);
  assert.deepEqual(Object.keys(leaf.actions).sort(), ['act1', 'act2']);
  assert.ok(r.isA('Leaf', 'Base') && r.isA('Leaf', 'Leaf') && !r.isA('Base', 'Leaf'));
});

test('define refuses duplicates and unknown parents', () => {
  const r = createRegistry();
  r.define('A', {});
  assert.throws(() => r.define('A', {}), /defined twice/);
  assert.throws(() => r.define('B', { extends: 'Nope' }), /extends unknown type Nope/);
  r.behaviour('x', {});
  assert.throws(() => r.behaviour('x', {}), /defined twice/);
});

test('prop types carry JSON Schema and metadata (units, widgets, simulation flag)', () => {
  assert.deepEqual(P.number({ min: 0, max: 1, default: 0.5 }).schema, { type: 'number', minimum: 0, maximum: 1, default: 0.5 });
  assert.equal(P.number({ unit: 'm', sim: true }).meta.unit, 'm');
  assert.equal(P.number({ sim: true }).meta.sim, true);
  assert.deepEqual(P.enum(['a', 'b']).schema, { enum: ['a', 'b'] });
  assert.equal(P.vec3().schema.minItems, 3);
  assert.equal(P.quat().schema.maxItems, 4);
  assert.match('#a0B1c2', new RegExp(P.color().schema.pattern));
  assert.deepEqual(P.assetRef(['glb']).assetTypes, ['glb']);
  assert.equal(P.nodeRef().nodeRef, true);
});

test('surface: a node has its type\'s signals and actions plus its behaviours\'', () => {
  const r = m0Registry();
  const s = r.surface({ id: 'h', type: 'RigidBody', behaviours: [{ use: 'hinge' }] });
  assert.ok(s.signals.opened && s.signals.contact && s.signals.ready);
  assert.ok(s.actions.open && s.actions.applyImpulse && s.actions.show);
  assert.deepEqual(Object.keys(r.surface({ id: 'x', type: 'Unknown' }).signals), []);
});

test('the M0 fixture set: 14 types, 4 behaviours, all derived from Node3D', () => {
  const r = m0Registry();
  assert.equal(r.types.size, 14);
  assert.equal(r.behaviours.size, 4);
  for (const t of r.types.keys()) assert.ok(r.isA(t, 'Node3D'), t);
});
