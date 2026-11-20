// M4 W2 (AB-T-0574) in Node: the WebGPU readback against a stand-in device that keeps WebGPU's rules (copies padded to
// 256-byte rows, a buffer readable only between mapAsync and unmap, copies landing when submitted). Row order (top-down,
// padding stripped, toImageRGBA not flipping it again, the same image as WebGL's bottom-up rows), the ring of 3 (each
// frame taken from its own buffer a frame later, a full slot refused), one output target per size kept, and exportTake
// and captureStill on a WebGPU host. Real WebGPU: the playground's ?mode=w2 in Chromium and WKWebView.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { installCameras } from '@vrmxg/camera';
import { RenderHost } from '@vrmxg/render';
import { GPUReadback, Readback, readbackFor, toImageRGBA, exportTake, captureStill, hashSink } from '@vrmxg/export';

installPortableMath();

/** The image every stand-in draws for frame `f`: pixel (x, y), y from the top, is [x, y, f, 255 − x]. */
const pixel = (x, y, f) => [x & 255, y & 255, f & 255, (255 - x) & 255];

/** three's WebGPURenderer and a GPUDevice, as far as the readback and the host touch them. */
function fakeGPU() {
  const log = { buffers: [], submits: 0, outputs: [] };
  const data = new Map(); // three's backend data: texture → { texture }
  const device = {
    createBuffer({ size, usage }) {
      const b = { size, usage, bytes: new Uint8Array(size), state: 'unmapped', destroyed: false,
        mapAsync(mode) {
          assert.equal(mode, 1, 'GPUMapMode.READ');
          assert.equal(b.state, 'unmapped', 'mapAsync on a buffer that is already mapped or mapping');
          b.state = 'pending';
          return Promise.resolve().then(() => { if (b.destroyed) throw new Error('destroyed'); b.state = 'mapped'; });
        },
        getMappedRange() { assert.equal(b.state, 'mapped', 'getMappedRange outside a map'); return b.bytes.buffer; },
        unmap() { b.state = 'unmapped'; },
        destroy() { b.destroyed = true; },
      };
      log.buffers.push(b);
      return b;
    },
    createCommandEncoder() {
      const ops = [];
      return { copyTextureToBuffer: (src, dst, size) => ops.push({ src, dst, size }), finish: () => ops };
    },
    queue: {
      submit(list) {
        log.submits++;
        for (const ops of list) for (const { src, dst, size: [w, h] } of ops) {
          assert.equal(dst.bytesPerRow % 256, 0, 'bytesPerRow is a multiple of 256');
          assert.equal(dst.buffer.state, 'unmapped', 'a copy into a mapped buffer');
          const ox = src.origin?.x ?? 0, oy = src.origin?.y ?? 0, tw = src.texture.width;
          dst.buffer.bytes.fill(0xee); // the padding shows if it isn't stripped
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) dst.buffer.bytes.set(src.texture.pixels.subarray(((y + oy) * tw + x + ox) * 4, ((y + oy) * tw + x + ox) * 4 + 4), y * dst.bytesPerRow + x * 4);
        }
      },
    },
  };
  let canvas = { pixels: null, width: 0, height: 0 }, frame = 0;
  const renderer = {
    isWebGPURenderer: true, _initialized: true, backend: { isWebGPUBackend: true, device, get: (t) => data.get(t) },
    _nodes: { nodeFrame: { frameId: 0, update() { this.frameId++; } } },
    shadowMap: { enabled: false }, ratio: 1, size: [0, 0], out: null, log, device,
    setPixelRatio(r) { this.ratio = r; }, getPixelRatio() { return this.ratio; },
    setSize(w, h) { this.size = [w, h]; },
    getDrawingBufferSize(v) { return v.set(this.size[0] * this.ratio, this.size[1] * this.ratio); },
    initRenderTarget(rt) {
      log.targets = (log.targets ?? 0) + 1;
      const tex = { pixels: new Uint8Array(rt.width * rt.height * 4), width: rt.width, height: rt.height, dead: renderer.secondTargetsDead && log.targets > 1 };
      data.set(rt.texture, { texture: tex });
      rt.addEventListener?.('resize', () => {});
    },
    setOutputRenderTarget(rt) { this.out = rt; log.outputs.push(rt ? `${rt.width}x${rt.height}` : 'canvas'); },
    getOutputRenderTarget() { return this.out; },
    /**
     * Draws frame n's image (n counts renders) into the output target, or the canvas; the readback's probe scene draws
     * white without counting. A target resized since its texture was made gets a texture of the new size. A "dead"
     * target (secondTargetsDead: r187's second output target) receives nothing.
     */
    render(scene) {
      const probe = scene?.name === 'readback-probe';
      if (!probe) frame++;
      const [w, h] = this.out ? [this.out.width, this.out.height] : [this.size[0] * this.ratio, this.size[1] * this.ratio];
      if (!this.out && canvas.pixels?.length !== w * h * 4) canvas = { pixels: new Uint8Array(w * h * 4), width: w, height: h };
      let t = canvas;
      if (this.out) {
        t = data.get(this.out.texture).texture;
        if (t.width !== w || t.height !== h) Object.assign(t, { pixels: new Uint8Array(w * h * 4), width: w, height: h });
        if (t.dead) return;
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t.pixels.set(probe ? [255, 255, 255, 255] : pixel(x, y, frame), (y * w + x) * 4);
      if (!probe) this.lastFrame = frame;
    },
    dispose() {},
  };
  return renderer;
}

