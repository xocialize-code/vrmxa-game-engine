// AB-T-0554 spike page. One mode per page load (the Mac wrapper gives each its own fresh WKWebView):
//   ?mode=probe                         WebGPU in this web view: navigator.gpu, adapter, features, limits, origin facts
//   ?mode=view&renderer=webgpu|webgl     the cafe, live, with ?post=anime|none (interactive look; drag nothing, it's a still)
//   ?mode=bench&renderer=…               post costs at 1080p and 4K: none, anime, anime + LUT (WebGPU also threshold bloom)
//   ?mode=export&renderer=…              offline readback timed at 1080p and 4K; two exports' frames hashed and compared
//   ?mode=particles&renderer=…           three.quarks under the renderer: the adapter's hashes rendered vs headless
// Results: window.__result + window.READY (the wrapper polls), and with &save=<name> a POST to the dev server.
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { RenderHost } from '@vrmxg/render';
import { PostStack, lutFromCube, PRESETS } from '@vrmxg/post';
const ANIME = PRESETS.anime;
import { Readback, hashFrame, toImageRGBA } from '@vrmxg/export';
import { frameToStep } from '@vrmxg/core';
import { worldHashes, hashValue, compareRuns, captureWorld, restoreWorld } from '@vrmxg/snapshot';
import * as core from '@vrmxa-core/index.js';
import * as anim from '@vrmxa-core/anim/index.js';
import * as closet from '@vrmxa-core/closet/index.js';
import * as projectBehaviours from '@content/behaviours.js';
import { loadSample, buildWorld } from '../../../apps/playground/src/world.js';
import { runParticles } from '../../../apps/playground/src/acceptance.js';
import { QUARKS_BACKEND } from 'three.quarks';
import './sqljs.js';

installPortableMath();

// ?wgsl=1: record every shader module each device compiles (label → code), to compare devices
const WGSL = [];
if (new URLSearchParams(location.search).get('wgsl') === '1' && typeof GPUDevice !== 'undefined') {
  const create = GPUDevice.prototype.createShaderModule;
  GPUDevice.prototype.createShaderModule = function (d) {
    if (!this.__wgslIndex) this.__wgslIndex = WGSL.push(new Map());
    WGSL[this.__wgslIndex - 1].set((d.label ?? '').replace(/_\d+$/, ''), d.code);
    return create.call(this, d);
  };
}

