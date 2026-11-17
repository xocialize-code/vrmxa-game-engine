// Headless Chromium (Playwright's cached build) over the dev server on 5245: one screenshot + JSON per case.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const cases = process.argv.slice(2).length ? process.argv.slice(2) : [
  'pipe=none', 'pipe=builtin', 'pipe=three', 'pipe=pmndrs',
  'pipe=pmndrs&fx=dof,bloom,vig,ca,grain,lut', 'pipe=pmndrs&mtoonOutline=0.004&fx=dof,bloom,vig,ca,grain,lut',
  'pipe=pmndrs&edges=1&mtoonOutline=0&fx=dof,bloom,vig,ca,grain,lut', 'pipe=pmndrs&edges=1&mtoonOutline=0.004&fx=dof,bloom,vig,ca,grain,lut',
  'pipe=pmndrs&speed=1&fx=dof', 'pipe=pmndrs&w=1920&h=1080', 'pipe=three&w=1920&h=1080', 'pipe=none&w=1920&h=1080',
];
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
fs.mkdirSync('shots', { recursive: true }); fs.mkdirSync('results', { recursive: true });
const all = [];
for (const c of cases) {
  const w = +(new URLSearchParams(c).get('w') || 1280), h = +(new URLSearchParams(c).get('h') || 720);
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:5245/?${c}`);
  try { await page.waitForFunction('window.READY === true', null, { timeout: 120000 }); } catch (e) { logs.push('TIMEOUT'); }
  const r = await page.evaluate('window.__result');
  const name = c.replace(/[=&,.]/g, '_');
  await page.screenshot({ path: `shots/${name}.png` });
  all.push({ case: c, result: r, logs: logs.filter((l) => !l.startsWith('log: [vite]')).slice(0, 12) });
  console.log(c, '→', r ? `${r.msMedian} ms median, p90 ${r.msP90}, calls ${r.drawCalls}, errors ${r.errors.length}` : 'NO RESULT', r?.glRenderer ?? '');
  await page.close();
}
fs.writeFileSync('results/shots.json', JSON.stringify(all, null, 2));
await browser.close();
