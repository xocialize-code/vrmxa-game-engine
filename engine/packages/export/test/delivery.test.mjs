// M4 W10 (AB-T-0582) in Node: the redraw check (an odd draw caught and outvoted, three different draws refused), the
// turntable (an orbit round a held world, the host's camera put back), and delivery's plain data: which frames become
// stills, the thumbnail box filter, the orbit and the file names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { installCameras } from '@vrmxg/camera';
import { RenderHost } from '@vrmxg/render';
import { exportTake, exportTurntable, hashSink, stillFrames, boxDown, orbitPose, fitDistance, deliveryFiles, slug, RATES } from '@vrmxg/export';

installPortableMath();
const reg = m0Registry();
class Mover extends Behaviour { physicsProcess(dt) { this.node.object3d.position.x += 3 * dt; } }
function world() {
  const tree = new SceneTree({ registry: reg, behaviours: new Map([['mover', Mover]]), seed: 1 });
  installCameras(tree);
  tree.instantiate({ format: 'vrmxs', version: 1, id: 'w10', nodes: [
    { id: 'root', type: 'Node3D' },
    { id: 'box', type: 'Node3D', parent: 'root', behaviours: [{ use: 'mover' }] },
    { id: 'cam', type: 'Camera', parent: 'root', transform: { p: [0, 1, 5] } },
  ] });
  return tree;
}

// A renderer whose pixels depend only on what it draws (the box's x, the camera's x and z), with odd draws on demand:
// `odd` holds the render calls (1-based) whose picture comes out wrong.
function pictureRenderer(tree, odd = new Set()) {
  const gl = { drawingBufferWidth: 0, drawingBufferHeight: 0, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, pic: [0, 0, 0], renders: 0,
    readPixels(x, y, w, h, f, t, out) { const dv = new DataView(out.buffer, out.byteOffset, out.byteLength); dv.setFloat64(0, this.pic[0]); dv.setFloat64(8, this.pic[1]); dv.setFloat64(16, this.pic[2]); } };
  return {
    gl, shadowMap: { enabled: false }, ratio: 1,
    setPixelRatio(r) { this.ratio = r; }, getPixelRatio() { return this.ratio; },
    setSize(w, h) { gl.drawingBufferWidth = w * this.ratio; gl.drawingBufferHeight = h * this.ratio; },
    getContext() { return gl; }, dispose() {},
    render(scene, camera) {
      scene.updateMatrixWorld(); camera.updateMatrixWorld?.();
      gl.renders++;
      gl.pic = [tree.find('box').object3d.matrixWorld.elements[12] + (odd.has(gl.renders) ? 1 / 256 : 0), camera.matrixWorld.elements[12], camera.matrixWorld.elements[14]];
    },
  };
}
const take = (o) => { const tree = world(); const r = pictureRenderer(tree, o.odd); return { tree, r, host: new RenderHost({ renderer: r, dprCap: 1 }) }; };
const exp = async ({ odd, check }) => { const { tree, host, r } = take({ odd }); const sink = hashSink(); const x = await exportTake({ tree, host, fps: RATES['24'], frames: 12, width: 32, height: 18, sink, audio: false, check }); return { x, hashes: sink.hashes, renders: r.gl.renders }; };

test('the redraw check: every frame drawn twice, the same pictures as a plain export', async () => {
  const plain = await exp({}), checked = await exp({ check: 'redraw' });
  assert.equal(plain.x.check, null);
  assert.deepEqual(checked.x.check, { mode: 'redraw', frames: 12, odd: [] });
  assert.deepEqual(checked.hashes, plain.hashes, 'the check changes no frame');
  assert.equal(checked.renders, 24, 'two draws a frame, no third when they agree');
});

