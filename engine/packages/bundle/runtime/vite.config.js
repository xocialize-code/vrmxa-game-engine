import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { vrmxgRuntime } from '../src/vite.js';
// The minimal runtime, built into runtime/dist with its table (vrmxg-runtime.json): `npm run build:runtime -w
// @vrmxg/bundle`. vrmxa-core is read from its repository beside this one (../vrmxa-core), in place (AB-D-0249), as the
// apps read it. base './': a build is opened from wherever its folder is served.
const here = (p) => path.resolve(import.meta.dirname, p);
const pkg = JSON.parse(fs.readFileSync(here('../package.json'), 'utf8'));
const core = here('../../../../../vrmxa-core');
// sql.js's script and WebAssembly are copied in as files (apps/playground/src/sqljs.js), so no chunk names them: their
// licence is said here, and its text is in THIRD-PARTY-LICENCES.txt (vrmxa-core imports the package too)
const sqlJs = (() => { try { return JSON.parse(fs.readFileSync(path.join(core, 'node_modules/sql.js/package.json'), 'utf8')); } catch { return { version: '', license: 'MIT' }; } })();
const sqlJsLicence = `sql.js ${sqlJs.version} (${sqlJs.license}): see THIRD-PARTY-LICENCES.txt`;

/** The import map's shim, as a file of its own with a fixed name. */
const coreShim = () => ({
  name: 'vrmxg-core-shim',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'vrmxg-core.js', source: fs.readFileSync(here('vrmxg-core.js'), 'utf8') }); },
});

export default defineConfig({
  root: here('.'), base: './', publicDir: false,
  plugins: [coreShim(), vrmxgRuntime({ name: 'vrmxg-stepper', version: pkg.version, licence: 'Xocialize original', licences: [['assets/sql-wasm-*.wasm', sqlJsLicence], ['assets/sql-wasm-*.js', sqlJsLicence]] })],
  optimizeDeps: { exclude: ['sql.js'] },
  resolve: { alias: { '@vrmxa-core': path.join(core, 'src') }, dedupe: ['three'] },
  build: { outDir: here('dist'), emptyOutDir: true, target: 'safari16', chunkSizeWarningLimit: 6000 },
  server: { port: 5186, fs: { allow: [here('../../../..'), core, fs.existsSync(core) ? fs.realpathSync(core) : core] } },
});
