// M4 W9 (AB-T-0581): takes-wkwebview.sh's rows → results/m4-takes-wkwebview.json: per run (origin, load) each take's
// tracks, the film's text, the final world hash, the per-step run and the restore inside a take, each compared with
// Node's (results/m4-takes.json; the run as its digest). Exit 1 on an error, a time-out, a failed check or a difference.
//   node acceptance/m4/takes-wkwebview-summary.mjs <wkwebview-shots.json> <results dir>
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { takesPerformed } from '../../apps/playground/src/takes-check.js';

const [file, out] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
const node = JSON.parse(fs.readFileSync(path.join(out, 'm4-takes.json'), 'utf8')).node;
let bad = false;
const takeLines = (ts) => (ts ?? []).map((t) => `${t.id} ${t.kind} ${t.target} ${t.start}-${t.end} log ${t.log} tracks ${t.tracksHash} [${(t.tracks ?? []).join(',')}] cast ${(t.cast ?? []).join(',')}`);
const runs = rows.map((r) => {
  const x = r.result ?? {};
  // the harness hands results on through a dictionary, so objects are compared by their values, not their key order
  const differs = [
    takeLines(x.takes).join('|') !== takeLines(node.takes).join('|') && 'the takes\' tracks', x.filmHash !== node.filmHash && 'the film\'s text', x.final !== node.final && 'the final world',
    createHash('sha256').update(JSON.stringify(x.run ?? null)).digest('hex') !== node.runDigest && 'the per-step run', x.restored?.final !== node.restored.final && 'the restore',
  ].filter(Boolean);
  const same = !differs.length;
  const ok = !!x.performed && takesPerformed(x);
  console.log(String(r.origin).padEnd(8), r.case.padEnd(34), 'film', x.filmHash, 'final', x.final, same ? 'same as Node' : `DIFFERS FROM NODE (${differs.join(', ')})`, ok ? 'checks pass' : 'CHECKS FAIL', (r.errors ?? []).length ? r.errors.slice(0, 2) : '', r.timedOut ? 'TIMED OUT' : '');
  bad ||= !same || !ok || !!(r.errors ?? []).length || !!r.timedOut;
  return { origin: r.origin, case: r.case, ua: r.ua, takes: takeLines(x.takes), filmHash: x.filmHash, final: x.final, steps: x.steps, twice: x.twice, restored: x.restored, performed: x.performed, sameAsNode: same, errors: r.errors ?? [], timedOut: !!r.timedOut };
});
const result = { check: 'M4 check 5: each take kind replays exactly from its log, WKWebView scheme and loopback against Node', pass: !bad && runs.length === 4, node: { takes: takeLines(node.takes), filmHash: node.filmHash, final: node.final, runDigest: node.runDigest }, runs };
fs.writeFileSync(path.join(out, 'm4-takes-wkwebview.json'), JSON.stringify(result, null, 1) + '\n');
console.log(result.pass ? 'PASS' : 'FAIL');
process.exit(result.pass ? 0 : 1);