// ------------------------------------------------------------------ capture console and errors
window.__errors = []; window.__warnings = [];
const origError = console.error.bind(console), origWarn = console.warn.bind(console);
console.error = (...a) => { window.__errors.push(a.map(String).join(' ').slice(0, 600)); origError(...a); };
console.warn = (...a) => { window.__warnings.push(a.map(String).join(' ').slice(0, 600)); origWarn(...a); };
window.addEventListener('error', (e) => window.__errors.push(`uncaught: ${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(`unhandled: ${e.reason?.stack ?? e.reason}`));

const q = new URLSearchParams(location.search);
const MODE = q.get('mode') ?? 'probe', KIND = q.get('renderer') ?? 'webgpu';
const logEl = document.getElementById('log');
const log = (s) => { logEl.textContent += `${s}\n`; console.log(s); window.webkit?.messageHandlers?.spike?.postMessage(JSON.stringify({ type: 'log', payload: s })); };
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
const now = () => performance.now();
const median = (a) => { const s = [...a].sort((x, y) => x - y); return +s[s.length >> 1].toFixed(3); };
const stats = (a) => { const s = [...a].sort((x, y) => x - y); return { median: +s[s.length >> 1].toFixed(3), p90: +s[Math.floor(s.length * 0.9)].toFixed(3), mean: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(3), n: s.length }; };

const vrmxaCore = { ...core, ...anim };
const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
const bytes = async (ref) => { const r = await fetch(ref); if (!r.ok) throw new Error(`${ref}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };
const text = async (ref) => new TextDecoder().decode(await bytes(ref));
const opts = { vrmxaCore, closet, behaviours };

/** The three emitters of acceptance check 13 (steam on the machine, dust, a spark loop), in view of the cafe camera. */
const EMITTERS = [
  { id: 'fx-steam', type: 'ParticleEmitter', parent: 'root', transform: { p: [1.3, 1.55, -4.1] }, props: { effect: 'steam' } },
  { id: 'fx-dust', type: 'ParticleEmitter', parent: 'root', transform: { p: [-0.5, 0.02, 4] }, props: { effect: 'dust' } },
  { id: 'fx-sparks', type: 'ParticleEmitter', parent: 'root', transform: { p: [-3, 1.2, -1.6] }, props: { effect: 'sparks' } },
];
const withEmitters = (sample) => ({ ...sample, doc: { ...sample.doc, nodes: [...sample.doc.nodes, ...EMITTERS] } });

// ------------------------------------------------------------------ renderers and hosts
let three = null; // three/webgpu, loaded only for WebGPU pages
async function makeHost(kind, { post = true } = {}) {
  if (kind === 'webgl') {
    const host = new RenderHost({ canvas, dprCap: 1, post: post ? (r) => new PostStack(r, { loadLut: async (f) => lutFromCube(await text(f)) }) : null });
    return { host, kind, renderer: host.renderer, sync: () => host.renderer.getContext().finish(), info: () => ({ calls: host.renderer.info.render.calls, triangles: host.renderer.info.render.triangles }) };
  }
  three ??= await import('three/webgpu');
  const { TSLPostStack } = await import('./tsl-post.js');
  const renderer = new three.WebGPURenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  await renderer.init();
  const host = new RenderHost({ canvas, renderer, dprCap: 1, post: post ? (r) => new TSLPostStack(r, { loadLut: (f) => text(f), bloomMode: q.get('bloom') ?? 'selective', disposeOld: q.get('disposeOld') === '1' }) : null });
  // RenderHost's room environment is WebGL-only (it returns null for any other renderer): make it with WebGPU's PMREM
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
  const pmrem = new three.PMREMGenerator(renderer);
  host._room = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const device = renderer.backend.device;
  // r187: node updates of type FRAME (every PassNode of a RenderPipeline, shadow maps) run once per nodeFrame.frameId,
  // and only the renderer's own requestAnimationFrame loop advances it. An offline loop that never yields to rAF (an
  // export, a timing loop) would draw the pipeline's final quad over the previous frame's pass textures. So each drawn
  // frame advances the node frame first (a private field: there is no public call in r187). ?tick=0 turns it off.
  const nodeFrame = renderer._nodes.nodeFrame;
  const draw = host.render.bind(host);
  if (q.get('tick') !== '0') host.render = (alpha, stepped) => { nodeFrame.update(); return draw(alpha, stepped); };
  return {
    host, kind, renderer, device,
    backend: renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2 fallback',
    sync: () => device?.queue.onSubmittedWorkDone(),
    info: () => ({ calls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles }),
  };
}

async function makeWorld(R, sample, H) {
  const { tree, input } = await buildWorld(R, sample, opts);
  let swapped = 0;
  if (H.kind === 'webgpu') {
    const { toonStandIns } = await import('./standin.js');
    for (const n of tree.all()) if (n.type === 'Character') swapped += toonStandIns(n.object3d, { outlineScale: +(q.get('outline') ?? 1) });
  }
  H.host.attach(tree);
  return { tree, input, swapped };
}

/** Draw at a size with pixel ratio 1 (what an export does). */
function setSize(H, w, h) { H.renderer.setPixelRatio(1); H.host.resize(w, h); }

function setPost(H, tree, post) {
  const env = tree.find('env');
  env.props.post = post; H.host.views.update(tree);
}

async function timeRenders(H, n) {
  const ms = [];
  for (let i = 0; i < 3; i++) { H.host.render(1, false); await H.sync(); }
  for (let i = 0; i < n; i++) { const t0 = now(); H.host.render(1, false); await H.sync(); ms.push(now() - t0); }
  return stats(ms);
}

/** Throughput: n frames back to back, one GPU sync at the end (per-frame sync costs differ by API). ms per frame, best of 3. */
async function throughput(H, n) {
  const runs = [];
  for (let r = 0; r < 3; r++) {
    await H.sync();
    const t0 = now();
    for (let i = 0; i < n; i++) H.host.render(1, false);
    await H.sync();
    runs.push((now() - t0) / n);
  }
  return +Math.min(...runs).toFixed(3);
}

/** Draw calls and triangles of one whole frame (every render call the stack makes), not just the last call's. */
async function frameInfo(H) {
  const info = H.renderer.info, auto = info.autoReset;
  info.autoReset = false; info.reset();
  H.host.render(1, false); await H.sync();
  const out = H.info();
  info.autoReset = auto;
  return out;
}

// ------------------------------------------------------------------ readback
/** WebGPU offline readback: an RGBA8 render target, copied into a ring of MAP_READ buffers; taken a frame later. */
class GPUReadback {
  constructor(H, width, height, slots = 3) {
    this.H = H; this.width = width; this.height = height;
    this.rt = new three.RenderTarget(width, height, { depthBuffer: false });
    H.renderer.initRenderTarget(this.rt); // the GPU texture exists before the first draw (and the draw must fill it)
    this.bpr = Math.ceil((width * 4) / 256) * 256;
    this.slots = Array.from({ length: slots }, () => ({ buf: H.device.createBuffer({ size: this.bpr * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }), map: null }));
  }
  /**
   * Draw `fn` into the render target as if to the canvas: setOutputRenderTarget, not setRenderTarget. With
   * setRenderTarget a plain renderer.render() skips the output transform (no tone mapping, no sRGB) and uses the
   * target's own depth (none here); the output target gets exactly what the canvas would.
   */
  async draw(fn) { const r = this.H.renderer; r.setOutputRenderTarget(this.rt); try { await fn(); } finally { r.setOutputRenderTarget(null); } }
  /** Start copying the target into `slot` (after the frame's work is submitted). */
  read(slot) {
    const s = this.slots[slot], dev = this.H.device;
    const data = this.H.renderer.backend.get(this.rt.texture), tex = data.texture;
    if (!tex) throw new Error(`readback target has no GPU texture yet (backend data keys: ${Object.keys(data).join(',') || 'none'}; target ${this.rt.width}x${this.rt.height})`);
    const enc = dev.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: s.buf, bytesPerRow: this.bpr }, [this.width, this.height]);
    dev.queue.submit([enc.finish()]);
    s.map = s.buf.mapAsync(GPUMapMode.READ);
  }
  /** Wait for `slot` and copy it out (tightly packed RGBA, row 0 at the top). */
  async take(slot, out) {
    const s = this.slots[slot];
    await s.map; s.map = null;
    const src = new Uint8Array(s.buf.getMappedRange());
    const row = this.width * 4;
    if (this.bpr === row) out.set(src.subarray(0, out.length));
    else for (let y = 0; y < this.height; y++) out.set(src.subarray(y * this.bpr, y * this.bpr + row), y * row);
    s.buf.unmap();
    return out;
  }
  dispose() { for (const s of this.slots) s.buf.destroy(); this.rt.dispose(); }
}

