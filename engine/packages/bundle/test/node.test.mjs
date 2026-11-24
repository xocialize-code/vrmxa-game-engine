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
import { exportToFolder, openFolder, checkFolder, compareFolders, prepareFolder, behavioursImporter, listFolder } from '@vrmxg/bundle/node';
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
  // a folder with someone's files in it
  const mine = path.join(tmp, 'mine');
  fs.mkdirSync(mine); fs.writeFileSync(path.join(mine, 'thesis.txt'), 'years of work');
  await assert.rejects(exportToFolder({ project: P, runtime: R, out: mine }), (e) => e.code === 'not_empty' && /thesis\.txt/.test(e.message));
  assert.deepEqual(fs.readdirSync(mine), ['thesis.txt']);
  // an earlier build with a stray file beside it: the build's files go, the stray file stops the export
  fs.writeFileSync(path.join(d, 'notes.txt'), 'mine');
  assert.throws(() => prepareFolder(d), (e) => e.code === 'not_empty' && e.files.join() === 'notes.txt');
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
