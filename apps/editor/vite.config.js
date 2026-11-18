import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// The editor ships the sample project as its starting project (the site's files, by their refs) and lists it in
// project-files.json; a project opened in the Mac shell is served under /project/ instead. vrmxa-core is read from the
// avatar studio beside this repository, in place (AB-D-0249). base './' for the shell's origins.
const here = (p) => path.resolve(import.meta.dirname, p);
const sample = here('../../content/sample');
const listing = () => JSON.stringify(fs.readdirSync(sample, { recursive: true }).map(String).filter((f) => !f.split(path.sep).some((s) => s.startsWith('.')) && fs.statSync(path.join(sample, f)).isFile()).map((f) => f.split(path.sep).join('/')).sort());
const shim = fs.readFileSync(here('static/vrmxg-core.js'), 'utf8');

/** project-files.json (the bundled project's files) and the import map's shim, in dev and in the build. */
const projectFiles = () => ({
  name: 'vrmxg-project-files',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url.split('?')[0];
      if (url.endsWith('/project-files.json')) { res.setHeader('content-type', 'application/json'); res.end(listing()); return; }
      if (url.endsWith('/vrmxg-core.js')) { res.setHeader('content-type', 'text/javascript'); res.end(shim); return; }
      next();
    });
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'project-files.json', source: listing() });
    this.emitFile({ type: 'asset', fileName: 'vrmxg-core.js', source: shim });
  },
});

export default defineConfig({
  root: here('.'), base: './', publicDir: sample,
  plugins: [vue(), projectFiles()],
  optimizeDeps: { exclude: ['sql.js'] },
  resolve: { alias: { '@vrmxa-core': here('../../../vrmxa-avatar-studio/packages/vrmxa-core/src') }, dedupe: ['three'] },
  build: { outDir: here('dist'), emptyOutDir: true, target: 'safari16', chunkSizeWarningLimit: 4000 },
  server: { port: 5182, fs: { allow: [here('../..'), here('../../../vrmxa-avatar-studio/packages/vrmxa-core')] } },
});
