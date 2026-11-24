// M1 W7 (AB-T-0519): the editor's model. Builds the sample cafe from its asset list as M1's check 1 does in the app,
// undoes and redoes every step, saves and reopens byte for byte, and plays in place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { parse } from '@vrmxg/scene';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { EditorSession, assetList } from '../src/index.js';

const reg = m0Registry();
const SAMPLE = path.join(import.meta.dirname, '../../../../content/sample');
const files = fs.readdirSync(SAMPLE, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(SAMPLE, f)).isFile()).sort();
const prefabs = new Map(['prefabs/door.vrmxs', 'prefabs/double-door.vrmxs'].map((r) => [r, parse(fs.readFileSync(path.join(SAMPLE, r), 'utf8'))]));

test('the asset list shows the project\'s placeable files with the node type each makes', () => {
  const list = assetList(reg, files);
  const by = Object.fromEntries(list.map((a) => [a.ref, a.nodeType]));
  assert.equal(by['sets/cafe.glb'], 'Model');
  assert.equal(by['characters/mira.vrmxa'], 'Character');
  assert.equal(by['items/sword-pickup.vrmxi'], 'Item');
  assert.equal(by['prefabs/door.vrmxs'], 'Instance');
  assert.ok(!list.some((a) => a.ref.endsWith('.vrma') || a.ref.endsWith('.json')), 'clips and data aren\'t placed');
});

test('building the cafe from the asset list: add, move, edit, reparent, delete; every step undoes and redoes; save, reopen byte for byte, valid', () => {
  const s = EditorSession.empty(reg, 'built-cafe');
  s.prefabs = prefabs;
  const empty = s.text();
  const seen = [];
  s.on((e) => seen.push(e.kind));
  const set = s.addFromAsset('sets/cafe.glb');
  const mira = s.addFromAsset('characters/mira.vrmxa', { at: [-0.5, 0, 4] });
  const hana = s.addFromAsset('characters/hana.vrmxa', { at: [-1.5, 0, -3] });
  const door = s.addFromAsset('items/cafe-door.vrmxi', { at: [6.1, 0, -3] });
  const door2 = s.addFromAsset('items/cafe-door.vrmxi', { at: [-0.5, 0, 6.1] });
  const sword = s.addFromAsset('items/sword-pickup.vrmxi', { at: [-3, 0.78, -1.95] });
  assert.deepEqual([set, mira, hana, door, door2, sword], ['cafe', 'mira', 'hana', 'cafe-door', 'cafe-door-2', 'sword-pickup']);
  assert.equal(s.doc.assets.filter((a) => a.ref === 'items/cafe-door.vrmxi').length, 1, 'a second door reuses the asset entry');
  assert.equal(s.primary, 'sword-pickup', 'a drop selects what it placed');
  s.setTransform(mira, { p: [-0.5, 0, 9.5], q: [0, 1, 0, 0] });
  assert.equal(s.history().undo, 'Transform mira');
  s.setProp(door, 'state', 'locked');
  s.rename(hana, 'Hana');
  const group = s.addNode('Node3D', { name: 'Doors' });
  s.reparent(door, group); s.reparent(door2, group);
  assert.equal(s.node(door).parent, group);
  s.addNode('DirectionalLight', { name: 'Sun', props: { intensity: 2.4 } });
  s.select([group]);
  s.remove();
  assert.equal(s.node(door), null, 'deleting a group deletes what is under it');
  assert.ok(!s.doc.assets.some((a) => a.ref === 'items/cafe-door.vrmxi'), 'and the asset entry nothing uses any more');
  s.undo();
  assert.ok(s.node(door) && s.doc.assets.some((a) => a.ref === 'items/cafe-door.vrmxi'), 'one undo brings the group, its doors and the asset back');
  const built = s.text();
  const steps = s.history().undoDepth;
  // every step undoes back to the empty scene and redoes back to the built one
  assert.equal(s.history().redo, 'Delete doors', 'the undone delete waits to be redone');
  while (s.undo());
  assert.equal(s.text(), empty);
  for (let i = 0; i < steps; i++) s.redo();
  assert.equal(s.text(), built);
  assert.equal(s.history().redo, 'Delete doors');
  assert.ok(s.validate().ok, s.validate().errors.join('; '));
  // save, reopen: the same bytes, still valid
  assert.ok(s.dirty);
  const text = s.text(); // a write that can fail: the text first, saved only once it is written
  assert.ok(s.dirty, 'taking the text marks nothing');
  s.markSaved(text, 'elsewhere.vrmxs');
  assert.ok(!s.dirty);
  assert.equal(s.path, 'elsewhere.vrmxs');
  s.rename(s.doc.nodes[0].id, 'renamed while it was being written');
  s.markSaved(text);
  assert.ok(s.dirty, 'saved as of the text that was written, not of what the document is now');
  s.undo();
  const saved = s.save('built-cafe.vrmxs');
  assert.ok(!s.dirty);
  const again = new EditorSession({ registry: reg, text: saved, prefabs });
  assert.equal(again.text(), saved, 'reopened, the file serialises to exactly what was saved');
  assert.ok(!again.dirty && again.validate().ok);
  assert.ok(seen.includes('edit') && seen.includes('undo') && seen.includes('redo') && seen.includes('save'));
});

