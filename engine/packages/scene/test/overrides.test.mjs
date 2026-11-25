// Prefab overrides as a diff, revert and apply (M5 W6, AB-T-0603): plain functions over the fixtures' door prefabs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { m0Registry } from '@vrmxg/registry/m0';
import { createValidator, parse, serialize, flatten, createEditor, overrideEntries, overrideFields, withOverride, withoutOverride, applyToPrefab, prefabNodes, prefabUsers, overridesText, fieldValue } from '../src/index.js';

const reg = m0Registry();
const { check } = createValidator(reg);
const text = (p) => fs.readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8');
const read = (p) => parse(text(p));
const fresh = () => new Map(['prefabs/door.vrmxs', 'prefabs/double-door.vrmxs'].map((p) => [p, read(p)]));
const node = (doc, id) => doc.nodes.find((n) => n.id === id);

test('an instance\'s overrides as a diff: field, prefab value, instance value, change', () => {
  const prefabs = fresh(), cafe = read('cafe.vrmxs');
  const door = overrideEntries(node(cafe, 'door-1'), prefabs.get('prefabs/door.vrmxs'), prefabs);
  assert.deepEqual(door.map((e) => [e.target, e.field, e.kind, e.change]), [['hinge', 'behaviours.hinge', 'behaviour', 'changed']]);
  assert.equal(door[0].base.locked, false); assert.equal(door[0].value.locked, true); assert.equal(door[0].value.openAngle, 100); // merged by use: other params kept
  const pair = overrideEntries(node(cafe, 'entrance'), prefabs.get('prefabs/double-door.vrmxs'), prefabs);
  assert.deepEqual(pair.map((e) => [e.target, e.field, e.base, e.value]), [['left/hinge', 'props.mass', 12, 20]]); // a nested prefab by path
  assert.deepEqual(overrideFields({ name: 'x', behaviours: [{ use: 'b', remove: true }], transform: { q: [0, 0, 0, 1], p: [1, 0, 0] }, props: { z: 1, a: 2 } }), ['props.a', 'props.z', 'transform.p', 'transform.q', 'behaviours.b', 'name']);
});

test('added, removed and stale overrides are told apart', () => {
  const prefabs = fresh(), d = read('cafe.vrmxs');
  node(d, 'door-1').overrides = { hinge: { behaviours: [{ use: 'hinge', remove: true }, { use: 'squeak', pitch: 2 }] }, panel: { name: 'Glass' }, gone: { props: { mass: 1 } } };
  const e = overrideEntries(node(d, 'door-1'), prefabs.get('prefabs/door.vrmxs'), prefabs);
  const by = Object.fromEntries(e.map((x) => [`${x.target} ${x.field}`, x]));
  assert.equal(by['hinge behaviours.hinge'].change, 'removed'); assert.equal(by['hinge behaviours.hinge'].value, undefined);
  assert.equal(by['hinge behaviours.squeak'].change, 'added'); assert.deepEqual(by['hinge behaviours.squeak'].value, { use: 'squeak', pitch: 2 });
  assert.equal(by['panel name'].change, 'added');
  assert.equal(by['gone props.mass'].missing, true);
  assert.match(overridesText(e, { instance: 'door-1', ref: 'prefabs/door.vrmxs' }), /^door-1 \(prefabs\/door\.vrmxs\): 4 overrides\ngone {2}props\.mass {2}added 1 {2}\(the prefab has no such node\)\nhinge {2}behaviours\.hinge {2}\{.*\} → removed/);
});

