// M3 W5: the detector on synthetic frames. Someone appears, waves, nods, shakes their head, points and leaves: each
// is one event, in order. Holding an open hand still, looking down and turning the head one way are not gestures. The
// same frames give the same events every time; a person farther away (a smaller face) is read the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GestureDetector, handShape } from '@vrmxg/sense';
import { session, hand, scriptFrames, still, palm, lookDown, turn } from './synth.mjs';

const run = (frames, opts) => { const d = new GestureDetector(opts); return frames.flatMap((f) => d.push(f)); };
const kinds = (ev) => ev.filter((e) => e.type !== 'face').map((e) => (e.type === 'presence' ? (e.present ? 'appeared' : 'left') : e.type));

test('hand shapes: open, pointing, a fist', () => {
  assert.deepEqual([handShape(hand('right', [0, 0])).open, handShape(hand('right', [0, 0])).point], [true, false]);
  assert.deepEqual([handShape(hand('right', [0, 0], 'point')).open, handShape(hand('right', [0, 0], 'point')).point], [false, true]);
  assert.deepEqual([handShape(hand('right', [0, 0], 'fist')).open, handShape(hand('right', [0, 0], 'fist')).point], [false, false]);
});

test('the script: appeared, wave, nod, shake, point, left; in order, once each, and the same every run', () => {
  const ev = run(scriptFrames());
  assert.deepEqual(kinds(ev), ['appeared', 'wave', 'nod', 'shake', 'point', 'left']);
  const at = Object.fromEntries(ev.filter((e) => e.type !== 'face').map((e) => [e.type === 'presence' ? (e.present ? 'appeared' : 'left') : e.type, e.t]));
  assert.ok(at.appeared >= 300 && at.appeared < 500, `appeared after 0.3 s (${at.appeared})`);
  assert.ok(at.wave > 1500 && at.wave < 3500, `the wave while waving (${at.wave})`);
  assert.ok(at.nod > 4500 && at.nod < 5400 && at.shake > 6500 && at.shake < 7600 && at.point > 8500 && at.point < 9500);
  assert.ok(at.left >= 12000, `left 1.5 s after the face went (${at.left})`);
  const p = ev.find((e) => e.type === 'point');
  assert.equal(p.hand, 'right'); assert.ok(p.dir[1] > 0.9, 'pointing up from the hand (the synthetic finger points up)');
  const faces = ev.filter((e) => e.type === 'face');
  assert.ok(faces.length >= 10 && faces.length < 80, `face updates throttled (${faces.length} in 12 s)`);
  assert.deepEqual(run(scriptFrames()), ev, 'the same frames, the same events');
});

test('not gestures: an open hand held still, looking down, turning one way; and nothing while no one is there', () => {
  assert.deepEqual(kinds(run(session([[0, 1000, still], [1000, 4000, palm]]))), ['appeared']);
  assert.deepEqual(kinds(run(session([[0, 1000, still], [1000, 4000, lookDown]]))), ['appeared']);
  assert.deepEqual(kinds(run(session([[0, 1000, still], [1000, 4000, turn]]))), ['appeared']);
  // a wave with no face in view: no one is there, nothing happens
  assert.deepEqual(kinds(run(session([[0, 3000, (t, l) => ({ face: null, hands: [hand('right', [0.35 + 0.18 * Math.sin(2 * Math.PI * 2.5 * l / 1000), 0.3])] })]]))), []);
});

test('farther away (half the face size, half the swing): the same events', () => {
  const far = scriptFrames().map((f) => ({
    ...f,
    face: f.face && { ...f.face, x: f.face.x / 2, y: f.face.y / 2, w: f.face.w / 2 },
    hands: f.hands.map((h) => ({ ...h, wrist: h.wrist.map((v) => v / 2), tips: h.tips.map((p) => p.map((v) => v / 2)), pips: h.pips.map((p) => p.map((v) => v / 2)) })),
  }));
  assert.deepEqual(kinds(run(far)), ['appeared', 'wave', 'nod', 'shake', 'point', 'left']);
});
