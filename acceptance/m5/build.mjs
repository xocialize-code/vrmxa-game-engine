// M5 W0 (AB-T-0615), M5's exit check 1: the sample project exported as a game build.
//
//   node acceptance/m5/build.mjs                    Node only: two exports compared, the manifest, the refusal, the replay
//   node acceptance/m5/build.mjs --chromium         and the build opened in headless Chromium by the runtime inside it
//   node acceptance/m5/build.mjs --mac <a> <b> …    and builds the Mac editor wrote (Export Game: HAND-TEST-M5-EXPORT-GAME),
//                                                   each compared byte for byte with Node's
//   … --refused <folder> …                          and where an export the editor refused would have gone: nothing is there
//   … --kept <folder> …                             and a folder with someone's file in it that the editor refused: only that file is there
//
// What it checks:
//   1  two exports in two Node processes give the same folder, byte for byte, and each folder holds exactly what its
//      manifest lists;
//   2  the manifest lists every file with its SHA-256 and its licence, and a project file's licence is its row in
//      the project's LICENCES.md;
//   3  a file with no row in LICENCES.md stops the export, and the error names it; so does a scene's reference to a
//      file in another case than the project has it;
//   4  the loader opens the build, and its scene plays to the same per-step hashes as the project played straight
//      from its folder (the recorded walk, 600 steps; needs vrmxa-avatar-studio beside the repository);
//   5  (--chromium) the build's own runtime plays it in a browser to those hashes, and the browser's lexer reads a set of
//      awkward modules as Node's does (the exporter and the loader may run in different engines);
//   6  (--mac) every build from the Mac editor is the same bytes as Node's.
// Then acceptance/m5/build-wkwebview.sh plays the build in WKWebView, over the scheme and over loopback, against this
// run's hashes.
//
// Writes acceptance/results/m5-build.json; exit 1 when a check fails. Nothing here draws, so it takes no GPU lock:
// the runtime in the build steps the world with no renderer.
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { exportBuild, parseLicences, licenceOf, sha256Text, moduleImports, RUNTIME_FILE, BUILD_FILE, GAME_FILE } from '@vrmxg/bundle';
import { LEXER_CASES, readLexerCases } from '../../engine/packages/bundle/runtime/lexer-cases.js';
import { folderReader, openFolder, checkFolder, compareFolders, scanFolder, behavioursImporter } from '@vrmxg/bundle/node';
import { playScene } from '../../engine/packages/bundle/runtime/play.js';
import { vrmxaCore, PATHS } from '../../engine/packages/character/test/fixtures.mjs';

const here = import.meta.dirname, root = path.join(here, '../..');
const project = path.join(root, 'content/sample'), pkg = path.join(root, 'engine/packages/bundle');
const runtime = path.join(pkg, 'runtime/dist'), cli = path.join(pkg, 'src/cli.js');
const args = process.argv.slice(2), TAKE = 'input/walk-in.json', STEPS = 600;
const list = (flag) => { const i = args.indexOf(flag); if (i < 0) return []; const rest = args.slice(i + 1), end = rest.findIndex((a) => a.startsWith('--')); return end < 0 ? rest : rest.slice(0, end); };
const mac = list('--mac'), refused = list('--refused'), kept = list('--kept');
const checks = [], say = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };

// the runtime that goes into the build: built here when it isn't there (or with --rebuild)
if (args.includes('--rebuild') || !fs.existsSync(path.join(runtime, RUNTIME_FILE))) execFileSync('npx', ['vite', 'build', '--config', path.join(pkg, 'runtime/vite.config.js')], { cwd: pkg, stdio: ['ignore', 'ignore', 'inherit'] });

// 1: two exports, two processes
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-m5-build-'));
const dirs = ['a', 'b'].map((n) => path.join(tmp, n));
const runs = dirs.map((d) => JSON.parse(execFileSync(process.execPath, [cli, project, d, '--runtime', runtime], { encoding: 'utf8' })));
const folders = dirs.map((d) => checkFolder(d));
const same = compareFolders(dirs[0], dirs[1]);
say('two Node exports are the same bytes', same.same && runs[0].manifest === runs[1].manifest, `${same.files} files, manifest ${runs[0].manifest.slice(0, 16)}`);
say('each folder is what its manifest lists', folders.every((f) => f.ok), folders.map((f) => `${f.files} files, ${f.missing.length} missing, ${f.changed.length} changed, ${f.extra.length} extra`).join('; '));

// 2: every file has a hash and a licence
const manifest = JSON.parse(fs.readFileSync(path.join(dirs[0], BUILD_FILE), 'utf8'));
const rows = parseLicences(fs.readFileSync(path.join(project, 'LICENCES.md'), 'utf8'));
const projectFiles = manifest.files.filter((f) => f.role === 'project'), runtimeFiles = manifest.files.filter((f) => f.role === 'runtime');
const whole = manifest.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256) && typeof f.licence === 'string' && f.licence.length > 0 && Number.isInteger(f.bytes));
const licensed = projectFiles.every((f) => licenceOf(rows, f.path.slice(manifest.project.length))?.licence === f.licence);
say('the manifest lists every file with its hash and licence', whole && licensed && projectFiles.length > 0 && runtimeFiles.length > 0, `${projectFiles.length} project files, ${runtimeFiles.length} runtime files, ${manifest.bytes} bytes`);

