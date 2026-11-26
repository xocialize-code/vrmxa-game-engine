// Third-party notices for any Vite build (M6 W7, AB-T-0624): THIRD-PARTY-LICENCES.txt, the licence text of every
// package the bundle includes and the copyright notices our own modules carry in their headers (fdlibm's in
// @vrmxg/dmath, the vendored lip-sync rules, navcat's blocks, Ajv's precompiled meta-schema). A minified bundle keeps no
// comments, so those notices have to ship beside the code. The game runtime's plugin (vite.js `vrmxgRuntime`) writes
// it for every game build; the playground, the editor and the creator take it through `vrmxgNotices`, and their Mac
// apps open it from Help › Third-Party Notices (the shell, 0.16.0).
//
//   import { vrmxgNotices } from '@vrmxg/bundle/notices';
//   plugins: [vrmxgNotices({ name: 'vrmxg-editor', version: pkg.version })]
//
// A package with no licence file of its own takes its text from engine/packages/bundle/licences/ (licences/README.md);
// one with neither stops the build. Node only (it reads the packages' licence files).
import fs from 'node:fs';
import path from 'node:path';

export const NOTICES_FILE = 'THIRD-PARTY-LICENCES.txt';
/** Licence texts for packages that ship none: `<name>.txt`, a scoped name's `/` as `__`. */
export const SUPPLIED_LICENCES = path.join(import.meta.dirname, '../licences');
const RULE = `${'='.repeat(78)}\n`;

// a licence file beside the code: LICENSE, LICENCE.md, LICENSE-navcat, NOTICE, COPYING … never a source file
const isLicenceFile = (n) => /^(licen[cs]e|copying|notice)([-._].*)?$/i.test(n) && !/\.(m?js|ts|json)$/i.test(n);
// named in a file's licence: anything in node_modules, and a package in this repository that states a licence of its
// own (@vrmxg/three-vrm, vendored: MIT; @vrmxg/dmath: the fdlibm notice). The rest is ours and says nothing
const isThirdParty = (real, pkg) => real.includes(`${path.sep}node_modules${path.sep}`) || (!!pkg.licence && pkg.licence !== 'UNLICENSED');
const inNodeModules = (real) => real.includes(`${path.sep}node_modules${path.sep}`);

/** The package a file belongs to: the nearest package.json with a name, walking up. */
export function packageOf(file, cache = new Map()) {
  let dir = path.dirname(file);
  const walked = [];
  for (;;) {
    if (cache.has(dir)) { const hit = cache.get(dir); for (const d of walked) cache.set(d, hit); return hit; }
    walked.push(dir);
    const f = path.join(dir, 'package.json');
    if (fs.existsSync(f)) {
      let p = null;
      try { p = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { p = null; }
      if (p?.name) { const hit = { dir, name: p.name, version: p.version ?? '', licence: typeof p.license === 'string' ? p.license : p.license?.type ?? '' }; for (const d of walked) cache.set(d, hit); return hit; }
    }
    const up = path.dirname(dir);
    if (up === dir) { for (const d of walked) cache.set(d, null); return null; }
    dir = up;
  }
}

/** The comment block a module starts with, if it holds a copyright notice. */
function headerNotice(file) {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('//')) out.push(t.replace(/^\/\/ ?/, ''));
    else if (t === '') { if (out.length) out.push(''); } else break;
  }
  const text = out.join('\n').trim();
  return /copyright\s*(\(c\)|©|\d{4})/i.test(text) ? text : null; // a notice, not the word in passing
}

/**
 * The block a file of this repository adds to the notices (bundleNotices): a licence file's text, or the copyright
 * notice in a module's header (null: it carries none).
 * @param {string} file @returns {string | null}
 */
export function keptNotice(file) {
  return isLicenceFile(path.basename(file)) ? fs.readFileSync(file, 'utf8').trim() : headerNotice(file);
}

/**
 * A package's licence text: its licence files, else the text supplied for it in licences/, else null.
 * @param {{ dir: string, name: string }} p @returns {string | null}
 */
export function licenceText(p) {
  const files = fs.readdirSync(p.dir).filter((n) => isLicenceFile(n) && fs.statSync(path.join(p.dir, n)).isFile()).sort();
  if (files.length) return files.map((n) => fs.readFileSync(path.join(p.dir, n), 'utf8').trim()).join('\n\n');
  const supplied = path.join(SUPPLIED_LICENCES, `${p.name.replace('/', '__')}.txt`);
  return fs.existsSync(supplied) ? fs.readFileSync(supplied, 'utf8').trim() : null;
}

/**
 * The notices of what a Rollup / Rolldown bundle includes.
 * @param {Record<string, any>} bundle generateBundle's bundle
 * @param {{ title: string, packages?: string[] }} o title: the file's first line ("<name> <version>"); packages: files or
 *   folders of packages the bundle carries without a module importing them (a script and WebAssembly copied in as
 *   files: sql.js), each read from the package it belongs to
 * @returns {{ text: string, included: Map<string, string[]>, packages: string[] }} included: chunk file → the
 *   third-party packages in it, as "name version (licence)"; packages: "name@version" of every package whose text is in
 */
