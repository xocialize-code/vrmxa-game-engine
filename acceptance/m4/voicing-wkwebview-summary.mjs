// M4 W7 (AB-T-0579): voicing-wkwebview.sh's rows → results/m4-voicing-wkwebview.json: per run (origin, load) the final
// world hash, the mouths' hash, the per-step run and the mid-line restore, each compared with Node's
// (results/m4-voicing.json; the run as its digest). Exit 1 on an error, a time-out, a failed check or a hash that differs.
//   node acceptance/m4/voicing-wkwebview-summary.mjs <wkwebview-shots.json> <results dir>
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const [file, out] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
const node = JSON.parse(fs.readFileSync(path.join(out, 'm4-voicing.json'), 'utf8')).node;
let bad = false;
const runs = rows.map((r) => {
  const x = r.result ?? {};
  const same = x.final === node.final && x.mouthHash === node.mouthHash && createHash('sha256').update(JSON.stringify(x.run ?? null)).digest('hex') === node.runDigest && x.restored?.final === node.restored.final;
  const ok = x.everyLineBaked && x.inTheirVoices && x.leftToVoice === 0 && x.playsFromTrack && x.everyLineSpoken && x.restored?.same && x.restored?.mouthsSame;
  console.log(String(r.origin).padEnd(8), r.case.padEnd(36), 'final', x.final, 'mouths', x.mouthHash, same ? 'same as Node' : 'DIFFERS FROM NODE', ok ? 'checks pass' : 'CHECKS FAIL', (r.errors ?? []).length ? r.errors.slice(0, 2) : '', r.timedOut ? 'TIMED OUT' : '');
  bad ||= !same || !ok || !!(r.errors ?? []).length || !!r.timedOut;
  return { origin: r.origin, case: r.case, ua: r.ua, final: x.final, mouthHash: x.mouthHash, steps: x.steps, restored: x.restored, everyLineBaked: x.everyLineBaked, inTheirVoices: x.inTheirVoices, playsFromTrack: x.playsFromTrack, everyLineSpoken: x.everyLineSpoken, sameAsNode: same, errors: r.errors ?? [], timedOut: !!r.timedOut };
});
const result = { check: 'M4 check 3: replay from the baked track, WKWebView scheme and loopback against Node', pass: !bad && runs.length === 4, node: { final: node.final, mouthHash: node.mouthHash }, runs };
fs.writeFileSync(path.join(out, 'm4-voicing-wkwebview.json'), JSON.stringify(result, null, 1) + '\n');
console.log(result.pass ? 'PASS' : 'FAIL');
process.exit(result.pass ? 0 : 1);
