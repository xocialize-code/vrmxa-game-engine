#!/usr/bin/env node
// Runs the spike's suite in Node (V8) and prints the JSON. Compare the hashes with the ones the page
// reports in the WKWebView wrapper (JavaScriptCore).
//   node scripts/node-tests.mjs [--out results/node.json] [--only recast|navcat] [--no-rapier]
import fs from 'node:fs';
import path from 'node:path';
import { runSuite } from '../src/sim/tests.js';

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const out = arg('--out');
const only = arg('--only');
const results = await runSuite({
  backends: only ? [only] : ['recast', 'navcat'],
  rapier: !args.includes('--no-rapier'),
  log: (m) => console.error(`[suite] ${m}`),
});
const json = JSON.stringify(results, null, 2);
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, json);
  console.error(`[suite] wrote ${out}`);
}
console.log(json);
