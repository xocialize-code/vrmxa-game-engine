// M4 W0 (AB-T-0572) in Node: the backend choice, the query switch, and one test per WebGPU gotcha W0 covers
// (AB-T-0554's gotcha 1, the node frame per offline frame, and gotcha 6, the warm-up renderer), plus the room
// environment's PMREM, the drawing-buffer size and the three-vrm patch. Node has no WebGPU, so the renderer is a
// stand-in for three/webgpu's that keeps the parts the host touches; the canary tests read three r187 itself, so a
// three upgrade that moves what the workarounds lean on fails here. Real WebGPU: the playground (apps/playground,
// ?renderer=webgpu) in Chromium and WKWebView.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { installCameras } from '@vrmxg/camera';
import { RenderHost, backendFromQuery, resolveBackend, webgpuAvailable, warmUpWebGPU } from '@vrmxg/render';

installPortableMath();

/**
 * A stand-in three/webgpu: WebGPURenderer with what the host touches, PMREMGenerator; every construction logged.
 * `fallsBack(id)`: renderer `id` lands on three's WebGL2 fallback in init(); `initThrows(id)`: its init() rejects.
 */
function fakeWebGPU({ fallsBack = (id) => false, initThrows = (id) => false } = {}) {
  const log = [];
  class NodeFrame { constructor() { this.frameId = 0; } update() { this.frameId++; } }
  class WebGPURenderer {
    constructor(opts = {}) {
      this.isWebGPURenderer = true; this.opts = opts; this._initialized = false; this._nodes = null;
      this.shadowMap = { enabled: false }; this.toneMapping = 0; this.toneMappingExposure = 1;
      this.size = [300, 150]; this.pixelRatio = 1; this.drawn = []; this.id = log.filter((e) => e.startsWith('renderer')).length;
      log.push(`renderer ${this.id}${opts.canvas ? ' (canvas)' : ''}`);
    }
    async init() {
      if (initThrows(this.id)) { log.push(`init ${this.id} failed`); throw new Error('device lost'); }
      this._nodes = { nodeFrame: new NodeFrame() }; this._initialized = true;
      this.backend = fallsBack(this.id) ? { isWebGLBackend: true } : { isWebGPUBackend: true };
      log.push(`init ${this.id}${fallsBack(this.id) ? ' (WebGL2 fallback)' : ''}`); return this;
    }
    setPixelRatio(r) { this.pixelRatio = r; }
    setSize(w, h) { this.size = [w, h]; }
    getDrawingBufferSize(v) { return v.set(Math.floor(this.size[0] * this.pixelRatio), Math.floor(this.size[1] * this.pixelRatio)); }
    render(scene, camera) { scene.updateMatrixWorld(); camera.updateMatrixWorld?.(); this.drawn.push(this._nodes.nodeFrame.frameId); }
    dispose() { this.disposed = true; }
  }
  class PMREMGenerator {
    constructor(renderer) { this.renderer = renderer; log.push(`pmrem ${renderer.id}`); }
    fromScene(scene, sigma) { return { texture: { isTexture: true, pmremOf: this.renderer.id, sigma, dispose() {} } }; }
    dispose() {}
  }
  return { log, module: { WebGPURenderer, PMREMGenerator } };
}

const gpuNavigator = (adapter = {}) => ({ gpu: { requestAdapter: async () => adapter } });
const noGpu = {};

function cafeTree() {
  const tree = new SceneTree({ registry: m0Registry(), seed: 1 });
  installCameras(tree);
  tree.instantiate({
    format: 'vrmxs', version: 1, id: 'w0',
    nodes: [
      { id: 'root', type: 'Node3D' },
      { id: 'env', type: 'Environment', parent: 'root', props: { environment: 'room' } },
      { id: 'sun', type: 'DirectionalLight', parent: 'root', props: { castShadow: true } },
      { id: 'cam', type: 'Camera', parent: 'root', transform: { p: [0, 1.5, 4] } },
    ],
  });
  return tree;
}

// ---------------------------------------------------------------- the backend choice