/** One readback (one output target) per renderer and size, kept: see the README on output targets. */
function readbackFor(H, w, h) {
  H.readbacks ??= new Map();
  const k = `${w}x${h}`;
  if (!H.readbacks.has(k)) H.readbacks.set(k, new GPUReadback(H, w, h));
  return H.readbacks.get(k);
}

/** Readback cost at a size, on a scene already attached: per-frame times of render-only, and of each readback path. */
async function readbackTiming(H, w, h, frames) {
  setSize(H, w, h);
  const out = new Uint8Array(w * h * 4);
  const render = []; const a = []; const b = []; const c = [];
  if (H.kind === 'webgl') {
    const rb = new Readback(H.renderer.getContext(), w, h);
    for (let i = 0; i < frames + 3; i++) {
      let t0 = now(); H.host.render(1, false); H.sync(); const tr = now() - t0;
      t0 = now(); rb.readNow(out); const ts = now() - t0;                     // synchronous readPixels
      H.host.render(1, false);
      t0 = now(); rb.read(0); const tq = now() - t0;                           // PBO + fence: issue
      t0 = now(); rb.take(0, out); const tt = now() - t0;                      // … and take (same frame: the worst case)
      if (i >= 3) { render.push(tr); a.push(ts); b.push(tq + tt); }
    }
    // pipelined as @vrmxg/export does it: read frame n, take frame n − 1
    for (let i = 0; i < frames + 1; i++) {
      H.host.render(1, false);
      const t0 = now(); rb.read(i & 1); if (i > 0) rb.take((i - 1) & 1, out); if (i > 0) c.push(now() - t0);
    }
    rb.dispose();
    return { size: `${w}x${h}`, renderMs: stats(render), readPixelsSyncMs: stats(a), pboSameFrameMs: stats(b), pboPipelinedMs: stats(c), hash: hashFrame(out) };
  }
  const rb = new GPUReadback(H, w, h);
  const threeAsync = [];
  for (let i = 0; i < frames + 3; i++) {
    let t0 = now(); await rb.draw(() => H.host.render(1, false)); await H.sync(); const tr = now() - t0;
    t0 = now(); rb.read(0); await rb.take(0, out); const tm = now() - t0;                    // copy + mapAsync + copy out, frame done
    t0 = now(); await H.renderer.readRenderTargetPixelsAsync(rb.rt, 0, 0, w, h); const t3 = now() - t0; // three's own helper
    t0 = now(); await rb.draw(() => H.host.render(1, false)); rb.read(1); await rb.take(1, out); const tf = now() - t0; // render + read, unsynchronised
    if (i >= 3) { render.push(tr); a.push(tm); threeAsync.push(t3); b.push(tf - tr); }
  }
  // pipelined: draw frame n, read it into slot n % 3, take frame n − 1 (the export loop)
  for (let i = 0; i < frames + 1; i++) {
    await rb.draw(() => H.host.render(1, false));
    const t0 = now(); rb.read(i % 3); if (i > 0) { await rb.take((i - 1) % 3, out); c.push(now() - t0); }
  }
  await rb.take(frames % 3, out);
  rb.dispose();
  return { size: `${w}x${h}`, renderMs: stats(render), mapAsyncAfterFrameMs: stats(a), threeReadRenderTargetPixelsAsyncMs: stats(threeAsync), renderPlusReadMinusRenderMs: stats(b), pipelinedMs: stats(c), hash: hashFrame(out) };
}

