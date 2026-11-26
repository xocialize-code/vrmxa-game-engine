// M6 W6 (AB-T-0639): a game that keeps running when its GPU device is lost. "The Morning Rush" is played once, unbroken,
// through the game app in Chromium by the scripted player (acceptance/m5/rush-player.js); its log (the input, and the
// world's hash after every step) is then replayed in the game app, drawn, while the device is lost under it:
//
//   webgpu        device.destroy() on the title, and again in the level; then the WebKit symptom, a
//                 createCommandEncoder that throws "Unable to make command encoder" (the device itself not lost)
//   fallback      device.destroy() in the level, with WebGPU refused for the replacement (?recover=webgl-fallback):
//                 the world, built with node materials, goes on drawing on three's WebGL2 backend
//   webgl         ?renderer=webgl and WEBGL_lose_context's loseContext() in the level
//   control       the same log replayed with nothing lost
//
// Each must give the unbroken session's hash after every step, recover on the backend asked for, show the status line
// while it does and clear it once a new frame is drawn, and draw again (triangles counted after each recovery; a still
// of each is kept). It draws, so it takes the GPU lock.
//
//   node acceptance/m6/device-loss.mjs       (needs vrmxa-core beside the repository, and the determinism
//                                             spike's playwright-core and Chrome for Testing, as the other Chromium runners)
//   … --rebuild                              build apps/game first even when apps/game/dist is there
//
// Results: acceptance/results/m6-device-loss.json, m6-device-loss-*.png and the session's log in m6-device-loss/. Exit 1
// when a check fails.
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { checkFolder } from '@vrmxg/bundle/node';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';
import { PATHS } from '../../engine/packages/character/test/fixtures.mjs';
import { firstDifference } from '../../apps/game/src/session.js';
import { exportRush, RUSH_PLANS } from '../m5/rush-node.mjs';