export function bundleNotices(bundle, { title, packages = [] }) {
  const cache = new Map(), third = new Map(), kept = new Map(), included = new Map();
  for (const chunk of Object.values(bundle)) {
    if (chunk.type !== 'chunk') continue;
    const inChunk = new Map();
    for (const id of /** @type {any} */ (chunk).moduleIds ?? Object.keys(chunk.modules ?? {})) {
      const file = id.replace(/^\0/, '').split('?')[0];
      if (!path.isAbsolute(file) || !fs.existsSync(file)) continue;
      const real = fs.realpathSync(file), pkg = packageOf(real, cache);
      if (!pkg) continue;
      if (isThirdParty(real, pkg)) inChunk.set(pkg.name, `${pkg.name} ${pkg.version} (${pkg.licence || 'see its licence'})`);
      if (inNodeModules(real)) { third.set(`${pkg.name}@${pkg.version}`, pkg); continue; }
      // code kept in this repository (ours, or vendored into it): a notice in the module's header, and the licence
      // files beside it, from its folder up to its package's
      const rel = (f) => `${pkg.name}/${path.relative(pkg.dir, f).split(path.sep).join('/')}`;
      const notice = keptNotice(real);
      if (notice) kept.set(rel(real), notice);
      for (let d = path.dirname(real); d.startsWith(pkg.dir); d = path.dirname(d)) {
        for (const n of fs.readdirSync(d).sort()) if (isLicenceFile(n) && fs.statSync(path.join(d, n)).isFile()) kept.set(rel(path.join(d, n)), fs.readFileSync(path.join(d, n), 'utf8').trim());
        if (d === pkg.dir) break;
      }
    }
    included.set(chunk.fileName, [...inChunk.keys()].sort().map((k) => inChunk.get(k)));
  }
  for (const f of packages) {
    const pkg = fs.existsSync(f) ? packageOf(path.join(fs.realpathSync(f), fs.statSync(f).isDirectory() ? 'package.json' : ''), cache) : null;
    if (!pkg) throw new Error(`third-party notices: ${f} is in no package`);
    third.set(`${pkg.name}@${pkg.version}`, pkg);
  }
  let text = `${title}: the licences of what it includes.\n\n`;
  const missing = [];
  for (const key of [...third.keys()].sort()) {
    const p = third.get(key), body = licenceText(p);
    if (body === null) { missing.push(`${p.name} ${p.version} (${p.licence || 'no licence named'})`); continue; }
    text += `${RULE}${p.name} ${p.version}${p.licence ? ` (${p.licence})` : ''}\n${RULE}\n${body}\n\n`;
  }
  if (missing.length) throw new Error(`third-party notices: no licence text for ${missing.join(', ')}: the package ships none, so put its text in engine/packages/bundle/licences/ (see the README there)`);
  for (const key of [...kept.keys()].sort()) text += `${RULE}${key}\n${RULE}\n${kept.get(key)}\n\n`;
  return { text, included, packages: [...third.keys()].sort() };
}

/**
 * A Vite plugin that writes THIRD-PARTY-LICENCES.txt into the build, for an app's own web build (the game runtime's
 * `vrmxgRuntime` writes its own the same way).
 * @param {{ name: string, version: string, packages?: string[] }} o name, version: the app's, for the file's first line;
 *   packages: as `bundleNotices`
 * @returns {import('vite').Plugin}
 */
export function vrmxgNotices({ name, version, packages = [] }) {
  return {
    name: 'vrmxg-notices',
    apply: 'build',
    generateBundle(_, bundle) {
      this.emitFile({ type: 'asset', fileName: NOTICES_FILE, source: bundleNotices(bundle, { title: `${name} ${version}`, packages }).text });
    },
  };
}

/**
 * Whether a built web folder's notices hold what they must: the file, each named package's licence text as its own
 * package ships it (or as licences/ supplies it), fdlibm's notice, and no package listed without its text.
 * @param {string} dir the built web folder @param {{ packages: string[], from: string, kept?: Record<string, string> }} o
 *   packages: names that must be in (resolved from `from`, a folder of the app's); kept: the blocks our own files add
 *   that must be in, whole, by their name in the file (`@vrmxg/dmath/src/index.js`) → the file
 * @returns {string[]} what is missing (none: all there)
 */
export function checkNotices(dir, { packages, from, kept = {} }) {
  const file = path.join(dir, NOTICES_FILE);
  if (!fs.existsSync(file)) return [`${NOTICES_FILE} is not in ${dir}`];
  const text = fs.readFileSync(file, 'utf8'), out = [];
  if (!text.includes('Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.')) out.push('fdlibm\'s notice (the port in @vrmxg/dmath)');
  if (/No licence file in the package/.test(text)) out.push('a package listed without its licence text');
  for (const [name, file] of Object.entries(kept)) {
    const body = keptNotice(file);
    if (body === null) out.push(`${name}: ${file} carries no notice to keep`);
    else if (!text.includes(`${RULE}${name}\n${RULE}\n${body}\n`)) out.push(`${name}: its notice`);
  }
  for (const name of packages) {
    const pkg = findPackage(name, from);
    if (!pkg) { out.push(`${name}: not installed where ${from} would import it`); continue; }
    const body = licenceText(pkg);
    if (!text.includes(`${RULE}${pkg.name} ${pkg.version}`)) out.push(`${pkg.name} ${pkg.version}: not listed`);
    else if (!body || !text.includes(body)) out.push(`${pkg.name} ${pkg.version}: its licence text`);
  }
  return out;
}

/** A package as Node would find it from a folder: node_modules up the tree. */
function findPackage(name, from) {
  for (let d = path.resolve(from); ; d = path.dirname(d)) {
    const f = path.join(d, 'node_modules', name, 'package.json');
    if (fs.existsSync(f)) return packageOf(fs.realpathSync(f));
    if (path.dirname(d) === d) return null;
  }
}
