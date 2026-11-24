// The Vite plugin that turns a built web app into a runtime (AB-D-0282): after the build it writes
// vrmxg-runtime.json, the table of every file in the output folder with its size, SHA-256 and licence, which the
// exporter checks and copies from. It also writes THIRD-PARTY-LICENCES.txt: the licence text of every package the
// bundle includes, and the copyright notices our own modules carry in their headers (fdlibm's in @vrmxg/dmath, the
// vendored lip-sync rules), because a minified bundle keeps no comments and those notices have to ship with the code.
//
//   import { vrmxgRuntime } from '@vrmxg/bundle/vite';
//   plugins: [vrmxgRuntime({ name: 'vrmxg-game', version: pkg.version, licence: 'Xocialize original' })]
//
// Node only (it reads the output folder and the packages' licence files).
import fs from 'node:fs';
import path from 'node:path';
import { RUNTIME_FILE, runtimeTable, serializeRuntime } from './runtime.js';
import { listFolder } from './node.js';
import { globRe } from './paths.js';

export const NOTICES_FILE = 'THIRD-PARTY-LICENCES.txt';
// a licence file beside the code: LICENSE, LICENCE.md, LICENSE-navcat, NOTICE, COPYING … never a source file
const isLicenceFile = (n) => /^(licen[cs]e|copying|notice)([-._].*)?$/i.test(n) && !/\.(m?js|ts|json)$/i.test(n);
// named in a file's licence: anything in node_modules, and a package in this repository that states a licence of its
// own (@vrmxg/three-vrm, vendored: MIT; @vrmxg/dmath: the fdlibm notice). The rest is ours and says nothing
const isThirdParty = (real, pkg) => real.includes(`${path.sep}node_modules${path.sep}`) || (!!pkg.licence && pkg.licence !== 'UNLICENSED');

/** The package a module belongs to: the nearest package.json with a name, walking up. */
function packageOf(file, cache) {
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
 * @param {{ name: string, version: string, licence: string, licences?: [string, string][], entry?: string }} o
 *   name, version: the runtime's; licence: of the app's own files; licences: [pattern, licence] for files that differ
 *   (`*` within one folder level); entry: the page a build opens (index.html)
 * @returns {import('vite').Plugin}
 */
export function vrmxgRuntime({ name, version, licence, licences = [], entry = 'index.html' }) {
  let outDir = '';
  /** @type {Map<string, string[]>} chunk file → the third-party packages in it, as "name version (licence)" */
  const included = new Map();
  return {
    name: 'vrmxg-runtime',
    apply: 'build',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    generateBundle(_, bundle) {
      const cache = new Map(), third = new Map(), kept = new Map();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const inChunk = new Map();
        for (const id of /** @type {any} */ (chunk).moduleIds ?? Object.keys(chunk.modules ?? {})) {
          const file = id.replace(/^\0/, '').split('?')[0];
          if (!path.isAbsolute(file) || !fs.existsSync(file)) continue;
          const real = fs.realpathSync(file), pkg = packageOf(real, cache);
          if (!pkg) continue;
          if (isThirdParty(real, pkg)) inChunk.set(pkg.name, `${pkg.name} ${pkg.version} (${pkg.licence || 'see its licence'})`);
          if (real.includes(`${path.sep}node_modules${path.sep}`)) { third.set(`${pkg.name}@${pkg.version}`, pkg); continue; }
          // code kept in this repository (ours, or vendored into it): a notice in the module's header, and the licence
          // files beside it, from its folder up to its package's
          const rel = (f) => `${pkg.name}/${path.relative(pkg.dir, f).split(path.sep).join('/')}`;
          const notice = headerNotice(real);
          if (notice) kept.set(rel(real), notice);
          for (let d = path.dirname(real); d.startsWith(pkg.dir); d = path.dirname(d)) {
            for (const n of fs.readdirSync(d).sort()) if (isLicenceFile(n) && fs.statSync(path.join(d, n)).isFile()) kept.set(rel(path.join(d, n)), fs.readFileSync(path.join(d, n), 'utf8').trim());
            if (d === pkg.dir) break;
          }
        }
        included.set(chunk.fileName, [...inChunk.keys()].sort().map((k) => inChunk.get(k)));
      }
      const rule = `${'='.repeat(78)}\n`;
      let text = `${name} ${version}: the licences of what this runtime includes.\n\n`;
      for (const key of [...third.keys()].sort()) {
        const p = third.get(key);
        const files = fs.readdirSync(p.dir).filter((n) => isLicenceFile(n) && fs.statSync(path.join(p.dir, n)).isFile()).sort();
        text += `${rule}${p.name} ${p.version}${p.licence ? ` (${p.licence})` : ''}\n${rule}\n`;
        text += files.length ? files.map((n) => fs.readFileSync(path.join(p.dir, n), 'utf8').trim()).join('\n\n') : `No licence file in the package; its package.json says: ${p.licence || 'nothing'}.`;
        text += '\n\n';
      }
      for (const key of [...kept.keys()].sort()) text += `${rule}${key}\n${rule}\n${kept.get(key)}\n\n`;
      this.emitFile({ type: 'asset', fileName: NOTICES_FILE, source: text });
    },
    closeBundle() {
      if (!outDir || !fs.existsSync(outDir)) return;
      fs.rmSync(path.join(outDir, RUNTIME_FILE), { force: true });
      const rules = licences.map(([pattern, l]) => ({ re: globRe(pattern), l }));
      const files = listFolder(outDir, { hidden: true }).map((p) => {
        const names = included.get(p) ?? [];
        const by = rules.find((r) => r.re.test(p))?.l
          ?? (p === NOTICES_FILE ? 'The licence texts and notices of the packages this runtime includes'
            : names.length ? `${licence}; includes ${names.join(', ')}: see ${NOTICES_FILE}` : licence);
        return { path: p, bytes: new Uint8Array(fs.readFileSync(path.join(outDir, p))), licence: by };
      });
      fs.writeFileSync(path.join(outDir, RUNTIME_FILE), serializeRuntime(runtimeTable({ name, runtimeVersion: version, entry, files })));
    },
  };
}