test('setting a field writes the least override; the prefab\'s own value drops it', () => {
  const prefabs = fresh(), base = prefabNodes(prefabs.get('prefabs/door.vrmxs'), prefabs);
  let o = withOverride(undefined, 'hinge', 'props.mass', 30, base.get('hinge'));
  assert.deepEqual(o, { hinge: { props: { mass: 30 } } });
  o = withOverride(o, 'panel', 'transform.p', [0.45, 1.5, 0], base.get('panel'));
  assert.deepEqual(o.panel, { transform: { p: [0.45, 1.5, 0] } });
  o = withOverride(o, 'hinge', 'behaviours.hinge', { use: 'hinge', locked: true, openAngle: 100 }, base.get('hinge'));
  assert.deepEqual(o.hinge.behaviours, [{ use: 'hinge', locked: true }]); // only what differs; merging keeps openAngle
  o = withOverride(o, 'hinge', 'props.mass', 12, base.get('hinge')); // back to the prefab's: no override of mass
  assert.deepEqual(o.hinge, { behaviours: [{ use: 'hinge', locked: true }] });
  o = withOverride(o, 'panel', 'transform.p', [0.45, 1, 0], base.get('panel'));
  o = withOverride(o, 'hinge', 'behaviours.hinge', { use: 'hinge', locked: false, openAngle: 100 }, base.get('hinge'));
  assert.equal(o, undefined); // nothing left
  assert.deepEqual(withOverride(undefined, 'frame', 'transform.p', [0, 0, 0], base.get('frame')), undefined); // the identity default is the prefab's value
  assert.deepEqual(withOverride(undefined, 'hinge', 'behaviours.hinge', undefined, base.get('hinge')), { hinge: { behaviours: [{ use: 'hinge', remove: true }] } });
  assert.throws(() => withOverride(undefined, 'hinge', 'behaviours.hinge', { use: 'other' }, base.get('hinge')), /use is "other"/);
});

test('revert: the scene\'s bytes match an instance never overridden, through the editor\'s undo', () => {
  const prefabs = fresh(), d = read('cafe.vrmxs');
  const before = serialize(d);
  const ed = createEditor(reg, d, { prefabs: () => prefabs });
  const base = prefabNodes(prefabs.get('prefabs/door.vrmxs'), prefabs);
  ed.apply({ op: 'set', id: 'door-1', path: 'overrides', value: withOverride(node(d, 'door-1').overrides, 'panel', 'props.size', [1, 2, 0.04], base.get('panel')) });
  assert.notEqual(serialize(d), before);
  ed.apply({ op: 'set', id: 'door-1', path: 'overrides', value: withoutOverride(node(d, 'door-1').overrides, 'panel', 'props.size') });
  assert.equal(serialize(d), before);
  // reverting the last override removes the key: the line is the one a fresh instance has
  ed.apply({ op: 'set', id: 'door-1', path: 'overrides', value: withoutOverride(node(d, 'door-1').overrides, 'hinge', 'behaviours.hinge') });
  const plain = read('cafe.vrmxs'); delete node(plain, 'door-1').overrides;
  assert.equal(serialize(d), serialize(plain));
  assert.deepEqual(check(d, { prefabs }).errors, []);
  ed.undo(); ed.undo(); ed.undo();
  assert.equal(serialize(d), before);
  assert.equal(withoutOverride(undefined, 'x'), undefined);
});

