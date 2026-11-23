// M3 W7 (AB-T-0546) in the playground in headless Chromium: the fall seen. ?fall puts a flight of stairs outside the
// cafe (box colliders, drawn here with debug draw: W12 brings visible stairs) with Mira and Hana on its landing; both
// are knocked down the stairs at step 30 and the frames at four moments are kept: tumbling, lying, getting up, up.
// Stepped by hand (paused), so the frames are the same steps every run.
// Needs the playground's dev server (npm --prefix apps/playground run dev, port 5181).
// Writes acceptance/results/m3-ragdoll-chromium.json and m3-ragdoll-{tumbling,lying,rising,up}.png.
//   node acceptance/m3/ragdoll-chromium.mjs [--url http://localhost:5181] [--renderer webgl|webgpu]
// --renderer (M4 W3): the apps default to WebGPU now; this check runs on WebGL unless told otherwise, as its M3 receipt did.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';

await acquireGpuLock({ who: 'acceptance/m3/ragdoll-chromium.mjs', onWait: sayWaiting('acceptance/m3/ragdoll-chromium.mjs') }); // M4 W3: one GPU runner at a time on this machine (acceptance/README.md)

const here = import.meta.dirname, argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const require = createRequire(path.join(here, '../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const url = opt('--url', 'http://localhost:5181'), renderer = opt('--renderer', 'webgl'), res = (f) => path.join(here, '../results', f);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}/?fall&renderer=${renderer}`);
await page.waitForFunction(() => window.__playground?.tree && !document.querySelector('.overlay:not(.error)'), null, { timeout: 300000 });
await page.check('input[aria-label="Colliders"]');
const advanceTo = (step) => page.evaluate((step) => {
  const pg = window.__playground, t = pg.tree;
  pg.pause();
  while (t.clock.step < step) { t.step(); if (t.clock.step === 30) pg.knockDown(); pg.pause(); }
  pg.host.render(1);
  const of = (id) => { const c = t.find(id); return { phase: c.ragdoll?.phase ?? 'up', at: c.object3d.position.toArray().map((x) => +x.toFixed(3)) }; };
  return { step: t.clock.step, mira: of('mira'), hana: of('hana-1') };
}, step);
const shots = {};
for (const [name, step] of [['tumbling', 75], ['lying', 180], ['rising', 310], ['up', 420]]) {
  shots[name] = await advanceTo(step);
  await page.locator('canvas').first().screenshot({ path: res(`m3-ragdoll-${name}.png`) });
}
await browser.close();
const out = { url: `${url}/?fall&renderer=${renderer}`, knockedAt: 30, shots, errors };
fs.writeFileSync(res('m3-ragdoll-chromium.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out, null, 1));
