// The local patch for @pixiv/three-vrm 3.5.5's MToonNodeMaterial on three r187 (M4 W0, AB-T-0572; the patch is
// AB-T-0553's, decision AB-D-0274). It runs on install (the root package's postinstall) and patches the installed
// `lib/nodes/index.module.js` in place, so WebGPU code imports MToonNodeMaterial from '@pixiv/three-vrm/nodes' as usual.
//
//   node scripts/patch-three-vrm.mjs           apply the patches (a no-op when already applied)
//   node scripts/patch-three-vrm.mjs --check   change nothing: exit 1 unless each installed file is exactly the stock
//                                              file the patch was made against, or exactly that file patched
//   ... --check --require-patched              and exit 1 unless every file is patched (CI: proves the install patched)
//
// engine/patches/three-vrm-3.5.5-nodes-r187.patch, every changed line marked "VRMXG patch":
//   - two imports pointed at `normalView`: r187 removed `transformedNormalView` (pixiv/three-vrm#1889, fix #1890);
//   - 1: matcap U no longer mirrored: TSL's mul/add are variadic (pixiv/three-vrm#1904);
//   - 2: the rim's view direction per fragment (`positionView`), not the object's origin (#1905);
//   - 3: ambient light in the rim lighting mix, as the GLSL (#1906);
//   - 4: the UV-animation mask reads B, as the spec (#1907);
//   - 5 (AB-T-0586, not offered upstream yet): shadows in the toon shading. three r187 multiplies a receiving object's
//     shadow into the light colour, and three-vrm's getShading has `shadow = 1` (upstream's own TODO), so shadowed
//     MToon went dark. The patch re-derives the light's colour without the shadow (the light node's setupDirect with
//     its base colour: spot cone, distance attenuation and projected maps kept, for any light type) and multiplies the
//     shadow into the shading, as GLSL MToon's getShading( dotNL, shadow, ... ): the shaded side takes shadeColor.
// With 1–4, MToonNodeMaterial on WebGPURenderer matches WebGL's MToonMaterial unshadowed (SSIM ≥ 0.995, AB-R-1004);
// 5 brings shadowed MToon in line (AB-T-0586's receipt). The first six lines were AB-T-0553's; 5 adds twelve.
//
// The package's CommonJS nodes build (`lib/nodes/index.cjs`, what `require('@pixiv/three-vrm/nodes')` loads) would stay
// stock, and stock loads on r187 through three's CommonJS build and draws wrong. It's replaced by a stub that throws,
// so nothing can use it unpatched. (The .min builds aren't reachable: the package's exports map doesn't list them.)
//
// Each patch names the package version and the sha256 of the stock file and of the patched file. Any other content (a
// new three-vrm release, a hand edit) fails: the patch is never applied blindly. Drop a hunk when a release fixes its
// issue, and regenerate the hashes (`--print-hashes` prints them for the installed file and the patch applied to it).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');

export const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

/** What replaces the CommonJS nodes build. */
export const CJS_STUB = `// VRMXG (scripts/patch-three-vrm.mjs): @pixiv/three-vrm 3.5.5's CommonJS nodes build isn't patched for three r187, and
// stock MToonNodeMaterial draws wrong there. Import the patched ES module: import { MToonNodeMaterial } from '@pixiv/three-vrm/nodes'.
throw new Error("@pixiv/three-vrm/nodes: VRMXG disables the CommonJS build (not patched for three r187); import the ES module instead");
`;

/**
 * The patches: package, version, the file, its sha256 stock and patched, and how it's patched (`patch`: a unified diff
 * under engine/patches/; `replace`: new contents).
 * @type {{ name: string, pkg: string, version: string, file: string, stock: string, patched: string, patch?: string, replace?: string }[]}
 */
