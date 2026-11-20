// The page in headless Chrome for Testing over loopback: the probe, then MediaPipe's timings on the clip with the GPU
// and the CPU delegate. Writes ../results/chromium.json.   node scripts/chromium.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = import.meta.dirname, dist = path.join(here, '../dist');
const require = createRequire(path.join(here, '../../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.task': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname, file = path.join(dist, decodeURIComponent(p === '/' ? '/index.html' : p));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const run = async (query) => {
  const page = await browser.newPage();
  await page.goto(`${base}?${query}`);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 600000 });
  const r = await page.evaluate(() => ({ result: window.__result, errors: window.__errors }));
  await page.close();
  return r;
};
const out = { browser: browser.version(), probe: await run('probe'), gpu: await run('bench&frames=300'), cpu: await run('bench&frames=300&delegate=CPU') };
await browser.close(); server.close();
fs.writeFileSync(path.join(here, '../../results/chromium.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ probe: out.probe.result, gpu: { ...out.gpu.result, sample: undefined }, cpu: { ...out.cpu.result, sample: undefined }, errors: [out.gpu.errors, out.cpu.errors] }, null, 1));
