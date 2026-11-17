#!/usr/bin/env node
// Prints the comparison tables from results/*.json:  node scripts/summary.mjs ../results/*.json
import fs from 'node:fs';
import path from 'node:path';
const files = process.argv.slice(2);
const R = Object.fromEntries(files.map((f) => [path.basename(f, '.json'), JSON.parse(fs.readFileSync(f, 'utf8'))]).filter(([, v]) => v.determinism));
const names = Object.keys(R);
console.log('## Hashes after 600 steps (ordered)\n');
console.log(`| Variant | ${names.join(' | ')} | Repeatable in every runtime | Same in every runtime |`);
console.log(`|---|${names.map(() => '---').join('|')}|---|---|`);
const variants = R[names[0]].determinism.map((d) => d.variant);
for (const v of variants) {
  const rows = names.map((n) => R[n].determinism.find((d) => d.variant === v));
  const hs = rows.map((r) => r?.hash600);
  console.log(`| ${v} | ${hs.map((h) => `\`${h}\``).join(' | ')} | ${rows.every((r) => r?.repeatable) ? 'yes' : 'no'} | ${hs.every((h) => h === hs[0]) ? 'yes' : 'no'} |`);
}
console.log('\n## Scrub\n');
for (const n of names) console.log(n, JSON.stringify(R[n].scrub));
console.log('\n## Pixel scrub\n');
for (const n of names) if (R[n].pixelScrub) console.log(n, JSON.stringify(R[n].pixelScrub));
console.log('\n## JSON\n');
for (const n of names) console.log(n, JSON.stringify(R[n].json));
console.log('\n## Step CPU ms (mean / p95), draw calls\n');
console.log(`| Library | Emitters | Live | ${names.map((n) => `${n} step`).join(' | ')} | render (last) | draw calls |`);
console.log(`|---|---|---|${names.map(() => '---').join('|')}|---|---|`);
for (const p of R[names[0]].perf) {
  const cells = names.map((n) => { const q = R[n].perf.find((x) => x.lib === p.lib && x.emitters === p.emitters); return q ? `${q.step.mean} / ${q.step.p95}` : '—'; });
  const last = R[names[names.length - 1]].perf.find((x) => x.lib === p.lib && x.emitters === p.emitters);
  console.log(`| ${p.lib} | ${p.emitters} | ${p.live} | ${cells.join(' | ')} | ${last?.render ? `${last.render.mean} / ${last.render.p95}` : '—'} | ${last?.drawCalls ?? '—'} |`);
}
for (const n of names) console.log(n, R[n].env?.userAgent, 'timer', R[n].env?.timerResolutionMs, 'totalMs', R[n].totalMs, R[n].gl ? JSON.stringify(R[n].gl) : '');
