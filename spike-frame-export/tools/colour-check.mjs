#!/usr/bin/env node
// Mean colour error of frame `n` decoded to RGB (ffmpeg honours each file's matrix/range tags) against the raw
// BGRA reference: separates "the codec lost detail" from "the colour conversion shifted every pixel".
//   node tools/colour-check.mjs <ref.bgra> <n> <video> [<video> …]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const [ref, nStr, ...videos] = process.argv.slice(2);
const W = 1920, H = 1080, n = Number(nStr), F = W * H * 4;
const fd = fs.openSync(ref, 'r'); const a = Buffer.alloc(F); fs.readSync(fd, a, 0, F, n * F);
for (const v of videos) {
  const b = execFileSync('ffmpeg', ['-v', 'error', '-i', v, '-vf', `select=eq(n\\,${n})`, '-frames:v', '1', '-pix_fmt', 'bgra', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 });
  const sum = [0, 0, 0], abs = [0, 0, 0];
  for (let i = 0; i < F; i += 4) for (let k = 0; k < 3; k++) { const d = b[i + k] - a[i + k]; sum[k] += d; abs[k] += Math.abs(d); }
  const px = W * H, r = (x) => Math.round((x / px) * 100) / 100;
  console.log(JSON.stringify({ video: v.split('/').pop(), frame: n, meanBias_BGR: sum.map(r), meanAbsErr_BGR: abs.map(r) }));
}
