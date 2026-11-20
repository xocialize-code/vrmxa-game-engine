// M4 W1 (AB-T-0573): post-wkwebview.sh's rows → results/post-wkwebview.json. Per run: the backend, the exports' hashes,
// the looks' first-frame checks and the costs. Then: exports repeat on every load and both origins (per backend, as WebGPU
// must and W0 found WebGL in WKWebView sometimes doesn't: AB-T-0587), and each loopback look on WebGPU against WebGL
// (SSIM, decoded in headless Chromium). Exit 1 on an error, a time-out, a first frame that isn't its repeat, a flat
// frame, WebGPU exports that differ, or offline frames that repeat.
//   node apps/playground/scripts/post-wkwebview-summary.mjs <wkwebview-shots.json> <results dir>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { compareStills } from './post-compare.mjs';

const [file, out] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
const runs = [], pngs = {};
let bad = false;
for (const r of rows) {
  const x = r.result ?? {};
  const looks = Object.fromEntries(Object.entries(x.looks ?? {}).map(([k, { png, ...v }]) => {
    if (r.origin === 'loopback' && !r.case.includes('again')) { (pngs[x.backend] ??= {})[k] = png; fs.writeFileSync(path.join(out, 'post', `wkwebview-${x.backend}-${k}.png`), Buffer.from(png.split(',')[1], 'base64')); }
    return [k, v];
  }));
  runs.push({ ...x, looks, origin: r.origin, case: r.case, ua: r.ua, errors: r.errors, timedOut: r.timedOut });
  const firstOk = Object.values(looks).every((l) => l.firstEqualsAgain && l.lumaStd >= 5);
  console.log(r.origin.padEnd(8), String(x.backend).padEnd(6), x.stack, 'exports identical', x.exports?.identical, 'distinct', x.exports?.distinct, 'frame0 std', x.exports?.frame0?.lumaStd, 'first=again & not flat', firstOk, 'cost', JSON.stringify(x.costMs), 'errors', (r.errors ?? []).length, r.timedOut ? 'TIMED OUT' : '');
  bad ||= !!(r.errors ?? []).length || r.timedOut || !x.exports?.identical || x.exports.distinct !== x.frames.length || x.exports.frame0.lumaStd < 5 || !firstOk;
}
const repeat = (b) => new Set(runs.filter((r) => r.backend === b).map((r) => r.exports.a.join())).size === 1;
const repeats = { webgpu: repeat('webgpu'), webgl: repeat('webgl') };
console.log('exports repeat across loads and origins', JSON.stringify(repeats));
const require = createRequire(path.join(import.meta.dirname, '../../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const browser = await chromium.launch({ executablePath: exe, headless: true });
const looks = Object.keys(pngs.webgpu ?? {});
const cmp = await compareStills(browser, looks.map((l) => [pngs.webgl[l], pngs.webgpu[l]]));
await browser.close();
const ssim = Object.fromEntries(looks.map((l, i) => [l, cmp[i]]));
for (const l of looks) console.log(l.padEnd(14), 'SSIM', ssim[l].ssim, 'mean', ssim[l].meanMaxChannel, '>8', ssim[l].over8);
fs.writeFileSync(path.join(out, 'post-wkwebview.json'), JSON.stringify({ tolerance: 0.98, repeats, webgpuVsWebgl: ssim, runs }, null, 1) + '\n');
process.exitCode = bad || !repeats.webgpu ? 1 : 0;
