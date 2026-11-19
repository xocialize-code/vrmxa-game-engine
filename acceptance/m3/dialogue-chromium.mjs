// M3 W6 (AB-T-0545) in the playground in headless Chromium: the dialogue UI.
//   1. A typed conversation (?director=demo, a scripted model): type a line → Hana's "…" bubble while the director waits
//      → her line in a bubble over her head, word by word, with the caption; then a reply picked from her choices.
//      Screenshots in acceptance/results/m3-dialogue-*.png.
//   2. Bubbles and captions are presentation: the recorded conversation (?take=takes/conversation.json) replayed twice,
//      once reading bubbles and captions every step and once with both off, hashes the same at every 300th step.
// Needs the playground's dev server (npm --prefix apps/playground run dev, port 5181).
// Writes acceptance/results/m3-dialogue-chromium.json.
//   node acceptance/m3/dialogue-chromium.mjs [--url http://localhost:5181]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = import.meta.dirname, argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const require = createRequire(path.join(here, '../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const url = opt('--url', 'http://localhost:5181'), res = (f) => path.join(here, '../results', f);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const errors = [];
const open = async (q) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}/?${q}`);
  await page.waitForFunction(() => window.__playground?.tree && !document.querySelector('.overlay:not(.error)'), null, { timeout: 300000 });
  return page;
};
const bubble = (page) => page.evaluate(() => [...document.querySelectorAll('#bubbles .bubble')].map((b) => b.getAttribute('aria-label')));
const until = async (page, pred, ms = 30000) => { const t0 = Date.now(); for (;;) { const v = await pred(); if (v) return v; if (Date.now() - t0 > ms) return null; await page.waitForTimeout(100); } };

// 1. typed conversation
const page = await open('director=demo');
await page.evaluate(() => window.__playground.play());
await page.waitForTimeout(1500);
const choices = await page.$$eval('#chat .choice', (bs) => bs.map((b) => b.textContent));
await page.fill('#chat-input', 'Good morning, Hana!');
await page.press('#chat-input', 'Enter');
const thinking = await until(page, async () => (await bubble(page)).find((l) => /is thinking/.test(l)), 5000);
if (thinking) await page.screenshot({ path: res('m3-dialogue-thinking.png') });
const line = await until(page, async () => (await bubble(page)).find((l) => /Hana says: Good morning! Lovely to see you\./.test(l)));
await page.waitForTimeout(900);
const caption = await page.evaluate(() => document.querySelector('#captions p')?.getAttribute('aria-label') ?? null);
await page.screenshot({ path: res('m3-dialogue-typed.png') });
await until(page, async () => !(await bubble(page)).length, 15000);
await page.click('#chat .choice:nth-child(2)'); // "Could I get a latte, please?"
const order = await until(page, async () => (await bubble(page)).find((l) => /One latte, coming right up!/.test(l)));
await page.waitForTimeout(700);
await page.screenshot({ path: res('m3-dialogue-choice.png') });
const goal = await page.evaluate(() => window.__playground.tree.find('hana-1').behaviours[0].bb.goal);
await page.close();

// 2. presentation only: the take, with the UI read every step and without it
const replay = async (withUI) => {
  const p = await open('take=takes/conversation.json');
  if (!withUI) { await p.uncheck('#show-bubbles'); await p.uncheck('#show-captions'); }
  const out = await p.evaluate(async (withUI) => {
    const pg = window.__playground, tree = pg.tree, { worldHashes, hashValue } = window.__snapshot ?? {};
    pg.pause();
    const hashes = {}, seen = new Set();
    let shot = null;
    while (tree.clock.step < 3000) {
      pg.host.frame(1 / 60);
      if (withUI) { for (const b of pg.bubbles()) seen.add(b.text ?? b.kind); pg.captions(); if (!shot && tree.clock.step > 730 && pg.bubbles().some((b) => b.kind === 'line')) shot = tree.clock.step; }
      if (tree.clock.step % 300 === 0) hashes[tree.clock.step] = pg.worldHash();
    }
    return { hashes, seen: [...seen], shotAt: shot };
  }, withUI);
  if (withUI) { // a still of a line in the take, bubble and caption on
    await p.evaluate(async () => { const pg = window.__playground; while (!pg.bubbles().some((b) => b.kind === 'line')) pg.host.frame(1 / 60); });
    await p.evaluate(() => window.__playground._changed());
    await p.waitForTimeout(300);
    await p.screenshot({ path: res('m3-dialogue-take.png') });
  }
  await p.close();
  return out;
};
const on = await replay(true), off = await replay(false);
await browser.close();
const same = Object.keys(on.hashes).every((k) => on.hashes[k] === off.hashes[k]);
const out = {
  runtime: 'chromium',
  typed: { choices, thinking, line, caption, order, goal },
  presentation: { steps: 3000, samples: Object.keys(on.hashes).length, same, linesSeen: on.seen, hashesWithUI: on.hashes, hashesWithout: off.hashes },
  screenshots: ['m3-dialogue-thinking.png', 'm3-dialogue-typed.png', 'm3-dialogue-choice.png', 'm3-dialogue-take.png'],
  errors,
};
fs.writeFileSync(res('m3-dialogue-chromium.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ ...out, presentation: { ...out.presentation, hashesWithUI: undefined, hashesWithout: undefined } }, null, 1));
