// M6 W7 (AB-T-0648), exit check 8's "a web build served from any static host plays": The Morning Rush's build served by
// two hosts this repository didn't write, on loopback only, and played to its won ending through each in Chromium by the
// scripted player (rush-player.js).
//
//   node acceptance/m6/sharing.mjs                  both hosts (needs vrmxa-core beside the repository, the
//                                                    determinism spike's playwright-core and Chrome for Testing, as the
//                                                    other Chromium runners, Python 3, and docs/'s install: cd docs && npm ci)
//   … --only python|worker                          one host
//
// 1  python: `python3 -m http.server --bind 127.0.0.1`, the build in a sub-folder (/games/morning-rush/), Python's own
//    MIME types, no headers of ours: a page under a base path, file types a server has never heard of (.vrmxs, .vrma,
//    .vrmxa), no custom scheme, no cross-origin isolation (so no SharedArrayBuffer).
// 2  worker: the build as a Cloudflare Worker's static assets (`vrmxg-export --worker`), served by Wrangler's local dev
//    server (workerd) with `--ip 127.0.0.1`: Cloudflare's MIME types, its trailing-slash redirects, and the build's
//    `_headers`, which sets a Content Security Policy without 'unsafe-eval' (hosting.js). Nothing is uploaded: no
//    account is used, and no deploy, preview or workers.dev address is made.
// For each: every file the manifest lists is fetched (status, content type); every server socket of the host is on
// loopback; the page is played from the title to the won ending with a hash after every step; no request fails, none
// leaves the build (nothing outside its manifest, nothing from another origin), and no CSP violation is reported; the
// recorded session replays in Node to the same hash after every step. Logs go to acceptance/results/m6-sharing/, the
// summary to acceptance/results/m6-sharing.json. Exit 1 when a check fails. It draws, so it takes the GPU lock.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { openFolder, behavioursImporter, checkFolder } from '@vrmxg/bundle/node';
import { workerFolder, contentSecurityPolicy } from '@vrmxg/bundle/hosting';
import { acquireGpuLock, sayWaiting } from '../gpu-lock.mjs';
import { vrmxaCore, PATHS } from '../../engine/packages/character/test/fixtures.mjs';
import { gameScenes, worldLoader, freeWorld } from '../../apps/game/src/world.js';
import { replaySession, firstDifference } from '../../apps/game/src/session.js';
import { exportRush } from '../m5/rush-node.mjs';
import { RUSH_INIT, playRushSession } from '../m5/rush-driver.mjs';

const here = import.meta.dirname, root = path.join(here, '../..');
const args = process.argv.slice(2), only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const RESULTS = path.join(root, 'acceptance/results'), LOGS = path.join(RESULTS, 'm6-sharing');
const WRANGLER = path.join(root, 'docs/node_modules/.bin/wrangler');
const checks = [], say = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
if (!fs.existsSync(PATHS.core)) { console.error('needs vrmxa-core beside the repository: the game has characters'); process.exit(1); }
const hosts = only ? [only] : ['python', 'worker'];
if (hosts.includes('worker') && !fs.existsSync(WRANGLER)) { console.error('needs docs/\'s install for Wrangler: cd docs && npm ci'); process.exit(1); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-m6-sharing-'));
const site = path.join(tmp, 'site'), dir = path.join(site, 'games/morning-rush');
const exported = await exportRush(dir);
say('the sample game exports with the game app as its runtime', checkFolder(dir).ok, `${exported.files} files, ${(exported.bytes / 1e6).toFixed(1)} MB, digest ${exported.manifest.digest.slice(0, 16)}`);
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'vrmxg-build.json'), 'utf8'));
const listed = new Set(['', 'index.html', 'vrmxg-build.json', ...manifest.files.map((f) => f.path)]);
fs.mkdirSync(LOGS, { recursive: true });

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = /** @type {any} */ (s.address()).port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function up(url, child, log, seconds = 60) {
  for (let i = 0; i < seconds * 4; i++) {
    if (child.exitCode !== null) throw new Error(`the host quit (${child.exitCode}): ${log().slice(-2000)}`);
    try { const r = await fetch(url, { redirect: 'manual' }); if (r.status < 500) return; } catch { /* not yet */ }
    await wait(250);
  }
  throw new Error(`the host didn't answer at ${url}: ${log().slice(-2000)}`);
}
/** Every TCP socket listening in a process tree, as "address:port". */
function listeners(pid) {
  const pids = [pid];
  for (let i = 0; i < pids.length; i++) { try { pids.push(...execFileSync('pgrep', ['-P', String(pids[i])], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number)); } catch { /* none */ } }
  let out = '';
  try { out = execFileSync('lsof', ['-nP', '-a', '-p', pids.join(','), '-iTCP', '-sTCP:LISTEN', '-Fn'], { encoding: 'utf8' }); } catch { /* none */ }
  return [...new Set(out.split('\n').filter((l) => l.startsWith('n')).map((l) => l.slice(1)))];
}
const loopback = (a) => /^(127\.0\.0\.1|\[::1\]|localhost):\d+$/.test(a);

