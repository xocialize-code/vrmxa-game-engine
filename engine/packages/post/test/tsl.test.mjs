// M4 W1 (AB-T-0573) in Node: TSLPostStack's graph, built against a stand-in WebGPURenderer (Node has no GPU, but TSL
// graphs, passes and render targets build without one). One test per r187 gotcha the stack leans on
// (spike-webgpu-render/README.md "Gotchas"): 1 (offline frames advance the node frame before the stack draws), 4 (every
// pass and texture sized at build; one pipeline per structure), 5 (the character mask is a layer pass, no material
// mrtNode), 7 (toneMapping returns a vec4), each with a canary that fails when a three upgrade moves what the
// workaround leans on. The rendered checks (every preset on WebGPU in Chromium and WKWebView, exports, SSIM against
// WebGL) are apps/playground's ?mode=post (scripts/post-chromium.mjs, post-wkwebview.sh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Scene, PerspectiveCamera, MeshBasicNodeMaterial, HalfFloatType, Vector2, RenderPipeline } from 'three/webgpu';
import { TSLPostStack, MAPPING, BLOOM_LEVELS, lutFromCubeTSL } from '@vrmxg/post/tsl';
import { EFFECTS, ORDER, CHARACTER_LAYER, makePostStack, PostStack } from '@vrmxg/post';

const require = createRequire(import.meta.url);
const threeDir = require.resolve('three').replace(/build\/three\.cjs$/, '');
const threeSrc = (p) => fs.readFileSync(`${threeDir}${p}`, 'utf8');

/** What TSLPostStack and RenderPipeline's constructor touch on a WebGPURenderer. */
function standIn(w = 1920, h = 1080) {
  return { isWebGPURenderer: true, toneMapping: 4, outputColorSpace: 'srgb', coordinateSystem: 2001, size: [w, h], getDrawingBufferSize(v) { return v.set(this.size[0], this.size[1]); } };
}
// Node can't draw: a RenderPipeline's own draw is stubbed (counted), so render() runs everything else for real — the
// structure key, the cache and its eviction, building, sizing, retargeting the passes and the uniforms.
RenderPipeline.prototype.render = function () { this.drawn = (this.drawn ?? 0) + 1; };
const defaultScene = new Scene(), defaultCamera = new PerspectiveCamera();
/** One frame through the stack's real render(); returns the pipeline it drew with. */
function draw(stack, scene = defaultScene, camera = defaultCamera) { stack.render(scene, camera, 0); return stack.built; }
/** Every render target a built pipeline owns, with the shared passes', each with a dispose spy. */
function spyTargets(stack, b) {
  const ts = [...TSLPostStack.ownTargets(b).map((t) => t.renderTarget), ...Object.values(stack.shared).filter(Boolean).map((p) => p.renderTarget)];
  for (const t of ts) if (!t.spied) { const real = t.dispose.bind(t); t.spied = true; t.disposed = false; t.dispose = () => { t.disposed = true; real(); }; }
  return ts;
}

test('the same effects, in the same order, as the WebGL stack; every effect says what it is under TSL', () => {
  for (const e of Object.keys(EFFECTS)) assert.ok(MAPPING[e], `MAPPING.${e}`);
  const stack = new TSLPostStack(standIn());
  stack.configure('anime');
  const { passes } = draw(stack);
  assert.deepEqual(passes.map((p) => p.split('(')[0]), ['scene', 'normals', 'characterMask', 'edges', 'dof', 'merged', 'chromaticAberration']);
  const merged = passes.find((p) => p.startsWith('merged'));
  const at = (n) => merged.indexOf(n);
  assert.ok(at('bloom') < at('hueSaturation') && at('hueSaturation') < at('brightnessContrast') && at('brightnessContrast') < at('toneMapping') && at('toneMapping') < at('vignette') && at('vignette') < at('grain') && at('grain') < at('anime'), merged);
  // a list in any order runs in ORDER, as normalizePost sorts it for both stacks
  stack.configure([{ effect: 'vignette' }, { effect: 'chromaticAberration' }, { effect: 'bloom' }]);
  assert.deepEqual(draw(stack).passes.map((p) => p.split('(')[0]), ['scene', 'merged', 'chromaticAberration']);
  assert.equal(ORDER.indexOf('bloom') < ORDER.indexOf('vignette'), true);
  assert.equal(stack.renderer.toneMapping, 0, 'the renderer\'s own tone mapping is off while the stack runs (NoToneMapping)');
});

