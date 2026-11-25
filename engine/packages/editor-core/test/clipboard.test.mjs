// M5 W5 (AB-T-0604, AB-T-0605): Duplicate, Copy and Paste of nodes, and a shape handle's resize, as session commands:
// fresh ids, references inside the copy kept inside it, a prefab instance's overrides kept, one undo step each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { parse, flatten } from '@vrmxg/scene';
import { EditorSession, freshId, isClip, copyNodes, CLIP_LIMIT } from '../src/index.js';

const reg = m0Registry();
const SAMPLE = path.join(import.meta.dirname, '../../../../content/sample');
const read = (f) => fs.readFileSync(path.join(SAMPLE, f), 'utf8');
const prefabs = new Map(['prefabs/door.vrmxs', 'prefabs/double-door.vrmxs'].map((r) => [r, parse(read(r))]));
const cafe = () => new EditorSession({ registry: reg, text: read('cafe.vrmxs'), prefabs, path: 'cafe.vrmxs' });

test('freshId takes the trailing number off and counts on from 2', () => {
  const taken = new Set(['stool-1', 'stool-2', 'cafe-door', 'hana-1']);
  assert.equal(freshId('stool-1', taken), 'stool-3');
  assert.equal(freshId('cafe-door', taken), 'cafe-door-2');
  assert.equal(freshId('hana-1', taken), 'hana-2');
});

test('Duplicate: a fresh id, in place after the original under its parent, connections kept, one undo step', () => {
  const s = cafe();
  const before = s.text(), depth = s.history().undoDepth;
  const [id] = s.duplicate(['entrance-left']);
  assert.equal(id, 'entrance-left-2');
  const copy = s.node(id), orig = s.node('entrance-left');
  assert.deepEqual({ ...copy, id: orig.id }, orig, 'the same node but for its id');
  assert.equal(s.doc.nodes.findIndex((n) => n.id === id), s.doc.nodes.findIndex((n) => n.id === 'entrance-left') + 1, 'right after the original');
  assert.deepEqual(s.selection, [id]);
  // its own signal wiring follows it: entered/exited → its own enterState, and the sounds it plays
  const mine = s.doc.connections.filter((c) => c.from === id);
  assert.deepEqual(mine.map((c) => `${c.signal}>${c.to}.${c.call}`).sort(), ['entered>entrance-left-2.enterState', 'entered>entrance-open-sound.play', 'exited>entrance-close-sound.play', 'exited>entrance-left-2.enterState'].sort());
  assert.equal(s.history().undoDepth, depth + 1);
  assert.equal(s.history().undo, 'Duplicate entrance-left');
  assert.ok(s.validate().ok, s.validate().errors.join('; '));
  s.undo();
  assert.equal(s.text(), before, 'one undo puts the document back');
  s.redo();
  assert.ok(s.node(id));
});

test('Duplicate: a node with children gets fresh ids all the way down, node references inside the copy point at the copy', () => {
  const s = cafe();
  s.addNode('Node3D', { id: 'group' });
  s.addNode('Camera', { id: 'shot', parent: 'group', props: { target: 'mira' } });
  s.addNode('Marker', { id: 'mark', parent: 'group' });
  s.run('aim', [{ op: 'set', id: 'shot', path: 'props.target', value: 'mark' }]);
  const n = s.doc.nodes.length;
  const [g] = s.duplicate(['group', 'mark']); // mark goes with its parent, not twice
  assert.equal(g, 'group-2');
  assert.equal(s.doc.nodes.length, n + 3);
  assert.equal(s.node('shot-2').parent, 'group-2');
  assert.equal(s.node('mark-2').parent, 'group-2');
  assert.equal(s.node('shot-2').props.target, 'mark-2', 'a reference inside the copy follows it');
  assert.equal(s.node('shot').props.target, 'mark', 'the original is untouched');
});