test('the sample cafe opens and saves unchanged; a refused edit leaves nothing behind', () => {
  const text = fs.readFileSync(path.join(SAMPLE, 'cafe.vrmxs'), 'utf8');
  const s = new EditorSession({ registry: reg, text, prefabs });
  assert.equal(s.text(), text, 'the committed scene is already canonical');
  assert.throws(() => s.setProp('door-1', 'state', 42));
  assert.throws(() => s.reparent('root', 'set'), /own descendant/);
  assert.equal(s.text(), text);
  assert.equal(s.history().undoDepth, 0);
});

test('play in place: the play world is built from a copy, edits are refused while playing, Stop leaves the scene exactly as before', async () => {
  const s = EditorSession.empty(reg, 'play');
  const light = s.addNode('DirectionalLight', { name: 'Sun' });
  const box = s.addNode('RigidBody', { name: 'Crate', at: [0, 2, 0] });
  s.select([box]);
  const before = { text: s.text(), hash: s.hash() };
  // the edit view: a tree of the document, never stepped (what the viewport shows while editing)
  const edit = new SceneTree({ registry: reg, seed: 1 }); edit.instantiate(parse(s.text()));
  const editHash = hashValue(worldHashes(edit));
  let built = null;
  const world = await s.startPlay((doc) => {
    built = doc;
    const tree = new SceneTree({ registry: reg, seed: 1 });
    tree.instantiate(doc);
    return { tree };
  });
  assert.notEqual(built, s.doc, 'the play world gets a copy');
  assert.equal(s.mode, 'playing');
  world.tree.run(120);
  world.tree.find(box).object3d.position.y = -5; // the game moves things; the document doesn't
  built.nodes.push({ id: 'spawned', type: 'Node3D' });
  assert.throws(() => s.setProp(light, 'intensity', 3), /stop playing/);
  assert.throws(() => s.undo(), /stop playing/);
  let disposed = false;
  const r = s.stopPlay(() => { disposed = true; });
  assert.ok(disposed);
  assert.deepEqual(r, { restored: true, hash: before.hash, before: before.hash });
  assert.equal(s.text(), before.text, 'Stop: the scene byte for byte as before Play');
  assert.deepEqual(s.selection, [box], 'and the selection');
  assert.equal(hashValue(worldHashes(edit)), editHash, 'the edit view was never stepped');
  s.setProp(light, 'intensity', 3);
  assert.equal(s.node(light).props.intensity, 3, 'editing again after Stop');
});

test('selection: replace, add (the last is primary), unknown ids dropped, deleted nodes leave it, undo doesn\'t reselect', () => {
  const s = EditorSession.empty(reg, 'sel');
  const a = s.addNode('Node3D', { name: 'A' }), b = s.addNode('Node3D', { name: 'B' }), c = s.addNode('Marker', { name: 'C', parent: a });
  assert.deepEqual(s.selection, [c], 'adding selects what was added');
  s.select([a]); s.select([b], { add: true }); s.select(['nope'], { add: true });
  assert.deepEqual(s.selection, [a, b]); assert.equal(s.primary, b);
  s.select([a], { add: true });
  assert.deepEqual(s.selection, [b, a], 'adding an already selected node makes it primary');
  s.select([a, c]);
  s.remove();
  assert.deepEqual(s.selection, [], 'deleted with its child; the selection follows');
  assert.equal(s.history().undo, 'Delete a', 'a selected child of a selected node isn\'t deleted twice');
  s.undo();
  assert.ok(s.node(a) && s.node(c));
  assert.deepEqual(s.selection, []);
  s.select(null);
  assert.equal(s.primary, null);
});

