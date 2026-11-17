#!/usr/bin/env node
// Compares result files from different runtimes and prints Markdown tables.
//   node scripts/compare.mjs ../results/node.json ../results/chromium.json ../results/wkwebview-scheme.json ...
import fs from 'node:fs';

const files = process.argv.slice(2);
const runs = files.map((f) => ({ name: f.split('/').pop().replace('.json', ''), r: JSON.parse(fs.readFileSync(f, 'utf8')) }));
const COMPS = ['norm', 'bones', 'springs', 'expr'];
const fromB64 = (s) => { const b = Buffer.from(s, 'base64'); return new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8); };
const ulps = (a, b) => {
  if (Object.is(a, b)) return 0n;
  const f = new Float64Array([a, b]), i = new BigInt64Array(f.buffer);
  const d = i[0] - i[1];
  return d < 0n ? -d : d;
};
const table = (head, rows) => { console.log(`| ${head.join(' | ')} |`); console.log(`|${head.map(() => '---').join('|')}|`); for (const r of rows) console.log(`| ${r.join(' | ')} |`); console.log(); };

for (const { name, r } of runs) console.log(`- **${name}**: ${r.env.runtime}${r.env.browserVersion ? ` (Chromium ${r.env.browserVersion})` : ''}, origin ${r.env.origin}, timer ${r.env.timerResolutionMs} ms`);
console.log();

// ------------------------------------------------ math fingerprint
const ref = runs[0];
if (ref.r.mathFingerprint) {
  console.log('### Math fingerprint (2000 inputs per function; inputs that differ from the first file, max ulp)\n');
  const head = ['function', ...runs.slice(1).map((x) => x.name)];
  const rows = [];
  for (const fn of Object.keys(ref.r.mathFingerprint)) {
    const a = fromB64(ref.r.mathFingerprint[fn].values);
    rows.push([fn, ...runs.slice(1).map(({ r }) => {
      const e = r.mathFingerprint?.[fn];
      if (!e) return '—';
      const b = fromB64(e.values);
      let n = 0, mx = 0n;
      for (let i = 0; i < a.length; i++) { const u = ulps(a[i], b[i]); if (u) { n++; if (u > mx) mx = u; } }
      return n ? `**${n}** (≤${mx} ulp)` : 'same';
    })]);
  }
  table(head, rows);
}

// ------------------------------------------------ per-step state hashes
const firstDiff = (A, B) => { for (let i = 0; i < A.length / 8; i++) if (A.substr(i * 8, 8) !== B.substr(i * 8, 8)) return i + 1; return null; };
if (ref.r.models) {
  console.log('### Per-step state hashes across runtimes (first step where any runtime differs from the first file, per component; "same" = all 600 steps identical everywhere)\n');
  const rows = [];
  for (const [model, m] of Object.entries(ref.r.models)) {
    for (const [mode, y] of Object.entries(m.modes)) {
      for (const sc of ['mixer', 'springs', 'full', 'timeline']) {
        const cells = COMPS.map((c) => {
          let first = null;
          for (const { r } of runs.slice(1)) {
            const B = r.models?.[model]?.modes?.[mode]?.[sc]?.perStep?.[c];
            if (!B) continue;
            const d = firstDiff(y[sc].perStep[c], B);
            if (d !== null && (first === null || d < first)) first = d;
          }
          return first === null ? 'same' : `**${first}**`;
        });
        const finals = runs.map(({ r }) => r.models?.[model]?.modes?.[mode]?.[sc]?.final);
        rows.push([model, mode, sc, ...cells, new Set(finals).size === 1 ? 'yes' : 'no']);
      }
    }
  }
  table(['model', 'mode', 'scenario', 'normalized pose', 'bone world matrices', 'spring tails', 'expressions + lookAt', 'final hash equal'], rows);

  console.log('### Repeatability within each runtime (full scenario, two fresh runs, every step)\n');
  const rrows = [];
  for (const { name, r } of runs) for (const [model, m] of Object.entries(r.models ?? {})) rrows.push([name, model, ...Object.entries(m.modes).map(([mode, y]) => `${mode}: ${y.repeatable}`)]);
  table(['runtime', 'model', 'native', 'dmath', 'nlerp'], rrows);

  console.log('### Size of the native divergence (max |difference| vs the first file)\n');
  const mrows = [];
  for (const { name, r } of runs.slice(1)) {
    for (const model of Object.keys(ref.r.models)) {
      for (const sc of ['mixer', 'full']) {
        for (const at of ['state450', 'finalState']) {
          const A = ref.r.models[model].modes.native[sc][at], B = r.models?.[model]?.modes?.native?.[sc]?.[at];
          if (!A || !B) continue;
          const cell = (c) => { const a = fromB64(A[c]), b = fromB64(B[c]); let mx = 0, mu = 0n; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > mx) mx = d; const u = ulps(a[i], b[i]); if (u > mu) mu = u; } return mx === 0 ? '0' : `${mx.toExponential(1)} (${mu} ulp)`; };
          mrows.push([name, model, sc, at === 'state450' ? 450 : 600, cell('bones'), cell('springs'), cell('expr')]);
        }
      }
    }
  }
  table(['vs', 'model', 'scenario', 'step', 'bone matrices', 'spring tails', 'expressions'], mrows);
}