export const PATCHES = [
  {
    name: 'three-vrm-3.5.5-nodes-r187.patch',
    patch: 'engine/patches/three-vrm-3.5.5-nodes-r187.patch',
    pkg: '@pixiv/three-vrm',
    version: '3.5.5',
    file: 'lib/nodes/index.module.js',
    stock: '1b88101eb9f22f3976249f1ff7f53cde08d2699f36c24d0b9b66d7e5ffa21f26',
    patched: '72d018f3e6ad85bf2fc40d19d83c4c5479d99672698cbf0ac01133f8ef20fb70',
  },
  {
    name: 'the CommonJS stub',
    replace: CJS_STUB,
    pkg: '@pixiv/three-vrm',
    version: '3.5.5',
    file: 'lib/nodes/index.cjs',
    stock: '6c798e5e387ea22ce6d30f6704f85d65b0f5ec26b83f56776a811f23c0d8130c',
    patched: sha256(CJS_STUB),
  },
];

/** The patched text of a stock file. @param {typeof PATCHES[number]} p @param {string} text */
export const patchText = (p, text) => (p.replace !== undefined ? p.replace : applyUnifiedDiff(text, fs.readFileSync(path.resolve(root, /** @type {string} */ (p.patch)), 'utf8')));

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
  if (version !== p.version) return { state: 'version', file, text, hash, message: `${p.pkg} is ${version}; ${p.name} is for ${p.version}. Check whether the release fixes the patch's issues, then update or drop it` };
  if (hash === p.patched) return { state: 'patched', file, text, hash };
  if (hash !== p.stock) return { state: 'changed', file, text, hash, message: `${p.pkg} ${version} ${p.file} is neither the stock file (${p.stock.slice(0, 12)}…) nor the patched one (${p.patched.slice(0, 12)}…): ${hash.slice(0, 12)}…` };
  return { state: 'stock', file, text, hash };
}

/**
 * Apply (or, with check, only inspect) every patch. → the exit code: 1 on a problem, or with requirePatched on a file
 * that isn't patched yet.
 * @param {{ check?: boolean, requirePatched?: boolean, print?: boolean, base?: string, patches?: typeof PATCHES, log?: (s: string) => void, error?: (s: string) => void }} [o]
 */
export function run({ check = false, requirePatched = false, print = false, base = root, patches = PATCHES, log = console.log, error = console.error } = {}) {
  let failed = false;
  for (const p of patches) {
    const s = inspect(p, base);
    const where = `${p.pkg} ${p.version} ${p.file}`;
    if (print) {
      const patched = s.state === 'stock' ? patchText(p, s.text) : null;
      log(`${p.pkg} ${p.file}\n  installed ${s.hash ?? '-'} (${s.state})${patched ? `\n  patched   ${sha256(patched)}` : ''}`);
      continue;
    }
    if (s.state === 'missing' && !check) { log(`patch-three-vrm: ${s.message}; nothing to patch`); continue; }
    if (s.state === 'stock') {
      const patched = patchText(p, s.text); // throws if a hunk no longer applies
      if (sha256(patched) !== p.patched) { error(`patch-three-vrm: ${p.name} applied, but the result's sha256 is ${sha256(patched)}, not ${p.patched}`); failed = true; continue; }
      if (check) {
        if (requirePatched) { error(`patch-three-vrm: ${where} is stock: the install didn't patch it (${p.name} applies; run the script without --check)`); failed = true; }
        else log(`patch-three-vrm: ${where} is stock and ${p.name} applies (run without --check to apply it)`);
        continue;
      }
      fs.writeFileSync(/** @type {string} */ (s.file), patched);
      log(`patch-three-vrm: applied ${p.name} to ${where}`);
    } else if (s.state === 'patched') log(`patch-three-vrm: ${where} is patched (${p.name})`);
    else { error(`patch-three-vrm: ${s.message}`); failed = true; }
  }
  return failed ? 1 : 0;
}

// import.meta.main, not a comparison with argv[1]: that fails through a symlink or with a space or # in the path, and
// the install would then do nothing and exit 0
if (import.meta.main) {
  const argv = process.argv.slice(2);
  process.exitCode = run({ check: argv.includes('--check'), requirePatched: argv.includes('--require-patched'), print: argv.includes('--print-hashes') });
}
