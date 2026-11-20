// The local patch for @pixiv/three-vrm 3.5.5's MToonNodeMaterial on three r187 (M4 W0, AB-T-0572; the patch is
// AB-T-0553's, decision AB-D-0274). It runs on install (the root package's postinstall) and patches the installed
// `lib/nodes/index.module.js` in place, so WebGPU code imports MToonNodeMaterial from '@pixiv/three-vrm/nodes' as usual.
//
//   node scripts/patch-three-vrm.mjs           apply the patches in engine/patches/ (a no-op when already applied)
//   node scripts/patch-three-vrm.mjs --check   change nothing: exit 1 unless the installed file is exactly the stock
//                                              file the patch was made against, or exactly that file patched (CI)
//
// The six lines (engine/patches/three-vrm-3.5.5-nodes-r187.patch):
//   - two imports pointed at `normalView`: r187 removed `transformedNormalView` (pixiv/three-vrm#1889, fix #1890);
//   - matcap U no longer mirrored: TSL's mul/add are variadic (pixiv/three-vrm#1904);
//   - the rim's view direction per fragment (`positionView`), not the object's origin (#1905);
//   - ambient light in the rim lighting mix, as the GLSL (#1906);
//   - the UV-animation mask reads B, as the spec (#1907).
// With them MToonNodeMaterial on WebGPURenderer matches WebGL's MToonMaterial (SSIM ≥ 0.995, AB-R-1004).
//
// Each patch names the package version and the sha256 of the stock file and of the patched file. Any other content (a
// new three-vrm release, a hand edit) fails: the patch is never applied blindly. Drop a hunk when a release fixes its
// issue, and regenerate the hashes (`--print-hashes` prints them for the installed file and the patch applied to it).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');

/** The patches: package, version, the file, its sha256 stock and patched. */
export const PATCHES = [
  {
    patch: 'engine/patches/three-vrm-3.5.5-nodes-r187.patch',
    pkg: '@pixiv/three-vrm',
    version: '3.5.5',
    file: 'lib/nodes/index.module.js',
    stock: '1b88101eb9f22f3976249f1ff7f53cde08d2699f36c24d0b9b66d7e5ffa21f26',
    patched: '4b0d8187d90c698a945cc6a7bbf0fb99b05b4a0703449bd7dafa1a68b73e2141',
  },
];

export const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

/**
 * Apply a unified diff to `text`. Every hunk must match its context and removed lines exactly, at the line the hunk
 * names: no fuzz, no offset. Throws on any mismatch.
 * @param {string} text @param {string} diff
 */
export function applyUnifiedDiff(text, diff) {
  const lines = text.split('\n');
  const out = [];
  let at = 0; // next unread line of `lines` (0-based)
  const d = diff.split('\n');
  let i = 0;
  while (i < d.length && !d[i].startsWith('@@')) i++;
  if (i === d.length) throw new Error('no hunks');
  while (i < d.length) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(d[i]);
    if (!m) { i++; continue; }
    const start = Number(m[1]) - 1;
    if (start < at) throw new Error(`hunk at line ${start + 1} overlaps the previous one`);
    while (at < start) out.push(lines[at++]);
    i++;
    for (; i < d.length && !d[i].startsWith('@@'); i++) {
      const l = d[i], op = l[0], body = l.slice(1);
      if (l === '' && i === d.length - 1) break; // the diff's trailing newline
      if (op === ' ' || op === '-') {
        if (lines[at] !== body) throw new Error(`line ${at + 1} differs from the patch's ${op === ' ' ? 'context' : 'removed line'}:\n  file:  ${lines[at]}\n  patch: ${body}`);
        if (op === ' ') out.push(body);
        at++;
      } else if (op === '+') out.push(body);
      else if (op === '\\') continue; // "\ No newline at end of file"
      else throw new Error(`unexpected diff line: ${l}`);
    }
  }
  while (at < lines.length) out.push(lines[at++]);
  return out.join('\n');
}

/**
 * The state of one patch in a node_modules tree: 'stock' (unpatched, the patch applies), 'patched', or a problem.
 * @param {typeof PATCHES[number]} p @param {string} [base] the directory holding node_modules
 */
export function inspect(p, base = root) {
  const dir = path.join(base, 'node_modules', p.pkg);
  const pkgFile = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgFile)) return { state: 'missing', message: `${p.pkg} is not installed` };
  const version = JSON.parse(fs.readFileSync(pkgFile, 'utf8')).version;
  const file = path.join(dir, p.file);
  const text = fs.readFileSync(file, 'utf8');
  const hash = sha256(text);
  if (version !== p.version) return { state: 'version', file, text, hash, message: `${p.pkg} is ${version}; ${p.patch} is for ${p.version}. Check whether the release fixes the patch's issues, then update or drop it` };
  if (hash === p.patched) return { state: 'patched', file, text, hash };
  if (hash !== p.stock) return { state: 'changed', file, text, hash, message: `${p.pkg} ${version} ${p.file} is neither the stock file (${p.stock.slice(0, 12)}…) nor the patched one (${p.patched.slice(0, 12)}…): ${hash.slice(0, 12)}…` };
  return { state: 'stock', file, text, hash };
}

function main(argv) {
  const check = argv.includes('--check'), print = argv.includes('--print-hashes');
  let failed = false;
  for (const p of PATCHES) {
    const s = inspect(p);
    const diff = fs.readFileSync(path.join(root, p.patch), 'utf8');
    if (print) {
      const patched = s.state === 'stock' ? applyUnifiedDiff(s.text, diff) : null;
      console.log(`${p.pkg} ${p.file}\n  installed ${s.hash ?? '-'} (${s.state})${patched ? `\n  patched   ${sha256(patched)}` : ''}`);
      continue;
    }
    if (s.state === 'missing' && !check) { console.log(`patch-three-vrm: ${s.message}; nothing to patch`); continue; }
    if (s.state === 'stock') {
      const patched = applyUnifiedDiff(s.text, diff); // throws if a hunk no longer applies
      if (sha256(patched) !== p.patched) { console.error(`patch-three-vrm: ${p.patch} applied, but the result's sha256 is ${sha256(patched)}, not ${p.patched}`); failed = true; continue; }
      if (check) { console.log(`patch-three-vrm: ${p.pkg} ${p.version} is stock and ${path.basename(p.patch)} applies (run without --check to apply it)`); continue; }
      fs.writeFileSync(/** @type {string} */ (s.file), patched);
      console.log(`patch-three-vrm: applied ${p.patch} to ${p.pkg} ${p.version} ${p.file}`);
    } else if (s.state === 'patched') console.log(`patch-three-vrm: ${p.pkg} ${p.version} ${p.file} is patched`);
    else { console.error(`patch-three-vrm: ${s.message}`); failed = true; }
  }
  if (failed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
