// The harness in Node: the determinism case (and, with --inject N, the same with a Math.random bug from
// step N) and the budget case. Writes results/node*.json.
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { loadRapier } from '@vrmxg/physics';
import { loadAssets, runDeterminism, runBudget } from './world.js';
import { files } from './files-node.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const inject = arg('--inject') === null ? -1 : Number(arg('--inject'));
const R = await loadRapier();
const assets = await loadAssets(files);
const now = () => performance.now();
const det = await runDeterminism(R, assets, { now, inject });
const out = { runtime: 'node', version: process.version, inject, determinism: det, budget: inject < 0 ? await runBudget(R, assets, { now }) : null };
const name = inject < 0 ? 'node' : `node-inject-${inject}`;
fs.writeFileSync(new URL(`./results/${name}.json`, import.meta.url), JSON.stringify(out) + '\n');
console.log(JSON.stringify({ name, final: det.final, snapshot: det.snapshot, world: det.world, budget: out.budget }, null, 1));
