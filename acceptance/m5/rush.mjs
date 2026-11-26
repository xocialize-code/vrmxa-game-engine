// M5 W10 (AB-T-0620), M5's exit checks 7 and 10 (the sample game's part): "The Morning Rush" played through the game
// app in Chromium, and its recorded session replayed exactly.
//
//   node acceptance/m5/rush.mjs              (needs vrmxa-core beside the repository, and the determinism spike's
//                                             playwright-core and Chrome for Testing, as the other Chromium runners)
//   … --rebuild                              build apps/game first even when apps/game/dist is there
//   … --only win|lose                        play one session (and replay it)
//
// The sample game (content/sample/game) is exported with vrmxg-export's own function (--game game/game.json), served on
// loopback and played in headless Chromium through the app's own title menu by a scripted player (rush-player.js:
// a stand-in gamepad's stick and X button, and the dialogue's choice buttons, decided each frame from the world):
//   1  win: every order right, each tray carried to its table, the till closed; the won ending, then back to the
//      title. Escape pauses and the session's log (the input the app recorded, a hash of the world after every step) is
//      read back. The HUD's goal, score and clock and what she carries are read along the way, and four stills kept;
//   2  lose: the first two orders wrong; the lost ending;
//   3  each log replayed in Node: the same hash after every step;
//   4  each log replayed in the game app itself (?replay=) on WebGPU and on WebGL, drawn, from a fresh page: the same
//      hash after every step.
// The logs go to acceptance/results/m5-rush/ (win.json, lose.json: the WKWebView run, rush-wkwebview.sh, replays
// them), the summary to acceptance/results/m5-rush.json. Exit 1 when a check fails. It draws, so it takes the GPU lock.
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { openFolder, behavioursImporter, checkFolder } from '@vrmxg/bundle/node';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';
import { pinState } from '../../scripts/vrmxa-core.mjs';
import { vrmxaCore, PATHS } from '../../engine/packages/character/test/fixtures.mjs';
import { gameScenes, worldLoader, freeWorld } from '../../apps/game/src/world.js';
import { replaySession, firstDifference } from '../../apps/game/src/session.js';
import { exportRush } from './rush-node.mjs';
import { RUSH_INIT, playRushSession } from './rush-driver.mjs';

