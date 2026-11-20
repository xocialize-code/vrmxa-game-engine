// M4 W4 (AB-T-0576), M4 check 1's "byte for byte": the scenario (script-scenario.js) in Node and in headless Chromium
// over loopback; both hash the canonical text. Writes acceptance/results/m4-script.json, exit 1 on a difference.
//   node acceptance/m4/script-chromium.mjs        (then acceptance/m4/script-wkwebview.sh for WebKit)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { runScenario } from './script-scenario.js';
import { buildPage } from './script-build.mjs';

const here = import.meta.dirname, sample = path.join(here, '../../content/sample');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const out = runScenario({ script: fs.readFileSync(path.join(sample, 'scripts/cafe-order.fountain'), 'utf8'), set: JSON.parse(fs.readFileSync(path.join(sample, 'cafe.vrmxs'), 'utf8')), marks: JSON.parse(fs.readFileSync(path.join(sample, 'scripts/cafe-marks.json'), 'utf8')).marks });
const node = { sample: { sha256: sha(out.sample), bytes: out.sample.length }, rescript: { sha256: sha(out.rescript), bytes: out.rescript.length }, version: process.version };

const dir = await buildPage();
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const f = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/$/, '/index.html')));
  if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = /** @type {any} */ (server.address()).port;

const require = createRequire(path.join(here, '../../spike-determinism/web/package.json'));
let chromiumMod;
try { chromiumMod = require('playwright-core'); } catch { chromiumMod = createRequire('/Volumes/Satechi/Development/vrmxa-game-engine/spike-determinism/web/package.json')('playwright-core'); }
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const browser = await chromiumMod.chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => /** @type {any} */ (window).READY === true, null, { timeout: 60000 });
const chromium = await page.evaluate(() => { const w = /** @type {any} */ (window); return { ...w.__result, errors: w.__errors }; });
await browser.close(); server.close();

const same = chromium.sample?.sha256 === node.sample.sha256 && chromium.rescript?.sha256 === node.rescript.sha256;
const result = { check: 'M4 W4: the same script gives the same sequence in every runtime', same, node, chromium: { ...chromium, errors: [...(chromium.errors ?? []), ...errors] } };
fs.writeFileSync(path.join(here, '../results/m4-script.json'), JSON.stringify(result, null, 1) + '\n');
console.log(JSON.stringify(result, null, 1));
process.exit(same ? 0 : 1);