/** One export: a fresh renderer and world, the walk replayed from step 0, `frames` frames at `fps`, each frame hashed. */
async function exportOnce(R, sample, kind, { w, h, frames, fps, post }) {
  const H = await makeHost(kind);
  const { tree, input } = await makeWorld(R, sample, H);
  setPost(H, tree, post);
  input.replay(JSON.parse(await text('input/walk-in.json')));
  setSize(H, w, h);
  const hashes = [], ms = [], out = new Uint8Array(w * h * 4);
  let shot = null;
  const t0 = now();
  if (kind === 'webgl') {
    const rb = new Readback(H.renderer.getContext(), w, h);
    for (let n = 0; n < frames; n++) {
      const t1 = now();
      const { step, alpha } = frameToStep(n, fps);
      await H.host.frameAt(step, alpha);
      rb.read(n & 1);
      if (n > 0) hashes.push(hashFrame(rb.take((n - 1) & 1, out)));
      ms.push(now() - t1);
    }
    hashes.push(hashFrame(rb.take((frames - 1) & 1, out)));
    shot = { w, h, rgba: toImageRGBA(out, w, h) };
    rb.dispose();
  } else {
    const rb = new GPUReadback(H, w, h);
    for (let n = 0; n < frames; n++) {
      const t1 = now();
      const { step, alpha } = frameToStep(n, fps);
      await rb.draw(() => H.host.frameAt(step, alpha));
      rb.read(n % 3);
      if (n > 0) hashes.push(hashFrame(await rb.take((n - 1) % 3, out)));
      ms.push(now() - t1);
    }
    hashes.push(hashFrame(await rb.take((frames - 1) % 3, out)));
    shot = { w, h, rgba: new Uint8ClampedArray(out) };
    rb.dispose();
  }
  const total = now() - t0;
  const res = { hashes, final: hashValue(worldHashes(tree)), perFrameMs: stats(ms), totalMs: +total.toFixed(1), info: H.info(), passes: H.host.post?.passes ?? null };
  H.host.dispose();
  return { res, shot };
}

function pngOf({ w, h, rgba }, scale = 0.5) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  if (scale === 1) return c.toDataURL('image/png');
  const d = document.createElement('canvas'); d.width = Math.round(w * scale); d.height = Math.round(h * scale);
  d.getContext('2d').drawImage(c, 0, 0, d.width, d.height);
  return d.toDataURL('image/png');
}

// ------------------------------------------------------------------ modes
async function probe() {
  const r = { ua: navigator.userAgent, isSecureContext, crossOriginIsolated: self.crossOriginIsolated, origin: location.origin, navigatorGpu: !!navigator.gpu };
  r.timerResolutionMs = (() => { let min = Infinity, last = now(); for (let i = 0; i < 200000 && min > 0.0005; i++) { const t = now(); if (t !== last) { min = Math.min(min, t - last); last = t; } } return +min.toFixed(4); })();
  if (navigator.gpu) {
    r.preferredCanvasFormat = navigator.gpu.getPreferredCanvasFormat();
    r.wgslLanguageFeatures = navigator.gpu.wgslLanguageFeatures ? [...navigator.gpu.wgslLanguageFeatures].sort() : null;
    const t0 = now();
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    r.requestAdapterMs = +(now() - t0).toFixed(2);
    if (adapter) {
      const info = adapter.info ?? {};
      r.adapter = { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description, isFallbackAdapter: adapter.isFallbackAdapter ?? info.isFallbackAdapter };
      r.features = [...adapter.features].sort();
      const L = {}; for (const k of ['maxTextureDimension2D', 'maxBufferSize', 'maxStorageBufferBindingSize', 'maxColorAttachments', 'maxColorAttachmentBytesPerSample', 'maxComputeWorkgroupStorageSize', 'maxSampledTexturesPerShaderStage', 'maxBindGroups']) L[k] = adapter.limits[k];
      r.limits = L;
      const d = await adapter.requestDevice();
      r.device = !!d;
      d.destroy();
    } else r.adapter = null;
    try {
      const H = await makeHost('webgpu', { post: false });
      r.threeBackend = H.backend;
      r.threeRevision = three.REVISION;
      H.renderer.dispose();
    } catch (e) { r.threeError = String(e?.stack ?? e).slice(0, 500); }
  }
  return r;
}