test('the ?renderer= switch: webgpu, webgl, auto; anything else is the app\'s default (WebGL until M4 W3)', () => {
  assert.equal(backendFromQuery('?renderer=webgpu'), 'webgpu');
  assert.equal(backendFromQuery('?renderer=webgl&x=1'), 'webgl');
  assert.equal(backendFromQuery(new URLSearchParams('renderer=auto')), 'auto');
  assert.equal(backendFromQuery('?renderer=vulkan'), 'webgl');
  assert.equal(backendFromQuery(''), 'webgl');
  assert.equal(backendFromQuery(undefined, 'auto'), 'auto');
});

test('auto takes WebGPU where navigator.gpu gives an adapter, and falls back to WebGL otherwise; a forced webgpu throws without it', async () => {
  assert.equal(await webgpuAvailable(gpuNavigator()), true);
  assert.equal(await webgpuAvailable(gpuNavigator(null)), false, 'navigator.gpu without an adapter');
  assert.equal(await webgpuAvailable({ gpu: { requestAdapter: async () => { throw new Error('lost'); } } }), false);
  assert.equal(await webgpuAvailable(noGpu), false);
  assert.equal(await resolveBackend('auto', { navigator: gpuNavigator() }), 'webgpu');
  assert.equal(await resolveBackend('auto', { navigator: noGpu }), 'webgl');
  assert.equal(await resolveBackend('auto', { navigator: gpuNavigator(null) }), 'webgl');
  assert.equal(await resolveBackend('webgl', { navigator: gpuNavigator() }), 'webgl');
  assert.equal(await resolveBackend('webgpu', { navigator: gpuNavigator() }), 'webgpu');
  await assert.rejects(resolveBackend('webgpu', { navigator: noGpu }), /no WebGPU/);
});

test('RenderHost.create on WebGPU: an initialised WebGPURenderer on the canvas, the patched MToonNodeMaterial for characters', async () => {
  const { module } = fakeWebGPU();
  const canvas = { id: 'view' };
  const host = await RenderHost.create({ backend: 'auto', navigator: gpuNavigator(), webgpu: module, canvas });
  assert.equal(host.backend, 'webgpu');
  assert.equal(host.renderer._initialized, true);
  assert.equal(host.renderer.opts.canvas, canvas);
  assert.equal(host.mtoonMaterial?.name, 'MToonNodeMaterial');
  // M4 W2: particles draw with three.quarks/webgpu's batch renderer (TSL); WebGL hosts keep three.quarks' own
  const quarksGPU = await import('three.quarks/webgpu'), quarksGL = await import('three.quarks');
  assert.equal(host.particleRenderer, quarksGPU.WebGPUBatchedRenderer);
  const gl = new RenderHost({ renderer: { isWebGLRenderer: true, setPixelRatio() {}, shadowMap: {}, render() {}, dispose() {}, getContext: () => ({ drawingBufferWidth: 1, drawingBufferHeight: 1 }) } });
  assert.equal(gl.particleRenderer, quarksGL.BatchedRenderer);
  assert.equal(new RenderHost({ renderer: { setPixelRatio() {}, shadowMap: {}, render() {}, dispose() {} } }).particleRenderer, null, 'a stand-in draws none');
  // a tree's services that draw get the host on attach (the particles service takes particleRenderer from it)
  const tree = cafeTree(), seen = [];
  tree.addService('drawsSomething', { attachHost: (h) => seen.push(h) });
  host.attach(tree); gl.attach(tree);
  assert.deepEqual(seen, [host, gl]);
  // a WebGPURenderer handed over before init() is refused (render() would throw later, far from the cause)
  assert.throws(() => new RenderHost({ renderer: new module.WebGPURenderer() }), /await renderer.init\(\)/);
});

// ---------------------------------------------------------------- three's quiet WebGL2 fallback inside init()

const glStandIn = () => ({ isWebGLRenderer: true, setPixelRatio() {}, setSize() {}, shadowMap: {}, render() {}, dispose() {}, getContext: () => ({ drawingBufferWidth: 1, drawingBufferHeight: 1 }) });

