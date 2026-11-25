// M5 W7 (AB-T-0609): layers-wkwebview.sh's rows → results/m5-layers-wkwebview.json: per run (origin, load) the final
// world, the per-step run (as its digest), the walk alone and the restore mid-fade, each compared with Node's
// (results/m5-layers.json), and the scenario's own checks. Exit 1 on an error, a time-out, a failed check or a difference.
//   node acceptance/m5/layers-wkwebview-summary.mjs <wkwebview-shots.json> <results dir>
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { layersPerformed } from '../../apps/playground/src/layers-check.js';

const [file, out] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
const node = JSON.parse(fs.readFileSync(path.join(out, 'm5-layers.json'), 'utf8')).node;
let bad = false;
const runs = rows.map((r) => {
  const x = r.result ?? {};
  const differs = [
    x.final !== node.final && 'the final world', x.walkFinal !== node.walkFinal && 'the walk alone',
    createHash('sha256').update(JSON.stringify(x.run ?? null)).digest('hex') !== node.runDigest && 'the per-step run', x.restored?.final !== node.restored.final && 'the restore',
  ].filter(Boolean);
  const same = !differs.length, ok = !!x.legs && layersPerformed(x);
  console.log(String(r.origin).padEnd(8), String(r.case).padEnd(32), 'final', x.final, same ? 'same as Node' : `DIFFERS FROM NODE (${differs.join(', ')})`, ok ? 'checks pass' : 'CHECKS FAIL', (r.errors ?? []).length ? r.errors.slice(0, 2) : '', r.timedOut ? 'TIMED OUT' : '');
  bad ||= !same || !ok || !!(r.errors ?? []).length || !!r.timedOut;
  return { origin: r.origin, case: r.case, ua: r.ua, final: x.final, walkFinal: x.walkFinal, steps: x.steps, twice: x.twice, restored: x.restored, legs: x.legs, turned: x.turned, endState: x.endState ?? null, sameAsNode: same, errors: r.errors ?? [], timedOut: !!r.timedOut };
});
const result = { check: 'M5 W7: character layers replay exactly, WKWebView scheme and loopback against Node', pass: !bad && runs.length === 4, node: { final: node.final, walkFinal: node.walkFinal, runDigest: node.runDigest, restored: node.restored }, runs };
fs.writeFileSync(path.join(out, 'm5-layers-wkwebview.json'), JSON.stringify(result, null, 1) + '\n');
console.log(result.pass ? 'PASS' : 'FAIL');
process.exit(result.pass ? 0 : 1);
