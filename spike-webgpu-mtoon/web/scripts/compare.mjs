// Compares the stills: WebGL (MToonMaterial, the reference) against WebGPURenderer (MToonNodeMaterial) on
// its WebGPU and WebGL2 backends, per runtime, and the same renderer across runtimes (Chromium vs WKWebView).
// Metrics: SSIM on luma (11×11 Gaussian window, σ 1.5, Wang et al. 2004) over the whole frame and over the
// character's bounding box; per-pixel max-channel difference counts; PSNR. Writes ../results/compare.json and
// ../results/compare/<pair>.png (A | B | difference ×4).
//   node scripts/compare.mjs
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const res = path.resolve(import.meta.dirname, '../../results');
const load = (dir, file) => PNG.sync.read(fs.readFileSync(path.join(res, dir, file)));

function luma(p) {
  const n = p.width * p.height, y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = 0.299 * p.data[i * 4] + 0.587 * p.data[i * 4 + 1] + 0.114 * p.data[i * 4 + 2];
  return y;
}

// Separable Gaussian blur of a w×h image.
const K = (() => { const k = [], s = 1.5; let t = 0; for (let i = -5; i <= 5; i++) { const v = Math.exp(-(i * i) / (2 * s * s)); k.push(v); t += v; } return k.map((v) => v / t); })();
function blur(src, w, h) {
  const tmp = new Float64Array(w * h), out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let k = -5; k <= 5; k++) s += K[k + 5] * src[y * w + Math.min(w - 1, Math.max(0, x + k))]; tmp[y * w + x] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let k = -5; k <= 5; k++) s += K[k + 5] * tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]; out[y * w + x] = s;
  }
  return out;
}

function ssimMap(a, b, w, h) {
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2, n = w * h;
  const aa = new Float64Array(n), bb = new Float64Array(n), ab = new Float64Array(n);
  for (let i = 0; i < n; i++) { aa[i] = a[i] * a[i]; bb[i] = b[i] * b[i]; ab[i] = a[i] * b[i]; }
  const ma = blur(a, w, h), mb = blur(b, w, h), saa = blur(aa, w, h), sbb = blur(bb, w, h), sab = blur(ab, w, h);
  const m = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const va = saa[i] - ma[i] * ma[i], vb = sbb[i] - mb[i] * mb[i], cov = sab[i] - ma[i] * mb[i];
    m[i] = ((2 * ma[i] * mb[i] + C1) * (2 * cov + C2)) / ((ma[i] ** 2 + mb[i] ** 2 + C1) * (va + vb + C2));
  }
  return m;
}

function compare(A, B) {
  const { width: w, height: h } = A;
  if (B.width !== w || B.height !== h) throw new Error('size mismatch');
  const bg = [A.data[0], A.data[1], A.data[2]];
  let x0 = w, y0 = h, x1 = -1, y1 = -1, fg = 0, d1 = 0, d8 = 0, d32 = 0, fg8 = 0, max = 0, se = 0;
  const diff = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    let d = 0, isFg = false;
    for (let c = 0; c < 3; c++) {
      const e = Math.abs(A.data[i + c] - B.data[i + c]); d = Math.max(d, e); se += e * e;
      if (Math.abs(A.data[i + c] - bg[c]) > 2 || Math.abs(B.data[i + c] - bg[c]) > 2) isFg = true;
    }
    diff[y * w + x] = d;
    if (isFg) { fg++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); if (d > 8) fg8++; }
    if (d > 1) d1++; if (d > 8) d8++; if (d > 32) d32++; max = Math.max(max, d);
  }
  const map = ssimMap(luma(A), luma(B), w, h);
  let all = 0, box = 0, nbox = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = map[y * w + x]; all += v;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) { box += v; nbox++; }
  }
  const mse = se / (w * h * 3);
  return {
    ssim: +(all / (w * h)).toFixed(5), ssimBox: nbox ? +(box / nbox).toFixed(5) : null,
    box: [x0, y0, x1, y1], fgPixels: fg, fgOver8: fg8, fgOver8Pct: fg ? +(100 * fg8 / fg).toFixed(2) : 0,
    over1: d1, over8: d8, over32: d32, maxDelta: max, psnr: mse ? +(10 * Math.log10(255 * 255 / mse)).toFixed(2) : Infinity, diff,
  };
}