const here = import.meta.dirname, root = path.join(here, '../..');
const args = process.argv.slice(2);
const RESULTS = path.join(root, 'acceptance/results');
const checks = [], say = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
if (!fs.existsSync(PATHS.core)) { console.error('needs vrmxa-core beside the repository: the game has characters'); process.exit(1); }
const GAME = path.join(root, 'apps/game');
if (args.includes('--rebuild') || !fs.existsSync(path.join(GAME, 'dist/vrmxg-runtime.json'))) execFileSync('npx', ['vite', 'build'], { cwd: GAME, stdio: ['ignore', 'ignore', 'inherit'] });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-m6-loss-'));
// the unbroken session's log is kept (acceptance/results/m6-device-loss/lose.json): device-loss-wkwebview.sh replays it
const dir = path.join(tmp, 'build'), LOGS = path.join(RESULTS, 'm6-device-loss');
fs.mkdirSync(LOGS, { recursive: true });
const exported = await exportRush(dir);
say('the sample game exports with the game app as its runtime', checkFolder(dir).ok, `${exported.files} files, digest ${exported.manifest.digest.slice(0, 16)}`);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = url.startsWith('/logs/') ? path.join(LOGS, url.slice(6)) : path.join(dir, url === '/' ? '/index.html' : url);
  if (!(f.startsWith(dir + path.sep) || f.startsWith(LOGS + path.sep)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
const base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}/index.html`;

let pw;
try { pw = createRequire(path.join(root, 'spike-determinism/web/package.json'))('playwright-core'); } catch { pw = createRequire(path.join(here, '../../../../../spike-determinism/web/package.json'))('playwright-core'); }
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const release = await acquireGpuLock({ who: 'acceptance/m6/device-loss.mjs', onWait: sayWaiting('acceptance/m6/device-loss.mjs') });
const browser = await pw.chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'] });

const playerSource = fs.readFileSync(path.join(here, '../m5/rush-player.js'), 'utf8').replace(/^export /gm, '');
// in every page: the stand-in gamepad and the scripted player (as acceptance/m5/rush.mjs). The losses are the game app's
// own check switch (?lose=<step>:<how>, GameHost.loseDevices), so the same run works in WKWebView
const INIT = `(() => {
  const w = window;
  w.__pad = { axes: [0, 0, 0, 0], buttons: new Array(17).fill(0), connected: false };
  const real = navigator.getGamepads?.bind(navigator);
  navigator.getGamepads = () => (w.__pad.connected ? [{ id: 'stand-in', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: w.__pad.axes.slice(), buttons: w.__pad.buttons.map((v) => ({ value: v, pressed: v > 0.5, touched: v > 0 })) }] : (real?.() ?? []));
  ${playerSource}
  w.__rushPlay = (plan) => {
    const player = createRushPlayer(plan);
    let hold = 0, choice = null;
    const tick = () => {
      if (w.__rushStop) { w.__pad.axes = [0, 0, 0, 0]; w.__pad.buttons = new Array(17).fill(0); return; }
      requestAnimationFrame(tick);
      const tree = w.__game?.host?.()?.session?.tree ?? null, d = player.decide(tree);
      if (d.interact) hold = 4;
      const b = new Array(17).fill(0); if (hold > 0) { b[2] = 1; hold--; }
      w.__pad.connected = true; w.__pad.axes = [d.stick[0], -d.stick[1], 0, 0]; w.__pad.buttons = b;
      if (d.choose) choice = d.choose;
      if (choice) { const el = document.getElementById('dialogue-choice-' + choice); if (el) { el.click(); choice = null; } }
    };
    requestAnimationFrame(tick);
  };
})();`;
const freshContext = async () => { const c = await browser.newContext({ viewport: { width: 1280, height: 720 } }); await c.addInitScript(INIT); return c; };
const errors = [];
const watch = (page, run) => {
  page.on('pageerror', (e) => errors.push(`${run}: ${e.message}`));
  // a lost device logs on purpose (three's own "Device Lost", WebGPU's errors for work sent to a destroyed device, the
  // host's warning); anything else is an error of the run
  page.on('console', (m) => { if (m.type() === 'error' && !/Device Lost|destroyed|lost|Unable to make command encoder|Invalid CommandBuffer|Invalid (Command|Texture|Buffer)|WebGL: CONTEXT_LOST_WEBGL|GL_CONTEXT_LOST|WebGPU.*(error|warning)/i.test(m.text())) errors.push(`${run}: ${m.text()}`); });
};
const until = (page, fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

// ---------------------------------------------------------------- 1: the unbroken session, played
const live = await (await freshContext()).newPage();
watch(live, 'play');
await live.goto(`${base}?trace&renderer=webgpu`);
await until(live, () => { const s = /** @type {any} */ (window).__game?.state(); return s?.ready && s.stack.at(-1) === 'title'; }, null);
await live.click('#new-game');
await until(live, () => /** @type {any} */ (window).__game.state().stack.length === 0 && /** @type {any} */ (window).__game.host().session.active, null);
await live.evaluate((p) => /** @type {any} */ (window).__rushPlay(p), RUSH_PLANS.lose);
await until(live, () => { const v = /** @type {any} */ (window).__game.host().session.view(); return v?.scene === 'game/lost.vrmxs' && v.sceneSteps > 300; }, null, 6 * 60 * 1000);
await live.evaluate(() => { /** @type {any} */ (window).__rushStop = true; });
await live.keyboard.press('Escape');
await until(live, () => /** @type {any} */ (window).__game.state().stack.at(-1) === 'pause', null);
const log = await live.evaluate(() => /** @type {any} */ (window).__game.log());
await live.close();
fs.writeFileSync(path.join(LOGS, 'lose.json'), JSON.stringify(log));
const scenes = [...new Set(log.hashes.map((h) => h.scene))], changeAt = log.hashes.findIndex((h) => h.scene === 'game/level.vrmxs');
say('the unbroken session: played from the title to the lost ending, a hash after every step', scenes.includes('game/lost.vrmxs'), `${log.hashes.length} steps, scenes ${scenes.join(' → ')} (the level from step ${log.hashes[changeAt]?.step})`);

// ---------------------------------------------------------------- 2: replayed, drawn, with the device lost under it
const lvl = log.hashes[changeAt].step;
const RUNS = [
  { name: 'webgpu', query: `renderer=webgpu&lose=60:destroy,${lvl + 600}:destroy,${lvl + 1800}:encoder`, want: ['webgpu', 'webgpu', 'webgpu'] },
  { name: 'fallback', query: `renderer=webgpu&recover=webgl-fallback&lose=${lvl + 900}:destroy`, want: ['webgl-fallback'] },
  { name: 'webgl', query: `renderer=webgl&lose=${lvl + 900}:context`, want: ['webgl'] },
  { name: 'control', query: 'renderer=webgpu', want: [] },
];
const runs = {};
for (const run of RUNS) {
  const page = await (await freshContext()).newPage();
  watch(page, run.name);
  await page.goto(`${base}?replay=logs/lose.json&${run.query}`);
  // a still of each recovered display, once its status line is gone
  const stills = [];
  const t0 = Date.now();
  while (!(await page.evaluate(() => /** @type {any} */ (window).READY === true))) {
    // what the new host's renderer has drawn: three's cumulative counters (WebGPU's render calls, WebGL's frames)
    const drawn = () => page.evaluate(() => { const i = /** @type {any} */ (window).__game?.host?.()?.render?.renderer?.info?.render; return i ? (i.calls ?? 0) + (i.frame ?? 0) : 0; });
    const s = await page.evaluate(() => { const w = /** @type {any} */ (window), h = w.__game?.host?.(); return { recovered: h?.recoveries?.length ?? 0, display: h?.state.display ?? '', step: h?.session?.step ?? null }; });
    if (s.recovered > stills.length && !s.display) {
      const before = await drawn();
      await page.waitForTimeout(500);
      const png = await page.screenshot();
      const file = `m6-device-loss-${run.name}-${stills.length + 1}.png`;
      fs.writeFileSync(path.join(RESULTS, file), png);
      stills.push({ file, step: s.step, drawn: (await drawn()) - before });
    }
    if (Date.now() - t0 > 10 * 60 * 1000) break;
    await page.waitForTimeout(150);
  }
  const r = await page.evaluate(() => { const w = /** @type {any} */ (window), res = w.__result ?? {}; return { result: res, recoveries: res.recoveries ?? [], display: res.displays ?? [], losses: res.losses ?? [], backend: res.backend, canvases: res.canvases ?? null }; });
  await page.close();
  const replay = r.result?.runs?.[0], diff = replay ? firstDifference(replay.hashes, log.hashes) : 0;
  runs[run.name] = { query: run.query, losses: r.losses, recoveries: r.recoveries, display: r.display, stills, steps: replay?.steps ?? 0, final: replay?.final ?? null, backend: r.backend, frames: r.result?.frames ?? null, error: r.result?.error ?? null };
  const same = !r.result?.error && diff < 0 && replay.steps === log.hashes.length;
  say(`${run.name}: the replay gives the unbroken session's hash after every step${run.want.length ? `, through ${run.want.length} lost device${run.want.length > 1 ? 's' : ''}` : ''}`, same,
    r.result?.error ?? (diff < 0 ? `${replay.steps} steps, final ${replay.final?.hash}` : `first difference at ${diff}: replay ${JSON.stringify(replay.hashes[diff])}, unbroken ${JSON.stringify(log.hashes[diff])}`));
  if (!run.want.length) continue;
  const got = r.recoveries.map((x) => x.backend ?? `failed: ${x.failed}`);
  say(`${run.name}: each loss made a renderer again on the backend asked for, on one fresh canvas`, JSON.stringify(got) === JSON.stringify(run.want) && r.losses.length === run.want.length && r.canvases === 1,
    `lost at ${r.losses.map((l) => `${l.step} (${l.how} on ${l.backend})`).join(', ')}; made again on ${got.join(', ')} in ${r.recoveries.map((x) => `${x.ms.toFixed(0)} ms`).join(', ')}; ${r.canvases} canvas`);
  const shown = r.display.filter((d) => d.text);
  say(`${run.name}: the status line said so while it recovered, and went once a new frame was drawn`, shown.length >= 1 && shown.every((d) => /The display stopped\. Restarting it/.test(d.text)) && !r.display.at(-1)?.text,
    r.display.map((d) => `${d.step}: "${d.text}"`).join(' → '));
  say(`${run.name}: it draws again after each recovery`, stills.length === run.want.length && stills.every((s) => s.drawn > 0), stills.map((s) => `${s.file} at step ${s.step}: ${s.drawn} draws in half a second`).join('; '));
}

const version = browser.version();
await browser.close(); server.close(); release();
say('no errors in the pages beyond the lost devices\' own', errors.length === 0, errors.slice(0, 5).join(' | '));
fs.rmSync(tmp, { recursive: true, force: true });
const ok = checks.every((c) => c.ok);
fs.writeFileSync(path.join(RESULTS, 'm6-device-loss.json'), `${JSON.stringify({
  check: 'M6 W6: the game app survives a lost GPU device: a session of The Morning Rush replayed in Chromium while device.destroy(), a failing createCommandEncoder and a lost WebGL context hit it gives the unbroken session\'s hash after every step (AB-T-0639)',
  ok, node: process.version, chromium: version, build: { game: exported.manifest.game?.id ?? null, digest: exported.manifest.digest, runtime: `${exported.manifest.runtime?.name} ${exported.manifest.runtime?.version}` },
  session: { steps: log.hashes.length, scenes, final: log.hashes.at(-1) }, runs, checks,
}, null, 1)}\n`);
console.log(ok ? 'all checks pass' : 'some checks failed');
process.exit(ok ? 0 : 1);
