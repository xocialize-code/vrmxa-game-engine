// The sample's colour look (M2 W11): looks/morning.cube, a 17³ 3D LUT for "Morning at the cafe": shadows lifted a little
// and cooled, highlights warmed toward early sun, saturation eased back, a soft S in the mids. Plain arithmetic, written
// as Adobe's .cube text (what @vrmxg/post's lutFromCube reads). Xocialize original, made by this script.
//   node content/sample/tools/make-lut.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = 17;
const clamp = (v) => Math.min(1, Math.max(0, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (x) => x * x * (3 - 2 * x);

function grade([r, g, b]) {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // saturation down 12 %
  [r, g, b] = [r, g, b].map((c) => mix(y, c, 0.88));
  // a soft S on the luma, 25 % of the way
  const s = mix(y, smooth(y), 0.25), k = y > 1e-6 ? s / y : 1;
  [r, g, b] = [r * k, g * k, b * k];
  // shadows lifted and cool, highlights warm (weights by luma)
  const sh = 1 - smooth(Math.min(1, y * 2.2)), hi = smooth(clamp((y - 0.45) / 0.55));
  r += 0.018 * sh * 0.6 + 0.045 * hi;
  g += 0.018 * sh * 0.8 + 0.022 * hi;
  b += 0.018 * sh * 1.3 - 0.03 * hi;
  return [clamp(r), clamp(g), clamp(b)];
}

const lines = ['TITLE "VRMXG sample: Morning at the cafe"', '# Xocialize original, made by content/sample/tools/make-lut.mjs', `LUT_3D_SIZE ${N}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
// .cube order: red changes fastest, then green, then blue
for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
  lines.push(grade([ri / (N - 1), gi / (N - 1), bi / (N - 1)]).map((v) => v.toFixed(6)).join(' '));
}
fs.mkdirSync(path.join(root, 'looks'), { recursive: true });
fs.writeFileSync(path.join(root, 'looks/morning.cube'), lines.join('\n') + '\n');
console.log(`looks/morning.cube: ${N}³ entries`);
