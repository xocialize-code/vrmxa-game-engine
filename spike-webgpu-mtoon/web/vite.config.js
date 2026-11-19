// THREE_R=186 serves the same page on three r186.1 (the npm alias three-r186): the "pin an older three" option.
import { defineConfig } from 'vite';
const r186 = process.env.THREE_R === '186';
// A production build can't contain the stock module on r187 (Rolldown MISSING_EXPORT, results/vite-build-stock.txt);
// STOCK_STUB=1 (set by mac/scripts/build.sh) swaps it for a module that throws that explanation.
const stub = process.env.STOCK_STUB === '1' && !r186;
export default defineConfig({
  resolve: {
    dedupe: ['three'],
    alias: [
      ...(r186 ? [{ find: /^three(\/.*)?$/, replacement: 'three-r186$1' }] : []),
      ...(stub ? [{ find: /^@pixiv\/three-vrm\/nodes$/, replacement: new URL('./src/stock-unbundlable.js', import.meta.url).pathname }] : []),
    ],
  },
  // Keep the stock three-vrm/nodes out of pre-bundling: Rolldown fails the whole optimize step on its
  // missing export (MISSING_EXPORT), so excluding it lets the browser show the native link error instead.
  optimizeDeps: { exclude: ['@pixiv/three-vrm/nodes'] },
  cacheDir: r186 ? 'node_modules/.vite-r186' : 'node_modules/.vite',
  server: { port: r186 ? 5252 : 5251, strictPort: true, host: '127.0.0.1' },
  build: { outDir: r186 ? 'dist-r186' : 'dist', target: 'es2022' },
});
