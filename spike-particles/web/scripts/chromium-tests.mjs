#!/usr/bin/env node
// Runs the suite in headless Chromium (V8, Playwright's cached build, ANGLE Metal) against a Vite dev
// server it starts on 5243, and writes the JSON. Added 2026-11-17 for AB-T-0500 (the original spike
// ran Node and WKWebView only).
//   node scripts/chromium-tests.mjs [--out ../results/chromium.json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createRequire } from 'node:module';

// playwright-core is not a dependency of this spike: borrow spike-determinism's copy.
const { chromium } = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../spike-determinism/web/x.js'))('playwright-core');
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const out = opt('--out') ?? path.join(web, '../results/chromium.json');
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const server = await createServer({ root: web, configFile: path.join(web, 'vite.config.js'), logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  // 'commit': the suite starts during load and keeps the main thread busy, so 'load' can arrive late.
  await page.goto('http://127.0.0.1:5243/?autorun=1', { waitUntil: 'commit', timeout: 120000 });
  const t0 = Date.now();
  for (;;) {
    const done = await page.evaluate(() => !!window.__spikeResults).catch(() => false);
    if (done) break;
    if (Date.now() - t0 > 900000) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 1000));
  }
  const r = await page.evaluate(() => window.__spikeResults);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(r, null, 2));
  console.error(`[chromium] wrote ${out}`);
} finally { await browser.close(); await server.close(); }
