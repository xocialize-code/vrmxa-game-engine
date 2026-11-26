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
import { NOTICES_FILE, bundleNotices } from './notices.js';

export { NOTICES_FILE };

/**
 * @param {{ name: string, version: string | (() => string), licence: string, licences?: [string, string][], entry?: string, engine?: any, packages?: string[] }} o
 *   name, version: the runtime's (version may be a function, read once the bundle is written: a version that carries a
 *   stamp of the sources, as the game app's does); licence: of the app's own files; licences: [pattern, licence] for files that differ
 *   (`*` within one folder level); entry: the page a build opens (index.html); engine: what the engine in the runtime
 *   means for saves (compat.js `engineCompat`), written into the table for a build's save-compatibility fingerprint;
 *   packages: packages the bundle carries as copied files rather than imports, for the notices (notices.js `bundleNotices`)
 * @returns {import('vite').Plugin}
 */
export function vrmxgRuntime({ name, version, licence, licences = [], entry = 'index.html', engine = null, packages = [] }) {
  let outDir = '';
  /** @type {Map<string, string[]>} chunk file → the third-party packages in it, as "name version (licence)" */
  const included = new Map();
  return {
    name: 'vrmxg-runtime',
    apply: 'build',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    generateBundle(_, bundle) {
      // the version read now: a function's (the game app's source stamp) is set by a plugin before this one
      const n = bundleNotices(bundle, { title: `${name} ${typeof version === 'function' ? version() : version}`, packages });
      included.clear();
      for (const [k, v] of n.included) included.set(k, v);
      this.emitFile({ type: 'asset', fileName: NOTICES_FILE, source: n.text });
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
      fs.writeFileSync(path.join(outDir, RUNTIME_FILE), serializeRuntime(runtimeTable({ name, runtimeVersion: typeof version === 'function' ? version() : version, entry, engine, files })));
    },
  };
}