if (ref.r.models) {
  const info = Object.entries(ref.r.models).map(([k, m]) => [k, m.info.metaVersion, m.info.bones, m.info.springJoints, m.info.colliders, m.info.constraints, m.info.lookAtType, m.info.expressions]);
  console.log('### Models\n');
  table(['model', 'VRM', 'bones', 'spring joints', 'colliders', 'constraints', 'lookAt', 'expressions'], info);
}

// ------------------------------------------------ slerp branches, cadence, snapshot
for (const { name, r } of runs) {
  if (r.slerpBranches && name === ref.name) console.log(`slerpFlat calls in the mixer scenario (${name}): ${JSON.stringify(r.slerpBranches)}\n`);
}
const crow = [];
for (const { name, r } of runs) for (const [model, c] of Object.entries(r.cadence ?? {})) crow.push([name, model, c.everyMatchesNone, c.fps24MatchesNone]);
if (crow.length) { console.log('### Render cadence (does calling scene.updateMatrixWorld between steps change the simulation?)\n'); table(['runtime', 'model', '60 Hz render = no render', '24 fps render = no render'], crow); }

const srow = [];
for (const { name, r } of runs) {
  for (const [key, s] of Object.entries(r.snapshot ?? {})) {
    for (const [n, c] of Object.entries(s.cases)) srow.push([name, key, n, c.sameInstanceScrub, c.freshFullRestore, c.freshTrsRestore, c.freshSpringsAndRootOnly ? 'true' : `false (step ${c.freshSpringsAndRootOnlyFirstDiff})`, c.freshWithoutSprings ? 'true' : `false (step ${c.freshWithoutSpringsFirstDiff})`, `${(s.bytes.full / 1024).toFixed(0)} / ${(s.bytes.trs / 1024).toFixed(0)} KB`, s.takeMs, s.restoreMs]);
  }
}
if (srow.length) { console.log('### Snapshot / restore (every step after the restore point compared with the straight run)\n'); table(['runtime', 'model/driver', 'from step', 'same instance', 'fresh, full', 'fresh, TRS only', 'fresh, root+springs+mixer', 'fresh, no springs', 'size full / TRS', 'take ms', 'restore ms'], srow); }

// ------------------------------------------------ timing
const trow = [];
for (const { name, r } of runs) for (const t of r.timing ?? []) trow.push(t.error ? [name, t.model, t.n, t.mode, t.error, '', '', '', ''] : [name, t.model, t.springJoints, t.n, t.mode, t.wallMsPerStep ?? '—', `${t.sim.mean} / ${t.sim.p95}`, t.simPerCharMs, `${t.matrices.mean} / ${t.matrices.p95}`]);
if (trow.length) { console.log('### Step time (ms): sim = all characters\' driver + mixer.update + vrm.update; matrices = updateMatrixWorld + skeleton.update; wall = both, one interval over 600 steps\n'); table(['runtime', 'model', 'springs', 'N', 'mode', 'wall per step', 'sim mean / p95', 'sim per char', 'matrices mean / p95'], trow); }

const urow = [];
for (const { name, r } of runs) if (r.micro) for (const [fn, v] of Object.entries(r.micro)) urow.push([name, fn, v.nativeNs, v.dmathNs]);
if (urow.length) { console.log('### dmath microbenchmark (ns per call)\n'); table(['runtime', 'function', 'native', 'dmath'], urow); }
