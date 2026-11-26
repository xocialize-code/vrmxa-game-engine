// M6 W6 (AB-T-0639) in Node: a lost device. The host notices it (GPUDevice.lost for any reason, destroy() included;
// three's onDeviceLost; a lost WebGL context; the first draw that throws for it), stops drawing and says so once, and a
// draw that throws never leaves the interpolated pose in the simulated transforms. RenderHost.replace makes a host in
// its place (WebGPU again, else three's WebGL2 backend) with the same tree, and the world steps on as if nothing
// happened. Node has no WebGPU: the renderer is a stand-in for three/webgpu's. The real thing, device.destroy() in
// Chromium mid-session with the game app's per-step hashes against an unbroken run, is acceptance/m6/device-loss.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { installCameras } from '@vrmxg/camera';
import { RenderHost } from '@vrmxg/render';

installPortableMath();

/**
 * A stand-in three/webgpu whose renderers have a device that can be lost. `fallsBack(id, opts)`: renderer `id` lands on
 * three's WebGL2 backend in init() (forceWebGL always does). `renderers` lists every one made.
 */
function fakeWebGPU({ fallsBack = (id, opts) => !!opts.forceWebGL } = {}) {
  const renderers = [];
  class NodeFrame { constructor() { this.frameId = 0; } update() { this.frameId++; } }
  class WebGPURenderer {
    constructor(opts = {}) {
      this.isWebGPURenderer = true; this.opts = opts; this._initialized = false; this._nodes = null; this.domElement = opts.canvas ?? null;
      this.shadowMap = { enabled: false }; this.size = [300, 150]; this.pixelRatio = 1; this.drawn = 0; this.id = renderers.length; this.throwOnDraw = null;
      this.onDeviceLost = (info) => { this._isDeviceLost = true; this.saidLost = info; }; // three's default, roughly
      renderers.push(this);
    }
    async init() {
      this._nodes = { nodeFrame: new NodeFrame() }; this._initialized = true;
      if (fallsBack(this.id, this.opts)) this.backend = { isWebGLBackend: true };
      else {
        let lose; const lost = new Promise((r) => { lose = r; });
        this.backend = { isWebGPUBackend: true, device: { lost, destroy: () => lose({ reason: 'destroyed', message: 'Device was destroyed.' }), loseFor: (message) => lose({ reason: 'unknown', message }) } };
      }
      return this;
    }
    setPixelRatio(r) { this.pixelRatio = r; }
    setSize(w, h) { this.size = [w, h]; }
    getDrawingBufferSize(v) { return v.set(this.size[0], this.size[1]); }
    render(scene, camera) { if (this.throwOnDraw) throw new Error(this.throwOnDraw); scene.updateMatrixWorld(); camera.updateMatrixWorld?.(); this.drawn++; }
    async dispose() { this.disposed = true; if (this.throwOnDraw) throw new Error('dispose on a dead device'); }
  }
  class PMREMGenerator { constructor() {} fromScene() { return { texture: { isTexture: true, dispose() {} }, dispose() {} }; } dispose() {} }
  return { renderers, module: { WebGPURenderer, PMREMGenerator } };
}
const gpuNavigator = () => ({ gpu: { requestAdapter: async () => ({}) } });
const flush = () => new Promise((r) => setTimeout(r, 0));

