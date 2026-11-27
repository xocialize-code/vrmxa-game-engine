// M6 W11 (AB-T-0652): the committed session logs of both games replayed at this commit, without playing new ones. The
// game is exported fresh (vrmxg-export's own function, the game app's runtime), its digest must be the one each log
// names (a replay is exact only on the build that recorded it), and each log is replayed in Node and drawn by the game
// app itself (?replay=) in headless Chromium on WebGPU and on WebGL: the same hash after every step.
// rush.mjs and after-hours.mjs play fresh sessions first and write over the committed logs; this reads them only.
// WKWebView replays the same logs with rush-wkwebview.sh and after-hours-wkwebview.sh.
//
//   node acceptance/m6/replay-logs.mjs [rush|after-hours …] [--out <json>]     (both games when none is named)
//
// Needs vrmxa-core beside the repository, a built apps/game, and the determinism spike's playwright-core and Chrome for
// Testing, as the other Chromium runners. It draws, so it takes the GPU lock. Exit 1 when a replay differs.
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { openFolder, behavioursImporter, checkFolder } from '@vrmxg/bundle/node';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';
import { vrmxaCore, PATHS } from '../../engine/packages/character/test/fixtures.mjs';
import { gameScenes, worldLoader, freeWorld } from '../../apps/game/src/world.js';
import { replaySession, firstDifference } from '../../apps/game/src/session.js';
import { exportRush } from '../m5/rush-node.mjs';
import { exportAfterHours } from './after-hours-node.mjs';

const here = import.meta.dirname, root = path.join(here, '../..');
const RESULTS = path.join(root, 'acceptance/results');
const GAMES = {
  rush: { logs: path.join(RESULTS, 'm5-rush'), exporter: exportRush },
  'after-hours': { logs: path.join(RESULTS, 'm6-after-hours'), exporter: exportAfterHours },
};
const args = process.argv.slice(2);
const outAt = args.indexOf('--out'), out = outAt < 0 ? null : args[outAt + 1];
const named = args.filter((a, i) => !a.startsWith('--') && (outAt < 0 || i !== outAt + 1));
const unknown = named.filter((n) => !Object.hasOwn(GAMES, n));
if (unknown.length) { console.error(`no game named ${unknown.join(', ')}: ${Object.keys(GAMES).join(' or ')}`); process.exit(2); }
const games = named.length ? named : Object.keys(GAMES);
if (!fs.existsSync(PATHS.core)) { console.error('needs vrmxa-core beside the repository: the games have characters'); process.exit(1); }

const checks = [], say = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.wav': 'audio/wav' };
const pw = createRequire(path.join(root, 'spike-determinism/web/package.json'))('playwright-core');
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
installPortableMath();
const core = await vrmxaCore(), closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
const release = await acquireGpuLock({ who: 'acceptance/m6/replay-logs.mjs', onWait: sayWaiting('acceptance/m6/replay-logs.mjs') });
const browser = await pw.chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const result = { check: 'M6 W11: the committed session logs of The Morning Rush and After Hours replayed at this commit in Node and in the game app on WebGPU and WebGL (AB-T-0652, exit checks 6 and 12)', node: process.version, chromium: browser.version(), games: {} };

for (const game of games) {
  const { logs, exporter } = GAMES[game];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `vrmxg-replay-${game}-`)), dir = path.join(tmp, 'build');
  const exported = await exporter(dir);
  const g = result.games[game] = { build: { digest: exported.manifest.digest, files: exported.files, runtime: `${exported.manifest.runtime.name} ${exported.manifest.runtime.version}` }, logs: {} };
  say(`${game}: a fresh export is whole`, checkFolder(dir).ok, `${exported.files} files, digest ${exported.manifest.digest.slice(0, 16)}`);
  const build = await openFolder(dir);
  const scenes = gameScenes(build.bytes, build.game), docs = await scenes.documents();
  const load = worldLoader({ R: await loadRapier(), scenes, behaviours: await build.behaviours(behavioursImporter(dir)), actions: await build.actions(), vrmxaCore: core, closet, options: () => ({ stubTextures: true }) });
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = url.startsWith('/logs/') ? path.join(logs, url.slice(6)) : path.join(dir, url === '/' ? '/index.html' : url);
    if (!(f.startsWith(dir + path.sep) || f.startsWith(logs + path.sep)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
  const base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}/index.html`;
  const names = fs.existsSync(logs) ? fs.readdirSync(logs).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort() : [];
  say(`${game}: its committed logs are there`, names.length > 0, names.length ? names.join(', ') : `none in ${path.relative(root, logs)}`);
  for (const name of names) {
    const log = JSON.parse(fs.readFileSync(path.join(logs, `${name}.json`), 'utf8'));
    const entry = g.logs[name] = { steps: log.hashes.length, final: log.hashes.at(-1), digest: log.game.digest };
    const sameBuild = log.game.digest === exported.manifest.digest;
    say(`${game} ${name}: the log names this build`, sameBuild, `log ${log.game.digest.slice(0, 12)}, export ${exported.manifest.digest.slice(0, 12)}`);
    if (!sameBuild) continue; // replaySession refuses a log from another build: nothing to replay
    const replay = await replaySession(log, { digest: build.manifest.digest, load, unload: freeWorld, scenes: docs.scenes, prefabs: docs.prefabs });
    const diff = firstDifference(replay, log.hashes);
    entry.node = { steps: replay.length, final: replay.at(-1)?.hash ?? null, same: diff < 0 && replay.length === log.hashes.length };
    say(`${game} ${name}: replays in Node to the same hash after every step`, entry.node.same, diff < 0 ? `${replay.length} steps, final ${replay.at(-1)?.hash}` : `first difference at ${diff}`);
    for (const backend of ['webgpu', 'webgl']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${game} ${name} ${backend}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`${game} ${name} ${backend}: ${m.text()}`); });
      await page.goto(`${base}?replay=logs/${name}.json&renderer=${backend}`);
      await page.waitForFunction(() => /** @type {any} */ (window).READY === true, null, { timeout: 15 * 60 * 1000, polling: 200 });
      const r = await page.evaluate(() => /** @type {any} */ (window).__result);
      await context.close();
      const run = r.runs?.[0], d = run ? firstDifference(run.hashes, log.hashes) : 0;
      const same = !r.error && r.backend === backend && d < 0 && run.steps === log.hashes.length;
      entry[backend] = { backend: r.backend, steps: run?.steps ?? 0, final: run?.final?.hash ?? null, frames: r.frames?.frames ?? null, p99: r.frames?.p99 ?? null, error: r.error ?? null, same };
      say(`${game} ${name}: the game app replays it drawn on ${backend === 'webgpu' ? 'WebGPU' : 'WebGL'} to the same hash after every step`, same,
        r.error ?? (d < 0 ? `${run.steps} steps on ${r.backend}, final ${run.final?.hash}; ${r.frames?.frames} frames, p99 ${r.frames?.p99?.toFixed(1)} ms` : `first difference at ${d}`));
    }
  }
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
await browser.close(); release();
say('no errors in the pages', errors.length === 0, errors.slice(0, 5).join(' | '));
result.ok = checks.every((c) => c.ok); result.checks = checks;
if (out) fs.writeFileSync(path.resolve(out), `${JSON.stringify(result, null, 1)}\n`);
console.log(result.ok ? 'all replays match' : 'some replays differ');
process.exit(result.ok ? 0 : 1);
