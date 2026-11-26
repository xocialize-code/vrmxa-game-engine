// M5 W7 (AB-T-0609): character layers replay exactly. The scenario (apps/playground/src/layers-check.js: Mira walks the
// sample cafe while a wave, the carried tray, a wave over the carry and breathing play on her layers) in Node, then in
// headless Chromium through the built playground's ?mode=layers over loopback. Both must give the same per-step run, the
// same final world and the same restore from a snapshot taken mid-fade, and show the layers did their work: the lower
// body walking's bit for bit, the arms turned, no layer state left. Then two stills of the layers drawn in Chromium
// (the playground's ?layers: the carry over the walk, and a wave over the carry) and the same walk with no layer.
// Writes acceptance/results/m5-layers.json (and m5-layers-{walk,carry,wave}.png); exit 1 on a difference. Needs
// vrmxa-core beside the repo (it reads the characters) and a built playground:
//   (cd apps/playground && npx vite build) && node acceptance/m5/layers.mjs [--node-only] [--no-stills]
// then acceptance/m5/layers-wkwebview.sh for WebKit. The check itself draws nothing, but the page makes a renderer and
// the stills draw, so the browser part takes the GPU lock (acceptance/README.md, "Exactness").
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier, RAPIER_BUILD } from '@vrmxg/physics';
import { layersCheck, layersPerformed, LAYERS_SCRIPT } from '../../apps/playground/src/layers-check.js';
import { vrmxaCore, PATHS } from '../../engine/packages/character/test/fixtures.mjs';
import * as projectBehaviours from '../../content/sample/behaviours.js';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';

const here = import.meta.dirname, content = path.join(here, '../../content/sample'), argv = process.argv.slice(2), res = (f) => path.join(here, '../results', f);
installPortableMath();
const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
const opts = { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true };
const node = { runtime: 'node', version: process.version, ...(await layersCheck({ R: await loadRapier(), bytes, opts })) };
const brief = (r) => r && (({ run, ...rest }) => rest)(r);
console.log(JSON.stringify(brief(node), null, 1));

let chromium = [], stills = null;
if (!argv.includes('--node-only')) {
  await acquireGpuLock({ who: 'acceptance/m5/layers.mjs', onWait: sayWaiting('acceptance/m5/layers.mjs') });
  const dist = path.join(here, '../../apps/playground/dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('build the playground first: (cd apps/playground && npx vite build)'); process.exit(2); }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname, file = path.join(dist, decodeURIComponent(p === '/' ? '/index.html' : p));
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const require = createRequire(path.join(here, '../../spike-determinism/web/package.json'));
  let pw;
  try { pw = require('playwright-core'); } catch { pw = createRequire(path.join(here, '../../../../../spike-determinism/web/package.json'))('playwright-core'); }
  const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const browser = await pw.chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  for (const load of [1, 2]) { // two fresh pages: the same both times
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`error: ${m.text()}`); });
    await page.goto(`${url}/?mode=layers&renderer=webgl`);
    await page.waitForFunction(() => /** @type {any} */ (window).READY === true, null, { timeout: 600000, polling: 1000 });
    const r = await page.evaluate(() => { const w = /** @type {any} */ (window); return { ...w.__result, pageErrors: w.__errors }; });
    const row = { runtime: 'chromium', load, version: browser.version(), ...r, errors: [...errors, ...(r.pageErrors ?? [])] };
    delete row.pageErrors;
    chromium.push(row);
    await page.close();
    console.log(JSON.stringify(brief(row), null, 1));
  }
  if (!argv.includes('--no-stills')) {
    // the stills: Mira walking along the pavement (goTo, which the player behaviour leaves alone) with the carry, then
    // waving over it; and the same walk with no layer. Stepped by hand while paused, so each still is the same step every time.
    const shoot = async (name, layers) => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${url}/?layers&renderer=webgl`);
      await page.waitForFunction(() => /** @type {any} */ (window).__playground?.tree && !document.querySelector('.overlay:not(.error)'), null, { timeout: 300000 });
      const info = await page.evaluate(({ layers, until }) => {
        const pg = /** @type {any} */ (window).__playground, t = pg.tree, mira = t.find('mira');
        pg.pause();
        const p = mira.object3d.position, start = t.clock.step;
        mira.goTo({ point: [p.x + 12, p.y, p.z + 0.5] }); // along the pavement outside the cafe, well past where she'll get to
        // the camera in front of her and to her left, looking back at her (orbit: yaw 0 looks along +Z)
        const cam = t.find('cam'); cam.setPreset({ preset: 'orbit' }); cam.rig.yaw = -2.2; cam.rig.pitch = 0.2; cam.rig.distance = 5.5;
        while (t.clock.step < start + until) {
          const k = t.clock.step - start;
          if (layers && k === 20) mira.playLayer({ layer: 'upperBody', slot: 'carry', fade: 0.3 });
          if (layers === 'wave' && k === 70) mira.playLayer({ layer: 'arms', clip: 'greet', loop: false, fade: 0.3 });
          t.step(); pg.pause();
        }
        pg.host.render(1);
        return { step: t.clock.step, at: mira.object3d.position.toArray().map((x) => +x.toFixed(3)), state: mira.graph.state, layers: Object.keys(mira.getState().layers?.playing ?? {}) };
      }, { layers, until: layers === 'wave' ? 100 : 90 });
      await page.locator('canvas').first().screenshot({ path: res(`m5-layers-${name}.png`) });
      await page.close();
      return { ...info, file: `acceptance/results/m5-layers-${name}.png`, errors };
    };
    stills = { walk: await shoot('walk', null), carry: await shoot('carry', 'carry'), wave: await shoot('wave', 'wave') };
    console.log(JSON.stringify(stills, null, 1));
  }
  await browser.close(); server.close();
}

// the per-step run is compared whole here, and kept as a digest (every step's hashes aren't committed)
const digest = (run) => createHash('sha256').update(JSON.stringify(run)).digest('hex');
const sameAsNode = (r) => r.final === node.final && JSON.stringify(r.run) === JSON.stringify(node.run) && r.restored?.final === node.restored.final && r.walkFinal === node.walkFinal;
const same = chromium.every(sameAsNode);
const pass = layersPerformed(node) && chromium.every((r) => layersPerformed(r) && !r.errors.length) && same && (!stills || Object.values(stills).every((s) => !s.errors.length));
const keep = (r) => r && (({ run, ...rest }) => ({ ...rest, runDigest: digest(run) }))(r);
const out = {
  check: 'M5 W7: character layers (a wave, the carried tray, a wave over the carry, additive breathing) replay exactly in Node and Chromium; the lower body is walking\'s; a snapshot mid-fade restores',
  pass, same, rapier: RAPIER_BUILD, script: LAYERS_SCRIPT, node: keep(node), chromium: chromium.map(keep), stills,
};
fs.writeFileSync(res('m5-layers.json'), JSON.stringify(out, null, 1) + '\n');
console.log(pass ? 'PASS' : 'FAIL', same ? 'same hashes' : 'HASHES DIFFER');
process.exit(pass ? 0 : 1);
