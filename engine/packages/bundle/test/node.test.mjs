// Builds on disk: the folder an export goes into, the checks of a folder, the command line, and a project's
// behaviours imported from a build with the engine's own core.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Behaviour } from '@vrmxg/core';
import { BUILD_FILE } from '@vrmxg/bundle';
import { exportToFolder, openFolder, checkFolder, compareFolders, planFolder, stageFolder, scanFolder, folderReader, behavioursImporter, listFolder, STAGING } from '@vrmxg/bundle/node';
import { exportBuild, serializeManifest, parseManifest } from '@vrmxg/bundle';
import { project, runtime, GAME } from './helpers.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-bundle-test-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
function onDisk(name, mem) {
  const dir = path.join(tmp, name);
  for (const [p, bytes] of mem.map) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), bytes); }
  return dir;
}
const P = onDisk('project', project()), R = onDisk('runtime', runtime());
const cli = path.resolve(import.meta.dirname, '../src/cli.js');

test('a project folder exports to a build folder, twice the same, and each is what its manifest lists', async () => {
  const a = path.join(tmp, 'a'), b = path.join(tmp, 'b');
  const ra = await exportToFolder({ project: P, runtime: R, out: a }), rb = await exportToFolder({ project: P, runtime: R, out: b });
  assert.equal(ra.sha256, rb.sha256);
  assert.deepEqual(compareFolders(a, b), { same: true, files: 16, onlyA: [], onlyB: [], differ: [] });
  const c = checkFolder(a);
  assert.deepEqual([c.ok, c.files, c.manifest, c.digest], [true, 15, ra.sha256, ra.manifest.digest]);
  assert.ok(!listFolder(a, { hidden: true }).some((f) => f.includes('.DS_Store')), 'hidden files stay behind');
});

test('a folder that is not the build its manifest describes is found out', async () => {
  const d = path.join(tmp, 'c');
  await exportToFolder({ project: P, runtime: R, out: d });
  fs.writeFileSync(path.join(d, 'project/props/door.glb'), 'changed');
  fs.rmSync(path.join(d, 'project/lib/maths.js'));
  fs.writeFileSync(path.join(d, 'extra.txt'), 'left behind');
  const c = checkFolder(d);
  assert.deepEqual([c.ok, c.changed, c.missing, c.extra], [false, ['project/props/door.glb'], ['project/lib/maths.js'], ['extra.txt']]);
  assert.equal(compareFolders(path.join(tmp, 'a'), d).same, false);
});

test('an export goes into an empty folder or over an earlier build, never over anything else', async () => {
  const d = path.join(tmp, 'd');
  await exportToFolder({ project: P, runtime: R, out: d });
  // over an earlier build: what the new one doesn't hold is gone
  const smaller = onDisk('project-smaller', project({ 'level.vrmxs': JSON.stringify({ format: 'vrmxs', version: 1, id: 'level', nodes: [] }), 'game.json': JSON.stringify({ ...GAME, behaviours: undefined, animations: undefined }) }));
  await exportToFolder({ project: smaller, runtime: R, out: d });
  assert.ok(checkFolder(d).ok);
  assert.ok(!fs.existsSync(path.join(d, 'project/prefabs')) && !fs.existsSync(path.join(d, 'project/behaviours.js')));
  assert.deepEqual(scanFolder(d).stale, [], 'no staging folder is left');
  // a folder with someone's files in it
  const mine = path.join(tmp, 'mine');
  fs.mkdirSync(mine); fs.writeFileSync(path.join(mine, 'thesis.txt'), 'years of work');
  await assert.rejects(exportToFolder({ project: P, runtime: R, out: mine }), (e) => e.code === 'not_empty' && /thesis\.txt/.test(e.message));
  assert.deepEqual(fs.readdirSync(mine), ['thesis.txt']);
});