test('WebGPU failing inside the warm-up\'s init(): a forced webgpu throws, auto makes a WebGL host before touching the canvas', async () => {
  const forced = fakeWebGPU({ fallsBack: () => true });
  await assert.rejects(RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: forced.module, canvas: {} }), /the warm-up renderer got three's WebGL2 fallback/);
  assert.deepEqual(forced.log, ['renderer 0', 'init 0 (WebGL2 fallback)', 'pmrem 0'], 'the view\'s renderer was never made');
  const auto = fakeWebGPU({ fallsBack: () => true });
  const host = await RenderHost.create({ backend: 'auto', navigator: gpuNavigator(), webgpu: auto.module, canvas: {}, fallbackRenderer: glStandIn() });
  assert.equal(host.backend, 'webgl');
  assert.equal(host.mtoonMaterial, null, 'characters keep the WebGL MToonMaterial');
  assert.ok(!auto.log.includes('renderer 1 (canvas)'));
});

test('WebGPU failing inside the view renderer\'s init(): a forced webgpu throws, auto falls back to WebGL; the renderer is disposed', async () => {
  const auto = fakeWebGPU({ fallsBack: (id) => id === 1 });
  await warmUpWebGPU({ webgpu: auto.module }); // id 0: WebGPU
  const view = new auto.module.WebGPURenderer(); // id 1: falls back in init()
  const host = await RenderHost.create({ backend: 'auto', navigator: gpuNavigator(), webgpu: auto.module, renderer: view, fallbackRenderer: glStandIn() });
  assert.equal(host.backend, 'webgl');
  assert.equal(view.disposed, true);
  const forced2 = fakeWebGPU({ fallsBack: (id) => id === 1 });
  await warmUpWebGPU({ webgpu: forced2.module });
  await assert.rejects(RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: forced2.module, renderer: new forced2.module.WebGPURenderer() }), /the view's renderer got three's WebGL2 fallback/);
});

test('a host made directly with a WebGPURenderer must have it on WebGPU, with webgpu and mtoonMaterial (no half-working host)', async () => {
  const { module } = fakeWebGPU({ fallsBack: (id) => id === 1 });
  const ok = new module.WebGPURenderer(); await ok.init();
  const gl2 = new module.WebGPURenderer(); await gl2.init();
  assert.throws(() => new RenderHost({ renderer: gl2, webgpu: module, mtoonMaterial: class {} }), /fell back to its WebGL2 backend/);
  assert.throws(() => new RenderHost({ renderer: ok }), /needs `webgpu`/);
  assert.throws(() => new RenderHost({ renderer: ok, webgpu: module }), /`mtoonMaterial`/);
  assert.throws(() => new RenderHost({ renderer: ok, mtoonMaterial: class {} }), /needs `webgpu`/);
  const host = new RenderHost({ renderer: ok, webgpu: module, mtoonMaterial: class {} });
  assert.equal(host.backend, 'webgpu');
});

test('a failed warm-up isn\'t cached: the next create tries again', async () => {
  let fail = true;
  const { log, module } = fakeWebGPU({ initThrows: () => fail });
  await assert.rejects(RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module }), /device lost/);
  fail = false;
  const host = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module });
  assert.equal(host.backend, 'webgpu');
  assert.deepEqual(log, ['renderer 0', 'init 0 failed', 'renderer 1', 'init 1', 'pmrem 1', 'renderer 2', 'init 2'], 'a second warm-up, then the view');
});

// ---------------------------------------------------------------- gotcha 6: the warm-up renderer

test('gotcha 6: one warm-up WebGPURenderer, initialised with a room PMREM, comes before the view\'s and every later renderer', async () => {
  const { log, module } = fakeWebGPU();
  const view = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module, canvas: {} });
  const exportA = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module });
  const exportB = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module });
  assert.deepEqual(log.slice(0, 3), ['renderer 0', 'init 0', 'pmrem 0'], 'the page\'s first renderer is the warm-up, with its PMREM, before anything else');
  assert.equal(log.filter((e) => e === 'pmrem 0').length, 1);
  assert.deepEqual(log.slice(3), ['renderer 1 (canvas)', 'init 1', 'renderer 2', 'init 2', 'renderer 3', 'init 3'], 'one warm-up per page, however many hosts follow');
  assert.deepEqual([view, exportA, exportB].map((h) => h.renderer.id), [1, 2, 3]);
  const warm = await warmUpWebGPU({ webgpu: module });
  assert.equal(warm.renderer.id, 0); assert.equal(warm.environment.pmremOf, 0);
  // an app may warm up itself at start; a host made after it doesn't warm up again
  const other = fakeWebGPU();
  await warmUpWebGPU({ webgpu: other.module });
  await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: other.module });
  assert.deepEqual(other.log, ['renderer 0', 'init 0', 'pmrem 0', 'renderer 1', 'init 1']);
});

