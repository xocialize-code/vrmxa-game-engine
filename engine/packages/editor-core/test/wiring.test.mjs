// M6 W1 (AB-T-0638): behaviours, connections, a node's id and its place, each one undo step, on the Morning Rush's level
// with the game's own behaviours declared (their static describe, M6 W0). Every edit undoes to the same bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { declareProjectBehaviours } from '@vrmxg/registry';
import { parse } from '@vrmxg/scene';
import { EditorSession } from '../src/index.js';

const SAMPLE = path.join(import.meta.dirname, '../../../../content/sample');
const LEVEL = fs.readFileSync(path.join(SAMPLE, 'game/level.vrmxs'), 'utf8');
const game = await import(path.join(SAMPLE, 'game/behaviours.js'));
const prefabs = new Map(['prefabs/door.vrmxs', 'prefabs/double-door.vrmxs'].map((r) => [r, parse(fs.readFileSync(path.join(SAMPLE, r), 'utf8'))]));
const registry = () => { const reg = m0Registry(); declareProjectBehaviours(reg, game); return reg; };
const level = () => new EditorSession({ registry: registry(), text: LEVEL, prefabs: new Map(prefabs) });

/** Undo the last step and redo it: the text before, then after, byte for byte. */
function undoRedo(s, before) {
  const after = s.text();
  assert.ok(s.undo());
  assert.equal(s.text(), before, 'undo gives back the bytes');
  assert.ok(s.redo());
  assert.equal(s.text(), after, 'redo gives the edit back');
}

test('a node\'s id: every reference follows it in one undo step (parent, behaviour params, connections and their node args, speakers)', () => {
  const s = level();
  const before = s.text();
  s.select('mira');
  assert.equal(s.setNodeId('mira', 'player-1'), 'player-1');
  assert.equal(s.history().undo, 'Change id mira to player-1');
  assert.equal(s.node('mira'), null);
  assert.equal(s.node('player-1').name, 'Mira');
  assert.deepEqual(s.selection, ['player-1'], 'the selection follows');
  for (const t of ['table-1', 'table-2', 'table-3']) assert.equal(s.node(t).behaviours[0].player, 'player-1', `${t}'s tableZone player`);
  assert.deepEqual(s.doc.connections[0].args, { target: 'player-1' }, 'lookAt\'s node argument');
  assert.ok(s.validate().ok, s.validate().errors.join('; '));
  undoRedo(s, before);

  s.setNodeId('hana-1', 'hana');
  const lines = s.node('briefing').props.lines;
  assert.ok(lines.every((l) => l.speaker === 'hana'), 'a Dialogue line\'s speaker is a node reference');
  assert.ok(s.doc.connections.filter((c) => c.call === 'say').every((c) => c.to === 'hana'));
  assert.ok(s.validate().ok);

  // a parent: its children name the new id; connections from it and to it follow
  s.setNodeId('rules', 'game');
  assert.ok(s.doc.nodes.filter((n) => ['score', 'served', 'clock', 'brew-1'].includes(n.id)).every((n) => n.parent === 'game'));
  assert.equal(s.doc.connections.filter((c) => c.from === 'game' || c.to === 'game').length, 4);
  assert.ok(s.validate().ok);
  s.undo(); s.undo(); s.undo();
  assert.equal(s.text(), before);
});

