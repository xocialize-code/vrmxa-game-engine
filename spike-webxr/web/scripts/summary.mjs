// Prints a run's rows in a line each: node web/scripts/summary.mjs results/probe/wkwebview.json
import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const r of Array.isArray(rows) ? rows : [rows]) {
  const x = r.result ?? {};
  console.log(`${r.flags ?? ''} ${r.origin ?? ''} ${r.case ?? ''} errors ${(r.errors ?? []).length} warnings ${(r.warnings ?? []).length}${r.timedOut ? ' TIMED OUT' : ''}${r.navError ? ' nav: ' + r.navError : ''}`);
  if (x.page === 'probe') console.log('  ', JSON.stringify({ secure: x.isSecureContext, xr: x.xrType, supported: x.sessionSupported, inline: x.inlineSession, globals: Object.entries(x.globals ?? {}).filter(([, v]) => v !== 'undefined').map(([k]) => k), webgpu: x.webgpu && { adapter: x.webgpu.adapter, xrCompatible: x.webgpu.adapterXrCompatible }, webgl: x.webgl }));
  else console.log('  ', JSON.stringify(x).slice(0, 1500));
  if (r.featuresTurnedOn) console.log('   turned on:', r.featuresTurnedOn.map((f) => `${f.key}=${f.enabled} (default ${f.defaultValue}, status ${f.status})`).join(', '));
  for (const e of (r.errors ?? []).slice(0, 5)) console.log('   error:', e.slice(0, 400));
}
