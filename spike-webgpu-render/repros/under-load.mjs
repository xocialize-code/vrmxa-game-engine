// AB-T-0589: runs repro 4 (4-msaa-resolve-under-load.html) or another page (--page 5-machine-under-load.html) in headless
// Chromium (Metal) `runs` times and prints each run's result; with --out FILE, writes them as JSON. Serves the repo root
// itself (no serve.mjs needed).
//   node spike-webgpu-render/repros/under-load.mjs [--runs 3] [--page P] [--out results/x.json] [query, e.g. iters=2000]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { snapshot, summarise } from '../../apps/playground/scripts/gpu-load.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(root, 'spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const runs = +opt('--runs', 3), out = opt('--out', null), pageName = opt('--page', '4-msaa-resolve-under-load.html'), query = args[0] ?? '';
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : file.endsWith('.json') ? 'application/json' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const all = [];
for (let i = 1; i <= runs; i++) {
  // what else uses the GPU meanwhile (the 'chromium' processes include this runner's own browser)
  const samples = [snapshot()], sampler = setInterval(() => samples.push(snapshot()), 15000);
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/spike-webgpu-render/repros/${pageName}?${query}`);
  await page.waitForFunction(() => /** @type {any} */ (window).READY === true, null, { timeout: 1800000, polling: 500 });
  const r = await page.evaluate(() => /** @type {any} */ (window).__result);
  await page.close();
  clearInterval(sampler); samples.push(snapshot());
  r.gpuLoad = summarise(samples, samples[0].at, samples.at(-1).at);
  all.push(r);
  console.log(`run ${i}: ${r.pass ? 'PASS' : 'FAIL'} ${r.observation ?? r.error} (${r.ms} ms)`);
  for (const [m, o] of Object.entries(r.modes ?? {})) if (o.firstDiff) console.log(`   ${m} first diff at iteration ${o.firstDiff.iter}: hdr ${JSON.stringify(o.firstDiff.hdr)} ldr ${JSON.stringify(o.firstDiff.ldr)}`);
}
await browser.close(); server.close();
if (out) fs.writeFileSync(path.resolve(out), JSON.stringify({ query, runs: all }, null, 1) + '\n');
