// M4 W3 (AB-T-0575): every rendering check on both backends, WebGPU and WebGL, in headless Chromium and in WKWebView
// over the custom scheme and over loopback. One entry point for the matrix; one results JSON per cell
// (results/m4-w3/<runtime>-<backend>.json). Read acceptance/README.md ("M4 W3: the backend matrix") first.
//
//   (cd apps/playground && npx vite build)          # and spike-cinematics/mac/scripts/build.sh once
//   node acceptance/matrix.mjs                      # the whole matrix
//   node acceptance/matrix.mjs --runtimes chromium --backends webgpu --checks backends,post --loads 2
//   node acceptance/matrix.mjs --bless              # write acceptance/canonical.json from this run (every load must agree)
//   node acceptance/matrix.mjs --keep-going         # record a failure and carry on (diagnosis; the run still fails)
//   node acceptance/matrix.mjs --quiet-wait 20      # minutes to wait for a quiet GPU before each cell (--allow-load: carry on anyway)
//
// The checks are the playground's own modes: acceptance (M0–M3's exit checks, scored by compare.mjs per backend), backends
// (offline frames and a still), frames (particles, the film exported twice, stills, readback, alpha), post (every look at
// 1080p, two exports), coverage (a thumbnail per shot) and budget (20 characters stepped and drawn, timed; Chromium and
// WKWebView over loopback only: the scheme origin's timer resolves 1 ms, AB-L-0346).
// Exactness (AB-D-0278, AB-T-0589): each cell holds the machine's GPU lock (gpu-lock.mjs) and records the GPU's load
// (apps/playground/scripts/gpu-load.mjs) per load. Every load must match the canonical digest for its backend and
// runtime (canonical.json). A load that doesn't is rerun once: if the rerun matches and the failed load ran under another
// process's GPU load, it is reported as AB-T-0589 (the macOS beta's Metal issue); if the rerun fails too, or the GPU was
// quiet, the matrix stops there and exits 1. The failed load's frame, tiles and differing pixels are logged.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { acquireGpuLock } from './gpu-lock.mjs';
import { classifyLoad, classifyRerun } from './classify.mjs';
import { snapshot, summarise } from '../apps/playground/scripts/gpu-load.mjs';
import { compareStills } from '../apps/playground/scripts/post-compare.mjs';
import { verdicts as framesVerdicts } from '../apps/playground/scripts/frames-verdicts.mjs';

const here = import.meta.dirname, root = path.join(here, '..');
const dist = path.join(root, 'apps/playground/dist'), editorDist = path.join(root, 'apps/editor/dist');
const out = path.join(here, 'results/m4-w3'), oddDir = path.join(out, 'odd'); // odd/ is git-ignored
const canonFile = path.join(here, 'canonical.json');

// ------------------------------------------------------------------------------------------------ options
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const flag = (k) => argv.includes(`--${k}`);
const RUNTIMES = opt('runtimes', 'chromium,wkwebview-scheme,wkwebview-loopback').split(',');
const BACKENDS = opt('backends', 'webgpu,webgl').split(',');
/** Per check: loads per cell, the WKWebView time-out (s), and where it runs. */
const CHECKS = {
  acceptance: { loads: 1, timeout: 900 },
  backends: { loads: 3, timeout: 300 },
  frames: { loads: 2, timeout: 1800 },
  post: { loads: 2, timeout: 900 },
  coverage: { loads: 2, timeout: 900 },
  budget: { loads: 1, timeout: 900, runtimes: ['chromium', 'wkwebview-loopback'], timings: true }, // timings: no digest to pin
  // the editor's check-export (M2 checks 2 and 5): the film exported as frame hashes, checked against scrubbing
  editor: { loads: 2, timeout: 1500, app: 'editor', query: 'mode=check-export' },
};
const CHECK_NAMES = opt('checks', Object.keys(CHECKS).join(',')).split(',');
const LOADS = opt('loads', null);
const BLESS = flag('bless');
/** --keep-going: a failure is recorded and the matrix carries on (for diagnosis: the run still fails). */
const KEEP_GOING = flag('keep-going');
/**
 * Before each cell, with the lock held and nothing of ours running, the GPU must be quiet: utilisation ≤ 30 % and no
 * GPU-using process at ≥ 5 % CPU (sampled every 5 s; three quiet samples in a row). The matrix waits up to --quiet-wait
 * minutes (20), then stops (--allow-load records the load and carries on: such a run can't pass).
 */
const QUIET_UTIL = 30, QUIET_WAIT = +opt('quiet-wait', 20), ALLOW_LOAD = flag('allow-load');
/** A load counts as run under load when another process drew on the GPU meanwhile (see underLoad). */
const FOREIGN_CPU = 5;

