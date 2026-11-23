// M4 W1 (AB-T-0573): the built playground's ?mode=post on both backends in headless Chromium (Metal), each page loaded
// twice. Per backend: every post look on one frame of the walk at 1080p (the first frame of a newly built pipeline,
// against the same frame drawn again), two exports of five frames with the anime preset, and the cost of a frame. Then
// each look on WebGPU against WebGL (SSIM, M4-PLAN's tolerance ≥ 0.98, translucency aside: AB-D-0273).
// Writes results/post-chromium.json and results/post/chromium-<backend>-<look>.png.
// Exit 1 on a page error, a backend that isn't the one asked for, a first frame that isn't its repeat, a flat frame,
// exports that differ (within a page or across reloads), or offline frames that repeat.
//   (cd apps/playground && npx vite build) && node apps/playground/scripts/post-chromium.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { compareStills } from './post-compare.mjs';
import { acquireGpuLock } from '../../../acceptance/gpu-lock.mjs';

await acquireGpuLock({ who: 'apps/playground/scripts/post-chromium.mjs' }); // M4 W3: one GPU runner at a time on this machine (acceptance/README.md)

const here = import.meta.dirname, dist = path.join(here, '../dist'), results = path.join(here, '../results');
const require = createRequire(path.join(here, '../../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname, file = path.join(dist, decodeURIComponent(p === '/' ? '/index.html' : p));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });

async function run(renderer) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const consoleLines = [], warnings = new Set();
  page.on('console', (m) => { if (m.type() === 'error') consoleLines.push(`error: ${m.text()}`); else if (m.type() === 'warning') warnings.add(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
  await page.goto(`${base}?mode=post&renderer=${renderer}`);
  await page.waitForFunction(() => /** @type {any} */ (window).READY === true, null, { timeout: 300000 });
  const out = await page.evaluate(() => ({ ...(/** @type {any} */ (window).__result ?? {}), errors: /** @type {any} */ (window).__errors }));
  await page.close();
  return { ...out, console: consoleLines, warnings: [...warnings] };
}

const runs = { webgl: await run('webgl'), webgpu: await run('webgpu'), webglAgain: await run('webgl'), webgpuAgain: await run('webgpu') };
fs.mkdirSync(path.join(results, 'post'), { recursive: true });
const looks = Object.keys(runs.webgpu.looks ?? {});
for (const b of ['webgl', 'webgpu']) for (const l of looks) fs.writeFileSync(path.join(results, 'post', `chromium-${b}-${l}.png`), Buffer.from(runs[b].looks[l].png.split(',')[1], 'base64'));
const cmp = await compareStills(browser, looks.map((l) => [runs.webgl.looks[l].png, runs.webgpu.looks[l].png]));
const ssim = Object.fromEntries(looks.map((l, i) => [l, cmp[i]]));
await browser.close(); server.close();

const strip = (r) => ({ ...r, looks: Object.fromEntries(Object.entries(r.looks ?? {}).map(([k, { png: _png, ...v }]) => [k, v])) });
const sameExports = (a, b) => a.exports?.a?.join() === b.exports?.a?.join();
const out = {
  version: browser.version(), tolerance: 0.98,
  webgl: strip(runs.webgl), webgpu: strip(runs.webgpu),
  reload: { webgl: sameExports(runs.webgl, runs.webglAgain), webgpu: sameExports(runs.webgpu, runs.webgpuAgain) },
  webgpuVsWebgl: ssim,
};
fs.writeFileSync(path.join(results, 'post-chromium.json'), JSON.stringify(out, null, 1) + '\n');
for (const l of looks) console.log(l.padEnd(14), 'SSIM', ssim[l].ssim, '¼', ssim[l].ssimQuarter, 'mean', ssim[l].meanMaxChannel, '>8', ssim[l].over8, '| first=again', runs.webgl.looks[l].firstEqualsAgain, runs.webgpu.looks[l].firstEqualsAgain, '| std', runs.webgl.looks[l].lumaStd, runs.webgpu.looks[l].lumaStd);
for (const b of ['webgl', 'webgpu']) console.log(b, runs[b].stack, 'exports identical', runs[b].exports?.identical, 'reload', out.reload[b], 'distinct', runs[b].exports?.distinct, 'frame0 std', runs[b].exports?.frame0?.lumaStd, 'cost', JSON.stringify(runs[b].costMs), 'console', runs[b].console.length, runs[b].errors?.length);
const bad = Object.values(runs).some((r) => r.console.length || r.errors?.length || !r.exports?.identical || r.exports.distinct !== r.frames.length || r.exports.frame0.lumaStd < 5
  || Object.values(r.looks).some((x) => !x.firstEqualsAgain || x.lumaStd < 5))
  || runs.webgpu.backend !== 'webgpu' || !runs.webgpu.isWebGPUBackend || runs.webgl.backend !== 'webgl' || !out.reload.webgl || !out.reload.webgpu;
process.exit(bad ? 1 : 0);
