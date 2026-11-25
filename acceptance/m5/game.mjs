// M5 W1 (AB-T-0616), M5's exit checks 2, 4 (menus) and 6 (slots) in a browser: the game app plays a build.
//
//   node acceptance/m5/game.mjs            (needs vrmxa-avatar-studio beside the repository, and the determinism spike's
//                                           playwright-core and Chrome for Testing, as the other Chromium runners)
//   … --rebuild                            build apps/game first even when apps/game/dist is there
//
// The test game (apps/game/test/fixtures/game: the sample cafe with a title, a level and an ending) is exported with the
// game app as its runtime, served on loopback, and played in headless Chromium through the app's own menus:
//   1  the title menu, then New Game; the title scene is skipped with Space (a recorded input) and the level plays
//      with W held (Mira walks in: the door's checkpoint, the counter's goal);
//   2  Escape pauses; Save Game → Slot 1 saves (the slot list says so); Back, Resume; play on;
//   3  Load Game → Slot 1 over unsaved play asks first, then loads the save: play goes on from its step;
//   4  Quit to Title asks first; the session's log (its segments, the input recorded in each, and the hash of the world
//      after every step, made in the page) is read back;
//   5  that log replayed in Node gives the same hash after every step;
//   6  a fresh launch (the page loaded again): Continue is offered, and Load Game → Slot 1 loads the save from step 2;
//   7  every menu from a gamepad alone (a stand-in pad: d-pad, A, B, Start), and the slot and settings menus from the
//      keyboard alone (arrows, Enter, Escape);
//   8  the renderer readout: WebGL when forced (renderer=webgl), and what an unforced page gets here.
// Writes acceptance/results/m5-game.json; exit 1 when a check fails. It draws, so it takes the GPU lock.
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
import { vrmxaCore, PATHS } from '../../engine/packages/character/test/fixtures.mjs';
import { exportTestGame, GAME_RUNTIME } from '../../apps/game/scripts/test-game.mjs';
import { gameScenes, worldLoader, freeWorld } from '../../apps/game/src/world.js';
import { replaySession, firstDifference } from '../../apps/game/src/session.js';

const here = import.meta.dirname, root = path.join(here, '../..');
const args = process.argv.slice(2);
const checks = [], say = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
if (!fs.existsSync(PATHS.core)) { console.error('needs vrmxa-avatar-studio beside the repository (vrmxa-core): the test game has characters'); process.exit(1); }

