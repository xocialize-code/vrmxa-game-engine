import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { vrmxgRuntime } from '@vrmxg/bundle/vite';
// The game app, built as the runtime every game build is made with (M5 W1, AB-D-0286): `npm run build -w
// @vrmxg/game-app` writes apps/game/dist with its table (vrmxg-runtime.json) and THIRD-PARTY-LICENCES.txt. vrmxg-export and
// the editor's Export Game copy that folder into a build as it is. base './': a build is opened from wherever it is served.
//
// In dev (`npm run dev -w @vrmxg/game-app`), VRMXG_BUILD=<a build's folder> serves that build's manifest and project/
// beside the page, so the app plays it with hot reload (apps/game/scripts/play.mjs makes one).
const here = (p) => path.resolve(import.meta.dirname, p);
const pkg = JSON.parse(fs.readFileSync(here('package.json'), 'utf8'));
const core = here('../../../vrmxa-avatar-studio/packages/vrmxa-core');
const coreReal = fs.existsSync(core) ? fs.realpathSync(core) : core;
// sql.js's script and WebAssembly are copied in as files (apps/playground/src/sqljs.js), so no chunk names them: their
// licence is said here, and its text is in THIRD-PARTY-LICENCES.txt (vrmxa-core imports the package too)
const sqlJs = (() => { try { return JSON.parse(fs.readFileSync(path.join(core, 'node_modules/sql.js/package.json'), 'utf8')); } catch { return { version: '', license: 'MIT' }; } })();
const sqlJsLicence = `sql.js ${sqlJs.version} (${sqlJs.license}): see THIRD-PARTY-LICENCES.txt`;
const shim = fs.readFileSync(here('../../engine/packages/bundle/runtime/vrmxg-core.js'), 'utf8');

/** The import map's shim (@vrmxg/core for the project's behaviours), a file of its own with a fixed name. */
const coreShim = () => ({
  name: 'vrmxg-core-shim',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url.split('?')[0].endsWith('/vrmxg-core.js')) { res.setHeader('content-type', 'text/javascript'); res.end(shim); return; }
      next();
    });
  },
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'vrmxg-core.js', source: shim }); },
});

/** In dev: a build's manifest and project files, from VRMXG_BUILD. */
const devBuild = () => ({
  name: 'vrmxg-dev-build',
  apply: 'serve',
  configureServer(server) {
    const dir = process.env.VRMXG_BUILD ? path.resolve(process.env.VRMXG_BUILD) : null;
    server.middlewares.use((req, res, next) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      if (!dir || !(url === '/vrmxg-build.json' || url.startsWith('/project/'))) { next(); return; }
      const file = path.join(dir, url);
      if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
      res.end(fs.readFileSync(file));
    });
  },
});

export default defineConfig({
  root: here('.'), base: './', publicDir: false,
  plugins: [vue(), coreShim(), devBuild(), vrmxgRuntime({ name: 'vrmxg-game', version: pkg.version, licence: 'Xocialize original', licences: [['assets/sql-wasm-*.wasm', sqlJsLicence], ['assets/sql-wasm-*.js', sqlJsLicence]] })],
  optimizeDeps: { exclude: ['sql.js'] },
  resolve: { alias: { '@vrmxa-core': path.join(core, 'src') }, dedupe: ['three'] },
  build: { outDir: here('dist'), emptyOutDir: true, target: 'safari16', chunkSizeWarningLimit: 8000 },
  server: { port: 5187, fs: { allow: [here('../..'), core, coreReal] } },
});
