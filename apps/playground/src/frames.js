// M4 W2 (AB-T-0574): particles and readback on this page's backend (?mode=frames&renderer=webgpu|webgl). Each part
// draws offline on hosts of its own (RenderHost.create on the page's backend, dprCap 1: the size asked for is the
// drawing buffer), reads every frame back through @vrmxg/export's readbackFor (WebGPU: an output target, a ring of 3
// map buffers) and hashes it:
//   particles   check 13's scene (the cafe, steam, dust, sparks and 40 more steam emitters) drawn every step on the
//               host's own BatchedRenderer: the world hashes at every step as headless (the same run as check 13); a
//               snapshot mid-effect, restored into a fresh world on a fresh host, re-simulates and draws the same frames
//   film        the morning film (sequences/cafe-morning.vrmxs, with the espresso's steam) exported twice through
//               exportTake to a hash sink, each on a fresh host and world: the two must agree frame for frame
//   still       captureStill against the canvas's own pixels (toDataURL in the drawing task): the same image, the right
//               way up
//   readback    the readback's cost per frame at 1080p and 4K: in the export loop (read frame n, take n − 1) and after
//               a finished frame
// Frames are exact per engine: Chromium's and WebKit's differ (AB-T-0554 gotcha 10), so the runners compare each
// runtime with itself (two loads, and WKWebView's two origins).
import { PerspectiveCamera, Scene, Mesh, PlaneGeometry, MeshBasicMaterial } from 'three';
import { RenderHost } from '@vrmxg/render';
import { frameToStep } from '@vrmxg/core';
import { exportTake, hashSink, hashFrame, readbackFor, captureStill, toImageRGBA, framesFor, RATES, SIZES } from '@vrmxg/export';
import { captureWorld, restoreWorld, worldHashes, hashValue, packRun } from '@vrmxg/snapshot';
import { buildWorld, loadSample } from './world.js';
import { runParticles, withParticleLoad, PARTICLE_STEPS, PARTICLE_SNAPSHOT_AT } from './acceptance.js';

// ?wgsl=1 (AB-T-0589): every shader module each device compiles (label, code), so filmRepeat can say whether an odd
// export compiled anything the others didn't (the spike's gotcha 6 hunt)
const WGSL = new Map(); // device → [{ label, code }]
if (typeof window !== 'undefined') window.__wgsl = WGSL; // the runners can dump them
if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('wgsl') === '1' && typeof GPUDevice !== 'undefined') {
  const create = GPUDevice.prototype.createShaderModule;
  GPUDevice.prototype.createShaderModule = function (d) {
    if (!WGSL.has(this)) WGSL.set(this, []);
    WGSL.get(this).push({ label: d.label ?? '', code: d.code });
    return create.call(this, d);
  };
}
/** Names normalised (nodeUniform12 → U, nodeVar3 → V, bindings): what is left is a real difference in order or arithmetic. */
const normWGSL = (c) => c.replace(/nodeUniform\d+/g, 'U').replace(/nodeVar\d+/g, 'V').replace(/@binding\( ?\d+ ?\)/g, '@binding(n)');
const strHash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return (h >>> 0).toString(16).padStart(8, '0'); };

const now = () => performance.now();
const r3 = (x) => +x.toFixed(3);
/** The share of pixels with anything in them (a blank read is 0): every byte of RGBA, not a sample. */
const content = (bytes) => { const u = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2); let n = 0; for (let i = 0; i < u.length; i++) if (u[i]) n++; return +(n / u.length).toFixed(4); };
const stats = (a) => { const s = [...a].sort((x, y) => x - y); return { median: r3(s[s.length >> 1]), p95: r3(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]), min: r3(s[0]), n: s.length }; };

/** A host of its own for offline frames, on `backend`. */
/** A read-back frame as a PNG data URL, the right way up (toImageRGBA with the readback's row order), scaled to look at. */
function pngOf(bytes, width, height, topDown, scale = 1) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  c.getContext('2d').putImageData(new ImageData(toImageRGBA(bytes, width, height, { topDown }), width, height), 0, 0);
  if (scale === 1) return c.toDataURL('image/png');
  const d = document.createElement('canvas'); d.width = Math.round(width * scale); d.height = Math.round(height * scale);
  const g = d.getContext('2d'); g.imageSmoothingEnabled = scale < 1; g.drawImage(c, 0, 0, d.width, d.height);
  return d.toDataURL('image/png');
}
const offlineHost = (backend, post) => RenderHost.create({ canvas: document.createElement('canvas'), backend, dprCap: 1, post });
const dropHost = (host) => { host.dispose(); host.renderer.forceContextLoss?.(); };
/** Wait until the GPU has done what was submitted (timings that must include it). */
const gpuDone = async (host) => { if (host.renderer.isWebGPURenderer) await host.renderer.backend.device.queue.onSubmittedWorkDone(); else host.renderer.getContext().finish(); };