if (args.includes('--rebuild') || !fs.existsSync(path.join(GAME_RUNTIME, 'vrmxg-runtime.json'))) execFileSync('npx', ['vite', 'build'], { cwd: path.join(root, 'apps/game'), stdio: ['ignore', 'ignore', 'inherit'] });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-m5-game-'));
const dir = path.join(tmp, 'build');
const exported = await exportTestGame(dir);
say('the test game exports with the game app as its runtime', checkFolder(dir).ok, `${exported.files} files, digest ${exported.digest.slice(0, 16)}`);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(dir, url === '/' ? '/index.html' : url);
  if (!f.startsWith(dir + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
const base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}/index.html`;

let pw;
try { pw = createRequire(path.join(root, 'spike-determinism/web/package.json'))('playwright-core'); } catch { pw = createRequire(path.join(here, '../../../../../spike-determinism/web/package.json'))('playwright-core'); }
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const release = await acquireGpuLock({ who: 'acceptance/m5/game.mjs', onWait: sayWaiting('acceptance/m5/game.mjs') });
const browser = await pw.chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
// a stand-in gamepad: the page's navigator.getGamepads() gives it, and the runner sets its buttons (window.__pad)
await context.addInitScript(() => {
  const w = /** @type {any} */ (window);
  w.__pad = { axes: [0, 0, 0, 0], buttons: new Array(17).fill(0), connected: false };
  const real = navigator.getGamepads?.bind(navigator);
  navigator.getGamepads = () => (w.__pad.connected ? [{ id: 'stand-in', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: w.__pad.axes.slice(), buttons: w.__pad.buttons.map((v) => ({ value: v, pressed: v > 0.5, touched: v > 0 })) }] : (real?.() ?? []));
});

const errors = [];
const state = (page) => page.evaluate(() => /** @type {any} */ (window).__game?.state() ?? null);
const until = (page, fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });
const screen = (page, want) => until(page, (w) => { const s = /** @type {any} */ (window).__game?.state(); return s?.ready && (s.stack.at(-1) ?? null) === w && !s.loading; }, want);
const focused = (page) => page.evaluate(() => document.activeElement?.id ?? null);
// where the segment being played started: the step a load went back to (play resumes at once, so the clock has moved on)
const loadedAt = (page) => page.evaluate(() => /** @type {any} */ (window).__game.host().session.current?.at ?? null);
const steps = async (page, n) => { const s0 = (await state(page)).step; await until(page, (t) => /** @type {any} */ (window).__game.state().step >= t, s0 + n); };
const pad = async (page, buttons = [], ms = 120) => {
  await page.evaluate((b) => { const p = /** @type {any} */ (window).__pad; p.connected = true; p.buttons = new Array(17).fill(0); for (const i of b) p.buttons[i] = 1; }, buttons);
  await page.waitForTimeout(ms);
  await page.evaluate(() => { /** @type {any} */ (window).__pad.buttons = new Array(17).fill(0); });
  await page.waitForTimeout(ms);
};
const PAD = { A: 0, B: 1, START: 9, UP: 12, DOWN: 13 };
const watch = (page) => { page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); };

// ---------------------------------------------------------------- 1 to 4: one session through the menus, WebGL forced
const page = await context.newPage();
watch(page);
await page.goto(`${base}?renderer=webgl&trace`);
await screen(page, 'title');
let s = await state(page);
say('the title menu, on WebGL when forced', s.backend === 'webgl' && (await page.getAttribute('#renderer', 'aria-label')) === 'Renderer WebGL' && (await focused(page)) === 'new-game', `readout "${await page.getAttribute('#renderer', 'aria-label')}", focus on #${await focused(page)}`);
await page.keyboard.press('Enter'); // New Game
await screen(page, null);
await steps(page, 30);
await page.keyboard.down('Space'); await steps(page, 4); await page.keyboard.up('Space'); // the title scene's skip: a recorded input
await until(page, () => /** @type {any} */ (window).__game.state().scene === 'game/level.vrmxs', null);
// the HUD (@vrmxg/game-ui, mounted at the app's seam) from the level's rules, and Hana's question: the overlay holds the
// devices while she talks, focus goes to the first choice when she asks, and Enter answers (a recorded choice)
await page.waitForSelector('#hud-goal', { timeout: 30000 });
const hud = await page.evaluate(() => ({ goal: document.querySelector('#hud-goal')?.textContent?.trim(), score: document.querySelector('#hud-score')?.textContent?.trim(), timer: document.querySelector('#hud-timer-clock')?.textContent?.trim() }));
say('the HUD shows the level\'s goal, score and clock', hud.goal === 'Goal: Get to the counter' && /^Score 0/.test(hud.score ?? '') && /^Until the cafe opens /.test(hud.timer ?? ''), JSON.stringify(hud));
await page.waitForSelector('#dialogue-choice-ready', { timeout: 30000 });
await until(page, () => document.activeElement?.id === 'dialogue-choice-ready', null, 10000);
await page.keyboard.press('Enter');
await until(page, () => /** @type {any} */ (window).__game.host().session.view()?.flags?.ready === true, null, 10000);
const answered = await page.evaluate(() => ({ line: document.querySelector('#dialogue-line')?.textContent?.trim() ?? null, chosen: /** @type {any} */ (window).__game.log().segments[0].recording.frames.filter((f) => f[2]).map((f) => f[2]) }));
say('Hana asks, Enter on the first choice answers it, and the choice is a recorded input', answered.chosen.some((c) => c['dialogue.choose'] === 'ready') && answered.line === 'Hana: Then get to the counter, quick!', `"${answered.line}"; choices in the recording ${JSON.stringify(answered.chosen)}`);
await page.waitForSelector('#dialogue', { state: 'detached', timeout: 15000 }); // her answer said: the devices are the game's again
await page.keyboard.down('KeyW'); await steps(page, 200); // Mira walks in through the door
await page.keyboard.press('Escape');
await screen(page, 'pause');
s = await state(page);
const pausedAt = s.step;
await page.waitForTimeout(400);
say('Escape pauses: nothing steps while the menu is open', (await state(page)).step === pausedAt && s.scene === 'game/level.vrmxs', `paused at step ${pausedAt} in ${s.scene}`);
await page.keyboard.up('KeyW');
await page.click('#save-game'); await screen(page, 'save');
await page.click('#slot-1');
await until(page, () => /** @type {any} */ (window).__game.state().message.startsWith('Saved to Slot 1'), null);
const slotName = await page.getAttribute('#slot-1', 'aria-label');
s = await state(page);
say('Save Game → Slot 1 saves, and the slot says what it holds', !s.dirty && /^Slot 1: The Cafe \(test game\) · level/.test(slotName), `"${slotName}"`);
await page.click('#save-back'); await screen(page, 'pause');
await page.click('#resume'); await screen(page, null);
await page.keyboard.down('KeyW'); await steps(page, 150); await page.keyboard.up('KeyW'); await steps(page, 30);
s = await state(page);
const progressed = s.step, goalBefore = await page.evaluate(() => /** @type {any} */ (window).__game.host().session.view()?.goals);
await page.keyboard.press('Escape'); await screen(page, 'pause');
await page.click('#load-game'); await screen(page, 'load');
await page.click('#slot-1');
await until(page, () => !!(/** @type {any} */ (window).__game.state().question), null);
const loadQuestion = (await state(page)).question;
// Tab can't leave the question: everything behind it is inert
const tabbed = [];
for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); tabbed.push(await focused(page)); }
say('Tab stays in a question: nothing behind the sheet can be reached', tabbed.every((id) => /^answer-/.test(id ?? '')), `Tab ×6 → ${tabbed.map((id) => `#${id}`).join(', ')}`);
await page.click('#answer-discard');
await screen(page, null);
const backAt = await loadedAt(page);
say('Load Game over unsaved play asks first, then goes back to the save', loadQuestion?.title === 'Load over this game?' && backAt === pausedAt, `asked "${loadQuestion?.title}"; was at ${progressed}, back at ${backAt} (saved at ${pausedAt})`);
await page.keyboard.down('KeyW'); await steps(page, 120); await page.keyboard.up('KeyW'); await steps(page, 20);
await page.keyboard.press('Escape'); await screen(page, 'pause');
await page.click('#quit-to-title');
await until(page, () => !!(/** @type {any} */ (window).__game.state().question), null);
const quitQuestion = (await state(page)).question;
await page.click('#answer-discard');
await screen(page, 'title');
const log = await page.evaluate(() => /** @type {any} */ (window).__game.lastLog);
const scenesSeen = [...new Set(log.hashes.map((h) => h.scene))];
say('Quit to Title asks first, and the session\'s log has both segments', quitQuestion?.title === 'Quit to Title without saving?' && log.segments.length === 2 && log.segments[1].from.slot === 'slot-1', `asked "${quitQuestion?.title}"; ${log.segments.length} segments, ${log.hashes.length} steps hashed in the page, scenes ${scenesSeen.join(', ')}; goals before the load ${JSON.stringify(goalBefore)}`);

// ---------------------------------------------------------------- 5: the log replayed in Node
installPortableMath();
const build = await openFolder(dir);
const core = await vrmxaCore(), closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
const scenes = gameScenes(build.bytes, build.game);
const docs = await scenes.documents();
const load = worldLoader({ R: await loadRapier(), scenes, behaviours: await build.behaviours(behavioursImporter(dir)), actions: await build.actions(), vrmxaCore: core, closet, options: () => ({ stubTextures: true }) });
const replay = await replaySession(log, { digest: build.manifest.digest, load, unload: freeWorld, scenes: docs.scenes, prefabs: docs.prefabs });
const diff = firstDifference(replay, log.hashes);
say('the session played in Chromium replays in Node to the same hash after every step', diff < 0 && replay.length === log.hashes.length && replay.length > 0, diff < 0 ? `${replay.length} steps, last ${replay.at(-1)?.hash} at step ${replay.at(-1)?.step}` : `first difference at index ${diff}: page ${JSON.stringify(log.hashes[diff])}, Node ${JSON.stringify(replay[diff])}`);

// ---------------------------------------------------------------- 6: a fresh launch loads the save
// and a save an earlier export of the game made (another build's digest; the same saves database) sits newest in slot 6
await page.evaluate(() => new Promise((ok, fail) => {
  const r = indexedDB.open('vrmxg-game-cafe-test', 1);
  r.onsuccess = () => {
    const t = r.result.transaction('saves', 'readwrite'), s = t.objectStore('saves'), g = s.get('slot-1');
    g.onsuccess = () => { const doc = JSON.parse(g.result); doc.extra = { ...doc.extra, build: { digest: 'an-earlier-export', game: 'cafe-test' } }; doc.savedAt = '2099-01-01T00:00:00.000Z'; s.put(JSON.stringify(doc), 'slot-6'); };
    t.oncomplete = () => ok(null); t.onerror = () => fail(t.error);
  };
  r.onerror = () => fail(r.error);
}));
await page.reload();
await screen(page, 'title');
const continueLabel = await page.getAttribute('#continue', 'aria-label').catch(() => null);
await page.click('#load-game'); await screen(page, 'load');
const otherLabel = await page.getAttribute('#slot-6', 'aria-label'), otherDisabled = await page.isDisabled('#slot-6');
await page.keyboard.press('Escape'); await screen(page, 'title');
say('a save an earlier export made is shown as such and can\'t be picked; Continue offers this build\'s', /^Slot 6: made with another version of the game, can't be loaded/.test(otherLabel ?? '') && otherDisabled && /^Continue: Slot 1: /.test(continueLabel ?? ''), `slot 6 "${otherLabel}" (disabled: ${otherDisabled}); Continue "${continueLabel}"`);
await page.click('#load-game'); await screen(page, 'load');
await page.click('#slot-1'); await screen(page, null);
s = await state(page);
const freshAt = await loadedAt(page);
say('a fresh launch offers Continue, and Load Game → Slot 1 loads the save', !!continueLabel && freshAt === pausedAt && s.scene === 'game/level.vrmxs', `Continue "${continueLabel}"; loaded at step ${freshAt} (saved at ${pausedAt})`);

// ---------------------------------------------------------------- 7: every menu from a gamepad, and from the keyboard
const nav = [];
await pad(page, [PAD.START]); await screen(page, 'pause'); nav.push(`Start → ${(await state(page)).stack.at(-1)} (focus #${await focused(page)})`);
await pad(page, [PAD.DOWN]); nav.push(`down → #${await focused(page)}`);
await pad(page, [PAD.A]); await screen(page, 'save'); nav.push(`A → save menu (focus #${await focused(page)})`);
await pad(page, [PAD.B]); await screen(page, 'pause'); nav.push('B → pause');
await pad(page, [PAD.DOWN]); await pad(page, [PAD.DOWN]); await pad(page, [PAD.DOWN]); nav.push(`down ×3 → #${await focused(page)}`);
const onSettings = (await focused(page)) === 'settings';
await pad(page, [PAD.A]); await screen(page, 'settings'); nav.push(`A → settings (focus #${await focused(page)})`);
await pad(page, [PAD.B]); await screen(page, 'pause');
await pad(page, [PAD.START]); await screen(page, null); nav.push('Start → playing');
const padSteps = (await state(page)).step; await steps(page, 10);
say('every menu from a gamepad: Start pauses and resumes, the d-pad moves, A chooses, B goes back', onSettings && (await state(page)).step > padSteps, nav.join('; '));
const keys = [];
await page.keyboard.press('Escape'); await screen(page, 'pause');
await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); keys.push(`↓↓ → #${await focused(page)}`);
await page.keyboard.press('Enter'); await screen(page, 'load'); keys.push(`Enter → load menu (focus #${await focused(page)})`);
await page.keyboard.press('Escape'); await screen(page, 'pause');
await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); keys.push(`↑↑ → #${await focused(page)}`);
const onSettingsByKeys = (await focused(page)) === 'settings';
await page.keyboard.press('Enter'); await screen(page, 'settings');
await page.keyboard.press('ArrowDown'); keys.push(`settings ↓ → #${await focused(page)}`);
await page.keyboard.press('Escape'); await screen(page, 'pause');
await page.keyboard.press('Escape'); await screen(page, null); keys.push('Escape → playing');
say('every menu from the keyboard: arrows move, Enter chooses, Escape goes back and resumes', onSettingsByKeys, keys.join('; '));
// the settings menu: a backend chosen there is kept for the next launch (the query still wins over it)
await page.keyboard.press('Escape'); await screen(page, 'pause');
await page.click('#settings'); await screen(page, 'settings');
await page.click('#backend-webgl');
await until(page, () => /** @type {any} */ (window).__game.state().settingsNote === 'Settings saved.', null);
// and a key rebound there (@vrmxg/game-ui's RebindList, in the app's settings menu): Jump to J
await page.focus('#rebind-jump-keyboard'); await page.keyboard.press('Enter'); await page.keyboard.press('KeyJ');
await until(page, () => JSON.parse(localStorage.getItem('vrmxg.game.cafe-test.settings') ?? '{}')?.ui?.bindings?.jump?.[0]?.key === 'KeyJ', null, 10000);
const stored = await page.evaluate(() => localStorage.getItem('vrmxg.game.cafe-test.settings'));
say('a backend chosen in Settings and a key rebound there are kept, in one settings document', JSON.parse(stored ?? '{}').backend === 'webgl' && JSON.parse(stored ?? '{}').ui?.bindings?.jump?.[0]?.key === 'KeyJ', `stored ${stored?.replace(/\s+/g, ' ').slice(0, 220)}`);
// the gamepad's A that opens Settings doesn't also press the control Settings focuses (useNav's first frame): the stored
// WebGL stays WebGL
await page.keyboard.press('Escape'); await screen(page, 'pause');
await page.waitForTimeout(200); // the pause menu focuses Resume as it comes back: then move focus to Settings
await page.focus('#settings');
await until(page, () => document.activeElement?.id === 'settings', null, 5000);
await pad(page, [PAD.A]); await screen(page, 'settings');
await page.waitForTimeout(400);
const afterA = await page.evaluate(() => JSON.parse(localStorage.getItem('vrmxg.game.cafe-test.settings') ?? '{}').backend);
say('the A that opens Settings doesn\'t press the control it focuses', afterA === 'webgl', `stored backend after A: ${afterA} (focus #${await focused(page)})`);
await page.close();

