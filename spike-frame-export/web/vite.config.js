import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// `base: './'` keeps the build loadable from the wrapper's custom scheme or its loopback server.
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: { dedupe: ['three'] },
  server: { port: 5244, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5245, strictPort: true, host: '127.0.0.1' },
  build: { outDir: 'dist', emptyOutDir: true, target: 'safari18', chunkSizeWarningLimit: 5000 },
});