/**
 * Check 13 drawn: every step a frame, read back and hashed; the world hashed at every step as check 13 does headless.
 * @param {{ R: any, sample: any, opts: any, backend: string, post?: any, width?: number, height?: number }} o
 */
export async function particlesRendered({ R, sample, opts, backend, post = null, width = 960, height = 540 }) {
  const headless = await runParticles(R, sample, opts); // the reference: check 13 exactly as Node runs it
  const { sample: S } = withParticleLoad(sample);
  const STEPS = PARTICLE_STEPS, SNAP = PARTICLE_SNAPSHOT_AT;
  const out = new Uint8Array(width * height * 4);
  /** Draw `world` from step `from` to STEPS on `host`, a frame per step (α 1), each read back a frame later. */
  let shot = null;
  const draw = async (host, tree, from, each, keepAt = -1) => {
    host.attach(tree);
    // a fixed view onto the emitters (the follow camera faces the doors): presentation only, the world hashes don't see it
    host.camera = new PerspectiveCamera(50, width / height, 0.05, 100);
    host.camera.position.set(-0.5, 2.2, 5.5); host.camera.lookAt(-0.8, 0.9, -1.5); host.camera.updateMatrixWorld();
    host.resize(width, height);
    const rb = readbackFor(host, width, height), slots = Math.min(rb.ring, 3), frames = {};
    const ms = { render: 0, readback: 0 };
    let prev = null;
    for (let k = from; k <= STEPS; k++) {
      let t = now();
      await rb.draw(() => host.frameAt(k, 1));
      ms.render += now() - t;
      each?.(k);
      t = now();
      rb.read(k % slots);
      if (prev !== null) frames[prev] = hashFrame(await rb.take(prev % slots, out));
      ms.readback += now() - t;
      if (prev === keepAt) shot = pngOf(out, width, height, rb.topDown);
      prev = k;
    }
    frames[prev] = hashFrame(await rb.take(prev % slots, out));
    rb.release();
    const n = STEPS - from + 1;
    return { frames, perFrameMs: { render: r3(ms.render / n), readback: r3(ms.readback / n) } };
  };
  // A: from step 0, a snapshot at SNAP
  const hostA = await offlineHost(backend, post);
  const A = await buildWorld(R, S, { ...opts, mtoonMaterial: hostA.mtoonMaterial });
  const run = []; let snap = null;
  const a = await draw(hostA, A.tree, 0, (k) => {
    run.push({ step: k, h: k === 0 ? worldHashes(A.tree) : worldHashes(A.tree, { physicsBytes: k % 60 === 0 }) });
    if (k === SNAP) snap = captureWorld(A.tree);
  }, 300);
  const svc = A.tree.services.get('particles');
  const which = svc.batch && svc.batch.constructor === hostA.particleRenderer ? (backend === 'webgpu' ? 'three.quarks/webgpu' : 'three.quarks') : svc.batch ? 'another' : null;
  const batch = { renderer: which, batches: svc.batch?.batches.length ?? 0, particles: svc.count() };
  dropHost(hostA);
  // B: a fresh world on a fresh host, restored from the snapshot, drawn from SNAP (no step: the restored state as it is)
  const hostB = await offlineHost(backend, post);
  const B = await buildWorld(R, S, { ...opts, mtoonMaterial: hostB.mtoonMaterial });
  restoreWorld(B.tree, snap);
  const again = [];
  const b = await draw(hostB, B.tree, SNAP, (k) => { if (k > SNAP) again.push({ step: k, h: worldHashes(B.tree, { physicsBytes: k % 60 === 0 }) }); });
  dropHost(hostB);
  const sameRun = JSON.stringify(packRun(run)) === JSON.stringify(headless.run);
  const restoredWorld = again.every((r, i) => hashValue(r.h) === hashValue(run[SNAP + 1 + i].h));
  const differ = Object.keys(b.frames).filter((k) => b.frames[k] !== a.frames[k]).map(Number);
  return {
    steps: STEPS, size: [width, height], final: hashValue(run.at(-1).h), headlessFinal: headless.final, sameAsHeadless: sameRun,
    batch, distinctFrames: new Set(Object.values(a.frames)).size, lastFrame: a.frames[STEPS],
    framesDigest: hashValue(Object.values(a.frames).join(',')),
    snapshot: { at: SNAP, worldMatches: restoredWorld, framesCompared: Object.keys(b.frames).length, framesDiffer: differ },
    perFrameMs: a.perFrameMs, shot,
  };
}