const require = createRequire(path.join(root, 'spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const harnessSrc = path.join(root, 'spike-cinematics/mac/build/CinematicsSpike.app');
/** The harness apps, one per web app, each with a bundle id of its own: its own sandbox container, so other runners can't overwrite its results. */
const APPS = {
  playground: { dist, app: path.join(here, 'build/AcceptanceMatrix.app'), bundle: 'com.xocialize.vrmxg-cinematics-spike.matrix' },
  editor: { dist: editorDist, app: path.join(here, 'build/AcceptanceMatrixEditor.app'), bundle: 'com.xocialize.vrmxg-cinematics-spike.matrix-editor' },
};
const shotsFile = (a) => path.join(os.homedir(), 'Library/Containers', a.bundle, 'Data/tmp/wkwebview-shots.json');

const canonJSON = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
const digestOf = (items) => crypto.createHash('sha256').update(canonJSON(items)).digest('hex').slice(0, 16);
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const readJSON = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const savePng = (file, url) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')); };

// ------------------------------------------------------------------------------------------------ checks
/**
 * What one load of a check must show on its own (`verdicts`, all true), the hashes its canonical digest covers
 * (`items`), and the images that can be compared pixel by pixel if a load differs (`images`, by item key).
 */
const EVALUATE = {
  acceptance(r, backend, ctx) {
    const x = r.result ?? {}, s = x.simulation ?? {};
    const finals = Object.fromEntries(['simulation', 'items', 'sequence', 'particles', 'brains', 'save', 'film', 'conversation', 'ragdoll', 'vehicle', 'split'].map((k) => [k, x[k]?.final ?? null]));
    return {
      verdicts: { noErrors: !r.errors.length, notTimedOut: !r.timedOut, sameAsNode: !!ctx.node && s.final === ctx.node.simulation.final, renderedSameAsHeadless: !!x.rendered?.sameAsHeadless, snapshot: !!s.snapshot?.rerunMatches, backend: x.rendered ? true : false },
      items: finals, images: {},
    };
  },
  backends(r, backend) {
    const x = r.result ?? {};
    const items = { still: x.stillHash, ...Object.fromEntries((x.frames ?? []).map((h, i) => [`frame${x.steps?.[i] ?? i}`, h])) };
    if (backend === 'webgl') { items.glStill = x.glStill; (x.glFrames ?? []).forEach((h, i) => { items[`glFrame${x.steps?.[i] ?? i}`] = h; }); }
    return {
      verdicts: { noErrors: !r.errors.length, notTimedOut: !r.timedOut, backend: x.backend === backend, webgpuBackend: backend !== 'webgpu' || !!x.isWebGPUBackend, distinctFrames: x.distinct === x.steps?.length },
      items, images: x.png ? { still: x.png } : {},
    };
  },
  frames(r, backend) {
    const x = { ...(r.result ?? {}), errors: r.errors };
    const v = framesVerdicts(x);
    delete v.backend;
    const f = x.film ?? {};
    const items = {
      particlesFinal: x.particles?.final, particlesFrames: x.particles?.framesDigest, particlesLast: x.particles?.lastFrame,
      film: f.first?.digest, filmSecond: f.second?.digest, filmAudio: f.first?.audioHash, still: x.still?.hash,
      ...Object.fromEntries(Object.entries(x.readback ?? {}).filter(([, q]) => q.hash).map(([k, q]) => [`readback-${k}`, q.hash])), alpha: x.alpha?.raw?.join(','),
    };
    return { verdicts: { ...v, backend: x.backend === backend, notTimedOut: !r.timedOut }, items, images: {}, film: f };
  },
  post(r, backend) {
    const x = r.result ?? {}, items = {}, images = {};
    for (const [k, l] of Object.entries(x.looks ?? {})) { items[`look-${k}`] = l.hash; items[`look-${k}-again`] = l.again; images[`look-${k}`] = l.png; }
    (x.exports?.a ?? []).forEach((h, i) => { items[`exportA${i}`] = h; });
    (x.exports?.b ?? []).forEach((h, i) => { items[`exportB${i}`] = h; });
    const looksOk = Object.values(x.looks ?? {}).every((l) => l.firstEqualsAgain && l.lumaStd >= 5);
    return {
      // the mask may hide at most 1 % of the frame (a broken mask must not hide the look)
      verdicts: { noErrors: !r.errors.length, notTimedOut: !r.timedOut, backend: x.backend === backend, webgpuBackend: backend !== 'webgpu' || !!x.isWebGPUBackend, exportsIdentical: !!x.exports?.identical, exportsDistinct: x.exports?.distinct === x.frames?.length, notFlat: (x.exports?.frame0?.lumaStd ?? 0) >= 5, looksFirstEqualsAgain: looksOk, mask: !!x.mask?.png && x.mask.share <= 0.01 },
      items, images,
    };
  },
  coverage(r, backend) {
    const x = r.result ?? {}, items = { sequence: x.sequenceHash }, images = {};
    for (const t of x.thumbs ?? []) { items[`thumb-${t.name}`] = t.hash; images[`thumb-${t.name}`] = t.png; }
    return {
      verdicts: { noErrors: !r.errors.length, notTimedOut: !r.timedOut, backend: x.backend === backend, sameFromSnapshots: !!x.sameFromSnapshots, no180Issues: !(x.lint?.issues?.length), thumbnails: (x.thumbs?.length ?? 0) > 0 },
      items, images,
    };
  },
  editor(r, backend) {
    const x = r.result ?? {}, items = { digest: x.digest, audio: x.audioHash };
    for (const row of x.rows ?? []) items[`frame${row.frame}`] = row.exported;
    return {
      verdicts: { noErrors: !r.errors.length, notTimedOut: !r.timedOut, backend: x.backend === backend, webgpuBackend: backend !== 'webgpu' || !!x.isWebGPUBackend, scrubSame: !!x.scrub?.frames && x.scrub.same === x.scrub.frames, forwardSame: (x.rows?.length ?? 0) > 0 && x.rows.every((row) => row.forwardSame && row.worldSame !== false) },
      items, images: {},
    };
  },
  budget(r, backend) {
    const x = r.result ?? {};
    // M0 check 4's budget: 20 characters plus physics under 5 ms a step (mean)
    return { verdicts: { noErrors: !r.errors.length, notTimedOut: !r.timedOut, backend: x.backend === backend, webgpuBackend: backend !== 'webgpu' || !!x.isWebGPUBackend, characters: x.characters === 20, stepUnder5ms: (x.stepMs?.mean ?? Infinity) < 5 }, items: null, images: {} };
  },
};

/** What a load's result keeps in the cell's JSON (no images, no per-step runs, no frame lists). */
function brief(check, r) {
  const x = r.result ?? {};
  if (check === 'acceptance') return { final: x.simulation?.final, rendered: x.rendered && { frames: x.rendered.frames, renderMs: x.rendered.renderMs, sameAsHeadless: x.rendered.sameAsHeadless, calls: x.rendered.calls, triangles: x.rendered.triangles, debug: x.rendered.debug && { colliders: x.rendered.debug.colliders, sensors: x.rendered.debug.sensors?.length, capsules: x.rendered.debug.capsules?.length }, post: x.rendered.post } };
  if (check === 'backends') return { size: x.size, stillMs: x.stillMs, stillMsWithRead: x.stillMsWithRead };
  if (check === 'frames') return { particles: x.particles && { final: x.particles.final, distinctFrames: x.particles.distinctFrames, batch: x.particles.batch }, film: x.film && { frames: x.film.frames, first: x.film.first, second: x.film.second, framesDiffer: x.film.framesDiffer, odd: x.film.odd?.map(({ png, tiles, ...o }) => o) }, readback: x.readback, alpha: x.alpha };
  if (check === 'post') return { stack: x.stack, size: x.size, costMs: x.costMs, mask: x.mask && { pixels: x.mask.pixels, share: x.mask.share, hidden: x.mask.hidden, objects: x.mask.objects }, looks: Object.fromEntries(Object.entries(x.looks ?? {}).map(([k, { png, ...l }]) => [k, l])) };
  if (check === 'coverage') return { shots: x.shots, sequenceHash: x.sequenceHash, restoredInReverse: x.restoredInReverse };
  if (check === 'budget') { const { mode, ua, origin, ...b } = x; return b; }
  if (check === 'editor') return { size: x.size, frames: x.frames, exportMs: x.exportMs, scrub: x.scrub, subtitles: x.subtitles, rows: x.rows?.map(({ frame, step, alpha, restored, same, worldSame, forwardSame, forwardWorld }) => ({ frame, step, alpha, restored, same, worldSame, forwardSame, forwardWorld })) };
  return {};
}

// ------------------------------------------------------------------------------------------------ GPU load
let samples = [];
let sampler = null;
const startSampling = () => { samples = []; const tick = () => samples.push(snapshot()); tick(); sampler = setInterval(tick, 3000); };
const stopSampling = () => { clearInterval(sampler); sampler = null; };
/**
 * Was another process drawing on the GPU during this load (t0…t1)? The GPU's utilisation can't say: it counts our own
 * drawing too (a quiet post run in Chromium sits at a median 30–55 %), so it is recorded, not judged. Loaded means another
 * GPU-using process at ≥ 5 % CPU in the samples: python, MLX, the native Metal repro, another app's GPU helper (node
 * itself doesn't draw: its browsers count), the other browser engine, or a harness that isn't the one this runner started. Our own runtime counts as
 * ours by kind (Chromium in a Chromium cell; WebKit in a WKWebView cell, so a busy Safari would pass unseen: close it).
 */
function underLoad(t0, t1, runtime) {
  const inside = samples.filter((s) => s.at >= t0 - 3000 && s.at <= t1 + 3000);
  if (!inside.length) return { loaded: null, why: 'no samples' };
  const ours = (p) => p.pid === process.pid || (runtime === 'chromium' ? p.kind === 'chromium' : p.kind === 'webkit' || (p.kind === 'harness' && ourHarness.has(p.pid)));
  const seen = {};
  for (const s of inside) for (const p of s.processes) if (!ours(p) && p.kind !== 'node' && p.cpu >= FOREIGN_CPU) seen[`${p.kind}:${p.name}`] = Math.max(seen[`${p.kind}:${p.name}`] ?? 0, p.cpu);
  const foreign = Object.entries(seen).map(([k, cpu]) => `${k} ${cpu}%`);
  return { loaded: foreign.length > 0, why: foreign.join(', ') || 'quiet' };
}
const ourHarness = new Set();

// ------------------------------------------------------------------------------------------------ runtimes
let browser = null, server = null, base = '', canonForPage = {};
async function startChromium() {
  if (server) { browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] }); return; }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
  server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/acceptance-canon.json') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(canonForPage)); return; }
    // the editor under /editor/ (both apps build with base './'), the playground at the root
    const [d, rel] = p.startsWith('/editor/') ? [editorDist, p.slice('/editor'.length)] : [dist, p];
    const file = path.join(d, decodeURIComponent(rel === '/' ? '/index.html' : rel));
    if (!file.startsWith(d) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
}