test('gotcha 4: every pass and texture is sized to the drawing buffer when the pipeline is built, before any frame', () => {
  const stack = new TSLPostStack(standIn(1280, 720));
  stack.configure('anime');
  const { nodes } = draw(stack);
  assert.deepEqual([nodes.scenePass.renderTarget.width, nodes.scenePass.renderTarget.height], [1280, 720], 'the scene pass (DOF sizes itself from it: a 1×1 one drew one flat colour)');
  assert.deepEqual([nodes.normalPass.renderTarget.width, nodes.normalPass.renderTarget.height], [1280, 720]);
  assert.deepEqual([nodes.maskPass.renderTarget.width, nodes.maskPass.renderTarget.height], [640, 360], 'the mask at ½ resolution');
  for (const t of nodes.dof.full) assert.deepEqual([t.renderTarget.width, t.renderTarget.height], [1280, 720], 'the DOF\'s full-res targets (CoC, masked, far fill)');
  for (const t of nodes.dof.half) assert.deepEqual([t.renderTarget.width, t.renderTarget.height], [640, 360], 'its ½-res targets (blurred CoC, bokeh)');
  assert.equal(nodes.dof.full.length + nodes.dof.half.length, 10);
  for (const t of nodes.auto) assert.deepEqual([t.renderTarget.width, t.renderTarget.height], [1280, 720]);
  // the bloom chain, sized as pmndrs' MipmapBlurPass (halving with Math.round), luminance at full size
  assert.equal(nodes.bloom.length, 2 * BLOOM_LEVELS);
  assert.deepEqual(nodes.bloom.map((t) => t.renderTarget.width), [1280, 640, 320, 160, 80, 40, 20, 10, 5, 10, 20, 40, 80, 160, 320, 640]);
  assert.deepEqual(nodes.bloom.map((t) => t.renderTarget.height), [720, 360, 180, 90, 45, 23, 12, 6, 3, 6, 12, 23, 45, 90, 180, 360]);
  for (const t of nodes.bloom) assert.equal(t.renderTarget.texture.type, HalfFloatType);
  // a resize resizes them all (and the next build of another structure starts at the new size)
  stack.setSize(3840, 2160);
  assert.deepEqual([nodes.scenePass.renderTarget.width, nodes.maskPass.renderTarget.width, nodes.bloom[1].renderTarget.width], [3840, 1920, 1920]);
});

