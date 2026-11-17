#!/usr/bin/env node
// Runs the spike's test suite in Node (V8) and prints the JSON. Compare the hashes with the ones
// the page reports in a browser and in the WKWebView wrapper (JavaScriptCore).
//   node scripts/node-tests.mjs [--out results/node.json] [--no-jolt]
import fs from 'node:fs';
import path from 'node:path';
import { runSuite } from '../src/sim/tests.js';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : null;
const results = await runSuite({ jolt: !args.includes('--no-jolt'), log: (m) => console.error(`[suite] ${m}`) });
const json = JSON.stringify(results, null, 2);
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, json);
  console.error(`[suite] wrote ${out}`);
}
console.log(json);
