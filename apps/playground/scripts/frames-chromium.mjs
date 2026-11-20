// M4 W2 (AB-T-0574): the playground's ?mode=frames on both backends in headless Chromium (Metal), each on two loads of
// the page. Per backend: check 13 drawn on the host's own particle renderer (the world hash at every step as headless;
// a snapshot mid-effect restored on a fresh host draws the same frames), the morning film exported twice (identical),
// captureStill against the canvas, and the readback's cost at 1080p and 4K. Across loads: every hash the same.
// Writes results/frames-chromium.json. Exit 1 on a page error or any of those failing.
//   (cd apps/playground && npx vite build) && node apps/playground/scripts/frames-chromium.mjs [query extras, e.g. frames=48]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { verdicts, sameKey, keepShots } from './frames-verdicts.mjs';

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
const extra = process.argv[2] ? `&${process.argv[2]}` : '';

async function run(renderer) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`error: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${base}?mode=frames&renderer=${renderer}${extra}`);
  await page.waitForFunction(() => /** @type {any} */ (window).READY === true, null, { timeout: 1800000, polling: 1000 });
  const result = await page.evaluate(() => /** @type {any} */ (window).__result);
  await page.close();
  return { ...result, errors };
}

fs.mkdirSync(results, { recursive: true });
const runs = [];
for (const renderer of ['webgpu', 'webgl']) for (const load of [1, 2]) {
  const r = await run(renderer);
  keepShots(r, 'frames-chromium', load === 1 ? results : null);
  runs.push({ load, ...r, verdicts: verdicts(r) });
  console.log(renderer, load, JSON.stringify(verdicts(r)), r.errors.slice(0, 3));
}
await browser.close(); server.close();
const sameAcrossLoads = Object.fromEntries(['webgpu', 'webgl'].map((b) => [b, new Set(runs.filter((r) => r.backend === b).map(sameKey)).size === 1]));
const out = { version: (await import('node:os')).release(), browser: runs[0]?.ua, sameAcrossLoads, runs };
fs.writeFileSync(path.join(results, 'frames-chromium.json'), JSON.stringify(out, null, 1) + '\n');
console.log('same across loads', JSON.stringify(sameAcrossLoads));
for (const r of runs) console.log(r.backend, r.load, 'readback', JSON.stringify(Object.fromEntries(Object.entries(r.readback ?? {}).filter(([, v]) => v.exportLoopMs).map(([k, v]) => [k, { loop: v.exportLoopMs.median, after: v.afterFrameMs.median, render: v.renderMs.median }]))), 'film ms/frame', JSON.stringify(r.film?.first.perFrameMs));
const bad = runs.some((r) => Object.values(r.verdicts).some((v) => v === false)) || !sameAcrossLoads.webgpu || !sameAcrossLoads.webgl;
process.exit(bad ? 1 : 0);
