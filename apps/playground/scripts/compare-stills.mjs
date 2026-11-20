// Two stills of the same frame compared pixel by pixel (decoded in headless Chromium, as backendCheck compares in the
// page): the mean of each pixel's largest channel difference, the share of pixels differing by more than 8 levels, and
// the largest difference. Used for WKWebView's stills, whose harness can't hand one page the other's frame.
//   node apps/playground/scripts/compare-stills.mjs a.png b.png   → JSON on stdout
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = import.meta.dirname;
const require = createRequire(path.join(here, '../../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const [a, b] = process.argv.slice(2).map((f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`);
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage();
const out = await page.evaluate(async ([a, b]) => {
  const px = async (url) => { const img = new Image(); img.src = url; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
  const A = await px(a), B = await px(b);
  if (A.width !== B.width || A.height !== B.height) return { error: `sizes differ: ${A.width}×${A.height} vs ${B.width}×${B.height}` };
  let sum = 0, over8 = 0, max = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    const m = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    sum += m; if (m > 8) over8++; if (m > max) max = m;
  }
  const n = A.data.length / 4;
  return { size: [A.width, A.height], meanMaxChannel: +(sum / n).toFixed(3), over8: +(over8 / n).toFixed(5), max };
}, [a, b]);
await browser.close();
console.log(JSON.stringify(out));
process.exit(out.error ? 1 : 0);
