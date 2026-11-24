// M4 W13 (AB-T-0585), M4 check 6's "on WebGL the same short renders within the look tolerance" on the sample short
// itself: the delivery's still per shot (a frame of the film at the film's size, acceptance/m4/delivery-wkwebview.sh)
// drawn on WebGPU and on WebGL in the Mac creator, compared shot by shot with the post check's SSIM
// (apps/playground/scripts/post-compare.mjs: luma, 8×8 windows every 4 px; and at ¼ size, where grain averages out).
// No translucency mask here: the stills are the film's frames as delivered, so the pixels where translucency shows
// (decision 4) count against the score. The matrix's masked comparison of every look is the tolerance's own check.
// Writes results/m4-acceptance/short-look.json; exit 1 when a shot is under the tolerance at both sizes.
//   node acceptance/m4/short-look.mjs <webgpu stills folder> <webgl stills folder> [--min 0.98]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { compareStills } from '../../apps/playground/scripts/post-compare.mjs';

const here = import.meta.dirname, argv = process.argv.slice(2), mi = argv.indexOf('--min'), MIN = mi < 0 ? 0.98 : +argv[mi + 1];
const [a, b] = argv.filter((x, i) => mi < 0 || (i !== mi && i !== mi + 1)).map((d) => path.resolve(d));
const shotOf = (f) => f.match(/(shot-[a-z]+-[0-9a-f]+)\.png$/)?.[1];
const byShot = (d) => Object.fromEntries(fs.readdirSync(d).filter(shotOf).map((f) => [shotOf(f), path.join(d, f)]));
const A = byShot(a), B = byShot(b), shots = Object.keys(A).filter((s) => B[s]).sort();
const url = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
const require = createRequire(path.join(here, '../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const browser = await chromium.launch({ executablePath: exe, headless: true });
const out = await compareStills(browser, shots.map((s) => [url(A[s]), url(B[s])]));
await browser.close();
const rows = shots.map((s, i) => ({ shot: s, ...out[i] }));
const of = (k) => rows.map((r) => r[k]).filter((x) => typeof x === 'number'), min = (k) => (of(k).length ? Math.min(...of(k)) : null), mean = (k) => (of(k).length ? +(of(k).reduce((x, y) => x + y, 0) / of(k).length).toFixed(4) : null);
const quarterKey = Object.keys(rows[0] ?? {}).find((k) => /quarter/i.test(k)) ?? null;
const under = rows.filter((r) => r.error || (r.ssim < MIN && (!quarterKey || r[quarterKey] < MIN)));
const res = { format: 'vrmxg-short-look', version: 1, ok: rows.length > 0 && Object.keys(A).length === rows.length && Object.keys(B).length === rows.length && under.length === 0, tolerance: MIN, shots: rows.length, masked: false,
  ssim: { min: min('ssim'), mean: mean('ssim') }, ssimQuarter: quarterKey ? { min: min(quarterKey), mean: mean(quarterKey) } : null, underAtFullSize: rows.filter((r) => r.ssim < MIN).map((r) => r.shot), under: under.map((r) => r.shot), rows };
fs.mkdirSync(path.join(here, '../results/m4-acceptance'), { recursive: true });
fs.writeFileSync(path.join(here, '../results/m4-acceptance/short-look.json'), `${JSON.stringify(res, null, 1)}\n`);
console.log(JSON.stringify({ ...res, rows: undefined }, null, 1));
for (const r of rows) console.log(r.shot, JSON.stringify({ ...r, shot: undefined }));
process.exit(res.ok ? 0 : 1);