/**
 * The morning film exported twice through exportTake (hash sink), each on a fresh host and a fresh world.
 * @param {{ R: any, sample: any, opts: any, backend: string, post?: any, size?: string, fps?: string, frames?: number | null, audio?: boolean }} o
 */
export async function filmExport({ R, sample, opts, backend, post = null, size = '1080p', fps = '24', frames = null, audio = true }) {
  const [width, height] = SIZES[size], rate = RATES[fps];
  const S = await loadSample(sample.bytes, 'sequences/cafe-morning.vrmxs');
  let shot = null;
  const once = async (keepAt = -1) => {
    const host = await offlineHost(backend, post);
    const w = await buildWorld(R, S, { ...opts, mtoonMaterial: host.mtoonMaterial });
    const n = frames ?? framesFor(w.sequence.duration / w.sequence.fps, rate);
    const hs = hashSink(), worldAt = [];
    const sink = { ...hs, frame(k, bytes) { if (k === keepAt) shot = pngOf(bytes, width, height, hs.job.topDown, 0.5); return hs.frame(k, bytes); } };
    const r = await exportTake({ tree: w.tree, host, fps: rate, frames: n, width, height, sink, audio, now,
      onFrame: (k) => { if (k % 24 === 0) worldAt.push(hashValue(worldHashes(w.tree, { physicsBytes: true }))); } });
    const steamDrawn = !!w.particles.batch && w.particles.batch.constructor === host.particleRenderer && w.particles.batch.batches.length > 0;
    dropHost(host);
    w.audio?.dispose?.();
    return { ...r, worldAt, steamDrawn };
  };
  const x = await once(Math.min(600, (frames ?? 1e9) - 1)), y = await once();
  const differ = x.frameHashes.map((h, i) => (h === y.frameHashes[i] ? -1 : i)).filter((i) => i >= 0);
  const pick = ({ frameHashes, began, worldAt, ...r }) => ({ ...r, digest: hashValue(frameHashes.join(',')), distinct: new Set(frameHashes).size, worldDigest: hashValue(worldAt.join(',')) });
  return {
    size: [width, height], fps, frames: x.frames, first: pick(x), second: pick(y),
    identical: !differ.length && x.frameHashes.length === y.frameHashes.length && x.audioHash === y.audioHash,
    framesDiffer: differ.slice(0, 20), worldSame: x.worldAt.join() === y.worldAt.join(), shot,
  };
}

/**
 * captureStill against the canvas itself: the view host drawn at the still's size, its canvas read with toDataURL in the
 * drawing task (the frame just drawn, AB-L-0372) and decoded, against captureStill's RGBA. Opaque pixels must be equal
 * (a PNG round trip keeps them exact), so a still that came out flipped or shifted shows at once. Then the view must
 * still follow a resize: a still draws into an output target on the view's own renderer.
 * The view is given a real size first. In Chromium a WebGPU canvas still at the browser's default 300×150 when an
 * output target is drawn stopped following resizes (toDataURL kept giving 300×150); a sized view never did.
 * @param {any} host the playground's view host, a tree attached @param {HTMLCanvasElement} canvas its canvas
 */
export async function stillCheck(host, canvas, { width = 640, height = 360, view = [1280, 720], keep = false } = {}) {
  const r = host.renderer, ratio = r.getPixelRatio(), was = host.drawingBufferSize();
  const decode = async (url) => {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, data: g.getImageData(0, 0, img.width, img.height).data };
  };
  r.setPixelRatio(1); host.resize(view[0], view[1]); host.advanceNodeFrame(); host.render(1, false);
  // the frame on the canvas at the still's size, read in the drawing task
  host.resize(width, height); host.advanceNodeFrame(); host.render(1, false);
  const url = canvas.toDataURL('image/png');
  host.resize(view[0], view[1]); host.render(1, false);
  const still = await captureStill(host, { width, height });
  const again = await captureStill(host, { width, height });
  // the view after the stills: it must have its own size back and keep drawing
  host.advanceNodeFrame(); host.render(1, false);
  const after = await decode(canvas.toDataURL('image/png'));
  r.setPixelRatio(ratio); host.resize(was.width / ratio, was.height / ratio); host.render(1, false);
  const ref = (await decode(url)).data;
  let opaque = 0, differ = 0, max = 0, flippedDiffer = 0;
  const row = width * 4;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * row + x * 4, f = (height - 1 - y) * row + x * 4;
    if (ref[i + 3] !== 255 || still.rgba[i + 3] !== 255) continue;
    opaque++;
    const m = Math.max(Math.abs(ref[i] - still.rgba[i]), Math.abs(ref[i + 1] - still.rgba[i + 1]), Math.abs(ref[i + 2] - still.rgba[i + 2]));
    if (m) differ++;
    if (m > max) max = m;
    if (ref[f] !== still.rgba[i] || ref[f + 1] !== still.rgba[i + 1] || ref[f + 2] !== still.rgba[i + 2]) flippedDiffer++;
  }
  const h = (rgba) => hashFrame(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength));
  let shots;
  if (keep) {
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(still.rgba), width, height), 0, 0);
    shots = { canvas: url, still: c.toDataURL('image/png') };
  }
  return {
    size: [width, height], hash: h(still.rgba), repeats: h(again.rgba) === h(still.rgba), pixels: width * height, opaque, differ, maxDiff: max,
    upsideDownWouldDiffer: flippedDiffer, viewAfter: [after.w, after.h], viewFollows: after.w === view[0] && after.h === view[1], shots,
  };
}

