// M4 W8 (AB-T-0580): the playground's ?mode=coverage on both backends in headless Chromium (Metal), each on two loads of
// the page: the sample script's coverage by rule, and a thumbnail per shot rendered from snapshots, in film order and
// last shot first (the same pixels both ways). Across loads: the sequence and every thumbnail the same.
// Writes results/coverage-chromium.json (every thumbnail's hash) and results/coverage-<backend>-strip.png (the storyboard
// strip, committed), and each thumbnail as results/coverage/chromium-<backend>-<shot>.png (git-ignored). Exit 1 on a page
// error, a 180° issue, or thumbnails that differ.
//   (cd apps/playground && npx vite build) && node apps/playground/scripts/coverage-chromium.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const here = import.meta.dirname, dist = path.join(here, '../dist'), results = path.join(here, '../results');
const require = createRequire(path.join(here, '../../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname, file = path.join(dist, decodeURIComponent(p === '/' ? '/index.html' : p));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const backends = (process.argv[2] ?? 'webgpu,webgl').split(',');

async function run(renderer) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`error: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${base}?mode=coverage&renderer=${renderer}`);
  await page.waitForFunction(() => /** @type {any} */ (window).READY === true, null, { timeout: 900000, polling: 1000 });
  const result = await page.evaluate(() => /** @type {any} */ (window).__result);
  await page.close();
  return { ...result, errors };
}
const save = (file, url) => fs.writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));

fs.mkdirSync(path.join(results, 'coverage'), { recursive: true });
const runs = [];
for (const renderer of backends) for (const load of [1, 2]) {
  const r = await run(renderer);
  if (load === 1 && r.thumbs) {
    for (const t of r.thumbs) save(path.join(results, 'coverage', `chromium-${r.backend}-${t.name}.png`), t.png);
    save(path.join(results, `coverage-${r.backend}-strip.png`), r.strip);
  }
  const { thumbs = [], strip, board, ...rest } = r;
  runs.push({ load, ...rest, board: load === 1 ? board : undefined, thumbs: thumbs.map(({ png, ...t }) => t) });
  console.log(renderer, load, 'shots', r.shots, 'same from snapshots', r.sameFromSnapshots, 'restored', r.restoredInReverse, '180° issues', r.lint?.issues.length, r.errors.slice(0, 3));
}
await browser.close(); server.close();
const key = (r) => `${r.sequenceHash}|${r.thumbs.map((t) => t.hash).join(',')}`;
const sameAcrossLoads = Object.fromEntries(backends.map((b) => [b, new Set(runs.filter((r) => r.backend === b).map(key)).size === 1]));
const out = { version: os.release(), browser: runs[0]?.ua, sameAcrossLoads, sequenceHashes: [...new Set(runs.map((r) => r.sequenceHash))], runs };
fs.writeFileSync(path.join(results, 'coverage-chromium.json'), JSON.stringify(out, null, 1) + '\n');
console.log('same across loads', JSON.stringify(sameAcrossLoads), 'sequence', out.sequenceHashes.join(' '));
const bad = runs.some((r) => r.errors.length || !r.sameFromSnapshots || r.lint?.issues.length || !r.thumbs.length) || Object.values(sameAcrossLoads).some((v) => !v);
process.exit(bad ? 1 : 0);