test('the redraw check outvotes an odd draw, first or second, and refuses three different pictures', async () => {
  const plain = await exp({});
  // frame 5's draws are renders 11 (the frame), 12 (the redraw), 13 (the tie-break)
  const first = await exp({ check: 'redraw', odd: new Set([11]) });
  assert.deepEqual(first.x.check.odd, [{ n: 5, odd: 'first' }]);
  assert.deepEqual(first.hashes, plain.hashes, 'the frame two draws agree on goes out');
  const second = await exp({ check: 'redraw', odd: new Set([12]) });
  assert.deepEqual(second.x.check.odd, [{ n: 5, odd: 'second' }]);
  assert.deepEqual(second.hashes, plain.hashes);
  // three draws of frame 5, each different
  const { tree, host } = take({ odd: new Set([12]) });
  host.renderer.render = ((orig) => function (s, c) { orig.call(this, s, c); if (this.gl.renders === 13) this.gl.pic[0] += 2; })(host.renderer.render);
  await assert.rejects(exportTake({ tree, host, fps: RATES['24'], frames: 12, width: 32, height: 18, sink: hashSink(), audio: false, check: 'redraw' }), /frame 5: three draws/);
  await assert.rejects(exp({ check: 'twice' }), /check is 'redraw' or null/);
});

test('onBytes sees each frame before the sink, in order', async () => {
  const { tree, host } = take({}); const seen = [];
  await exportTake({ tree, host, fps: RATES['24'], frames: 6, width: 32, height: 18, sink: hashSink(), audio: false, onBytes: (n, b) => seen.push([n, new DataView(b.buffer, b.byteOffset).getFloat64(0)]) });
  assert.deepEqual(seen.map((s) => s[0]), [0, 1, 2, 3, 4, 5]);
  assert.ok(seen[5][1] > seen[1][1], 'the box moved on between frames');
});

test('a turntable orbits a held world once and puts the host\'s camera back', async () => {
  const { tree, host } = take({});
  tree.run(30);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100), center = [0, 1, 0], frames = 8;
  const seen = [], sink = { ...hashSink(), frame(n, b) { const dv = new DataView(b.buffer, b.byteOffset); seen[n] = [dv.getFloat64(0), dv.getFloat64(8), dv.getFloat64(16)]; } };
  sink.begin = (job) => { sink.job = job; return { id: 't' }; }; sink.end = () => ({ ok: true });
  const r = await exportTurntable({ tree, host, camera, fps: RATES['24'], frames, width: 32, height: 18, sink, pose: (n) => orbitPose(n, frames, { center, radius: 2 }) });
  assert.equal(tree.clock.step, 30, 'never stepped');
  assert.equal(host.camera, null, 'the host draws through the world\'s camera again');
  assert.equal(r.frames, frames); assert.deepEqual(sink.job.fps, [24, 1]); assert.equal(sink.job.audio, false);
  for (let n = 0; n < frames; n++) {
    const p = orbitPose(n, frames, { center, radius: 2 });
    assert.ok(Math.abs(seen[n][1] - p.position[0]) < 1e-9 && Math.abs(seen[n][2] - p.position[2]) < 1e-9, `frame ${n} from the orbit`);
    assert.equal(seen[n][0], seen[0][0], 'the world held still');
  }
  assert.ok(Math.abs(camera.aspect - 32 / 18) < 1e-12);
  // warm: one frame drawn and thrown away first (AB-T-0596); the frames sent are the same
  const before = host.renderer.gl.renders, warmSeen = [];
  const warmSink = { ...sink, frame(n, b) { warmSeen[n] = new DataView(b.buffer, b.byteOffset).getFloat64(8); } };
  await exportTurntable({ tree, host, camera, fps: RATES['24'], frames, width: 32, height: 18, sink: warmSink, warm: true, pose: (n) => orbitPose(n, frames, { center, radius: 2 }) });
  assert.equal(host.renderer.gl.renders - before, frames + 1, 'one extra draw');
  assert.deepEqual(warmSeen, seen.map((x) => x[1]));
});

