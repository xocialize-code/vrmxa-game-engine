import path from 'node:path';
import { defineConfig } from 'vite';
// The WebXR spike's pages. Engine packages and three come from the repository root's node_modules (this folder isn't a
// workspace); iwer, the emulator, only from this folder's, and only xr.html imports it: index.html (the native probe)
// must see the browser's own navigator.xr, never the emulator's.
const here = (p) => path.resolve(import.meta.dirname, p);
export default defineConfig({
  root: here('.'), base: './', publicDir: here('public'),
  resolve: { dedupe: ['three'] },
  build: {
    outDir: here('dist'), emptyOutDir: true, target: 'esnext', chunkSizeWarningLimit: 8000,
    rolldownOptions: { input: { index: here('index.html'), stereo: here('stereo.html'), present: here('present.html'), xr: here('xr.html') } },
  },
  server: { host: '127.0.0.1', port: 5240, fs: { allow: [here('../..')] } },
});
