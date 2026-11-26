import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { vrmxgNotices } from '@vrmxg/bundle/notices';
// The creator (M4 W5) ships the sample project as its starting project, as the editor does (the site's files, by their
// refs, listed in project-files.json); a project opened in the Mac shell is served under /project/ instead. It runs on
// the editor's host (apps/editor/src/host.js), so it takes the editor's import-map shim and vrmxa-core alias.
const here = (p) => path.resolve(import.meta.dirname, p);
// THIRD-PARTY-LICENCES.txt in the build (M6 W7, AB-T-0624): the licence texts and notices of what the bundle includes;
// the Mac app opens it from Help › Third-Party Notices
const pkg = JSON.parse(fs.readFileSync(here('package.json'), 'utf8'));
const sample = here('../../content/sample');
const listing = () => JSON.stringify(fs.readdirSync(sample, { recursive: true }).map(String).filter((f) => !f.split(path.sep).some((s) => s.startsWith('.')) && fs.statSync(path.join(sample, f)).isFile()).map((f) => f.split(path.sep).join('/')).sort());
const shim = fs.readFileSync(here('../editor/static/vrmxg-core.js'), 'utf8');
// vrmxa-core beside the repository; its real path too, since Vite checks served files by their real paths (a worktree
// reaches the studio through a symlink)
const core = here('../../../vrmxa-core');
const coreReal = fs.existsSync(core) ? fs.realpathSync(core) : core;

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
  plugins: [vue(), vrmxgNotices({ name: 'vrmxg-creator', version: pkg.version }), projectFiles()],
  optimizeDeps: { exclude: ['sql.js'] },
  resolve: { alias: { '@vrmxa-core': here('../../../vrmxa-core/src') }, dedupe: ['three', 'vue'] },
  build: { outDir: here('dist'), emptyOutDir: true, target: 'safari16', chunkSizeWarningLimit: 6000 },
  server: { port: 5185, fs: { allow: [here('../..'), core, coreReal] } },
});