async function view() {
  const R = await loadRapier();
  const sample = withEmitters(await loadSample(bytes));
  const H = await makeHost(KIND);
  const { tree, swapped } = await makeWorld(R, sample, H);
  // ?post=anime | none | a comma list of effect names (defaults), e.g. post=edges,toneMapping
  const p = q.get('post') ?? 'anime';
  const post = p === 'none' ? null : (p === 'anime' || p === 'clean') ? p : p.split(',').map((effect) => ({ effect }));
  setPost(H, tree, post);
  await H.host.post?.settle?.();
  const w = +(q.get('w') ?? 1920), h = +(q.get('h') ?? 1080);
  setSize(H, w, h);
  for (let k = 0; k < 120; k++) await H.host.frameAt(k + 1, 1);
  // ?seq=a;b;c: set these posts in turn (each a preset name, none, or a comma list), one frame each, before `post`
  const named = (x) => (x === 'none' ? null : x === 'anime' || x === 'clean' ? x : x === 'animeLut' ? [...ANIME, { effect: 'lut', file: 'looks/morning.cube' }] : x.split(',').map((effect) => ({ effect }))); 
  for (const x of (q.get('seq') ?? '').split(';').filter(Boolean)) { setPost(H, tree, named(x)); await H.host.post?.settle?.(); H.host.render(1, false); await H.sync(); }
  setPost(H, tree, post); await H.host.post?.settle?.();
  // ?toggle=n: switch the stack off and on n times (rebuilds), ?big=1: draw once at 4K and back
  for (let i = 0; i < +(q.get('toggle') ?? 0); i++) { setPost(H, tree, null); H.host.render(1, false); setPost(H, tree, post); H.host.render(1, false); }
  if (q.get('big') === '1') { setSize(H, 3840, 2160); H.host.render(1, false); await H.sync(); setSize(H, w, h); }
  const shots = [{ name: `${KIND}-view-${(q.get('tag') ?? p).replace(/[^\w-]/g, '_')}`, dataUrl: await stillPNG(H, w, h) }];
  return { kind: KIND, backend: H.backend ?? 'WebGL2', swapped, passes: H.host.post?.passes, info: await frameInfo(H), shots };
}

async function bench() {
  const R = await loadRapier();
  const sample = withEmitters(await loadSample(bytes));
  const H = await makeHost(KIND);
  const { tree, swapped } = await makeWorld(R, sample, H);
  for (let k = 0; k < 120; k++) await H.host.frameAt(k + 1, 1); // steam and dust going, Mira in the door
  setSize(H, 1920, 1080);
  const stage0 = q.get('stages') === '1' ? await stillPNG(H, 1920, 1080) : null;
  const out = { kind: KIND, backend: H.backend ?? 'WebGL2', quarks: QUARKS_BACKEND, swappedMaterials: swapped, cost: {}, passes: {}, calls: {}, shots: [] };
  if (stage0) out.shots.push({ name: `${KIND}-stage-start`, dataUrl: stage0 });
  // warm-up: 2 s of the anime stack at 4K, so the first timed case doesn't pay for clocks ramping up or shader compiles
  setPost(H, tree, 'anime'); setSize(H, 3840, 2160);
  { const t0 = now(); while (now() - t0 < 2000) { H.host.render(1, false); await H.sync(); } }
  const cases = [['none', null], ['anime', 'anime'], ['animeLut', [...ANIME, { effect: 'lut', file: 'looks/morning.cube' }]]];
  for (const [name, post] of cases) {
    setPost(H, tree, post);
    await H.host.post?.settle?.();
    for (const [label, w, h, n] of [['1080p', 1920, 1080, 40], ['4k', 3840, 2160, 25]]) {
      setSize(H, w, h);
      out.cost[`${name}.${label}`] = await timeRenders(H, n);
      (out.throughputMs ??= {})[`${name}.${label}`] = await throughput(H, 30);
      out.calls[`${name}.${label}`] = await frameInfo(H);
    }
    out.passes[name] = H.host.post?.active ? H.host.post.passes : null;
    if (q.get('stages') === '1') { setSize(H, 1920, 1080); try { out.shots.push({ name: `${KIND}-stage-${name}`, dataUrl: await stillPNG(H, 1920, 1080) }); } catch (e) { (out.stageErrors ??= []).push(`${name}: ${e.message}`); } }
  }
  // a still of the anime look at 1080p (through the readback: canvas snapshots differ by API)
  setPost(H, tree, 'anime'); setSize(H, 1920, 1080);
  out.shots.push({ name: `${KIND}-anime-1080p`, dataUrl: await stillPNG(H, 1920, 1080) });
  setPost(H, tree, null);
  out.shots.push({ name: `${KIND}-nopost-1080p`, dataUrl: await stillPNG(H, 1920, 1080) });
  return out;
}

