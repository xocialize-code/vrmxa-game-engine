// Blend space with post (AB-T-0553 follow-up): pixel values of model=threealpha (MeshBasicMaterial (0.95, 0.4, 0.3) at
// opacity 0.5 over the background and over an opaque blue sphere) per renderer, against the two predicted blends:
// sRGB space (blend the sRGB-encoded values) and linear space (blend linear values, encode after).
//   node scripts/blend-probe.mjs   (after shots.mjs --out blend-space …threealpha cases) → ../results/blend-space-probe.json
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const res = path.resolve(import.meta.dirname, '../../results');
const s2l = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const l2s = (c) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
const lin2srgb8 = (c) => l2s(c);
const front = [0.95, 0.4, 0.3], blue = [0.2, 0.3, 0.9], bg = [216, 221, 230];
const predict = (under) => ({ // under: sRGB 8-bit values of what's behind
  srgbSpace: front.map((f, i) => Math.round(0.5 * lin2srgb8(f) + 0.5 * under[i])),
  linearSpace: front.map((f, i) => l2s(0.5 * f + 0.5 * s2l(under[i]))),
});
const points = { 'front over background': [150, 230], 'front over blue sphere': [200, 190], 'blue sphere alone': [290, 150], background: [20, 20] };
const { rows } = JSON.parse(fs.readFileSync(path.join(res, 'blend-space.json'), 'utf8'));
const out = { date: new Date().toISOString(), material: 'MeshBasicMaterial / MeshBasicNodeMaterial, colour (0.95, 0.4, 0.3), opacity 0.5, depthWrite false', predictions: {}, renderers: {} };
const blueS = blue.map(lin2srgb8);
out.predictions['front over background'] = predict(bg);
out.predictions['front over blue sphere'] = predict(blueS);
for (const r of rows.filter((x) => x.png && x.result?.model === 'threealpha')) {
  const p = PNG.sync.read(fs.readFileSync(path.join(res, 'chromium', r.png)));
  const at = ([x, y]) => { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i + 1], p.data[i + 2]]; };
  out.renderers[r.result.renderer] = Object.fromEntries(Object.entries(points).map(([k, xy]) => [k, at(xy)]));
}
for (const [k, pr] of Object.entries(out.predictions)) {
  console.log(`${k}:  predicted sRGB-space ${pr.srgbSpace}  linear-space ${pr.linearSpace}`);
  for (const [r, v] of Object.entries(out.renderers)) console.log(`   ${r.padEnd(16)} ${v[k]}`);
}
fs.writeFileSync(path.join(res, 'blend-space-probe.json'), JSON.stringify(out, null, 1) + '\n');
