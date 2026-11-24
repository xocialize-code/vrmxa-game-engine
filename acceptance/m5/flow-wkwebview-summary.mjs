// Reads the harness app's output (flow-wkwebview.sh), compares every WKWebView run with Node's and writes
// results/m5-flow-wkwebview.json. Exit 1 unless all four runs (scheme and loopback, two loading delays) are Node's run.
import fs from 'node:fs';
import path from 'node:path';
import { compareFlow, brief } from './flow-compare.mjs';

const [file, out] = process.argv.slice(2);
const node = JSON.parse(fs.readFileSync(path.join(out, 'm5-flow-node-run.json'), 'utf8'));
const runs = JSON.parse(fs.readFileSync(file, 'utf8')).map((r) => ({
  origin: r.origin, case: r.case ?? r.query ?? null, delay: r.result?.delay ?? null, timedOut: r.timedOut ?? false, errors: r.errors ?? [],
  ...compareFlow(node, r.result), result: brief(r.result),
}));
const same = runs.length === 4 && runs.every((r) => r.same && !r.timedOut && r.errors.length === 0);
fs.writeFileSync(path.join(out, 'm5-flow-wkwebview.json'), JSON.stringify({ check: 'M5 W2 in WKWebView: the game flow run, the save and the checkpoint against Node\'s', same, node: brief(node), runs }, null, 1) + '\n');
for (const r of runs) console.log(r.origin, r.delay, r.same ? 'same as Node' : 'DIFFERS', r.result?.final, `save ${r.result?.save?.same} checkpoint ${r.result?.checkpoint?.same}`, r.problems.join('; '), JSON.stringify(r.errors).slice(0, 300), r.timedOut ? 'TIMED OUT' : '');
process.exit(same ? 0 : 1);
