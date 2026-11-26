// The spike's pages in Chromium (Chrome for Testing through the determinism spike's playwright-core), served from
// dist/ on 127.0.0.1 only, under the machine's GPU lock. Each case is a fresh page. Writes
// results/<label>/chromium.json (home folder scrubbed) and each data URL a page leaves in window.__pngs.
//   node web/scripts/chromium.mjs <label> '<case>[;<case>…]' [--headed]
//   node web/scripts/chromium.mjs stereo 'stereo.html?post=1'
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { acquireGpuLock, sayWaiting } from '../../../acceptance/gpu-lock.mjs';

const here = import.meta.dirname, repo = path.resolve(here, '../../..');
const [label, casesArg = 'index.html'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const headed = process.argv.includes('--headed');
if (!label) throw new Error('usage: chromium.mjs <label> <cases>');
// playwright-core lives in the determinism spike's node_modules, in this checkout or the main one
const common = path.resolve(repo, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: repo, encoding: 'utf8' }).trim());
const pw = [repo, path.dirname(common)].map((r) => path.join(r, 'spike-determinism/web/package.json')).find((p) => fs.existsSync(path.join(path.dirname(p), 'node_modules/playwright-core')));
if (!pw) throw new Error('needs spike-determinism/web/node_modules/playwright-core (npm install there)');
const { chromium } = createRequire(pw)('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

const dist = path.join(here, '../dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = /** @type {any} */ (server.address()).port;

const release = await acquireGpuLock({ who: `spike-webxr/chromium ${label}`, onWait: sayWaiting(`spike-webxr/chromium ${label}`) });
const outDir = path.join(here, '../../results', label);
fs.mkdirSync(outDir, { recursive: true });
const rows = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: exe, headless: !headed, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
  for (const c of casesArg.split(';')) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const consoleLines = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleLines.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${port}/${c}`);
    let timedOut = false;
    try { await page.waitForFunction(() => window.READY === true, null, { timeout: 600000, polling: 250 }); } catch { timedOut = true; }
    const got = await page.evaluate(() => ({ result: window.__result ?? null, errors: window.__errors ?? [], warnings: window.__warnings ?? [], pngs: window.__pngs ?? {}, isolated: self.crossOriginIsolated }));
    const name = c.replace(/[=&,.?/]/g, '_'), written = [];
    for (const [k, url] of Object.entries(got.pngs)) {
      const file = `${name}__chromium__${k}.png`;
      fs.writeFileSync(path.join(outDir, file), Buffer.from(String(url).split(',')[1], 'base64'));
      written.push(file);
    }
    delete got.pngs;
    rows.push({ case: c, origin: 'chromium-loopback', runtime: `Chrome for Testing ${browser.version()}${headed ? ' headed' : ' headless'}`, timedOut, seconds: (Date.now() - t0) / 1000, ...got, pngs: written.sort(), console: consoleLines });
    console.log(`${c}: ${timedOut ? 'TIMED OUT ' : ''}errors ${got.errors.length} warnings ${got.warnings.length} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    await page.close();
  }
} finally { await browser?.close(); server.close(); release(); }
const text = JSON.stringify(rows, null, 1).split(process.env.HOME).join('~');
fs.writeFileSync(path.join(outDir, 'chromium.json'), text + '\n');
console.log(`wrote ${path.relative(repo, path.join(outDir, 'chromium.json'))}`);
