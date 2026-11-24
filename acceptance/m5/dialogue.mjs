// M5 W3 (AB-T-0618), M5 checks 5 and 7: the dialogue scenario (dialogue-scenario.js) in Node and in headless Chromium
// over loopback. Node loads each world at once and with a varied delay; Chromium with a steady and a varied delay, the
// real overlay mounted and the choice clicked. Writes acceptance/results/m5-dialogue.json (and
// m5-dialogue-node-run.json, Node's run, which dialogue-wkwebview.sh compares WebKit's with); exit 1 on a difference.
//   node acceptance/m5/dialogue.mjs        (then acceptance/m5/dialogue-wkwebview.sh for WebKit)
// No renderer and no GPU: nothing here draws, so it takes no GPU lock.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier, RAPIER_BUILD } from '@vrmxg/physics';
import { parse } from '@vrmxg/scene';
import { runDialogueScenario, DELAYS } from './dialogue-scenario.js';
import { buildPage } from './dialogue-build.mjs';
import { compareDialogue, brief } from './dialogue-compare.mjs';
import { SCENES } from '../../engine/packages/game-ui/test/fixtures/world.js';

installPortableMath();
const here = import.meta.dirname, fixtures = path.join(here, '../../engine/packages/game-ui/test/fixtures');
const scenes = new Map(SCENES.map((s) => [s, parse(fs.readFileSync(path.join(fixtures, s), 'utf8'))]));
const node = { ...(await runDialogueScenario(await loadRapier(), scenes, { delays: DELAYS.none })), delay: 'none', version: process.version };
const nodeSlow = await runDialogueScenario(await loadRapier(), scenes, { delays: DELAYS.varied, sleep: (ms) => new Promise((ok) => setTimeout(ok, ms)) });
const slow = compareDialogue(node, nodeSlow);
const nodeOk = node.replay.same && node.recording.choices.length === 1 && node.view.flags.order === 'latte';

const dir = await buildPage();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
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
  chromium.push({ delay, result: r.result, errors: [...(r.errors ?? []), ...errors], ...compareDialogue(node, r.result) });
  await page.close();
}
const version = browser.version();
await browser.close(); server.close();

const clicked = chromium.every((c) => c.result?.dom?.clicked === 'Choice 1 of 3: A latte, please.' && c.result?.dom?.focused === 'dialogue-choice-latte');
const same = nodeOk && slow.same && clicked && chromium.every((c) => c.same && c.errors.length === 0);
const out = {
  check: 'M5 W3: a conversation with a choice, played through the overlay, is in the input recording; replaying it takes the same branch with the same per-step hashes, in every runtime',
  same, rapier: RAPIER_BUILD,
  node: brief(node),
  nodeWithSlowLoading: slow,
  chromium: chromium.map((c) => ({ delay: c.delay, same: c.same, problems: c.problems, errors: c.errors, version, result: brief(c.result) })),
};
fs.mkdirSync(path.join(here, '../results'), { recursive: true });
fs.writeFileSync(path.join(here, '../results/m5-dialogue.json'), JSON.stringify(out, null, 1) + '\n');
fs.writeFileSync(path.join(here, '../results/m5-dialogue-node-run.json'), JSON.stringify(node) + '\n');
console.log(JSON.stringify({ same, final: node.final, all: node.all, recording: node.recording, replay: node.replay, changes: node.changes, view: node.view, nodeWithSlowLoading: slow, chromium: chromium.map((c) => ({ delay: c.delay, same: c.same, problems: c.problems, errors: c.errors, final: c.result?.final, dom: c.result?.dom })) }, null, 1));
process.exit(same ? 0 : 1);
