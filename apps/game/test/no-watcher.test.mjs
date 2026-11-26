// An exported game never watches or reloads anything (M6 W2, AB-T-0645; AB-D-0297 item 5: hot reload is the editor's
// only, and a build replays exactly). A build's runtime is this app (apps/game, built by Vite) and the engine's packages
// it imports; its Mac app is apps/game-mac on the shell. So: nothing the game app loads, by any relative path, is the
// editor's reload module or names the shell's watch; no engine package does either; the game's Mac app doesn't ask the
// shell for the watch (without `watchesProject` the shell has no project.watch at all, apps/shell ProjectWatchTests);
// and a built runtime, where there is one, holds neither.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'es-module-lexer/minimal/js'; // the lexer @vrmxg/bundle reads imports with (modules.js)

const ROOT = path.resolve(import.meta.dirname, '../../..');
const RELOAD = path.join(ROOT, 'apps/editor/src/reload.js');
// what only hot reload says: the shell's watch methods and event, and the editor's watcher
const WATCH = /project\.(un)?watch|project\.changed|HotReload|watchesProject/;

/** The script of a .vue file (what it imports), or a module's text. */
const scriptOf = (file, text) => (file.endsWith('.vue') ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n') : text);

/** Every file the game app reaches by relative imports from its page, the app's own and any it reaches outside it. */
function appGraph(entry) {
  const seen = new Set(), queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    if (!/\.(js|mjs|vue)$/.test(file)) continue;
    const [imports] = parse(scriptOf(file, text), file);
    for (const spec of imports.map((i) => i.n).filter((n) => typeof n === 'string')) { // a computed import() (a project's module) names no file here
      if (!/^\.{1,2}\//.test(spec)) continue;
      const target = path.resolve(path.dirname(file), spec.split('?')[0]);
      if (fs.existsSync(target) && fs.statSync(target).isFile()) queue.push(target);
    }
  }
  return [...seen];
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

test('nothing a game build runs can watch or hot-reload: the app, the engine, the Mac app, a built runtime', () => {
  const graph = appGraph(path.join(ROOT, 'apps/game/src/main.js'));
  assert.ok(graph.length > 10 && graph.some((f) => f.endsWith('App.vue')) && graph.some((f) => f.endsWith(path.join('playground', 'src', 'world.js'))), 'the walk reaches the app and the world builder it shares with the editor');
  assert.ok(!graph.includes(RELOAD), 'the game app never imports the editor\'s reload module');
  for (const f of graph) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), WATCH, `${path.relative(ROOT, f)} names the watch`);

  for (const f of walk(path.join(ROOT, 'engine/packages')).filter((f) => /\/src\/.*\.(js|vue)$/.test(f))) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), WATCH, `${path.relative(ROOT, f)} (an engine package) names the watch`);
  }

  const mac = fs.readFileSync(path.join(ROOT, 'apps/game-mac/Sources/VRMXGGame/main.swift'), 'utf8');
  assert.match(mac, /ShellApp\.run\(ShellConfiguration\(/);
  assert.doesNotMatch(mac, /watchesProject/, 'the game\'s Mac app doesn\'t ask the shell for the project watch');

  // the runtime as built (npm run build -w @vrmxg/game-app): only where it has been built
  const dist = path.join(ROOT, 'apps/game/dist');
  if (fs.existsSync(dist)) {
    for (const f of walk(dist).filter((f) => /\.(js|html)$/.test(f))) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), WATCH, `${path.relative(ROOT, f)} (the built runtime) names the watch`);
  }
});

test('the check above can fail: the editor, which does hot-reload, is caught by it', () => {
  const editor = appGraph(path.join(ROOT, 'apps/editor/src/main.js'));
  assert.ok(editor.includes(RELOAD), 'the editor reaches its reload module');
  assert.ok(editor.some((f) => WATCH.test(fs.readFileSync(f, 'utf8'))));
  assert.match(fs.readFileSync(path.join(ROOT, 'apps/editor-mac/Sources/VRMXGEditor/main.swift'), 'utf8'), /watchesProject: true/);
});