/**
 * The readback's cost per frame at each size on a cafe frame: `exportLoop` reads frame n and takes frame n − 1 (what
 * exportTake does; the frame's render not included), `afterFrame` reads and takes a frame the GPU has finished.
 * @param {any} host an offline host with the world attached
 */
export async function readbackCost(host, { sizes = ['1080p', '4k', '1366x768'], frames = 30 } = {}) {
  const out = {};
  for (const size of sizes) {
    const [w, h] = SIZES[size] ?? size.split('x').map(Number); // 1366×768: rows padded to 256 bytes in the copy
    host.resize(w, h);
    const rb = readbackFor(host, w, h), buf = new Uint8Array(w * h * 4), slots = Math.min(rb.ring, 3);
    const render = [], loop = [], after = [];
    for (let i = 0; i < 3; i++) { host.advanceNodeFrame(); await rb.draw(() => host.render(1, false)); rb.read(0); await rb.take(0, buf); } // warm
    for (let i = 0; i < frames; i++) {
      host.advanceNodeFrame();
      let t = now(); await rb.draw(() => host.render(1, false)); await gpuDone(host); render.push(now() - t);
      t = now(); rb.read(0); await rb.take(0, buf); after.push(now() - t);
    }
    for (let i = 0; i <= frames; i++) { // pipelined, as the export loop runs it
      host.advanceNodeFrame();
      await rb.draw(() => host.render(1, false));
      const t = now(); rb.read(i % slots); if (i > 0) { await rb.take((i - 1) % slots, buf); loop.push(now() - t); }
    }
    await rb.take(frames % slots, buf);
    rb.release();
    out[size] = { renderMs: stats(render), exportLoopMs: stats(loop), afterFrameMs: stats(after), hash: hashFrame(buf), content: content(buf) };
  }
  return out;
}

/**
 * An export after a still on the same host (PR #7 review: on WebGPU a second output target came back empty): a 640×360
 * still, then 24 film frames at 1080p on that host, against the same 24 frames on a fresh host. They must be equal and
 * have content.
 */
export async function reuseCheck({ R, sample, opts, backend, post = null, frames = 24 }) {
  const S = await loadSample(sample.bytes, 'sequences/cafe-morning.vrmxs');
  const run = async (stillFirst) => {
    const host = await offlineHost(backend, post);
    const w = await buildWorld(R, S, { ...opts, mtoonMaterial: host.mtoonMaterial });
    let still = null;
    if (stillFirst) { host.attach(w.tree); host.resize(1280, 720); still = content(new Uint8Array((await captureStill(host, { width: 640, height: 360 })).rgba.buffer)); }
    let first = null;
    const hs = hashSink(), sink = { ...hs, frame(k, bytes) { if (k === 0) first = content(bytes); return hs.frame(k, bytes); } };
    const r = await exportTake({ tree: w.tree, host, fps: RATES['24'], frames, width: 1920, height: 1080, sink, audio: false });
    dropHost(host);
    return { hashes: r.frameHashes, still, firstFrameContent: first };
  };
  const a = await run(true), b = await run(false);
  const differ = a.hashes.map((h, i) => (h === b.hashes[i] ? -1 : i)).filter((i) => i >= 0);
  return { frames, stillContent: a.still, firstFrameContent: a.firstFrameContent, freshFirstFrameContent: b.firstFrameContent, same: !differ.length, framesDiffer: differ };
}

/**
 * What a half-transparent pixel reads back as (W10's alpha export): a red quad at opacity 0.5 filling the view, nothing
 * behind it, the clear transparent. The raw bytes of the middle pixel, and what toImageRGBA makes of them.
 */
