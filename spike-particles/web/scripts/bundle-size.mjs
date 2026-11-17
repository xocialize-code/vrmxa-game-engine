#!/usr/bin/env node
// Minified + gzipped size of each candidate as an app would ship it (three and three/webgpu external).
//   node scripts/bundle-size.mjs   -> prints a table, writes ../results/bundle-size.json
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(web, 'node_modules', '.bundle-size');
fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
const entries = {
  'three.quarks (WebGL)': `import * as Q from 'three.quarks'; globalThis.x = Q;`,
  'three.quarks/webgpu': `import * as Q from 'three.quarks/webgpu'; globalThis.x = Q;`,
  'three-nebula (WebGL)': `import * as N from 'three-nebula'; globalThis.x = N;`,
  'three-nebula/webgpu': `import * as N from 'three-nebula/webgpu'; globalThis.x = N;`,
  'three.proton.js': `import P from 'three.proton.js'; globalThis.x = P;`,
  '@newkrok/three-particles': `import * as P from '@newkrok/three-particles'; globalThis.x = P;`,
  'stateless (this spike)': `import * as S from '${path.join(web, 'src/libs/stateless.js')}'; globalThis.x = S;`,
  'portable math (this spike)': `import * as D from '${path.join(web, 'src/core/detmath.js')}'; globalThis.x = D;`,
};
const out = {};
let i = 0;
for (const [name, code] of Object.entries(entries)) {
  const file = path.join(tmp, `e${i}.js`); fs.writeFileSync(file, code);
  const dir = path.join(tmp, `out${i++}`);
  await build({
    configFile: false, logLevel: 'silent', root: web,
    build: { outDir: dir, minify: true, write: true, emptyOutDir: true,
      lib: { entry: file, formats: ['es'], fileName: 'b' },
      rollupOptions: { external: (id) => id === 'three' || id.startsWith('three/') } },
  });
  const js = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(dir, f)));
  const buf = Buffer.concat(js);
  out[name] = { minKB: +(buf.length / 1024).toFixed(1), gzipKB: +(zlib.gzipSync(buf, { level: 9 }).length / 1024).toFixed(1) };
}
console.table(out);
fs.writeFileSync(path.join(web, '..', 'results', 'bundle-size.json'), JSON.stringify(out, null, 2));