test('canary for gotcha 4: r187\'s DepthOfFieldNode still sizes itself from its input on its first frame (mrdoob/three.js#35620)', () => {
  // the stack's DOF is a port of pmndrs' (for the look), but any node that sizes itself this way needs its input sized at build
  const dof = threeSrc('examples/jsm/tsl/display/DepthOfFieldNode.js');
  assert.match(dof, /updateBefore\( frame \) \{[\s\S]*?const map = this\.textureNode\.value;\s*this\.setSize\( map\.image\.width, map\.image\.height \);/, 'if three fixed #35620, recheck whether pipelines still need sizing at build');
});

test('gotcha 4: render() keeps one pipeline per structure — one that comes back is reused; values and cameras never rebuild', () => {
  const stack = new TSLPostStack(standIn());
  let builds = 0; const build = stack.build.bind(stack); stack.build = (...a) => { builds++; return build(...a); };
  const scene = new Scene(), cam = new PerspectiveCamera(), cam2 = new PerspectiveCamera();
  stack.configure('anime');
  const anime = draw(stack, scene, cam);
  stack.setParams({ 'anime.speedLines': 0.9, 'bloom.intensity': 2 });
  assert.equal(draw(stack, scene, cam), anime, 'values only update uniforms');
  assert.equal(stack.u.speed.value, 0.9); assert.equal(stack.u.bloomIntensity.value, 2);
  stack.configure('clean');
  const clean = draw(stack, scene, cam);
  assert.notEqual(clean, anime);
  assert.equal(clean.nodes.scenePass, anime.nodes.scenePass, 'one MSAA scene pass, shared by every structure');
  stack.configure('anime');
  assert.equal(draw(stack, scene, cam), anime, 'the anime pipeline from the cache: it has already drawn its first frame');
  assert.equal(builds, 2);
  assert.equal(anime.pipeline.drawn, 3);
  // another camera (a cut, a new load): the shared passes retarget, nothing is built
  draw(stack, scene, cam2);
  assert.equal(builds, 2);
  for (const p of Object.values(stack.shared)) assert.equal(p.camera, cam2);
  // the tone mapping is part of the structure (it's a node, not a uniform)
  stack.configure('anime', { toneMapping: 'agx' });
  assert.notEqual(stack.key, anime.key);
});

test('the cache is an LRU of cacheSize structures: the least recently drawn is disposed with every target it owns, and rebuilds sized', () => {
  const stack = new TSLPostStack(standIn(1280, 720)); // cacheSize 2
  stack.configure('anime'); const anime = draw(stack);
  stack.configure('clean'); const clean = draw(stack);
  const animeTargets = TSLPostStack.ownTargets(anime).map((t) => t.renderTarget);
  for (const t of animeTargets) { t.disposed = false; const real = t.dispose.bind(t); t.dispose = () => { t.disposed = true; real(); }; }
  let pipelineDisposed = false; const realDispose = anime.pipeline.dispose.bind(anime.pipeline); anime.pipeline.dispose = () => { pipelineDisposed = true; realDispose(); };
  stack.configure([{ effect: 'bloom' }, { effect: 'vignette' }]); draw(stack);
  assert.deepEqual([...stack.cache.values()].map((b) => b.key), [clean.key, stack.key], 'anime (least recently drawn) evicted');
  assert.equal(pipelineDisposed, true);
  assert.equal(animeTargets.length, 2 * BLOOM_LEVELS + 10 + 3, 'bloom 16, DOF 10, and the textures of the edges, the DOF and the merged pass');
  assert.ok(animeTargets.every((t) => t.disposed), 'every target it owned is freed');
  assert.ok(!stack.shared.scenePass.renderTarget.disposed, 'the shared passes stay');
  // drawing clean promotes it; anime comes back rebuilt, sized at build like any new pipeline
  stack.configure('clean'); assert.equal(draw(stack), clean);
  stack.configure('anime'); const again = draw(stack);
  assert.notEqual(again, anime);
  assert.deepEqual(again.nodes.dof.full.map((t) => t.renderTarget.width), [1280, 1280, 1280]);
  assert.equal(stack.cache.size, 2);
  const big = new TSLPostStack(standIn(), { cacheSize: 4 });
  for (const look of ['anime', 'clean', [{ effect: 'bloom' }], [{ effect: 'vignette' }], [{ effect: 'grain' }]]) { big.configure(look); draw(big); }
  assert.equal(big.cache.size, 4);
});

test('a LUT\'s arrival evicts the look without it (it won\'t come back)', async () => {
  const cube = fs.readFileSync(new URL('../../../../content/sample/looks/morning.cube', import.meta.url), 'utf8');
  let release;
  const stack = new TSLPostStack(standIn(), { loadLut: () => new Promise((r) => { release = () => r(cube); }) });
  stack.configure([{ effect: 'bloom' }, { effect: 'lut', file: 'looks/morning.cube' }]);
  const without = draw(stack);
  const owned = spyTargets(stack, without).slice(0, TSLPostStack.ownTargets(without).length);
  release(); await stack.settle();
  assert.ok(!stack.cache.has(without.key), 'the lut:false pipeline is gone');
  assert.ok(owned.every((t) => t.disposed));
  assert.ok(draw(stack).passes.join().includes('lut3D(sRGB)'));
});

test('dispose() frees every render target: each cached pipeline\'s own (bloom, DOF, textures) and the shared passes', () => {
  const stack = new TSLPostStack(standIn(), { cacheSize: 3 });
  const all = [];
  for (const look of ['anime', 'clean', [{ effect: 'chromaticAberration' }]]) { stack.configure(look); all.push(...spyTargets(stack, draw(stack))); }
  const unique = [...new Set(all)];
  assert.equal(unique.length, (2 * BLOOM_LEVELS + 10 + 3) + 2 * BLOOM_LEVELS + 1 + 3, 'anime 29, clean 16, aberration 1, shared scene/normal/mask 3');
  stack.dispose();
  assert.deepEqual(unique.filter((t) => !t.disposed).length, 0);
  assert.equal(stack.cache.size, 0);
  assert.deepEqual(Object.values(stack.shared), [null, null, null]);
});

test('gotcha 5: the character mask is a ½-resolution pass of the character layer with an override material; no material mrtNode', () => {
  const stack = new TSLPostStack(standIn());
  stack.configure([{ effect: 'edges' }]);
  const { nodes } = draw(stack);
  assert.equal(nodes.maskPass._layers.mask, 1 << CHARACTER_LAYER, 'only the character layer (Views.markCharacters puts characters on it)');
  assert.ok(nodes.maskPass.overrideMaterial instanceof MeshBasicNodeMaterial);
  assert.equal(nodes.maskPass._resolutionScale, 0.5);
  assert.equal(nodes.maskPass.clear.getHex(), 0x000000, 'white characters on black, no background');
  assert.equal(nodes.scenePass._mrt, null, 'the scene pass has no MRT');
  for (const m of [nodes.maskPass.overrideMaterial, nodes.normalPass.overrideMaterial]) assert.equal(m.mrtNode, null, 'no per-material MRT (it breaks every non-MRT pass in r187)');
  assert.equal(nodes.normalPass.clear.getHex(), 0x7777ff, 'pmndrs\' NormalPass clear colour');
});

test('canary for gotcha 5: r187 has no MRTNode.isCompatible, so a material mrtNode would still break non-MRT passes (#35373, fixed for r188)', () => {
  const mrt = threeSrc('src/nodes/core/MRTNode.js');
  assert.doesNotMatch(mrt, /isCompatible/, 'three has the r188 fix: the mask could move to a material mrtNode (one scene pass less)');
});

test('gotcha 5\'s pass draws without the scene\'s background, environment and fog, and puts them back', () => {
  const stack = new TSLPostStack(standIn());
  stack.configure([{ effect: 'edges' }]);
  const { nodes } = draw(stack);
  const scene = nodes.maskPass.scene;
  scene.background = 'sky'; scene.environment = 'room'; scene.fog = 'fog';
  const seen = [];
  const renderer = { getClearColor: (c) => c.setHex(0x123456), getClearAlpha: () => 0.5, setClearColor: (c, a) => seen.push([typeof c === 'number' ? c : c.getHex(), a]) };
  const proto = Object.getPrototypeOf(Object.getPrototypeOf(nodes.maskPass)); // PassNode
  const real = proto.updateBefore;
  proto.updateBefore = function () { seen.push([scene.background, scene.environment, scene.fog]); };
  try { nodes.maskPass.updateBefore({ renderer }); } finally { proto.updateBefore = real; }
  assert.deepEqual(seen[0], [0x000000, 1]);
  assert.deepEqual(seen[1], [null, null, null]);
  assert.deepEqual(seen[2], [0x123456, 0.5]);
  assert.deepEqual([scene.background, scene.environment, scene.fog], ['sky', 'room', 'fog']);
});

test('canary for gotcha 7: r187\'s toneMapping() returns a vec4 whatever it is given', () => {
  const tm = threeSrc('src/nodes/display/ToneMappingNode.js');
  assert.match(tm, /outputNode = vec4\( toneMappingFn\( colorNode\.rgb, this\.exposureNode \), colorNode\.a \)/);
});

test('gotcha 7: in the built graph, toneMapping() takes the vec4 and is never joined into another vec4', () => {
  // a vec4(toneMapping(…, c.rgb), c.a) was five components: "Length of parameters exceeds maximum length of function vec4()",
  // and the pipeline drew one flat colour from its second frame
  const stack = new TSLPostStack(standIn());
  stack.configure([{ effect: 'bloom' }, { effect: 'grade' }, { effect: 'vignette' }]);
  const out = draw(stack).pipeline.outputNode;
  const type = (n) => n?.constructor?.type;
  const tone = [], joined = [], seen = new Set();
  const walk = (n) => {
    if (!n || seen.has(n)) return; seen.add(n);
    if (type(n) === 'ToneMappingNode') tone.push(n);
    if (type(n) === 'JoinNode' && n.nodes.some((c) => type(c) === 'ToneMappingNode')) joined.push(n);
    for (const c of n.getChildren?.() ?? []) walk(c);
  };
  walk(out);
  assert.equal(tone.length, 1, 'the tone mapping is in the graph');
  assert.notEqual(type(tone[0].colorNode), 'SplitNode', 'given the whole vec4, not c.rgb');
  assert.equal(joined.length, 0, 'its vec4 is used as it is');
});

test('gotcha 1: an offline frame advances three\'s node frame before the stack draws, so its passes redraw', async () => {
  const { RenderHost } = await import('@vrmxg/render');
  const nodeFrame = { frameId: 0, update() { this.frameId++; } };
  const renderer = { isWebGPURenderer: true, _initialized: true, backend: { isWebGPUBackend: true }, _nodes: { nodeFrame }, shadowMap: {}, setPixelRatio() {}, setSize() {}, getDrawingBufferSize: (v) => v.set(1920, 1080), render() {}, dispose() {} };
  const drawnAt = [];
  const post = { active: true, configure() {}, setSize() {}, setParams() {}, settle: async () => {}, render: () => drawnAt.push(nodeFrame.frameId), dispose() {} };
  const host = new RenderHost({ renderer, webgpu: {}, mtoonMaterial: class {}, post: () => post });
  const steps = { step: 0 };
  host.tree = { clock: { get step() { return steps.step; } }, step: () => { steps.step++; return true; }, settle: async () => {}, present() {}, services: { get: () => null }, root: { object3d: { updateMatrixWorld() {} } }, all: () => [], find: () => null, structureVersion: 0 };
  host.views = { update() {}, dispose() {} };
  host.interpolate = false;
  for (let s = 1; s <= 3; s++) await host.frameAt(s, 1);
  assert.deepEqual(drawnAt, [1, 2, 3], 'each offline frame drew in a frame of its own');
});

test('resolution-independent lengths: px at 1080p scale with the output\'s height; the aberration follows the aspect', () => {
  const stack = new TSLPostStack(standIn());
  stack.configure([{ effect: 'edges', thickness: 1.5 }, { effect: 'dof', auto: false, bokehScale: 2 }, { effect: 'chromaticAberration', offset: 1.2 }]);
  stack.setSize(1920, 1080);
  const at1080 = { t: stack.u.thickness.value, b: stack.u.bokeh.value, ca: stack.u.caShift.value.clone(), texel: stack.u.texel.value.clone() };
  stack.setSize(3840, 2160);
  assert.equal(stack.u.thickness.value, at1080.t * 2);
  assert.equal(stack.u.bokeh.value, at1080.b * 2);
  assert.deepEqual(stack.u.caShift.value.toArray(), at1080.ca.toArray(), 'a uv offset: the same at any size of one aspect');
  assert.deepEqual(stack.u.texel.value.toArray(), [1 / 3840, 1 / 2160]);
  stack.setSize(720, 480);
  assert.equal(stack.u.thickness.value, 1, 'edges clamp to ≥ 1 px, as on WebGL');
  const o = 1.2 / 1080, aspect = 1.5;
  assert.ok(new Vector2(o / aspect, o * aspect).distanceTo(stack.u.caShift.value) < 1e-12, 'pmndrs: offset (o / aspect, o) × (1, aspect)');
});

test('the grade\'s uniforms are pmndrs\' (hue matrix, saturation and contrast factors)', () => {
  const stack = new TSLPostStack(standIn());
  stack.configure([{ effect: 'grade', saturation: 0.12, contrast: 0.06, hue: 0, brightness: 0.02 }]);
  assert.deepEqual(stack.u.hue.value.toArray().map((v) => +v.toFixed(12)), [1, 0, 0]);
  assert.equal(stack.u.satK.value, 1 - 1 / (1.001 - 0.12));
  assert.equal(stack.u.contrastK.value, 1 / (1 - 0.06));
  stack.setParams({ 'grade.saturation': -0.5, 'grade.contrast': -0.25 });
  assert.equal(stack.u.satK.value, 0.5); assert.equal(stack.u.contrastK.value, 0.75);
});

test('LUTs: settle() waits for the .cube; its arrival is a new structure; a failed load settles to none', async () => {
  const cube = fs.readFileSync(new URL('../../../../content/sample/looks/morning.cube', import.meta.url), 'utf8');
  let release;
  const stack = new TSLPostStack(standIn(), { loadLut: (file) => (file === 'bad.cube' ? Promise.reject(new Error('missing')) : new Promise((r) => { release = () => r(cube); })) });
  stack.configure([{ effect: 'lut', file: 'looks/morning.cube', intensity: 0.85 }]);
  assert.equal(stack.u.lutIntensity.value, 0.85, 'the intensity mixes, as on WebGL');
  stack.setParams({ 'lut.intensity': 1.4 }); assert.equal(stack.u.lutIntensity.value, 1, 'clamped to 0…1');
  const without = stack.key;
  assert.match(without, /lut:false/);
  assert.ok(!draw(stack).passes.join().includes('lut3D'), 'a live view draws without it until it arrives');
  let settled = false;
  const p = stack.settle().then(() => { settled = true; });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(settled, false);
  release(); await p;
  assert.match(stack.key, /lut:true/);
  assert.equal(stack.built, null, 'rebuilt on the next frame, with the LUT');
  assert.ok(draw(stack).passes.join().includes('lut3D(sRGB)'));
  const lut = stack.luts.get('looks/morning.cube');
  assert.equal(lut.size, 17); assert.equal(lut.texture3D.type, HalfFloatType, 'HalfFloat: filterable on every WebGPU device');
  const warn = console.warn; console.warn = () => {};
  stack.configure([{ effect: 'lut', file: 'bad.cube' }]);
  await stack.settle(); console.warn = warn;
  assert.equal(stack.luts.get('bad.cube'), null);
});

test('lutFromCubeTSL keeps the .cube\'s values (to half precision)', () => {
  const cube = fs.readFileSync(new URL('../../../../content/sample/looks/morning.cube', import.meta.url), 'utf8');
  const lut = lutFromCubeTSL(cube);
  const half = lut.texture3D.image.data;
  // the first entry: 0.010800 0.014400 0.023400
  const h2f = (h) => { const e = (h >> 10) & 31, m = h & 1023; return (e ? (1 + m / 1024) * 2 ** (e - 15) : (m / 1024) * 2 ** -14); };
  assert.deepEqual([0, 1, 2].map((i) => +h2f(half[i]).toFixed(4)), [0.0108, 0.0144, 0.0234]);
});

test('makePostStack: pmndrs on WebGL, TSL on WebGPU (loaded only there); the .cube text reaches both', async () => {
  const gl = await makePostStack({ isWebGLRenderer: true, toneMapping: 0 }, { loadCube: async () => 'x' });
  assert.ok(gl instanceof PostStack);
  const gpu = await makePostStack(standIn(), { loadCube: async () => 'x' });
  assert.ok(gpu instanceof TSLPostStack);
  assert.equal(gpu.multisampling, 4);
});
