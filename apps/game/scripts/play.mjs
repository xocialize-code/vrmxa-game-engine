// Play a game build in a browser tab (M5 W1): serves a build's folder on loopback and prints its address.
//
//   node apps/game/scripts/play.mjs <build>                 a folder vrmxg-export or Export Game wrote
//   node apps/game/scripts/play.mjs --test-game [<out>]     export the game app's test game first (into <out>, or a temporary folder)
//   node apps/game/scripts/play.mjs --project <folder>      export a project first (its game.json), e.g. content/sample
//   … --port <n>                                            the port (default: any free one)
//
// The build's runtime is the game app (apps/game/dist: `npm run build -w @vrmxg/game-app`). Add ?renderer=webgl to the
// address to force WebGL.
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { exportToFolder, checkFolder } from '@vrmxg/bundle/node';
import { exportTestGame, GAME_RUNTIME } from './test-game.mjs';

const args = process.argv.slice(2);
const opt = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const port = +(opt('--port') ?? 0);
let dir;
if (args.includes('--test-game')) {
  const out = args[args.indexOf('--test-game') + 1];
  dir = out && !out.startsWith('--') ? path.resolve(out) : path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-game-')), 'build');
  console.log(JSON.stringify(await exportTestGame(dir)));
} else if (opt('--project')) {
  dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-game-')), 'build');
  const r = await exportToFolder({ project: path.resolve(opt('--project')), runtime: GAME_RUNTIME, out: dir });
  console.log(JSON.stringify({ game: r.manifest.game.id, files: r.files, digest: r.manifest.digest, out: dir }));
} else dir = path.resolve(args.find((a) => !a.startsWith('--')) ?? '');

const state = checkFolder(dir);
if (!state.ok) { console.error(`${dir} is not a whole build (${state.state}): export it again`); process.exit(1); }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(dir, url === '/' ? '/index.html' : url);
  if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
server.listen(port, '127.0.0.1', () => console.log(`playing ${dir} at http://127.0.0.1:${/** @type {any} */ (server.address()).port}/`));
