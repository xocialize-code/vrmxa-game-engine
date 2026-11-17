#!/usr/bin/env node
// Does a ProRes 4444 written from premultiplied BGRA store premultiplied or straight colour, as an
// outside decoder (ffmpeg) sees it?  node tools/alpha-compare.mjs <ref0.bgra> <video.mov> [width height]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const [ref, video, W = 1920, H = 1080] = process.argv.slice(2);
const a = fs.readFileSync(ref);
const b = execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-frames:v', '1', '-pix_fmt', 'bgra', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
let nOp = 0, eOp = 0, nEdge = 0, ePre = 0, eStr = 0, eA = 0, maxA = 0, n254 = 0, n255 = 0;
for (let i = 0; i < W * H * 4; i += 4) {
  const al = a[i + 3];
  maxA = Math.max(maxA, b[i + 3]); if (b[i + 3] === 254) n254++; if (b[i + 3] === 255) n255++;
  if (al === 255) { nOp++; for (let k = 0; k < 3; k++) eOp += Math.abs(b[i + k] - a[i + k]); }
  else if (al >= 32 && al <= 223) {
    nEdge++; eA += Math.abs(b[i + 3] - al);
    for (let k = 0; k < 3; k++) { ePre += Math.abs(b[i + k] - a[i + k]); eStr += Math.abs(b[i + k] - Math.min(255, (a[i + k] * 255) / al)); }
  }
}
const r = (x) => Math.round(x * 100) / 100;
console.log(JSON.stringify({ video, decoder: 'ffmpeg', opaqueColourMAE: r(eOp / nOp / 3), edgePixels: nEdge, edgeAlphaMAE: r(eA / nEdge),
  edgeMAEvsPremultiplied: r(ePre / nEdge / 3), edgeMAEvsStraight: r(eStr / nEdge / 3), decodedMaxAlpha: maxA, decodedAlpha254: n254, decodedAlpha255: n255 }));
