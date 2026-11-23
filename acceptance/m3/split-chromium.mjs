// M3 W9 (AB-T-0548) in the playground in headless Chromium: split screen. ?split loads two players (Mira on WASD, Hana on
// the arrows); both walk and run apart through the page's own keyboard (dispatched key events, stepped by hand), then the
// cost of a frame at 1920×1080 is measured with two views (the host's layout, the shadow map drawn once) against one view
// of the same world, and the frame kept.
// Needs the playground's dev server (npm --prefix apps/playground run dev, port 5181).
// Writes acceptance/results/m3-split-chromium.json and m3-split.png.
//   node acceptance/m3/split-chromium.mjs [--url http://localhost:5181] [--renderer webgl|webgpu]
// --renderer (M4 W3): the apps default to WebGPU now; this check runs on WebGL unless told otherwise, as its M3 receipt did.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';

await acquireGpuLock({ who: 'acceptance/m3/split-chromium.mjs', onWait: sayWaiting('acceptance/m3/split-chromium.mjs') }); // M4 W3: one GPU runner at a time on this machine (acceptance/README.md)

const here = import.meta.dirname, argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const require = createRequire(path.join(here, '../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const url = opt('--url', 'http://localhost:5181'), renderer = opt('--renderer', 'webgl'), res = (f) => path.join(here, '../results', f);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1920, height: 1180 } });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}/?split&renderer=${renderer}`);
await page.waitForFunction(() => window.__playground?.tree && !document.querySelector('.overlay:not(.error)'), null, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const pg = window.__playground, t = pg.tree, host = pg.host, key = (type, k) => dispatchEvent(new KeyboardEvent(type, { code: k }));
  pg.pause();
  const ROUTE = [[20, 80, ['KeyW']], [80, 150, ['KeyA', 'ShiftLeft']], [30, 90, ['ArrowUp']], [90, 160, ['ArrowRight', 'ShiftRight']]];
  let held = new Set();
  while (t.clock.step < 140) { const k = t.clock.step; const want = new Set(ROUTE.filter(([a, b]) => k >= a && k < b).flatMap(([, , keys]) => keys)); for (const x of held) if (!want.has(x)) key('keyup', x); for (const x of want) if (!held.has(x)) key('keydown', x); held = want; t.step(); }
  for (const x of held) key('keyup', x);
  const gl = host.renderer.getContext(), canvas = host.renderer.domElement;
  const size = [gl.drawingBufferWidth, gl.drawingBufferHeight];
  // draw calls summed over the whole frame (three resets its counters on every render(), and split screen renders twice)
  const info = host.renderer.info;
  const time = () => {
    const ms = []; let calls = 0, triangles = 0;
    for (let i = 0; i < 40; i++) { info.autoReset = false; info.reset(); const a = performance.now(); host.render(1, false); gl.finish(); ms.push(performance.now() - a); calls = info.render.calls; triangles = info.render.triangles; }
    info.autoReset = true; ms.sort((x, y) => x - y);
    return { median: +ms[20].toFixed(3), p90: +ms[36].toFixed(3), calls, triangles };
  };
  const layout = host.layout;
  const split = time();
  host.layout = null; const one = time();
  host.layout = layout; host.render(1, false);
  const p = (id) => t.find(id).object3d.position.toArray().map((v) => +v.toFixed(2));
  return { size, canvas: [canvas.clientWidth, canvas.clientHeight], split, one, ratio: +(split.median / one.median).toFixed(2), mira: p('mira'), hana: p('hana-1'), step: t.clock.step };
});
await page.locator('canvas').first().screenshot({ path: res('m3-split.png') });
await browser.close();
const result = { url: `${url}/?split&renderer=${renderer}`, ...out, errors };
fs.writeFileSync(res('m3-split-chromium.json'), JSON.stringify(result, null, 1) + '\n');
console.log(JSON.stringify(result, null, 1));