test('Duplicate: a prefab instance keeps its overrides and gets a fresh id', () => {
  const s = cafe();
  s.addFromAsset('prefabs/door.vrmxs', { id: 'door-a', at: [1, 0, 2] });
  s.run('override', [{ op: 'set', id: 'door-a', path: 'overrides', value: { hinge: { props: { mass: 3 } }, trigger: { props: { size: [2, 2, 1] } } } }]);
  const [id] = s.duplicate(['door-a']);
  assert.equal(id, 'door-a-2');
  assert.deepEqual(s.node(id).overrides, s.node('door-a').overrides);
  assert.deepEqual(s.node(id).transform, s.node('door-a').transform);
  const flat = flatten(s.doc, prefabs);
  assert.equal(flat.nodes.find((x) => x.id === `${id}/hinge`).props.mass, 3, 'the override applies to the copy\'s inner node');
  assert.ok(s.validate().ok, s.validate().errors.join('; '));
});

test('Copy and Paste: into the same scene (fresh ids) and into another (asset entries brought along, outside references dropped)', () => {
  const s = cafe();
  const clip = s.copy(['stool-1', 'hana-1']);
  assert.ok(isClip(clip));
  assert.ok(isClip(JSON.parse(JSON.stringify(clip))), 'a clip is plain JSON (the system clipboard carries it as text)');
  assert.equal(s.history().undoDepth, 0, 'copy is not an edit');
  const roots = s.paste(clip);
  assert.deepEqual(roots, ['stool-9', 'hana-2']);
  assert.equal(s.history().undo, 'Paste 2 nodes');
  assert.deepEqual(s.selection, roots);
  assert.equal(s.node('stool-9').asset, 'stool', 'the document\'s own asset entry is reused');
  assert.ok(s.validate().ok);
  s.undo();
  assert.ok(!s.node('stool-9') && !s.node('hana-2'));

  // another scene: an empty one with only a root
  const t = EditorSession.empty(reg, 'other');
  t.prefabs = prefabs;
  const door = copyNodes(cafe().doc, ['door-1']);
  const [d] = t.paste(door);
  assert.equal(d, 'door-2');
  assert.equal(t.node(d).parent, 'root', 'under the scene\'s root (the original parent is the other scene\'s)');
  assert.deepEqual(t.doc.assets, [{ id: 'cafe-door', type: 'vrmxi', ref: 'items/cafe-door.vrmxi' }]);
  assert.equal(t.doc.connections.length, 0, 'door-1 → hana-1 is dropped: hana-1 isn\'t in this scene');
  assert.ok(t.validate().ok, t.validate().errors.join('; '));
  // a node reference to a node the other scene lacks is dropped (the prop back to its default), and the scene stays valid
  const [c] = t.paste(copyNodes(cafe().doc, ['cam']));
  assert.equal(t.node(c).props.target, undefined, 'cam\'s target, mira, isn\'t in this scene');
  assert.equal(t.node(c).props.focalLength, 30, 'its other props come along');
  assert.ok(t.validate().ok, t.validate().errors.join('; '));
  // a behaviour param likewise: counter-light's switchedBy names light-switch, which isn't here
  const [l] = t.paste(copyNodes(cafe().doc, ['counter-light']));
  assert.equal(t.node(l).behaviours[0].params?.item, undefined);
  assert.ok(t.validate().ok, t.validate().errors.join('; '));
  const depth = t.history().undoDepth;
  assert.throws(() => t.paste({ hello: 1 }), /nothing to paste/);
  assert.equal(t.history().undoDepth, depth, 'a refused paste changed nothing');
});

test('Paste under a chosen parent, and refused while playing', async () => {
  const s = cafe();
  s.addNode('Node3D', { id: 'shelf' });
  const [id] = s.paste(s.copy(['sword']), { parent: 'shelf' });
  assert.equal(s.node(id).parent, 'shelf');
  await s.startPlay(() => ({}));
  assert.throws(() => s.duplicate(['sword']), /stop playing/);
  assert.throws(() => s.paste(s.copy(['sword'])), /stop playing/);
  s.stopPlay();
});