test('apply: the value goes into the prefab, every instance follows, the prefab stays valid', () => {
  const prefabs = fresh(), cafe = read('cafe.vrmxs');
  node(cafe, 'door-1').overrides.panel = { props: { size: [1, 2, 0.05] } };
  const [entry] = overrideEntries(node(cafe, 'door-1'), prefabs.get('prefabs/door.vrmxs'), prefabs).filter((e) => e.target === 'panel');
  const door = applyToPrefab(prefabs.get('prefabs/door.vrmxs'), entry.target, entry.field, entry.value, prefabs);
  assert.deepEqual(node(door, 'panel').props.size, [1, 2, 0.05]);
  assert.deepEqual(node(prefabs.get('prefabs/door.vrmxs'), 'panel').props.size, [0.9, 2, 0.04], 'the input is left alone');
  assert.deepEqual(check(door, { prefabs }).errors, []);
  assert.equal(serialize(door).split('\n').filter((l, i) => l !== text('prefabs/door.vrmxs').split('\n')[i]).length, 1, 'one line of the prefab changes');
  prefabs.set('prefabs/door.vrmxs', door);
  // the other instances (the double door's two, nested) now have it
  const flat = flatten(cafe, prefabs).nodes;
  for (const id of ['entrance/left/panel', 'entrance/right/panel']) assert.deepEqual(flat.find((n) => n.id === id).props.size, [1, 2, 0.05], id);
  // a behaviour: the merged behaviour replaces the prefab's
  const [h] = overrideEntries(node(cafe, 'door-1'), door, prefabs).filter((e) => e.field === 'behaviours.hinge');
  const door2 = applyToPrefab(door, h.target, h.field, h.value, prefabs);
  assert.deepEqual(node(door2, 'hinge').behaviours, [{ locked: true, openAngle: 100, use: 'hinge' }]);
  // a removed behaviour, a transform part back to identity
  assert.equal(node(applyToPrefab(door, 'hinge', 'behaviours.hinge', undefined, prefabs), 'hinge').behaviours, undefined);
  assert.equal(node(applyToPrefab(door, 'hinge', 'transform.p', [0, 0, 0], prefabs), 'hinge').transform, undefined);
  assert.throws(() => applyToPrefab(door, 'nope', 'props.mass', 1, prefabs), /has no node "nope"/);
});

test('apply through a nested path writes the outer prefab\'s own override of its inner instance', () => {
  const prefabs = fresh(), cafe = read('cafe.vrmxs');
  const [e] = overrideEntries(node(cafe, 'entrance'), prefabs.get('prefabs/double-door.vrmxs'), prefabs);
  const dd = applyToPrefab(prefabs.get('prefabs/double-door.vrmxs'), e.target, e.field, e.value, prefabs);
  assert.deepEqual(node(dd, 'left').overrides, { hinge: { props: { mass: 20 } } });
  assert.deepEqual(check(dd, { prefabs }).errors, []);
  // applying the prefab's own value back removes that override again
  const back = applyToPrefab(dd, 'left/hinge', 'props.mass', 12, prefabs);
  assert.equal(node(back, 'left').overrides, undefined);
  assert.throws(() => applyToPrefab(prefabs.get('prefabs/door.vrmxs'), 'hinge/x', 'name', 'n', prefabs), /isn't a prefab instance/);
});

test('prefab users: direct and nested instances by address', () => {
  const prefabs = fresh(), cafe = read('cafe.vrmxs');
  assert.deepEqual(prefabUsers(cafe, prefabs, 'prefabs/door.vrmxs'), ['door-1', 'entrance/left', 'entrance/right']);
  assert.deepEqual(prefabUsers(cafe, prefabs, 'prefabs/double-door.vrmxs'), ['entrance']);
  assert.deepEqual(fieldValue(node(prefabs.get('prefabs/door.vrmxs'), 'door'), 'transform.q'), [0, 0, 0, 1]);
});

test('an editor\'s own ops join the undo history beside the document\'s (one step across two files)', () => {
  const d = read('cafe.vrmxs');
  const other = { value: 1 };
  const ed = createEditor(reg, d, { ops: { outside({ value }) { const before = other.value; other.value = value; return { op: 'outside', value: before }; } } });
  ed.apply({ op: 'batch', label: 'both', ops: [{ op: 'outside', value: 2 }, { op: 'set', id: 'cam', path: 'name', value: 'Lens' }] });
  assert.equal(other.value, 2); assert.equal(node(d, 'cam').name, 'Lens');
  ed.undo();
  assert.equal(other.value, 1); assert.equal(node(d, 'cam').name, undefined);
  ed.redo(); assert.equal(other.value, 2);
  assert.throws(() => ed.apply({ op: 'toString' }), /unknown op/);
});
