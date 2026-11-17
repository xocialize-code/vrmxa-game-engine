#!/usr/bin/env node
// Runs the suite in Node (V8) and writes JSON. Compare with the browser / WKWebView results.
//   node scripts/node-tests.mjs [--out ../results/node.json] [--parts determinism,snapshot] [--models spec,vroid10]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSuite, MODEL_FILES, CLIP_FILES } from '../src/char/suite.js';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const dir = path.join(web, 'public', 'models');
const read = (f) => { const b = fs.readFileSync(path.join(dir, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const want = opt('--models')?.split(',') ?? Object.keys(MODEL_FILES);
const assets = { models: Object.fromEntries(want.map((k) => [k, read(MODEL_FILES[k])])), clips: Object.fromEntries(Object.entries(CLIP_FILES).map(([k, f]) => [k, read(f)])) };
const parts = opt('--parts')?.split(',');
const t0 = performance.now();
const results = await runSuite({ assets, ...(parts ? { parts } : {}), log: (m) => console.error(`[suite ${((performance.now() - t0) / 1000).toFixed(1)}s] ${m}`) });
const json = JSON.stringify(results, null, 2);
const out = opt('--out');
if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, json); console.error(`[suite] wrote ${out}`); }
else console.log(json);
