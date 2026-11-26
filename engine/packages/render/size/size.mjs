// The render host's bundle cost (AB-A-0335): build size/main.js (RenderHost.create, mtoonMaterial, captureStill) with
// Vite and report two numbers: what loads at start (the entry chunk and every chunk it imports statically) and what the
// build ships (every JS file, the chunks loaded on demand included), raw and gzipped, with the bytes each package
// rendered. `node engine/packages/render/size/size.mjs [--json out.json]`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { build } from 'vite';

const here = import.meta.dirname;
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-render-size-'));
/** bytes rendered per package, from the bundle's module table */
const byPackage = new Map();
const pkgOf = (id) => {
  const m = id.replace(/\\/g, '/').match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (m) return m[1];
  const e = id.match(/engine\/packages\/([^/]+)/);
  return e ? `@vrmxg/${e[1]}` : 'app';
};
const result = await build({
  root: here, logLevel: 'warn', configFile: false,
  build: { outDir: out, emptyOutDir: true, target: 'es2022', modulePreload: false, reportCompressedSize: false },
  plugins: [{
    name: 'size-by-package',
    generateBundle(_o, bundle) {
      for (const c of Object.values(bundle)) if (c.type === 'chunk') for (const [id, m] of Object.entries(c.modules)) {
        const k = pkgOf(id), v = byPackage.get(k) ?? { bytes: 0, initial: 0 };
        v.bytes += m.renderedLength; byPackage.set(k, v);
      }
    },
  }],
});
const chunks = (Array.isArray(result) ? result : [result]).flatMap((r) => /** @type {any} */ (r).output).filter((c) => c.type === 'chunk');
const byName = new Map(chunks.map((c) => [c.fileName, c]));
const initial = new Set();
const walk = (c) => { if (initial.has(c.fileName)) return; initial.add(c.fileName); for (const i of c.imports) walk(byName.get(i)); };
for (const c of chunks) if (c.isEntry) walk(c);
for (const c of chunks) if (initial.has(c.fileName)) for (const [id, m] of Object.entries(c.modules)) byPackage.get(pkgOf(id)).initial += m.renderedLength;
const size = (files) => files.reduce((s, f) => { const b = Buffer.from(byName.get(f).code); return { raw: s.raw + b.length, gzip: s.gzip + zlib.gzipSync(b, { level: 9 }).length }; }, { raw: 0, gzip: 0 });
const report = {
  initial: { files: initial.size, ...size([...initial]) },
  total: { files: chunks.length, ...size(chunks.map((c) => c.fileName)) },
  lazy: chunks.filter((c) => !initial.has(c.fileName)).map((c) => ({ file: c.fileName.replace(/-[\w-]{8}\.js$/, '.js'), raw: Buffer.byteLength(c.code), modules: [...new Set(Object.keys(c.modules).map(pkgOf))] })),
  packages: Object.fromEntries([...byPackage].sort((a, b) => b[1].bytes - a[1].bytes).map(([k, v]) => [k, v])),
  vite: (await import('vite')).version,
};
fs.rmSync(out, { recursive: true, force: true });
const j = process.argv.indexOf('--json');
if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