const image = (w, h, f) => { const o = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.set(pixel(x, y, f), (y * w + x) * 4); return o; };

test('row order: top-down, row padding stripped, toImageRGBA leaves the rows where they are; the same image as WebGL\'s bottom-up rows', async () => {
  const r = fakeGPU(), w = 10, h = 4; // 40 bytes a row: padded to 256 in the copy
  const rb = new GPUReadback(r, w, h);
  assert.equal(rb.topDown, true);
  assert.equal(rb.bytesPerRow, 256);
  await rb.draw(() => r.render());
  const out = await rb.readNow(new Uint8Array(w * h * 4));
  assert.deepEqual(out, image(w, h, 1), 'row 0 is the top row, and no padding bytes');
  const rgba = toImageRGBA(out, w, h, { topDown: rb.topDown });
  assert.deepEqual([...rgba.subarray(0, 4)], pixel(0, 0, 1), 'not flipped again');
  assert.deepEqual([...rgba.subarray((h - 1) * w * 4, (h - 1) * w * 4 + 4)], pixel(0, h - 1, 1));
  // WebGL: readPixels gives the same picture with row 0 at the bottom; toImageRGBA flips it to the same image
  const gl = { RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, readPixels(x, y, rw, rh, f, t, o) { for (let row = 0; row < rh; row++) o.set(image(w, h, 1).subarray((rh - 1 - row) * w * 4, (rh - row) * w * 4), row * w * 4); } };
  const glb = new Readback(/** @type {any} */ (gl), w, h);
  assert.equal(glb.topDown, false);
  const bottomUp = glb.readNow(new Uint8Array(w * h * 4));
  assert.notDeepEqual(bottomUp, out, 'WebGL\'s rows are the other way up');
  assert.deepEqual(toImageRGBA(bottomUp, w, h), rgba, 'and come out as the same image');
  // straight alpha: a premultiplied half-transparent pixel is divided out the same way on both
  const pm = new Uint8Array([64, 32, 0, 128]);
  assert.deepEqual([...toImageRGBA(pm, 1, 1, { topDown: true })], [128, 64, 0, 128]);
  assert.deepEqual([...toImageRGBA(pm, 1, 1)], [128, 64, 0, 128]);
});

test('draw() renders into the output target as if to the canvas, and puts the previous output back even when the draw throws', async () => {
  const r = fakeGPU(), rb = new GPUReadback(r, 4, 2);
  await rb.draw(() => r.render());
  await assert.rejects(rb.draw(() => { throw new Error('boom'); }), /boom/);
  assert.deepEqual(r.log.outputs, ['4x2', 'canvas', '4x2', 'canvas', '4x2', 'canvas'], 'the probe once, then each draw');
  assert.equal(r.out, null);
  assert.equal(await rb.draw(async () => 7), 7, 'the draw\'s own result comes back (frameAt\'s)');
});