// A world that moves every step (so a blend at α changes what is drawn), and a camera to draw it from.
class Drift extends Behaviour { physicsProcess(dt) { const p = this.node.object3d.position; p.x += 0.5 * dt; p.z += this.rng.range(-0.01, 0.01); } }
function movingTree() {
  const tree = new SceneTree({ registry: m0Registry(), behaviours: new Map([['drift', Drift]]), seed: 3 });
  installCameras(tree);
  tree.instantiate({ format: 'vrmxs', version: 1, id: 'loss', nodes: [
    { id: 'root', type: 'Node3D' }, { id: 'cam', type: 'Camera', parent: 'root', transform: { p: [0, 1.5, 4] } },
    { id: 'box', type: 'Node3D', parent: 'root', behaviours: [{ use: 'drift' }] },
  ] });
  return tree;
}
// display times that land between steps, so most frames blend at α < 1
const DTS = Array.from({ length: 120 }, (_, i) => [0.021, 0.013, 0.017, 0.029][i % 4]);
/** Drive frames over `tree` through whichever host `hostOf()` gives; → the state hash after every step. */
function playFrames(tree, hostOf, dts, { onFrame = () => {} } = {}) {
  const hashes = [];
  dts.forEach((dt, i) => { onFrame(i); const h = hostOf(); if (!h || h.lost) return; h.frame(dt, () => hashes.push(tree.stateHash())); });
  return hashes;
}

test('a draw that throws for a lost device: no throw at the frame loop, said once, and the simulated pose is put back', async () => {
  const { module } = fakeWebGPU();
  const unbroken = movingTree(), host0 = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module, canvas: { id: 'a' } });
  host0.attach(unbroken);
  const want = playFrames(unbroken, () => host0, DTS);

  const tree = movingTree(), host = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module, canvas: { id: 'b' } });
  host.attach(tree);
  const said = [];
  host.onLost = (l) => said.push(l);
  let current = host;
  const got = playFrames(tree, () => current, DTS.slice(0, 40), { onFrame: (i) => { if (i === 30) host.renderer.throwOnDraw = 'GPUDevice.createCommandEncoder: Unable to make command encoder.'; } });
  assert.equal(said.length, 1, 'said once');
  assert.deepEqual([said[0].api, said[0].reason, said[0].message], ['WebGPU', 'draw failed', 'GPUDevice.createCommandEncoder: Unable to make command encoder.']);
  assert.ok(host.lost && host.renderer.drawn === 30, 'nothing drawn from the failing frame on');
  // a host in its place steps on: the steps after the failed draw hash as the unbroken run's, so the blend written in
  // for that draw was taken back out of the simulated transforms
  current = await RenderHost.replace(host, { canvas: { id: 'c' } });
  got.push(...playFrames(tree, () => current, DTS.slice(40)));
  assert.ok(got.length > 50);
  assert.deepEqual(got, want.slice(0, got.length), 'every step hashes as the unbroken run\'s');
  host.render(0.5); // a lost host draws nothing and doesn't throw
  // another error from the draw is not a loss: it is thrown, as before
  const other = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module, canvas: {} });
  other.attach(movingTree()); other.renderer.throwOnDraw = 'material.foo is not a function';
  assert.throws(() => other.render(1), /material\.foo/);
  assert.equal(other.lost, null);
});

test('GPUDevice.lost for any reason (destroy() too, which three ignores) and three\'s onDeviceLost mark the host lost; its own dispose doesn\'t', async () => {
  const { module } = fakeWebGPU();
  const make = () => RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module, canvas: {} });
  const a = await make(), seen = [];
  a.onLost = (l) => seen.push(['a', l.reason]);
  a.renderer.backend.device.destroy(); await flush();
  const b = await make();
  b.onLost = (l) => seen.push(['b', l.reason]);
  b.renderer.onDeviceLost({ api: 'WebGPU', message: 'GPU process gone', reason: 'unknown' });
  b.renderer.backend.device.loseFor('again'); await flush();
  assert.equal(b.renderer.saidLost.message, 'GPU process gone', 'three\'s own callback still runs');
  const c = await make();
  c.onLost = (l) => seen.push(['c', l.reason]);
  c.dispose(); c.renderer.backend.device.destroy(); await flush();
  assert.deepEqual(seen, [['a', 'destroyed'], ['b', 'unknown']], 'once each; a disposed host\'s device going is no loss');
  // WebGL: a lost context
  const listeners = {}, canvas = { addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: (t) => { delete listeners[t]; } };
  const gl = new RenderHost({ renderer: { isWebGLRenderer: true, domElement: canvas, setPixelRatio() {}, shadowMap: {}, render() {}, dispose() {}, getContext: () => ({ drawingBufferWidth: 1, drawingBufferHeight: 1 }) } });
  gl.onLost = (l) => seen.push(['gl', l.reason]);
  listeners.webglcontextlost();
  assert.deepEqual(seen.at(-1), ['gl', 'context lost']);
  assert.deepEqual(RenderHost.recoveryOrder('webgl'), ['webgl']);
  assert.deepEqual(RenderHost.recoveryOrder('webgpu'), ['webgpu', 'webgl-fallback']);
});

