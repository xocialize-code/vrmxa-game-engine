// M4 W13 (AB-T-0585), M4 check 8's "pick WebGPU where navigator.gpu exists and fall back to WebGL; a query switch
// forces either one", in the built playground, editor and creator in headless Chromium over loopback. Each app is
// loaded with no query, ?renderer=webgl, ?renderer=webgpu and ?renderer=auto, once as the browser is (WebGPU there) and
// once with navigator.gpu hidden from the page (an init script, before any of the page's code): eight loads an app.
//   with WebGPU:    (none) → webgpu, webgl → webgl, webgpu → webgpu, auto → webgpu
//   without WebGPU: (none) → webgl,  webgl → webgl, webgpu → refused with an error and no host (a forced backend never
//                   becomes the other one), auto → webgl
// The backend is read from the app's own render host (and three's `isWebGPUBackend`), not from the query.
// Writes results/m4-acceptance/backend-switch.json; exit 1 on a difference. WKWebView's side: the matrix's cells ask for
// each backend by the same switch, and the Mac apps' hand tests read the `#renderer` readout.
//   (cd apps/playground && npx vite build); (cd apps/editor && npx vite build); (cd apps/creator && npx vite build)
//   node acceptance/m4/backend-switch.mjs
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';

const here = import.meta.dirname, root = path.join(here, '../..');
const APPS = { playground: '__playground', editor: '__editor', creator: '__creator' };
for (const a of Object.keys(APPS)) if (!fs.existsSync(path.join(root, 'apps', a, 'dist/index.html'))) { console.error(`build ${a} first: (cd apps/${a} && npx vite build)`); process.exit(1); }
const release = await acquireGpuLock({ who: 'acceptance/m4/backend-switch.mjs', onWait: sayWaiting('acceptance/m4/backend-switch.mjs') });

const require = createRequire(path.join(root, 'spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname, app = p.split('/')[1], dist = path.join(root, 'apps', app, 'dist');
  const rel = p.slice(app.length + 1), file = path.join(dist, decodeURIComponent(rel === '/' || rel === '' ? '/index.html' : rel));
  if (!APPS[app] || !file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });

const WANT = { true: { '': 'webgpu', 'renderer=webgl': 'webgl', 'renderer=webgpu': 'webgpu', 'renderer=auto': 'webgpu' }, false: { '': 'webgl', 'renderer=webgl': 'webgl', 'renderer=webgpu': 'error', 'renderer=auto': 'webgl' } };
const rows = [];
for (const [app, global] of Object.entries(APPS)) for (const gpu of [true, false]) for (const query of Object.keys(WANT[gpu])) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  if (!gpu) await context.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true }); });
  const page = await context.newPage(), pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  let got = null, detail = null;
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/${app}/${query ? `?${query}` : ''}`);
    // the host is there (a backend to read), or the app says it couldn't make one
    // (the playground keeps the failure on its engine; the editor and the creator show it in their error line, and the
    // rejection is in the page's own window.__errors)
    const refused = (g) => { const w = /** @type {any} */ (window), a = w[g]; return a?.error ? String(a.error) : (w.__errors ?? []).map(String).find((e) => /has no WebGPU/.test(e)) ?? null; };
    await page.waitForFunction(`(() => { const refused = ${refused}; const a = window[${JSON.stringify(global)}]; return !!a && (!!a.stats?.backend || !!refused(${JSON.stringify(global)})); })()`, null, { timeout: 180000, polling: 250 });
    detail = await page.evaluate(`(() => { const refused = ${refused}; const g = ${JSON.stringify(global)}, a = window[g], e = refused(g); return { hasGpu: !!navigator.gpu, backend: a.stats?.backend || null, hostBackend: a.host?.backend ?? null, isWebGPUBackend: a.host ? !!a.host.renderer?.backend?.isWebGPUBackend : null, error: e ? e.slice(0, 200) : null, shown: [...document.querySelectorAll('[role=alert], .error, #error')].map((n) => n.textContent.trim()).filter(Boolean).join(' | ').slice(0, 200) || null }; })()`);
    got = detail.backend ?? (detail.error ? 'error' : null);
  } catch (e) { detail = { failure: String(e).slice(0, 300) }; }
  await context.close();
  const want = WANT[gpu][query];
  const ok = got === want && (got === 'error' ? detail.hostBackend === null && /has no WebGPU/.test(detail.error ?? '') : detail.hostBackend === got && detail.isWebGPUBackend === (got === 'webgpu')) && detail.hasGpu === gpu; // refused: no host on the other backend either
  rows.push({ app, webgpuInThePage: gpu, query: query || '(none)', want, got, ok, ...detail, pageErrors: pageErrors.slice(0, 3) });
  console.log(`${ok ? '✔' : '✖'} ${app.padEnd(10)} ${gpu ? 'WebGPU there  ' : 'WebGPU hidden '} ${(query || '(none)').padEnd(16)} → ${got}${got === 'error' ? ` (${detail.error})` : ''}${ok ? '' : `   wanted ${want}`}`);
}
await browser.close(); server.close(); release?.();
const ok = rows.every((r) => r.ok);
fs.mkdirSync(path.join(here, '../results/m4-acceptance'), { recursive: true });
fs.writeFileSync(path.join(here, '../results/m4-acceptance/backend-switch.json'), `${JSON.stringify({ format: 'vrmxg-backend-switch', version: 1, runtime: 'chromium', ok, rows }, null, 1)}\n`);
console.log(ok ? `all ${rows.length} loads as expected` : 'FAILED');
process.exit(ok ? 0 : 1);