// what the folder held before, file by file, to show an export that was refused changed nothing
const snapshot = (dir) => Object.fromEntries(listFolder(dir, { hidden: true }).map((f) => [f, fs.readFileSync(path.join(dir, f)).toString('base64')]));

test('an earlier build with a stray file beside it is refused before anything is deleted', async () => {
  const d = path.join(tmp, 'stray');
  await exportToFolder({ project: P, runtime: R, out: d });
  fs.writeFileSync(path.join(d, 'notes.txt'), 'mine');
  const before = snapshot(d);
  assert.throws(() => planFolder(d), (e) => e.code === 'not_empty' && e.files.join() === 'notes.txt' && /holds files its build doesn't list \(notes\.txt\)/.test(e.message));
  await assert.rejects(exportToFolder({ project: P, runtime: R, out: d }), (e) => e.code === 'not_empty');
  assert.deepEqual(snapshot(d), before, 'the earlier build and the stray file are all still there');
  fs.rmSync(path.join(d, 'notes.txt'));
  assert.ok(checkFolder(d).ok, 'and the build is still whole');
});

test('a link in the folder is never written or deleted through', async () => {
  const outside = path.join(tmp, 'outside');
  fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'level.vrmxs'), 'not the build\'s');
  // a folder holding only a link named like the build's own folder is not empty
  const a = path.join(tmp, 'link-only');
  fs.mkdirSync(a); fs.symlinkSync(outside, path.join(a, 'project'));
  await assert.rejects(exportToFolder({ project: P, runtime: R, out: a }), (e) => e.code === 'not_empty' && /holds a link or a special file \(project\)/.test(e.message));
  assert.equal(fs.readFileSync(path.join(outside, 'level.vrmxs'), 'utf8'), 'not the build\'s', 'nothing was written through the link');
  assert.deepEqual(fs.readdirSync(outside), ['level.vrmxs']);
  // an earlier build whose folder has been swapped for a link: its manifest's rows don't reach the files behind it
  const b = path.join(tmp, 'link-in-build');
  await exportToFolder({ project: P, runtime: R, out: b });
  fs.rmSync(path.join(b, 'project'), { recursive: true }); fs.symlinkSync(outside, path.join(b, 'project'));
  await assert.rejects(exportToFolder({ project: P, runtime: R, out: b }), (e) => e.code === 'not_empty');
  assert.equal(fs.readFileSync(path.join(outside, 'level.vrmxs'), 'utf8'), 'not the build\'s', 'nothing was deleted through the link');
  // a link deeper down, and a link to a file
  const c = path.join(tmp, 'link-deep');
  await exportToFolder({ project: P, runtime: R, out: c });
  fs.symlinkSync(path.join(outside, 'level.vrmxs'), path.join(c, 'project/lib/also.js'));
  assert.throws(() => planFolder(c), (e) => e.code === 'not_empty' && e.files.join() === 'project/lib/also.js');
  assert.equal(checkFolder(c).ok, false, 'and a folder with a link in it is not the build its manifest describes');
  assert.deepEqual(checkFolder(c).extra, ['project/lib/also.js']);
  // the folder itself may be reached through a link: the person named it
  const real = path.join(tmp, 'real-out'), via = path.join(tmp, 'via-link');
  fs.mkdirSync(real); fs.symlinkSync(real, via);
  const r = await exportToFolder({ project: P, runtime: R, out: via });
  assert.equal(r.out, fs.realpathSync(real));
  assert.ok(checkFolder(real).ok);
});

