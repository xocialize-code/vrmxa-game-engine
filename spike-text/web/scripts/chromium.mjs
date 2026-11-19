// The spike page in Chromium (Chrome for Testing 1248, the binary acceptance/chromium.mjs uses; ANGLE Metal), served
// from the same build the Mac wrapper carries (web/dist, `npm run build`) by a static server in this process.
//   node scripts/chromium.mjs '<query>' [name]     prints the result; with a name, writes ../results/chromium-<name>.json
//                                                  and the page's shots as ../results/shots/chromium-<shot>.png
// A fresh browser per call.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const here = import.meta.dirname;
const dist = path.join(here, '../dist');
const require = createRequire(path.join(here, '../../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const [query = 'mode=hb', name] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  const p = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(dist) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const headless = process.env.HEADED !== '1';
const browser = await chromium.launch({ executablePath: exe, headless, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const lines = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') lines.push(`${m.type()}: ${m.text()}`.slice(0, 500)); });
page.on('pageerror', (e) => lines.push(`pageerror: ${e.message}`));
await page.goto(`${base}?${query}`);
await page.waitForFunction(() => window.READY === true, null, { timeout: +(process.env.SPIKE_TIMEOUT ?? 600) * 1000, polling: 250 });
const out = await page.evaluate(() => ({ result: window.__result, shots: window.__shots }));
const version = browser.version();
await browser.close();
server.close();
const result = { runtime: "chromium", ...out.result, browserVersion: version, headless, console: lines.slice(0, 40) };
if (name) {
  fs.mkdirSync(path.join(here, '../../results/shots'), { recursive: true });
  fs.writeFileSync(path.join(here, `../../results/chromium-${name}.json`), JSON.stringify(result, null, 2) + '\n');
  for (const s of out.shots ?? []) fs.writeFileSync(path.join(here, `../../results/shots/chromium-${s.name}.png`), Buffer.from(s.dataUrl.split(',')[1], 'base64'));
}
console.log(JSON.stringify(result, (k, v) => (k === 'runs' && name ? undefined : v), 1).slice(0, 5000));
