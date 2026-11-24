// Reads the harness app's output (dialogue-wkwebview.sh), compares every WKWebView run with Node's and writes
// results/m5-dialogue-wkwebview.json. Exit 1 unless all four runs (scheme and loopback, two loading delays) are Node's
// run, with the choice clicked on the overlay's button.
import fs from 'node:fs';
import path from 'node:path';
import { compareDialogue, brief } from './dialogue-compare.mjs';

const [file, out] = process.argv.slice(2);
const node = JSON.parse(fs.readFileSync(path.join(out, 'm5-dialogue-node-run.json'), 'utf8'));
const runs = JSON.parse(fs.readFileSync(file, 'utf8')).map((r) => ({
  origin: r.origin, case: r.case ?? r.query ?? null, delay: r.result?.delay ?? null, timedOut: r.timedOut ?? false, errors: r.errors ?? [],
  clicked: r.result?.dom?.clicked ?? null, focused: r.result?.dom?.focused ?? null,
  ...compareDialogue(node, r.result), result: brief(r.result),
}));
const same = runs.length === 4 && runs.every((r) => r.same && !r.timedOut && r.errors.length === 0 && r.clicked === 'Choice 1 of 3: A latte, please.' && r.focused === 'dialogue-choice-latte');
fs.writeFileSync(path.join(out, 'm5-dialogue-wkwebview.json'), JSON.stringify({ check: 'M5 W3 in WKWebView: the conversation played through the overlay, recorded and replayed, against Node\'s', same, node: brief(node), runs }, null, 1) + '\n');
for (const r of runs) console.log(r.origin, r.delay, r.same ? 'same as Node' : 'DIFFERS', r.result?.final, `replay ${r.result?.replay?.same}`, `clicked ${r.clicked} focused ${r.focused}`, r.problems.join('; '), JSON.stringify(r.errors).slice(0, 300), r.timedOut ? 'TIMED OUT' : '');
process.exit(same ? 0 : 1);
