// Splits the WKWebView harness app's rows (one per case and origin) into one results file per origin.
import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const by = {};
for (const r of rows) {
  if (r.timedOut || r.errors?.length || r.jsError || r.navError) { console.error(`✖ ${r.origin} ${r.case}:`, r.errors ?? r.jsError ?? r.navError ?? 'timed out'); process.exitCode = 1; continue; }
  const inject = r.result.inject ?? -1;
  const name = `wkwebview-${r.origin}${inject >= 0 ? `-inject-${inject}` : ''}`;
  const o = (by[name] ??= { runtime: `wkwebview-${r.origin}`, ua: r.ua, timerRes: r.timerRes, inject, determinism: null, budget: null });
  if (r.result.determinism) o.determinism = r.result.determinism;
  if (r.result.budget) o.budget = r.result.budget;
}
for (const [name, o] of Object.entries(by)) {
  fs.writeFileSync(new URL(`./results/${name}.json`, import.meta.url), JSON.stringify(o) + '\n');
  console.log(name, 'final', o.determinism?.final, 'restore ok', o.determinism?.snapshot.restoredRunMatches, 'budget', JSON.stringify(o.budget?.stepMs ?? null), 'timer', o.timerRes);
}
