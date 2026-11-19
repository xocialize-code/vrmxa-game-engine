import path from 'node:path';
import fs from 'node:fs';
import { defineConfig } from 'vite';
// The spike page: the sample project served as the site's files (as the playground does), vrmxa-core from the avatar
// studio beside this repository, the engine packages from the repo root's node_modules (workspaces). base './' for the
// Mac wrapper's origins. Two dev-only routes write results and shots into ../results and ../shots.
const here = (p) => path.resolve(import.meta.dirname, p);
const quarksCore = here('../../node_modules/three.quarks/dist/three.quarks.esm.js');

// three.quarks: @vrmxg/particles imports 'three.quarks' (the WebGL BatchedRenderer). The spike sends that import to a
// shim that picks the WebGL or the WebGPU (TSL) BatchedRenderer at run time, by ?renderer=, without touching the
// engine package. three.quarks/webgpu itself imports 'three.quarks' and must get the real core.
const quarksShim = {
  name: 'quarks-shim',
  enforce: 'pre',
  resolveId(id, importer) {
    if (id !== 'three.quarks') return null;
    if (importer && (importer.includes('three.quarks/dist') || importer.endsWith('quarks-shim.js'))) return quarksCore;
    return here('src/quarks-shim.js');
  },
};

const saver = {
  name: 'spike-saver',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const m = /^\/__(save|shot)\/([\w.-]+)$/.exec(req.url ?? '');
      if (req.method !== 'POST' || !m) return next();
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const file = m[1] === 'save' ? here(`../results/${m[2]}.json`) : here(`../shots/${m[2]}.png`);
        fs.writeFileSync(file, m[1] === 'save' ? body : Buffer.from(body.toString().split(',')[1], 'base64'));
        res.end(file);
      });
    });
  },
};

export default defineConfig({
  root: here('.'), base: './', publicDir: here('../../content/sample'),
  plugins: [quarksShim, saver],
  resolve: { alias: { '@vrmxa-core': here('../../../vrmxa-avatar-studio/packages/vrmxa-core/src'), '@content': here('../../content/sample') }, dedupe: ['three'] },
  optimizeDeps: { exclude: ['sql.js', 'three.quarks'] },
  build: { outDir: here('dist'), emptyOutDir: true, target: 'esnext', chunkSizeWarningLimit: 8000 },
  server: { port: 5241, host: '127.0.0.1', fs: { allow: [here('../..'), here('../../../vrmxa-avatar-studio/packages/vrmxa-core')] } },
});
