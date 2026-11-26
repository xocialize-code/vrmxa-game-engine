import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { vrmxgNotices } from '@vrmxg/bundle/notices';
import { checkRuntimeSources } from '@vrmxg/bundle/node';
import { listTemplates, CONTENT } from '../../content/templates/tools/new-project.mjs';
// The editor ships the sample project as its starting project (the site's files, by their refs) and lists it in
// project-files.json; a project opened in the Mac shell is served under /project/ instead. vrmxa-core is read from the
// avatar studio beside this repository, in place (AB-D-0249). base './' for the shell's origins.
const here = (p) => path.resolve(import.meta.dirname, p);
// THIRD-PARTY-LICENCES.txt in the build (M6 W7, AB-T-0624): the licence texts and notices of what the bundle includes;
// the Mac app opens it from Help › Third-Party Notices
const pkg = JSON.parse(fs.readFileSync(here('package.json'), 'utf8'));
const sample = here('../../content/sample');
const listing = () => JSON.stringify(fs.readdirSync(sample, { recursive: true }).map(String).filter((f) => !f.split(path.sep).some((s) => s.startsWith('.')) && fs.statSync(path.join(sample, f)).isFile()).map((f) => f.split(path.sep).join('/')).sort());
const shim = fs.readFileSync(here('static/vrmxg-core.js'), 'utf8');
// The runtime Export Game builds with (M5 W0, AB-D-0282): a prebuilt folder with its table (vrmxg-runtime.json), copied
// into the editor's build as game-runtime/ exactly as it is, and served from where it was built in dev. It is the game
// app (M5 W1, AB-D-0286): `npm run build -w @vrmxg/game-app` first.
const gameRuntime = here('../game/dist');
/** Is the game runtime the build of this checkout's sources (its stamp, apps/game/dist-sources.json)? → why not, or null */
const staleRuntime = () => {
  const s = checkRuntimeSources(here('../game/dist-sources.json'));
  if (s.ok) return null;
  return s.digest === null ? 'it was built without its source stamp' : `${s.changed.length + s.missing.length} of its source files changed since it was built (${[...s.changed, ...s.missing].slice(0, 3).join(', ')})`;
};
// vrmxa-core beside the repository, and its real path: Vite checks served files by real path, and a worktree reaches the
// studio through a symlink (M4 W5)
const core = here('../../../vrmxa-core');
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
    let warned = false;
    server.middlewares.use((req, res, next) => {
      if (!warned && req.url.includes('/game-runtime/') && fs.existsSync(gameRuntime)) {
        warned = true;
        const why = staleRuntime();
        if (why) console.warn(`vrmxg-game-runtime: apps/game/dist is older than this checkout (${why}): a game exported now gets the old runtime. npm run build -w @vrmxg/game-app`);
      }
      const url = decodeURIComponent(req.url.split('?')[0]), at = url.indexOf('/game-runtime/');
      const file = at < 0 ? null : path.join(gameRuntime, url.slice(at + '/game-runtime/'.length));
      if (!file || !file.startsWith(gameRuntime + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { next(); return; }
      res.setHeader('content-type', { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.wasm': 'application/wasm' }[path.extname(file)] ?? 'application/octet-stream');
      res.end(fs.readFileSync(file));
    });
  },
  closeBundle() {
    if (fs.existsSync(path.join(gameRuntime, 'vrmxg-runtime.json'))) {
      const why = staleRuntime();
      if (why) throw new Error(`vrmxg-game-runtime: apps/game/dist is older than this checkout (${why}): build it again first (npm run build -w @vrmxg/game-app), or every game this editor exports gets the old runtime`);
      fs.cpSync(gameRuntime, here('dist/game-runtime'), { recursive: true });
    }
    else console.warn('vrmxg-game-runtime: no runtime at apps/game/dist, so this editor cannot export a game (npm run build -w @vrmxg/game-app)');
  },
});

/**
 * templates/ (M6 W3, AB-T-0646): New Project's templates. `templates/index.json` lists each with the files a project made
 * from it holds, by where they are in this web content: the template's own files at templates/<id>/, the sample's at
 * their refs (the sample is this build's public folder already), anything else under content/ at templates/content/.
 * The Mac shell's project.create copies them from here.
 */
const templateFiles = () => {
  const web = (source) => (source.startsWith('templates/') ? source : source.startsWith('sample/') ? source.slice('sample/'.length) : `templates/content/${source}`);
  const templates = listTemplates().map((t) => ({ id: t.id, title: t.title, description: t.description, files: t.files.map((f) => ({ from: web(f.source), to: f.to })) }));
  const copies = new Map(); // web path → content path, for what the public folder doesn't already serve
  for (const t of listTemplates()) for (const f of t.files) if (!f.source.startsWith('sample/')) copies.set(web(f.source), f.source);
  return { index: `${JSON.stringify({ format: 'vrmxg-templates', version: 1, templates }, null, 1)}\n`, copies };
};
const templates = () => ({
  name: 'vrmxg-templates',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = decodeURIComponent(req.url.split('?')[0]), at = url.indexOf('/templates/');
      if (at < 0) { next(); return; }
      const rel = url.slice(at + 1), t = templateFiles();
      if (rel === 'templates/index.json') { res.setHeader('content-type', 'application/json'); res.end(t.index); return; }
      const src = t.copies.get(rel);
      if (!src) { next(); return; }
      res.end(fs.readFileSync(path.join(CONTENT, src)));
    });
  },
  generateBundle() {
    const t = templateFiles();
    this.emitFile({ type: 'asset', fileName: 'templates/index.json', source: t.index });
    for (const [to, from] of t.copies) this.emitFile({ type: 'asset', fileName: to, source: fs.readFileSync(path.join(CONTENT, from)) });
  },
});

export default defineConfig({
  root: here('.'), base: './', publicDir: sample,
  plugins: [vue(), vrmxgNotices({ name: 'vrmxg-editor', version: pkg.version }), projectFiles(), runtimeFiles(), templates()],
  optimizeDeps: { exclude: ['sql.js'] },
  resolve: { alias: { '@vrmxa-core': here('../../../vrmxa-core/src') }, dedupe: ['three'] },
  build: { outDir: here('dist'), emptyOutDir: true, target: 'safari16', chunkSizeWarningLimit: 4000 },
  server: { port: 5182, fs: { allow: [here('../..'), core, coreReal] } },
});