test('only regular files an earlier manifest lists are removed: a row that names a folder deletes nothing in it', async () => {
  const d = path.join(tmp, 'dir-row');
  const r = await exportToFolder({ project: P, runtime: R, out: d });
  // the manifest rewritten to list a folder, with a file of someone's inside it
  fs.mkdirSync(path.join(d, 'keep')); fs.writeFileSync(path.join(d, 'keep/mine.txt'), 'mine');
  const m = structuredClone(r.manifest);
  m.files.splice(m.files.findIndex((f) => f.path > 'keep'), 0, { path: 'keep', role: 'runtime', bytes: 0, sha256: '0'.repeat(64), licence: 'x' });
  m.digest = parseManifest(serializeManifest({ ...m, digest: (await import('@vrmxg/bundle')).filesDigest(m.files) })).digest;
  fs.writeFileSync(path.join(d, 'vrmxg-build.json'), serializeManifest(m));
  await assert.rejects(exportToFolder({ project: P, runtime: R, out: d }), (e) => e.code === 'not_empty' && e.files.join() === 'keep/mine.txt');
  assert.equal(fs.readFileSync(path.join(d, 'keep/mine.txt'), 'utf8'), 'mine');
});

test('an earlier manifest of another version, or one that isn\'t a build\'s, is not licence to clear the folder', async () => {
  for (const [name, edit] of [['v2', (m) => ({ ...m, version: 2 })], ['other', () => ({ format: 'something else' })], ['broken', () => null]]) {
    const d = path.join(tmp, `old-${name}`);
    const r = await exportToFolder({ project: P, runtime: R, out: d });
    const next = edit(r.manifest);
    fs.writeFileSync(path.join(d, 'vrmxg-build.json'), next ? JSON.stringify(next) : '{ not json');
    const before = snapshot(d);
    await assert.rejects(exportToFolder({ project: P, runtime: R, out: d }), (e) => e.code === 'not_empty' && /this exporter can't read/.test(e.message), name);
    assert.deepEqual(snapshot(d), before, name);
  }
});

test('an export that fails on the way leaves the earlier build whole and the folder free for the next try', async () => {
  const d = path.join(tmp, 'fails');
  const first = await exportToFolder({ project: P, runtime: R, out: d });
  const before = snapshot(d), src = folderReader(P);
  // a project file that can't be read, half way through the writes
  let stage = null, reached = 0;
  const failing = async (ref) => { if (ref === 'props/door.glb') throw new Error('the disk went away'); return src.read(ref); };
  await assert.rejects((async () => {
    try { await exportBuild({ project: { files: src.files, read: failing }, runtime: folderReader(R), ready: () => { stage = stageFolder(d); }, write: (p, b) => { reached++; return stage.write(p, b); } }); stage.commit(); } catch (e) { stage?.abort(); throw e; }
  })(), /the disk went away/);
  assert.ok(stage, 'the export had begun writing');
  assert.ok(reached > 5, `${reached} files were staged before it failed`);
  assert.deepEqual(snapshot(d), before, 'nothing of the earlier build changed, and nothing of the failed one is left');
  assert.deepEqual(scanFolder(d).stale, []);
  assert.equal((await exportToFolder({ project: P, runtime: R, out: d })).sha256, first.sha256, 'the same folder takes the next export');
  // a new folder made for an export that then fails is taken away again
  const fresh = path.join(tmp, 'fails-fresh'), s2 = stageFolder(fresh);
  await s2.write('index.html', new Uint8Array([1]));
  s2.abort();
  assert.ok(!fs.existsSync(fresh));
  await assert.rejects(s2.write('late.txt', new Uint8Array([1])), (e) => e.code === 'no_build', 'and nothing is written after it has ended');
});

test('a staged build: pieces of a file, paths that leave the folder, a build with no manifest, and one cut short while moving in', async () => {
  const d = path.join(tmp, 'staged'), s = stageFolder(d);
  await s.write('assets/big.bin', new Uint8Array([1, 2, 3]));
  await s.write('assets/big.bin', new Uint8Array([4, 5]), { append: true });
  await assert.rejects(s.write('assets/big.bin', new Uint8Array([9])), (e) => e.code === 'bad_path' && /written twice/.test(e.message));
  await assert.rejects(s.write('other.bin', new Uint8Array([9]), { append: true }), (e) => e.code === 'bad_path');
  for (const p of ['../evil.txt', '/abs.txt', 'a/../../evil.txt', 'a\\b']) await assert.rejects(s.write(p, new Uint8Array([1])), (e) => e.code === 'bad_path', p);
  assert.ok(!fs.existsSync(path.join(tmp, 'evil.txt')));
  assert.throws(() => s.commit(), (e) => e.code === 'bad_manifest', 'a build with no manifest is not moved in');
  s.abort();
  // an export cut short while its files were moving in: some in place, the rest and the manifest still staged
  const cut = path.join(tmp, 'cut-short');
  const r = await exportToFolder({ project: P, runtime: R, out: cut });
  const staging = path.join(cut, `${STAGING}interrupted`);
  fs.mkdirSync(staging);
  fs.renameSync(path.join(cut, 'vrmxg-build.json'), path.join(staging, 'vrmxg-build.json'));
  fs.mkdirSync(path.join(staging, 'project')); fs.renameSync(path.join(cut, 'project/level.vrmxs'), path.join(staging, 'project/level.vrmxs'));
  assert.equal(planFolder(cut).old.length, r.files - 1, 'the files already moved in are known by the staged manifest');
  assert.equal((await exportToFolder({ project: P, runtime: R, out: cut })).sha256, r.sha256, 'and the next export finishes the job');
  assert.ok(checkFolder(cut).ok);
  assert.deepEqual(scanFolder(cut).stale, []);
});

test('a refused export leaves the earlier build as it was', async () => {
  const d = path.join(tmp, 'e');
  const before = (await exportToFolder({ project: P, runtime: R, out: d })).sha256;
  const bad = onDisk('project-bad', project({ 'game.json': JSON.stringify({ ...GAME, include: ['notes/unlicensed.txt'] }) }));
  await assert.rejects(exportToFolder({ project: bad, runtime: R, out: d }), (e) => e.code === 'no_licence');
  const c = checkFolder(d);
  assert.deepEqual([c.ok, c.manifest], [true, before]);
});

test('the command line: an export, a check, a verify, and a refusal that names the file', async () => {
  const d = path.join(tmp, 'cli');
  const run = (...a) => spawnSync(process.execPath, [cli, ...a], { encoding: 'utf8' });
  const ok = run(P, d, '--runtime', R);
  assert.equal(ok.status, 0, ok.stderr);
  const said = JSON.parse(ok.stdout);
  assert.deepEqual([said.game, said.files, said.manifest], ['test-game', 15, checkFolder(d).manifest]);
  assert.equal(JSON.parse(run(P, '--check', '--runtime', R).stdout).manifest, said.manifest, '--check says the same and writes nothing');
  assert.equal(run('--verify', d).status, 0);
  fs.appendFileSync(path.join(d, 'index.html'), ' ');
  assert.equal(run('--verify', d).status, 1);
  const bad = run(path.join(tmp, 'project-bad'), path.join(tmp, 'cli-bad'), '--runtime', R);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /export refused \(no_licence\): no row in LICENCES\.md for notes\/unlicensed\.txt/);
  assert.ok(!fs.existsSync(path.join(tmp, 'cli-bad')), 'nothing was made');
  assert.equal(run().status, 2);
});

test('a project\'s behaviours import from the build with the engine\'s own core', async () => {
  const d = path.join(tmp, 'a');
  const build = await openFolder(d);
  const behaviours = await build.behaviours(behavioursImporter(d));
  assert.deepEqual([...behaviours.keys()], ['patrol']);
  const patrol = behaviours.get('patrol');
  assert.ok(patrol.prototype instanceof Behaviour, 'the Behaviour it extends is the one the engine runs');
  const b = Object.create(patrol.prototype); b.ready();
  assert.equal(b.n, 4, 'and its own relative import came from the build');
  assert.ok(fs.existsSync(path.join(d, BUILD_FILE)));
});
