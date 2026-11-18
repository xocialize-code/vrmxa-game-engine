// Compares every runtime's per-step hashes with Node's and fails loudly, naming the first step and the
// components that differ. Also checks each runtime's in-place snapshot check, and that an injected
// Math.random run (results/*-inject-N.json) diverges from the clean one where the bug starts.
// Writes results/summary.json. Exit code 1 on any unexpected divergence.
import fs from 'node:fs';
import { compareRuns } from '@vrmxg/snapshot';
import { unpack } from './world.js';

const dir = new URL('./results/', import.meta.url);
const load = (n) => JSON.parse(fs.readFileSync(new URL(`${n}.json`, dir), 'utf8'));
const names = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'summary.json').map((f) => f.slice(0, -5)).sort();
const ref = load('node'), refRun = unpack(ref.determinism.run);
const summary = { reference: 'node', steps: refRun.length - 1, components: ref.determinism.run.components.length, final: ref.determinism.final, runtimes: {} };
let failed = false;
for (const n of names) {
  const r = load(n), run = unpack(r.determinism.run);
  const d = compareRuns(refRun, run);
  const s = r.determinism.snapshot;
  const row = { ua: r.ua ?? r.version, final: r.determinism.final, sameAsNode: d === null, firstDivergence: d, snapshotRestore: s.restoredMatchesAtRestore && (r.inject >= 0 || s.restoredRunMatches), captureMs: s.captureMs, restoreMs: s.restoreMs, budget: r.budget };
  summary.runtimes[n] = row;
  if (r.inject >= 0) {
    const want = r.inject + 1;
    const ok = d && d.step === want;
    console.log(`${ok ? '✔' : '✖'} ${n}: a Math.random from step ${r.inject} ${d ? `diverges at step ${d.step} in ${d.component} (${d.components.join(', ')})` : 'went UNNOTICED'}`);
    if (!ok) failed = true;
  } else if (d) {
    console.error(`✖ ${n} DIVERGES from node at step ${d.step} in ${d.component} (${d.components.join(', ')}): ${d.a} vs ${d.b}`);
    failed = true;
  } else console.log(`✔ ${n}: ${run.length - 1} steps × ${r.determinism.run.components.length} components identical to node; final ${r.determinism.final}; snapshot 300 → 600 ${row.snapshotRestore ? 'identical' : 'DIFFERS'}${r.budget ? `; 20 characters ${r.budget.stepMs.mean} ms/step` : ''}`);
  if (!row.snapshotRestore) { console.error(`✖ ${n}: the snapshot restored at step ${s.at} doesn't re-simulate identically: ${JSON.stringify(s.divergence)}`); failed = true; }
}
fs.writeFileSync(new URL('summary.json', dir), JSON.stringify(summary, null, 1) + '\n');
process.exit(failed ? 1 : 0);
