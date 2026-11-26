// M6 W6 (AB-T-0639): the editor (and so the creator, which is the editor's host) with its GPU device lost under it, in
// Chromium: on WebGPU, device.destroy() in the edit view and during Play, then WebKit's symptom (createCommandEncoder
// throws: the aids drawn after the failed frame would throw too, and leave a stale error) in both; on WebGL, a lost
// context the browser restores. Each time the editor must make its view again on the same canvas (its controls listen
// there), on the backend it had, with the world it showed: the edit world, or the play world through the scene's camera,
// its step going on from where it was (nothing steps while the view is lost). No error.
// The game app's own check, with per-step hashes against an unbroken session, is device-loss.mjs.
//
//   (cd apps/editor && npx vite build) && node acceptance/m6/editor-device-loss.mjs
//
// Results: acceptance/results/m6-editor-device-loss.json and its stills. It draws, so it takes the GPU lock.
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';

const here = import.meta.dirname, root = path.join(here, '../..'), dist = path.join(root, 'apps/editor/dist');
const RESULTS = path.join(root, 'acceptance/results');
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('build the editor first: (cd apps/editor && npx vite build)'); process.exit(1); }
const checks = [], say = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(dist, url === '/' ? '/index.html' : url);
  if (!f.startsWith(dist + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
const base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}/`;
let pw;
try { pw = createRequire(path.join(root, 'spike-determinism/web/package.json'))('playwright-core'); } catch { pw = createRequire(path.join(here, '../../../../../spike-determinism/web/package.json'))('playwright-core'); }
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const release = await acquireGpuLock({ who: 'acceptance/m6/editor-device-loss.mjs', onWait: sayWaiting('acceptance/m6/editor-device-loss.mjs') });
const browser = await pw.chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Device Lost|destroyed|lost|Invalid|WebGPU.*(error|warning)/i.test(m.text())) errors.push(m.text()); });
const until = (fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const ed = (fn, arg) => page.evaluate(fn, arg);

await page.goto(`${base}?renderer=webgpu`);
await until(() => { const e = /** @type {any} */ (window).__editor; return !!(e?.host && e.edit?.tree && e.host.tree === e.edit.tree && !e.busy); });
const canvas0 = await ed(() => /** @type {any} */ (window).__editor.canvas === document.querySelector('canvas'));

/**
 * Lose the view's device and wait for the editor's new host. → what it was and what came
 * @param {string} label @param {'destroy' | 'encoder' | 'context'} how
 */
async function lose(label, how = 'destroy') {
  const before = await ed(() => { const e = /** @type {any} */ (window).__editor; window.__oldHost = e.host; return { backend: e.host.backend, tree: e.host.tree === (e.playWorld?.tree ?? e.edit?.tree), step: e.host.tree?.clock.step ?? null }; });
  await ed((h) => {
    const r = /** @type {any} */ (window).__editor.host.renderer;
    if (h === 'destroy') r.backend.device.destroy();
    else if (h === 'encoder') r.backend.device.createCommandEncoder = () => { throw new Error('GPUDevice.createCommandEncoder: Unable to make command encoder.'); };
    else { const x = r.getContext().getExtension('WEBGL_lose_context'); x.loseContext(); setTimeout(() => x.restoreContext(), 700); } // the browser gives it back
  }, how);
  await until(() => { const e = /** @type {any} */ (window).__editor; return e.host !== /** @type {any} */ (window).__oldHost && !e.host.lost && !e.stats.display; }, null, 30000);
  await page.waitForTimeout(800);
  const after = await ed(() => {
    const e = /** @type {any} */ (window).__editor, w = /** @type {any} */ (window);
    return { backend: e.host.backend, sameCanvas: e.host.renderer.domElement === e.canvas && e.canvas === document.querySelector('canvas'), world: e.host.tree === (e.playWorld?.tree ?? e.edit?.tree), camera: e.playWorld ? e.host.camera === null : e.host.camera === e.camera, step: e.host.tree?.clock.step ?? null, calls: e.host.renderer.info.render.calls, oldLost: !!w.__oldHost.lost, error: e.error ?? '' };
  });
  const png = await page.screenshot(), file = `m6-editor-device-loss-${label}.png`;
  fs.writeFileSync(path.join(RESULTS, file), png);
  return { before, after, file };
}

const edit = await lose('edit');
say('the edit view: made again on WebGPU on the same canvas, with the edit world and the edit camera, drawing', edit.after.backend === 'webgpu' && edit.after.sameCanvas && edit.after.world && edit.after.camera && edit.after.calls > 0 && !edit.after.error && canvas0, JSON.stringify(edit.after));

await ed(() => /** @type {any} */ (window).__editor.play());
await until(() => { const e = /** @type {any} */ (window).__editor; return e.session?.mode === 'playing' && e.playWorld?.tree.clock.step > 120; });
const played = await lose('play');
const later = await (async () => { await page.waitForTimeout(1500); return ed(() => /** @type {any} */ (window).__editor.playWorld.tree.clock.step); })();
say('Play: made again on the same canvas with the play world through the scene\'s camera, and play goes on from its step', played.after.backend === 'webgpu' && played.after.sameCanvas && played.after.world && played.after.camera && !played.after.error && played.after.step >= played.before.step && later > played.after.step,
  `lost at step ${played.before.step}, drawing again at ${played.after.step}, at ${later} 1.5 s later; ${JSON.stringify(played.after)}`);
const stopped = await ed(() => { const e = /** @type {any} */ (window).__editor; e.stop(); return { mode: e.session?.mode, shows: e.host.tree === e.edit?.tree, error: e.error ?? '' }; });
say('Stop brings the edit world back on the new host', stopped.mode === 'editing' && stopped.shows && !stopped.error, JSON.stringify(stopped));

// WebKit's symptom: the draw throws before GPUDevice.lost resolves, and nothing more may draw on that renderer this frame
await page.waitForTimeout(500);
const editEnc = await lose('edit-encoder', 'encoder');
say('the edit view, createCommandEncoder throwing: made again, the aids not drawn on the dead renderer, no error left', editEnc.after.backend === 'webgpu' && editEnc.after.sameCanvas && editEnc.after.world && editEnc.after.camera && editEnc.after.calls > 0 && !editEnc.after.error, JSON.stringify(editEnc.after));
await ed(() => /** @type {any} */ (window).__editor.play());
await until(() => { const e = /** @type {any} */ (window).__editor; return e.session?.mode === 'playing' && e.playWorld?.tree.clock.step > 120; });
const playEnc = await lose('play-encoder', 'encoder');
const later2 = await (async () => { await page.waitForTimeout(1500); return ed(() => /** @type {any} */ (window).__editor.playWorld.tree.clock.step); })();
say('Play, createCommandEncoder throwing: made again, play goes on, no error left', playEnc.after.backend === 'webgpu' && playEnc.after.world && playEnc.after.camera && !playEnc.after.error && later2 > playEnc.after.step, `lost at ${playEnc.before.step}, ${later2} 1.5 s after; ${JSON.stringify(playEnc.after)}`);
await ed(() => /** @type {any} */ (window).__editor.stop());

// WebGL: the same canvas's context comes back once the browser restores it, and the view with it
await page.goto(`${base}?renderer=webgl`);
await until(() => { const e = /** @type {any} */ (window).__editor; return !!(e?.host && e.edit?.tree && e.host.tree === e.edit.tree && !e.busy); });
const gl = await lose('webgl-context', 'context');
say('WebGL, a lost context restored: made again on WebGL on the same canvas, with the edit world, drawing', gl.after.backend === 'webgl' && gl.after.sameCanvas && gl.after.world && gl.after.camera && !gl.after.error, JSON.stringify(gl.after));

const version = browser.version();
await browser.close(); server.close(); release();
say('no errors in the page beyond the lost devices\' own', errors.length === 0, errors.slice(0, 5).join(' | '));
const ok = checks.every((c) => c.ok);
fs.writeFileSync(path.join(RESULTS, 'm6-editor-device-loss.json'), `${JSON.stringify({ check: 'M6 W6: the editor survives a lost GPU device in the edit view and in Play (Chromium, WebGPU; AB-T-0639)', ok, node: process.version, chromium: version, edit, play: { ...played, later }, stopped, editEncoder: editEnc, playEncoder: { ...playEnc, later: later2 }, webgl: gl, checks }, null, 1)}\n`);
console.log(ok ? 'all checks pass' : 'some checks failed');
process.exit(ok ? 0 : 1);
