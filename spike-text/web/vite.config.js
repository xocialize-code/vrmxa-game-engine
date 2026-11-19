import path from 'node:path';
import fs from 'node:fs';
import { defineConfig } from 'vite';
// The text spike page. three r187 comes from the repo root's node_modules (the spike's own install skipped peers),
// the font from ../fonts (served as the site's files). base './' for the Mac wrapper's origins. A dev-only route
// writes results and shots into ../results.
const here = (p) => path.resolve(import.meta.dirname, p);

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
        const file = m[1] === 'save' ? here(`../results/${m[2]}.json`) : here(`../results/shots/${m[2]}.png`);
        fs.writeFileSync(file, m[1] === 'save' ? body : Buffer.from(body.toString().split(',')[1], 'base64'));
        res.end(file);
      });
    });
  },
};

export default defineConfig({
  root: here('.'), base: './', publicDir: here('../fonts'),
  plugins: [saver],
  resolve: { alias: { three: here('../../node_modules/three') }, dedupe: ['three'] },
  optimizeDeps: { exclude: ['harfbuzzjs'] },
  build: { outDir: here('dist'), emptyOutDir: true, target: 'esnext', chunkSizeWarningLimit: 8000 },
  server: { port: 5246, host: '127.0.0.1', fs: { allow: [here('../..')] } },
});