test('stills: each shot\'s middle frame, once, in order, scaled to the export rate', () => {
  const seq = { fps: 24, shots: [{ id: 'a', start: 0, end: 48 }, { id: 'b', start: 48, end: 50 }, { id: 'c', start: 50, end: 120 }, { id: 'empty', start: 60, end: 60 }] };
  assert.deepEqual(stillFrames(seq, 120, RATES['24']), [{ shot: 'a', n: 23 }, { shot: 'b', n: 48 }, { shot: 'c', n: 84 }]);
  assert.deepEqual(stillFrames(seq, 60, RATES['24']).map((p) => p.n), [23, 48, 59], 'clamped to the frames exported');
  assert.deepEqual(stillFrames({ ...seq, fps: 48 }, 120, RATES['24']).map((p) => p.n), [11, 24, 42], 'a 48 fps sequence at 24');
  assert.deepEqual(stillFrames({ fps: 24 }, 99, RATES['24']), [{ shot: 'film', n: 49 }]);
});

test('thumbnails: a box filter in integers, any size down', () => {
  const w = 8, h = 4, src = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) src.set([i % w < 4 ? 200 : 0, 10 * (i >> 3), 3, 255], i * 4);
  assert.deepEqual([...boxDown(src, w, h, 2, 1)], [200, 15, 3, 255, 0, 15, 3, 255], 'the left box red, the right not; green the mean of 0..30');
  assert.deepEqual([...boxDown(new Uint8ClampedArray([1, 0, 0, 0, 2, 0, 0, 0]), 2, 1, 1, 1)], [2, 0, 0, 0], 'the mean rounds half up: 1.5 → 2');
  assert.equal(boxDown(new Uint8ClampedArray(1920 * 1080 * 4), 1920, 1080, 480, 270).length, 480 * 270 * 4);
  assert.equal(boxDown(new Uint8ClampedArray(7 * 5 * 4), 7, 5, 3, 2).length, 24, 'uneven boxes');
  assert.throws(() => boxDown(src, w, h, 16, 4), /smaller/);
});

test('the orbit starts in front, turns once, and the fit distance frames a person', () => {
  const p0 = orbitPose(0, 4, { center: [1, 1, 1], radius: 2, height: 0.5 });
  assert.deepEqual(p0, { position: [1, 1.5, 3], target: [1, 1, 1] });
  const p1 = orbitPose(1, 4, { center: [0, 0, 0], radius: 2 });
  assert.ok(Math.abs(p1.position[0] - 2) < 1e-12 && Math.abs(p1.position[2]) < 1e-12, 'a quarter turn to +X');
  const d = fitDistance(1.7, 0.6, 30, 16 / 9);
  assert.ok(d > 3.5 && d < 4.5, `a 1.7 m person in a 30° lens: ${d.toFixed(2)} m`);
});

test('a delivery\'s files sit in one folder, named after it', () => {
  const f = deliveryFiles({ base: 'The Order 4K/ProRes', ext: 'mov', stills: [{ shot: 'sh-1' }], turntables: ['mira'], subtitles: true });
  assert.equal(slug('The Order 4K/ProRes'), 'The-Order-4K-ProRes');
  assert.deepEqual(f, {
    dir: 'deliveries/The-Order-4K-ProRes', film: 'deliveries/The-Order-4K-ProRes/The-Order-4K-ProRes.mov', subtitles: 'deliveries/The-Order-4K-ProRes/The-Order-4K-ProRes.srt',
    stills: ['deliveries/The-Order-4K-ProRes/stills/The-Order-4K-ProRes-sh-1.png'], thumbnails: ['deliveries/The-Order-4K-ProRes/thumbnails/The-Order-4K-ProRes-sh-1.png'],
    turntables: ['deliveries/The-Order-4K-ProRes/turntables/The-Order-4K-ProRes-mira.mov'], manifest: 'deliveries/The-Order-4K-ProRes/delivery.json',
  });
});