test('resizeShape: the props and the position in one undo step, rounded; the inspector reads the same props', () => {
  const s = cafe();
  s.addNode('Collider', { id: 'box', at: [1, 0.5, 0], props: { shape: 'box', size: [1, 1, 1] } });
  const depth = s.history().undoDepth;
  s.resizeShape('box', { size: [1.5000000001, 1, 1] }, { p: [1.25, 0.5, 0] });
  assert.deepEqual(s.node('box').props.size, [1.5, 1, 1]);
  assert.deepEqual(s.node('box').transform.p, [1.25, 0.5, 0]);
  assert.equal(s.history().undoDepth, depth + 1);
  assert.equal(s.history().undo, 'Resize box');
  s.undo();
  assert.deepEqual(s.node('box').props.size, [1, 1, 1]);
  assert.deepEqual(s.node('box').transform.p, [1, 0.5, 0]);
  s.addNode('SpotLight', { id: 'spot' });
  s.resizeShape('spot', { angle: 25, range: 6 });
  assert.deepEqual([s.node('spot').props.angle, s.node('spot').props.range, s.node('spot').transform], [25, 6, undefined]);
});

test('a copy takes the connections its nodes send, not those sent to them; a reference into a copied instance follows the copy', () => {
  const s = cafe();
  // light-switch → switch-sound (inside the copy) and door-1 → hana-1 (out of it); door-1 receives nothing
  const [sw] = s.duplicate(['light-switch']);
  assert.ok(s.doc.connections.some((c) => c.from === sw && c.to === 'switch-sound-2' && c.call === 'play'), 'the copy\'s switch plays the copy\'s sound');
  const before = s.doc.connections.filter((c) => c.to === 'hana-1').length;
  s.duplicate(['hana-1']); // door-1 → hana-1 comes from outside: the copy doesn't take it
  assert.equal(s.doc.connections.filter((c) => c.to === 'hana-2').length, 0);
  assert.equal(s.doc.connections.filter((c) => c.to === 'hana-1').length, before);
  // a camera aimed at a part inside a prefab instance, copied with the instance, aims at the copy's part
  s.addFromAsset('prefabs/door.vrmxs', { id: 'door-a' });
  s.addNode('Camera', { id: 'peek', parent: 'door-a', props: { target: 'mira' } });
  s.doc.nodes.find((n) => n.id === 'peek').props.target = 'door-a/hinge';
  s.duplicate(['door-a']);
  assert.equal(s.node('peek-2').props.target, 'door-a-2/hinge');
});

test('a clip from the clipboard is checked whole: cycles, duplicate ids, stray parents and oversize clips are not clips', () => {
  const s = cafe();
  const good = s.copy(['stool-1']);
  assert.ok(isClip(good));
  const bad = (f) => { const c = structuredClone(good); f(c); return c; };
  const cycle = { format: 'vrmxg-nodes', version: 1, roots: ['a'], nodes: [{ id: 'a', type: 'Node3D' }, { id: 'b', type: 'Node3D', parent: 'c' }, { id: 'c', type: 'Node3D', parent: 'b' }] };
  const loop = { format: 'vrmxg-nodes', version: 1, roots: ['a'], nodes: [{ id: 'a', type: 'Node3D', parent: 'b' }, { id: 'b', type: 'Node3D', parent: 'a' }] };
  for (const [why, c] of [
    ['a parent cycle beside the root', cycle],
    ['a root inside a cycle', loop],
    ['a duplicate id', bad((c) => c.nodes.push({ ...c.nodes[0] }))],
    ['a node whose parent is nowhere', bad((c) => c.nodes.push({ id: 'x', type: 'Node3D', parent: 'nowhere' }))],
    ['a root that isn\'t a node', bad((c) => c.roots.push('ghost'))],
    ['an id with a slash', bad((c) => { c.nodes[0].id = 'a/b'; c.roots = ['a/b']; })],
    ['props that aren\'t an object', bad((c) => { c.nodes[0].props = 'x'; })],
    ['a connection without a signal', bad((c) => c.connections.push({ from: 'stool-1', to: 'x', call: 'y' }))],
    ['too many nodes', bad((c) => { for (let i = 0; i < CLIP_LIMIT; i++) c.nodes.push({ id: `n${i}`, type: 'Node3D', parent: 'stool-1' }); })],
    ['another format', bad((c) => { c.format = 'x'; })],
  ]) {
    assert.equal(isClip(c), false, why);
    assert.throws(() => s.paste(c), /nothing to paste/, why);
  }
  assert.equal(s.history().undoDepth, 0, 'nothing was pasted');
});