test('a node\'s id: refused when taken, not an id, or a prefab\'s node; nothing changes', () => {
  const s = level();
  const before = s.text();
  assert.throws(() => s.setNodeId('mira', 'hana-1'), /already a node called hana-1/);
  assert.throws(() => s.setNodeId('mira', 'a b'), /can't be an id/);
  assert.throws(() => s.setNodeId('mira', 'x/y'), /can't be an id/);
  assert.equal(s.setNodeId('mira', 'mira'), 'mira');
  s.addFromAsset('prefabs/door.vrmxs', { id: 'door-9' });
  assert.throws(() => s.setNodeId('door-9/hinge', 'h'), /its id is the prefab's/);
  s.undo();
  assert.equal(s.text(), before);
});

test('a node\'s id: a connection into an instance ("door-9/hinge") and a sequence\'s targets follow the instance', () => {
  const s = level();
  s.addFromAsset('prefabs/door.vrmxs', { id: 'door-9' });
  s.connect({ from: 'serve', signal: 'completed', to: 'door-9/hinge', call: 'open' });
  s.doc.sequence = { fps: 24, duration: 48, shots: [{ id: 's1', start: 0, end: 48, camera: 'cam' }], markers: [], tracks: [{ id: 't', type: 'animation', target: 'door-9', clips: [] }] };
  s.setNodeId('door-9', 'front');
  assert.equal(s.doc.connections.at(-1).to, 'front/hinge');
  assert.equal(s.doc.sequence.tracks[0].target, 'front');
  s.setNodeId('cam', 'camera');
  assert.equal(s.doc.sequence.shots[0].camera, 'camera');
});

test('behaviours: the registry\'s and the project\'s own are added (with their defaults), edited and removed, each one undo step', () => {
  const s = level();
  const before = s.text();
  assert.ok(!s.addableBehaviours('table-1').includes('tableZone'), 'it has one already');
  assert.ok(s.addableBehaviours('look-at').every((b) => b !== 'tableZone'), 'tableZone attaches to an Area only');
  assert.ok(s.addableBehaviours('hana-1').includes('brain'));

  s.addBehaviour('hana-1', 'greet');
  assert.equal(s.history().undo, 'Add greet to hana-1');
  assert.deepEqual(s.node('hana-1').behaviours, [{ use: 'greet' }]);
  undoRedo(s, before);
  s.setBehaviourParam('hana-1', 'greet', 'radius', 3);
  assert.equal(s.history().undo, 'Set hana-1.greet.radius');
  s.setBehaviourParam('hana-1', 'greet', 'target', 'mira');
  assert.deepEqual(s.node('hana-1').behaviours, [{ use: 'greet', radius: 3, target: 'mira' }]);
  assert.throws(() => s.setBehaviourParam('hana-1', 'greet', 'target', 'nobody'), /must name a node/);
  assert.throws(() => s.setBehaviourParam('hana-1', 'greet', 'radius', -1), /must be >= 0/);
  s.setBehaviourParam('hana-1', 'greet', 'radius', undefined);
  assert.equal(s.node('hana-1').behaviours[0].radius, undefined, 'cleared back to its default');
  assert.throws(() => s.addBehaviour('hana-1', 'greet'), /has greet already/);
  assert.throws(() => s.addBehaviour('hana-1', 'tableZone'), /attaches to Area/);
  assert.throws(() => s.addBehaviour('hana-1', 'nonesuch'), /no behaviour/);
  s.removeBehaviour('hana-1', 'greet');
  assert.equal(s.node('hana-1').behaviours, undefined, 'its last behaviour gone: no empty list left in the file');
  while (s.history().undo) s.undo();
  assert.equal(s.text(), before);

  // the project's own: its params by its describe
  s.addBehaviour('look-at', 'pressToStart');
  s.setBehaviourParam('look-at', 'pressToStart', 'to', 'game/level.vrmxs');
  assert.throws(() => s.setBehaviourParam('look-at', 'pressToStart', 'to', 'level.json'), /pattern/);
  assert.ok(s.validate().ok, s.validate().errors.join('; '));
});

test('removing a behaviour takes the connections that need it in the same step; undo brings both back', () => {
  const s = level();
  s.connect({ from: 'table-1', signal: 'served', to: 'score', call: 'add', args: { by: 5 } });
  s.connect({ from: 'table-1', signal: 'bodyEntered', to: 'hana-1', call: 'lookAt', args: { target: 'mira' } });
  const before = s.text();
  assert.equal(s.removeBehaviour('table-1', 'tableZone'), 1, 'served is tableZone\'s; bodyEntered is the Area\'s own');
  assert.ok(!s.doc.connections.some((c) => c.signal === 'served'));
  assert.ok(s.doc.connections.some((c) => c.signal === 'bodyEntered'));
  assert.ok(s.validate().ok);
  undoRedo(s, before);
});

test('connections: made from the four parts, edited part by part, arguments by the action\'s schema, removed; each one undo step', () => {
  const s = level();
  const before = s.text();
  const i = s.connect({ from: 'table-1', signal: 'served', to: 'hana-1', call: 'say', args: {} });
  assert.equal(s.history().undo, 'Connect table-1.served to hana-1.say');
  assert.deepEqual(s.doc.connections[i], { from: 'table-1', signal: 'served', to: 'hana-1', call: 'say' }, 'no empty arguments in the file');
  undoRedo(s, before);
  s.setConnectionArg(i, 'text', 'Thanks!');
  assert.deepEqual(s.doc.connections[i].args, { text: 'Thanks!' });
  s.setConnection(i, { call: 'lookAt' });
  assert.equal(s.doc.connections[i].args, undefined, 'say\'s text isn\'t an argument lookAt takes');
  s.setConnectionArg(i, 'target', 'mira');
  s.setConnection(i, { to: 'aoi' });
  assert.deepEqual(s.doc.connections[i], { from: 'table-1', signal: 'served', to: 'aoi', call: 'lookAt', args: { target: 'mira' } });
  assert.throws(() => s.setConnection(i, { signal: 'nonesuch' }), /has no signal nonesuch/);
  assert.throws(() => s.setConnection(i, { to: 'score' }), /has no action lookAt/);
  assert.throws(() => s.setConnectionArg(i, 'target', 'nobody'), /must name a node/);
  assert.throws(() => s.connect({ from: 'brew-1', signal: 'timeout', to: 'score', call: 'add', args: { by: 'five' } }), /must be number/);
  // an argument the action doesn't declare is kept, as @vrmxg/scene keeps it (a valid file's connection stays editable)
  const j = s.connect({ from: 'brew-1', signal: 'timeout', to: 'score', call: 'add', args: { by: 1, much: 5 } });
  s.setConnection(j, { signal: 'started' });
  assert.deepEqual(s.doc.connections[j].args, { by: 1, much: 5 });
  s.undo(); s.undo();
  s.disconnect(i);
  assert.equal(s.history().undo, 'Disconnect table-1.served from aoi.lookAt');
  while (s.history().undo) s.undo();
  assert.equal(s.text(), before);
});

test('a node\'s place in the document: moved before another, one undo step', () => {
  const s = level();
  const before = s.text();
  s.moveBefore('till', 'stool-1');
  assert.equal(s.history().undo, 'Move till before stool-1');
  const ids = s.doc.nodes.map((n) => n.id);
  assert.equal(ids.indexOf('till') + 1, ids.indexOf('stool-1'));
  assert.equal(s.node('till').parent, 'root', 'its parent stays');
  undoRedo(s, before);
  s.undo();
  s.moveBefore('till', null);
  assert.equal(s.doc.nodes.at(-1).id, 'till');
  s.undo();
  s.moveBefore('tray-1', 'tray-2');
  assert.equal(s.text(), before, 'already there: no step');
});

test('the project\'s behaviours declared after the session opened: the session\'s checks know them (AB-T-0638)', () => {
  const reg = m0Registry();
  const s = new EditorSession({ registry: reg, text: LEVEL, prefabs: new Map(prefabs) });
  s.setBehaviourParam('table-1', 'tableZone', 'points', -5); // unknown to the registry yet: kept unchecked, as a file keeps it
  s.undo();
  declareProjectBehaviours(reg, game);
  assert.throws(() => s.setBehaviourParam('table-1', 'tableZone', 'points', -5), />= 0/, 'its describe is checked now');
  s.setBehaviourParam('table-1', 'tableZone', 'points', 5);
  assert.equal(s.node('table-1').behaviours[0].points, 5);
});

test('AB-T-0634: an agent removing a dragged node\'s parent mid-drag doesn\'t throw or lose the drag\'s edit', () => {
  const s = level();
  s.beginGesture();
  s.withGesture(() => s.setProp('brew-1', 'seconds', 7));
  s.withGesture(() => s.setProp('brew-1', 'seconds', 8));
  s.remove(['rules']); // an MCP agent's edit while the person drags: brew-1 goes with its parent
  assert.doesNotThrow(() => s.endGesture());
  assert.equal(s.node('brew-1'), null);
  s.undo(); // the removal
  assert.equal(s.node('brew-1').props.seconds, 8, 'the drag\'s value comes back with it');
  s.undo(); s.undo();
  assert.equal(s.node('brew-1').props.seconds, 6);
  s.redo(); s.redo();
  assert.equal(s.node('brew-1').props.seconds, 8);
});

test('paste remaps a behaviour\'s node params (flat in its entry) and a connection into a nested instance (AB-T-0635 item 3)', () => {
  const s = level();
  s.addFromAsset('prefabs/double-door.vrmxs', { id: 'dd' });
  s.connect({ from: 'table-1', signal: 'served', to: 'dd/left/hinge', call: 'open' });
  const clip = s.copy(['table-1', 'dd']);
  const [t, d] = s.paste(clip);
  assert.equal(s.node(t).behaviours[0].customer, 'aoi', 'a node outside the clip: kept');
  const made = s.doc.connections.at(-1);
  assert.deepEqual([made.from, made.to], [t, `${d}/left/hinge`], 'the nested instance\'s inner node follows the copy');
  assert.ok(s.validate().ok, s.validate().errors.join('; '));
  // a behaviour param naming a node of the clip follows the copy
  const c2 = s.copy(['table-1', 'aoi']);
  const pasted = s.paste(c2).map((id) => s.node(id));
  const t2 = pasted.find((n) => n.type === 'Area'), a2 = pasted.find((n) => n.type === 'Character');
  assert.equal(t2.behaviours[0].customer, a2.id);
});

test('a node\'s id: an instance\'s override value that names it follows (references resolve across the scene, tree.find)', () => {
  const doc = parse(LEVEL);
  doc.assets.push({ id: 'door', type: 'vrmxs', ref: 'prefabs/door.vrmxs' });
  doc.nodes.push({ id: 'door-9', type: 'Instance', parent: 'root', asset: 'door', overrides: { hinge: { behaviours: [{ use: 'switchedBy', item: 'till' }] } } });
  const s = new EditorSession({ registry: registry(), doc, prefabs: new Map(prefabs) });
  const before = s.text();
  s.setNodeId('till', 'register');
  assert.deepEqual(s.node('door-9').overrides.hinge.behaviours, [{ use: 'switchedBy', item: 'register' }]);
  assert.equal(s.doc.connections.find((c) => c.signal === 'verb').from, 'register');
  s.undo();
  assert.equal(s.text(), before);
});

test('a drag on a behaviour param or a connection\'s argument is one undo step', () => {
  const s = level();
  s.beginGesture();
  for (const v of [11, 12, 13]) s.withGesture(() => s.setBehaviourParam('table-1', 'tableZone', 'points', v));
  assert.equal(s.endGesture(), 'Set table-1.tableZone.points');
  assert.equal(s.node('table-1').behaviours[0].points, 13);
  s.undo();
  assert.equal(s.node('table-1').behaviours[0].points, 10, 'one undo takes the whole drag back');
  const i = s.doc.connections.findIndex((c) => c.call === 'changeScene');
  s.beginGesture();
  for (const v of [4, 5]) s.withGesture(() => s.setConnectionArg(i, 'after', v));
  s.endGesture();
  assert.equal(s.doc.connections[i].args.after, 5);
  s.undo();
  assert.equal(s.doc.connections[i].args.after, 3);
});

// ---------------------------------------------------------------- the review of PR #60: what an id change can't rewrite
const allDocs = () => new Map(fs.readdirSync(SAMPLE, { recursive: true }).map(String).filter((f) => f.endsWith('.vrmxs')).map((f) => [f, parse(fs.readFileSync(path.join(SAMPLE, f), 'utf8'))]));

test('a node\'s id: refused, naming the files, when a sequence filming this scene names it', async () => {
  const { referencesElsewhere } = await import('../src/index.js');
  const docs = allDocs();
  const s = new EditorSession({ registry: registry(), text: fs.readFileSync(path.join(SAMPLE, 'cafe.vrmxs'), 'utf8'), prefabs: new Map(prefabs), path: 'cafe.vrmxs' });
  const before = s.text();
  s.elsewhere = referencesElsewhere(s.reg, 'cafe.vrmxs', docs);
  const uses = s.elsewhere('hana-1');
  assert.ok(uses.length >= 5, JSON.stringify(uses));
  assert.ok(uses.some((u) => u.file === 'sequences/cafe-morning.vrmxs' && /a sequence filming this scene/.test(u.what)));
  assert.throws(() => s.setNodeId('hana-1', 'hana'), /hana-1 is named in \d+ other files: .*sequences\/cafe-morning\.vrmxs.*change it there too, or keep this id/);
  assert.equal(s.text(), before, 'nothing changed');
  // a node no other file names: changed as before
  const free = s.doc.nodes.find((n) => s.elsewhere(n.id).length === 0 && n.id !== 'root');
  s.setNodeId(free.id, `${free.id}-x`);
  assert.equal(s.node(`${free.id}-x`)?.type, free.type);
});

test('a node\'s id in an open prefab: refused when a scene or prefab that places it names that node (overrides, connections)', async () => {
  const { referencesElsewhere } = await import('../src/index.js');
  const docs = allDocs();
  const s = new EditorSession({ registry: registry(), doc: structuredClone(docs.get('prefabs/door.vrmxs')), prefabs: new Map(prefabs), path: 'prefabs/door.vrmxs' });
  s.elsewhere = referencesElsewhere(s.reg, 'prefabs/door.vrmxs', docs);
  assert.throws(() => s.setNodeId('hinge', 'hinge-a'), /prefabs\/double-door\.vrmxs \(it places this scene as a prefab and names this node/);
  // a connection from another scene into an instance's node counts too
  const scene = { format: 'vrmxs', version: 1, id: 'x', assets: [{ id: 'door', type: 'vrmxs', ref: 'prefabs/door.vrmxs' }], nodes: [{ id: 'd', type: 'Instance', asset: 'door' }, { id: 'm', type: 'Marker' }], connections: [{ from: 'm', signal: 'ready', to: 'd/panel', call: 'hide' }] };
  const with2 = new Map([...docs, ['x.vrmxs', scene]]);
  assert.deepEqual(referencesElsewhere(s.reg, 'prefabs/door.vrmxs', with2)('panel').map((u) => u.file), ['x.vrmxs']);
  assert.deepEqual(referencesElsewhere(s.reg, 'prefabs/door.vrmxs', docs)('panel'), [], 'nobody names the panel');
});

test('a game node\'s key: kept as the old id when a condition names it, so the game can still be won', () => {
  const s = level();
  const before = s.text();
  s.setNodeId('served', 'served-count');
  assert.equal(s.history().undo, 'Change id served to served-count (its key stays served)');
  assert.equal(s.node('served-count').props.key, 'served', 'the serve goal and the checkpoint name counters.served');
  assert.equal(s.node('serve').props.when.of[0].key, 'counters.served', 'the condition is as it was');
  s.undo();
  assert.equal(s.text(), before);
  // one nothing names: its key follows its id (no key written)
  s.addNode('GameCounter', { id: 'tips', parent: 'rules' });
  s.setNodeId('tips', 'tip-jar');
  assert.equal(s.node('tip-jar').props?.key, undefined);
  assert.equal(s.history().undo, 'Change id tips to tip-jar');
  // a GameRules' reads count as naming it
  s.setProp('rules', 'reads', { counters: ['tip-jar'] });
  s.setNodeId('tip-jar', 'jar');
  assert.equal(s.node('jar').props.key, 'tip-jar');
});

test('a connection moved to a target without its action: refused alone, made with the new action in one step (the panel holds the target)', () => {
  const s = level();
  const i = s.doc.connections.findIndex((c) => c.call === 'lookAt');
  assert.throws(() => s.setConnection(i, { to: 'root' }), /root has no action lookAt: pick its action with the new target/);
  s.setConnection(i, { to: 'look-at', call: 'hide' });
  assert.deepEqual(s.doc.connections[i], { from: 'rules', signal: 'ready', to: 'look-at', call: 'hide' }, 'lookAt\'s target argument isn\'t one hide takes');
  assert.equal(s.history().undo, 'Set rules.ready connection\'s to, call');
});

test('removing a behaviour from a node of a type the registry doesn\'t know keeps its type\'s connections', () => {
  const doc = parse(LEVEL);
  doc.nodes.push({ id: 'gadget', type: 'Gizmo', parent: 'root', behaviours: [{ use: 'greet' }] });
  doc.connections.push({ from: 'gadget', signal: 'buzz', to: 'score', call: 'add' });
  const s = new EditorSession({ registry: registry(), doc, prefabs: new Map(prefabs) });
  const before = s.text();
  // the scene editor refuses edits to a node of an unknown type: the step fails whole, its connections untouched
  assert.throws(() => s.removeBehaviour('gadget', 'greet'), /unknown node type "Gizmo"/);
  assert.equal(s.text(), before);
  // and what removeBehaviour would drop is only what the behaviour gave: buzz isn't greet's
  const n = s.node('gadget'), had = s.reg.surface(n), after = s.reg.surface({ ...n, behaviours: [] });
  assert.ok(!had.signals.buzz && !after.signals.buzz, 'the registry can\'t list buzz, so it isn\'t counted as lost');
});
