// A game build on a static host (M6 W7, AB-T-0648): the CSP the build plays under, the _headers file and the
// Cloudflare Worker folder vrmxg-export --worker writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { exportToFolder, checkFolder } from '@vrmxg/bundle/node';
import { inlineHashes, contentSecurityPolicy, headersFile, workerFolder, workerName } from '@vrmxg/bundle/hosting';
import { project, runtime } from './helpers.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-bundle-hosting-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const onDisk = (name, mem) => { const dir = path.join(tmp, name); for (const [p, b] of mem.map) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), b); } return dir; };
const sha = (t) => `'sha256-${crypto.createHash('sha256').update(t).digest('base64')}'`;

// the game app's page as Vite writes it: an inline style and an import map, the module scripts by src
const PAGE = '<!doctype html><html><head><style>html{margin:0}</style>\n<script type="importmap">{ "imports": { "@vrmxg/core": "./vrmxg-core.js" } }</script>\n  <script type="module" crossorigin src="./assets/index.js"></script></head><body></body></html>';

test('the CSP allows the page\'s own inline import map and style by hash, WebAssembly, and no eval', () => {
  assert.deepEqual(inlineHashes(PAGE), { scripts: [sha('{ "imports": { "@vrmxg/core": "./vrmxg-core.js" } }')], styles: [sha('html{margin:0}')] });
  const csp = contentSecurityPolicy(PAGE), directives = Object.fromEntries(csp.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));
  assert.deepEqual(directives['script-src'], ["'self'", "'wasm-unsafe-eval'", sha('{ "imports": { "@vrmxg/core": "./vrmxg-core.js" } }')]);
  assert.deepEqual(directives['style-src'], ["'self'", sha('html{margin:0}')]);
  assert.ok(!/'unsafe-eval'|'unsafe-inline'/.test(csp), 'neither eval nor inline code beyond the hashed');
  assert.deepEqual(directives['default-src'], ["'self'"]);
  assert.deepEqual(directives['connect-src'], ["'self'", 'data:', 'blob:']);
  assert.deepEqual(Object.fromEntries(contentSecurityPolicy(PAGE, { connect: ['https://scores.example'] }).split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]))['connect-src'], ["'self'", 'data:', 'blob:', 'https://scores.example']);
});

test('the game app\'s page is what the CSP is made from: one inline script (the import map), one inline style, nothing else inline', () => {
  const html = fs.readFileSync(path.resolve(import.meta.dirname, '../../../../apps/game/index.html'), 'utf8');
  const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>/gi)].map((m) => m[0]);
  assert.deepEqual(inlineScripts, ['<script type="importmap">'], 'a new inline script needs its hash in the CSP: inlineHashes reads every one');
  assert.ok(!/\son[a-z]+=|javascript:/i.test(html), 'no inline event handlers, which no hash allows');
});

test('the _headers file sets the CSP on everything and caches only the hashed assets for good', () => {
  const h = headersFile(PAGE);
  assert.match(h, /^\/\*\n {2}Content-Security-Policy: default-src 'self'; /m);
  assert.match(h, /^ {2}X-Content-Type-Options: nosniff$/m);
  assert.match(h, /^\/assets\/\*\n {2}! Cache-Control\n {2}Cache-Control: public, max-age=31536000, immutable$/m);
});

test('a Worker folder holds the build as static assets with its _headers, and a config that publishes nowhere yet', async () => {
  const build = path.join(tmp, 'build');
  await exportToFolder({ project: onDisk('project', project()), runtime: onDisk('runtime', runtime({ 'index.html': PAGE })), out: build });
  const out = path.join(tmp, 'worker');
  const r = workerFolder({ build, out });
  assert.equal(r.name, 'vrmxg-test-game');
  assert.equal(checkFolder(path.join(out, 'public')).ok, false, 'the folder holds _headers beside the build');
  fs.rmSync(path.join(out, 'public/_headers'));
  assert.equal(checkFolder(path.join(out, 'public')).ok, true, 'and otherwise the build itself, byte for byte');
  workerFolder({ build, out }); // again over its own folder
  const config = JSON.parse(fs.readFileSync(path.join(out, 'wrangler.jsonc'), 'utf8').split('\n').filter((l) => !l.startsWith('//')).join('\n'));
  assert.deepEqual(config, { name: 'vrmxg-test-game', compatibility_date: '2026-11-23', workers_dev: false, preview_urls: false, assets: { directory: './public', html_handling: 'auto-trailing-slash', not_found_handling: 'none' } });
  assert.equal(fs.readFileSync(path.join(out, 'public/_headers'), 'utf8'), headersFile(PAGE));
  assert.equal(r.largest.bytes, Math.max(...fs.readdirSync(path.join(out, 'public'), { recursive: true }).map(String).filter((f) => f !== '_headers' && fs.statSync(path.join(out, 'public', f)).isFile()).map((f) => fs.statSync(path.join(out, 'public', f)).size)));
  fs.writeFileSync(path.join(out, 'other.txt'), 'x');
  assert.throws(() => workerFolder({ build, out }), /holds other files/);
  assert.throws(() => workerFolder({ build, out: path.join(tmp, 'w2'), name: 'Not A Name' }), /not a Worker name/);

  // the CLI's form
  const cli = spawnSync(process.execPath, [path.resolve(import.meta.dirname, '../src/cli.js'), '--worker', build, path.join(tmp, 'w3'), '--name', 'my-game'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).name, 'my-game');
  assert.ok(fs.existsSync(path.join(tmp, 'w3/public/vrmxg-build.json')));
});

test('a Worker\'s name from a game id', () => {
  assert.equal(workerName('morning-rush'), 'vrmxg-morning-rush');
  assert.equal(workerName('After Hours!'), 'vrmxg-after-hours');
  assert.ok(workerName('x'.repeat(100)).length <= 63);
});
