#!/usr/bin/env node
// Compares the per-frame SHA-256 (of the raw readPixels bytes, taken in Swift before any conversion) across
// runs, and the encoded files across two encodes. Writes results/determinism-summary.json.
//   node tools/determinism.mjs <container-out-dir>
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const R = (n) => JSON.parse(fs.readFileSync(path.join(dir, 'results', n), 'utf8'));
const runs = { 'run 1': R('determinism-scheme.json'), 'run 2 (new process)': R('determinism-2-scheme.json'), 'run 3 (loopback origin)': R('determinism-loopback.json') };
const ref = runs['run 1'].a.swift.hashes;
const same = (x, y) => x.length === y.length && x.every((h, i) => h === y[i]);
const count = (x, y) => x.filter((h, i) => h === y[i]).length;
const out = { frames: ref.length, comparisons: [] };
const cmp = (label, hashes, against = ref, note) => out.comparisons.push({ label, identical: same(hashes, against), matchingFrames: count(hashes, against), of: against.length, note });

for (const [name, r] of Object.entries(runs)) {
  cmp(`${name}: pass A`, r.a.swift.hashes);
  cmp(`${name}: pass B (same page, after reset())`, r.b.swift.hashes);
  cmp(`${name}: PBO readback`, r.pbo.swift.hashes);
  const sparseFrames = r.sparse.swift.hashFrames;
  cmp(`${name}: simulate all, render only ${sparseFrames.join('/')}`, r.sparse.swift.hashes, sparseFrames.map((n) => ref[n]));
  cmp(`${name}: 60 fps run, even frames vs 30 fps`, r.fps60.swift.hashes.filter((_, i) => i % 2 === 0), ref);
  cmp(`${name}: 4K, 60 frames vs run 1`, r.uhd.swift.hashes, runs['run 1'].uhd.swift.hashes);
}
// Distinct frames: is the content actually changing (a frozen scene would trivially "match")?
out.distinctFramesInRun1 = new Set(ref).size;

// Encoded output: same input frames, two encodes each.
const vids = path.join(dir, 'videos');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);
const framemd5 = (f) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-map', '0:v:0', '-f', 'framemd5', '-'], { maxBuffer: 1 << 26 }).toString()
  .split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').pop().trim());
out.encodes = [];
for (const r of [runs['run 3 (loopback origin)']]) { // the last run's files (runs share file names)
  for (const codec of ['h264', 'hevc', 'prores4444']) {
    const [a, b] = ['a', 'b'].map((t) => r.enc.find((e) => e.name === `det-enc-${codec}-${t}`));
    const fa = a.swift.file.split('/').pop(), fb = b.swift.file.split('/').pop();
    const pa = path.join(vids, fa), pb = path.join(vids, fb);
    const ma = framemd5(pa), mb = framemd5(pb);
    out.encodes.push({ codec, inputFramesIdentical: same(a.swift.hashes, b.swift.hashes), fileBytes: [fs.statSync(pa).size, fs.statSync(pb).size],
      fileSha256Equal: sha(pa) === sha(pb), decodedFramesIdentical: count(ma, mb), of: ma.length });
  }
}
// Across processes, too: run 2's encodes vs run 1's.
const r2 = runs['run 2 (new process)'];
out.encodesAcrossProcesses = ['h264', 'hevc', 'prores4444'].map((codec) => {
  const a = runs['run 1'].enc.find((e) => e.name === `det-enc-${codec}-a`).swift, b = r2.enc.find((e) => e.name === `det-enc-${codec}-a`).swift;
  return { codec, note: 'run 2 overwrote run 1 files; compare sizes only', bytes: [a.fileBytes, b.fileBytes] };
});
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../results/determinism-summary.json'), JSON.stringify(out, null, 2));