test('gotcha 6: WebGL hosts never touch WebGPU (no warm-up, no three/webgpu)', async () => {
  const { log, module } = fakeWebGPU();
  const host = await RenderHost.create({ backend: 'auto', navigator: noGpu, webgpu: module, renderer: { setPixelRatio() {}, shadowMap: {}, render() {}, dispose() {} } });
  assert.equal(host.backend, 'stand-in');
  assert.deepEqual(log, []);
});

// ---------------------------------------------------------------- gotcha 1: the node frame per offline frame

test('gotcha 1: frameAt advances the node frame once before each offline frame; live frames leave it to three\'s rAF loop', async () => {
  const { module } = fakeWebGPU();
  const host = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module });
  const tree = cafeTree();
  host.attach(tree);
  const nf = host.renderer._nodes.nodeFrame;
  const before = nf.frameId;
  for (let f = 1; f <= 5; f++) await host.frameAt(f * 2, 0.5); // five offline frames, no yield to rAF in between
  assert.equal(nf.frameId, before + 5);
  assert.deepEqual(host.renderer.drawn, [1, 2, 3, 4, 5].map((k) => before + k), 'every offline frame draws under a node frame of its own (5 distinct, not 1)');
  host.render(1, false); host.frame(1 / 60);
  assert.equal(nf.frameId, before + 5, 'live play: three\'s own loop advances it (Renderer.render starts it)');
});

test('gotcha 1 on WebGL is a no-op, and a WebGPURenderer without the private node frame fails loudly', async () => {
  const gl = new RenderHost({ renderer: { isWebGLRenderer: true, setPixelRatio() {}, shadowMap: {}, render() {}, dispose() {}, getContext: () => ({ drawingBufferWidth: 1, drawingBufferHeight: 1 }) } });
  gl.advanceNodeFrame();
  const { module } = fakeWebGPU();
  const r = new module.WebGPURenderer(); await r.init(); delete r._nodes;
  const host = new RenderHost({ renderer: r, webgpu: module, mtoonMaterial: class {} });
  assert.throws(() => host.advanceNodeFrame(), /nodeFrame\.update is gone/);
});

test('canary: three r187 still advances nodeFrame only in its own rAF loop, through the private renderer._nodes', async () => {
  const require = createRequire(import.meta.url);
  const threeDir = require.resolve('three').replace(/build\/three\.cjs$/, '');
  const pkg = JSON.parse(fs.readFileSync(`${threeDir}package.json`, 'utf8'));
  assert.equal(pkg.version, '0.187.0', 'three moved: recheck AB-T-0554 gotchas 1 and 6 (and every gotcha test) before bumping');
  const src = (p) => fs.readFileSync(`${threeDir}${p}`, 'utf8');
  const renderer = src('src/renderers/common/Renderer.js'), animation = src('src/renderers/common/Animation.js');
  assert.match(renderer, /this\._nodes = new NodeManager\(/, 'the host reaches renderer._nodes.nodeFrame');
  assert.match(animation, /requestAnimationFrame\( update \)[\s\S]*this\.nodes\.nodeFrame\.update\(\)/, 'only the rAF loop advances nodeFrame');
  const { NodeFrame } = await import('three/webgpu');
  const nf = new NodeFrame(); const id = nf.frameId; nf.update();
  assert.equal(nf.frameId, id + 1);
});

// ---------------------------------------------------------------- the room environment and the drawing buffer

test('WebGPU\'s PMREM makes the room environment (it used to be null without WebGL), and the Environment uses it', async () => {
  const { log, module } = fakeWebGPU();
  const host = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module });
  host.attach(cafeTree());
  host.render(1, false);
  const env = host.scene.environment;
  assert.equal(env?.pmremOf, host.renderer.id, 'made by the view\'s renderer, with three/webgpu\'s PMREMGenerator');
  assert.equal(host.roomEnvironment(), env, 'once');
  assert.equal(log.filter((e) => e === `pmrem ${host.renderer.id}`).length, 1);
});

