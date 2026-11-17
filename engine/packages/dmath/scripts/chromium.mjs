// Runs the browser check in headless Chromium (Playwright's cached build) over a local static server.
// Needs playwright-core resolvable (run from a folder that has it, or set NODE_PATH).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(process.env.PLAYWRIGHT_FROM ? path.join(process.env.PLAYWRIGHT_FROM, 'x.js') : import.meta.url);
const { chromium } = require('playwright-core');
const root = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }).end(fs.readFileSync(p));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.waitForFunction('window.READY === true', null, { timeout: 60000 });
const result = await page.evaluate('window.__result');
result.pageErrors = errors;
console.log(JSON.stringify(result));
await browser.close();
server.close();
