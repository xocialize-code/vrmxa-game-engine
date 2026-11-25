// The inspector's decisions (AB-T-0599, 0601, 0602): widgets from JSON Schema, branches, valid new rows, edits that keep
// unknown data, a node's fields with its conditions, and several nodes' fields with a mixed state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { m0Registry } from '@vrmxg/registry/m0';
import { describeType, describeBehaviour, createValidator } from '@vrmxg/scene';
import {
  widgetOf, resolveSchema, branchesOf, branchIndex, defaultFor, matches, setIn, getIn, listAdd, listRemove, listMove, rowActions,
  mapRename, mapAdd, mapRemove, freshKey, structRows, fitBranch, rowTitle, isCurve, curvePoints, nextCurveKey, childOf, inspectorFields, sharedFields, sharedAxes, fieldName,
} from '../src/index.js';

const reg = m0Registry();
const fieldsOf = (node) => inspectorFields(describeType(reg, node.type), node);

test('no M0 prop with a schema gets a JSON box: every type\'s and behaviour\'s props have a real widget', () => {
  const seen = new Map();
  for (const type of reg.types.keys()) {
    const d = describeType(reg, type);
    for (const [k, s] of Object.entries(d.schema.properties.props.properties)) {
      const w = widgetOf(s, d.propMeta[k], s.default);
      assert.notEqual(w, 'json', `${type}.${k}`);
      seen.set(`${type}.${k}`, w);
    }
  }
  for (const name of reg.behaviours.keys()) {
    const b = reg.behaviours.get(name);
    for (const [k, p] of Object.entries(b.params)) assert.notEqual(widgetOf(p.schema, p.meta, p.schema.default), 'json', `${name}.${k}`);
  }
  // the seven the task named, and the game and dialogue props since
  assert.equal(seen.get('AnimationPlayer.tracks'), 'list');
  assert.equal(seen.get('Environment.post'), 'choice');
  assert.equal(seen.get('Dialogue.lines'), 'list');
  assert.equal(seen.get('GameRules.win'), 'struct');
  assert.equal(seen.get('GameRules.flags'), 'map');
  assert.equal(seen.get('GameRules.reads'), 'struct');
  assert.equal(seen.get('Path3D.points'), 'list');
  assert.equal(seen.get('Collider.size'), 'vec');
  assert.equal(seen.get('Character.gaze'), 'list');
  const brain = reg.behaviours.get('brain').params, notice = reg.behaviours.get('noticeViewer').params;
  assert.equal(widgetOf(brain.preset.schema, brain.preset.meta), 'choice');
  assert.equal(widgetOf(brain.vars.schema, brain.vars.meta), 'struct');
  assert.equal(widgetOf(brain.senses.schema, brain.senses.meta), 'struct');
  assert.equal(widgetOf(notice.answers.schema, notice.answers.meta), 'map');
  assert.equal(widgetOf(notice.say.schema, notice.say.meta), 'map');
  assert.ok(describeBehaviour(reg, 'brain'));
});

test('widgets from schema, meta and, for untyped data, the value', () => {
  assert.equal(widgetOf({ type: 'number' }), 'number');
  assert.equal(widgetOf({ type: 'integer' }), 'number');
  assert.equal(widgetOf({ type: 'string' }, { widget: 'color' }), 'color');
  assert.equal(widgetOf({ type: 'string' }, { nodeRef: true }), 'node');
  assert.equal(widgetOf({ type: 'string' }, { widget: 'asset' }), 'asset');
  assert.equal(widgetOf({ type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 }, { widget: 'quat' }), 'vec');
  assert.equal(widgetOf({ type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }), 'vec');
  assert.equal(widgetOf({ type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 } }), 'curve');
  assert.equal(widgetOf({ type: ['boolean', 'number', 'string'] }), 'scalar');
  assert.equal(widgetOf({ type: 'object', additionalProperties: { type: 'string' } }), 'map');
  assert.equal(widgetOf({ type: 'object' }), 'struct');
  assert.equal(widgetOf({ const: 1 }), 'const');
  assert.equal(widgetOf({}, {}, [[0, 1], [10, 2, 'easeIn']]), 'curve', 'a property track\'s keys');
  assert.equal(widgetOf({}, {}, { a: [[0, 1]] }), 'struct');
  assert.equal(widgetOf({}, {}, 3), 'number');
  assert.equal(widgetOf({}, {}, undefined), 'json', 'untyped and empty: the one case left for text');
});