async function loadChromium(query, timeoutS, appName) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`error: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  let timedOut = false, result = null, pageErrors = [], warnings = [];
  try {
    await page.goto(`${base}${appName === 'editor' ? 'editor/' : ''}?${query}`);
    await page.waitForFunction(() => /** @type {any} */ (window).READY === true, null, { timeout: timeoutS * 1000, polling: 500 });
    ({ result, pageErrors, warnings } = await page.evaluate(() => ({ result: /** @type {any} */ (window).__result ?? null, pageErrors: /** @type {any} */ (window).__errors ?? [], warnings: /** @type {any} */ (window).__warnings ?? [] })));
  } catch (e) { timedOut = /Timeout/.test(String(e)); errors.push(`runner: ${String(e).slice(0, 300)}`); }
  await page.close();
  return { result, errors: [...pageErrors, ...errors], warnings, timedOut, ua: browser.version() };
}

function prepareHarness({ dist: from, app, bundle }) {
  if (!fs.existsSync(harnessSrc)) throw new Error('build the harness app first: spike-cinematics/mac/scripts/build.sh');
  fs.rmSync(app, { recursive: true, force: true }); fs.mkdirSync(path.dirname(app), { recursive: true });
  execFileSync('cp', ['-R', harnessSrc, app]);
  const web = path.join(app, 'Contents/Resources/web');
  fs.rmSync(web, { recursive: true, force: true }); execFileSync('cp', ['-R', from, web]);
  fs.writeFileSync(path.join(web, 'acceptance-canon.json'), JSON.stringify(canonForPage));
  execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleIdentifier ${bundle}`, path.join(app, 'Contents/Info.plist')]);
  execFileSync('codesign', ['--force', '--sign', '-', '--preserve-metadata=entitlements', app], { stdio: 'ignore' });
}

