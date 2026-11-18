// The harness in headless Chromium (Playwright's Chrome for Testing, driven by the playwright-core the
// determinism spike already installed), served from dist/ over a loopback HTTP server. Writes
// results/chromium.json (and results/chromium-inject-N.json with --inject N).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = import.meta.dirname;
const require = createRequire(path.join(here, '../../../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const inject = arg('--inject');

const dist = path.join(here, 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}/index.html`;

const browser = await chromium.launch({ executablePath: exe, headless: true });
const version = browser.version();
async function run(query) {
  const page = await browser.newPage();
  await page.goto(`${base}?${query}`);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 300000 });
  const out = await page.evaluate(() => ({ result: window.__result ?? null, errors: window.__errors }));
  await page.close();
  if (out.errors.length) throw new Error(out.errors.join('\n'));
  return out.result;
}
const det = await run(`mode=det${inject ? `&inject=${inject}` : ''}`);
const budget = inject ? null : (await run('mode=budget')).budget;
await browser.close();
server.close();
const name = inject ? `chromium-inject-${inject}` : 'chromium';
fs.writeFileSync(path.join(here, 'results', `${name}.json`), JSON.stringify({ runtime: 'chromium', version, ua: det.ua, inject: inject ? Number(inject) : -1, determinism: det.determinism, budget }) + '\n');
console.log(JSON.stringify({ name, version, final: det.determinism.final, snapshot: det.determinism.snapshot, budget }, null, 1));