// 3: a file with no licence row stops the export, and the error names it
const src = folderReader(project), extra = 'props/found-on-the-web.glb';
const game = JSON.parse(fs.readFileSync(path.join(project, GAME_FILE), 'utf8'));
let refusal = null, wrote = 0;
try {
  await exportBuild({
    project: { files: [...src.files, extra], read: (ref) => (ref === extra ? Promise.resolve(new Uint8Array([1, 2, 3])) : src.read(ref)) },
    runtime: folderReader(runtime), game: { ...game, include: [...game.include, extra] }, write: async () => { wrote++; },
  });
} catch (e) { refusal = { code: e.code, message: e.message, files: e.files }; }
say('a file with no licence row stops the export, by name', refusal?.code === 'no_licence' && refusal.message.includes(extra) && refusal.files.includes(extra) && wrote === 0, refusal ? `"${refusal.message}"` : 'the export went through');

// 3b: a scene that names a file in another case than the project has it stops the export too (a Mac's disk would open
// it; a build served from anywhere would not), and the error names the scene and both spellings
let wrongCase = null;
try {
  const scene = JSON.parse(new TextDecoder().decode(await src.read(game.entry)));
  scene.assets[0].ref = scene.assets[0].ref.replace(/^[a-z]/, (c) => c.toUpperCase());
  const body = new TextEncoder().encode(JSON.stringify(scene));
  await exportBuild({ project: { files: src.files, read: (ref) => (ref === game.entry ? Promise.resolve(body) : src.read(ref)) }, runtime: folderReader(runtime), game, write: async () => { wrote++; } });
} catch (e) { wrongCase = { code: e.code, message: e.message, files: e.files }; }
say('a reference in another case than the file stops the export, naming the scene', wrongCase?.code === 'missing_file' && wrongCase.message.startsWith(`${game.entry} names `) && wrongCase.files.length === 2 && wrote === 0, wrongCase ? `"${wrongCase.message}"` : 'the export went through');

// 3c: what a module imports, read by the lexer: a set of awkward modules (the ones a hand-written scanner got wrong
// in review) read as expected here; step 5 and build-wkwebview.sh compare the browsers' readings with this one
const lexer = readLexerCases(moduleImports), lexerOk = LEXER_CASES.every((c, k) => JSON.stringify(lexer[k]) === JSON.stringify(c.imports));
say('the lexer reads every awkward module as expected', lexerOk, `${LEXER_CASES.length} modules, ${lexer.filter((x) => x === 'refused').length} refused`);

// 4: the build through the loader against the project played directly
let replay = { skipped: 'needs vrmxa-avatar-studio beside the repository' }, direct = null, modules = null;
if (fs.existsSync(PATHS.core)) {
  installPortableMath();
  const R = await loadRapier(), core = await vrmxaCore(), closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const fns = (mod) => new Map(Object.entries(mod).filter(([, v]) => typeof v === 'function'));
  direct = await playScene({ R, bytes: src.read, scene: game.entry, behaviours: fns(await import(path.join(project, 'behaviours.js'))), vrmxaCore: core, closet, take: TAKE, steps: STEPS });
  const build = await openFolder(dirs[0]);
  const viaBuild = await playScene({ R, bytes: build.bytes, scene: build.game.entry, behaviours: await build.behaviours(behavioursImporter(dirs[0])), actions: await build.actions(), vrmxaCore: core, closet, take: TAKE, steps: STEPS });
  const firstDiff = direct.hashes.findIndex((h, i) => h !== viaBuild.hashes[i]);
  modules = await build.modules(build.game.behaviours);
  replay = { steps: STEPS, take: TAKE, components: direct.components, final: direct.final, hashesDigest: sha256Text(direct.hashes.join('\n')), viaBuild: viaBuild.final, firstDifference: firstDiff < 0 ? null : firstDiff, filesRead: build.checked.size };
  say('the loaded build plays to the project\'s per-step hashes', firstDiff < 0 && viaBuild.hashes.length === STEPS + 1, `${STEPS} steps, ${direct.components} components, final ${direct.final}; ${build.checked.size} files read and checked`);
  // and nothing outside the build is reachable through the loader
  let refused = null;
  try { await build.bytes('cafe-cart.vrmxs'); } catch (e) { refused = e.code; }
  say('the loader refuses a file the manifest doesn\'t list', refused === 'not_in_build', refused ?? 'it answered');
} else say('the loaded build plays to the project\'s per-step hashes', false, replay.skipped);

