// Conditional props (AB-T-0602): the evaluator, failing closed, the registry's checks at define time, and the M0 types
// that use them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, P, conditional, parseCondition, conditionRefs, conditionHolds, propConditions } from '../src/index.js';
import { m0Registry } from '../src/m0-nodes.js';

test('the evaluator: names, literals, comparisons, && || ! and parentheses', () => {
  const v = { shape: 'box', castShadow: true, kind: 'point', n: 3, s: '', z: 0, none: null };
  const yes = ["shape == 'box'", 'castShadow', "castShadow && kind != 'ambient'", '!(shape == "sphere")', 'n > 2 && n <= 3', 'n >= 3', 'n < 4',
    "shape == 'sphere' || shape == 'box'", '!s', '!z', 'none == null', 'missing == null', '!missing', "'b' > 'a'", 'true', '1.5 > 1', '.5 < 1', "kind == 'point' && (n == 1 || n == 3)"];
  const no = ["shape != 'box'", '!castShadow', "shape == 'sphere'", 'n > 3', 'false', 'null', "n == '3'", "n < 'x'", 'missing', 'missing > 0', "s == null"];
  for (const e of yes) assert.equal(conditionHolds(e, v), true, e);
  for (const e of no) assert.equal(conditionHolds(e, v), false, e);
  assert.equal(conditionHolds(undefined, v), true, 'no condition: applies');
  assert.equal(conditionHolds("kind == 'it\\'s'", { kind: "it's" }), true, 'escaped quotes');
  assert.equal(conditionHolds('a', (k) => (k === 'a' ? 1 : undefined)), true, 'a reader function');
});

test('a malformed condition fails closed: the field is shown and editable', () => {
  for (const bad of ['', '   ', 'shape ==', "shape == 'box", '(a', 'a)', 'a = 1', 'a + 1', 'f()', 'a.b', 'a b', '&& a', '#']) {
    assert.throws(() => parseCondition(bad), undefined, bad);
    assert.equal(conditionHolds(bad, {}), true, bad);
  }
});

test('nothing in a condition runs code: no member access, calls or globals', () => {
  for (const bad of ['constructor.constructor', 'this', '__proto__.x', 'globalThis.process']) assert.equal(conditionHolds(bad, {}), bad === 'this' ? false : true, bad);
  assert.equal(conditionHolds('constructor', {}), false, 'a name is read from the values only (own properties)');
  assert.equal(conditionHolds('toString', {}), false);
  assert.deepEqual(conditionRefs(parseCondition("a && (b == 'x' || !c)")).sort(), ['a', 'b', 'c']);
});

test('the registry checks conditions when a type is defined: they parse and read the type\'s own props', () => {
  const r = createRegistry();
  r.define('T', { props: { kind: P.enum(['a', 'b']), size: conditional(P.number(), { visibleIf: "kind == 'a'" }) } });
  assert.throws(() => r.define('U', { props: { size: P.number({ visibleIf: 'kind ==' }) } }), /U\.size visibleIf: .* in "kind =="/);
  assert.throws(() => r.define('V', { props: { size: P.number({ enabledIf: 'colour' }) } }), /V\.size enabledIf reads "colour"/);
  assert.throws(() => r.define('W', { props: { size: P.number({ visibleIf: 'size' }) } }), /reads "size"/, 'not itself');
  r.define('X', { extends: 'T', props: { other: P.boolean({ visibleIf: 'size > 1' }) } }); // inherited props count
  assert.throws(() => r.behaviour('b', { params: { a: P.number({ visibleIf: 'zz' }) } }), /b\.a visibleIf reads "zz"/);
  assert.equal(P.number({ min: 0 }).meta.visibleIf, undefined, 'a prop without conditions has no such keys');
  assert.deepEqual(Object.keys(P.number({ min: 0 }).meta), ['unit', 'widget', 'sim']);
  assert.deepEqual(P.number({ step: 0.1, precision: 2 }).meta, { unit: undefined, widget: undefined, sim: false, step: 0.1, precision: 2 });
});

test('the M0 lights, collider and environment say when their props apply', () => {
  const r = m0Registry();
  const c = (type, set) => propConditions(r.get(type).props, set);
  for (const t of ['DirectionalLight', 'PointLight', 'SpotLight']) assert.equal(r.get(t).props.shadowPreset.meta.visibleIf, 'castShadow', t);
  assert.equal(c('DirectionalLight', {}).shadowPreset.visible, true, 'a directional light casts by default');
  assert.equal(c('PointLight', {}).shadowPreset.visible, false, 'a point light does not');
  assert.equal(c('PointLight', { castShadow: true }).shadowUpdate.visible, true);
  assert.equal(c('DirectionalLight', { castShadow: false }).shadowExtent.visible, false);
  const box = c('Collider', {}), sphere = c('Collider', { shape: 'sphere' }), capsule = c('Collider', { shape: 'capsule' });
  assert.deepEqual([box.size.visible, box.radius.visible, box.height.visible], [true, false, false], 'box (the default)');
  assert.deepEqual([sphere.size.visible, sphere.radius.visible, sphere.height.visible], [false, true, false]);
  assert.deepEqual([capsule.size.visible, capsule.radius.visible, capsule.height.visible], [false, true, true]);
  assert.equal(c('Area', { shape: 'sphere' }).radius.visible, true, 'Area inherits them');
  assert.equal(c('Environment', {}).fogNear.visible, false);
  assert.equal(c('Environment', { fog: 'linear' }).fogNear.visible, true);
  assert.equal(c('Environment', { environment: 'none' }).environmentIntensity.enabled, false);
  assert.equal(c('Environment', {}).environmentIntensity.enabled, true);
});