export async function alphaCheck({ backend }) {
  const host = await offlineHost(backend, null), r = host.renderer;
  const scene = new Scene();
  scene.add(new Mesh(new PlaneGeometry(4, 4), new MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 })));
  const cam = new PerspectiveCamera(50, 1, 0.1, 10); cam.position.z = 2; cam.updateMatrixWorld();
  r.setClearColor(0x000000, 0);
  r.setPixelRatio(1); host.resize(64, 64);
  const rb = readbackFor(host, 64, 64), buf = new Uint8Array(64 * 64 * 4);
  host.advanceNodeFrame();
  await rb.draw(() => r.render(scene, cam));
  await rb.readNow(buf);
  rb.release?.();
  const i = (32 * 64 + 32) * 4, raw = [...buf.subarray(i, i + 4)];
  const img = toImageRGBA(buf, 64, 64, { topDown: rb.topDown }), shown = [...img.subarray(i, i + 4)];
  dropHost(host);
  return { raw, toImageRGBA: shown, clearCorner: [...buf.subarray(0, 4)] };
}

/** Everything above, on this page's backend. */
export async function framesCheck({ R, sample, opts, backend, post, view, canvas, parts = ['particles', 'film', 'still', 'readback', 'reuse', 'alpha'], film = {} }) {
  const res = { backend };
  const t0 = now();
  if (parts.includes('particles')) res.particles = await particlesRendered({ R, sample, opts, backend, post });
  if (parts.includes('film')) res.film = await filmExport({ R, sample, opts, backend, post, ...film });
  if (parts.includes('filmRepeat')) res.filmRepeat = await filmRepeat({ R, sample, opts, backend, post, view, ...film });
  if (parts.includes('sameFrame')) res.sameFrame = await sameFrame({ R, sample, opts, backend, post, ...film });
  if (parts.includes('still')) res.still = await stillCheck(view, canvas, { keep: true });
  if (parts.includes('readback')) {
    const host = await offlineHost(backend, post);
    const w = await buildWorld(R, sample, { ...opts, mtoonMaterial: host.mtoonMaterial });
    w.input.replay(JSON.parse(new TextDecoder().decode(await sample.bytes('input/walk-in.json'))));
    host.attach(w.tree); host.resize(1280, 720);
    await host.frameAt(420, 0.5); // Mira inside, Hana at the counter (the backends check's still)
    // a still first, on the same renderer: every size after it is another size of the one output target (PR #7 review)
    const still = await captureStill(host, { width: 640, height: 360 });
    host.resize(1280, 720);
    res.readback = { still640: { content: content(new Uint8Array(still.rgba.buffer)) }, ...(await readbackCost(host)) };
    dropHost(host);
  }
  if (parts.includes('reuse')) res.reuse = await reuseCheck({ R, sample, opts, backend, post });
  if (parts.includes('alpha')) res.alpha = await alphaCheck({ backend });
  res.ms = Math.round(now() - t0);
  return res;
}

/**
 * Hunting a frame that differs between exports (?mode=frames&parts=filmRepeat&frames=N&repeat=3): the film exported
 * `repeat` times in one page, each on a fresh host. Every frame is hashed whole and in 16 × 9 tiles. A frame that
 * differs from the first export's comes back with the tiles that differ, its image, and the same frame's image from a
 * later export (with three exports, the odd one out is the wrong one).
 */