test('regenerating a line (M3 W4): spoken, its clip and timings written, then one undo step that undo reverses', async () => {
  const doc = { format: 'vrmxs', version: 1, id: 'conversation', set: 'cafe.vrmxs', assets: [], nodes: [], connections: [],
    sequence: { fps: 24, duration: 480, shots: [], markers: [], tracks: [{ id: 'hana-1-says', type: 'dialogue', target: 'hana-1', clips: [{ start: 100, end: 160, text: 'Morning, Mira!', clip: 'voice/old.wav' }] }] } };
  const s = new EditorSession({ registry: reg, text: JSON.stringify(doc) });
  const written = {}, asked = [];
  const speak = async (o) => { asked.push(o); return { wav: new Uint8Array([82, 73, 70, 70]), words: [{ text: 'Good', start: 0.03, duration: 0.3 }, { text: 'morning!', start: 0.35, duration: 0.6 }], duration: 1.1 }; };
  const write = async (ref, bytes) => { written[ref] = bytes; };
  const before = s.history().undoDepth;
  const ref = await s.seq.regenerateLine('hana-1-says', 0, 'Good morning!', { speak, write, voice: 'af_heart' });
  assert.deepEqual(asked, [{ text: 'Good morning!', voice: 'af_heart' }]);
  assert.match(ref, /^voice\/conversation-hana-1-says-1-[0-9a-f]{8}\.wav$/);
  assert.deepEqual(Object.keys(written).sort(), [ref, ref.replace('.wav', '.timings.json')].sort());
  assert.deepEqual(JSON.parse(written[ref.replace('.wav', '.timings.json')]).words.length, 2);
  const c = s.doc.sequence.tracks[0].clips[0];
  assert.deepEqual([c.text, c.clip, c.end], ['Good morning!', ref, 100 + 27], 'text, clip and subtitle length (1.1 s at 24 fps)');
  assert.equal(c.voice, 'af_heart', 'the voice it was baked in is recorded (@vrmxg/cast reads it)');
  assert.equal(s.history().undoDepth - before, 1, 'one undo step');
  assert.equal(s.history().undo, 'Regenerate line "Good morning!"');
  s.undo();
  assert.deepEqual(s.doc.sequence.tracks[0].clips[0], { start: 100, end: 160, text: 'Morning, Mira!', clip: 'voice/old.wav' }, 'undo puts the old line back');
  await assert.rejects(s.seq.regenerateLine('hana-1-says', 3, 'x', { speak, write }), /no line 3/);
});

test('M4 W7: new words take a voiced line\'s whole bake with them: regenerateLine and a text edit; other edits keep it', async () => {
  const { BAKE_FIELDS } = await import('../src/sequence.js');
  const script = await import('@vrmxg/script');
  assert.deepEqual(BAKE_FIELDS, script.BAKE_FIELDS, 'the same fields as the script\'s');
  const text = fs.readFileSync(path.join(import.meta.dirname, '../../../../content/sample/sequences/cafe-order.vrmxs'), 'utf8');
  const s = new EditorSession({ registry: m0Registry(), text });
  const clipOf = () => s.doc.sequence.tracks.find((t) => t.id === 'mira-says').clips[1];
  const voiced = structuredClone(clipOf());
  assert.ok(voiced.words.length && voiced.visemes.length && voiced.audio && voiced.timings, 'the committed sample is voiced');
  const speak = async () => ({ wav: new Uint8Array(44), words: [{ text: 'Quiet', start: 0.2, duration: 0.3 }, { text: 'today', start: 0.5, duration: 0.4 }] });
  await s.seq.regenerateLine('mira-says', 1, 'Quiet today?', { speak, write: async () => {}, voice: 'af_bella' });
  const c = clipOf();
  for (const f of ['words', 'visemes', 'audio', 'timings']) assert.equal(c[f], undefined, `the old ${f} went`);
  assert.deepEqual([c.text, c.voice], ['Quiet today?', 'af_bella']);
  assert.notEqual(c.clip, voiced.clip);
  s.undo();
  assert.deepEqual(clipOf(), voiced, 'undo puts the voiced line back whole');
  s.seq.setClip('mira-says', 1, { start: voiced.start + 2 });
  assert.deepEqual(clipOf().visemes, voiced.visemes, 'moving the line keeps its voice');
  s.seq.setClip('mira-says', 1, { text: 'Quiet today, is it?' });
  for (const f of script.BAKE_FIELDS) assert.equal(clipOf()[f], undefined, `a text edit drops ${f}: the line speaks its new words until it is voiced again`);
  s.undo(); s.undo();
  assert.deepEqual(clipOf(), voiced);
});
