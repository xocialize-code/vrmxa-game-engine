#!/usr/bin/env node
// Prints a compact table from one or more results JSON files: hashes and step times side by side.
//   node scripts/summary.mjs results/node.json results/wkwebview-scheme.json ...
import fs from 'node:fs';
const files = process.argv.slice(2);
const rows = [];
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  const label = f.split('/').pop().replace('.json', '');
  for (const [v, x] of Object.entries(r.rapier)) {
    if (x.error) { rows.push({ run: label, variant: v, error: x.error }); continue; }
    rows.push({
      run: label, variant: v,
      'hash full': x.full.hash, 'hash noCloth': x.noCloth.hash,
      repeatable: x.full.repeatable && x.noCloth.repeatable,
      'snapshot ok': x.snapshot.identical && x.snapshotNoCloth.identical,
      'full mean/p95 ms': `${x.timing.full.mean}/${x.timing.full.p95}`,
      'boxes mean/p95 ms': `${x.timing.boxesOnly.mean}/${x.timing.boxesOnly.p95}`, 'boxes all-awake ms': x.timing.boxesOnly.allAwake60,
    });
  }
  if (r.jolt) rows.push({ run: label, variant: 'jolt', 'boxes mean/p95 ms': r.jolt.error ?? `${r.jolt.boxesOnly.mean}/${r.jolt.boxesOnly.p95}`, 'boxes all-awake ms': r.jolt.allAwake60 });
  if (r.joltMT) rows.push({ run: label, variant: 'jolt MT×4', 'boxes mean/p95 ms': r.joltMT.error ?? r.joltMT.skipped ?? `${r.joltMT.boxesOnly.mean}/${r.joltMT.boxesOnly.p95}`, 'boxes all-awake ms': r.joltMT.allAwake60 });
  console.log(`${label}: ${JSON.stringify(r.env)}`);
}
console.table(rows);
