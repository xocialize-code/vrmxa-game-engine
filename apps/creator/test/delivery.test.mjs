// The creator's delivery runner (M4 W10) in Node: file names, a turntable's framing and isolation, the deliver mode's
// options and its comparison of two runs. The rendering itself runs in the Mac app (acceptance/m4/delivery-wkwebview.sh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, DirectionalLight } from 'three';
import { baseName, hashBytes, isolate, turntableFraming, deliveryRunner } from '../src/delivery.js';
import { deliverOptions, compareRuns } from '../src/delivermode.js';

test('a job\'s base name: the given name, else short, size, rate and (for a delivery) codec', () => {
  assert.equal(baseName({ short: 'cafe-order', size: '720p', codec: 'h264', extras: null }, '24'), 'cafe-order-720p24', 'a draft keeps M4 W5\'s name');
  assert.equal(baseName({ short: 'cafe-order', size: '4k', codec: 'prores4444', extras: { stills: true } }, '24'), 'cafe-order-4k24-prores');
  assert.equal(baseName({ short: 'x', size: '1080p', codec: 'hevc', extras: {}, name: 'Final cut.mov' }, '29.97'), 'Final-cut');
  assert.equal(hashBytes(new Uint8Array([1, 2, 3])), hashBytes(new Uint8Array([1, 2, 3])));
  assert.notEqual(hashBytes(new Uint8Array([1, 2, 3])), hashBytes(new Uint8Array([1, 2, 4])));
});

// A tree stand-in: nodes with ids, types and three objects
function stage() {
  const root = new Group(), mira = new Group(), hana = new Group(), wall = new Mesh(new BoxGeometry(4, 3, 0.1), new MeshBasicMaterial()), sun = new DirectionalLight(), lamp = new Group();
  const body = new Mesh(new BoxGeometry(0.5, 1.6, 0.3), new MeshBasicMaterial()); body.position.y = 0.8; mira.add(body); mira.position.set(1, 0, 2);
  hana.add(new Mesh(new BoxGeometry(0.5, 1.5, 0.3), new MeshBasicMaterial()));
  lamp.add(new DirectionalLight()); // a model holding a light stays lit
  root.add(mira, hana, wall, sun, lamp);
  const nodes = [{ id: 'root', type: 'Node3D', object3d: root }, { id: 'mira', type: 'Character', object3d: mira }, { id: 'hana', type: 'Character', object3d: hana },
    { id: 'wall', type: 'Model', object3d: wall }, { id: 'sun', type: 'DirectionalLight', object3d: sun }, { id: 'lamp', type: 'Model', object3d: lamp }, { id: 'env', type: 'Environment', object3d: null }];
  return { tree: { find: (id) => nodes.find((n) => n.id === id), all: () => nodes }, root, mira, hana, wall, sun, lamp };
}

test('a turntable sees its character alone (lights and environment kept), and everything comes back', () => {
  const s = stage();
  s.wall.visible = true; s.hana.visible = false; // already hidden: stays hidden after
  const restore = isolate(s.tree, 'mira');
  assert.deepEqual([s.root.visible, s.mira.visible, s.wall.visible, s.hana.visible, s.sun.visible, s.lamp.visible], [true, true, false, false, true, true]);
  restore();
  assert.deepEqual([s.wall.visible, s.hana.visible], [true, false]);
  assert.throws(() => isolate(s.tree, 'nobody'), /no character nobody/);
});

test('a turntable frames the character\'s box: centred on it, far enough to fit', () => {
  const s = stage();
  const f = turntableFraming(s.mira, 16 / 9);
  assert.deepEqual(f.center.map((v) => +v.toFixed(3)), [1, 0.8, 2]);
  assert.ok(f.radius > 3 && f.radius < 5, `a 1.6 m figure in a 30° lens stands ${f.radius.toFixed(2)} m off`);
  assert.ok(Math.abs(f.height - 1.6 * 0.08) < 1e-6, "a little above the middle");
  assert.throws(() => turntableFraming(new Group(), 1), /nothing to frame/);
});

test('the runner refuses a job whose short isn\'t open, or whose snapshot is gone', async () => {
  const host = { snapshots: new Map([['job-1', { text: '{}', set: 'cafe.vrmxs' }]]), short: { id: 'other' }, setScene: { ref: 'cafe.vrmxs' } };
  const r = deliveryRunner(host), ctx = { progress() {}, signal: new AbortController().signal };
  await assert.rejects(r.run({ id: 'job-2', spec: { short: 'cafe-order' } }, ctx), /wasn't kept/);
  await assert.rejects(r.run({ id: 'job-1', spec: { short: 'cafe-order', title: 'The Order' } }, ctx), /open The Order to render it/);
});

test('deliver mode: options from the query, and what two runs must agree on', () => {
  assert.equal(deliverOptions('?mode=x'), null);
  assert.deepEqual(deliverOptions('?deliver=h264-4k24&seconds=60&extras=none&backend=webgl'), { preset: 'h264-4k24', short: null, repeat: 2, seconds: 60, backend: 'webgl', check: null, extras: null });
  assert.deepEqual(deliverOptions('?deliver=prores-1080p24&short=cafe-order&repeat=1&check=redraw&extras=stills,turntable').extras, { stills: true, thumbnails: false, turntable: true });
  assert.equal(deliverOptions('?deliver=draft').extras, undefined, 'the preset decides');
  const r = { hashesDigest: 'a', audioHash: 'w' }, m = { stills: [{ hash: '1' }], thumbnails: [{ hash: '2' }], turntables: [{ frameDigest: 't' }] };
  assert.deepEqual(compareRuns([r, { ...r }], [m, structuredClone(m)]), { runs: 2, frames: true, audio: true, stills: true, thumbnails: true, turntables: true });
  const odd = compareRuns([r, { ...r, hashesDigest: 'b' }], [m, { ...m, turntables: [{ frameDigest: 'u' }] }]);
  assert.deepEqual([odd.frames, odd.turntables, odd.stills], [false, false, true]);
  assert.equal(compareRuns([{ hashesDigest: null }, { hashesDigest: null }], []).frames, false, 'no frames hashed is not a match');
});
