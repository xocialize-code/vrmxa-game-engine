#!/usr/bin/env node
// Writes public/audio/dialogue.wav: the stand-in dialogue track. 48 kHz, stereo, 16-bit, 12 s.
// A 1 kHz, 40 ms beep starts at every whole second (sample-exact onset), over a quiet noise bed.
// The shot lights its sync square on the same instants, so tools/av-sync.mjs can measure the offset.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SR = 48000, SECONDS = 12, CH = 2;
const n = SR * SECONDS;
const data = Buffer.alloc(n * CH * 2);
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed / 2 ** 32) * 2 - 1; };
for (let i = 0; i < n; i++) {
  const t = i / SR, inSec = i % SR;
  let v = 0.03 * rnd() * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t)); // "speech" bed
  if (inSec < SR * 0.04) v += 0.8 * Math.sin((2 * Math.PI * 1000 * inSec) / SR + Math.PI / 2); // starts at full amplitude
  const s = Math.max(-1, Math.min(1, v));
  for (let c = 0; c < CH; c++) data.writeInt16LE(Math.round(s * 32767), (i * CH + c) * 2);
}
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(CH, 22);
h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * CH * 2, 28); h.writeUInt16LE(CH * 2, 32); h.writeUInt16LE(16, 34);
h.write('data', 36); h.writeUInt32LE(data.length, 40);
fs.mkdirSync(path.join(web, 'public/audio'), { recursive: true });
fs.writeFileSync(path.join(web, 'public/audio/dialogue.wav'), Buffer.concat([h, data]));
console.log('[wav] public/audio/dialogue.wav');
