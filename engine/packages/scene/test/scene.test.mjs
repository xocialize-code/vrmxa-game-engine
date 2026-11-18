import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { m0Registry } from '@vrmxg/registry/m0';
import { createValidator, parse, serialize } from '../src/doc.js';
import { flatten } from '../src/instance.js';
import { createEditor } from '../src/edit.js';
import { describeType, documentSchema } from '../src/schema.js';
import { changedLines } from '../src/linediff.js';

const reg = m0Registry();
const { check } = createValidator(reg);
const read = (p) => parse(fs.readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8'));
const prefabs = new Map(['prefabs/door.vrmxs', 'prefabs/double-door.vrmxs'].map((p) => [p, read(p)]));
const diffLines = (a, b) => changedLines(a, b).total;

test('examples validate with no errors or warnings, and are in canonical form', () => {
  for (const p of ['cafe.vrmxs', 'prefabs/door.vrmxs', 'prefabs/double-door.vrmxs']) {
    const r = check(read(p), { prefabs });
    assert.deepEqual([r.errors, r.warnings], [[], []], p);
    assert.equal(serialize(read(p)), fs.readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8'), `${p} canonical`);
  }
});

test('schema catches typed errors with useful messages', () => {
  const d = read('cafe.vrmxs');
  d.nodes.find((n) => n.id === 'cam').props.focalLength = 2;          // below minimum 4
  d.nodes.find((n) => n.id === 'cam').props.preset = 'spinny';        // not in enum
  d.nodes.find((n) => n.id === 'hana-1').behaviours[0].radius = -1;   // behaviour param minimum
  d.nodes.find((n) => n.id === 'set').asset = 'hana';                  // wrong asset type for Model
  const r = check(d, { prefabs });
  assert.ok(r.errors.some((e) => /focalLength must be >= 4/.test(e)), r.errors.join('\n'));
  assert.ok(r.errors.some((e) => /preset must be equal to one of the allowed values \(free, fixed, orbit/.test(e)));
  assert.ok(r.errors.some((e) => /radius must be >= 0/.test(e)));
  assert.ok(r.errors.some((e) => /asset "hana" is vrmxa; Model needs glb/.test(e)));
});

test('lint catches references the schema cannot: parents, cycles, signals, actions, override targets', () => {
  const d = read('cafe.vrmxs');
  d.nodes.push({ id: 'a', type: 'Node3D', parent: 'b' }, { id: 'b', type: 'Node3D', parent: 'a' });
  d.nodes.push({ id: 'orphan', type: 'Marker', parent: 'nowhere' });
  d.connections.push({ from: 'cam', signal: 'opened', to: 'hana-1', call: 'dance' });
  d.nodes.find((n) => n.id === 'door-1').overrides.hnige = { props: { mass: 1 } };
  d.nodes.find((n) => n.id === 'cam').props.target = 'ghost';
  const r = check(d, { prefabs });
  for (const re of [/parent cycle/, /parent "nowhere" is not a node/, /Camera "cam" has no signal "opened"/, /Character "hana-1" has no action "dance" \(has: .*say/, /override targets "hnige"/, /prop "target" refers to missing node "ghost"/]) assert.ok(r.errors.some((e) => re.test(e)), `${re}\n${r.errors.join('\n')}`);
});

test('unknown types, props and behaviours survive a round-trip, reported as warnings', () => {
  const d = read('cafe.vrmxs');
  d.nodes.push({ id: 'fx', type: 'SparkleEmitter', parent: 'root', props: { rate: 30 }, futureKey: { x: 1 } });
  d.nodes.find((n) => n.id === 'cam').props.lensFlare = true;
  d.nodes.find((n) => n.id === 'hana-1').behaviours.push({ use: 'gossip', topic: 'weather' });
  const r = check(d, { prefabs });
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 3, r.warnings.join('\n'));
  const again = parse(serialize(d));
  assert.deepEqual(again.nodes.find((n) => n.id === 'fx'), { id: 'fx', type: 'SparkleEmitter', parent: 'root', props: { rate: 30 }, futureKey: { x: 1 } });
  assert.equal(again.nodes.find((n) => n.id === 'cam').props.lensFlare, true);
});

test('flatten: nested prefabs get path ids, overrides apply by inner id, behaviours merge by use', () => {
  const f = flatten(read('cafe.vrmxs'), prefabs);
  const get = (id) => f.nodes.find((n) => n.id === id);
  assert.equal(get('door-1/hinge').behaviours[0].locked, true);
  assert.equal(get('door-1/hinge').behaviours[0].openAngle, 100, 'merged, not replaced');
  assert.equal(get('entrance/left/hinge').props.mass, 20);
  assert.equal(get('entrance/right/hinge').behaviours[0].openAngle, -100);
  assert.equal(get('entrance/right/hinge').props.mass, 12);
  assert.equal(get('door-1/door').parent, 'door-1');
  assert.ok(f.connections.some((c) => c.from === 'entrance/right/trigger' && c.to === 'entrance/right/hinge' && c.call === 'open'));
  assert.equal(new Set(f.nodes.map((n) => n.id)).size, f.nodes.length, 'ids unique');
});

test('edits: typed checks, inverse ops, undo/redo restore the exact text, one-line diffs', () => {
  const d = read('cafe.vrmxs');
  const original = serialize(d);
  const ed = createEditor(reg, d);
  assert.throws(() => ed.apply({ op: 'set', id: 'cam', path: 'props.fStop', value: 0.1 }), /fStop must be >= 0.7/);
  assert.throws(() => ed.apply({ op: 'set', id: 'cam', path: 'props.target', value: 'ghost' }), /must name an existing node/);
  assert.throws(() => ed.apply({ op: 'add', node: { id: 'x', type: 'Camera', props: { sensor: 'imax' } } }), /sensor must be equal to one of/);
  assert.throws(() => ed.apply({ op: 'reparent', id: 'root', parent: 'set' }), /own descendant/);
  assert.throws(() => ed.apply({ op: 'connect', from: 'set', signal: 'opened', to: 'hana-1', call: 'say' }), /Model "set" has no signal "opened" \(has: ready\)/);

  ed.apply({ op: 'set', id: 'cam', path: 'props.focalLength', value: 85 });
  assert.equal(diffLines(original, serialize(d)), 2, 'one prop edit = one line out, one line in');
  const beforeAdd = serialize(d);
  ed.apply({ op: 'add', node: { id: 'key', type: 'PointLight', parent: 'root', props: { intensity: 40 } }, index: 3 });
  assert.equal(diffLines(beforeAdd, serialize(d)), 1, 'adding a node mid-list = one added line');
  ed.apply({ op: 'connect', from: 'door-1', signal: 'ready', to: 'cam', call: 'makeCurrent' });
  ed.apply({ op: 'reparent', id: 'spawn', parent: 'set' });
  ed.apply({ op: 'remove', id: 'root' }); // the whole tree, and every connection touching it
  assert.equal(d.nodes.length, 0);
  assert.equal(d.connections.length, 0);
  while (ed.undo());
  assert.equal(serialize(d), original, 'undo all restores the exact bytes');
  while (ed.redo());
  assert.equal(d.nodes.length, 0);
  while (ed.undo());
  assert.equal(serialize(d), original);
});

test('connections reach inside prefab instances by path, in edits and in lint', () => {
  const d = read('cafe.vrmxs');
  const ed = createEditor(reg, d, { prefabs: () => prefabs });
  assert.throws(() => ed.apply({ op: 'connect', from: 'hana-1', signal: 'arrived', to: 'door-1', call: 'open' }), /Instance "door-1" has no action "open"/);
  ed.apply({ op: 'connect', from: 'hana-1', signal: 'arrived', to: 'door-1/hinge', call: 'open' });
  ed.apply({ op: 'connect', from: 'entrance/left/trigger', signal: 'bodyEntered', to: 'hana-1', call: 'lookAt' });
  assert.deepEqual(check(d, { prefabs }).errors, []);
  d.connections.push({ from: 'hana-1', signal: 'arrived', to: 'door-1/hnige', call: 'open' });
  assert.ok(check(d, { prefabs }).errors.some((e) => /to "door-1\/hnige" is not a node/.test(e)));
});

test('describe gives an agent everything for a type: schema, units, signals, actions, behaviours', () => {
  const t = describeType(reg, 'Character');
  assert.deepEqual(t.extends, ['Node3D']);
  assert.equal(t.propMeta.capsuleHeight.unit, 'm');
  assert.ok(t.actions.say.args.properties.text);
  assert.ok(t.signals.ready, 'inherited signal');
  assert.deepEqual(t.behaviours, ['wander',  'greet',  'switchedBy',  'player']);
  assert.ok(JSON.stringify(documentSchema(reg)).length > 1000);
});

test('a batch (an asset and the node using it) is one undo step, all or nothing; assets in use can\'t be removed', async () => {
  const { m0Registry } = await import('@vrmxg/registry/m0');
  const { createEditor, serialize } = await import('../src/index.js');
  const doc = { format: 'vrmxs', version: 1, id: 't', assets: [], nodes: [{ id: 'root', type: 'Node3D' }] };
  const before = serialize(doc);
  const ed = createEditor(m0Registry(), doc);
  ed.apply({ op: 'batch', label: 'Add cafe', ops: [{ op: 'addAsset', asset: { id: 'cafe', type: 'glb', ref: 'sets/cafe.glb' } }, { op: 'add', node: { id: 'set', type: 'Model', parent: 'root', asset: 'cafe' } }] });
  assert.equal(ed.peek().undo.label, 'Add cafe');
  assert.throws(() => ed.apply({ op: 'removeAsset', id: 'cafe' }), /used by set/);
  assert.throws(() => ed.apply({ op: 'batch', ops: [{ op: 'addAsset', asset: { id: 'x', type: 'glb', ref: 'x.glb' } }, { op: 'add', node: { id: 'set', type: 'Model', asset: 'x' } }] }), /already exists/);
  assert.equal(doc.assets.length, 1, 'the failed batch left nothing behind');
  ed.undo();
  assert.equal(serialize(doc), before);
  ed.redo();
  assert.deepEqual(doc.nodes.map((n) => n.id), ['root', 'set']);
});