/** The hash of what the host draws now, at a size (the same bytes an export would read back). */
async function frameHash(H, w, h, keep) {
  const out = new Uint8Array(w * h * 4);
  if (H.kind === 'webgl') { H.host.render(1, false); H.renderer.getContext().readPixels(0, 0, w, h, 0x1908, 0x1401, out); keep?.(out); return hashFrame(out); }
  const rb = readbackFor(H, w, h); await rb.draw(() => H.host.render(1, false)); rb.read(0); await rb.take(0, out); keep?.(out); return hashFrame(out);
}

/** Shader modules whose code differs between the first two devices that compiled any (by label). */
function wgslDiff() {
  // devices: [0] = the probe's first renderer (world A), [1] = world B's; labels both compiled with different code
  const [a, b] = [WGSL[0], WGSL[WGSL.length - 1]];
  const out = { devices: WGSL.length, modules: WGSL.map((m) => m.size), differing: [] };
  // names normalised (nodeUniform12 → U, nodeVar3 → V): what is left is a real difference in order or arithmetic
  const norm = (c) => c.replace(/nodeUniform\d+/g, 'U').replace(/nodeVar\d+/g, 'V').replace(/@binding\( \d+ \)/g, '@binding(n)');
  for (const [label, code] of a) if (b.has(label) && norm(b.get(label)) !== norm(code)) {
    const la = norm(code).split('\n'), lb = norm(b.get(label)).split('\n'), lines = [];
    for (let i = 0; i < Math.max(la.length, lb.length) && lines.length < 30; i++) if (la[i] !== lb[i]) lines.push({ line: i, a: la[i]?.slice(0, 300), b: lb[i]?.slice(0, 300) });
    out.differing.push({ label, lines });
  }
  out.onlyInFirst = [...a.keys()].filter((k) => !b.has(k)).slice(0, 20);
  out.onlyInSecond = [...b.keys()].filter((k) => !a.has(k)).slice(0, 20);
  return out;
}

