// M6 W3 (AB-T-0646): builds of New Project's templates played by the game app (apps/game) in headless Chromium, through
// its own title menu: New Game, then the stick held forward. The level template is won (Mira walks to the counter: the
// HUD's goal, then the outcome) and its ending follows; the empty game starts and runs. Each build is also checked
// whole against its manifest first (checkFolder), and played in Node (templates-node.mjs).
//
//   node acceptance/m6/templates-game.mjs                    each template made into a project and exported with the game app
//   node acceptance/m6/templates-game.mjs <build> …          builds the Mac editor's Export Game wrote (the scenario's)
//
// Needs vrmxa-core beside the repository (the level has characters) and the determinism spike's playwright-core
// and Chrome for Testing, as the other Chromium runners. It draws, so it takes the GPU lock. Writes
// acceptance/results/m6-templates-game.json; exit 1 when a check fails.
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { exportToFolder, checkFolder, openFolder, behavioursImporter } from '@vrmxg/bundle/node';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';
import { PATHS } from '../../engine/packages/character/test/fixtures.mjs';
import { assertFreshRuntime, GAME_RUNTIME } from '../../apps/game/scripts/test-game.mjs';
import { makeProject } from '../../content/templates/tools/new-project.mjs';
import { playTemplate } from './templates-node.mjs';

const here = import.meta.dirname, root = path.join(here, '../..');
const checks = [], say = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
if (!fs.existsSync(PATHS.core)) { console.error('needs vrmxa-core beside the repository: the level has characters'); process.exit(1); }

let builds = process.argv.slice(2).filter((a) => !a.startsWith('--')).map((d) => path.resolve(d));
if (!builds.length) {
  assertFreshRuntime(GAME_RUNTIME);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-m6-templates-'));
  for (const id of ['empty', 'level']) {
    makeProject(id, path.join(tmp, id), { title: `Template ${id}` });
    await exportToFolder({ project: path.join(tmp, id), runtime: GAME_RUNTIME, out: path.join(tmp, `build-${id}`) });
    builds.push(path.join(tmp, `build-${id}`));
  }
}

let pw;
try { pw = createRequire(path.join(root, 'spike-determinism/web/package.json'))('playwright-core'); } catch { pw = createRequire(path.join(here, '../../../../../spike-determinism/web/package.json'))('playwright-core'); }
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const release = await acquireGpuLock({ who: 'acceptance/m6/templates-game.mjs', onWait: sayWaiting('acceptance/m6/templates-game.mjs') });
const results = [];
try {
  const browser = await pw.chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu'] });
  for (const dir of builds) {
    const whole = checkFolder(dir), build = await openFolder(dir), game = build.game, level = game.scenes.length > 1;
    say(`${path.basename(dir)}: the build is whole, every file as its manifest says (${game.id})`, whole.ok, `${whole.state}, ${build.manifest.files.length} files, digest ${build.manifest.digest.slice(0, 16)}`);
    // Node first: the same game, no renderer
    const node = await playTemplate({ game, bytes: build.bytes, behaviours: await build.behaviours(behavioursImporter(dir)), actions: await build.actions() }, { maxSteps: level ? 60 * 40 : 300 });
    say(`${path.basename(dir)}: played in Node`, level ? node.decided?.result === 'won' && !!node.ending : !node.decided && node.final.step >= 299, JSON.stringify(node));
    // the game app in Chromium, through its menus
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const f = path.join(dir, url === '/' ? '/index.html' : url);
      if (!f.startsWith(dir + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); res.end(fs.readFileSync(f));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const until = (fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });
    const state = () => page.evaluate(() => /** @type {any} */ (window).__game?.state() ?? null);
    try {
      await page.goto(`http://127.0.0.1:${/** @type {any} */ (server.address()).port}/index.html`);
      await until(() => { const s = /** @type {any} */ (window).__game?.state(); return s?.ready && s.stack.at(-1) === 'title' && !s.loading; }, null);
      const title = await page.evaluate(() => document.title);
      await page.keyboard.press('Enter'); // New Game, the title menu's first item
      await until(() => { const s = /** @type {any} */ (window).__game?.state(); return s?.stack.length === 0 && !s.loading && s.step > 0; }, null);
      let s = await state();
      say(`${path.basename(dir)}: the game app opens on its title menu and New Game starts the entry scene`, s.scene === game.entry, `"${title}", scene ${s.scene}, ${s.backend}`);
      if (level) {
        await page.waitForSelector('#hud-goal', { timeout: 30000 });
        const goal = (await page.textContent('#hud-goal'))?.trim();
        await page.keyboard.down('KeyW');
        await until(() => /** @type {any} */ (window).__game.host().session.view()?.outcome === 'won', null, 60000);
        const won = await page.evaluate(() => { const v = /** @type {any} */ (window).__game.host().session.view(); return { step: v.step, score: v.score }; });
        await page.keyboard.up('KeyW');
        await until((e) => /** @type {any} */ (window).__game.state().scene !== e, game.entry, 30000);
        s = await state();
        say(`${path.basename(dir)}: the level's goal on the HUD, won by walking to the counter, and its ending follows`, goal === 'Goal: Get to the counter' && won.score === 10 && s.scene !== game.entry, `HUD "${goal}", won at step ${won.step} (score ${won.score}), then ${s.scene} at step ${s.step}`);
        results.push({ build: path.basename(dir), game: game.id, digest: build.manifest.digest, won, ending: s.scene, node });
      } else {
        const s0 = s.step;
        await until((t) => /** @type {any} */ (window).__game.state().step >= t, s0 + 120);
        s = await state();
        say(`${path.basename(dir)}: the empty game runs`, s.scene === game.entry && !s.loading, `${s.scene} at step ${s.step}`);
        results.push({ build: path.basename(dir), game: game.id, digest: build.manifest.digest, step: s.step, node });
      }
      say(`${path.basename(dir)}: no errors in the page`, errors.length === 0, errors.slice(0, 3).join(' | '));
    } catch (e) {
      say(`${path.basename(dir)}: played in the game app`, false, `${e.message} ${errors.slice(0, 3).join(' | ')}`);
    } finally { await page.close(); server.close(); }
  }
  await browser.close();
} finally { release(); }
fs.mkdirSync(path.join(root, 'acceptance/results'), { recursive: true });
fs.writeFileSync(path.join(root, 'acceptance/results/m6-templates-game.json'), `${JSON.stringify({ checks, results }, null, 1)}\n`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
