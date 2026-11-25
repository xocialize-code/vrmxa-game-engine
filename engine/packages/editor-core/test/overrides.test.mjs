// Prefab overrides in the editing session (M5 W6, AB-T-0603): an instance's inner nodes in the tree and the selection,
// an edit as an override, Revert, Apply into the prefab, each one undo step, and the prefab saved with the scene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { parse, serialize, flatten } from '@vrmxg/scene';
import { EditorSession } from '../src/index.js';

const reg = m0Registry();
const SAMPLE = path.join(import.meta.dirname, '../../../../content/sample');
const read = (r) => fs.readFileSync(path.join(SAMPLE, r), 'utf8');
const loadPrefabs = () => new Map(['prefabs/door.vrmxs', 'prefabs/double-door.vrmxs'].map((r) => [r, parse(read(r))]));

/** A scene with three doors from the prefab and a double door (two more, nested). */
function doors() {
  const s = EditorSession.empty(reg, 'doors');
  s.prefabs = loadPrefabs();
  s.addFromAsset('prefabs/door.vrmxs', { at: [0, 0, 0] });
  s.addFromAsset('prefabs/door.vrmxs', { at: [2, 0, 0] });
  s.addFromAsset('prefabs/door.vrmxs', { at: [4, 0, 0] });
  s.addFromAsset('prefabs/double-door.vrmxs', { at: [0, 0, 4] });
  s.markSaved(s.text());
  return s;
}

test('the tree lists an instance\'s prefab nodes as inner children; they can be selected', () => {
  const s = doors();
  const items = s.tree({ inner: true })[0].children;
  const door = items.find((x) => x.node.id === 'door');
  assert.deepEqual(door.children.map((c) => c.node.id), ['door/door']);
  const flat = (it) => [it.node.id, ...it.children.flatMap(flat)];
  assert.deepEqual(flat(door), ['door', 'door/door', 'door/frame', 'door/hinge', 'door/panel', 'door/panel-model', 'door/trigger']);
  assert.ok(door.children[0].inner && !door.inner);
  const dd = items.find((x) => x.node.id === 'double-door');
  assert.ok(flat(dd).includes('double-door/right/hinge'), 'nested instances by path');
  assert.equal(s.tree()[0].children.find((x) => x.node.id === 'door').children.length, 0, 'without inner: as before');
  s.select('door/hinge');
  assert.deepEqual(s.selection, ['door/hinge']);
  assert.equal(s.innerNode('door/hinge').node.props.mass, 12);
  assert.equal(s.innerNode('double-door/right/hinge').node.behaviours[0].openAngle, -100, 'the outer prefab\'s own override applies');
  s.select('door/nope'); assert.deepEqual(s.selection, []);
});

test('an edit of an inner node is an override, marked; Revert gives the bytes of a door never overridden', () => {
  const s = doors();
  const clean = s.text();
  s.setOverride('door-2/panel', 'props.size', [1.2, 2, 0.04]);
  assert.deepEqual(s.node('door-2').overrides, { panel: { props: { size: [1.2, 2, 0.04] } } });
  assert.equal(s.history().undo, 'Override door-2/panel.size');
  assert.ok(s.innerNode('door-2/panel').overridden);
  assert.ok(s.tree({ inner: true })[0].children.find((x) => x.node.id === 'door-2').overridden);
  const o = s.overridesOf('door-2');
  assert.equal(o.ref, 'prefabs/door.vrmxs');
  assert.deepEqual(o.users, ['door', 'door-2', 'door-3', 'double-door/left', 'double-door/right']);
  assert.deepEqual(o.entries.map((e) => [e.target, e.field, e.base, e.value]), [['panel', 'props.size', [0.88, 2, 0.04], [1.2, 2, 0.04]]]);
  assert.throws(() => s.setOverride('door-2/hinge', 'props.mass', -3), /mass/); // the inner node's own schema
  s.revertOverride('door-2', 'panel', 'props.size');
  assert.equal(s.text(), clean, 'the same bytes as before the override');
  assert.equal(s.history().undo, 'Revert door-2/panel.size');
  s.undo(); assert.deepEqual(s.node('door-2').overrides.panel.props.size, [1.2, 2, 0.04]);
  s.undo(); assert.equal(s.text(), clean);
  // editing back to the prefab's value leaves no override either
  s.setOverride('door-2/hinge', 'props.mass', 40); s.setOverride('door-2/hinge', 'props.mass', 12);
  assert.equal(s.text(), clean);
  // a transform part, a name, a behaviour
  s.setOverride('door-3/panel', 'transform.p', [0.45, 1.1, 0]);
  s.setOverride('door-3/hinge', 'behaviours.hinge', { use: 'hinge', locked: true, openAngle: 100 });
  s.setOverride('door-3/door', 'name', 'Back door');
  assert.deepEqual(s.node('door-3').overrides, { door: { name: 'Back door' }, hinge: { behaviours: [{ use: 'hinge', locked: true }] }, panel: { transform: { p: [0.45, 1.1, 0] } } });
  s.revertOverride('door-3');
  assert.equal(s.text(), clean, 'Revert All');
  assert.equal(s.history().undo, 'Revert all of door-3');
});