test('the post stack and the lens are sized from the drawing buffer on WebGPU (it has no GL context)', async () => {
  const { module } = fakeWebGPU();
  const sizes = [];
  const post = () => ({ setSize: (w, h) => sizes.push([w, h]), configure() {}, active: false, dispose() {} });
  const host = await RenderHost.create({ backend: 'webgpu', navigator: gpuNavigator(), webgpu: module, post });
  host.renderer.setPixelRatio(2);
  host.resize(960, 540);
  assert.deepEqual(sizes, [[1920, 1080]]);
  assert.deepEqual(host.drawingBufferSize(), { width: 1920, height: 1080 });
  // WebGL keeps reading its context, exactly as before
  const gl = new RenderHost({ renderer: { isWebGLRenderer: true, setPixelRatio() {}, setSize() {}, shadowMap: {}, render() {}, dispose() {}, getContext: () => ({ drawingBufferWidth: 1279, drawingBufferHeight: 719 }) }, post });
  gl.resize(640, 360);
  assert.deepEqual(sizes.at(-1), [1279, 719]);
});

// ---------------------------------------------------------------- the three-vrm patch

test('the three-vrm patch is applied on install: MToonNodeMaterial loads on r187 and carries the load fix and five fidelity fixes', async () => {
  const require = createRequire(import.meta.url);
  const file = require.resolve('@pixiv/three-vrm/nodes').replace(/index\.cjs$/, 'index.module.js'); // resolves the CJS path; read the ES module beside it
  const text = fs.readFileSync(file, 'utf8');
  assert.equal((text.match(/VRMXG patch/g) ?? []).length, 18, 'AB-T-0553\'s six lines and patch 5\'s twelve (AB-T-0586)');
  for (const n of [1, 2, 3, 4, 5]) assert.match(text, new RegExp(`VRMXG patch ${n}`), `fix ${n}`);
  // stock 3.5.5 fails to link on r187 (transformedNormalView is gone): importing at all proves the load fix
  const { MToonNodeMaterial } = await import('@pixiv/three-vrm/nodes');
  const m = new MToonNodeMaterial();
  assert.equal(m.isMToonNodeMaterial, true);
  const { PATCHES, inspect } = await import('../../../../scripts/patch-three-vrm.mjs');
  assert.deepEqual(PATCHES.map((p) => inspect(p).state), ['patched', 'patched']);
});

// ---------------------------------------------------------------- patch 5: shadows in the toon shading (AB-T-0586)

/** MToonLightingModel.direct with a stand-in light node; what it hands getDiffuse (lightColor, and shading's inputs). */
async function directWith(lightNode, lightColor, context = {}) {
  const { MToonNodeMaterial } = await import('@pixiv/three-vrm/nodes');
  const { vec3 } = await import('three/tsl');
  const diffuse = [];
  new MToonNodeMaterial().setupLightingModel().direct({ lightDirection: vec3(0, 0, 1), lightColor, lightNode, reflectedLight: { directDiffuse: { addAssign: (n) => diffuse.push(n) }, directSpecular: { addAssign: () => {} } } }, { context });
  const inputs = (n) => (Array.isArray(n.rawInputs) ? n.rawInputs[0] : n.rawInputs);
  const call = inputs(diffuse[0]);
  return { lightColor: call.lightColor, shadow: inputs(call.shading).shadow };
}

test('patch 5: a shadowed MToon fragment keeps the full light and takes the shadow into its toon shading (shade colour, as GLSL)', async () => {
  const { float, vec3, uniform } = await import('three/tsl');
  const base = uniform(vec3(1, 0.9, 0.8)), shadowNode = float(0.25), shadowed = base.mul(shadowNode);
  const calls = [];
  // a light whose colour three (r187) has multiplied by the receiving object's shadow; setupDirect adds its attenuation
  const lightNode = { shadowNode, baseColorNode: base, colorNode: shadowed, setupDirect() { const c = this.colorNode.mul(0.5); calls.push({ colorNode: this.colorNode, lightColor: c }); return { lightColor: c }; } };
  const r = await directWith(lightNode, shadowed.mul(0.5));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].colorNode, base, 'the light colour re-derived from the unshadowed colour (attenuation, spot cone kept)');
  assert.equal(r.lightColor, calls[0].lightColor, 'the diffuse is lit by the unshadowed light');
  assert.equal(r.shadow, shadowNode, 'and the shadow goes into getShading, so a shadowed fragment mixes towards shadeColor');
  assert.equal(lightNode.colorNode, shadowed, 'the light node is left as three set it');
});