/** One fresh WKWebView load: the harness app run for one case on one origin. */
async function loadWKWebView(origin, query, timeoutS, appName) {
  const a = APPS[appName], file = shotsFile(a);
  fs.rmSync(file, { force: true });
  await new Promise((resolve) => {
    const p = spawn(path.join(a.app, 'Contents/MacOS/CinematicsSpike'), [], { env: { ...process.env, SPIKE_CASES: query, SPIKE_ORIGINS: origin, SPIKE_TIMEOUT: String(timeoutS) }, stdio: 'ignore' });
    ourHarness.add(p.pid);
    p.on('exit', resolve);
  });
  const rows = readJSON(file, []);
  const row = rows[0];
  if (!row) return { result: null, errors: ['runner: the harness wrote no result'], warnings: [], timedOut: false, ua: null };
  return { result: row.result ?? null, errors: row.errors ?? [], warnings: row.warnings ?? [], timedOut: !!row.timedOut, ua: row.ua, timerRes: row.timerRes };
}

const runLoad = (runtime, query, timeoutS, appName = 'playground') => (runtime === 'chromium' ? loadChromium(query, timeoutS, appName) : loadWKWebView(runtime.replace('wkwebview-', ''), query, timeoutS, appName));

// ------------------------------------------------------------------------------------------------ pixel differences
/**
 * Two images of the same frame, compared in headless Chromium: the 16 × 9 tiles that differ (at 1080p a tile is
 * 120 × 120), how many pixels differ, the largest channel difference, and the first 32 differing pixels.
 */
async function pixelDiff(a, b) {
  // a browser of its own, closed straight after: an idle Chromium's GPU helper kept busy loads the GPU in a WKWebView cell
  const own = browser ? null : await chromium.launch({ executablePath: exe, headless: true });
  const page = await (browser ?? own).newPage();
  try {
    return await page.evaluate(async ([a, b]) => {
      const px = async (url) => { const img = new Image(); img.src = url; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
      const A = await px(a), B = await px(b);
      if (A.width !== B.width || A.height !== B.height) return { error: `sizes differ: ${A.width}×${A.height} vs ${B.width}×${B.height}` };
      const w = A.width, h = A.height, tw = w / 16, th = h / 9, tiles = new Set(), pixels = [];
      let count = 0, max = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]), Math.abs(A.data[i + 3] - B.data[i + 3]));
        if (!d) continue;
        count++; if (d > max) max = d; tiles.add(Math.floor(y / th) * 16 + Math.floor(x / tw));
        if (pixels.length < 32) pixels.push({ x, y, failed: [...A.data.subarray(i, i + 4)], rerun: [...B.data.subarray(i, i + 4)] });
      }
      return { size: [w, h], tiles: [...tiles].sort((p, q) => p - q), count, max, pixels };
    }, [a, b]);
  } finally { await page.close(); await own?.close(); }
}

// ------------------------------------------------------------------------------------------------ the matrix
const canonical = readJSON(canonFile, { cells: {} });
for (const [cell, checks] of Object.entries(canonical.cells ?? {})) if (checks.frames?.film) canonForPage[cell] = { film: checks.frames.film };
const blessed = { cells: {} };
const summary = { task: 'AB-T-0575', started: new Date().toISOString(), commit: null, machine: null, cells: {}, incidents: [], failures: [], gpuLock: [] };
try { summary.commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
summary.dirty = (() => { try { return execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim().length > 0; } catch { return null; } })();
summary.machine = { model: execFileSync('sysctl', ['-n', 'hw.model'], { encoding: 'utf8' }).trim(), chip: execFileSync('sysctl', ['-n', 'machdep.cpu.brand_string'], { encoding: 'utf8' }).trim(), macOS: `${execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim()} (${execFileSync('sw_vers', ['-buildVersion'], { encoding: 'utf8' }).trim()})` };

fs.mkdirSync(out, { recursive: true });
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('build the playground first: (cd apps/playground && npx vite build)'); process.exit(1); }
if (CHECK_NAMES.includes('editor') && !fs.existsSync(path.join(editorDist, 'index.html'))) { console.error('build the editor first: (cd apps/editor && npx vite build)'); process.exit(1); }
let stopped = null;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopSampling(); process.exit(130); }); // exit releases the GPU lock

