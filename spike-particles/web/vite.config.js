import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import fs from 'node:fs';
import path from 'node:path';

// Dev only: the page's ?autorun=1&save=<name> POSTs its results here, written to ../results/<name>.json;
// ?shot=…&save=1 POSTs a PNG data URL, written to ../shots/<name>.png.
const saveResults = {
  name: 'spike-save-results',
  configureServer(server) {
    server.middlewares.use('/__results', (req, res) => {
      if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
      const q = new URL(req.url, 'http://x').searchParams;
      const name = (q.get('name') || 'browser').replace(/[^a-z0-9._-]/gi, '_');
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const root = path.resolve(server.config.root, '..');
        if (q.get('kind') === 'png') {
          fs.writeFileSync(path.join(root, 'shots', `${name}.png`), Buffer.from(body.split(',')[1], 'base64'));
        } else {
          fs.writeFileSync(path.join(root, 'results', `${name}.json`), JSON.stringify(JSON.parse(body), null, 2));
        }
        res.end('ok');
      });
    });
  },
};

export default defineConfig({
  base: './',
  plugins: [vue(), saveResults],
  // three.proton.js is UMD and does require('three'), which would pull three's CJS build (a second
  // copy of three that calls process.emitWarning and dies in the browser). Point bare 'three' at the ESM build.
  resolve: { dedupe: ['three'], alias: [{ find: /^three$/, replacement: path.resolve(import.meta.dirname, 'node_modules/three/build/three.module.js') }] },
  // fs.allow: the maths module lives in ../../engine/packages/dmath (AB-T-0500).
  server: { port: 5243, strictPort: true, host: '127.0.0.1', fs: { allow: [path.resolve(import.meta.dirname, '../..')] } },
  preview: { port: 5244, strictPort: true, host: '127.0.0.1' },
  build: { outDir: 'dist', emptyOutDir: true, target: 'safari16', chunkSizeWarningLimit: 5000 },
});
