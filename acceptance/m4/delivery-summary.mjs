// M4 W10 (AB-T-0582): one table of every delivery run in results/m4-delivery/ (acceptance/m4/delivery-wkwebview.sh):
// per run file, the short, preset, backend, origin, each job's film time and per-frame costs, the delivery's total,
// the frame digests and what the runs agreed on. Writes results/m4-delivery/summary.json and prints the table.
//   node acceptance/m4/delivery-summary.mjs
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, '../results/m4-delivery');
const rows = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'summary.json').sort()) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const jobs = r.jobs.map((j, i) => {
    const x = j.result ?? {}, m = r.manifests.find((mm) => mm.film?.path && x.path?.endsWith(mm.film.path.split('/').pop())) ?? r.manifests[i] ?? null;
    return { state: j.state, error: j.error ?? null, frames: x.frames ?? null, filmS: x.ms ? +(x.ms / 1000).toFixed(1) : null, perFrameMs: m?.film?.perFrameMs ?? null,
      totalS: x.delivery ? +(x.delivery.ms.total / 1000).toFixed(1) : null, frameDigest: x.hashesDigest ?? null, audio: x.audioHash ?? null, check: x.check ? { frames: x.check.frames, odd: x.check.odd.length } : null,
      extras: x.delivery ? { stills: x.delivery.stills, thumbnails: x.delivery.thumbnails, turntables: x.delivery.turntables } : null };
  });
  rows.push({ file: f, short: r.short, preset: r.preset, backend: r.backend, jobBackend: r.jobs[0]?.label?.includes('· WebGL') ? 'webgl' : null, origin: r.origin, check: r.check, seconds: r.seconds, jobs, same: r.same });
}
const films = rows.flatMap((r) => r.jobs.filter((j) => j.state === 'done').map((j) => ({ ...j, backend: r.jobBackend ?? r.backend })));
const comparisons = rows.filter((r) => r.same.runs > 1);
const summary = {
  format: 'vrmxg-delivery-summary', version: 1, runs: rows.length,
  films: { total: films.length, webgpu: films.filter((f) => f.backend === 'webgpu').length, webgl: films.filter((f) => f.backend === 'webgl').length, failed: rows.flatMap((r) => r.jobs).filter((j) => j.state !== 'done').length },
  pairs: { total: comparisons.length, framesSame: comparisons.filter((r) => r.same.frames).length, odd: comparisons.filter((r) => !r.same.frames).map((r) => ({ file: r.file, frameDiffs: r.same.frameDiffs ?? null })),
    audioSame: comparisons.filter((r) => r.same.audio).length, stillsSame: comparisons.filter((r) => r.same.stills !== false).length, turntablesSame: comparisons.filter((r) => r.same.turntables !== false).length },
  rows,
};
fs.writeFileSync(path.join(dir, 'summary.json'), `${JSON.stringify(summary, null, 1)}\n`);
for (const r of rows) for (const [i, j] of r.jobs.entries()) console.log([r.file.replace('-loopback.json', '').padEnd(46), `job${i + 1}`, j.state, j.frames, `${j.filmS}s`, j.perFrameMs ? `${j.perFrameMs.total}ms/f` : '', j.totalS ? `delivery ${j.totalS}s` : '', j.frameDigest, j.check ? `check ${j.check.odd} odd` : ''].join(' '));
console.log(JSON.stringify({ films: summary.films, pairs: { ...summary.pairs } }));