test('a game condition is edited under its test\'s branch; changing the test brings that branch\'s required fields', () => {
  const win = reg.get('GameRules').props.win.schema;
  const state = resolveSchema(win, { test: 'state', key: 'score' });
  assert.deepEqual(Object.keys(state.properties).sort(), ['key', 'op', 'test', 'value']);
  assert.ok(state.properties.test.enum, 'the base test (with its enum) is kept over the branch\'s empty one');
  assert.equal(state.additionalProperties, false);
  assert.deepEqual(Object.keys(resolveSchema(win, { test: 'all', of: [] }).properties).sort(), ['of', 'test']);
  assert.deepEqual(defaultFor(win), { test: 'state', key: 'new' }, 'a valid new condition');
  const v = createValidator(reg);
  const doc = (when) => ({ format: 'vrmxs', version: 1, id: 's', nodes: [{ id: 'g', type: 'GameGoal', props: { when } }] });
  assert.equal(v.check(doc(defaultFor(win))).ok, true);
  const all = fitBranch(win, { ...defaultFor(win), test: 'all' });
  assert.deepEqual(all, { test: 'all', of: [{ test: 'state', key: 'new' }] }, 'the state test\'s key goes, all\'s of comes');
  assert.equal(v.check(doc(all)).ok, true);
  assert.deepEqual(fitBranch(win, { test: 'not', of: { test: 'state', key: 'a' } }), { test: 'not', of: { test: 'state', key: 'a' } });
  assert.deepEqual(fitBranch({ type: 'object' }, { a: 1 }), { a: 1 }, 'an open object is left alone');
});

test('a new row is valid under its schema: a dialogue line, a choice, a track, a reads entry', () => {
  const v = createValidator(reg);
  const lines = reg.get('Dialogue').props.lines.schema;
  const line = defaultFor(lines.items);
  assert.deepEqual(line, { text: 'new' });
  assert.equal(v.check({ format: 'vrmxs', version: 1, id: 's', nodes: [{ id: 'd', type: 'Dialogue', props: { lines: [line, { ...line, choices: [defaultFor(lines.items.properties.choices.items)] }] } }] }).ok, true);
  assert.deepEqual(defaultFor(reg.get('AnimationPlayer').props.tracks.schema.items), { type: 'property' });
  assert.deepEqual(defaultFor(lines), [{ text: 'new' }], 'minItems 1');
  assert.deepEqual(defaultFor({ type: 'number', exclusiveMinimum: 0 }), 1);
  assert.deepEqual(defaultFor({ type: 'string', pattern: '^[A-Za-z0-9_-]+$', minLength: 1 }), 'new');
  assert.deepEqual(defaultFor({ type: 'string', pattern: '\\.json$' }), '', 'no placeholder fits: empty (the field waits for typing)');
  assert.deepEqual(defaultFor({ type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }), [0, 0, 0]);
  assert.deepEqual(defaultFor({ type: 'object', additionalProperties: { type: 'string' } }), {});
});

test('anyOf branches: the post stack (a preset or a list of effects) and a brain\'s preset', () => {
  const post = reg.get('Environment').props.post.schema;
  assert.deepEqual(branchesOf(post).map((b) => b.label), ['text', 'list']);
  assert.equal(branchIndex(post, 'anime'), 0);
  assert.equal(branchIndex(post, [{ effect: 'bloom' }]), 1);
  const preset = reg.behaviours.get('brain').params.preset.schema;
  assert.deepEqual(branchesOf(preset).map((b) => b.label), ['choice', 'path', 'fields']);
  assert.equal(branchIndex(preset, 'server'), 0);
  assert.equal(branchIndex(preset, 'brains/hana.json'), 1);
  assert.equal(branchIndex(preset, { plan: {} }), 2);
  assert.equal(branchIndex(preset, 'not-a-preset'), 0, 'a string that fits no branch: the first string branch');
  assert.equal(matches({ type: 'string', pattern: '\\.json$' }, 'a.json'), true);
  assert.equal(matches({ type: 'object', required: ['effect'] }, {}), false);
  assert.equal(matches({ type: 'integer' }, 1.5), false);
  assert.equal(matches({ type: 'number' }, 2), true);
});

