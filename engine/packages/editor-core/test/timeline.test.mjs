// M2 W5 (AB-T-0528): the timeline's model. One geometry for ruler, headers and lanes (anchored zoom, ticks that adapt),
// snapping in pixels at every zoom, the rows of a sequence, and every sequence command as one undo step that undo and
// redo walk back and forth, with save giving canonical bytes that reopen identically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { m0Registry } from '@vrmxg/registry/m0';
import { parse } from '@vrmxg/scene';
import { EditorSession, TimelineGeometry, timecode, rowsOf, snapTargets, snapFrame, SNAP_PX, newSequenceDoc } from '@vrmxg/editor-core';

const reg = m0Registry();
const SET_IDS = new Set(['root', 'mira', 'hana-1', 'cam', 'env', 'counter-light', 'door-1']);

function session() {
  const s = new EditorSession({ registry: reg, doc: newSequenceDoc({ id: 'test', set: 'cafe.vrmxs', duration: 96 }) });
  s.targetIds = () => SET_IDS;
  return s;
}

test('one geometry: x and frame invert, zoom keeps its anchor, scroll never goes negative, ticks adapt', () => {
  const g = new TimelineGeometry({ pxPerFrame: 4, visibleStart: 10 });
  assert.equal(g.x(30), 80); assert.equal(g.frameAt(80), 30);
  g.zoom(16, 30); assert.equal(g.x(30), 80, 'the anchor frame stays where it was');
  g.scroll(-5); assert.equal(g.visibleStart, 0);
  const coarse = new TimelineGeometry({ pxPerFrame: 0.5 }).ticks(800, 24), fine = new TimelineGeometry({ pxPerFrame: 30 }).ticks(800, 24);
  assert.ok(coarse.step > fine.step, `${coarse.step} > ${fine.step}`);
  assert.ok(fine.ticks.some((t) => t.major && t.label === '1:00'), 'majors every second, as timecode');
  assert.equal(timecode(24 * 75 + 5, 24), '1:15:05');
});

test('snapping: a threshold in pixels is the same feel at every zoom; markers, shots, keys and clip edges attract', () => {
  const seq = { duration: 96, markers: [{ frame: 40, name: 'm' }], shots: [{ id: 's1', start: 0, end: 48 }], tracks: [{ id: 'k', type: 'property', target: 'env', path: 'props.x', keys: [[10, 1], [70, 2]] }, { id: 'c', type: 'camera', clips: [{ start: 20, end: 33, camera: 'cam' }] }] };
  const targets = snapTargets(seq, { playhead: 55 });
  assert.deepEqual(targets, [0, 10, 20, 33, 40, 48, 55, 70, 96]);
  for (const pxPerFrame of [0.5, 5, 50]) {
    const g = new TimelineGeometry({ pxPerFrame }), tol = g.frames(SNAP_PX), sparse = [0, 40, 400];
    assert.equal(snapFrame(40 + g.frames(6), sparse, tol).frame, 40, `6 px from a marker snaps at ${pxPerFrame} px/frame`);
    const far = snapFrame(40 + g.frames(12), sparse, tol);
    assert.ok(!far.snapped || far.frame !== 40, `12 px away doesn't at ${pxPerFrame} px/frame`);
  }
  assert.deepEqual(snapTargets(seq, { except: { track: 'k', index: 0 } }).includes(10), false, 'the dragged key is not its own target');
  assert.deepEqual(snapFrame(12.4, [], 1), { frame: 12, snapped: false });
});

test('building a 3-shot sequence from commands: each one undo step; undo and redo walk it; save and reopen are the same bytes', () => {
  const s = session(), labels = [];
  s.on((e) => { if (e.kind === 'edit') labels.push(e.label); });
  s.seq.addShot({ start: 0, end: 48, name: 'Wide', camera: 'cam' });
  s.seq.addShot({ start: 48, end: 96, name: 'Close', camera: 'cam' });
  s.seq.addShot({ start: 96, end: 144, name: 'Two', camera: 'cam' });
  const anim = s.seq.addTrack({ type: 'animation', target: 'hana-1' });
  s.seq.addClip(anim, { start: 10, end: 70, slot: 'talk', blendIn: 8, blendOut: 8 });
  const face = s.seq.addTrack({ type: 'expression', target: 'hana-1' });
  s.seq.addKey(face, 20, 0, { channel: 'happy' }); s.seq.addKey(face, 30, 1, { channel: 'happy', ease: 'easeOut' });
  const line = s.seq.addTrack({ type: 'dialogue', target: 'hana-1' });
  s.seq.addClip(line, { start: 50, end: 90, text: 'Welcome in!' });
  assert.equal(s.doc.sequence.duration, 144, 'shots extend the sequence');
  assert.deepEqual(s.doc.sequence.tracks.find((t) => t.type === 'camera').clips.map((c) => [c.start, c.end]), [[0, 48], [48, 96], [96, 144]]);
  assert.equal(labels.length, 10, 'ten commands, ten undo steps');
  // drags
  assert.equal(s.seq.moveKey(face, 1, 26, { channel: 'happy' }), 1);
  s.seq.moveClip(anim, 0, { start: 14, end: 74 });
  s.seq.moveShot('s2', { end: 90 });
  assert.deepEqual(s.doc.sequence.tracks.find((t) => t.type === 'camera').clips[1], { start: 48, end: 90, camera: 'cam' }, 'the shot\'s camera clip follows its trim');
  const rows = rowsOf(s.doc.sequence);
  assert.deepEqual(rows.map((r) => r.kind), ['shots', 'clips', 'clips', 'keys', 'clips']);
  assert.equal(rows[3].items.length, 2);
  const saved = s.save(), depth = s.history().undoDepth;
  assert.equal(depth, 13);
  for (let i = 0; i < depth; i++) assert.ok(s.undo());
  assert.deepEqual(s.doc.sequence, { fps: 24, duration: 96, shots: [], markers: [], tracks: [] }, 'undone to the empty sequence');
  for (let i = 0; i < depth; i++) assert.ok(s.redo());
  assert.equal(s.text(), saved, 'redone to the same bytes');
  const reopened = new EditorSession({ registry: reg, text: saved });
  assert.equal(reopened.text(), saved, 'reopened: the same bytes');
  assert.ok(reopened.isSequence);
  assert.deepEqual(reopened.validate().errors, []);
});

test('commands refuse what the sequence check refuses, and leave no undo step', () => {
  const s = session();
  assert.throws(() => s.seq.addTrack({ type: 'lookAt', target: 'nobody' }), /target "nobody"/);
  assert.throws(() => s.seq.addShot({ start: 10, end: 5 }), /ends before it starts/);
  const cam = s.seq.addTrack({ type: 'camera' });
  assert.throws(() => s.seq.addClip(cam, { start: 0, end: 10, camera: 'ghost' }), /camera "ghost"/);
  assert.equal(s.history().undoDepth, 1);
  const k = s.seq.addTrack({ type: 'property', target: 'counter-light', path: 'props.intensity' });
  s.seq.addKey(k, 0, 18); s.seq.addKey(k, 24, 4); s.seq.addKey(k, 24, 6);
  assert.deepEqual(s.doc.sequence.tracks.at(-1).keys, [[0, 18], [24, 6]], 'a key at the same frame replaces it');
  s.seq.moveKey(k, 1, 0);
  assert.deepEqual(s.doc.sequence.tracks.at(-1).keys, [[0, 6]], 'moving onto another key replaces it');
  assert.equal(parse(s.text()).sequence.tracks.length, 2);
});
