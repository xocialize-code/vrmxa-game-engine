// AB-T-0589: turns machine.swift's frame dumps (binary PPM) into PNGs for the report: the reference and the odd draw at
// full size, both cropped around the machine at 8x, and their difference (white where any channel differs, scaled
// differences elsewhere in the crop are black). No dependencies (node:zlib writes the PNG).
//   node spike-webgpu-render/repros/metal/images.mjs <reference.ppm> <odd.ppm> <out dir> [x0 y0 w h]   (crop default 1020 490 90 70)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [refPath, oddPath, outDir, ...crop] = process.argv.slice(2);
const [cx, cy, cw, ch] = crop.length === 4 ? crop.map(Number) : [1020, 490, 90, 70];
function readPPM(file) {
  const b = fs.readFileSync(file);
  let i = 0; const tok = () => { while (/\s/.test(String.fromCharCode(b[i]))) i++; let s = ''; while (!/\s/.test(String.fromCharCode(b[i]))) s += String.fromCharCode(b[i++]); return s; };
  if (tok() !== 'P6') throw new Error(`${file}: not a binary PPM`);
  const w = +tok(), h = +tok(); tok(); i++;
  return { w, h, rgb: b.subarray(i, i + w * h * 3) };
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy ? Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1) : null; }
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
const zoom = (img, s, pick) => { const out = Buffer.alloc(cw * s * ch * s * 3); for (let y = 0; y < ch * s; y++) for (let x = 0; x < cw * s; x++) { const p = pick(cx + Math.floor(x / s), cy + Math.floor(y / s)); p.copy(out, (y * cw * s + x) * 3); } return out; };
const ref = readPPM(refPath), odd = readPPM(oddPath);
fs.mkdirSync(outDir, { recursive: true });
const at = (img) => (x, y) => Buffer.from(img.rgb.subarray((y * img.w + x) * 3, (y * img.w + x) * 3 + 3));
let n = 0;
for (let k = 0; k < ref.rgb.length; k++) if (ref.rgb[k] !== odd.rgb[k]) n++;
png(path.join(outDir, 'reference.png'), ref.w, ref.h, ref.rgb);
png(path.join(outDir, 'odd.png'), odd.w, odd.h, odd.rgb);
png(path.join(outDir, 'reference-crop-8x.png'), cw * 8, ch * 8, zoom(ref, 8, at(ref)));
png(path.join(outDir, 'odd-crop-8x.png'), cw * 8, ch * 8, zoom(odd, 8, at(odd)));
png(path.join(outDir, 'diff-crop-8x.png'), cw * 8, ch * 8, zoom(ref, 8, (x, y) => { const i = (y * ref.w + x) * 3, d = Math.max(...[0, 1, 2].map((c) => Math.abs(ref.rgb[i + c] - odd.rgb[i + c]))); return Buffer.from(d ? [255, 255, 255] : [0, 0, 0]); }));
console.log(`${n} channel values differ; wrote reference, odd, and 8x crops of (${cx}, ${cy}) ${cw}x${ch} to ${outDir}`);
