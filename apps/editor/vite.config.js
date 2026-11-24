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
// The runtime Export Game builds with (M5 W0, AB-D-0282): a prebuilt folder with its table (vrmxg-runtime.json), copied
// into the editor's build as game-runtime/ exactly as it is, and served from where it was built in dev. Until the game
// app exists (M5 W1) it is @vrmxg/bundle's minimal runtime: `npm run build:runtime -w @vrmxg/bundle` first.
const gameRuntime = here('../../engine/packages/bundle/runtime/dist');
// vrmxa-core beside the repository, and its real path: Vite checks served files by real path, and a worktree reaches the
// studio through a symlink (M4 W5)
const core = here('../../../vrmxa-avatar-studio/packages/vrmxa-core');
const coreReal = fs.existsSync(core) ? fs.realpathSync(core) : core;

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

/** game-runtime/: the runtime's files, byte for byte. An editor built without one says so when Export Game is used. */
const runtimeFiles = () => ({
  name: 'vrmxg-game-runtime',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = decodeURIComponent(req.url.split('?')[0]), at = url.indexOf('/game-runtime/');
      const file = at < 0 ? null : path.join(gameRuntime, url.slice(at + '/game-runtime/'.length));
      if (!file || !file.startsWith(gameRuntime + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { next(); return; }
      res.setHeader('content-type', { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.wasm': 'application/wasm' }[path.extname(file)] ?? 'application/octet-stream');
      res.end(fs.readFileSync(file));
    });
  },
  closeBundle() {
    if (fs.existsSync(path.join(gameRuntime, 'vrmxg-runtime.json'))) fs.cpSync(gameRuntime, here('dist/game-runtime'), { recursive: true });
    else console.warn('vrmxg-game-runtime: no runtime at engine/packages/bundle/runtime/dist, so this editor cannot export a game (npm run build:runtime -w @vrmxg/bundle)');
  },
});

export default defineConfig({
  root: here('.'), base: './', publicDir: sample,
  plugins: [vue(), projectFiles(), runtimeFiles()],
  optimizeDeps: { exclude: ['sql.js'] },
  resolve: { alias: { '@vrmxa-core': here('../../../vrmxa-avatar-studio/packages/vrmxa-core/src') }, dedupe: ['three'] },
  build: { outDir: here('dist'), emptyOutDir: true, target: 'safari16', chunkSizeWarningLimit: 4000 },
  server: { port: 5182, fs: { allow: [here('../..'), core, coreReal] } },
});