/** Start a host; → { base, child, stop, log, listeners }. */
async function startHost(name) {
  const port = await freePort();
  let text = '';
  if (name === 'python') {
    const child = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', site], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { text += d; }); child.stderr.on('data', (d) => { text += d; });
    const base = `http://127.0.0.1:${port}/games/morning-rush/`;
    await up(base, child, () => text);
    return { base, child, log: () => text, what: `Python ${execFileSync('python3', ['--version'], { encoding: 'utf8' }).trim().replace(/^Python /, '')} http.server` };
  }
  const folder = path.join(tmp, 'worker'), inspector = await freePort();
  const w = workerFolder({ build: dir, out: folder });
  const child = spawn(WRANGLER, ['dev', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspector), '--persist-to', path.join(tmp, 'wrangler-state'), '--log-level', 'warn'],
    { cwd: folder, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', NO_COLOR: '1' } });
  child.stdout.on('data', (d) => { text += d; }); child.stderr.on('data', (d) => { text += d; });
  const base = `http://127.0.0.1:${port}/`;
  await up(base, child, () => text, 120);
  return { base, child, log: () => text, worker: w, what: `Wrangler ${execFileSync(WRANGLER, ['--version'], { encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } }).trim().split('\n').pop()} dev (workerd, local)` };
}

/** Fetch what a host serves: the page by its folder and its file, and every file the manifest lists. */
async function survey(host) {
  const types = {}, bad = [], redirects = {};
  for (const [label, url] of [['folder without its slash', host.base.replace(/\/$/, '')], ['index.html with a query', `${host.base}index.html?trace`]]) {
    if (label === 'folder without its slash' && new URL(host.base).pathname === '/') continue;
    const r = await fetch(url, { redirect: 'manual' });
    redirects[label] = { status: r.status, location: r.headers.get('location') };
  }
  const page = await fetch(host.base);
  const csp = page.headers.get('content-security-policy');
  const asset = manifest.files.find((f) => f.path.startsWith('assets/') && f.path.endsWith('.js')).path;
  const assetRes = await fetch(new URL(asset, host.base)), headersRes = await fetch(new URL('_headers', host.base));
  await assetRes.arrayBuffer(); await headersRes.arrayBuffer();
  const caching = { page: page.headers.get('cache-control'), asset: assetRes.headers.get('cache-control'), assetCsp: assetRes.headers.get('content-security-policy') === csp, headersFile: headersRes.status };
  for (const f of ['vrmxg-build.json', ...manifest.files.map((x) => x.path)]) {
    const r = await fetch(new URL(f, host.base));
    const ext = path.extname(f) || f, type = (r.headers.get('content-type') ?? '').split(';')[0];
    (types[ext] ??= new Set()).add(type);
    if (r.status !== 200) bad.push(`${f} ${r.status}`);
    await r.arrayBuffer();
  }
  return { page: { status: page.status, type: page.headers.get('content-type') }, csp, caching, redirects, bad, types: Object.fromEntries(Object.entries(types).sort().map(([k, v]) => [k, [...v]])) };
}

let pw;
try { pw = createRequire(path.join(root, 'spike-determinism/web/package.json'))('playwright-core'); } catch { pw = createRequire(path.join(here, '../../../../../spike-determinism/web/package.json'))('playwright-core'); }
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const release = await acquireGpuLock({ who: 'acceptance/m6/sharing.mjs', onWait: sayWaiting('acceptance/m6/sharing.mjs') });
const browser = await pw.chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'] });
const chromium = browser.version();

const results = {};
try {
  for (const name of hosts) {
    const host = await startHost(name);
    try {
      const sockets = listeners(host.child.pid);
      say(`${name}: every socket the host listens on is on loopback`, sockets.length > 0 && sockets.every(loopback), `${host.what}: ${sockets.join(', ')}`);
      const s = await survey(host);
      const jsOk = s.types['.js']?.every((t) => /^(text|application)\/javascript$/.test(t)), wasmOk = s.types['.wasm']?.every((t) => t === 'application/wasm');
      say(`${name}: the page and every file the manifest lists are served (scripts as JavaScript, WebAssembly as application/wasm)`, s.page.status === 200 && s.bad.length === 0 && jsOk && wasmOk,
        `${manifest.files.length + 1} files; page ${s.page.status} ${s.page.type}; ${s.bad.length ? `failed: ${s.bad.join(', ')}; ` : ''}types ${JSON.stringify(s.types)}; redirects ${JSON.stringify(s.redirects)}`);
      if (name === 'worker') say('worker: the build\'s _headers apply: the page revalidated, assets/ cached for good, the CSP on both, the file itself not served', s.caching.page === 'no-cache' && s.caching.asset === 'public, max-age=31536000, immutable' && s.caching.assetCsp && s.caching.headersFile === 404, JSON.stringify(s.caching));
      if (name === 'worker') say('worker: the page is served with the build\'s Content Security Policy, which allows no eval', !!s.csp && !/'unsafe-eval'/.test(s.csp) && s.csp === contentSecurityPolicy(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')), s.csp ?? 'no CSP header');

      // play it
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const violations = [], requests = [], failed = [], errors = [];
      await context.exposeBinding('__cspReport', (_, v) => { violations.push(v); });
      await context.addInitScript(`document.addEventListener('securitypolicyviolation', (e) => window.__cspReport({ directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample, source: e.sourceFile + ':' + e.lineNumber }));`);
      await context.addInitScript(RUSH_INIT);
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('response', (r) => requests.push({ url: r.url(), status: r.status(), type: (r.headers()['content-type'] ?? '').split(';')[0] }));
      page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
      let env = null;
      page.once('load', async () => { try { env = await page.evaluate(() => ({ protocol: location.protocol, crossOriginIsolated: self.crossOriginIsolated, sharedArrayBuffer: typeof SharedArrayBuffer, secure: self.isSecureContext })); } catch { /* closed */ } });
      const t0 = Date.now();
      const session = await playRushSession(page, `${host.base}?trace`, 'win');
      await context.close();
      fs.writeFileSync(path.join(LOGS, `${name}-win.json`), JSON.stringify(session.log));
      for (const [k, png] of Object.entries(session.shots)) fs.writeFileSync(path.join(RESULTS, `m6-sharing-${name}-${k}.png`), png);
      const choices = session.log.segments.flatMap((g) => g.recording?.frames.filter((f) => f[2]?.['dialogue.choose']).map((f) => f[2]['dialogue.choose']) ?? []);
      say(`${name}: played from the title menu to the won ending`, session.scenes.includes('game/won.vrmxs') && choices.length >= 3,
        `${session.scenes.join(' → ')}; ${session.log.hashes.length} steps in ${((Date.now() - t0) / 1000).toFixed(0)} s; choices ${choices.join(', ')}; ending line "${session.seen.endingLine}"`);
      say(`${name}: no cross-origin isolation and no SharedArrayBuffer, over plain http`, env && env.crossOriginIsolated === false && env.sharedArrayBuffer === 'undefined' && env.protocol === 'http:', JSON.stringify(env));
      const origin = new URL(host.base).origin, basePath = new URL(host.base).pathname;
      const outside = requests.filter((r) => !/^(data|blob):/.test(r.url)).filter((r) => {
        const u = new URL(r.url);
        return u.origin !== origin || !u.pathname.startsWith(basePath) || !listed.has(decodeURIComponent(u.pathname.slice(basePath.length)));
      });
      const notOk = requests.filter((r) => !/^(data|blob):/.test(r.url) && (r.status < 200 || r.status >= 400));
      say(`${name}: every request the page made was for a file of the build and succeeded`, outside.length === 0 && notOk.length === 0 && failed.length === 0,
        `${requests.length} responses (${new Set(requests.map((r) => r.url)).size} URLs)${outside.length ? `; outside the build: ${outside.slice(0, 5).map((r) => r.url).join(', ')}` : ''}${notOk.length ? `; failed: ${notOk.slice(0, 5).map((r) => `${r.url} ${r.status}`).join(', ')}` : ''}${failed.length ? `; failed: ${failed.slice(0, 5).join(', ')}` : ''}`);
      say(`${name}: no Content Security Policy violation was reported${s.csp ? ' (under the build\'s CSP)' : ''}`, violations.length === 0, violations.length ? JSON.stringify(violations.slice(0, 5)) : s.csp ? 'none, with the policy on' : 'none (this host sets no policy)');
      say(`${name}: no errors in the page`, errors.length === 0, errors.slice(0, 5).join(' | '));
      results[name] = { host: host.what, base: host.base.replace(/:\d+\//, ':<port>/'), sockets: sockets.map((a) => a.replace(/:\d+$/, ':<port>')), survey: { ...s, csp: s.csp }, env, session: { steps: session.log.hashes.length, scenes: session.scenes, final: session.log.hashes.at(-1), seen: session.seen, log: `acceptance/results/m6-sharing/${name}-win.json` }, requests: requests.length, violations, worker: host.worker ? { name: host.worker.name, files: host.worker.files, bytes: host.worker.bytes, largest: host.worker.largest } : undefined, log: session.log };
    } finally {
      host.child.kill('SIGINT');
      await wait(1500);
      if (host.child.exitCode === null) host.child.kill('SIGKILL');
    }
  }
} finally {
  await browser.close().catch(() => {});
  release();
}

// ---------------------------------------------------------------- each session replayed in Node
installPortableMath();
const build = await openFolder(dir);
const core = await vrmxaCore(), closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
const scenes = gameScenes(build.bytes, build.game), docs = await scenes.documents();
const load = worldLoader({ R: await loadRapier(), scenes, behaviours: await build.behaviours(behavioursImporter(dir)), actions: await build.actions(), vrmxaCore: core, closet, options: () => ({ stubTextures: true }) });
for (const [name, r] of Object.entries(results)) {
  const replay = await replaySession(r.log, { digest: build.manifest.digest, load, unload: freeWorld, scenes: docs.scenes, prefabs: docs.prefabs });
  const diff = firstDifference(replay, r.log.hashes);
  r.nodeReplay = { steps: replay.length, final: replay.at(-1) };
  say(`${name}: the session played from this host replays in Node to the same hash after every step`, diff < 0 && replay.length === r.log.hashes.length, diff < 0 ? `${replay.length} steps, final ${replay.at(-1)?.hash} at step ${replay.at(-1)?.step}` : `first difference at ${diff}`);
  delete r.log;
}
fs.rmSync(tmp, { recursive: true, force: true });

const ok = checks.every((c) => c.ok);
fs.writeFileSync(path.join(RESULTS, 'm6-sharing.json'), `${JSON.stringify({
  check: 'M6 W7: The Morning Rush\'s web build served by a plain static server (Python) and by a Cloudflare Worker run locally (Wrangler dev, workerd), on loopback only, played to the won ending through each in Chromium, each session replayed in Node (AB-T-0648, exit check 8)',
  ok, node: process.version, chromium, build: { game: build.game.id, files: exported.files, bytes: exported.bytes, digest: exported.manifest.digest, manifest: exported.sha256, runtime: `${build.manifest.runtime.name} ${build.manifest.runtime.version}` },
  hosts: results, checks,
}, null, 1)}\n`);
console.log(ok ? 'all checks pass' : 'some checks failed');
process.exit(ok ? 0 : 1);
