import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import fs from 'node:fs';
import path from 'node:path';

// Dev only: the page's ?autorun=1&save=<name> POSTs its results here, written to results/<name>.json.
const saveResults = {
  name: 'spike-save-results',
  configureServer(server) {
    server.middlewares.use('/__results', (req, res) => {
      if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
      const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'browser').replace(/[^a-z0-9._-]/gi, '_');
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const dir = path.resolve(server.config.root, 'results');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(JSON.parse(body), null, 2));
        res.end('ok');
      });
    });
  },
};

// `base: './'` keeps the build loadable from the wrapper's scheme or any folder (as in the avatar studio).
export default defineConfig({
  base: './',
  plugins: [vue(), saveResults],
  resolve: { dedupe: ['three'] },
  // Jolt's multithreaded build spawns itself as an ES-module worker (it uses top-level await).
  worker: { format: 'es' },
  server: { port: 5230, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5231, strictPort: true, host: '127.0.0.1' },
  build: { outDir: 'dist', emptyOutDir: true, target: 'safari16', chunkSizeWarningLimit: 5000 },
});