test('RenderHost.replace: WebGPU again on a fresh canvas with the same tree, camera and overlays, and play goes on from the same step', async () => {
  const { module, renderers } = fakeWebGPU();
  const unbroken = movingTree(), ref = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module, canvas: {} });
  ref.attach(unbroken);
  const want = playFrames(unbroken, () => ref, DTS);

  const tree = movingTree(), post = (renderer) => ({ renderer, active: false, setSize() {}, configure() {}, dispose() {} });
  const first = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module, canvas: { id: 'old' }, post, dprCap: 1.5 });
  first.attach(tree);
  const camera = { isPerspectiveCamera: false, updateMatrixWorld() {} };
  const overlay = { host: null, updated: 0, attach(h) { this.host = h; h.overlays.push(this); }, detach() { this.host.overlays = this.host.overlays.filter((o) => o !== this); this.host = null; }, update() { this.updated++; } };
  overlay.attach(first); first.layout = null; first.interpolate = true; first.camera = camera;
  let host = first, replacing = null;
  first.onLost = () => { replacing = RenderHost.replace(first, { canvas: { id: 'fresh' } }); };
  const got = [];
  for (const [i, dt] of DTS.entries()) {
    if (i === 50) first.renderer.backend.device.destroy();
    await flush();
    if (replacing) { host = await replacing; replacing = null; }
    if (host.lost) continue;
    host.frame(dt, () => got.push(tree.stateHash()));
  }
  assert.notEqual(host, first);
  assert.equal(host.backend, 'webgpu');
  assert.equal(host.renderer.opts.canvas.id, 'fresh', 'on the fresh canvas');
  assert.equal(host.tree, tree, 'the same tree');
  assert.ok(host.post?.renderer === host.renderer, 'its own post stack, made by the same factory');
  assert.deepEqual([overlay.host, host.overlays.includes(overlay), first.overlays.length], [host, true, 0], 'the overlay moved over');
  assert.equal(host._options.dprCap, 1.5);
  assert.equal(host.camera, camera, 'the camera override moved over');
  assert.ok(first.renderer.disposed, 'the lost renderer was let go');
  assert.deepEqual(host.replaced, { from: 'webgpu', lost: first.lost, tried: [] });
  assert.ok(renderers.at(-1).drawn > 0, 'and it draws');
  // the steps skipped while the host was being replaced aren't lost: the clock only advances in frame()
  assert.deepEqual(got, want.slice(0, got.length), 'every step hashes as the unbroken run\'s');
  assert.ok(got.length > 60, `${got.length} steps, past the loss at frame 50`);
});

