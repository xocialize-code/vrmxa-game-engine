// M4 W13 (AB-T-0585), M4 check 6 on the sample short itself: in the built creator in headless Chromium, over loopback,
// the short (the-regular) exports at 1080p24 with sound twice to the same frames, and jumping to frames of every shot,
// clip and key from snapshots draws exactly the frames the export rendered (the editor's Check Against Scrub, which the
// creator's host inherits). The matrix's `frames` and `editor` checks show the same on "Morning at the cafe" in every
// cell; this is the one-minute short the exit check names. WKWebView's side of it is the Mac apps
// (acceptance/m4/delivery-wkwebview.sh for the two exports, the editor's Mac app for the scrub).
// Writes acceptance/results/m4-acceptance/short-scrub-chromium-<renderer>.json; exit 1 on a difference.
//   (cd apps/creator && npx vite build) && node acceptance/m4/short-scrub.mjs [--renderer webgpu|webgl] [--short the-regular] [--size 1080p]
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';
import { snapshot, summarise } from '../../apps/playground/scripts/gpu-load.mjs';

const here = import.meta.dirname, root = path.join(here, '../..'), argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const renderer = opt('--renderer', 'webgpu'), short = opt('--short', 'the-regular'), size = opt('--size', '1080p');
const dist = path.join(root, 'apps/creator/dist');
if (!fs.existsSync(dist)) { console.error('build the creator first: (cd apps/creator && npx vite build)'); process.exit(1); }
const release = await acquireGpuLock({ who: 'acceptance/m4/short-scrub.mjs', onWait: sayWaiting('acceptance/m4/short-scrub.mjs') }); // one GPU runner at a time (acceptance/README.md)

const require = createRequire(path.join(root, 'spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname, file = path.join(dist, decodeURIComponent(p === '/' ? '/index.html' : p));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const samples = [snapshot()], sampler = setInterval(() => samples.push(snapshot()), 3000), started = Date.now();
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleLines = [];
page.on('console', (m) => { if (m.type() === 'error') consoleLines.push(`error: ${m.text()}`); });
page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
let out = null, failure = null;
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?renderer=${renderer}`);
  await page.waitForFunction(() => /** @type {any} */ (window).__creator?.short && /** @type {any} */ (window).__creator?.session, null, { timeout: 300000 });
  out = await page.evaluate(async ({ size, short }) => {
    const cr = /** @type {any} */ (window).__creator;
    if (cr.short?.id !== short) await cr.openShort(short);
    const seq = cr.session.doc.sequence, o = { take: 'sequence', size, fps: '24', codec: 'h264', audio: true, hashOnly: true };
    const t0 = performance.now();
    const again = await cr.exportVideo(o); // first, so the second is the one Check Against Scrub reads (lastExport)
    const firstMs = performance.now() - t0, t1 = performance.now();
    const x = await cr.exportVideo(o);
    const exportMs = performance.now() - t1, t2 = performance.now();
    const c = await cr.checkExportAgainstScrub();
    const differ = x.frameHashes.map((h, i) => (h === again.frameHashes[i] ? -1 : i)).filter((i) => i >= 0);
    return {
      short: cr.short.id, sequence: cr.short.sequence, backend: cr.host.backend, isWebGPUBackend: !!cr.host.renderer.backend?.isWebGPUBackend, ua: navigator.userAgent,
      shots: seq.shots.length, tracks: seq.tracks.length, frames: x.frames, seconds: x.seconds, steps: x.steps,
      exports: [{ digest: again.hashesDigest, audioHash: again.audioHash, ms: Math.round(firstMs) }, { digest: x.hashesDigest, audioHash: x.audioHash, ms: Math.round(exportMs) }],
      sameFrames: differ.length === 0 && x.frameHashes.length === again.frameHashes.length, framesThatDiffer: differ, sameAudio: x.audioHash === again.audioHash,
      distinctFrames: new Set(x.frameHashes).size, subtitles: { lines: x.subs?.lines ?? null, bytes: x.subs?.bytes ?? null },
      scrub: { frames: c.frames, same: c.same, ms: Math.round(performance.now() - t2), differ: c.rows.filter((r) => !r.same).map((r) => ({ frame: r.frame, worldSame: r.worldSame })), rows: c.rows.map((r) => ({ frame: r.frame, step: r.step, restored: r.restored, same: r.same, worldSame: r.worldSame, hash: r.scrub })) },
      errors: /** @type {any} */ (window).__errors, creatorError: cr.error ?? null,
    };
  }, { size, short });
} catch (e) { failure = String(e).slice(0, 600); }
await browser.close(); server.close(); clearInterval(sampler); samples.push(snapshot());
release?.();

const ok = !!out && !failure && out.backend === renderer && out.sameFrames && out.sameAudio && out.scrub.same === out.scrub.frames && out.scrub.frames > 0 && !out.errors?.length && !consoleLines.length;
const res = { format: 'vrmxg-short-scrub', version: 1, runtime: 'chromium', renderer, size, ok, failure, ...out, console: consoleLines, gpuLoad: summarise(samples, started, Date.now()) };
const dir = path.join(here, '../results/m4-acceptance');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `short-scrub-chromium-${renderer}.json`), `${JSON.stringify(res, null, 1)}\n`);
console.log(JSON.stringify({ ok, failure, renderer, backend: out?.backend, frames: out?.frames, exports: out?.exports, sameFrames: out?.sameFrames, framesThatDiffer: out?.framesThatDiffer, scrub: out && { frames: out.scrub.frames, same: out.scrub.same, differ: out.scrub.differ }, errors: out?.errors, console: consoleLines }, null, 1));
process.exit(ok ? 0 : 1);
