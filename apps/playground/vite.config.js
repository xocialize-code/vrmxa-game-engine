import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// The sample project is served as the site's files (scenes, models, clips by their refs); vrmxa-core is read
// from the avatar studio beside this repository, in place (AB-D-0249). base './' for the Mac wrapper's origins.
const here = (p) => path.resolve(import.meta.dirname, p);
// The starter content (M6 W4, content/starter) as the site's starter/ folder, for ?mode=starter: served in dev and
// copied into the build (its clips and items only: no tools or tests)
const STARTER = here('../../content/starter');
const starterFiles = () => ['animations.json', ...['animations/clips', 'items'].flatMap((d) => fs.readdirSync(path.join(STARTER, d)).filter((f) => /\.(vrma|vrmxi)$/.test(f)).map((f) => `${d}/${f}`))];
const starter = () => ({
  name: 'vrmxg-starter',
  configureServer(server) {
    server.middlewares.use('/starter/', (req, res, next) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\//, '');
      if (!starterFiles().includes(rel)) return next();
      res.setHeader('content-type', 'application/octet-stream'); res.end(fs.readFileSync(path.join(STARTER, rel)));
    });
  },
  writeBundle(opts) { for (const rel of starterFiles()) { const to = path.join(opts.dir, 'starter', rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(STARTER, rel), to); } },
});
export default defineConfig({
  root: here('.'), base: './', publicDir: here('../../content/sample'),
  plugins: [vue(), starter()],
  resolve: { alias: { '@vrmxa-core': here('../../../vrmxa-avatar-studio/packages/vrmxa-core/src'), '@content': here('../../content/sample') }, dedupe: ['three'] },
  optimizeDeps: { exclude: ['sql.js'] },
  // game-ui.html: the game UI demo (M5 W3), a page of its own so the playground's page and checks don't move
  build: { outDir: here('dist'), emptyOutDir: true, target: 'safari16', chunkSizeWarningLimit: 4000, rolldownOptions: { input: { main: here('index.html'), 'game-ui': here('game-ui.html') } } },
  server: { port: 5181, fs: { allow: [here('../..'), here('../../../vrmxa-avatar-studio/packages/vrmxa-core')] } },
});