test('patch 5: a light that casts no shadow on this object (or a custom getShadow pass) is left as it was', async () => {
  const { float, vec3, uniform } = await import('three/tsl');
  const base = uniform(vec3(1, 1, 1));
  let called = 0;
  const setupDirect = () => { called++; return { lightColor: base }; };
  // castShadow on, but this object doesn't receive: three leaves colorNode at baseColorNode (shadowNode from another object)
  const noReceive = await directWith({ shadowNode: float(0.5), baseColorNode: base, colorNode: base, setupDirect }, base);
  assert.equal(noReceive.lightColor, base);
  assert.equal(noReceive.shadow.value, 1, 'shadow 1: the shading as before');
  const none = await directWith({ shadowNode: null, baseColorNode: base, colorNode: base, setupDirect }, base); // no shadow at all
  assert.equal(none.shadow.value, 1);
  const shadowed = base.mul(float(0.5));
  const custom = await directWith({ shadowNode: float(0.5), baseColorNode: base, colorNode: shadowed, setupDirect }, shadowed, { getShadow: () => shadowed });
  assert.equal(custom.lightColor, shadowed, 'a pass with its own getShadow keeps three\'s colour');
  assert.equal(called, 0);
});

test('patch-three-vrm: --require-patched fails a stock install (CI proves the install patched); a changed file fails --check', async () => {
  const { run, sha256 } = await import('../../../../scripts/patch-three-vrm.mjs');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-patch-'));
  const dir = path.join(base, 'node_modules', 'pkg');
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  const stock = 'a\nb\nc\n', patched = 'a\nB\nc\n';
  fs.writeFileSync(path.join(base, 'p.patch'), '--- a/f\n+++ b/f\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n');
  fs.writeFileSync(path.join(dir, 'lib/f.js'), stock);
  const patches = [{ name: 'p', patch: path.join(base, 'p.patch'), pkg: 'pkg', version: '1.0.0', file: 'lib/f.js', stock: sha256(stock), patched: sha256(patched) }];
  const quiet = { base, patches, log: () => {}, error: () => {} };
  assert.equal(run({ ...quiet, check: true }), 0, '--check accepts stock (the patch applies)');
  assert.equal(run({ ...quiet, check: true, requirePatched: true }), 1, '--require-patched does not');
  assert.equal(fs.readFileSync(path.join(dir, 'lib/f.js'), 'utf8'), stock, '--check changes nothing');
  assert.equal(run(quiet), 0);
  assert.equal(fs.readFileSync(path.join(dir, 'lib/f.js'), 'utf8'), patched);
  assert.equal(run({ ...quiet, check: true, requirePatched: true }), 0);
  assert.equal(run(quiet), 0, 'applying again is a no-op');
  fs.writeFileSync(path.join(dir, 'lib/f.js'), 'a\nX\nc\n');
  assert.equal(run({ ...quiet, check: true }), 1, 'a file that is neither stock nor patched');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.0.1' }));
  assert.equal(run({ ...quiet, check: true }), 1, 'another version');
  fs.rmSync(base, { recursive: true });
});

