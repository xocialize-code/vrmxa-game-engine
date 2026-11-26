// AB-A-0335: do the editor's viewport aids reach the canvas in the colours they were given? three r187's WebGPURenderer
// tone-maps a whole frame on its way to the canvas, so `toneMapped: false` on the aids' materials does nothing there. The
// editor's ?mode=check-aids (apps/editor/src/aidscheck.js) draws the cafe with the espresso machine's selection outline
// and the counter spot light's shape handles, and counts the colours each aid put on the canvas. Run on WebGPU and WebGL,
// with and without a post look (on WebGPU every frame goes through the editor's composite pass). Pass: in every cell the
// outline's commonest colour is within 3 levels a channel of its authored #ff9a1f (it is drawn into an 8-bit linear target
// first, on both backends: #ff9a1c) and the same as WebGL's, and the light's range dot (#ffc53d) covers at least 20
// pixels in exactly its colour. (The angle dot is out of this view.) And on WebGPU without post, the frame with no aids
// drawn through the composite is the frame three draws straight to the canvas (the composite bypassed), to the pixel. (With
// post, bypassing the composite is the black frame it exists for, so that cell isn't compared.)
//
//   (cd apps/editor && npx vite build) && node acceptance/m6/aids-tonemap.mjs
//
// Results: acceptance/results/m6-aids-tonemap.json. It draws, so it takes the GPU lock.
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';

const here = import.meta.dirname, root = path.join(here, '../..'), dist = path.join(root, 'apps/editor/dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('build the editor first: (cd apps/editor && npx vite build)'); process.exit(1); }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(dist, url === '/' ? '/index.html' : url);
  if (!f.startsWith(dist + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
const base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}/`;
let pw;
try { pw = createRequire(path.join(root, 'spike-determinism/web/package.json'))('playwright-core'); } catch { pw = createRequire(path.join(here, '../../../../../spike-determinism/web/package.json'))('playwright-core'); }
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const release = await acquireGpuLock({ who: 'acceptance/m6/aids-tonemap.mjs', onWait: sayWaiting('acceptance/m6/aids-tonemap.mjs') });
const browser = await pw.chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const runs = [];
try {
  for (const renderer of ['webgpu', 'webgl']) for (const post of [0, 1]) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}?mode=check-aids&renderer=${renderer}&post=${post}`);
    await page.waitForFunction(() => window.READY === true, null, { timeout: 300000 });
    const out = await page.evaluate(() => ({ result: /** @type {any} */ (window).__result ?? null, errors: /** @type {any} */ (window).__errors }));
    runs.push({ renderer, post: !!post, ...out.result, errors: [...errors, ...(out.errors ?? [])] });
    await page.close();
  }
} finally { await browser.close(); server.close(); release(); }
const top = (r, k) => r[k]?.top?.[0]?.colour ?? null;
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const near = (a, b) => !!a && !!b && rgb(a).every((v, i) => Math.abs(v - rgb(b)[i]) <= 3);
const checks = runs.map((r) => ({
  cell: `${r.renderer}${r.post ? '+post' : ''}`, backend: r.backend, postActive: r.post, composite: r.composite,
  outline: top(r, 'outline'), outlineOk: near(top(r, 'outline'), r.authored?.outline) && top(r, 'outline') === top(runs.find((x) => x.renderer === 'webgl' && !x.post) ?? {}, 'outline'),
  outlinePixels: r.outline?.authored?.[r.authored?.outline] ?? 0,
  dots: { range: r.handles?.authored?.['#ffc53d'] ?? 0, angle: r.handles?.authored?.['#ff8b3e'] ?? 0 },
  dotsOk: (r.handles?.authored?.['#ffc53d'] ?? 0) >= 20, handlesTop: r.handles?.top?.slice(0, 3),
  frame: r.frame, errors: r.errors,
}));
for (const c of checks) c.frameOk = !(c.cell === 'webgpu') || c.frame?.differ === 0;
const ok = checks.every((c) => c.outlineOk && c.dotsOk && c.frameOk && !c.errors.length);
const out = { check: 'AB-A-0335 aids tone mapping', ok, checks, runs, version: browser.version?.() };
fs.writeFileSync(path.join(root, 'acceptance/results/m6-aids-tonemap.json'), JSON.stringify(out, null, 1) + '\n');
for (const c of checks) console.log(`${c.outlineOk && c.dotsOk && c.frameOk ? 'ok  ' : 'FAIL'} ${c.cell}: outline's commonest ${c.outline} (${c.outlinePixels} px of #ff9a1f), dots ${JSON.stringify(c.dots)} px, frame via the composite vs three's output: ${c.frame?.differ} of ${c.frame?.pixels} px differ, handles' commonest ${JSON.stringify(c.handlesTop)}${c.errors.length ? ` errors ${c.errors.join('; ')}` : ''}`);
process.exit(ok ? 0 : 1);