// Node: the simulation reference (no renderer, no GPU lock)
let node = readJSON(path.join(out, 'node.json'));
if (CHECK_NAMES.includes('acceptance') && !flag('reuse-node')) {
  log('node: the reference run (acceptance/node.mjs)');
  execFileSync(process.execPath, [path.join(here, 'node.mjs')], { env: { ...process.env, ACCEPTANCE_OUT: out }, stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 1 << 26 });
  node = readJSON(path.join(out, 'node.json'));
}
const ctx = { node };

if (RUNTIMES.some((r) => r.startsWith('wkwebview'))) for (const [k, a] of Object.entries(APPS)) if (k === 'playground' || CHECK_NAMES.includes(k)) prepareHarness(a);

/** The cell's raw post looks (from its first clean load), kept for the SSIM step: { cell: { looks: { look: png }, mask } } */
const looksFor = {};

cells: for (const runtime of RUNTIMES) for (const backend of BACKENDS) {
  const cell = `${runtime}-${backend}`;
  const checks = CHECK_NAMES.filter((c) => !CHECKS[c].runtimes || CHECKS[c].runtimes.includes(runtime));
  if (!checks.length) continue;
  // Chromium runs only while its own cells do, and only under the lock: an idle headless Chromium's GPU helper stays busy
  // (58 % CPU seen) and would load another holder's run, or this matrix's WKWebView cells
  if (browser) { await browser.close(); browser = null; }
  const waitStart = Date.now();
  const release = await acquireGpuLock({ who: `acceptance/matrix.mjs ${cell}`, onWait: (h) => log(`gpu-lock: waiting for pid ${h?.pid} (${h?.who})`) });
  summary.gpuLock.push({ cell, waitedMs: Date.now() - waitStart });
  const cellOut = { cell, runtime, backend, ua: null, started: new Date().toISOString(), checks: {} };
  try {
    cellOut.preflight = await waitForQuiet(cell);
    if (!cellOut.preflight.quiet && !ALLOW_LOAD) {
      stopped = { cell, check: 'preflight', why: `the GPU wasn't quiet for ${QUIET_WAIT} min: ${cellOut.preflight.why}` };
      summary.failures.push({ cell, check: 'preflight', why: stopped.why });
      log(`${cell}: ${stopped.why}; stopping the matrix (close what loads the GPU, or --allow-load)`);
      break cells;
    }
    if (!cellOut.preflight.quiet) (summary.notQuiet ??= []).push(cell); // --allow-load: recorded, and the run can't pass
    if (runtime === 'chromium') await startChromium();
    startSampling();
    for (const check of checks) {
      const n = +(LOADS ?? CHECKS[check].loads), timeout = CHECKS[check].timeout;
      const canon = BLESS ? null : canonical.cells?.[cell]?.[check] ?? null;
      const query = `${CHECKS[check].query ?? `mode=${check}`}&renderer=${backend}${check === 'frames' && canon?.film ? `&canon=${cell}` : ''}`;
      // unpinned: no canonical digest outside --bless; load 1 is the reference for this run, and the matrix can't pass
      const res = { query, canonical: canon?.digest ?? null, pinned: !!canon || BLESS || !!CHECKS[check].timings, loads: [], incidents: [], failure: null };
      cellOut.checks[check] = res;
      let ref = canon ? { digest: canon.digest, items: canon.items } : null, good = null, firstR = null;
      for (let load = 1; load <= n; load++) {
        const one = async (q, label) => {
          const t0 = Date.now();
          const r = await runLoad(runtime, q, timeout, CHECKS[check].app);
          const t1 = Date.now();
          cellOut.ua ??= r.ua;
          const e = EVALUATE[check](r, backend, ctx);
          const g = summarise(samples, t0, t1);
          const digest = e.items ? digestOf(e.items) : null;
          const ok = Object.values(e.verdicts).every(Boolean);
          const differ = ref && e.items ? Object.keys({ ...ref.items, ...e.items }).filter((k) => ref.items[k] !== e.items[k]) : [];
          const row = { load, label, ok, digest, match: ref && digest ? digest === ref.digest : null, differ, verdicts: e.verdicts, ms: t1 - t0, wall: { start: t0, end: t1 }, gpuLoad: g, underLoad: underLoad(t0, t1, runtime), errors: r.errors.slice(0, 5), timedOut: r.timedOut, ...brief(check, r) };
          row.kind = classifyLoad(row).kind;
          log(`${cell} ${check} ${label}: ${ok ? 'ok' : 'VERDICTS FAIL'} digest ${digest ?? '-'}${row.match === false ? ` ≠ canonical ${ref.digest} (${differ.length} items: ${differ.slice(0, 6).join(', ')})` : row.match ? (ref.fromLoad ? ` = load ${ref.fromLoad}` : ' = canonical') : ''} · ${(row.ms / 1000).toFixed(1)} s · GPU ${g?.gpuUtil ? `${g.gpuUtil.min}/${g.gpuUtil.median}/${g.gpuUtil.max}%` : '?'} ${row.underLoad.why}${r.errors.length ? ` · ${r.errors[0].slice(0, 160)}` : ''}`);
          return { r, e, row };
        };
        const first = await one(query, `load ${load}`);
        firstR ??= first.r;
        res.loads.push(first.row);
        // unpinned (or blessing): the first load that passes every verdict becomes the reference
        if (!ref && first.e.items && first.row.ok) { ref = { digest: first.row.digest, items: first.e.items, fromLoad: load }; first.row.match = true; first.row.kind = 'clean'; }
        if (first.row.kind === 'clean') { good ??= first.r; continue; }
        // ---- a load that isn't clean: log it, rerun once, classify (classify.mjs)
        const failed = { load, kind: first.row.kind, digest: first.row.digest, differ: first.row.differ, verdicts: Object.entries(first.row.verdicts).filter(([, v]) => !v).map(([k]) => k), gpuLoad: first.row.gpuLoad, underLoad: first.row.underLoad, errors: first.row.errors };
        const oddFrames = first.e.film?.odd ?? [];
        const keep = [...new Set([...oddFrames.map((o) => o.frame), ...(first.e.film?.framesDiffer ?? []).slice(0, 4)])];
        const tag = `${cell}-${check}-load${load}`;
        for (const k of first.row.differ) if (first.e.images[k]) savePng(path.join(oddDir, `${tag}-failed-${k}.png`), first.e.images[k]);
        for (const o of oddFrames) if (o.png) savePng(path.join(oddDir, `${tag}-failed-${o.export}-frame${o.frame}.png`), o.png);
        failed.oddFrames = oddFrames.map(({ png, ...o }) => o);
        log(`${cell} ${check}: load ${load} ${failed.verdicts.length ? `fails ${failed.verdicts.join(', ')}` : 'differs'} (${first.row.kind}); the GPU was ${first.row.underLoad.why}; rerunning once`);
        const again = await one(`${query}${keep.length ? `&keepFrames=${keep.join(',')}` : ''}`, `rerun of load ${load}`);
        res.loads.push(again.row);
        // the differing pixels: the failed load's images against the rerun's, item by item and frame by frame
        const pixels = {};
        for (const k of first.row.differ) if (first.e.images[k] && again.e.images[k]) pixels[k] = await pixelDiff(first.e.images[k], again.e.images[k]);
        for (const o of oddFrames) { const twin = again.e.film?.kept?.find((x) => x.frame === o.frame && x.hash === o.canonical) ?? again.e.film?.kept?.find((x) => x.frame === o.frame); if (o.png && twin?.png) { pixels[`${o.export}-frame${o.frame}`] = await pixelDiff(o.png, twin.png); savePng(path.join(oddDir, `${tag}-rerun-frame${o.frame}.png`), twin.png); } }
        failed.pixels = pixels;
        failed.rerun = { kind: again.row.kind, ok: again.row.ok, digest: again.row.digest, match: again.row.match, gpuLoad: again.row.gpuLoad };
        const verdict = classifyRerun({ verdicts: first.row.verdicts, match: first.row.match, loaded: first.row.underLoad.loaded }, { verdicts: again.row.verdicts, match: again.row.match });
        if (verdict.outcome === 'incident') {
          if (again.row.kind === 'clean') good ??= again.r;
          const incident = { kind: 'AB-T-0589', load, why: verdict.why, failed };
          res.incidents.push(incident); // one per load: a second odd load in the same check is a second incident
          summary.incidents.push({ cell, check, ...incident });
          log(`${cell} ${check}: AB-T-0589 for load ${load} (${verdict.why}; ${first.row.underLoad.why})`);
          continue;
        }
        res.failure = { load, why: verdict.why, failed };
        summary.failures.push({ cell, check, ...res.failure });
        if (KEEP_GOING) { log(`${cell} ${check}: FAILURE (${verdict.why}); --keep-going`); break; }
        stopped = { cell, check, why: verdict.why };
        log(`${cell} ${check}: FAILURE (${verdict.why}); stopping the matrix`);
        break;
      }
      // the check passes in this cell when there's no failure and every load was clean or is its own AB-T-0589 incident
      const primaries = res.loads.filter((l) => !l.label.startsWith('rerun'));
      res.ok = !res.failure && primaries.length === n && primaries.every((l) => l.kind === 'clean' || res.incidents.some((i) => i.load === l.load));
      res.allLoadsMatch = !!ref && primaries.every((l) => l.digest === ref.digest);
      // what later steps read comes from a clean load (the first one, or a clean rerun), never from a failed one
      const use = good ?? firstR;
      if (check === 'acceptance' && use) writeAcceptance(runtime, backend, use);
      if (check === 'post' && good) looksFor[cell] = { looks: Object.fromEntries(Object.entries(good.result?.looks ?? {}).map(([k, l]) => [k, l.png])), mask: good.result?.mask?.png ?? null };
      if (BLESS && ref && res.ok && res.allLoadsMatch && good) {
        const entry = { digest: ref.digest, items: ref.items, made: { at: new Date().toISOString(), commit: summary.commit, dirty: summary.dirty, loads: primaries.length, runtime, backend } };
        if (check === 'frames') entry.film = good.result?.film?.frameHashes ?? null;
        (blessed.cells[cell] ??= {})[check] = entry;
      }
      if (stopped) break;
    }
  } finally {
    stopSampling();
    cellOut.gpuLoad = samples.length ? summarise(samples, samples[0].at, samples.at(-1).at) : null;
    cellOut.ended = new Date().toISOString();
    if (browser) { await browser.close(); browser = null; } // closed before the lock goes
    release();
  }
  fs.writeFileSync(path.join(out, `${cell}.json`), JSON.stringify(cellOut, null, 1) + '\n');
  summary.cells[cell] = Object.fromEntries(Object.entries(cellOut.checks).map(([k, c]) => [k, { ok: c.ok, pinned: c.pinned, loads: c.loads.length, digest: c.loads[0]?.digest, canonical: c.canonical, allLoadsMatch: c.allLoadsMatch, incidents: c.incidents.length }]));
  if (stopped) break cells;
}