// ---------------------------------------------------------------- 8: the backend readout with no query, and after the setting
const plain = await context.newPage();
watch(plain);
await plain.goto(base);
await screen(plain, 'title');
const plainReadout = await plain.getAttribute('#renderer', 'aria-label');
const relaunchJump = await plain.evaluate(() => /** @type {any} */ (window).__game.host().input().bindings().jump.bindings.map((x) => x.key ?? `pad ${x.gamepadButton}`));
say('a fresh launch has the rebound key on the menus\' input before any game starts', relaunchJump[0] === 'KeyJ', `Jump: ${relaunchJump.join(', ')}`);
await plain.evaluate(() => localStorage.removeItem('vrmxg.game.cafe-test.settings'));
await plain.reload(); await screen(plain, 'title');
const autoReadout = await plain.getAttribute('#renderer', 'aria-label');
const hasWebGPU = await plain.evaluate(async () => !!(navigator.gpu && await navigator.gpu.requestAdapter()));
say('with no query the page draws on WebGPU where it has it, else WebGL; the stored setting is obeyed', plainReadout === 'Renderer WebGL' && autoReadout === (hasWebGPU ? 'Renderer WebGPU' : 'Renderer WebGL'), `with the setting webgl: "${plainReadout}"; with no setting: "${autoReadout}" (this Chromium has WebGPU: ${hasWebGPU})`);
await plain.close();

const version = browser.version();
await browser.close(); server.close(); release();
say('no errors in the page', errors.length === 0, errors.slice(0, 5).join(' | '));
fs.rmSync(tmp, { recursive: true, force: true });
const ok = checks.every((c) => c.ok);
fs.writeFileSync(path.join(here, '../results/m5-game.json'), `${JSON.stringify({
  check: 'M5 W1: the game app plays a build from the title menu; menus from the keyboard and a gamepad; a save loads in a fresh launch; a session replays in Node (AB-T-0616)',
  ok, node: process.version, chromium: version, build: { game: exported.game, files: exported.files, digest: exported.digest, manifest: exported.manifest },
  session: { segments: log.segments.map((g) => ({ from: g.from.start ?? g.from.slot, at: g.at, steps: g.steps, marks: g.marks })), steps: log.hashes.length, scenes: scenesSeen, last: log.hashes.at(-1) },
  replay: { steps: replay.length, firstDifference: diff < 0 ? null : diff }, checks,
}, null, 1)}\n`);
console.log(`${ok ? 'passed' : 'FAILED'}: ${checks.filter((c) => c.ok).length} of ${checks.length}`);
process.exit(ok ? 0 : 1);
