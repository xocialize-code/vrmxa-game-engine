// M4 W1 (AB-T-0573): the post looks of two backends (or two engines) compared, decoded in headless Chromium: SSIM on
// luma (8×8 windows every 4 px, as check 11's ssimDown), the mean of each pixel's largest channel difference, the share
// of pixels off by more than 8 levels, and the largest difference.
//   node apps/playground/scripts/post-compare.mjs a.png b.png [a2.png b2.png …]   → JSON lines on stdout
// Also importable: compareStills(browser, [[a, b], …]) with PNG data URLs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = import.meta.dirname;

/** @param {any} browser a playwright browser @param {[string, string][]} pairs PNG data URLs */
export async function compareStills(browser, pairs) {
  const page = await browser.newPage();
  const out = [];
  for (const pair of pairs) {
    out.push(await page.evaluate(async ([a, b]) => {
      const px = async (url) => { const img = new Image(); img.src = url; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
      const A = await px(a), B = await px(b);
      if (A.width !== B.width || A.height !== B.height) return { error: `sizes differ: ${A.width}×${A.height} vs ${B.width}×${B.height}` };
      const w = A.width, h = A.height, n = w * h, la = new Float32Array(n), lb = new Float32Array(n);
      let sum = 0, over8 = 0, max = 0;
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        const m = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
        sum += m; if (m > 8) over8++; if (m > max) max = m;
        la[p] = 0.299 * A.data[i] + 0.587 * A.data[i + 1] + 0.114 * A.data[i + 2];
        lb[p] = 0.299 * B.data[i] + 0.587 * B.data[i + 1] + 0.114 * B.data[i + 2];
      }
      const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
      let total = 0, k = 0;
      for (let y = 0; y + 8 <= h; y += 4) for (let x = 0; x + 8 <= w; x += 4) {
        let ma = 0, mb = 0; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { ma += la[(y + j) * w + x + i]; mb += lb[(y + j) * w + x + i]; }
        ma /= 64; mb /= 64;
        let va = 0, vb = 0, cov = 0; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const da = la[(y + j) * w + x + i] - ma, db = lb[(y + j) * w + x + i] - mb; va += da * da; vb += db * db; cov += da * db; }
        va /= 63; vb /= 63; cov /= 63;
        total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); k++;
      }
      return { size: [w, h], ssim: +(total / k).toFixed(4), meanMaxChannel: +(sum / n).toFixed(3), over8: +(over8 / n).toFixed(5), max };
    }, pair));
  }
  await page.close();
  return out;
}

if (process.argv[1] === import.meta.filename) {
  const require = createRequire(path.join(here, '../../../spike-determinism/web/package.json'));
  const { chromium } = require('playwright-core');
  const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const files = process.argv.slice(2), url = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
  const pairs = []; for (let i = 0; i + 1 < files.length; i += 2) pairs.push([url(files[i]), url(files[i + 1])]);
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const out = await compareStills(browser, pairs);
  await browser.close();
  for (const o of out) console.log(JSON.stringify(o));
  process.exit(out.some((o) => o.error) ? 1 : 0);
}