/**
 * Waits until the GPU is quiet (see QUIET_UTIL): three samples in a row, 5 s apart, with utilisation ≤ 30 % and no
 * GPU-using process (any kind gpu-load.mjs knows, but node) at ≥ 5 % CPU. Nothing of this runner's draws meanwhile.
 * @returns {Promise<{ quiet: boolean, waitedMs: number, util: number | null, why: string }>}
 */
async function waitForQuiet(cell) {
  const t0 = Date.now();
  let streak = 0, last = null, told = false;
  for (;;) {
    const s = snapshot();
    const foreign = s.processes.filter((p) => p.kind !== 'node' && p.cpu >= FOREIGN_CPU).map((p) => `${p.kind}:${p.name} ${p.cpu}%`);
    const quiet = (s.gpuUtil ?? 0) <= QUIET_UTIL && !foreign.length;
    last = { util: s.gpuUtil, why: quiet ? 'quiet' : [...foreign, ...((s.gpuUtil ?? 0) > QUIET_UTIL ? [`GPU at ${s.gpuUtil}%`] : [])].join(', ') };
    streak = quiet ? streak + 1 : 0;
    if (streak >= 3) return { quiet: true, waitedMs: Date.now() - t0, util: s.gpuUtil, why: 'quiet' };
    if (!quiet && !told) { told = true; log(`${cell}: waiting for a quiet GPU (${last.why})`); }
    if (Date.now() - t0 > QUIET_WAIT * 60000) return { quiet: false, waitedMs: Date.now() - t0, ...last };
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/** compare.mjs's input: the acceptance results per backend, in the file names and shape it reads. */
function writeAcceptance(runtime, backend, r) {
  const dir = path.join(out, 'acceptance', backend);
  fs.mkdirSync(dir, { recursive: true });
  const o = runtime === 'chromium'
    ? { runtime: 'chromium', version: r.ua, result: r.result, errors: r.errors.filter((e) => !e.startsWith('error:') && !e.startsWith('pageerror:')), warnings: r.warnings, console: r.errors.filter((e) => e.startsWith('error:') || e.startsWith('pageerror:')) }
    : { runtime, ua: r.ua, timerRes: r.timerRes, timedOut: r.timedOut, errors: r.errors, warnings: r.warnings, result: r.result };
  fs.writeFileSync(path.join(dir, `${runtime}.json`), JSON.stringify(o) + '\n');
}

// ------------------------------------------------------------------------------------------------ after the cells
if (!stopped && CHECK_NAMES.includes('acceptance') && node) {
  // compare.mjs per backend, against the same Node reference: each backend's simulation hashes equal Node's at every step
  summary.compare = {};
  for (const backend of BACKENDS) {
    const dir = path.join(out, 'acceptance', backend);
    if (!fs.existsSync(dir)) continue;
    fs.copyFileSync(path.join(out, 'node.json'), path.join(dir, 'node.json'));
    let text = '', code = 0;
    try { text = execFileSync(process.execPath, [path.join(here, 'compare.mjs')], { env: { ...process.env, ACCEPTANCE_RESULTS: dir }, encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (e) { text = e.stdout ?? ''; code = e.status ?? 1; }
    fs.rmSync(path.join(dir, 'node.json'));
    const s = readJSON(path.join(dir, 'summary.json'));
    summary.compare[backend] = { exit: code, passed: s?.checks.filter((c) => c.ok).length, of: s?.checks.length, failed: s?.checks.filter((c) => !c.ok).map((c) => `${c.n}. ${c.title}`) };
    log(`compare.mjs on ${backend}: ${summary.compare[backend].passed}/${summary.compare[backend].of}${code ? ` FAILED: ${summary.compare[backend].failed.join('; ')}` : ''}`);
    if (code) console.log(text.split('\n').filter((l) => l.startsWith('✖')).join('\n'));
  }
  // the simulation's finals in every cell: the renderer must not change them
  const finals = Object.fromEntries(RUNTIMES.flatMap((rt) => BACKENDS.map((b) => [`${rt}-${b}`, readJSON(path.join(out, `${rt}-${b}.json`))?.checks?.acceptance?.loads?.find((l) => l.kind === 'clean')?.final])).filter(([, f]) => f));
  summary.simulationIndependentOfBackend = { node: node.simulation.final, finals, same: Object.values(finals).every((f) => f === node.simulation.final) };
}

if (!stopped && CHECK_NAMES.includes('post')) {
  // the look tolerance between backends: SSIM ≥ 0.98 at 1080p, translucency masked (both backends' masks, united). It
  // decodes images in Chromium, so it holds the lock too
  const releaseSsim = await acquireGpuLock({ who: 'acceptance/matrix.mjs ssim', onWait: (h) => log(`gpu-lock: waiting for pid ${h?.pid} (${h?.who})`) });
  await startChromium();
  summary.ssim = {};
  for (const runtime of RUNTIMES) {
    const a = looksFor[`${runtime}-webgl`], b = looksFor[`${runtime}-webgpu`];
    if (!a || !b) continue;
    const looks = Object.keys(b.looks).filter((k) => a.looks[k]);
    const masks = [a.mask, b.mask].filter(Boolean);
    const cmp = await compareStills(browser, looks.map((k) => [a.looks[k], b.looks[k], masks]));
    summary.ssim[runtime] = Object.fromEntries(looks.map((k, i) => [k, cmp[i]]));
    // the masks, small, to look at (committed): 480 px wide
    if (runtime === 'chromium' || runtime === 'wkwebview-loopback') {
      const page = await browser.newPage();
      for (const [name, m] of [['webgl', a.mask], ['webgpu', b.mask]]) if (m) savePng(path.join(out, `mask-${runtime}-${name}.png`), await page.evaluate(async (u) => { const i = new Image(); i.src = u; await i.decode(); const c = document.createElement('canvas'); c.width = 480; c.height = Math.round((480 * i.height) / i.width); c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); return c.toDataURL('image/png'); }, m));
      await page.close();
    }
  }
  // the verdict: every look's masked SSIM ≥ 0.98, except grain (per-pixel noise drawn differently per backend), judged at ¼ size
  const rows = Object.entries(summary.ssim).flatMap(([rt, looks]) => Object.entries(looks).map(([k, c]) => ({ rt, k, value: k === 'anime' ? c.ssimQuarterMasked : c.ssimMasked, measure: k === 'anime' ? 'ssimQuarterMasked (grain)' : 'ssimMasked' })));
  const errors = Object.entries(summary.ssim).flatMap(([rt, looks]) => Object.entries(looks).filter(([, c]) => c.error).map(([k, c]) => ({ rt, k, error: c.error })));
  summary.ssimVerdict = { tolerance: 0.98, maxMasked: 0.01, below: rows.filter((r) => !(r.value >= 0.98)), errors, ok: rows.length > 0 && !errors.length && rows.every((r) => r.value >= 0.98) };
  for (const [rt, looks] of Object.entries(summary.ssim)) for (const [k, c] of Object.entries(looks)) log(`SSIM ${rt} ${k.padEnd(13)} ${c.ssim} masked ${c.ssimMasked} (¼ ${c.ssimQuarterMasked}; masked share ${c.masked}; >8 levels ${c.over8Masked})${c.error ? ` ERROR ${c.error}` : ''}`);
  await browser.close(); browser = null;
  releaseSsim();
}

if (CHECK_NAMES.includes('budget')) {
  summary.budget = {};
  for (const runtime of RUNTIMES) for (const backend of BACKENDS) {
    const l = readJSON(path.join(out, `${runtime}-${backend}.json`))?.checks?.budget?.loads?.[0];
    if (l) summary.budget[`${runtime}-${backend}`] = { characters: l.characters, size: l.size, stepMs: l.stepMs, drawMs: l.drawMs, frameMs: l.frameMs, drawCalls: l.drawCalls, ok: l.ok }; // l.ok includes the step < 5 ms verdict
  }
}

if (BLESS && !stopped) {
  const cells = blessed.cells; // each entry carries its own made: { at, commit, dirty, loads, runtime, backend }
  const merged = { ...canonical, made: { at: new Date().toISOString(), commit: summary.commit, dirty: summary.dirty, machine: summary.machine, note: 'every entry comes from a --bless run in which every load of that check agreed; see each entry\'s made' }, cells: { ...(canonical.cells ?? {}) } };
  for (const [cell, checks] of Object.entries(cells)) merged.cells[cell] = { ...(merged.cells[cell] ?? {}), ...checks };
  fs.writeFileSync(canonFile, JSON.stringify(merged, null, 1) + '\n');
  log(`blessed ${Object.keys(cells).length} cells into acceptance/canonical.json`);
}

summary.ended = new Date().toISOString();
summary.stopped = stopped;
summary.unpinned = Object.entries(summary.cells).flatMap(([cell, c]) => Object.entries(c).filter(([, x]) => !x.pinned).map(([k]) => `${cell} ${k}`));
summary.ok = !stopped && !summary.failures.length && !summary.unpinned.length && !summary.notQuiet?.length && Object.values(summary.cells).every((c) => Object.values(c).every((x) => x.ok)) && (!summary.compare || Object.values(summary.compare).every((c) => !c.exit)) && (!summary.ssimVerdict || summary.ssimVerdict.ok) && (!summary.simulationIndependentOfBackend || summary.simulationIndependentOfBackend.same);
// a partial run (some runtimes, backends or checks) writes its own summary beside the full one
const full = RUNTIMES.length === 3 && BACKENDS.length === 2 && CHECK_NAMES.length === Object.keys(CHECKS).length;
fs.writeFileSync(path.join(out, full ? 'summary.json' : `summary-partial.json`), JSON.stringify({ ...summary, runtimes: RUNTIMES, backends: BACKENDS, checks: CHECK_NAMES }, null, 1) + '\n');
await browser?.close(); server?.close();
log(`matrix ${summary.ok ? 'PASSED' : 'FAILED'}${stopped ? ` (stopped at ${stopped.cell} ${stopped.check}: ${stopped.why})` : ''}; ${summary.incidents.length} AB-T-0589 incidents`);
process.exit(summary.ok ? 0 : 1);