export async function filmRepeat({ R, sample, opts, backend, post = null, view = null, size = '1080p', fps = '24', frames = null, repeat = 3, audio = false, tileHashes = true, keepTile = 72, presHash = false, jitter = 0, lag = 1, serial = false }) {
  const [width, height] = SIZES[size], rate = RATES[fps];
  const S = await loadSample(sample.bytes, 'sequences/cafe-morning.vrmxs');
  const TX = 16, TY = 9, tw = width / TX, th = height / TY;
  // tile `keepTile` of every frame of the first export, raw, so a later export's differing pixels there can be listed exactly
  const tileBytes = (bytes, t) => { const x0 = (t % TX) * tw, y0 = Math.floor(t / TX) * th, out = new Uint8Array(tw * th * 4); for (let y = 0; y < th; y++) out.set(bytes.subarray(((y0 + y) * width + x0) * 4, ((y0 + y) * width + x0 + tw) * 4), y * tw * 4); return out; };
  const refTile = [];
  const tiles = (bytes) => {
    const u = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2), out = new Uint32Array(TX * TY);
    for (let y = 0; y < height; y++) { const ty = Math.floor(y / th) * TX; for (let x = 0; x < width; x++) { const t = ty + Math.floor(x / tw); out[t] = Math.imul(out[t] ^ u[y * width + x], 0x01000193); } }
    return out;
  };
  const runs = [], wanted = new Set(), refShots = {};
  let ref = null;
  for (let i = 0; i < repeat; i++) {
    const host = await offlineHost(backend, post);
    const w = await buildWorld(R, S, { ...opts, mtoonMaterial: host.mtoonMaterial });
    const n = frames ?? framesFor(w.sequence.duration / w.sequence.fps, rate);
    const hashes = [], tileSets = [], diffs = [];
    const hs = hashSink();
    const sink = { ...hs, frame(k, bytes) {
      const h = hashFrame(bytes); hashes[k] = h;
      const t = tileHashes ? tiles(bytes) : null; tileSets[k] = t;
      if (!ref && keepTile !== null) refTile[k] = tileBytes(bytes, keepTile);
      if (ref && h !== ref.hashes[k]) {
        const differ = []; if (t) for (let j = 0; j < t.length; j++) if (t[j] !== ref.tiles[k][j]) differ.push(j);
        let pixels;
        if (keepTile !== null && differ.includes(keepTile) && refTile[k]) {
          const a = tileBytes(bytes, keepTile), b = refTile[k], x0 = (keepTile % TX) * tw, y0 = Math.floor(keepTile / TX) * th; pixels = [];
          for (let p = 0; p < a.length && pixels.length < 16; p += 4) if (a[p] !== b[p] || a[p + 1] !== b[p + 1] || a[p + 2] !== b[p + 2] || a[p + 3] !== b[p + 3]) pixels.push({ x: x0 + ((p >> 2) % tw), y: y0 + Math.floor((p >> 2) / tw), here: [...a.subarray(p, p + 4)], first: [...b.subarray(p, p + 4)] });
        }
        // the tile itself, here and in the first export, 4x (top-down rows: WebGPU's readback)
        const tilePng = (t) => pngOf(t, tw, th, true, 4);
        const zoom = pixels ? { tilePng: tilePng(tileBytes(bytes, keepTile)), refTilePng: tilePng(refTile[k]) } : {};
        diffs.push({ frame: k, tiles: differ, ...(pixels ? { pixels } : {}), ...zoom, png: pngOf(bytes, width, height, hs.job.topDown, 0.5) });
        wanted.add(k);
      } else if (wanted.has(k) && !refShots[k]) refShots[k] = { from: i, png: pngOf(bytes, width, height, hs.job.topDown, 0.5) };
      const done = hs.frame(k, bytes);
      // ?jitter=N: wait 0 to N ms after each frame (Math.random: the harness, not the film), so the page's other work (the
      // renderers' rAF loops, the view's draws) lands between offline frames a varying number of times
      return jitter ? Promise.resolve(done).then(() => new Promise((r) => setTimeout(r, Math.floor(Math.random() * (jitter + 1))))) : done;
    } };
    // per frame: the export renderer's node-frame ids that went by since the last frame (rAF ticks + its own advance) and
    // the page view's render calls meanwhile (its paused loop draws every rAF), to set beside the frames that differ
    // per frame: what the CPU hands the GPU, hashed as the frame draws (the blend applied): the camera's matrices and every
    // visible mesh's world matrix, bit for bit. Equal where pixels differ: the difference is on the GPU side
    const pres = [], f64 = new Float64Array(16), u8 = new Uint8Array(f64.buffer), presOf = (k) => pres[k];
    const hashMat = (h, m) => { f64.set(m.elements); for (let b = 0; b < 128; b++) h = Math.imul(h ^ u8[b], 0x01000193); return h; };
    let presK = 0;
    // hashed right after the frame's draw (wrapping the post stack's render, or the renderer's), so nothing is updated
    // that the draw itself didn't: the camera's matrices, every visible mesh's world matrix, the bone matrices uploaded
    const hashArr = (h, a) => { for (let i = 0; i < a.length; i++) { f64[0] = a[i]; for (let b = 0; b < 8; b++) h = Math.imul(h ^ u8[b], 0x01000193); } return h; };
    if (presHash) {
      const target = host.post ?? host.renderer, orig = target.render.bind(target);
      target.render = (scene, camera, ...rest) => {
        const out = orig(scene, camera, ...rest);
        let h = hashMat(hashMat(hashMat(0x811c9dc5, camera.matrixWorld), camera.projectionMatrix), camera.matrixWorldInverse);
        let hm = 0x811c9dc5, hb = 0x811c9dc5;
        scene.traverseVisible((o) => { if (o.isMesh || o.isSkinnedMesh || o.isPoints || o.isSprite) hm = hashMat(hm, o.matrixWorld); if (o.isSkinnedMesh && o.skeleton.boneMatrices) hb = hashArr(hb, o.skeleton.boneMatrices); });
        pres[presK] = `${(h >>> 0).toString(16)}.${(hm >>> 0).toString(16)}.${(hb >>> 0).toString(16)}`;
        return out;
      };
    }
    const nf = host.renderer._nodes?.nodeFrame, gaps = [], viewCalls = [];
    let lastId = nf?.frameId ?? 0, lastView = view?.renderer?.info?.calls ?? 0;
    const onFrame = (k) => {
      presK = k + 1; // onPresent fires inside frame k + 1's draw
      if (nf) { gaps[k] = nf.frameId - lastId; lastId = nf.frameId; }
      const vc = view?.renderer?.info?.calls ?? 0; viewCalls[k] = vc - lastView; lastView = vc;
    };
    // ?serial=1: each frame waits for the GPU to finish everything before it (no overlap of consecutive frames on the GPU)
    if (serial && host.renderer.isWebGPURenderer) { const fa = host.frameAt.bind(host), q = host.renderer.backend.device.queue; host.frameAt = async (...a) => { await q.onSubmittedWorkDone(); return fa(...a); }; }
    const r = await exportTake({ tree: w.tree, host, fps: rate, frames: n, width, height, sink, audio, now, onFrame, lag });
    for (const d of diffs) { d.presentSame = presHash && ref?.pres ? pres[d.frame] === ref.pres[d.frame] : null; if (presHash) d.present = { here: pres[d.frame], first: ref?.pres?.[d.frame] }; }
    for (const d of diffs) d.at = { gap: gaps[d.frame], viewCalls: viewCalls[d.frame], gapBefore: gaps[d.frame - 1], viewCallsBefore: viewCalls[d.frame - 1] };
    const hist = (a) => { const h = {}; for (const x of a) if (x !== undefined) h[x] = (h[x] ?? 0) + 1; return h; };
    const timing = { gaps: hist(gaps), viewCallsPerFrame: hist(viewCalls), gapsByFrame: gaps.join('') };
    // the room environment's PMREM as this export's renderer made it (AB-T-0589: a per-renderer input that differs?)
    let pmrem = null;
    const rt = host._roomTarget;
    if (rt && host.renderer.readRenderTargetPixelsAsync) { const px = await host.renderer.readRenderTargetPixelsAsync(rt, 0, 0, rt.width, rt.height); pmrem = hashFrame(new Uint8Array(px.buffer, px.byteOffset, px.byteLength)); }
    const mods = WGSL.get(host.renderer.backend?.device) ?? null;
    dropHost(host);
    w.audio?.dispose?.();
    if (!ref) ref = { hashes, tiles: tileSets, pres };
    runs.push({ digest: hashValue(r.frameHashes.join(',')), frames: n, diffs, timing, pmrem, ...(presHash ? { presDigest: hashValue(pres.join(',')) } : {}), presDiffer: presHash && ref && ref.pres !== pres ? pres.reduce((a, h, k) => (h !== ref.pres[k] ? a.concat(k) : a), []).slice(0, 20) : [], ...(mods ? { wgsl: mods.map((m) => ({ label: m.label, code: normWGSL(m.code) })) } : {}) });
  }
  // ?wgsl=1: per export, the modules (normalised) the first export didn't compile, and a line diff against its module of the same label
  if (runs[0]?.wgsl) {
    const first = runs[0].wgsl, have = new Set(first.map((m) => m.code));
    for (const run of runs) {
      const mods = run.wgsl;
      run.wgsl = { modules: mods.length, digest: strHash(mods.map((m) => strHash(m.code)).sort().join(',')), notInFirst: mods.filter((m) => !have.has(m.code)).slice(0, 8).map((m) => {
        const twin = first.find((f) => f.label === m.label), la = m.code.split('\n'), lb = twin?.code.split('\n') ?? [], lines = [];
        for (let i = 0; i < Math.max(la.length, lb.length) && lines.length < 30; i++) if (la[i] !== lb[i]) lines.push({ line: i, here: la[i]?.slice(0, 400), first: lb[i]?.slice(0, 400) });
        return { label: m.label, lines };
      }) };
    }
  }
  return { size: [width, height], repeat, tiles: [TX, TY], runs, refShots };
}