test('references nested in object props and in prefab overrides follow the copy, and are dropped where the scene lacks them', () => {
  const s = cafe();
  s.addNode('Node3D', { id: 'rig' });
  s.addNode('Marker', { id: 'mark', parent: 'rig' });
  s.addNode('VirtualCamera', { id: 'shot', parent: 'rig', props: { body: { type: 'follow', target: 'mark' }, aim: { type: 'groupFraming', targets: ['mark', 'mira', 'hana-1#head'], target: 'mark#head' }, lens: { focalLength: 35, focusTarget: 'mira' } } });
  const [r] = s.duplicate(['rig']);
  assert.equal(r, 'rig-2');
  const p = s.node('shot-2').props;
  assert.equal(p.body.target, 'mark-2', 'into the copy');
  assert.deepEqual(p.aim.targets, ['mark-2', 'mira', 'hana-1#head'], 'inside the copy remapped, outside kept: the scene has them');
  assert.equal(p.aim.target, 'mark-2#head');
  assert.equal(p.lens.focusTarget, 'mira');
  assert.equal(s.node('shot').props.body.target, 'mark', 'the original untouched');
  // into an empty scene: what isn't there is dropped, what was copied follows
  const t = EditorSession.empty(reg, 'other');
  t.paste(s.copy(['rig']));
  const q = t.node('shot-2').props;
  assert.deepEqual([q.body.target, q.aim.targets, q.aim.target, q.lens.focusTarget, q.lens.focalLength], ['mark-2', ['mark-2'], 'mark-2#head', undefined, 35]);
  assert.ok(t.validate().ok, t.validate().errors.join('; '));
  // a prefab instance's override values, by the inner node's type in the prefab
  const watcher = { format: 'vrmxs', version: 1, id: 'watcher', assets: [], nodes: [{ id: 'base', type: 'Node3D' }, { id: 'eye', type: 'Camera', parent: 'base' }], connections: [] };
  const u = cafe();
  u.prefabs = new Map([...prefabs, ['prefabs/watcher.vrmxs', watcher]]);
  u.run('asset', [{ op: 'addAsset', asset: { id: 'watcher', type: 'vrmxs', ref: 'prefabs/watcher.vrmxs' } }]);
  u.run('add', [{ op: 'add', node: { id: 'w', type: 'Instance', asset: 'watcher', parent: 'root', overrides: { eye: { props: { target: 'w/base', focalLength: 85 } } } } }, { op: 'add', node: { id: 'w2', type: 'Instance', asset: 'watcher', parent: 'root', overrides: { eye: { props: { target: 'mira' } } } } }]);
  const [wc] = u.duplicate(['w']);
  assert.deepEqual(u.node(wc).overrides.eye.props, { target: 'w-2/base', focalLength: 85 }, 'the copy watches its own base');
  const v = EditorSession.empty(reg, 'third');
  v.prefabs = u.prefabs;
  const [w2] = v.paste(u.copy(['w2']));
  assert.deepEqual(v.node(w2).overrides.eye.props, {}, 'mira isn\'t in that scene: the override is dropped');
});
