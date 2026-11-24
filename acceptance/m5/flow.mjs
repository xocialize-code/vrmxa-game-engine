// M5 W2 (AB-T-0617), M5 checks 3 and 6: the game flow scenario (flow-scenario.js) in Node and in headless Chromium over
// loopback. Node loads each world at once, Chromium with a steady and with a varied delay: the hashes must not care.
// Writes acceptance/results/m5-flow.json (and m5-flow-node-run.json, Node's packed run, which flow-wkwebview.sh
// compares WebKit's with); exit 1 on a difference.
//   node acceptance/m5/flow.mjs        (then acceptance/m5/flow-wkwebview.sh for WebKit)
// No renderer and no GPU: nothing here draws, so it takes no GPU lock.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier, RAPIER_BUILD } from '@vrmxg/physics';
import { parse } from '@vrmxg/scene';
import { runFlowScenario, DELAYS } from './flow-scenario.js';
import { buildPage } from './flow-build.mjs';
import { compareFlow, brief } from './flow-compare.mjs';
import { SCENES } from '../../engine/packages/game/test/fixtures/world.js';

installPortableMath();
const here = import.meta.dirname, fixtures = path.join(here, '../../engine/packages/game/test/fixtures');
const scenes = new Map(SCENES.map((s) => [s, parse(fs.readFileSync(path.join(fixtures, s), 'utf8'))]));
const node = { ...(await runFlowScenario(await loadRapier(), scenes, { delays: DELAYS.none })), delay: 'none', version: process.version };
// the same in Node with loading that takes time: the first thing to hold before any browser is asked
const nodeSlow = await runFlowScenario(await loadRapier(), scenes, { delays: DELAYS.varied, sleep: (ms) => new Promise((ok) => setTimeout(ok, ms)) });
const slow = compareFlow(node, nodeSlow);

const dir = await buildPage();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const f = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/$/, '/index.html')));
  if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', /** @type {any} */ (r)));
const port = /** @type {any} */ (server.address()).port;

// playwright-core lives with the determinism spike; a worktree without its node_modules uses the main checkout's
const wanted = path.join(here, '../../spike-determinism/web/package.json');
let playwright;
try { playwright = createRequire(wanted)('playwright-core'); } catch { playwright = createRequire(path.join(here, '../../../../../spike-determinism/web/package.json'))('playwright-core'); }
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const browser = await playwright.chromium.launch({ executablePath: exe, headless: true });
const chromium = [];
for (const delay of ['steady', 'varied']) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?delay=${delay}`);
  await page.waitForFunction(() => /** @type {any} */ (window).READY === true, null, { timeout: 120000 });
  const r = await page.evaluate(() => { const w = /** @type {any} */ (window); return { result: w.__result ?? null, errors: w.__errors }; });
  chromium.push({ delay, result: r.result, errors: [...(r.errors ?? []), ...errors], ...compareFlow(node, r.result) });
  await page.close();
}
const version = browser.version();
await browser.close(); server.close();

const same = slow.same && chromium.every((c) => c.same && c.errors.length === 0);
const out = {
  check: 'M5 W2: a run that changes scene gives the same per-step hashes in every runtime; a save and a checkpoint taken before a change load and go on with them',
  same, rapier: RAPIER_BUILD,
  node: brief(node),
  nodeWithSlowLoading: { ...slow, loading: nodeSlow.loading },
  chromium: chromium.map((c) => ({ delay: c.delay, same: c.same, problems: c.problems, errors: c.errors, version, result: brief(c.result) })),
};
fs.writeFileSync(path.join(here, '../results/m5-flow.json'), JSON.stringify(out, null, 1) + '\n');
fs.writeFileSync(path.join(here, '../results/m5-flow-node-run.json'), JSON.stringify(node) + '\n');
console.log(JSON.stringify({ same, final: node.final, all: node.all, changes: node.changes, save: node.save, checkpoint: node.checkpoint, nodeWithSlowLoading: slow, chromium: chromium.map((c) => ({ delay: c.delay, same: c.same, problems: c.problems, errors: c.errors, final: c.result?.final, loading: c.result?.loading })) }, null, 1));
process.exit(same ? 0 : 1);
