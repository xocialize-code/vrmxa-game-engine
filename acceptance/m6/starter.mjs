// M6 W4 (AB-T-0647): the starter content works in the playground. The check (apps/playground/src/starter-check.js:
// Mira cast with the starter's default animation set plays every slot of every set; every starter item used as its
// type says) in Node, then in headless Chromium through the built playground's ?mode=starter over loopback, with the
// starter served as the build's starter/ folder. Both must pass, and the browser's results must equal Node's.
// Writes acceptance/results/m6-starter.json; exit 1 on a failure or a difference. Needs vrmxa-core beside the
// repo and a built playground:
//   (cd apps/playground && npx vite build) && node acceptance/m6/starter.mjs [--node-only]
// The check draws nothing, but the page makes a renderer, so the browser part takes the GPU lock (acceptance/README.md,
// "Exactness").
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier, RAPIER_BUILD } from '@vrmxg/physics';
import { starterAnimationsCheck, starterItemsCheck } from '../../apps/playground/src/starter-check.js';
import { vrmxaCore } from '../../engine/packages/character/test/fixtures.mjs';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';

const here = import.meta.dirname, argv = process.argv.slice(2), res = (f) => path.join(here, '../results', f);
installPortableMath();
const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(here, '../../content/sample', ref)));
const starterBytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(here, '../../content/starter', ref)));
const o = { R: await loadRapier(), bytes, starterBytes, vrmxaCore: await vrmxaCore() };
const node = { runtime: 'node', version: process.version, animations: await starterAnimationsCheck(o), items: await starterItemsCheck(o) };
node.ok = node.animations.ok && node.items.ok;
const brief = (r) => ({ runtime: r.runtime, ok: r.ok, slots: r.animations?.slots.length, slotFailures: r.animations?.failures, items: r.items?.items.length, itemFailures: r.items?.failures, errors: r.errors });
console.log(JSON.stringify(brief(node)));

let chromium = null;
if (!argv.includes('--node-only')) {
  await acquireGpuLock({ who: 'acceptance/m6/starter.mjs', onWait: sayWaiting('acceptance/m6/starter.mjs') });
  const dist = path.join(here, '../../apps/playground/dist');
  if (!fs.existsSync(path.join(dist, 'starter/animations.json'))) { console.error('build the playground first: (cd apps/playground && npx vite build)'); process.exit(2); }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
  const server = http.createServer((req, rs) => {
    const p = new URL(req.url, 'http://x').pathname, file = path.join(dist, decodeURIComponent(p === '/' ? '/index.html' : p));
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rs.writeHead(404).end(); return; }
    rs.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const require = createRequire(path.join(here, '../../spike-determinism/web/package.json'));
  let pw;
  try { pw = require('playwright-core'); } catch { pw = createRequire(path.join(here, '../../../../../spike-determinism/web/package.json'))('playwright-core'); }
  const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const browser = await pw.chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`error: ${m.text()}`); });
  await page.goto(`${url}/?mode=starter&renderer=webgl`);
  await page.waitForFunction(() => /** @type {any} */ (window).READY === true, null, { timeout: 600000, polling: 1000 });
  const r = await page.evaluate(() => { const w = /** @type {any} */ (window); return { ...w.__result, pageErrors: w.__errors }; });
  chromium = { runtime: 'chromium', version: browser.version(), ...r, errors: [...errors, ...(r.pageErrors ?? [])] };
  delete chromium.pageErrors;
  await browser.close(); server.close();
  console.log(JSON.stringify(brief(chromium)));
}

const strip = (r) => r && JSON.stringify({ animations: r.animations, items: r.items });
const same = !chromium || strip(chromium) === strip(node);
const pass = node.ok && (!chromium || (chromium.ok && !chromium.errors.length && same));
fs.mkdirSync(path.dirname(res('m6-starter.json')), { recursive: true });
fs.writeFileSync(res('m6-starter.json'), JSON.stringify({
  check: 'M6 W4: the starter content works: Mira cast with the default animation set plays every slot of every set; every starter item does what its type says (open, press, sit, take); the same in Node and in the playground in Chromium',
  pass, same, rapier: RAPIER_BUILD, node, chromium: chromium && { ...chromium, animations: same ? 'the same as node' : chromium.animations, items: same ? 'the same as node' : chromium.items },
}, null, 1) + '\n');
console.log(pass ? 'PASS' : 'FAIL', chromium ? (same ? 'Chromium\'s results are Node\'s' : 'RESULTS DIFFER') : '(node only)');
process.exit(pass ? 0 : 1);