test('patch-three-vrm updates a file patched by an earlier patch: undoes it back to stock, then applies the current one', async () => {
  const { run, sha256, reverseUnifiedDiff, applyUnifiedDiff } = await import('../../../../scripts/patch-three-vrm.mjs');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-patch-'));
  const dir = path.join(base, 'node_modules', 'pkg');
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  const stock = 'a\nb\nc\nd\n', old = 'a\nB\nc\nd\n', now = 'a\nB\nc\nD\nE\n';
  const oldDiff = '--- a/f\n+++ b/f\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n';
  fs.writeFileSync(path.join(base, 'old.patch'), oldDiff);
  fs.writeFileSync(path.join(base, 'now.patch'), '--- a/f\n+++ b/f\n@@ -1,4 +1,5 @@\n a\n-b\n+B\n c\n-d\n+D\n+E\n');
  assert.equal(applyUnifiedDiff(old, reverseUnifiedDiff(oldDiff)), stock, 'a reversed diff undoes it');
  fs.writeFileSync(path.join(dir, 'lib/f.js'), old);
  const patches = [{ name: 'p', patch: path.join(base, 'now.patch'), pkg: 'pkg', version: '1.0.0', file: 'lib/f.js', stock: sha256(stock), patched: sha256(now), previous: [{ patched: sha256(old), patch: path.join(base, 'old.patch') }] }];
  const quiet = { base, patches, log: () => {}, error: () => {} };
  assert.equal(run({ ...quiet, check: true }), 1, '--check fails an earlier patch (the install needs to update it)');
  assert.equal(fs.readFileSync(path.join(dir, 'lib/f.js'), 'utf8'), old, '--check changes nothing');
  assert.equal(run(quiet), 0);
  assert.equal(fs.readFileSync(path.join(dir, 'lib/f.js'), 'utf8'), now);
  assert.equal(run({ ...quiet, check: true, requirePatched: true }), 0);
  fs.rmSync(base, { recursive: true });
});

test('patch-three-vrm: the earlier three-vrm patch undoes to the stock hash the current one starts from', async () => {
  const { PATCHES, reverseUnifiedDiff, applyUnifiedDiff, patchText, sha256 } = await import('../../../../scripts/patch-three-vrm.mjs');
  const p = PATCHES[0];
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const installed = fs.readFileSync(path.join(root, 'node_modules', p.pkg, p.file), 'utf8');
  assert.equal(sha256(installed), p.patched, 'the install is on the current patch');
  for (const prev of p.previous) {
    // the current file, back to stock, then forward under the earlier patch, must give that patch's recorded hash
    const stock = applyUnifiedDiff(installed, reverseUnifiedDiff(fs.readFileSync(path.join(root, p.patch), 'utf8')));
    assert.equal(sha256(stock), p.stock);
    const earlier = applyUnifiedDiff(stock, fs.readFileSync(path.join(root, prev.patch), 'utf8'));
    assert.equal(sha256(earlier), prev.patched);
    assert.equal(sha256(patchText(p, applyUnifiedDiff(earlier, reverseUnifiedDiff(fs.readFileSync(path.join(root, prev.patch), 'utf8'))))), p.patched);
  }
});

test('patch-three-vrm runs as a script through a symlink with a space and # in its path (import.meta.main)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg patch #'));
  const link = path.join(dir, 'patch three-vrm#.mjs');
  fs.symlinkSync(fileURLToPath(new URL('../../../../scripts/patch-three-vrm.mjs', import.meta.url)), link);
  const r = spawnSync(process.execPath, [link, '--check', '--require-patched'], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /index\.module\.js is patched/, 'it ran (the old argv[1] comparison would exit 0 having done nothing)');
  assert.match(r.stdout, /index\.cjs is patched/);
});

test('three-vrm\'s CommonJS nodes build (stock, unpatched) is stubbed out: require() throws instead of drawing wrong', () => {
  const require = createRequire(import.meta.url);
  assert.throws(() => require('@pixiv/three-vrm/nodes'), /VRMXG disables the CommonJS build/);
});

test('patch-three-vrm applies hunks exactly and refuses a file that changed', async () => {
  const { applyUnifiedDiff } = await import('../../../../scripts/patch-three-vrm.mjs');
  const diff = '--- a/f\n+++ b/f\n@@ -2,2 +2,2 @@\n b\n-c\n+C\n';
  assert.equal(applyUnifiedDiff('a\nb\nc\nd\n', diff), 'a\nb\nC\nd\n');
  assert.throws(() => applyUnifiedDiff('a\nb\nx\nd\n', diff), /line 3 differs/);
  assert.throws(() => applyUnifiedDiff('a\nB\nc\nd\n', diff), /line 2 differs/);
});