test('the ring of 3: frame n is read into slot n % 3 and taken a frame later from its own buffer; a full slot or an empty take is refused', async () => {
  const r = fakeGPU(), w = 64, h = 2, rb = new GPUReadback(r, w, h); // 256 bytes a row: no padding
  const out = new Uint8Array(w * h * 4), got = [];
  for (let n = 0; n < 7; n++) {
    await rb.draw(() => r.render()); // frame n + 1's image
    rb.read(n % 3);
    if (n >= 1) { await rb.take((n - 1) % 3, out); got.push(out[2]); assert.deepEqual(out, image(w, h, n)); }
  }
  await rb.take(6 % 3, out); got.push(out[2]);
  assert.deepEqual(got, [1, 2, 3, 4, 5, 6, 7], 'every frame, in order, none overwritten by a later one');
  const ringBufs = () => r.log.buffers.filter((b) => b.size === 256 * h); // the probe's are 256 bytes
  assert.equal(ringBufs().length, 3, 'three map buffers, made once and reused');
  assert.ok(ringBufs().every((b) => b.usage === (0x0001 | 0x0008) && b.state === 'unmapped'));
  // two frames outstanding (lag 2) still fit; a third read into a slot nobody took is refused
  await rb.draw(() => r.render()); rb.read(0);
  await rb.draw(() => r.render()); rb.read(1);
  await rb.draw(() => r.render()); rb.read(2);
  assert.throws(() => rb.read(0), /slot 0 still holds a frame nobody took/);
  assert.throws(() => rb.read(3), /outside the ring of 3/);
  for (const s of [0, 1, 2]) await rb.take(s, out);
  await assert.rejects(rb.take(1, out), /no frame to take/);
  // release frees the buffers and keeps the target; the next read makes them again
  const target = rb.target;
  rb.release();
  assert.ok(ringBufs().every((b) => b.destroyed));
  await rb.draw(() => r.render());
  assert.deepEqual(await rb.readNow(out), image(w, h, r.lastFrame));
  assert.equal(rb.target, target);
  assert.equal(ringBufs().length, 4);
});

test('readbackFor: one WebGPU readback per renderer, its one output target resized for each size; WebGL gets a new pixel-pack one', async () => {
  const r = fakeGPU(), r2 = fakeGPU();
  const host = { renderer: r }, other = { renderer: r2 };
  const a = readbackFor(host, 1920, 1080);
  assert.ok(a instanceof GPUReadback);
  const target = a.target;
  assert.equal(readbackFor(host, 640, 360), a, 'another size: the same readback');
  assert.equal(a.target, target, 'and the same target, resized (r187 draws nothing into a second output target)');
  assert.deepEqual([a.target.width, a.target.height, a.width, a.height, a.bytesPerRow], [640, 360, 640, 360, 2560]);
  assert.equal(r.log.targets, 1, 'one target ever made on this renderer');
  assert.notEqual(readbackFor(other, 1920, 1080), a, 'another renderer, its own');
  // a still at one size, then frames at another, on the same renderer: both have their content (the reviewer's case)
  const s1 = readbackFor(host, 16, 8); await s1.draw(() => r.render());
  assert.deepEqual(await s1.readNow(new Uint8Array(16 * 8 * 4)), image(16, 8, r.lastFrame));
  const s2 = readbackFor(host, 70, 4); await s2.draw(() => r.render()); // 280 bytes a row: padded
  assert.deepEqual(await s2.readNow(new Uint8Array(70 * 4 * 4)), image(70, 4, r.lastFrame));
  const gl = { getContext: () => ({}) };
  const g = readbackFor({ renderer: gl }, 8, 8);
  assert.ok(g instanceof Readback && g.ring === Infinity && g.topDown === false);
  assert.notEqual(readbackFor({ renderer: gl }, 8, 8), g);
});

test('a target that receives no output draw (r187\'s second output target) throws at the probe instead of reading empty frames', async () => {
  const r = fakeGPU();
  r.secondTargetsDead = true;
  const first = new GPUReadback(r, 8, 4);
  await first.draw(() => r.render());
  assert.deepEqual(await first.readNow(new Uint8Array(8 * 4 * 4)), image(8, 4, 1), 'the first target draws');
  const second = new GPUReadback(r, 8, 4);
  await assert.rejects(second.draw(() => r.render()), /received no output draw .*readbackFor keeps one per renderer/);
  first.setSize(12, 6);
  assert.equal(first.verified, false, 'a resized target is probed again');
  await first.draw(() => r.render());
  assert.deepEqual(await first.readNow(new Uint8Array(12 * 6 * 4)), image(12, 6, r.lastFrame), 'and still draws at the new size');
});

