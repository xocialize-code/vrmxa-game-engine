// AB-T-0589: the film exported several times per page (?mode=frames&parts=filmRepeat), on several loads, in headless
// Chromium (Metal), WebGPU. Every export's frames must equal the page's first export's, and every load's digests must be
// the same. A differing frame's images go to results/repeat/ (git-ignored), not into the JSON.
// Writes results/<name>.json. Exit 1 on a page error or any differing frame.
//   (cd apps/playground && npx vite build) && node apps/playground/scripts/repeat-chromium.mjs [--loads 3] [--name repeat-chromium] [query extras]
//   e.g. node apps/playground/scripts/repeat-chromium.mjs --loads 3 'frames=120&repeat=3&audio=0&tiles=1&wgsl=1'
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const here = import.meta.dirname, dist = path.join(here, '../dist'), results = path.join(here, '../results');
const require = createRequire(path.join(here, '../../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const loads = +opt('--loads', 3), name = opt('--name', 'repeat-chromium'), renderer = opt('--renderer', 'webgpu'), part = opt('--part', 'filmRepeat');
const extra = args[0] ? `&${args[0]}` : '';
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname, file = path.join(dist, decodeURIComponent(p === '/' ? '/index.html' : p));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const shots = path.join(results, 'repeat');
fs.mkdirSync(shots, { recursive: true });
const query = `?mode=frames&renderer=${renderer}&parts=${part}${extra}`;
const out = { query, loads: [], ua: null, os: os.release() };
for (let load = 1; load <= loads; load++) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(base + query);
  await page.waitForFunction(() => /** @type {any} */ (window).READY === true, null, { timeout: 3600000, polling: 1000 });
  const r = await page.evaluate(() => /** @type {any} */ (window).__result);
  await page.close();
  out.ua ??= r.ua;
  if (part === 'sameFrame') {
    const sf = r.sameFrame ?? {};
    out.loads.push({ load, backend: r.backend, errors, ...sf });
    console.log(`load ${load}: frame ${sf.frame} drawn ${sf.repeat} times: ${sf.distinct} distinct frames, ${sf.tileDistinct} distinct tiles ${JSON.stringify(sf.counts)} (${sf.ms} ms)`, sf.firstOdd ?? '', errors.slice(0, 2));
    continue;
  }
  const fr = r.filmRepeat ?? {};
  for (const [i, run] of (fr.runs ?? []).entries()) for (const d of run.diffs) {
    fs.writeFileSync(path.join(shots, `${name}-load${load}-export${i}-frame${d.frame}.png`), Buffer.from(d.png.split(',')[1], 'base64'));
    for (const [k, suffix] of [['tilePng', 'tile'], ['refTilePng', 'tile-first']]) if (d[k]) { fs.writeFileSync(path.join(shots, `${name}-load${load}-export${i}-frame${d.frame}-${suffix}.png`), Buffer.from(d[k].split(',')[1], 'base64')); delete d[k]; }
    delete d.png;
  }
  for (const [k, s] of Object.entries(fr.refShots ?? {})) { fs.writeFileSync(path.join(shots, `${name}-load${load}-ref-frame${k}.png`), Buffer.from(s.png.split(',')[1], 'base64')); delete s.png; }
  out.loads.push({ load, backend: r.backend, ms: r.ms, errors, ...fr });
  console.log(`load ${load}:`, (fr.runs ?? []).map((x) => `${x.digest}${x.diffs.length ? ` (${x.diffs.length} differ: ${x.diffs.map((d) => `${d.frame}[${d.tiles}]`).join(' ')})` : ''}${x.wgsl ? ` wgsl ${x.wgsl.digest}/${x.wgsl.modules}${x.wgsl.notInFirst.length ? ` +${x.wgsl.notInFirst.length}` : ''}` : ''}`).join(' | '), errors.slice(0, 2));
}
await browser.close(); server.close();
const digests = out.loads.flatMap((l) => (l.runs ?? []).map((x) => x.digest));
out.exports = digests.length;
out.allIdentical = part === 'sameFrame' ? out.loads.every((l) => l.distinct === 1 && !l.errors.length) : digests.length > 0 && new Set(digests).size === 1 && out.loads.every((l) => !l.errors.length);
fs.writeFileSync(path.join(results, `${name}.json`), JSON.stringify(out, null, 1) + '\n');
console.log(`${out.exports} exports, all identical: ${out.allIdentical}`);
process.exit(out.allIdentical ? 0 : 1);