test('RenderHost.replace falls back to three\'s WebGL2 backend (node materials still draw) when WebGPU can\'t be had; throws when nothing can', async () => {
  let lostWebGPU = false;
  const { module } = fakeWebGPU({ fallsBack: (id, opts) => !!opts.forceWebGL || lostWebGPU });
  const tree = movingTree();
  const first = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module, canvas: {} });
  first.attach(tree);
  tree.run(10);
  lostWebGPU = true; first.renderer.backend.device.loseFor('GPU process gone'); await flush();
  const host = await RenderHost.replace(first, { canvas: { id: 'fresh' } });
  assert.equal(host.backend, 'webgl-fallback');
  assert.equal(host.renderer.opts.forceWebGL, true);
  assert.equal(host.mtoonMaterial?.name, 'MToonNodeMaterial', 'the world\'s node materials draw on it');
  assert.match(host.replaced.tried[0], /^webgpu: renderer=webgpu: the view's renderer got three's WebGL2 fallback/);
  assert.equal(host.tree, tree);
  host.render(1);
  assert.equal(host.renderer.drawn, 1);
  assert.equal(tree.clock.step, 10, 'replacing the host didn\'t step the world');
  // nothing works: the error names each backend's failure, and the tree is left as it was
  const broken = { module: { ...module, WebGPURenderer: class extends module.WebGPURenderer { async init() { throw new Error('no adapter'); } } } };
  lostWebGPU = false;
  const third = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module, canvas: {} });
  const t2 = movingTree(); third.attach(t2);
  await assert.rejects(RenderHost.replace(third, { canvas: {}, webgpu: broken.module }), /the renderer couldn't be made again \(webgpu: .*; webgl-fallback: no adapter\)/);
  assert.equal(t2.renderHost, null, 'detached: no host draws it until the app tries again');
  // and the app's later try (WebKit's GPU process back) carries the tree and the overlays the failed one took
  const ov = { host: null, attach(h) { this.host = h; h.overlays.push(this); }, detach() { this.host.overlays = this.host.overlays.filter((o) => o !== this); this.host = null; }, update() {} };
  const fourth = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module, canvas: {} });
  const t3 = movingTree(); fourth.attach(t3); ov.attach(fourth); fourth.renderer.backend.device.loseFor('x'); await flush();
  await assert.rejects(RenderHost.replace(fourth, { canvas: {}, webgpu: broken.module }));
  const back = await RenderHost.replace(fourth, { canvas: { id: 'later' } });
  assert.deepEqual([back.tree === t3, ov.host === back, back.backend], [true, true, 'webgpu'], 'the second try has the tree and the overlay');
  // a host that never had the WebGL fallback refuses a WebGPURenderer on WebGL2 still
  const gl2 = new module.WebGPURenderer({ forceWebGL: true }); await gl2.init();
  assert.throws(() => new RenderHost({ renderer: gl2, webgpu: module, mtoonMaterial: {} }), /fell back to its WebGL2 backend/);
});

test('a device lost while RenderHost.replace is still making the host (inside the post factory): its onLost, set after, fires at once', async () => {
  const { module, renderers } = fakeWebGPU();
  const loseIn = new Set();
  // the post stack is made after the renderer: the second one's device goes right there, before replace has returned
  const post = (renderer) => { if (loseIn.has(renderer.id)) renderer.backend.device.loseFor('lost while the post stack was made'); return { renderer, active: false, setSize() {}, configure() {}, dispose() {} }; };
  const first = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module, canvas: {}, post });
  const tree = movingTree(); first.attach(tree);
  first.renderer.backend.device.loseFor('first'); await flush();
  loseIn.add(renderers.length); // the next renderer made: the replacement
  const second = await RenderHost.replace(first, { canvas: { id: 'fresh' } });
  await flush();
  assert.ok(second.lost, 'the replacement lost its device before anyone listened');
  assert.equal(second.lost.message, 'lost while the post stack was made');
  const said = [];
  second.onLost = (l) => said.push(l.message); // as an app sets it once replace has resolved
  assert.deepEqual(said, ['lost while the post stack was made'], 'said at once, not never');
  second.onLost = (l) => said.push(`again: ${l.message}`);
  assert.equal(said.length, 1, 'once: a handler set again isn\'t told twice');
  // and the app's answer to it works: a third host draws the same tree
  const third = await RenderHost.replace(second, { canvas: { id: 'third' } });
  assert.equal(third.tree, tree);
  third.render(1);
  assert.ok(third.renderer.drawn > 0 && !third.lost);
  // a host set up before its loss says it through the handler as before, once
  const seen = [];
  third.onLost = (l) => seen.push(l.message);
  third.renderer.backend.device.loseFor('later'); await flush();
  assert.deepEqual(seen, ['later']);
});
