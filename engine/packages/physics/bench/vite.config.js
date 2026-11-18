import path from 'node:path';
import { defineConfig } from 'vite';
// `base: './'` so the build loads from the WKWebView harness's scheme or loopback origin.
const root = import.meta.dirname;
export default defineConfig({
  root, base: './',
  build: { outDir: path.join(root, 'dist'), emptyOutDir: true, target: 'safari16', rolldownOptions: { input: path.join(root, 'index.html') } },
});