/**
 * AB-T-0589's fast hunt (?mode=frames&parts=sameFrame&frames=K&repeat=N): the morning film's frame K drawn N times on one
 * host, nothing stepped in between (a fresh node frame each time, as an offline frame gets), each read back and hashed
 * whole and in tile `keepTile`. Every draw has the same inputs, so every hash must be the same. Switches, to find the GPU
 * stage that varies: noShadows (no shadow maps), noPost (no post stack), noMsaa (the post's scene pass at 1 sample).
 */
export async function sameFrame({ R, sample, opts, backend, post = null, size = '1080p', fps = '24', frames = 72, repeat = 2000, keepTile = 72, noShadows = false, noPost = false, noMsaa = false, noAA = false, hide = null, frontSide = null, split = null }) {
  const [width, height] = SIZES[size], rate = RATES[fps];
  const S = await loadSample(sample.bytes, 'sequences/cafe-morning.vrmxs');
  // ?noAA=1: no MSAA anywhere (the renderer's own framebuffer target and the post stack's scene pass)
  const host = noAA ? await RenderHost.create({ canvas: document.createElement('canvas'), backend, dprCap: 1, post: noPost ? null : post, antialias: false }) : await offlineHost(backend, noPost ? null : post);
  if ((noMsaa || noAA) && host.post) host.post.multisampling = 0;
  if (noShadows) host.renderer.shadowMap.enabled = false;
  const w = await buildWorld(R, S, { ...opts, mtoonMaterial: host.mtoonMaterial });
  host.attach(w.tree); host.resize(width, height);
  // ?hide=<node id>: that node not drawn; ?frontSide=<node id>: its materials single-sided (the scene, to find what varies)
  if (hide) w.tree.find(hide).object3d.visible = false;
  if (frontSide) w.tree.find(frontSide).object3d.traverse((o) => { for (const m of [o.material].flat()) if (m) { m.side = 0; m.needsUpdate = true; } });
  // ?split=<node id>: its double-sided meshes drawn as two culled draws, back faces first, then front faces
  if (split) {
    const meshes = []; w.tree.find(split).object3d.traverse((o) => { if (o.isMesh && o.material?.side === 2) meshes.push(o); });
    for (const o of meshes) {
      const back = new o.constructor(o.geometry, o.material.clone()); back.material.side = 1; back.renderOrder = o.renderOrder - 1;
      back.castShadow = o.castShadow; back.receiveShadow = o.receiveShadow; o.material.side = 0; o.material.needsUpdate = true; o.add(back);
    }
  }
  const rb = readbackFor(host, width, height), buf = new Uint8Array(width * height * 4);
  // to frame K as an export reaches it (frame by frame, each drawn)
  for (let n = 0; n <= frames; n++) { const { step, alpha } = framesToStep(n, rate); await rb.draw(() => host.frameAt(step, alpha)); }
  const { alpha } = framesToStep(frames, rate);
  // the machine's world matrix and the camera's view-projection at this frame (repro 5 draws the same with raw WebGPU)
  let mvp = null;
  { const cam = w.tree.services.get('cameras')?.current?.camera, m = w.tree.find('espresso')?.object3d; let mesh = null; m?.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    if (cam && mesh) { host.scene.updateMatrixWorld(); cam.updateMatrixWorld(); mvp = { model: [...mesh.matrixWorld.elements], view: [...cam.matrixWorldInverse.elements], projection: [...cam.projectionMatrix.elements], cameraPosition: cam.getWorldPosition(mesh.position.clone()).toArray() }; } }
  const TX = 16, tw = width / TX, th = height / 9, x0 = (keepTile % TX) * tw, y0 = Math.floor(keepTile / TX) * th;
  const tileHash = () => { let h = 0x811c9dc5; for (let y = 0; y < th; y++) for (let x = 0; x < tw * 4; x++) h = Math.imul(h ^ buf[((y0 + y) * width + x0) * 4 + x], 0x01000193); return (h >>> 0).toString(16); };
  const counts = new Map(), tiles = new Map(), firstOdd = [];
  let ref = null;
  const t0 = now();
  for (let i = 0; i < repeat; i++) {
    host.advanceNodeFrame();
    await rb.draw(() => host.render(alpha, false));
    await rb.readNow(buf);
    const h = hashFrame(buf), t = tileHash();
    counts.set(h, (counts.get(h) ?? 0) + 1); tiles.set(t, (tiles.get(t) ?? 0) + 1);
    if (ref === null) ref = h; else if (h !== ref && firstOdd.length < 5) firstOdd.push({ iter: i, tile: t });
  }
  const ms = Math.round(now() - t0);
  rb.release(); dropHost(host);
  return { frame: frames, repeat, ms, mvp, switches: { noShadows, noPost, noMsaa, noAA, hide, frontSide, split }, distinct: counts.size, counts: Object.fromEntries(counts), tileDistinct: tiles.size, tiles: Object.fromEntries(tiles), firstOdd };
}
const framesToStep = (n, rate) => frameToStep(n, rate);
