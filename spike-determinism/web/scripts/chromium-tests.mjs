#!/usr/bin/env node
// Runs the suite in headless Chromium (V8, Playwright's bundled build) against a Vite dev server
// on 127.0.0.1:5241 that this script starts, and writes the JSON. Also screenshots the viewer.
//   node scripts/chromium-tests.mjs [--out ../results/chromium.json] [--query 'parts=determinism'] [--shots ../shots]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const out = opt('--out') ?? path.join(web, '../results/chromium.json');
const query = opt('--query');
const shots = opt('--shots');

const server = await createServer({ root: web, configFile: path.join(web, 'vite.config.js'), logLevel: 'warn' });
await server.listen();
const base = 'http://127.0.0.1:5241/';
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[page] ${m.text()}`); });
  const t0 = Date.now();
  let seen = 0;
  await page.goto(`${base}?autorun=1${query ? `&${query}` : ''}`);
  console.error(`[chromium] ${await browser.version()}`);
  for (;;) {
    const st = await page.evaluate(() => ({ done: !!window.__spikeDone, err: window.__spikeError ?? null, log: [...document.querySelectorAll('.log li')].map((l) => l.textContent) }));
    for (const l of st.log.slice(seen)) console.error(`[suite ${((Date.now() - t0) / 1000).toFixed(1)}s] ${l}`);
    seen = st.log.length;
    if (st.err) throw new Error(st.err);
    if (st.done) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const r = await page.evaluate(() => window.__spikeResults);
  r.env.browserVersion = await browser.version();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(r, null, 2));
  console.error(`[chromium] wrote ${out}`);
  if (shots) {
    fs.mkdirSync(shots, { recursive: true });
    for (const model of ['spec', 'vroid10', 'vroid0x', 'seed']) {
      await page.setViewportSize({ width: 960, height: 640 });
      await page.goto(`${base}?model=${model}`);
      await page.waitForFunction(() => window.__viewer && window.__viewer.ch && window.__viewer.ch.k > 200, null, { timeout: 30000 });
      const file = path.join(shots, `viewer-${model}.png`);
      await page.screenshot({ path: file });
      console.error(`[chromium] ${file}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
