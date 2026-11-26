// M4 W9 (AB-T-0581), M4 check 5's "a take replays exactly from its log": the sample's three take logs (a puppet take, a
// director take and a face take over "The Regular") made into tracks and the film played with them, in Node
// (apps/playground/src/takes-check.js), then in headless Chromium through the built playground's ?mode=takes, over
// loopback. Both must give the same tracks from each log, the same film text, the same final world hash and the same
// per-step run; a snapshot taken inside a take must restore to the same end, and each take must do what was performed.
// Writes acceptance/results/m4-takes.json; exit 1 on a difference. Needs vrmxa-core beside the repo (it
// reads the characters) and a built playground:
//   (cd apps/playground && npx vite build) && node acceptance/m4/takes.mjs [--node-only]
// It draws nothing, but the page makes a renderer, so the browser part takes the GPU lock (acceptance/README.md).
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { takesCheck, takesPerformed } from '../../apps/playground/src/takes-check.js';
import { vrmxaCore, PATHS } from '../../engine/packages/character/test/fixtures.mjs';
import * as projectBehaviours from '../../content/sample/behaviours.js';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';

const here = import.meta.dirname, content = path.join(here, '../../content/sample'), argv = process.argv.slice(2);
installPortableMath();
const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
const opts = { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true };
const node = { runtime: 'node', version: process.version, ...(await takesCheck({ R: await loadRapier(), bytes, opts })) };
const brief = (r) => ({ runtime: r.runtime, takes: r.takes.map((t) => `${t.id} ${t.kind} ${t.tracksHash}`), filmHash: r.filmHash, final: r.final, steps: r.steps, twice: r.twice, takesChangeTheFilm: r.takesChangeTheFilm, restored: r.restored, performed: r.performed, errors: r.errors });
console.log(JSON.stringify(brief(node), null, 1));

let chromium = null;
if (!argv.includes('--node-only')) {
  await acquireGpuLock({ who: 'acceptance/m4/takes.mjs', onWait: sayWaiting('acceptance/m4/takes.mjs') });
  const dist = path.join(here, '../../apps/playground/dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('build the playground first: (cd apps/playground && npx vite build)'); process.exit(2); }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname, file = path.join(dist, decodeURIComponent(p === '/' ? '/index.html' : p));
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const require = createRequire(path.join(here, '../../spike-determinism/web/package.json'));
  const pw = require('playwright-core');
  const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const browser = await pw.chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`error: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?mode=takes&renderer=webgl`);
  await page.waitForFunction(() => /** @type {any} */ (window).READY === true, null, { timeout: 600000, polling: 1000 });
  const r = await page.evaluate(() => { const w = /** @type {any} */ (window); return { ...w.__result, pageErrors: w.__errors }; });
  chromium = { runtime: 'chromium', version: browser.version(), ...r, errors: [...errors, ...(r.pageErrors ?? [])] };
  delete chromium.pageErrors;
  await browser.close(); server.close();
  console.log(JSON.stringify(brief(chromium), null, 1));
}

// the per-step run is compared whole here, and kept as a digest (every step's hashes aren't committed)
const digest = (run) => createHash('sha256').update(JSON.stringify(run)).digest('hex');
const sameTakes = (a, b) => JSON.stringify(a.takes) === JSON.stringify(b.takes) && a.filmHash === b.filmHash;
const same = !chromium || (sameTakes(chromium, node) && chromium.final === node.final && JSON.stringify(chromium.run) === JSON.stringify(node.run) && chromium.restored?.final === node.restored.final);
const pass = takesPerformed(node) && (!chromium || (takesPerformed(chromium) && same && !chromium.errors.length));
const keep = (r) => r && (({ run, ...rest }) => ({ ...rest, runDigest: digest(run) }))(r);
const out = { check: 'M4 check 5: each take kind replays exactly from its log, in Node and the browser (the same tracks, the same world every step)', pass, same, node: keep(node), chromium: keep(chromium) };
fs.writeFileSync(path.join(here, '../results/m4-takes.json'), JSON.stringify(out, null, 1) + '\n');
console.log(pass ? 'PASS' : 'FAIL', same ? 'same hashes' : 'HASHES DIFFER');
process.exit(pass ? 0 : 1);