/** Where two RGBA frames differ: pixels per channel, the largest difference, the bounding box. */
function frameDiff(a, b, w) {
  const ch = [0, 0, 0, 0]; let px = 0, max = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < a.length; i += 4) {
    let any = false;
    for (let c = 0; c < 4; c++) { const d = Math.abs(a[i + c] - b[i + c]); if (d) { ch[c]++; any = true; max = Math.max(max, d); } }
    if (any) { px++; const p = i / 4, x = p % w, y = Math.floor(p / w); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  return { pixels: px, perChannel: { r: ch[0], g: ch[1], b: ch[2], a: ch[3] }, maxDelta: max, box: px ? [x0, y0, x1, y1] : null };
}

async function stillPNG(H, w, h) {
  const out = new Uint8Array(w * h * 4);
  if (H.kind === 'webgl') { H.host.render(1, false); H.renderer.getContext().readPixels(0, 0, w, h, 0x1908, 0x1401, out); return pngOf({ w, h, rgba: toImageRGBA(out, w, h) }); }
  const rb = readbackFor(H, w, h); await rb.draw(() => H.host.render(1, false)); rb.read(0); await rb.take(0, out);
  return pngOf({ w, h, rgba: out });
}

async function exportMode() {
  const R = await loadRapier();
  const sample = withEmitters(await loadSample(bytes));
  const out = { kind: KIND, timing: [], exports: {}, shots: [] };
  // timing on a still frame of the anime look (the scene moved on 120 steps). ?timing=0 skips it, so export A is the
  // page's first renderer (see the README: the first WebGPURenderer in a page compiles some materials differently)
  if (q.get('timing') !== '0') {
    const H = await makeHost(KIND);
    out.backend = H.backend ?? 'WebGL2';
    const { tree } = await makeWorld(R, sample, H);
    setPost(H, tree, 'anime');
    for (let k = 0; k < 120; k++) await H.host.frameAt(k + 1, 1);
    out.timing.push(await readbackTiming(H, 1920, 1080, 40));
    out.timing.push(await readbackTiming(H, 3840, 2160, 20));
    H.host.dispose();
  }
  // without the node-frame tick (WebGPU): do consecutive offline frames change at all?
  if (KIND === 'webgpu' && q.get('timing') !== '0') out.withoutTick = await staleCheck(R, sample);
  out.firstRendererIsExportA = q.get('timing') === '0';
  // two exports, each with its own renderer and world: 1080p30, 90 frames (3 s, the walk and the particles moving)
  const F = +(q.get('frames') ?? 90);
  for (const [label, w, h, frames] of q.get('timing') === '0' ? [['1080p', 1920, 1080, F]] : [['1080p', 1920, 1080, F], ['4k', 3840, 2160, 12]]) {
    const A = await exportOnce(R, sample, KIND, { w, h, frames, fps: 30, post: 'anime' });
    const B = await exportOnce(R, sample, KIND, { w, h, frames, fps: 30, post: 'anime' });
    const diff = A.res.hashes.map((x, i) => (x === B.res.hashes[i] ? null : i)).filter((i) => i !== null);
    out.exports[label] = { frames, a: A.res, b: B.res, identical: diff.length === 0, differingFrames: diff, digest: hashValue(A.res.hashes) };
    if (label === '1080p') out.shots.push({ name: `${KIND}-export-1080p-last`, dataUrl: pngOf({ w, h, rgba: A.shot.rgba }) });
  }
  return out;
}

/** Offline frames 60..64 drawn with and without advancing the node frame: hashes of each. */
async function staleCheck(R, sample) {
  const res = {};
  for (const tick of [true, false]) {
    const H = await makeHost('webgpu');
    const { tree, input } = await makeWorld(R, sample, H);
    setPost(H, tree, 'anime');
    input.replay(JSON.parse(await text('input/walk-in.json')));
    setSize(H, 960, 540);
    const rb = new GPUReadback(H, 960, 540), out = new Uint8Array(960 * 540 * 4), hashes = [];
    const nf = H.renderer._nodes.nodeFrame, update = nf.update.bind(nf);
    if (!tick) nf.update = () => {}; // as if nothing advanced it (no rAF in between)
    for (let k = 60; k < 65; k++) { await rb.draw(() => H.host.frameAt(k * 2, 1)); rb.read(0); hashes.push(hashFrame(await rb.take(0, out))); }
    nf.update = update;
    rb.dispose(); H.host.dispose();
    res[tick ? 'tick' : 'noTick'] = { hashes, distinct: new Set(hashes).size };
  }
  return res;
}

async function particlesMode() {
  const R = await loadRapier();
  const sample = await loadSample(bytes);
  // the acceptance check, headless, in this page (reference: 976e7033e22ad048 in Node, Chromium, WKWebView)
  const headless = await runParticles(R, sample, opts, { now });
  // the same world rendered under this renderer every step (presentation runs: batches rebuild, the GPU draws)
  const STEPS_P = 360, SNAP_P = 180, LOAD = 40;
  const extra = q.get('fx') === '0' ? [] : [...EMITTERS, ...Array.from({ length: LOAD }, (_, i) => ({ id: `fx-load-${i}`, type: 'ParticleEmitter', parent: 'root', transform: { p: [-4 + (i % 8), 0.5, -2 + Math.floor(i / 8)] }, props: { effect: 'steam' } }))];
  const S = { ...sample, doc: { ...sample.doc, nodes: [...sample.doc.nodes, ...extra] } };
  // ?dummy=world|host: build (and drop) a world or a renderer first, to test whether page-global state reaches pixels
  if (q.get('dummy') === 'world') { const D = await makeHost(KIND, { post: false }); await makeWorld(R, S, D); }
  if (q.get('dummy') === 'host') await makeHost(KIND, { post: false });
  if (q.get('dummy') === 'materials') { const T = await import('three'); for (let i = 0; i < 5000; i++) new T.MeshBasicMaterial(); }
  if (q.get('dummy') === 'objects') { const T = await import('three'); for (let i = 0; i < 5000; i++) new T.Object3D(); }
  const H = await makeHost(KIND, { post: false });
  const { tree } = await makeWorld(R, S, H);
  setSize(H, 1280, 720);
  const run = [{ step: 0, h: worldHashes(tree) }], frameMs = [];
  let snap = null, maxCalls = 0, shot = null;
  // a camera on the emitters (the scene's own camera looks at the door), for the shot and the pixel checks
  const THREE = KIND === 'webgpu' ? three : await import('three');
  const fxCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 100);
  fxCam.position.set(1.5, 2.4, 3.2); fxCam.lookAt(-1.2, 0.9, -2.2); fxCam.updateMatrixWorld();
  const PIX = [200, 240, 280, 320, 360], pixA = {}, pixB = {}, pixShots = [];
  const raw = {};
  const pixHash = async (Hx, tag, k) => { const cam = Hx.host.camera; Hx.host.camera = fxCam; const h = await frameHash(Hx, 1280, 720, (b) => { if (k === 360) raw[tag] = b.slice(); }); Hx.host.camera = cam; return h; };
  for (let k = 1; k <= STEPS_P; k++) {
    const t0 = now();
    await H.host.frameAt(k, 1);
    await H.sync();
    frameMs.push(now() - t0);
    run.push({ step: k, h: worldHashes(tree, { physicsBytes: k % 60 === 0 }) });
    if (k === SNAP_P) snap = captureWorld(tree);
    if (k === 150) { const cam = H.host.camera; H.host.camera = fxCam; shot = await stillPNG(H, 1280, 720); maxCalls = (await frameInfo(H)).calls; H.host.camera = cam; }
    if (PIX.includes(k)) pixA[k] = await pixHash(H, 'a', k);
    if (k === 360 && q.get('pixshots') === '1') { const cam = H.host.camera; H.host.camera = fxCam; pixShots.push({ name: `${KIND}-pix-a-360`, dataUrl: await stillPNG(H, 1280, 720) }); H.host.camera = cam; }
  }
  const svc = tree.services.get('particles');
  // restore the mid-effect snapshot into a second rendered world and re-simulate
  // ?b=fresh: the second world runs from step 0 instead of the snapshot (pixels: is it the restore, or any second run?)
  const fresh = q.get('b') === 'fresh';
  const H2 = await makeHost(KIND, { post: false });
  const W2 = await makeWorld(R, S, H2);
  if (!fresh) restoreWorld(W2.tree, snap);
  const again = [];
  setSize(H2, 1280, 720);
  if (fresh) for (let k = 1; k <= SNAP_P; k++) await H2.host.frameAt(k, 1);
  for (let k = SNAP_P + 1; k <= STEPS_P; k++) {
    await H2.host.frameAt(k, 1);
    again.push({ step: k, h: worldHashes(W2.tree, { physicsBytes: k % 60 === 0 }) });
    if (PIX.includes(k)) pixB[k] = await pixHash(H2, 'b', k);
    if (k === 360 && q.get('pixshots') === '1') { const cam = H2.host.camera; H2.host.camera = fxCam; pixShots.push({ name: `${KIND}-pix-b-360`, dataUrl: await stillPNG(H2, 1280, 720) }); H2.host.camera = cam; }
  }
  const restored = compareRuns(run.slice(SNAP_P + 1), again);
  const final = hashValue(run.at(-1).h);
  return {
    kind: KIND, backend: H.backend ?? 'WebGL2', quarks: QUARKS_BACKEND, dummy: q.get('dummy') ?? null,
    headless: { final: headless.final, matchesReference: headless.final === '976e7033e22ad048', peakParticles: headless.peakParticles, stepMs: headless.stepMs },
    wgsl: WGSL.length ? wgslDiff() : undefined,
    diff360: raw.a && raw.b ? frameDiff(raw.a, raw.b, 1280) : null,
    pixels: { second: fresh ? 'fresh run from step 0' : 'restored at 180', emitters: extra.length, steps: PIX, run: pixA, restored: pixB, identical: PIX.every((k) => pixA[k] === pixB[k]), distinct: new Set(Object.values(pixA)).size },
    rendered: { final, sameAsHeadless: final === headless.final, snapshotRerunMatches: restored === null, divergence: restored, batches: svc.batch.batches?.length, batchClass: svc.batch.constructor.name, maxDrawCalls: maxCalls, frameMs: stats(frameMs), live: svc.count() },
    shots: [...(shot ? [{ name: `${KIND}-particles-720p`, dataUrl: shot }] : []), ...pixShots],
  };
}

// ------------------------------------------------------------------ run
const MODES = { probe, view, bench, export: exportMode, particles: particlesMode };
(async () => {
  let result;
  log(`[spike] ${MODE} ${KIND} ${location.origin}`);
  try { result = await MODES[MODE](); } catch (e) { result = { failed: String(e?.stack ?? e).slice(0, 1500) }; console.error(e); }
  result.mode = MODE; result.renderer = KIND; result.origin = location.origin; result.ua = navigator.userAgent;
  result.errors = window.__errors.slice(0, 40); result.warnings = [...new Set(window.__warnings)].slice(0, 40);
  const shots = result.shots ?? []; delete result.shots;
  result.shotNames = shots.map((s) => s.name);
  window.__result = result; window.__shots = shots;
  log(JSON.stringify(result).slice(0, 2000));
  const save = q.get('save');
  if (save && location.port === '5241') {
    await fetch(`/__save/${save}`, { method: 'POST', body: JSON.stringify(result, null, 2) });
    for (const s of shots) await fetch(`/__shot/${s.name}`, { method: 'POST', body: s.dataUrl });
  }
  window.webkit?.messageHandlers?.spike?.postMessage(JSON.stringify({ type: 'results', payload: { result, shots } }));
  window.READY = true;
})();