const here = import.meta.dirname, root = path.join(here, '../..');
const args = process.argv.slice(2), only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const RESULTS = path.join(root, 'acceptance/results'), LOGS = path.join(RESULTS, 'm5-rush');
const checks = [], say = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
if (!fs.existsSync(PATHS.core)) { console.error('needs vrmxa-core beside the repository: the game has characters'); process.exit(1); }
{ const pin = pinState(); if (!pin.ok) { console.error(`${pin.problem}: the logs this records are tied to the build, so it refuses`); process.exit(1); } }
const GAME = path.join(root, 'apps/game');
if (args.includes('--rebuild') || !fs.existsSync(path.join(GAME, 'dist/vrmxg-runtime.json'))) execFileSync('npx', ['vite', 'build'], { cwd: GAME, stdio: ['ignore', 'ignore', 'inherit'] });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-m5-rush-'));
const dir = path.join(tmp, 'build');
const exported = await exportRush(dir);
say('the sample game exports with the game app as its runtime (vrmxg-export --game game/game.json)', checkFolder(dir).ok, `${exported.files} files, ${(exported.bytes / 1e6).toFixed(1)} MB, digest ${exported.manifest.digest.slice(0, 16)}`);
fs.mkdirSync(LOGS, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // the logs are served beside the page (/logs/…), outside the build
  const f = url.startsWith('/logs/') ? path.join(LOGS, url.slice(6)) : path.join(dir, url === '/' ? '/index.html' : url);
  if (!(f.startsWith(dir + path.sep) || f.startsWith(LOGS + path.sep)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
const base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}/index.html`;

let pw;
try { pw = createRequire(path.join(root, 'spike-determinism/web/package.json'))('playwright-core'); } catch { pw = createRequire(path.join(here, '../../../../../spike-determinism/web/package.json'))('playwright-core'); }
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const release = await acquireGpuLock({ who: 'acceptance/m5/rush.mjs', onWait: sayWaiting('acceptance/m5/rush.mjs') });
const browser = await pw.chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'] });
const freshContext = async () => { const c = await browser.newContext({ viewport: { width: 1280, height: 720 } }); await c.addInitScript(INIT); return c; };
// the stand-in gamepad and the scripted player (rush-driver.mjs)
const INIT = RUSH_INIT;
const context = await freshContext();

const errors = [];
const watch = (page) => { page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); };
const until = (page, fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

/** One session from the title menu, played by the scripted player until its ending; → its log. */
async function play(name) {
  const page = await (await freshContext()).newPage(); // its own storage: an earlier session's saves don't show here
  watch(page);
  const s = await playRushSession(page, `${base}?trace`, name);
  fs.writeFileSync(path.join(LOGS, `${name}.json`), JSON.stringify(s.log));
  for (const [k, png] of Object.entries(s.shots)) fs.writeFileSync(path.join(RESULTS, `m5-rush-${name}-${k}.png`), png);
  return s;
}

const sessions = [];
for (const name of only ? [only] : ['win', 'lose']) {
  const s = await play(name);
  sessions.push(s);
  const choices = s.log.segments.flatMap((g) => g.recording?.frames.filter((f) => f[2]?.['dialogue.choose']).map((f) => f[2]['dialogue.choose']) ?? []);
  const reached = s.scenes.includes(`game/${s.want}.vrmxs`);
  say(`${name}: played from the title menu to the ${s.want} ending, its dialogue choices recorded`, reached && choices.length >= 3, `scenes ${s.scenes.join(' → ')}; ${s.log.hashes.length} steps; choices ${choices.join(', ')}; ending line "${s.seen.endingLine}"`);
  if (name === 'win') {
    say('win: the HUD showed the goal, score and clock; the tray was carried on the upper body; the checkpoint was taken', /Serve the three regulars/.test(s.seen.hud?.goal ?? '') && /^Score/.test(s.seen.hud?.score ?? '') && !!s.seen.hud?.clock && s.seen.carry?.layers?.includes('upperBody') && !!s.seen.checkpoint,
      `HUD ${JSON.stringify(s.seen.hud)}; carrying ${JSON.stringify(s.seen.carry)}; checkpoint ${JSON.stringify(s.seen.checkpoint)}; the first question ${JSON.stringify(s.seen.choice)}`);
  }
}

// ---------------------------------------------------------------- 3: Node
installPortableMath();
const build = await openFolder(dir);
const core = await vrmxaCore(), closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
const scenes = gameScenes(build.bytes, build.game), docs = await scenes.documents();
const load = worldLoader({ R: await loadRapier(), scenes, behaviours: await build.behaviours(behavioursImporter(dir)), actions: await build.actions(), vrmxaCore: core, closet, options: () => ({ stubTextures: true }) });
const node = {};
for (const s of sessions) {
  const replay = await replaySession(s.log, { digest: build.manifest.digest, load, unload: freeWorld, scenes: docs.scenes, prefabs: docs.prefabs });
  const diff = firstDifference(replay, s.log.hashes);
  node[s.name] = { steps: replay.length, final: replay.at(-1) };
  say(`${s.name}: the session played in Chromium replays in Node to the same hash after every step`, diff < 0 && replay.length === s.log.hashes.length, diff < 0 ? `${replay.length} steps, final ${replay.at(-1)?.hash} at step ${replay.at(-1)?.step}` : `first difference at ${diff}: page ${JSON.stringify(s.log.hashes[diff])}, Node ${JSON.stringify(replay[diff])}`);
}

// ---------------------------------------------------------------- 4: the game app replays it, drawn, on both backends
const appReplays = {};
for (const s of sessions) {
  for (const backend of ['webgpu', 'webgl']) {
    const page = await context.newPage();
    watch(page);
    await page.goto(`${base}?replay=logs/${s.name}.json&renderer=${backend}`);
    await until(page, () => /** @type {any} */ (window).READY === true, null, 10 * 60 * 1000);
    const r = await page.evaluate(() => /** @type {any} */ (window).__result);
    await page.close();
    const run = r.runs?.[0], diff = run ? firstDifference(run.hashes, s.log.hashes) : 0;
    appReplays[`${s.name}-${backend}`] = { backend: r.backend, steps: run?.steps ?? 0, final: run?.final ?? null, frames: r.frames, error: r.error ?? null };
    say(`${s.name}: the game app replays the log drawn on ${backend === 'webgpu' ? 'WebGPU' : 'WebGL'} to the same hash after every step`, !r.error && r.backend === backend && diff < 0 && run.steps === s.log.hashes.length,
      r.error ?? (diff < 0 ? `${run.steps} steps on ${r.backend}, final ${run.final?.hash}; ${r.frames?.frames} frames, p99 ${r.frames?.p99?.toFixed(1)} ms` : `first difference at ${diff}: app ${JSON.stringify(run.hashes[diff])}, log ${JSON.stringify(s.log.hashes[diff])}`));
  }
}

const version = browser.version();
await browser.close(); server.close(); release();
say('no errors in the pages', errors.length === 0, errors.slice(0, 5).join(' | '));
fs.rmSync(tmp, { recursive: true, force: true });
const ok = checks.every((c) => c.ok);
const prior = fs.existsSync(path.join(RESULTS, 'm5-rush.json')) ? JSON.parse(fs.readFileSync(path.join(RESULTS, 'm5-rush.json'), 'utf8')) : null;
fs.writeFileSync(path.join(RESULTS, 'm5-rush.json'), `${JSON.stringify({
  check: 'M5 W10: The Morning Rush won and lost through the game app in Chromium by a scripted player; each recorded session replayed in Node and in the game app on WebGPU and WebGL to the same per-step hashes (AB-T-0620, exit checks 7 and 10)',
  ok, node: process.version, chromium: version, build: { game: build.game.id, files: exported.files, bytes: exported.bytes, digest: exported.manifest.digest, manifest: exported.sha256, runtime: `${build.manifest.runtime.name} ${build.manifest.runtime.version}` },
  sessions: Object.fromEntries([...(only && prior ? Object.entries(prior.sessions ?? {}) : []), ...sessions.map((s) => [s.name, { steps: s.log.hashes.length, scenes: s.scenes, final: s.log.hashes.at(-1), seen: s.seen, tasks: s.tasks, log: `acceptance/results/m5-rush/${s.name}.json` }])]),
  nodeReplays: node, appReplays, checks,
}, null, 1)}\n`);
console.log(ok ? 'all checks pass' : 'some checks failed');
process.exit(ok ? 0 : 1);
