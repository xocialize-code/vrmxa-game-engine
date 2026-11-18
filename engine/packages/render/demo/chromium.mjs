// The render demo in Chromium (Chrome for Testing, through the playwright-core the determinism spike
// installed), served from dist/ over loopback. --headed opens a window (a real display rate); default is
// headless. Writes results/chromium[-debug].json and a screenshot.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = import.meta.dirname;
const require = createRequire(path.join(here, '../../../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const headed = process.argv.includes('--headed'), debug = process.argv.includes('--debug');
const dist = path.join(here, 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}/index.html?mode=trace${debug ? '&debug=1' : ''}`;
const browser = await chromium.launch({ executablePath: exe, headless: !headed });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const console_ = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console_.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => console_.push(`pageerror: ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => window.READY === true, null, { timeout: 300000 });
const out = await page.evaluate(() => ({ result: window.__result ?? null, errors: window.__errors, warnings: window.__warnings }));
const name = `chromium${headed ? '-headed' : ''}${debug ? '-debug' : ''}`;
await page.screenshot({ path: path.join(here, 'results', `${name}.png`) });
await browser.close(); server.close();
fs.writeFileSync(path.join(here, 'results', `${name}.json`), JSON.stringify({ runtime: name, version: browser.version?.() , ...out, console: console_ }, null, 1) + '\n');
console.log(JSON.stringify({ name, errors: out.errors, warnings: out.warnings.length, console: console_.length, hashes: out.result?.hashes, smooth: out.result?.smoothness120, live: out.result?.live, debug: out.result?.debug, renderMs: out.result?.renderMs }, null, 1));