test('Apply writes the prefab; every other instance follows; one undo step puts both back; Save writes the prefab', () => {
  const s = doors();
  const clean = s.text(), prefabText = serialize(s.prefabs.get('prefabs/door.vrmxs'));
  s.setOverride('door/panel', 'props.size', [1, 2, 0.06]);
  s.setOverride('door/hinge', 'props.mass', 15);
  assert.ok(!s.dirtyPrefabs().length);
  const r = s.applyOverride('door', 'panel', 'props.size');
  assert.deepEqual(r, { ref: 'prefabs/door.vrmxs', fields: 1, followed: [] });
  assert.equal(s.history().undo, 'Apply door/panel.size to prefabs/door.vrmxs');
  assert.deepEqual(s.node('door').overrides, { hinge: { props: { mass: 15 } } }, 'the applied override is dropped, the other kept');
  assert.deepEqual(s.dirtyPrefabs(), ['prefabs/door.vrmxs']);
  assert.ok(s.dirty);
  const flat = flatten(s.doc, s.prefabs).nodes;
  for (const id of ['door/panel', 'door-2/panel', 'door-3/panel', 'double-door/left/panel', 'double-door/right/panel']) assert.deepEqual(flat.find((n) => n.id === id).props.size, [1, 2, 0.06], id);
  assert.equal(s.prefabVersion, 1);
  s.undo();
  assert.equal(serialize(s.prefabs.get('prefabs/door.vrmxs')), prefabText, 'undo restores the prefab');
  assert.deepEqual(s.node('door').overrides.panel, { props: { size: [1, 2, 0.06] } });
  assert.deepEqual(s.dirtyPrefabs(), []);
  s.redo();
  assert.deepEqual(s.dirtyPrefabs(), ['prefabs/door.vrmxs']);
  // Apply All: the rest; the instance is then a plain one and the scene has its clean bytes
  s.applyOverride('door');
  assert.equal(s.text(), clean);
  const door = parse(s.prefabText('prefabs/door.vrmxs'));
  assert.equal(door.nodes.find((n) => n.id === 'hinge').props.mass, 15);
  // saved: written by the app (saving.js), then marked
  s.markPrefabSaved('prefabs/door.vrmxs', s.prefabText('prefabs/door.vrmxs'));
  assert.deepEqual(s.dirtyPrefabs(), []);
  assert.ok(!s.dirty);
  s.undo(); s.undo();
  assert.equal(serialize(s.prefabs.get('prefabs/door.vrmxs')), prefabText);
  assert.deepEqual(s.dirtyPrefabs(), ['prefabs/door.vrmxs'], 'back to what was read: unsaved again, since the file now holds the applied one');
});

test('Apply through a nested instance writes the outer prefab\'s override; an invalid result is refused', () => {
  const s = doors();
  s.setOverride('double-door/left/hinge', 'props.mass', 25);
  assert.deepEqual(s.node('double-door').overrides, { 'left/hinge': { props: { mass: 25 } } });
  s.applyOverride('double-door');
  assert.deepEqual(s.prefabs.get('prefabs/double-door.vrmxs').nodes.find((n) => n.id === 'left').overrides, { hinge: { props: { mass: 25 } } });
  assert.deepEqual(s.prefabs.get('prefabs/door.vrmxs').nodes.find((n) => n.id === 'hinge').props.mass, 12, 'the inner prefab is untouched');
  assert.equal(s.node('double-door').overrides, undefined);
  assert.equal(s.validate().ok, true);
  // a stale override (the prefab lost the node) is listed, can be reverted, isn't applied
  s.run('Stale', [{ op: 'set', id: 'door', path: 'overrides', value: { gone: { props: { mass: 1 } } } }]);
  assert.equal(s.overridesOf('door').entries[0].missing, true);
  assert.deepEqual(s.applyOverride('door'), { ref: 'prefabs/door.vrmxs', fields: 0 });
  s.revertOverride('door', 'gone');
  assert.equal(s.node('door').overrides, undefined);
});

test('a drag of an inner node\'s field is one gesture step', () => {
  const s = doors();
  s.beginGesture();
  for (const v of [13, 14, 15]) s.withGesture(() => s.setOverride('door/hinge', 'props.mass', v));
  assert.equal(s.endGesture(), 'Override door/hinge.mass');
  assert.equal(s.history().undoDepth, 5); // four adds and the drag
  s.undo();
  assert.equal(s.node('door').overrides, undefined);
});

