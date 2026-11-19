// Gathers ../results/*.json into ../results/summary.json: title-card hashes per library and runtime (both runs),
// frame cost, the Japanese font build and HarfBuzz. node scripts/summary.mjs
import fs from 'node:fs';
import path from 'node:path';
const dir = path.join(import.meta.dirname, '../../results');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'summary.json');
const R = Object.fromEntries(files.map((f) => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]));
const runtimeOf = (k) => (k.startsWith('chromium') ? 'chromium' : k.includes('-scheme-') ? 'wkwebview-scheme' : 'wkwebview-loopback');
const runOf = (k) => (k.endsWith('-run2') ? 2 : 1);

const title = {};
for (const [k, r] of Object.entries(R)) {
  if (r.mode !== 'title' || r.failed) continue;
  const t = (title[r.tag] ??= {});
  t[`${runtimeOf(k)} run${runOf(k)}`] = { hash: r.hash, inPageRepeatable: r.repeatable, atlas: r.runs?.[0]?.atlasHash };
}
for (const t of Object.values(title)) {
  const hs = Object.values(t).map((x) => x.hash);
  t.identicalEverywhere = hs.every((h) => h === hs[0]) && Object.values(t).every((x) => x.inPageRepeatable);
}

const bench = {};
for (const [k, r] of Object.entries(R)) {
  if (r.mode !== 'bench' || r.failed) continue;
  const lib = r.lib + (r.query?.includes('wght=100') ? '-w100' : '');
  for (const c of r.cases) {
    ((bench[`${c.name} ${c.size}`] ??= {})[lib] ??= {})[runtimeOf(k)] = { textMsBackToBack: c.backToBack.textMs, textMsSynced: c.synced.textMs, timerQueryMs: c.timerQuery?.textMs ?? null, quads: c.quads };
  }
}

const font = {};
for (const [k, r] of Object.entries(R)) {
  if (r.mode !== 'font' || r.failed) continue;
  font.file ??= r.font;
  (font[r.lib] ??= {})[runtimeOf(k)] = { slug: r.slug, hbslug: r.hbslug, troika: r.troika, sampleHash: r.sample.hash, sampleMissing: r.sample.info.missingGlyphs ?? 0 };
}

const hb = {};
for (const [k, r] of Object.entries(R)) {
  if (r.mode !== 'hb' || r.failed) continue;
  hb[`${runtimeOf(k)} run${runOf(k)}`] = { env: r.env, wasmMs: r.wasmMs, shape2000Ms: r.shape2000.ms.median, hash: r.shape2000.hash, kerning: [r.kerning.withKern, r.kerning.withoutKern], palt: [r.palt.defaultAdvance, r.palt.paltAdvance], verticalSubstituted: r.vertical.substituted, wghtAdvances: Object.fromEntries(Object.entries(r.variations).map(([w, v]) => [w, v.advance])) };
}
const failed = Object.entries(R).filter(([, r]) => r.failed || r.errors?.length).map(([k, r]) => ({ k, failed: r.failed, errors: r.errors }));
const summary = { title, bench, font, hb, failed, files: files.length };
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 1) + '\n');
console.log(JSON.stringify({ title: Object.fromEntries(Object.entries(title).map(([k, v]) => [k, [v.identicalEverywhere, Object.values(v)[0].hash, Object.keys(v).length - 1]])), failed }, null, 1));
for (const [c, libs] of Object.entries(bench)) for (const [l, rt] of Object.entries(libs)) console.log(c.padEnd(22), l.padEnd(11), Object.entries(rt).map(([r, v]) => `${r} ${v.textMsBackToBack}/${v.textMsSynced}`).join('  '));
