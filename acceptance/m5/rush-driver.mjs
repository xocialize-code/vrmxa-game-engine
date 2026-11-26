// The Morning Rush played in a browser page by the scripted player (rush-player.js), shared by M5's acceptance
// (rush.mjs) and M6 W7's static hosts (acceptance/m6/sharing.mjs): the init script that stands in a gamepad and gives the
// player hands, and one session from the title menu to its ending.
import fs from 'node:fs';
import path from 'node:path';
import { RUSH_PLANS } from './rush-node.mjs';

// the stand-in gamepad (as acceptance/m5/game.mjs) and the scripted player, as a plain script
const playerSource = fs.readFileSync(path.join(import.meta.dirname, 'rush-player.js'), 'utf8').replace(/^export /gm, '');
/** The page's init script: the stand-in gamepad and the scripted player's hands (window.__rushPlay(plan)). */
export const RUSH_INIT = `(() => {
  const w = window;
  w.__pad = { axes: [0, 0, 0, 0], buttons: new Array(17).fill(0), connected: false };
  const real = navigator.getGamepads?.bind(navigator);
  navigator.getGamepads = () => (w.__pad.connected ? [{ id: 'stand-in', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: w.__pad.axes.slice(), buttons: w.__pad.buttons.map((v) => ({ value: v, pressed: v > 0.5, touched: v > 0 })) }] : (real?.() ?? []));
  ${playerSource}
  // the scripted player's hands: each animation frame, its decision becomes the pad's state; X is held four frames (a
  // press the input service can't miss on a frame with no step); a choice clicks the overlay's button once it is drawn
  w.__rushPlay = (plan) => {
    const player = createRushPlayer(plan);
    let hold = 0, choice = null;
    w.__rushTasks = [];
    const tick = () => {
      if (w.__rushStop) { w.__pad.axes = [0, 0, 0, 0]; w.__pad.buttons = new Array(17).fill(0); return; }
      requestAnimationFrame(tick);
      const h = w.__game?.host?.(), tree = h?.session?.tree ?? null;
      const d = player.decide(tree);
      if (w.__rushTasks.at(-1)?.task !== d.task) w.__rushTasks.push({ step: tree?.clock.step ?? null, task: d.task });
      if (d.interact) hold = 4;
      const b = new Array(17).fill(0); if (hold > 0) { b[2] = 1; hold--; }
      w.__pad.connected = true; w.__pad.axes = [d.stick[0], -d.stick[1], 0, 0]; w.__pad.buttons = b;
      if (d.choose) choice = d.choose;
      if (choice) { const el = document.getElementById('dialogue-choice-' + choice); if (el) { el.click(); choice = null; } }
    };
    requestAnimationFrame(tick);
  };
})();`;

const until = (page, fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const view = (page) => page.evaluate(() => /** @type {any} */ (window).__game?.host()?.session?.view() ?? null);

/**
 * One session from the title menu, played by the scripted player until its ending, in a page whose context carries
 * RUSH_INIT; the page is closed after. → its log (the input the app recorded, a hash of the world after every step),
 * the scenes it went through, what was seen on the way and four stills.
 * @param {any} page a Playwright page @param {string} url the game's page, with ?trace @param {'win' | 'lose'} name
 */
export async function playRushSession(page, url, name) {
  const plan = RUSH_PLANS[name], want = name === 'win' ? 'won' : 'lost';
  await page.goto(url);
  await until(page, () => { const s = /** @type {any} */ (window).__game?.state(); return s?.ready && s.stack.at(-1) === 'title'; }, null);
  await page.click('#new-game'); // not Enter: after an earlier session's checkpoint the menu's focus is on Continue
  await until(page, () => /** @type {any} */ (window).__game.state().stack.length === 0 && /** @type {any} */ (window).__game.host().session.active, null);
  await page.evaluate((p) => /** @type {any} */ (window).__rushPlay(p), plan);
  const seen = { hud: null, carry: null, choice: null, checkpoint: null };
  const shots = {};
  const t0 = Date.now();
  for (;;) {
    await page.waitForTimeout(250);
    const v = await view(page);
    if (!v) continue;
    if (v.scene === 'game/level.vrmxs' && !seen.hud) {
      seen.hud = await page.evaluate(() => ({ goal: document.querySelector('#hud-goal')?.textContent?.trim() ?? null, score: document.querySelector('#hud-score')?.textContent?.trim() ?? null, clock: document.querySelector('#hud-timer-clock')?.textContent?.trim() ?? null }));
    }
    if (name === 'win' && !seen.choice && (await page.$('#dialogue-choice-latte'))) {
      seen.choice = await page.evaluate(() => ({ line: document.querySelector('#dialogue-line')?.textContent?.trim() ?? null, choices: [...document.querySelectorAll('[id^="dialogue-choice-"]')].map((b) => b.textContent.trim()) }));
      shots.choice = await page.screenshot();
    }
    if (name === 'win' && !seen.carry) {
      const c = await page.evaluate(() => { const t = /** @type {any} */ (window).__game.host().session.tree; const inv = t?.services.get('inventory')?.list('mira') ?? []; return inv.length ? { carrying: inv.map((e) => e.name), layers: JSON.stringify(t.find('mira').getState().layers ?? null).match(/upperBody|arms|face|additive/g) ?? [], hud: document.querySelector('[id^="hud-carry"]')?.textContent?.trim() ?? null } : null; });
      if (c) { seen.carry = c; await page.waitForTimeout(600); shots.carry = await page.screenshot(); }
    }
    if (v.checkpoints && Object.keys(v.checkpoints).length && !seen.checkpoint) seen.checkpoint = { step: v.step, checkpoints: v.checkpoints };
    if (v.outcome && !shots.decided) shots.decided = await page.screenshot();
    if (v.scene === `game/${want}.vrmxs` && !shots.ending) { await page.waitForTimeout(2500); shots.ending = await page.screenshot(); seen.endingLine = await page.evaluate(() => document.querySelector('#dialogue-line')?.textContent?.trim() ?? null); }
    if (v.scene === `game/${want}.vrmxs` || (v.outcome && v.outcome !== want)) {
      if (v.scene !== `game/${want}.vrmxs`) break;
    }
    // the ending says its lines, then the title as a new game: stop a moment after the title is back
    if (shots.ending && v.scene === 'game/title.vrmxs') { await page.waitForTimeout(1000); break; }
    if (Date.now() - t0 > 8 * 60 * 1000) break;
  }
  await page.evaluate(() => { /** @type {any} */ (window).__rushStop = true; });
  await page.keyboard.press('Escape');
  await until(page, () => /** @type {any} */ (window).__game.state().stack.at(-1) === 'pause', null);
  const log = await page.evaluate(() => /** @type {any} */ (window).__game.log());
  const tasks = await page.evaluate(() => /** @type {any} */ (window).__rushTasks);
  const scenes = [...new Set(log.hashes.map((h) => h.scene))];
  await page.close();
  return { name, want, log, scenes, seen, tasks, shots };
}
