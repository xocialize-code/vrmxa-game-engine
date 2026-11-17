#!/usr/bin/env node
// Prints the comparison tables from one or more results JSON files.
//   node scripts/summary.mjs results/node.json results/wkwebview-scheme.json ...
import fs from 'node:fs';
const files = process.argv.slice(2);
const runs = files.map((f) => ({ label: f.split('/').pop().replace('.json', ''), r: JSON.parse(fs.readFileSync(f, 'utf8')) }));
for (const { label, r } of runs) console.log(`${label}: ${JSON.stringify(r.env)} rapier ${JSON.stringify(r.rapier)}`);

const hashes = [], perf = [], coupled = [];
for (const { label, r } of runs) {
  for (const [k, b] of Object.entries(r.backends)) {
    if (b.error) { perf.push({ run: label, lib: k, error: b.error.slice(0, 80) }); continue; }
    const h = { run: label, lib: k };
    for (const [n, c] of Object.entries(b.crowd)) h[`crowd ${n}`] = c.hash + (c.repeatable ? '' : ' (NOT repeatable)');
    if (b.coupled) for (const key of ['50-sync', '200-sync']) h[`rapier ${key}`] = b.coupled[key].hash + (b.coupled[key].repeatable ? '' : ' (NOT repeatable)');
    hashes.push(h);
    perf.push({
      run: label, lib: k, init: b.initMs,
      'solo bake cold/warm': `${b.bake.solo.coldMs}/${b.bake.solo.warmMedianMs}`,
      'tiled bake cold/warm': `${b.bake.tiled.coldMs}/${b.bake.tiled.warmMedianMs}`,
      polys: `${b.bake.solo.polys}/${b.bake.tiled.polys}`,
      'door close/open p50': `${b.door.closeMs.p50}/${b.door.openMs.p50}`,
      path: b.pathQuery.meanMs,
      ...Object.fromEntries(Object.entries(b.crowd).map(([n, c]) => [`crowd ${n} mean/p95`, `${c.timing.mean}/${c.timing.p95}`])),
    });
    if (b.coupled) for (const [key, c] of Object.entries(b.coupled)) coupled.push({
      run: label, lib: k, key,
      'crowd ms': c.timing.crowd.mean, 'ctrl+physics ms': c.timing.controllersAndPhysics.mean,
      'total mean/p95': `${c.timing.total.mean}/${c.timing.total.p95}`,
      'drift mean/max m': `${c.drift.meanOfMeans}/${c.drift.max}`, resets: c.resets, stuck: c.stuck, navGap: c.maxNavGap, arrivals: c.arrivals,
    });
  }
}
console.log('\nHashes (final positions after 600 steps)'); console.table(hashes);
console.log('\nCost (ms)'); console.table(perf);
console.log('\nCrowd on Rapier character controllers (ms per 60 Hz step)'); console.table(coupled);