test('edits keep what they don\'t touch, unknown keys included', () => {
  const v = { lines: [{ text: 'Hi', future: { x: 1 } }, { text: 'Bye' }], extra: true };
  const w = setIn(v, ['lines', 0, 'text'], 'Hello');
  assert.deepEqual(w, { lines: [{ text: 'Hello', future: { x: 1 } }, { text: 'Bye' }], extra: true });
  assert.equal(v.lines[0].text, 'Hi', 'the input is not changed');
  assert.deepEqual(setIn({ a: 1, b: 2 }, ['a'], undefined), { b: 2 }, 'undefined removes a key');
  assert.equal(getIn(w, ['lines', 1, 'text']), 'Bye');
  assert.deepEqual(listAdd([1, 2], 3), [1, 2, 3]);
  assert.deepEqual(listAdd([1, 3], 2, 0), [1, 2, 3]);
  assert.deepEqual(listRemove([1, 2, 3], 1), [1, 3]);
  assert.deepEqual(listMove([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(listMove([1, 2, 3], 2, 1), [1, 2, 3], 'clamped at the end');
  assert.deepEqual(rowActions([1], 0, { minItems: 1 }), { remove: false, up: false, down: false });
  assert.deepEqual(rowActions([1, 2], 1, {}), { remove: true, up: true, down: false });
  assert.deepEqual(Object.keys(mapRename({ a: 1, b: 2, c: 3 }, 'b', 'z')), ['a', 'z', 'c'], 'a renamed key keeps its place');
  assert.deepEqual(mapRename({ a: 1, b: 2 }, 'a', 'b'), { a: 1, b: 2 }, 'not onto a key that is there');
  assert.deepEqual(mapAdd({ a: 1 }, 'b', 'x'), { a: 1, b: 'x' });
  assert.deepEqual(mapAdd({ a: 1 }, 'a', 'x'), { a: 1 });
  assert.deepEqual(mapRemove({ a: 1, b: 2 }, 'a'), { b: 2 });
  assert.equal(freshKey({ key: 1, 'key-2': 1 }), 'key-3');
});

test('a struct\'s rows: the schema\'s fields in order, then unknown keys (kept), and whether more may be added', () => {
  const line = reg.get('Dialogue').props.lines.schema.items;
  const r = structRows(line, { text: 'Hi', mood: 'warm' });
  assert.deepEqual(r.rows.map((x) => [x.key, x.known, x.set, x.required]).slice(0, 3), [['id', true, false, false], ['speaker', true, false, false], ['text', true, true, true]]);
  assert.deepEqual(r.rows.at(-1), { key: 'mood', schema: { type: 'string' }, required: false, known: false, set: true });
  assert.equal(r.open, false, 'additionalProperties: false');
  const free = structRows({ type: 'object' }, { sight: { range: 12 }, decay: 0.5 });
  assert.deepEqual(free.rows.map((x) => [x.key, x.schema.type]), [['sight', 'object'], ['decay', 'number']]);
  assert.equal(free.open, true);
  assert.equal(rowTitle({ id: 'hello', text: 'Hi' }, 0), 'hello');
  assert.equal(rowTitle({ effect: 'bloom' }, 3), 'bloom');
  assert.equal(rowTitle(5, 3), '4');
});

test('curves: keys as a preview line, and the next key', () => {
  assert.equal(isCurve([[0, 0], [10, 1, 'easeOut']]), true);
  assert.equal(isCurve([[0, 'x']]), false);
  assert.equal(curvePoints([[0, 0], [10, 1]], 100, 10), '0,10 100,0');
  assert.deepEqual(nextCurveKey([[0, 0], [10, 1]]), [20, 1]);
  assert.deepEqual(nextCurveKey([]), [0, 0]);
});

test('ids and names: a row\'s id counts from 0, its name from 1', () => {
  const lines = { id: 'prop-lines', label: 'lines' };
  assert.deepEqual(childOf(lines, 0), { id: 'prop-lines-0', label: 'lines 1' });
  assert.deepEqual(childOf(childOf(lines, 0), 'text'), { id: 'prop-lines-0-text', label: 'lines 1 text' });
  assert.deepEqual(childOf({ id: 'prop-flags', label: 'flags' }, 'till closed'), { id: 'prop-flags-till-closed', label: 'flags till closed' });
  assert.equal(fieldName('intensity', true), 'intensity (mixed values)');
});

test('a node\'s fields carry its values, defaults, step and precision, and whether its conditions hold', () => {
  const f = Object.fromEntries(fieldsOf({ id: 'l', type: 'PointLight', props: { intensity: 3 } }).map((x) => [x.key, x]));
  assert.equal(f.intensity.value, 3);
  assert.equal(f.intensity.set, true);
  assert.equal(f.intensity.step, 0.05);
  assert.equal(f.intensity.precision, 2);
  assert.equal(f.range.default, 10);
  assert.equal(f.shadowPreset.visible, false, 'a point light casts no shadow by default: its shadow settings are hidden');
  const on = Object.fromEntries(fieldsOf({ id: 'l', type: 'PointLight', props: { castShadow: true, shadowPreset: 'high' } }).map((x) => [x.key, x]));
  assert.equal(on.shadowPreset.visible, true);
  const hidden = Object.fromEntries(fieldsOf({ id: 'l', type: 'PointLight', props: { shadowPreset: 'high' } }).map((x) => [x.key, x]));
  assert.equal(hidden.shadowPreset.visible, false);
  assert.equal(hidden.shadowPreset.value, 'high', 'a hidden prop keeps its value');
  const c = Object.fromEntries(fieldsOf({ id: 'c', type: 'Collider', props: { shape: 'sphere' } }).map((x) => [x.key, x]));
  assert.deepEqual([c.size.visible, c.radius.visible, c.height.visible], [false, true, false]);
});

test('several nodes: the props they share, mixed where they differ (AB-T-0601)', () => {
  const a = fieldsOf({ id: 'a', type: 'PointLight', props: { intensity: 2 } });
  const b = fieldsOf({ id: 'b', type: 'PointLight', props: { intensity: 5, color: '#ffffff' } });
  const f = Object.fromEntries(sharedFields([a, b]).map((x) => [x.key, x]));
  assert.equal(f.intensity.mixed, true);
  assert.equal(f.intensity.value, undefined);
  assert.equal(f.color.mixed, false, 'set to its default on one, unset on the other: the same colour');
  assert.equal(f.range.mixed, false);
  const spot = fieldsOf({ id: 's', type: 'SpotLight', props: { intensity: 2 } });
  const mixedTypes = sharedFields([a, spot]).map((x) => x.key);
  assert.ok(mixedTypes.includes('intensity') && mixedTypes.includes('range'));
  assert.ok(!mixedTypes.includes('angle'), 'only a spot light has an angle');
  const pi = Object.fromEntries(sharedFields([a, spot]).map((x) => [x.key, x]));
  assert.equal(pi.intensity.mixed, false, 'both 2');
  assert.equal(pi.intensity.default, undefined, 'their defaults differ (1 and 10)');
  const env = fieldsOf({ id: 'e', type: 'Environment' });
  assert.deepEqual(sharedFields([a, env]).map((x) => x.key), [], 'nothing shared');
  const d = Object.fromEntries(sharedFields([fieldsOf({ id: 'p', type: 'PointLight', props: { castShadow: true } }), a]).map((x) => [x.key, x]));
  assert.equal(d.shadowPreset.visible, true, 'shown when it applies to any of them');
  assert.deepEqual(sharedAxes([[0, 1, 2], [0, 3, 2]]), [0, null, 2]);
});

test('several nodes\' vector props: each axis its common value, null where they differ', () => {
  const a = fieldsOf({ id: 'a', type: 'Collider', props: { size: [1, 2, 3] } });
  const b = fieldsOf({ id: 'b', type: 'Collider', props: { size: [4, 2, 3] } });
  const size = sharedFields([a, b]).find((f) => f.key === 'size');
  assert.equal(size.mixed, true);
  assert.deepEqual(size.axes, [null, 2, 3]);
  const c = fieldsOf({ id: 'c', type: 'Collider' });
  assert.deepEqual(sharedFields([a, c]).find((f) => f.key === 'size').axes, [null, null, null], 'one unset: every axis differs');
});
