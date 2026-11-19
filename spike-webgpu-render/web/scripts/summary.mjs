// The README's tables from ../results/*.json:  node scripts/summary.mjs [> ../results/summary.json is written too]
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, '../../results');
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } };
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'summary.json');
const out = {};
const row = (...c) => console.log(`| ${c.join(' | ')} |`);

// ---- post costs
console.log('\n## Post costs (median ms per frame, GPU-synced; draw calls per frame)\n');
row('runtime', 'renderer', 'none 1080p', 'none 4K', 'anime 1080p', 'anime 4K', 'anime+LUT 1080p', 'anime+LUT 4K', 'calls none / anime');
row('---', '---', '---', '---', '---', '---', '---', '---', '---');
for (const f of files.filter((x) => /bench/.test(x))) {
  const d = load(f); if (!d?.cost) continue;
  const c = (k) => `${d.cost[k].median} (p90 ${d.cost[k].p90})`;
  const rt = d.runtime === 'wkwebview' ? `WKWebView ${d.wrapper?.origin}` : `Chromium ${d.version ?? ''}`;
  row(rt, `${d.kind} (${d.backend})`, c('none.1080p'), c('none.4k'), c('anime.1080p'), c('anime.4k'), c('animeLut.1080p'), c('animeLut.4k'), `${d.calls['none.1080p'].calls} / ${d.calls['anime.1080p'].calls}`);
  (out.bench ??= {})[f] = { kind: d.kind, cost: d.cost, throughputMs: d.throughputMs, calls: d.calls, passes: d.passes, errors: d.errors.length };
}
console.log('\n## Post costs as throughput (ms per frame: 30 frames back to back, one sync, best of 3)\n');
row('runtime', 'renderer', 'none 1080p', 'none 4K', 'anime 1080p', 'anime 4K', 'anime+LUT 1080p', 'anime+LUT 4K', 'anime − none 1080p / 4K');
row('---', '---', '---', '---', '---', '---', '---', '---', '---');
for (const f of files.filter((x) => /bench/.test(x))) {
  const d = load(f); const t = d?.throughputMs; if (!t) continue;
  const rt = d.runtime === 'wkwebview' ? `WKWebView ${d.wrapper?.origin}` : `Chromium ${d.version ?? ''}`;
  row(rt, d.kind, t['none.1080p'], t['none.4k'], t['anime.1080p'], t['anime.4k'], t['animeLut.1080p'], t['animeLut.4k'], `${(t['anime.1080p'] - t['none.1080p']).toFixed(2)} / ${(t['anime.4k'] - t['none.4k']).toFixed(2)}`);
}

// ---- readback
console.log('\n## Readback (median ms)\n');
row('runtime', 'renderer', 'size', 'render', 'readback after the frame', 'pipelined (export loop)', 'other');
row('---', '---', '---', '---', '---', '---', '---');
for (const f of files.filter((x) => /export/.test(x))) {
  const d = load(f); if (!d?.timing) continue;
  const rt = d.runtime === 'wkwebview' ? `WKWebView ${d.wrapper?.origin}` : 'Chromium';
  for (const t of d.timing) {
    if (!t) continue;
    if (d.kind === 'webgl') row(rt, 'WebGL', t.size, t.renderMs.median, `PBO same frame ${t.pboSameFrameMs.median}`, t.pboPipelinedMs.median, `readPixels sync ${t.readPixelsSyncMs.median}`);
    else row(rt, 'WebGPU', t.size, t.renderMs.median, `mapAsync ${t.mapAsyncAfterFrameMs.median}`, t.pipelinedMs.median, `three readRenderTargetPixelsAsync ${t.threeReadRenderTargetPixelsAsyncMs.median}`);
  }
}

// ---- exports
console.log('\n## Two exports (each with its own renderer and world)\n');
row('runtime', 'renderer', 'size', 'frames', 'identical', 'digest', 'per frame ms (median)', 'no-tick distinct frames of 5');
row('---', '---', '---', '---', '---', '---', '---', '---');
for (const f of files.filter((x) => /export/.test(x))) {
  const d = load(f); if (!d?.exports) continue;
  const rt = d.runtime === 'wkwebview' ? `WKWebView ${d.wrapper?.origin}` : 'Chromium';
  for (const [k, e] of Object.entries(d.exports)) {
    row(rt + (d.firstRendererIsExportA ? ' (export A = first renderer)' : ''), d.kind, k, e.frames, e.identical, e.digest, e.a.perFrameMs.median, d.withoutTick ? `${d.withoutTick.noTick.distinct} (tick: ${d.withoutTick.tick.distinct})` : '–');
    (out.exports ??= {})[`${f}:${k}`] = { identical: e.identical, digest: e.digest, frames: e.frames };
  }
}

// ---- particles
console.log('\n## three.quarks\n');
row('runtime', 'renderer', 'batch renderer', 'headless final', 'rendered final', 'snapshot re-run', 'pixels (second world)', 'diff at 360');
row('---', '---', '---', '---', '---', '---', '---', '---');
for (const f of files.filter((x) => /particles/.test(x))) {
  const d = load(f); if (!d?.rendered) continue;
  const rt = d.runtime === 'wkwebview' ? `WKWebView ${d.wrapper?.origin}` : 'Chromium';
  row(rt, d.kind, d.quarks, d.headless.final, `${d.rendered.final} (${d.rendered.sameAsHeadless ? 'same' : 'DIFFERENT'})`, d.rendered.snapshotRerunMatches, `${d.pixels.second}${d.dummy ? ' (after a warm-up renderer)' : ''}: ${d.pixels.identical ? 'identical' : 'differ'}`, d.diff360 ? `${d.diff360.pixels} px, max Δ ${d.diff360.maxDelta}` : '–');
  (out.particles ??= {})[f] = { final: d.rendered.final, sameAsHeadless: d.rendered.sameAsHeadless, rerun: d.rendered.snapshotRerunMatches, pixels: d.pixels, diff360: d.diff360 };
}

// ---- probes
console.log('\n## WebGPU in the web views\n');
row('runtime', 'origin', 'navigator.gpu', 'backend', 'secure', 'isolated', 'timer ms', 'adapter');
row('---', '---', '---', '---', '---', '---', '---', '---');
for (const f of files.filter((x) => /probe/.test(x))) {
  const d = load(f); if (!d) continue;
  row(d.runtime, d.origin, d.navigatorGpu, d.threeBackend, d.isSecureContext, d.crossOriginIsolated, d.timerResolutionMs, JSON.stringify(d.adapter));
  (out.probes ??= {})[f] = { navigatorGpu: d.navigatorGpu, backend: d.threeBackend, features: d.features, limits: d.limits };
}
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(out, null, 2) + '\n');
