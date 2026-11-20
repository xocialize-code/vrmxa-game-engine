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
import { PerspectiveCamera } from 'three';
import { RenderHost } from '@vrmxg/render';
import { exportTake, hashSink, hashFrame, readbackFor, captureStill, toImageRGBA, framesFor, RATES, SIZES } from '@vrmxg/export';
import { captureWorld, restoreWorld, worldHashes, hashValue, packRun } from '@vrmxg/snapshot';
import { buildWorld, loadSample } from './world.js';
import { runParticles, withParticleLoad, PARTICLE_STEPS, PARTICLE_SNAPSHOT_AT } from './acceptance.js';

const now = () => performance.now();
const r3 = (x) => +x.toFixed(3);
const stats = (a) => { const s = [...a].sort((x, y) => x - y); return { median: r3(s[s.length >> 1]), p95: r3(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]), min: r3(s[0]), n: s.length }; };

/** A host of its own for offline frames, on `backend`. */
/** A read-back frame as a PNG data URL, the right way up (toImageRGBA with the readback's row order), scaled to look at. */
function pngOf(bytes, width, height, topDown, scale = 1) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  c.getContext('2d').putImageData(new ImageData(toImageRGBA(bytes, width, height, { topDown }), width, height), 0, 0);
  if (scale === 1) return c.toDataURL('image/png');
  const d = document.createElement('canvas'); d.width = Math.round(width * scale); d.height = Math.round(height * scale);
  d.getContext('2d').drawImage(c, 0, 0, d.width, d.height);
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
export async function readbackCost(host, { sizes = ['1080p', '4k'], frames = 30 } = {}) {
  const out = {};
  for (const size of sizes) {
    const [w, h] = SIZES[size];
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
    out[size] = { renderMs: stats(render), exportLoopMs: stats(loop), afterFrameMs: stats(after), hash: hashFrame(buf) };
  }
  return out;
}

/** Everything above, on this page's backend. */
export async function framesCheck({ R, sample, opts, backend, post, view, canvas, parts = ['particles', 'film', 'still', 'readback'], film = {} }) {
  const res = { backend };
  const t0 = now();
  if (parts.includes('particles')) res.particles = await particlesRendered({ R, sample, opts, backend, post });
  if (parts.includes('film')) res.film = await filmExport({ R, sample, opts, backend, post, ...film });
  if (parts.includes('filmRepeat')) res.filmRepeat = await filmRepeat({ R, sample, opts, backend, post, ...film });
  if (parts.includes('still')) res.still = await stillCheck(view, canvas, { keep: true });
  if (parts.includes('readback')) {
    const host = await offlineHost(backend, post);
    const w = await buildWorld(R, sample, { ...opts, mtoonMaterial: host.mtoonMaterial });
    w.input.replay(JSON.parse(new TextDecoder().decode(await sample.bytes('input/walk-in.json'))));
    host.attach(w.tree); host.resize(1280, 720);
    await host.frameAt(420, 0.5); // Mira inside, Hana at the counter (the backends check's still)
    res.readback = await readbackCost(host);
    dropHost(host);
  }
  res.ms = Math.round(now() - t0);
  return res;
}

/**
 * Hunting a frame that differs between exports (?mode=frames&parts=filmRepeat&frames=24&repeat=6): the film exported
 * `repeat` times in one page, each on a fresh host; the first export's frames are kept, and a later frame that differs
 * comes back as both images and a pixel count, with the world's hash at that frame in each.
 */
export async function filmRepeat({ R, sample, opts, backend, post = null, size = '1080p', fps = '24', frames = 24, repeat = 6, audio = false }) {
  const [width, height] = SIZES[size], rate = RATES[fps];
  const S = await loadSample(sample.bytes, 'sequences/cafe-morning.vrmxs');
  let ref = null;
  const runs = [];
  for (let i = 0; i < repeat; i++) {
    const host = await offlineHost(backend, post);
    const w = await buildWorld(R, S, { ...opts, mtoonMaterial: host.mtoonMaterial });
    const kept = [], worldAt = [], diffs = [];
    const hs = hashSink();
    const sink = { ...hs, frame(k, bytes) {
      if (!ref) kept[k] = bytes.slice();
      else if (hashFrame(bytes) !== ref.hashes[k]) {
        const a = ref.kept[k]; let n = 0, max = 0, minX = width, minY = height, maxX = -1, maxY = -1;
        for (let p = 0; p < bytes.length; p += 4) {
          const m = Math.max(Math.abs(a[p] - bytes[p]), Math.abs(a[p + 1] - bytes[p + 1]), Math.abs(a[p + 2] - bytes[p + 2]), Math.abs(a[p + 3] - bytes[p + 3]));
          if (m) { n++; max = Math.max(max, m); const x = (p >> 2) % width, y = Math.floor((p >> 2) / width); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        }
        diffs.push({ frame: k, pixels: n, max, box: [minX, minY, maxX, maxY], world: worldAt[k] === ref.worldAt[k], ...(diffs.length < 2 ? { png: pngOf(bytes, width, height, hs.job.topDown), refPng: pngOf(a, width, height, hs.job.topDown) } : {}) });
      }
      return hs.frame(k, bytes);
    } };
    const r = await exportTake({ tree: w.tree, host, fps: rate, frames, width, height, sink, audio, now, onFrame: (k) => { worldAt[k] = hashValue(worldHashes(w.tree, { physicsBytes: true })); } });
    dropHost(host);
    w.audio?.dispose?.();
    if (!ref) ref = { hashes: r.frameHashes, kept, worldAt };
    runs.push({ digest: hashValue(r.frameHashes.join(',')), diffs });
  }
  return { size: [width, height], frames, repeat, runs };
}