test('a file into a node\'s asset slot: one undo step; the wrong kind is refused; an unused entry goes', () => {
  const s = EditorSession.empty(reg, 'slots');
  const bench = s.addFromAsset('props/bench.glb');
  const before = s.text();
  s.setNodeAsset(bench, 'props/street-lamp.glb');
  assert.equal(s.history().undo, 'Set bench.asset');
  assert.deepEqual(s.doc.assets.map((a) => a.ref), ['props/street-lamp.glb'], 'the bench entry nothing uses went');
  assert.equal(s.node(bench).asset, 'street-lamp');
  assert.equal(s.validate().ok, true);
  assert.throws(() => s.setNodeAsset(bench, 'sounds/switch.wav'), /a Model takes glb, not audio/);
  assert.throws(() => s.setNodeAsset('root', 'props/bench.glb'), /a Node3D has no asset/);
  s.undo();
  assert.equal(s.text(), before);
  s.setNodeAsset(bench, 'props/bench.glb'); // the asset it has: no step
  assert.equal(s.text(), before);
});

test('an edit an override can\'t express (taking away a key or value the prefab has) is refused, not kept without the change', () => {
  const s = doors();
  const clean = s.text();
  // a behaviour param removed: merging by name would keep it
  assert.throws(() => s.setOverride('door/hinge', 'behaviours.hinge', { use: 'hinge', locked: true }), /can't take away what the prefab sets/);
  // a prop the prefab sets, cleared: the prefab's value would stay
  assert.throws(() => s.setOverride('door/hinge', 'props.mass', undefined), /clearing it/);
  // a name the prefab has, cleared
  assert.throws(() => s.setOverride('door/door', 'name', undefined), /can't take away/);
  assert.equal(s.text(), clean, 'nothing written');
  // a behaviour the prefab has, dropped: that one is said ({ remove: true })
  s.setOverride('door/hinge', 'behaviours.hinge', undefined);
  assert.deepEqual(s.node('door').overrides, { hinge: { behaviours: [{ use: 'hinge', remove: true }] } });
});

test('Apply: this scene\'s other instances that set the same value follow the prefab again, in the same undo step', () => {
  const s = doors();
  s.setOverride('door/hinge', 'props.mass', 20);
  s.setOverride('door-2/hinge', 'props.mass', 20); // the same value
  s.setOverride('door-3/hinge', 'props.mass', 30); // another value: kept
  s.setOverride('door-2/panel', 'name', 'Pane'); // another field: kept
  const r = s.applyOverride('door', 'hinge', 'props.mass');
  assert.deepEqual(r.followed, ['door-2']);
  assert.equal(s.node('door').overrides, undefined);
  assert.deepEqual(s.node('door-2').overrides, { panel: { name: 'Pane' } });
  assert.deepEqual(s.node('door-3').overrides, { hinge: { props: { mass: 30 } } });
  s.undo();
  assert.deepEqual(s.node('door-2').overrides, { hinge: { props: { mass: 20 } }, panel: { name: 'Pane' } }, 'one undo puts them back too');
});

test('placing a prefab: it must be loaded, and must not lead back to this scene; another prefab drops the overrides it can\'t resolve', () => {
  const s = EditorSession.empty(reg, 'place');
  assert.throws(() => s.addFromAsset('prefabs/door.vrmxs'), /isn't loaded/);
  s.prefabs = loadPrefabs();
  const d = s.addFromAsset('prefabs/door.vrmxs');
  s.setOverride(`${d}/hinge`, 'props.mass', 20);
  s.setOverride(`${d}/door`, 'name', 'Front');
  s.setNodeAsset(d, 'prefabs/double-door.vrmxs');
  assert.equal(s.node(d).overrides, undefined, 'hinge and door aren\'t nodes of the double door');
  s.undo();
  assert.deepEqual(s.node(d).overrides, { door: { name: 'Front' }, hinge: { props: { mass: 20 } } });
  // the double door's own file, open as a scene: an instance of itself would be a cycle
  const dd = new EditorSession({ registry: reg, text: read('prefabs/double-door.vrmxs'), prefabs: loadPrefabs(), path: 'prefabs/double-door.vrmxs' });
  assert.throws(() => dd.setNodeAsset('left', 'prefabs/double-door.vrmxs'), /is this scene itself/);
  assert.throws(() => dd.addFromAsset('prefabs/double-door.vrmxs'), /cycle/);
  const door = new EditorSession({ registry: reg, text: read('prefabs/door.vrmxs'), prefabs: loadPrefabs(), path: 'prefabs/door.vrmxs' });
  assert.throws(() => door.addFromAsset('prefabs/double-door.vrmxs'), /uses prefabs\/door\.vrmxs, this scene/);
});

test('an instance whose prefab isn\'t there lists its overrides as unresolved, and Revert clears them', () => {
  const s = doors();
  s.setOverride('door/hinge', 'props.mass', 20);
  s.prefabs.delete('prefabs/door.vrmxs'); // renamed or missing
  const o = s.overridesOf('door');
  assert.equal(o.loaded, false);
  assert.deepEqual(o.entries.map((e) => [e.target, e.field, e.missing, e.value]), [['hinge', 'props.mass', true, 20]]);
  s.revertOverride('door');
  assert.equal(s.node('door').overrides, undefined);
});
