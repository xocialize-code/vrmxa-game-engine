// The built playground (apps/playground/dist) in headless Chromium: loads the cafe, presses Play, lets it run for
// 3 s, then reads the readouts and the console. Exit 1 on a load error, a console error, or a step count that
// didn't move. Uses the playwright-core and Chrome for Testing the determinism spike installed.
//   (cd apps/playground && npx vite build) && node apps/playground/scripts/chromium-check.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { acquireGpuLock, sayWaiting } from '../../../acceptance/gpu-lock.mjs';

await acquireGpuLock({ who: 'apps/playground/scripts/chromium-check.mjs', onWait: sayWaiting('apps/playground/scripts/chromium-check.mjs') }); // M4 W3: it draws (Play)

const here = import.meta.dirname, dist = path.join(here, '../dist');
const require = createRequire(path.join(here, '../../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname === '/' ? '/index.html' : new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleLines = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleLines.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForSelector('#play:not([disabled])', { timeout: 60000 });
const name = (id) => page.getAttribute(`#${id}`, 'aria-label');
const before = await name('step-count');
await page.click('#play');
await page.waitForTimeout(3000);
const out = { version: browser.version(), before, step: await name('step-count'), frame: await name('frame-time'), sim: await name('sim-time'), render: await name('render-time'), playButton: await page.textContent('#play'), error: await page.$eval('.error', (e) => e.textContent).catch(() => null), console: consoleLines };
await page.screenshot({ path: path.join(dist, 'chromium-check.png') });
await browser.close(); server.close();
console.log(JSON.stringify(out, null, 1));
process.exit(out.error || consoleLines.some((l) => l.startsWith('error') || l.startsWith('pageerror')) || out.step === before ? 1 : 0);
