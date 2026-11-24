// The game UI demo (game-ui.html, M5 W3) in headless Chromium, as a player would use it: the conversation answered from
// the keyboard (an arrow, then Enter), the settings opened and driven from a gamepad (Menu, the d-pad, A: an emulated
// standard pad), an action rebound and the page reloaded (a relaunch: the binding is still there), and every control's
// accessible name read. Builds only the demo page (into build/game-ui), so it needs no vrmxa-avatar-studio. Exit 1 on a
// failed check or a console error. It draws, so it takes the GPU lock.
//   node apps/playground/scripts/game-ui-check.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'vite';
import { acquireGpuLock, sayWaiting } from '../../../acceptance/gpu-lock.mjs';

const here = import.meta.dirname, root = path.join(here, '..'), out = path.join(root, 'build/game-ui');
await build({ configFile: path.join(root, 'vite.config.js'), logLevel: 'warn', build: { outDir: out, emptyOutDir: true, rolldownOptions: { input: { 'game-ui': path.join(root, 'game-ui.html') } } } });

const require = createRequire(path.join(here, '../../../spike-determinism/web/package.json'));
let playwright;
try { playwright = require('playwright-core'); } catch { playwright = createRequire(path.join(here, '../../../../../../spike-determinism/web/package.json'))('playwright-core'); }
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const file = path.join(out, decodeURIComponent(p === '/' ? '/game-ui.html' : p));
  if (!file.startsWith(out) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/game-ui.html`;

await acquireGpuLock({ who: 'apps/playground/scripts/game-ui-check.mjs', onWait: sayWaiting('apps/playground/scripts/game-ui-check.mjs') });
const browser = await playwright.chromium.launch({ executablePath: exe, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
// an emulated standard gamepad, its buttons set by the check (the page reads it through @vrmxg/input's GamepadDevice)
await context.addInitScript(() => {
  const pad = { id: 'check pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })) };
  window.__pad = (i, v) => { pad.buttons[i] = { value: v, pressed: v > 0.5 }; };
  navigator.getGamepads = () => [pad];
});
const page = await context.newPage();
const consoleLines = [];
page.on('console', (m) => { if (m.type() === 'error') consoleLines.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });
const label = (sel) => page.getAttribute(sel, 'aria-label').catch(() => null);
const focused = () => page.evaluate(() => document.activeElement?.id ?? '');
const press = async (i) => { await page.evaluate((b) => window.__pad(b, 1), i); await page.waitForTimeout(80); await page.evaluate((b) => window.__pad(b, 0), i); await page.waitForTimeout(80); };
// every control a person can reach has a name a screen reader says
const unnamed = () => page.evaluate(() => [...document.querySelectorAll('button, input, select')].filter((e) => !(e.getAttribute('aria-label') || e.labels?.length || e.textContent.trim())).map((e) => e.outerHTML.slice(0, 80)));

await page.goto(url);
await page.waitForSelector('#hud-goal', { timeout: 60000 });
check('the HUD shows the goal, the score and the clock', (await label('#hud-goal')) === 'Goal: Take Hana\'s order' && /^Score 0$/.test(await label('#hud-score')) && /^Until closing 0:(20|19|18)/.test(await label('#hud-timer-clock')), [await label('#hud-goal'), await label('#hud-score'), await label('#hud-timer-clock')].join(' | '));
await page.waitForSelector('#dialogue-choices', { timeout: 30000 });
await page.waitForTimeout(150);
check('the conversation asks, and focus is on the first choice', (await focused()) === 'dialogue-choice-latte', await focused());
const shot1 = path.join(out, 'game-ui-check-dialogue.png');
await page.screenshot({ path: shot1 });
// focus leaves the overlay (a click on the canvas): the keys still answer, while the overlay holds the devices
await page.focus('canvas');
await page.keyboard.press('ArrowDown');
check('with focus on the canvas, an arrow key comes back to the choices', (await focused()) === 'dialogue-choice-latte', await focused());
// the keyboard: down to the second choice, Enter answers
await page.keyboard.press('ArrowDown');
check('an arrow key moves to the next choice', (await focused()) === 'dialogue-choice-tea', await focused());
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const flags = await page.evaluate(() => window.__demo.flow.view().flags);
check('Enter answers: the choice reached the game through a recorded input', flags.order === 'tea', JSON.stringify(flags));
await page.waitForFunction(() => document.querySelector('#hud-goal')?.getAttribute('aria-label') === 'Goal: Bring the order to the table', null, { timeout: 10000 }).catch(() => {});
check('the HUD follows the game: the next goal', (await label('#hud-goal')) === 'Goal: Bring the order to the table', await label('#hud-goal'));
check('the overlay\'s controls all have accessible names', (await unnamed()).length === 0, JSON.stringify(await unnamed()));

// the gamepad: Menu opens the settings, the d-pad moves, A presses
await press(9);
await page.waitForSelector('[aria-label="Settings"]', { timeout: 5000 });
await page.waitForTimeout(100);
check('the gamepad\'s Menu opens the settings, focus on the first control', (await focused()) === 'volume-master', await focused());
await press(13);
check('the d-pad moves to the next control', (await focused()) === 'mute-master', await focused());
await press(0);
const muted = await page.evaluate(() => window.__demo.settings.data.volumes.master.muted);
check('A presses it: master muted, saved', muted === true && (await page.getAttribute('#mute-master', 'aria-pressed')) === 'true');
await press(12); await press(14); await press(14);
const vol = await page.evaluate(() => window.__demo.settings.data.volumes.master.volume);
check('left on a slider turns it down (two steps of 5%)', Math.abs(vol - 0.9) < 1e-9 && (await page.getAttribute('#volume-master', 'aria-valuetext')) === '90 percent, muted', `master ${vol}`);
check('the settings controls all have accessible names', (await unnamed()).length === 0, JSON.stringify(await unnamed()));
// rebinding from the keyboard: Jump → J
await page.click('#rebind-jump-keyboard');
check('a slot waits for a key, and says so', /^Press a key for Jump/.test(await label('#rebind-jump-keyboard')), await label('#rebind-jump-keyboard'));
await page.keyboard.press('KeyJ');
await page.waitForTimeout(100);
const after = await page.evaluate(() => ({ overrides: window.__demo.input.overrides(), stored: JSON.parse(localStorage.getItem('vrmxg-game-ui-demo-settings')) }));
check('the rebinding is on the game\'s input and in the app\'s store', JSON.stringify(after.overrides.jump) === JSON.stringify([{ key: 'KeyJ' }, { gamepadButton: 0 }]) && JSON.stringify(after.stored.bindings.jump) === JSON.stringify([{ key: 'KeyJ' }, { gamepadButton: 0 }]), JSON.stringify(after.overrides));
// a gamepad capture inside the menu: B is taken as the new button, and doesn't also close the menu (review)
await page.click('#rebind-run-gamepad'); await page.click('#rebind-run-gamepad'); // twice: one capture, not two
await press(1);
await page.waitForTimeout(100);
const run = await page.evaluate(() => window.__demo.input.bindings().run.bindings);
check('a gamepad capture takes B, and the menu stays open', !!(await page.$('[aria-label="Settings"]')) && JSON.stringify(run) === JSON.stringify([{ key: 'ShiftLeft' }, { key: 'ShiftRight' }, { gamepadButton: 1 }]), JSON.stringify(run));
await press(0); await page.waitForTimeout(50);
check('no capture is left waiting after it', (await label('#rebind-run-gamepad')) === 'Run, gamepad: Gamepad B. Change', await label('#rebind-run-gamepad'));
const shot2 = path.join(out, 'game-ui-check-settings.png');
await page.screenshot({ path: shot2 });
await press(1);
await page.waitForTimeout(100);
check('B closes the settings', !(await page.$('[aria-label="Settings"]')));
// the next step uses it: J pressed is a jump on the game's input (once Hana is done: the overlay holds the keys while she talks)
await page.waitForSelector('#dialogue', { state: 'detached', timeout: 15000 });
check('the conversation over, the overlay lets go of the keys', await page.evaluate(() => window.__demo.input.muted === false));
await page.keyboard.down('KeyJ'); await page.waitForTimeout(100);
const jumping = await page.evaluate(() => window.__demo.input.isDown('jump'));
await page.keyboard.up('KeyJ');
check('the next steps use the rebinding (J is down as Jump)', jumping === true);

// a relaunch: the page again, the same browser storage
await page.reload();
await page.waitForSelector('#hud-goal', { timeout: 60000 });
await page.waitForTimeout(200);
const relaunched = await page.evaluate(() => ({ overrides: window.__demo.input.overrides(), muted: window.__demo.settings.data.volumes.master.muted }));
check('after a relaunch the rebinding and the volume are still there', JSON.stringify(relaunched.overrides.jump) === JSON.stringify([{ key: 'KeyJ' }, { gamepadButton: 0 }]) && relaunched.muted === true, JSON.stringify(relaunched));
await page.evaluate(() => localStorage.clear());

const result = { version: browser.version(), url: 'game-ui.html', checks, console: consoleLines, screenshots: [path.relative(root, shot1), path.relative(root, shot2)] };
await browser.close(); server.close();
console.log(JSON.stringify(result, null, 1));
process.exit(checks.every((c) => c.ok) && !consoleLines.length ? 0 : 1);
