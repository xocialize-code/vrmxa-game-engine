// "After Hours" played in a browser page by the scripted player (after-hours-player.js), for M6 W10's acceptance
// (after-hours.mjs): the init script that stands in a gamepad and gives the player hands, and one session from the title
// menu to its ending. Modelled on acceptance/m5/rush-driver.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { AFTER_HOURS_PLANS, LEVEL } from './after-hours-node.mjs';

const playerSource = fs.readFileSync(path.join(import.meta.dirname, 'after-hours-player.js'), 'utf8').replace(/^export /gm, '');
/** The page's init script: the stand-in gamepad and the scripted player's hands (window.__ahPlay(plan)). */
export const AFTER_HOURS_INIT = `(() => {
  const w = window;
  w.__pad = { axes: [0, 0, 0, 0], buttons: new Array(17).fill(0), connected: false };
  const real = navigator.getGamepads?.bind(navigator);
  navigator.getGamepads = () => (w.__pad.connected ? [{ id: 'stand-in', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: w.__pad.axes.slice(), buttons: w.__pad.buttons.map((v) => ({ value: v, pressed: v > 0.5, touched: v > 0 })) }] : (real?.() ?? []));
  ${playerSource}
  // the scripted player's hands: each animation frame, its decision becomes the pad's state; X is held four frames (a
  // press the input service can't miss on a frame with no step); a choice clicks the overlay's button once it is drawn
  w.__ahPlay = (plan) => {
    const player = createAfterHoursPlayer(plan);
    let hold = 0, choice = null;
    w.__ahTasks = [];
    const tick = () => {
      if (w.__ahStop) { w.__pad.axes = [0, 0, 0, 0]; w.__pad.buttons = new Array(17).fill(0); return; }
      requestAnimationFrame(tick);
      const h = w.__game?.host?.(), tree = h?.session?.tree ?? null;
      const d = player.decide(tree);
      if (w.__ahTasks.at(-1)?.task !== d.task) w.__ahTasks.push({ step: tree?.clock.step ?? null, task: d.task });
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
 * AFTER_HOURS_INIT; the page is closed after. → its log (the input the app recorded, a hash of the world after every
 * step), the scenes it went through, what was seen on the way and stills.
 * @param {any} page a Playwright page @param {string} url the game's page, with ?trace @param {'win' | 'lose'} name
 */
export async function playAfterHoursSession(page, url, name) {
  const plan = AFTER_HOURS_PLANS[name], want = name === 'win' ? 'won' : 'lost';
  await page.goto(url);
  await until(page, () => { const s = /** @type {any} */ (window).__game?.state(); return s?.ready && s.stack.at(-1) === 'title'; }, null);
  await page.click('#new-game'); // not Enter: after an earlier session's checkpoint the menu's focus is on Continue
  await until(page, () => /** @type {any} */ (window).__game.state().stack.length === 0 && /** @type {any} */ (window).__game.host().session.active, null);
  await page.evaluate((p) => /** @type {any} */ (window).__ahPlay(p), plan);
  const seen = { title: null, hud: null, hint: null, carrying: null, door: null, checkpoint: null, refused: [] };
  const shots = {};
  const t0 = Date.now();
  for (;;) {
    await page.waitForTimeout(250);
    const v = await view(page);
    if (!v) continue;
    if (v.scene === 'after-hours/title.vrmxs' && !shots.title) { await page.waitForTimeout(1500); shots.title = await page.screenshot(); seen.title = await page.evaluate(() => document.querySelector('#hud-goal')?.textContent?.trim() ?? null); }
    if (v.scene === LEVEL && !seen.hud) {
      seen.hud = await page.evaluate(() => ({ goal: document.querySelector('#hud-goal')?.textContent?.trim() ?? null, counters: [...document.querySelectorAll('[id^="hud-counter"]')].map((e) => e.textContent.trim()), clock: document.querySelector('#hud-timer-clock')?.textContent?.trim() ?? null }));
    }
    if (name === 'win' && !seen.hint && (await page.$('#dialogue-choice-book'))) {
      seen.hint = await page.evaluate(() => ({ line: document.querySelector('#dialogue-line')?.textContent?.trim() ?? null, choices: [...document.querySelectorAll('[id^="dialogue-choice-"]')].map((b) => b.textContent.trim()) }));
      shots.hint = await page.screenshot();
    }
    if (name === 'win' && !seen.carrying) { // the moment she holds two things at once
      const c = await page.evaluate(() => { const t = /** @type {any} */ (window).__game.host().session.tree; const inv = t?.services.get('inventory')?.list('mira') ?? []; return inv.length >= 2 ? { carrying: inv.map((e) => e.name), hud: document.querySelector('[id^="hud-carry"]')?.textContent?.trim() ?? null } : null; });
      if (c) { seen.carrying = c; await page.waitForTimeout(400); shots.carrying = await page.screenshot(); }
    }
    if (name === 'win' && !seen.door) {
      const d = await page.evaluate(() => /** @type {any} */ (window).__game.host().session.tree?.find('staff-door')?.current ?? null);
      if (d === 'open') { seen.door = { step: v.step, state: d }; await page.waitForTimeout(1500); shots.door = await page.screenshot(); }
    }
    if (name === 'lose' && (v.counters?.mistakes ?? 0) > seen.refused.length) seen.refused.push({ step: v.step, caption: await page.evaluate(() => document.querySelector('[id^="caption"]')?.textContent?.trim() ?? null) });
    if (v.checkpoints && Object.keys(v.checkpoints).length && !seen.checkpoint) seen.checkpoint = { step: v.step, checkpoints: v.checkpoints };
    if (v.outcome && !shots.decided) shots.decided = await page.screenshot();
    if (v.scene === `after-hours/${want}.vrmxs` && !shots.ending) { await page.waitForTimeout(2500); shots.ending = await page.screenshot(); seen.endingLine = await page.evaluate(() => document.querySelector('#dialogue-line')?.textContent?.trim() ?? null); }
    if (v.outcome && v.outcome !== want) break;
    // the ending says its lines, then the title as a new game: stop a moment after the title is back
    if (shots.ending && v.scene === 'after-hours/title.vrmxs') { await page.waitForTimeout(1000); break; }
    if (Date.now() - t0 > 8 * 60 * 1000) break;
  }
  await page.evaluate(() => { /** @type {any} */ (window).__ahStop = true; });
  await page.keyboard.press('Escape');
  await until(page, () => /** @type {any} */ (window).__game.state().stack.at(-1) === 'pause', null);
  const log = await page.evaluate(() => /** @type {any} */ (window).__game.log());
  const tasks = await page.evaluate(() => /** @type {any} */ (window).__ahTasks);
  const scenes = [...new Set(log.hashes.map((h) => h.scene))];
  await page.close();
  return { name, want, log, scenes, seen, tasks, shots };
}