test('the ring under cancellation and stills: release() mid-map rejects only the take; a slot being taken is not free; a failed copy still unmaps', async () => {
  const r = fakeGPU(), rb = new GPUReadback(r, 64, 2), out = new Uint8Array(64 * 2 * 4);
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  try {
    await rb.draw(() => r.render()); rb.read(0); rb.read(1);
    assert.throws(() => rb.setSize(32, 2), /can't change size .* while it holds frames/);
    const taking = rb.take(0, out); // in flight: slot 0 isn't free until it is unmapped
    const still = rb.readNow(new Uint8Array(64 * 2 * 4)); // a still while the export's take waits
    assert.equal(rb.slots[2].state, 'taking', 'readNow took slot 2, not the slot being taken');
    await taking; await still;
    rb.release(); // slot 1's map is pending (a cancelled export)
    await new Promise((res) => setTimeout(res, 10));
    assert.deepEqual(unhandled, [], 'no unhandled rejection (a page error in the browser)');
    // a copy that throws (the wrong size of `out`) still unmaps and frees the slot
    await rb.draw(() => r.render()); rb.read(0);
    await assert.rejects(rb.take(0, new Uint8Array(4)));
    assert.equal(rb.slots[0].state, 'idle');
    assert.equal(rb.slots[0].buf.state, 'unmapped');
    // and a pending map cut short by release() reaches its take as an error
    rb.read(0); const t = rb.take(0, out); rb.release();
    await assert.rejects(t, /destroyed/);
  } finally { process.off('unhandledRejection', onUnhandled); }
});

class Mover extends Behaviour { physicsProcess(dt) { this.node.object3d.position.x += 3 * dt; } }
function world() {
  const tree = new SceneTree({ registry: m0Registry(), behaviours: new Map([['mover', Mover]]), seed: 1 });
  installCameras(tree);
  tree.instantiate({ format: 'vrmxs', version: 1, id: 'w2', nodes: [
    { id: 'root', type: 'Node3D' },
    { id: 'box', type: 'Node3D', parent: 'root', behaviours: [{ use: 'mover' }] },
    { id: 'cam', type: 'Camera', parent: 'root', transform: { p: [0, 1, 5] } },
  ] });
  return tree;
}
/** three/webgpu as far as the host's room environment needs it. */
const webgpu = { PMREMGenerator: class { fromScene() { return { texture: { dispose() {} } }; } dispose() {} } };
const gpuHost = (r) => new RenderHost({ renderer: r, dprCap: 1, webgpu, mtoonMaterial: class {} });

test('exportTake on WebGPU: every frame drawn into the output target, taken through the ring in order, the sink told the rows are top-down', async () => {
  const r = fakeGPU(), host = gpuHost(r), tree = world();
  const frames = [], sink = { ...hashSink(), begin(job) { sink.job = job; return { id: 'g' }; }, frame(n, bytes) { frames.push({ n, f: bytes[2], top: bytes[1], bottom: bytes[(18 - 1) * 32 * 4 + 1] }); } };
  const res = await exportTake({ tree, host, fps: 30, frames: 12, width: 32, height: 18, sink, audio: false, lag: 2 });
  assert.equal(sink.job.topDown, true);
  assert.equal(res.backend, 'webgpu');
  assert.deepEqual(frames.map((x) => x.n), [...Array(12).keys()], 'frames reach the sink in order');
  assert.deepEqual(frames.map((x) => x.f), [...Array(12).keys()].map((n) => n + 1), 'each frame is its own render');
  assert.ok(frames.every((x) => x.top === 0 && x.bottom === 17), 'row 0 at the top');
  const ring = r.log.buffers.filter((b) => b.size === 256 * 18); // 32 × 4 bytes a row, padded to 256; the probe's are 256
  assert.equal(ring.length, 3, 'the ring of 3');
  assert.ok(r.log.buffers.every((b) => b.destroyed), 'released at the end');
  assert.equal(r.out, null, 'the canvas is the output again');
  assert.equal(r._nodes.nodeFrame.frameId, 12, 'a node frame per offline frame');
  await assert.rejects(exportTake({ tree: world(), host: gpuHost(fakeGPU()), fps: 30, frames: 2, width: 32, height: 18, sink: hashSink(), audio: false, lag: 3 }), /lag 3 needs 4 readback slots; this backend's ring has 3/);
});

test('captureStill on WebGPU: the frame at the still\'s size, the right way up, and the view put back', async () => {
  const r = fakeGPU(), host = gpuHost(r), tree = world();
  host.attach(tree);
  r.setPixelRatio(2); host.resize(100, 50);
  const still = await captureStill(host, { width: 16, height: 8 });
  assert.equal(still.rgba.length, 16 * 8 * 4);
  assert.deepEqual([...still.rgba.subarray(0, 4)], pixel(0, 0, 1), 'top-left first');
  assert.deepEqual([...still.rgba.subarray(7 * 16 * 4, 7 * 16 * 4 + 4)], pixel(0, 7, 1), 'bottom row last');
  assert.deepEqual(r.size, [100, 50], 'the view\'s size is back');
  assert.equal(r.getPixelRatio(), 2);
  assert.equal(r.lastFrame, 2, 'and redrawn there');
  assert.equal(r.out, null);
});
