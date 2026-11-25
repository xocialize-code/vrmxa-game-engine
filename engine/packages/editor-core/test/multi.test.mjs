// M5 W4: several nodes edited at once (AB-T-0601) and a drag as one undo step (AB-T-0600), on the session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { m0Registry } from '@vrmxg/registry/m0';
import { parse } from '@vrmxg/scene';
import { EditorSession } from '../src/index.js';

const reg = m0Registry();
function lights() {
  const s = EditorSession.empty(reg);
  s.addNode('PointLight', { id: 'lamp-a', props: { intensity: 2 } });
  s.addNode('PointLight', { id: 'lamp-b' });
  s.addNode('SpotLight', { id: 'spot', at: [1, 2, 3] });
  return s;
}

test('two lights selected: an intensity change sets both, as one undo step that undo restores in one', () => {
  const s = lights();
  const before = s.text(), depth = s.history().undoDepth;
  s.setPropOn(['lamp-a', 'lamp-b'], 'intensity', 4);
  assert.equal(s.node('lamp-a').props.intensity, 4);
  assert.equal(s.node('lamp-b').props.intensity, 4);
  assert.equal(s.history().undo, 'Set intensity on 2 nodes');
  assert.equal(s.history().undoDepth, depth + 1, 'one step');
  assert.equal(s.validate().ok, true);
  s.undo();
  assert.equal(s.text(), before, 'both back, byte for byte');
  s.redo();
  assert.equal(s.node('lamp-b').props.intensity, 4);
  s.setPropOn(['lamp-a', 'lamp-b'], 'intensity', undefined);
  assert.equal(s.node('lamp-a').props?.intensity, undefined, 'cleared back to the default on both');
  assert.equal(s.history().undo, 'Set intensity on 2 nodes');
});

test('the multi-edit: one id is setProp\'s step; nodes already holding the value get no op; an invalid value changes none', () => {
  const s = lights();
  s.setPropOn(['lamp-b'], 'range', 3);
  assert.equal(s.history().undo, 'Set lamp-b.range');
  const depth = s.history().undoDepth;
  s.setPropOn(['lamp-a', 'lamp-b'], 'range', 3); // lamp-b has it already
  assert.equal(s.history().undoDepth, depth + 1);
  s.undo();
  assert.equal(s.node('lamp-b').props.range, 3, 'lamp-b untouched by the undo');
  assert.equal(s.node('lamp-a').props?.range, undefined);
  const d2 = s.history().undoDepth;
  s.setPropOn(['lamp-a', 'lamp-b'], 'range', 3);
  s.setPropOn(['lamp-a', 'lamp-b'], 'range', 3);
  assert.equal(s.history().undoDepth, d2 + 1, 'nothing left to change: no step');
  const text = s.text();
  assert.throws(() => s.setPropOn(['lamp-a', 'lamp-b'], 'intensity', -5), /minimum|>=/);
  assert.equal(s.text(), text, 'all or nothing');
  assert.throws(() => s.setPropOn(['lamp-a', 'nope'], 'intensity', 1), /no node nope/);
});

test('several transforms as one step: Position X on a selection, each node keeping its own Y and Z', () => {
  const s = lights();
  const before = s.text();
  s.setTransforms([{ id: 'lamp-a', t: { p: [5, 0, 0] } }, { id: 'spot', t: { p: [5, 2, 3] } }]);
  assert.deepEqual(s.node('spot').transform.p, [5, 2, 3]);
  assert.deepEqual(s.node('lamp-a').transform.p, [5, 0, 0]);
  assert.equal(s.history().undo, 'Move 2 nodes');
  s.undo();
  assert.equal(s.text(), before);
  s.setTransforms([{ id: 'spot', t: { s: [2, 2, 2] } }]);
  assert.equal(s.history().undo, 'Scale spot', 'one entry: setTransform\'s step');
});

