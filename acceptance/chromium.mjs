// The M0 checks in headless Chromium: the built playground (apps/playground/dist) at ?mode=acceptance, over a
// loopback server. Writes results/chromium.json and results/chromium.png (the last frame: debug draw on).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = import.meta.dirname, dist = path.join(here, '../apps/playground/dist');
const require = createRequire(path.join(here, '../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname, file = path.join(dist, decodeURIComponent(p === '/' ? '/index.html' : p));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleLines = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleLines.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:${server.address().port}/?mode=acceptance`);
await page.waitForFunction(() => window.READY === true, null, { timeout: 300000 });
const out = await page.evaluate(() => ({ result: window.__result ?? null, errors: window.__errors, warnings: window.__warnings }));
await page.screenshot({ path: path.join(here, 'results/chromium.png') });
const version = browser.version();
await browser.close(); server.close();
fs.writeFileSync(path.join(here, 'results/chromium.json'), JSON.stringify({ runtime: 'chromium', version, ...out, console: consoleLines }) + '\n');
const r = out.result;
console.log(JSON.stringify({ version, errors: out.errors, warnings: out.warnings, console: consoleLines, final: r?.simulation.final, snapshot: r?.simulation.snapshot, rendered: r && { ...r.rendered, presets: Object.keys(r.rendered.presets) } }, null, 1));
