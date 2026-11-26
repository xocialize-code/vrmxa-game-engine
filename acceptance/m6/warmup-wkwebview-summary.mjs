// AB-A-0335: warmup-wkwebview.sh's runs → acceptance/results/m6-warmup-wkwebview.json: per case (backend, warm-up or
// not, post or not) each run's warm-up and first three frames, and the medians. Exit 1 on an error or a time-out.
//   node acceptance/m6/warmup-wkwebview-summary.mjs <runs dir> <results dir> <cold: 1|0>
// Cold runs: every run, medians (the lower of two). Cached runs (COLD=0, RUNS=2): each case's last run only.
import fs from 'node:fs';
import path from 'node:path';

const [dir, out, cold] = process.argv.slice(2);
const rows = fs.readdirSync(dir).filter((f) => /^run-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4)))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
let bad = false;
const median = (xs) => { const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b); return v.length ? v[(v.length - 1) >> 1] : null; };
const byCase = new Map();
for (const r of rows) {
  const x = r.result ?? {};
  bad ||= !!(r.errors ?? []).length || !!r.timedOut || !!x.error;
  const key = String(r.case).replace(/^mode=warmup&/, '');
  if (!byCase.has(key)) byCase.set(key, []);
  byCase.get(key).push({ origin: r.origin, backend: x.backend, post: x.post, warmUpMs: x.warmUpMs, firstFrameMs: x.firstFrameMs, secondFrameMs: x.secondFrameMs, thirdFrameMs: x.thirdFrameMs, totalToFirstFrameMs: x.totalToFirstFrameMs, buildMs: x.buildMs, meshMaterials: x.meshMaterials, errors: [...(r.errors ?? []), ...(x.error ? [x.error] : [])], timedOut: !!r.timedOut });
}
// cached (cold 0): only each case's last run counts, when every case before it has run at least once without a clear
if (cold !== '1') for (const [k, runs] of byCase) byCase.set(k, runs.slice(-1));
const cases = [...byCase].map(([key, runs]) => ({
  case: key, runs,
  median: Object.fromEntries(['warmUpMs', 'firstFrameMs', 'secondFrameMs', 'totalToFirstFrameMs'].map((k) => [k, median(runs.map((r) => r[k]))])),
}));
for (const c of cases) console.log(c.case.padEnd(36), 'warm-up', String(c.median.warmUpMs ?? '-').padStart(8), 'ms  first frame', String(c.median.firstFrameMs).padStart(8), 'ms  second', String(c.median.secondFrameMs).padStart(6), 'ms', c.runs.some((r) => r.errors.length || r.timedOut) ? 'ERRORS' : '');
const result = { check: 'AB-A-0335: the first frame\'s pipeline compile in WKWebView over loopback, with and without host.warmUp()', cold: cold === '1', ua: rows[0]?.ua ?? null, pass: !bad, cases };
fs.writeFileSync(path.join(out, `m6-warmup-wkwebview${cold === '1' ? '' : '-cached'}.json`), JSON.stringify(result, null, 1) + '\n');
console.log(bad ? 'FAIL' : 'done');
process.exit(bad ? 1 : 0);