test('a drag is one undo step: live edits while it moves, folded on release, labelled as the last', () => {
  const s = lights();
  const before = s.text(), depth = s.history().undoDepth;
  s.beginGesture();
  assert.equal(s.gesturing, true);
  for (const v of [2.1, 2.2, 2.35, 2.5]) s.withGesture(() => s.setProp('lamp-a', 'intensity', v)); // the field's live changes
  assert.equal(s.node('lamp-a').props.intensity, 2.5, 'live');
  assert.equal(s.endGesture(), 'Set lamp-a.intensity');
  assert.equal(s.history().undoDepth, depth + 1, 'one step for the whole drag');
  assert.equal(s.history().undo, 'Set lamp-a.intensity');
  s.undo();
  assert.equal(s.text(), before, 'undo goes back to before the drag');
  s.redo();
  assert.equal(s.node('lamp-a').props.intensity, 2.5);
  // a drag of a transform on two nodes: one step
  s.beginGesture();
  for (const x of [1, 2, 3]) s.withGesture(() => s.setTransforms([{ id: 'lamp-a', t: { p: [x, 0, 0] } }, { id: 'lamp-b', t: { p: [x, 1, 0] } }]));
  s.endGesture();
  assert.equal(s.history().undo, 'Move 2 nodes');
  assert.equal(s.history().undoDepth, depth + 2);
  const step = s.editor.peek().undo;
  assert.equal(step.ops.length, 2, 'each path\'s last set only');
  s.undo();
  assert.equal(s.node('lamp-a').transform, undefined);
});

test('a drag that ends where it began leaves no step; Escape undoes it', () => {
  const s = lights();
  const live = (v) => s.withGesture(() => s.setProp('lamp-a', 'intensity', v));
  const before = s.text(), depth = s.history().undoDepth;
  s.beginGesture(); live(3); live(2);
  assert.equal(s.endGesture(), null);
  assert.equal(s.text(), before);
  assert.equal(s.history().undoDepth, depth);
  s.beginGesture(); live(3); live(3.5);
  s.cancelGesture();
  assert.equal(s.text(), before, 'cancelled: as before the drag');
  assert.equal(s.history().undoDepth, depth);
  assert.equal(s.endGesture(), null, 'no gesture open: nothing happens');
});

test('an edit from elsewhere during a drag (MCP: the session\'s run, not the gesture\'s) stays its own step', () => {
  const s = lights();
  const live = (v) => s.withGesture(() => s.setProp('lamp-a', 'intensity', v));
  const depth = s.history().undoDepth;
  s.beginGesture(); live(3);
  s.run('Rename spot', [{ op: 'set', id: 'spot', path: 'name', value: 'Spot' }]); // what MCP's apply does, mid-drag
  live(4);
  assert.equal(s.endGesture(), 'Set lamp-a.intensity');
  assert.equal(s.history().undoDepth, depth + 2, 'the rename, then the folded drag');
  assert.deepEqual([s.node('lamp-a').props.intensity, s.node('spot').name], [4, 'Spot']);
  s.undo();
  assert.deepEqual([s.node('lamp-a').props.intensity, s.node('spot').name], [2, 'Spot'], 'undoing the drag keeps the agent\'s rename');
  assert.equal(s.history().undo, 'Rename spot');
  s.undo();
  assert.equal(s.node('spot').name, undefined);
  // cancelled: the agent's edit stays
  s.beginGesture(); live(5);
  s.run('Set lamp-b.range', [{ op: 'set', id: 'lamp-b', path: 'props.range', value: 2 }]);
  live(6);
  s.cancelGesture();
  assert.deepEqual([s.node('lamp-a').props.intensity, s.node('lamp-b').props.range], [2, 2]);
  assert.equal(s.history().undo, 'Set lamp-b.range');
  // the agent touched the dragged node: nothing is folded, every step stays as it was
  const d2 = s.history().undoDepth;
  s.beginGesture(); live(3);
  s.run('Set lamp-a.range', [{ op: 'set', id: 'lamp-a', path: 'props.range', value: 4 }]);
  live(4);
  s.endGesture();
  assert.equal(s.history().undoDepth, d2 + 3);
  assert.deepEqual([s.node('lamp-a').props.intensity, s.node('lamp-a').props.range], [4, 4]);
});

