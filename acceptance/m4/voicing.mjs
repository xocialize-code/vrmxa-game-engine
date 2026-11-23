// M4 W7 (AB-T-0579), M4 check 3's "replay from the baked track is exact": the voiced sample sequence played in Node
// (apps/playground/src/voicing-check.js), then in headless Chromium through the built playground's ?mode=voicing, over
// loopback. Both must give the same final world hash, the same hash of every speaker's mouth at every step, and the same
// per-step run; a snapshot taken mid-line must restore to the same end. Writes acceptance/results/m4-voicing.json; exit 1
// on a difference. Needs vrmxa-avatar-studio beside the repo (vrmxa-core reads the characters) and a built playground:
//   (cd apps/playground && npx vite build) && node acceptance/m4/voicing.mjs [--node-only]
// It plays no sound and draws nothing, but the page makes a renderer, so it takes the GPU lock (acceptance/README.md).
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { voicingCheck } from '../../apps/playground/src/voicing-check.js';
import { vrmxaCore, PATHS } from '../../engine/packages/character/test/fixtures.mjs';
import * as projectBehaviours from '../../content/sample/behaviours.js';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';

const here = import.meta.dirname, content = path.join(here, '../../content/sample'), argv = process.argv.slice(2);
installPortableMath();
const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
const opts = { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true };
const node = { runtime: 'node', version: process.version, ...(await voicingCheck({ R: await loadRapier(), bytes, opts })) };
const brief = (r) => ({ runtime: r.runtime, final: r.final, mouthHash: r.mouthHash, steps: r.steps, everyLineBaked: r.everyLineBaked, inTheirVoices: r.inTheirVoices, leftToVoice: r.leftToVoice, playsFromTrack: r.playsFromTrack, everyLineSpoken: r.everyLineSpoken, mouthOpens: r.mouthOpens, restored: r.restored, errors: r.errors });
console.log(JSON.stringify(brief(node), null, 1));

let chromium = null;
if (!argv.includes('--node-only')) {
  await acquireGpuLock({ who: 'acceptance/m4/voicing.mjs', onWait: sayWaiting('acceptance/m4/voicing.mjs') });
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
  let pw;
  try { pw = require('playwright-core'); } catch { pw = createRequire('/Volumes/Satechi/Development/vrmxa-game-engine/spike-determinism/web/package.json')('playwright-core'); }
  const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const browser = await pw.chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`error: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?mode=voicing&renderer=webgl`);
  await page.waitForFunction(() => /** @type {any} */ (window).READY === true, null, { timeout: 600000, polling: 1000 });
  const r = await page.evaluate(() => { const w = /** @type {any} */ (window); return { ...w.__result, pageErrors: w.__errors }; });
  chromium = { runtime: 'chromium', version: browser.version(), ...r, errors: [...errors, ...(r.pageErrors ?? [])] };
  delete chromium.pageErrors;
  await browser.close(); server.close();
  console.log(JSON.stringify(brief(chromium), null, 1));
}

// the per-step run is compared whole here, and kept as a digest (every step's hashes, ~1 MB a runtime, aren't committed)
const digest = (run) => createHash('sha256').update(JSON.stringify(run)).digest('hex');
const ok = (r) => r.everyLineBaked && r.inTheirVoices && r.leftToVoice === 0 && r.playsFromTrack && r.everyLineSpoken && r.mouthOpens > 0.3 && r.restored.same && r.restored.mouthsSame;
const same = !chromium || (chromium.final === node.final && chromium.mouthHash === node.mouthHash && JSON.stringify(chromium.run) === JSON.stringify(node.run) && chromium.restored?.final === node.restored.final);
const pass = ok(node) && (!chromium || (ok(chromium) && same && !chromium.errors.length));
const keep = (r) => r && (({ run, ...rest }) => ({ ...rest, runDigest: digest(run) }))(r);
const out = { check: 'M4 check 3: every line voiced in its character\'s voice; replay from the baked track exact in Node and the browser', pass, same, node: keep(node), chromium: keep(chromium) };
fs.writeFileSync(path.join(here, '../results/m4-voicing.json'), JSON.stringify(out, null, 1) + '\n');
console.log(pass ? 'PASS' : 'FAIL', same ? 'same hashes' : 'HASHES DIFFER');
process.exit(pass ? 0 : 1);
