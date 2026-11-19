// The spike page in Chromium (Chrome for Testing, the same binary acceptance/chromium.mjs uses), WebGPU on.
//   node scripts/chromium.mjs '<query>' [name]     against the dev server (npm run dev, :5241); or SPIKE_BASE=<url>
// Prints the result; with a name, writes ../results/chromium-<name>.json and the page's shots into ../shots/.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = import.meta.dirname;
const require = createRequire(path.join(here, '../../../spike-determinism/web/package.json'));
const { chromium } = require('playwright-core');
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const [query = 'mode=probe', name] = process.argv.slice(2);
const base = process.env.SPIKE_BASE ?? 'http://127.0.0.1:5241/';
const headless = process.env.HEADED !== '1';
const browser = await chromium.launch({ executablePath: exe, headless, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const lines = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') lines.push(`${m.type()}: ${m.text()}`.slice(0, 500)); });
page.on('pageerror', (e) => lines.push(`pageerror: ${e.message}`));
await page.goto(`${base}?${query}`);
await page.waitForFunction(() => window.READY === true, null, { timeout: +(process.env.SPIKE_TIMEOUT ?? 600) * 1000 });
const out = await page.evaluate(() => ({ result: window.__result, shots: window.__shots }));
const version = browser.version();
await browser.close();
const result = { runtime: 'chromium', version, headless, ...out.result, console: lines.slice(0, 40) };
if (name) {
  fs.writeFileSync(path.join(here, `../../results/chromium-${name}.json`), JSON.stringify(result, null, 2) + '\n');
  for (const s of out.shots ?? []) fs.writeFileSync(path.join(here, `../../shots/chromium-${s.name}.png`), Buffer.from(s.dataUrl.split(',')[1], 'base64'));
}
console.log(JSON.stringify(result, null, 1).slice(0, 6000));
