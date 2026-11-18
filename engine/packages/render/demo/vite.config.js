import path from 'node:path';
import { defineConfig } from 'vite';
// Assets come from the determinism harness (engine/packages/snapshot/harness: node make-assets.mjs).
const root = import.meta.dirname;
export default defineConfig({
  root, base: './', publicDir: path.join(root, '../../snapshot/harness/public'),
  build: { outDir: path.join(root, 'dist'), emptyOutDir: true, target: 'safari16', chunkSizeWarningLimit: 4000, rolldownOptions: { input: path.join(root, 'index.html') } },
});
