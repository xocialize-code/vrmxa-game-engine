// Headless Chromium (Playwright's cached Chrome for Testing, Metal) over the spike's own Vite servers:
// one PNG + JSON per case → ../results/chromium/, ../results/chromium.json.
//   node scripts/shots.mjs                 the full matrix
//   node scripts/shots.mjs 'renderer=webgpu&model=mira'   only these cases (r187 server)
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const web = path.resolve(import.meta.dirname, '..');
const outDir = path.join(web, '../results/chromium');
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

export function matrix() {
  const cases = [];
  const R = ['webgl', 'webgpu', 'webgpu-gl', 'webgpu&lib=loadonly'];
  for (const renderer of [...R, 'webgpu-gl&lib=loadonly']) cases.push({ three: '187', q: `renderer=${renderer}&model=spheres&features=none&w=768&h=512` });
  // Diagnostics: transparency and the mask channel (spheres2), three's own blending (threealpha), the matcap quadrant test.
  for (const renderer of ['webgl', 'webgpu', 'webgpu&lib=loadonly']) cases.push({ three: '187', q: `renderer=${renderer}&model=spheres2&features=none&w=768&h=400` });
  for (const renderer of ['webgl', 'webgpu']) cases.push({ three: '187', q: `renderer=${renderer}&model=threealpha&features=none&w=400&h=400` });
  for (const renderer of ['webgl', 'webgpu', 'webgpu-gl', 'webgpu&lib=loadonly']) cases.push({ three: '187', q: `renderer=${renderer}&model=spheres&features=none&amb=0&w=768&h=512&matcapTex=quad` });
  for (const renderer of ['webgl', 'webgpu']) cases.push({ three: '187', q: `renderer=${renderer}&model=threematcap&features=none&w=400&h=400&matcapTex=quad` });
  for (const model of ['mira', 'hana', 'vroid10'])
    for (const view of ['body', 'face', 'back'])
      for (const features of ['all', 'none'])
        for (const renderer of R) cases.push({ three: '187', q: `renderer=${renderer}&model=${model}&view=${view}&features=${features}` });
  // The failure itself, and the "pin r186" option (stock 3.5.5 loads there; does it render like WebGL?).
  for (const model of ['mira', 'vroid10']) cases.push({ three: '187', q: `renderer=webgpu&lib=stock&model=${model}&view=body&features=all` });
  for (const renderer of ['webgl', 'webgpu&lib=stock', 'webgpu'])
    for (const model of ['mira', 'vroid10']) cases.push({ three: '186', q: `renderer=${renderer}&model=${model}&view=body&features=all` });
  for (const renderer of ['webgl', 'webgpu&lib=stock', 'webgpu']) cases.push({ three: '186', q: `renderer=${renderer}&model=spheres&features=none&w=768&h=512` });
  return cases;
}
export const caseName = (c) => `r${c.three}__` + c.q.replace(/renderer=|model=|view=|lib=/g, '').replace(/features=/, 'f').replace(/[=&,./]/g, '_');

async function serve(three) {
  process.env.THREE_R = three;
  const s = await createServer({ root: web, configFile: path.join(web, 'vite.config.js'), logLevel: 'error' });
  await s.listen();
  return s;
}

// --vroid-sample: the VRoid Hub sample (results/vroid-sample.json) → ../results/chromium-vroid.json
export function vroidMatrix() {
  const { sample } = JSON.parse(fs.readFileSync(path.join(web, '../results/vroid-sample.json'), 'utf8'));
  const cases = [];
  for (const { id } of sample)
    for (const [view, features, extra] of [['body', 'none', ''], ['face', 'none', ''], ['body', 'all', ''], ['body', 'none', '&hide=transparent']])
      for (const renderer of ['webgl', 'webgpu', 'webgpu&lib=loadonly'])
        cases.push({ three: '187', q: `renderer=${renderer}&model=vroid-sample/${id}&view=${view}&features=${features}${extra}` });
  return cases;
}
const vroid = process.argv.includes('--vroid-sample');
const args = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--out');
const argThree = process.argv.includes('--r186') ? '186' : '187';
const cases = vroid ? vroidMatrix() : args.length ? args.map((q) => ({ three: argThree, q })) : matrix();
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const rows = [];
for (const three of ['187', '186']) {
  const mine = cases.filter((c) => c.three === three);
  if (!mine.length) continue;
  const server = await serve(three);
  const port = server.config.server.port;
  for (const c of mine) {
    const page = await browser.newPage({ viewport: { width: 512, height: 768 } });
    const logs = [];
    page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
    await page.goto(`http://127.0.0.1:${port}/?${c.q}`);
    let timedOut = false;
    try { await page.waitForFunction('window.READY === true', null, { timeout: 120000 }); } catch { timedOut = true; }
    const r = await page.evaluate('window.__result ?? null');
    const png = await page.evaluate('window.__png ?? null');
    const name = caseName(c);
    if (png) fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(png.split(',')[1], 'base64'));
    if (vroid && r) delete r.materials; // the sample keeps counts only (mtoonCount, outlineCount); per-material dumps are 7 MB
    rows.push({ name, three, case: c.q, timedOut, png: png ? name + '.png' : null, pageErrors: logs, result: r });
    console.log(name.padEnd(48), timedOut ? 'TIMEOUT' : `${r?.stage} ${r?.backend ?? ''} r${r?.revision ?? '?'} calls ${r?.drawCalls ?? '-'} mtoon ${r?.mtoonCount ?? '-'} errors ${r?.errorCount} warnings ${r?.warningCount}${r?.importError ? ' — ' + r.importError : ''}`);
    await page.close();
  }
  await server.close();
}
const ua = await (await browser.newPage()).evaluate('navigator.userAgent');
// --out <name>: write ../results/<name>.json instead (ad-hoc runs shouldn't overwrite the main matrix)
const outName = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : vroid ? 'chromium-vroid' : 'chromium';
fs.writeFileSync(path.join(web, `../results/${outName}.json`), JSON.stringify({ date: new Date().toISOString(), browser: browser.version(), ua, rows }, null, 2) + '\n');
await browser.close();
