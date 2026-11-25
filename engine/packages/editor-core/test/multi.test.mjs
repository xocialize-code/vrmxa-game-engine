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
  for (const v of [2.1, 2.2, 2.35, 2.5]) s.setProp('lamp-a', 'intensity', v); // the field's live changes
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
  for (const x of [1, 2, 3]) s.setTransforms([{ id: 'lamp-a', t: { p: [x, 0, 0] } }, { id: 'lamp-b', t: { p: [x, 1, 0] } }]);
  s.endGesture();
  assert.equal(s.history().undo, 'Move 2 nodes');
  assert.equal(s.history().undoDepth, depth + 2);
  const step = s.editor.peek().undo;
  assert.equal(step.ops.length, 2, 'each path\'s last set only');
  s.undo();
  assert.equal(s.node('lamp-a').transform, undefined);
});

test('a drag that ends where it began leaves no step; Escape undoes it; an edit from elsewhere in between isn\'t folded', () => {
  const s = lights();
  const before = s.text(), depth = s.history().undoDepth;
  s.beginGesture();
  s.setProp('lamp-a', 'intensity', 3);
  s.setProp('lamp-a', 'intensity', 2);
  assert.equal(s.endGesture(), null);
  assert.equal(s.text(), before);
  assert.equal(s.history().undoDepth, depth);
  s.beginGesture();
  s.setProp('lamp-a', 'intensity', 3);
  s.setProp('lamp-a', 'intensity', 3.5);
  s.cancelGesture();
  assert.equal(s.text(), before, 'cancelled: as before the drag');
  assert.equal(s.history().undoDepth, depth);
  s.beginGesture();
  s.setProp('lamp-a', 'intensity', 3);
  s.run('Rename spot', [{ op: 'set', id: 'spot', path: 'name', value: 'Spot' }]); // an MCP edit lands mid-drag
  s.gesture.ops.splice(s.gesture.ops.indexOf(s.editor.peek().undo), 1); // (an MCP edit isn't the gesture's: it arrives outside the field's calls)
  s.setProp('lamp-a', 'intensity', 4);
  s.endGesture();
  assert.equal(s.history().undoDepth, depth + 3, 'left as three steps: the agent\'s rename is never folded into the drag');
  assert.equal(s.node('spot').name, 'Spot');
  assert.equal(s.endGesture(), null, 'no gesture open: nothing happens');
});

test('MCP edits are unaffected: setProp and run as before, one step each', () => {
  const s = lights();
  const depth = s.history().undoDepth;
  s.setProp('lamp-a', 'intensity', 7);
  s.run('Set lamp-b.range', [{ op: 'set', id: 'lamp-b', path: 'props.range', value: 2 }]);
  assert.equal(s.history().undoDepth, depth + 2);
  assert.equal(parse(s.text()).nodes.find((n) => n.id === 'lamp-a').props.intensity, 7);
});
