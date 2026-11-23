// M4 W8 (AB-T-0580): coverage-wkwebview.sh's rows → results/coverage-wkwebview.json. Per run: the origin, the backend,
// the sequence hash, every thumbnail's hash, whether rendering last shot first gave the same pixels, and the 180° lint.
// Then: whether the thumbnails repeat across loads and both origins (per backend), and whether they match Chromium's
// (results/coverage-chromium.json; informational, as a different browser's GPU path may round differently). Exit 1 on
// an error, a time-out, thumbnails that differ from snapshots, a 180° issue, or WebGPU thumbnails that don't repeat.
//   node apps/playground/scripts/coverage-wkwebview-summary.mjs <wkwebview-shots.json> <results dir>
import fs from 'node:fs';
import path from 'node:path';

const [file, out] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
const runs = [];
let bad = false;
for (const r of rows) {
  const x = r.result ?? {};
  const first = r.origin === 'loopback' && !r.case.includes('again');
  const thumbs = (x.thumbs ?? []).map(({ png, ...t }) => {
    if (first) fs.writeFileSync(path.join(out, 'coverage', `wkwebview-${x.backend}-${t.name}.png`), Buffer.from(png.split(',')[1], 'base64'));
    return t;
  });
  if (first && x.strip) fs.writeFileSync(path.join(out, 'coverage', `wkwebview-${x.backend}-strip.png`), Buffer.from(x.strip.split(',')[1], 'base64'));
  runs.push({ origin: r.origin, case: r.case, ua: r.ua, backend: x.backend, sequenceHash: x.sequenceHash, shots: x.shots, sameFromSnapshots: x.sameFromSnapshots, restoredInReverse: x.restoredInReverse, lint: x.lint, thumbs, errors: r.errors ?? [], timedOut: !!r.timedOut });
  console.log(String(r.origin).padEnd(8), String(x.backend).padEnd(6), 'shots', x.shots, 'same from snapshots', x.sameFromSnapshots, 'restored', x.restoredInReverse, '180° issues', x.lint?.issues?.length, 'errors', (r.errors ?? []).length, r.timedOut ? 'TIMED OUT' : '');
  bad ||= !!(r.errors ?? []).length || !!r.timedOut || !x.sameFromSnapshots || !!x.lint?.issues?.length || !thumbs.length;
}
const key = (r) => `${r.sequenceHash}|${r.thumbs.map((t) => t.hash).join(',')}`;
const backends = [...new Set(runs.map((r) => r.backend).filter(Boolean))];
const repeats = Object.fromEntries(backends.map((b) => [b, new Set(runs.filter((r) => r.backend === b).map(key)).size === 1]));
let chromium = null;
try {
  const c = JSON.parse(fs.readFileSync(path.join(out, 'coverage-chromium.json'), 'utf8'));
  chromium = Object.fromEntries(backends.map((b) => {
    const cr = c.runs.find((r) => r.backend === b), wr = runs.find((r) => r.backend === b);
    if (!cr || !wr) return [b, null];
    const same = wr.thumbs.filter((t, i) => t.hash === cr.thumbs[i]?.hash).length;
    return [b, { sequence: cr.sequenceHash === wr.sequenceHash, sameThumbnails: same, of: wr.thumbs.length }];
  }));
} catch { /* no Chromium run to compare with */ }
console.log('repeat across loads and origins', JSON.stringify(repeats), 'against Chromium', JSON.stringify(chromium));
fs.writeFileSync(path.join(out, 'coverage-wkwebview.json'), JSON.stringify({ repeats, chromium, sequenceHashes: [...new Set(runs.map((r) => r.sequenceHash))], runs }, null, 1) + '\n');
process.exitCode = bad || repeats.webgpu === false ? 1 : 0;
