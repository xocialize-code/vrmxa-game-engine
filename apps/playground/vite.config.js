import path from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// The sample project is served as the site's files (scenes, models, clips by their refs); vrmxa-core is read
// from the avatar studio beside this repository, in place (AB-D-0249). base './' for the Mac wrapper's origins.
const here = (p) => path.resolve(import.meta.dirname, p);
export default defineConfig({
  root: here('.'), base: './', publicDir: here('../../content/sample'),
  plugins: [vue()],
  resolve: { alias: { '@vrmxa-core': here('../../../vrmxa-avatar-studio/packages/vrmxa-core/src'), '@content': here('../../content/sample') }, dedupe: ['three'] },
  optimizeDeps: { exclude: ['sql.js'] },
  build: { outDir: here('dist'), emptyOutDir: true, target: 'safari16', chunkSizeWarningLimit: 4000 },
  server: { port: 5181, fs: { allow: [here('../..'), here('../../../vrmxa-avatar-studio/packages/vrmxa-core')] } },
});