function montage(A, B, diff, file) {
  const { width: w, height: h } = A, out = new PNG({ width: w * 3, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4;
    for (const [k, src] of [[0, A], [1, B]]) { const o = (y * w * 3 + k * w + x) * 4; for (let c = 0; c < 4; c++) out.data[o + c] = src.data[s + c]; }
    const o = (y * w * 3 + 2 * w + x) * 4, d = Math.min(255, diff[y * w + x] * 4);
    out.data[o] = d; out.data[o + 1] = d >> 2; out.data[o + 2] = d >> 2; out.data[o + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(out));
}

// Collect the stills: Chromium rows (results/chromium.json) and WKWebView rows (results/wkwebview.json).
const stills = [];
const read = (f) => fs.existsSync(path.join(res, f)) ? JSON.parse(fs.readFileSync(path.join(res, f), 'utf8')) : null;
const key = (r) => [r.result.revision, r.result.model, r.result.view, r.result.features + (r.result.hide ? `,hide-${r.result.hide}` : '') + (r.result.noemissive ? ',noemissive' : ''), r.result.sun, r.result.amb].join('|');
for (const r of ['chromium.json', 'chromium-vroid.json', 'chromium-upstream-r186.json', 'blend-space.json'].flatMap((f) => read(f)?.rows ?? [])) if (r.png && r.result?.stage === 'rendered') stills.push({ runtime: 'chromium', dir: 'chromium', file: r.png, renderer: r.result.renderer, lib: r.result.lib, k: key(r) });
for (const r of ['wkwebview.json', 'wkwebview-vroid.json'].flatMap((f) => read(f)?.rows ?? [])) if (r.png && r.result?.stage === 'rendered') stills.push({ runtime: `wkwebview-${r.origin}`, dir: 'wkwebview', file: r.png, renderer: r.result.renderer, lib: r.result.lib, k: key(r) });
const find = (runtime, renderer, k, lib) => stills.find((s) => s.runtime === runtime && s.renderer === renderer && s.k === k && (lib === undefined || s.lib === lib));

const pairs = [];
const runtimes = [...new Set(stills.map((s) => s.runtime))];
for (const rt of runtimes) for (const ref of stills.filter((s) => s.runtime === rt && s.renderer === 'webgl')) {
  for (const [renderer, lib] of [['webgpu', 'patched'], ['webgpu-gl', 'patched'], ['webgpu', 'loadonly'], ['webgpu-gl', 'loadonly'], ['webgpu', 'upstream'], ['webgpu', 'stock']]) {
    const b = find(rt, renderer, ref.k, lib);
    if (b) pairs.push({ kind: `webgl vs ${renderer}${lib === 'patched' ? '' : ` (${lib})`}`, a: ref, b });
  }
}
// Blend space with post (AB-T-0553 follow-up): WebGL to the canvas vs WebGL through @vrmxg/post, and post vs WebGPU.
for (const rt of runtimes) for (const ref of stills.filter((s) => s.runtime === rt && s.renderer === 'webgl')) {
  for (const p of ['webgl-post', 'webgl-post-ms0']) { const b = find(rt, p, ref.k); if (b) pairs.push({ kind: `webgl vs ${p}`, a: ref, b }); }
}
for (const rt of runtimes) for (const ref of stills.filter((s) => s.runtime === rt && s.renderer.startsWith('webgl-post'))) {
  const b = find(rt, 'webgpu', ref.k, 'patched'); if (b) pairs.push({ kind: `${ref.renderer} vs webgpu`, a: ref, b });
}
for (const a of stills.filter((s) => s.runtime === 'chromium')) for (const rt of runtimes.filter((r) => r !== 'chromium')) {
  const b = find(rt, a.renderer, a.k, a.lib);
  if (b) pairs.push({ kind: `chromium vs ${rt} (${a.renderer}${a.lib && a.lib !== "patched" ? " " + a.lib : ""})`, a, b });
}

fs.mkdirSync(path.join(res, 'compare'), { recursive: true });
const rows = [];
for (const p of pairs) {
  const A = load(p.a.dir, p.a.file), B = load(p.b.dir, p.b.file);
  const { diff, ...m } = compare(A, B);
  const name = `${p.a.runtime}__${p.a.file.replace('.png', '')}__vs__${p.b.runtime}__${p.b.renderer}${p.b.lib && p.b.lib !== "patched" ? "_" + p.b.lib : ""}`.replace(/[^\w.-]+/g, '_');
  const [three, model, view, features, sun, amb] = p.a.k.split('|');
  // Montages for the sample characters only (VRoid models can't be shipped, so their pictures stay local).
  if (!model.startsWith('vroid') || process.argv.includes('--all-montages')) montage(A, B, diff, path.join(res, 'compare', name + '.png'));
  rows.push({ kind: p.kind, three, model, view, features, sun: +sun, amb: +amb, a: `${p.a.dir}/${p.a.file}`, b: `${p.b.dir}/${p.b.file}`, montage: `compare/${name}.png`, ...m });
}
rows.sort((x, y) => x.kind.localeCompare(y.kind) || x.model.localeCompare(y.model) || x.view.localeCompare(y.view));
for (const r of rows) console.log(`${r.kind.padEnd(44)} r${r.three} ${r.model.padEnd(8)} ${r.view.padEnd(5)} ${r.features.padEnd(22)} amb ${r.amb}  SSIM ${r.ssim.toFixed(4)} box ${r.ssimBox?.toFixed(4)}  fg>8 ${String(r.fgOver8Pct).padStart(5)}%  max ${String(r.maxDelta).padStart(3)}  PSNR ${r.psnr}`);
// Per-group summary: worst case over the VRoid Hub sample (and every other group of models), per pair kind.
const groups = {};
for (const r of rows) {
  const g = `${r.kind} | ${r.model.startsWith('vroid-sample/') ? 'vroid-sample' : r.model} | ${r.view} | ${r.features === 'none' ? 'authored' : r.features}`;
  const s = (groups[g] ??= { n: 0, ssimMin: 1, fgOver8PctMax: 0, fgOver8PctMean: 0, psnrMin: Infinity });
  s.n++; s.ssimMin = Math.min(s.ssimMin, r.ssim); s.fgOver8PctMax = Math.max(s.fgOver8PctMax, r.fgOver8Pct); s.fgOver8PctMean += r.fgOver8Pct; s.psnrMin = Math.min(s.psnrMin, r.psnr);
}
for (const s of Object.values(groups)) s.fgOver8PctMean = +(s.fgOver8PctMean / s.n).toFixed(2);
const summary = Object.fromEntries(Object.entries(groups).filter(([g]) => g.includes('vroid-sample')).sort());
if (Object.keys(summary).length) { console.log('\nVRoid Hub sample, worst case per group:'); for (const [g, s] of Object.entries(summary)) console.log(`  ${g.padEnd(70)} n ${s.n}  SSIM min ${s.ssimMin.toFixed(4)}  fg>8 max ${s.fgOver8PctMax}% mean ${s.fgOver8PctMean}%  PSNR min ${s.psnrMin}`); }
fs.writeFileSync(path.join(res, 'compare.json'), JSON.stringify({ date: new Date().toISOString(), vroidSampleSummary: summary, method: 'SSIM on luma, 11x11 Gaussian sigma 1.5; ssimBox over the character bounding box; fgOver8 = character pixels whose max channel differs by more than 8/255', rows }, null, 1) + '\n');