// 5: the runtime in the build, in a browser
let chromium = null;
if (args.includes('--chromium')) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' };
  const server = http.createServer((req, res) => {
    const f = path.join(dirs[0], decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/$/, '/index.html')));
    if (!f.startsWith(dirs[0]) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
  let pw;
  try { pw = createRequire(path.join(root, 'spike-determinism/web/package.json'))('playwright-core'); } catch { pw = createRequire(path.join(PATHS.core, '../../../../../vrmxa-game-engine/spike-determinism/web/package.json'))('playwright-core'); }
  const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const browser = await pw.chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${/** @type {any} */ (server.address()).port}/index.html?check=${encodeURIComponent(TAKE)}&steps=${STEPS}`);
  await page.waitForFunction(() => /** @type {any} */ (window).READY === true, null, { timeout: 300000 });
  const r = await page.evaluate(() => { const w = /** @type {any} */ (window); return { ...w.__result, errors: w.__errors }; });
  const version = browser.version();
  await browser.close(); server.close();
  const firstDiff = direct && r.hashes ? direct.hashes.findIndex((h, i) => h !== r.hashes[i]) : 0;
  const sameLexer = JSON.stringify(r.lexer) === JSON.stringify(lexer) && JSON.stringify(r.modules) === JSON.stringify(modules);
  chromium = { version, final: r.final ?? null, steps: r.steps ?? null, digest: r.digest ?? null, verified: r.verified ?? null, firstDifference: firstDiff < 0 ? null : firstDiff, sameLexer, errors: [...errors, ...(r.errors ?? [])] };
  say('Chromium\'s lexer reads the awkward modules, and the game\'s own, as Node\'s does', sameLexer, `${r.lexer?.length ?? 0} modules; the game's graph ${JSON.stringify(r.modules)}`);
  say('the build\'s runtime plays it in Chromium to the same hashes', !!direct && firstDiff < 0 && r.hashes?.length === STEPS + 1 && r.digest === manifest.digest && !chromium.errors.length, `Chromium ${version}, final ${r.final}${chromium.errors.length ? `; errors: ${chromium.errors.join('; ')}` : ''}`);
}

// 6: the Mac editor's builds
const macBuilds = mac.map((d) => {
  const c = fs.existsSync(path.join(d, BUILD_FILE)) ? { folder: checkFolder(d), cmp: compareFolders(dirs[0], d) } : null;
  const ok = !!c && c.folder.ok && c.cmp.same;
  say(`the Mac editor's build ${path.basename(d)} is Node's, byte for byte`, ok, c ? `${c.cmp.files} files, ${c.cmp.differ.length} differ, ${c.cmp.onlyA.length} missing, ${c.cmp.onlyB.length} extra; manifest ${c.folder.manifest.slice(0, 16)}` : `no ${BUILD_FILE} there`);
  return { name: path.basename(d), ok, manifest: c?.folder.manifest ?? null, differ: c?.cmp.differ ?? null, missing: c?.cmp.onlyA ?? null, extra: c?.cmp.onlyB ?? null };
});

// and the folder of an export the editor refused: nothing was made there
const macRefused = refused.map((d) => { const ok = !fs.existsSync(d); say(`the Mac editor's refused export ${path.basename(d)} wrote nothing`, ok, ok ? 'no folder' : 'a folder is there'); return { name: path.basename(d), ok }; });

// and a folder that held someone's file, which the editor refused to export into: the file is there and nothing else
const macKept = kept.map((d) => { const there = fs.existsSync(d) ? scanFolder(d) : null, all = there ? [...there.files, ...there.foreign, ...there.stale] : []; const ok = all.length === 1; say(`the Mac editor left ${path.basename(d)} as it was`, ok, there ? `holds ${all.join(', ') || 'nothing'}` : 'no folder'); return { name: path.basename(d), ok, holds: all }; });

fs.rmSync(tmp, { recursive: true, force: true });
const ok = checks.every((c) => c.ok);
const result = {
  check: 'M5 exit check 1: a project exports as a game (AB-T-0615)', ok, node: process.version,
  build: { game: manifest.game.id, entry: manifest.game.entry, runtime: manifest.runtime, files: manifest.files.length, projectFiles: projectFiles.length, runtimeFiles: runtimeFiles.length, bytes: manifest.bytes, digest: manifest.digest, manifestSha256: runs[0].manifest },
  nodeRuns: runs.map((r) => ({ manifest: r.manifest, digest: r.digest, files: r.files, bytes: r.bytes })),
  refusal, wrongCase, lexer: { cases: LEXER_CASES.length, digest: sha256Text(JSON.stringify(lexer)), modules }, replay, chromium, mac: macBuilds, macRefused, macKept, checks,
};
fs.writeFileSync(path.join(here, '../results/m5-build.json'), `${JSON.stringify(result, null, 1)}\n`);
console.log(`${ok ? 'passed' : 'FAILED'}: ${checks.filter((c) => c.ok).length} of ${checks.length}; build ${manifest.digest.slice(0, 16)}, manifest ${runs[0].manifest.slice(0, 16)}`);
process.exit(ok ? 0 : 1);