test('MCP edits are unaffected: setProp and run as before, one step each', () => {
  const s = lights();
  const depth = s.history().undoDepth;
  s.setProp('lamp-a', 'intensity', 7);
  s.run('Set lamp-b.range', [{ op: 'set', id: 'lamp-b', path: 'props.range', value: 2 }]);
  assert.equal(s.history().undoDepth, depth + 2);
  assert.equal(parse(s.text()).nodes.find((n) => n.id === 'lamp-a').props.intensity, 7);
});

test('the review\'s cases: an abandoned drag leaves nothing to redo; node references are checked on a node with no props; one axis on each node', () => {
  const s = lights();
  s.setProp('lamp-a', 'intensity', 2.5);
  s.beginGesture(); s.withGesture(() => s.setProp('lamp-a', 'intensity', 3)); s.withGesture(() => s.setProp('lamp-a', 'intensity', 4)); s.cancelGesture();
  assert.equal(s.node('lamp-a').props.intensity, 2.5);
  assert.equal(s.history().redoDepth, 0, 'Escape: Redo doesn\'t replay the cancelled drag');
  assert.equal(s.history().undo, 'Set lamp-a.intensity');
  s.beginGesture(); s.withGesture(() => s.setProp('lamp-a', 'intensity', 3)); s.withGesture(() => s.setProp('lamp-a', 'intensity', 2.5)); s.endGesture();
  assert.equal(s.history().redoDepth, 0, 'a drag back to where it began: nothing to redo either');
  s.addNode('Camera', { id: 'cam' });
  assert.equal(s.node('cam').props, undefined);
  assert.throws(() => s.setProp('cam', 'target', 'ghost'), /must name an existing node/);
  assert.throws(() => s.setPropOn(['cam', 'lamp-a'], 'target', 'ghost'));
  assert.equal(s.node('cam').props, undefined, 'refused: nothing left behind');
  s.addNode('Collider', { id: 'c1', props: { size: [1, 2, 3] } });
  s.addNode('Collider', { id: 'c2', props: { size: [4, 2, 3] } });
  s.setPropEach('size', [{ id: 'c1', value: [5, 2, 3] }, { id: 'c2', value: [5, 2, 3] }]);
  assert.equal(s.history().undo, 'Set size on 2 nodes');
  s.undo();
  assert.deepEqual([s.node('c1').props.size, s.node('c2').props.size], [[1, 2, 3], [4, 2, 3]]);
});

test('a number that isn\'t finite is refused from any source: the session, the scene editor, the validator', () => {
  const s = lights();
  const text = s.text();
  assert.throws(() => s.setProp('lamp-a', 'intensity', Infinity), /not a finite number/);
  assert.throws(() => s.setPropOn(['lamp-a', 'lamp-b'], 'range', NaN), /not a finite number/);
  assert.throws(() => s.setTransform('lamp-a', { p: [Infinity, 0, 0] }), /not a finite number/);
  assert.throws(() => s.run('MCP set', [{ op: 'set', id: 'lamp-a', path: 'props', value: { intensity: -Infinity } }]), /not a finite number/);
  assert.throws(() => s.addNode('PointLight', { id: 'x', props: { range: Infinity } }), /not a finite number/);
  assert.equal(s.text(), text, 'nothing changed');
  const doc = structuredClone(s.doc); doc.nodes[1].props.intensity = Infinity;
  const v = s.validator.check(doc);
  assert.equal(v.ok, false);
  assert.match(v.errors[0], /\/nodes\/1\/props\/intensity is not a finite number/);
});
