// M4 W0 (AB-T-0572): the built playground (apps/playground/dist) on both backends in headless Chromium (Metal). For
// `?renderer=webgl` and `?renderer=webgpu` it loads the cafe, replays the recorded walk from step 0 and draws offline
// frames with host.frameAt (the export path: no yield to rAF between frames), hashing each canvas in the task that drew
// it. Then it does the same on a second load of each page. Writes results/backends-chromium.json and one still per
// backend (results/playground-{webgl,webgpu}.png) and the page (results/playground-ui-*.png), and compares the two backends' stills pixel by pixel (speech bubbles
// off on both: they are WebGL-only until text moves to TSL).
// It also forces ?renderer=webgpu on a page without WebGPU (the error shows; controls stay disabled; nothing throws).
// Exit 1 on a page error, a backend that isn't the one asked for, offline frames that repeat, or a reload that differs.
//   (cd apps/playground && npx vite build) && node apps/playground/scripts/backends-chromium.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { acquireGpuLock, sayWaiting } from '../../../acceptance/gpu-lock.mjs';

await acquireGpuLock({ who: 'apps/playground/scripts/backends-chromium.mjs', onWait: sayWaiting('apps/playground/scripts/backends-chromium.mjs') }); // M4 W3: one GPU runner at a time on this machine (acceptance/README.md)

const here = import.meta.dirname, dist = path.join(here, '../dist'), results = path.join(here, '../results');
const require = createRequire(path.join(here, '../../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname, file = path.join(dist, decodeURIComponent(p === '/' ? '/index.html' : p));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });

/** Mira walks in through the doors from step 0; Hana is at the counter. Five consecutive offline frames, then a still. */
const STEPS = [300, 301, 302, 303, 304], STILL = 420;

const shots = new Set();
fs.mkdirSync(results, { recursive: true });
async function run(renderer, compareWith = null) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const consoleLines = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleLines.push(`error: ${m.text()}`); });
  page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
  await page.goto(`${base}?renderer=${renderer}`);
  await page.waitForSelector('#play:not([disabled])', { timeout: 120000 });
  // the playground's own check (Playground.backendCheck, also ?mode=backends in WKWebView), plus the pixel comparison
  const out = await page.evaluate(async ({ STEPS, STILL, compareWith }) => /** @type {any} */ (window).__playground.backendCheck({ steps: STEPS, still: STILL, compareWith }), { STEPS, STILL, compareWith });
  out.ua = await page.evaluate(() => navigator.userAgent);
  if (!compareWith && !shots.has(renderer)) { // the page itself, with its Renderer readout, on the still's step
    shots.add(renderer);
    await page.evaluate(() => /** @type {any} */ (window).__playground._changed());
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(results, `playground-ui-${renderer}.png`) });
  }
  await page.close();
  return { ...out, console: consoleLines };
}

/**
 * A forced ?renderer=webgpu on a page without WebGPU: the error shows, every control that needs the world stays disabled,
 * and the toggles called anyway don't throw (the host never came).
 */
async function forcedWithoutWebGPU() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined }));
  await page.goto(`${base}?renderer=webgpu`);
  await page.waitForSelector('.error', { timeout: 60000 });
  const out = await page.evaluate(() => {
    const pg = /** @type {any} */ (window).__playground, thrown = [];
    for (const f of [() => pg.setDebug({ colliders: true }), () => pg.setInterpolation(false), () => pg.setBubbles(false), () => pg.setNameTags(true), () => pg.step()]) { try { f(); } catch (e) { thrown.push(String(e)); } }
    const ids = ['play', 'step', 'replay', 'save-game', 'show-bubbles', 'show-names'];
    const boxes = [...document.querySelectorAll('input[type=checkbox]')].filter((b) => ['Colliders', 'Sensors', 'Capsules', 'Rays', 'Interpolate'].includes(b.getAttribute('aria-label')));
    return { error: document.querySelector('.error')?.textContent?.slice(0, 160), host: !!pg.host, thrown, enabled: [...ids.filter((id) => !document.getElementById(id)?.disabled), ...boxes.filter((b) => !b.disabled).map((b) => b.getAttribute('aria-label'))] };
  });
  await page.close();
  return { ...out, pageErrors: errors };
}
const forced = await forcedWithoutWebGPU();
const webgl = await run('webgl'), webglAgain = await run('webgl');
const webgpuAgain = await run('webgpu'), webgpu = await run('webgpu', webgl.png);
fs.mkdirSync(results, { recursive: true });
for (const [name, r] of [['webgl', webgl], ['webgpu', webgpu]]) fs.writeFileSync(path.join(results, `playground-${name}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
const strip = ({ png, ...r }) => r;
const out = {
  version: browser.version(), steps: STEPS, still: STILL,
  webgl: strip(webgl), webgpu: strip(webgpu),
  forcedWithoutWebGPU: forced,
  reload: { webgl: webglAgain.stillHash === webgl.stillHash && webglAgain.frames.join() === webgl.frames.join(), webgpu: webgpuAgain.stillHash === webgpu.stillHash && webgpuAgain.frames.join() === webgpu.frames.join() },
};
await browser.close(); server.close();
fs.writeFileSync(path.join(results, 'backends-chromium.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out, null, 1));
const bad = [webgl, webgpu, webglAgain, webgpuAgain].some((r) => r.console.length || r.distinct !== STEPS.length)
  || !/no WebGPU/.test(forced.error ?? '') || forced.host || forced.thrown.length || forced.enabled.length || forced.pageErrors.length
  || webgl.backend !== 'webgl' || webgpu.backend !== 'webgpu' || !webgpu.isWebGPUBackend || !out.reload.webgl || !out.reload.webgpu;
process.exit(bad ? 1 : 0);
