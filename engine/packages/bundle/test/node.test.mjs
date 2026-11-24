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
import { exportToFolder, openFolder, checkFolder, compareFolders, planFolder, stageFolder, scanFolder, recoverFolder, folderReader, behavioursImporter, listFolder, STAGING } from '@vrmxg/bundle/node';
import { exportBuild, openBuild, serializeManifest, parseManifest } from '@vrmxg/bundle';
import { project, runtime, GAME, LICENCES } from './helpers.mjs';

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

/** An export of the fixture project staged into `dir` and left uncommitted: the stage, and what was exported. */
async function staged(dir, mem = null, o = {}) {
  const src = mem ?? folderReader(P), stage = stageFolder(dir);
  const r = await exportBuild({ project: { files: src.files, read: src.read }, runtime: folderReader(R), write: (p, b) => stage.write(p, b), ...o });
  return { stage, r };
}

test('a file in pieces: each names where it begins, and one sent twice or out of turn is refused', async () => {
  const d = path.join(tmp, 'pieces'), s = stageFolder(d);
  await s.write('assets/big.bin', new Uint8Array([1, 2, 3]));
  await s.write('assets/big.bin', new Uint8Array([4, 5]), { offset: 3 });
  await assert.rejects(s.write('assets/big.bin', new Uint8Array([4, 5]), { offset: 3 }), (e) => e.code === 'bad_path' && /a piece at 3, and the file has 5 bytes/.test(e.message), 'the same piece again');
  await assert.rejects(s.write('assets/big.bin', new Uint8Array([9]), { offset: 7 }), (e) => e.code === 'bad_path', 'a gap');
  await assert.rejects(s.write('assets/big.bin', new Uint8Array([9])), (e) => e.code === 'bad_path' && /written twice/.test(e.message));
  await assert.rejects(s.write('other.bin', new Uint8Array([9]), { offset: 4 }), (e) => e.code === 'bad_path' && /not begun/.test(e.message));
  for (const p of ['../evil.txt', '/abs.txt', 'a/../../evil.txt', 'a\\b', `${STAGING}zz/vrmxg-build.json`, `project/${STAGING}x/y`, '.vrmxg-export/x']) await assert.rejects(s.write(p, new Uint8Array([1])), (e) => e.code === 'bad_path', p);
  assert.ok(!fs.existsSync(path.join(tmp, 'evil.txt')));
  assert.throws(() => s.commit(), (e) => e.code === 'bad_manifest', 'a build with no manifest is not moved in');
  assert.ok(!fs.existsSync(d), 'and the folder made for it is taken away');
});

test('at the end the staged files are checked against the manifest before anything moves', async () => {
  // one file where the manifest lists fifteen
  const a = path.join(tmp, 'end-missing');
  const whole = await exportToFolder({ project: P, runtime: R, out: a }), before = snapshot(a);
  const s1 = stageFolder(a);
  await s1.write('vrmxg-build.json', new TextEncoder().encode(whole.text));
  await s1.write('index.html', fs.readFileSync(path.join(a, 'index.html')));
  assert.throws(() => s1.commit(), (e) => e.code === 'bad_manifest' && /14 missing/.test(e.message));
  assert.deepEqual(snapshot(a), before, 'the earlier build is untouched, and the staging folder is gone');
  // a file that is not the one the manifest lists (a piece lost, or sent twice)
  const { stage: s2 } = await staged(a, null, { write: undefined });
  const src = folderReader(R), all = new Map();
  await exportBuild({ project: { files: folderReader(P).files, read: folderReader(P).read }, runtime: src, write: async (p, b) => { all.set(p, b); } });
  for (const [p, b] of all) await s2.write(p, p === 'project/props/door.glb' ? Uint8Array.from([...b, ...b]) : b);
  assert.throws(() => s2.commit(), (e) => e.code === 'changed' && e.files.join() === 'project/props/door.glb');
  assert.deepEqual(snapshot(a), before);
  // a file the manifest doesn't list
  const s3 = stageFolder(a);
  for (const [p, b] of all) await s3.write(p, b);
  await s3.write('project/extra.txt', new Uint8Array([1]));
  assert.throws(() => s3.commit(), (e) => e.code === 'bad_manifest' && /1 not listed: project\/extra\.txt/.test(e.message));
  assert.deepEqual(snapshot(a), before);
});

test('a commit leaves the earlier build or the new one, never neither', async () => {
  // a path that was a folder and is a file now, one that was a file and is a folder now, and a folder whose name
  // changed only by case
  const d = path.join(tmp, 'reshaped');
  const lic = (rows) => `${LICENCES}${rows.map((r) => `| \`${r}\` | Ours | |\n`).join('')}`;
  const upper = project({ 'game.json': JSON.stringify({ ...GAME, include: ['thing/inner.txt', 'other.txt', 'Extras/readme.txt'] }), 'thing/inner.txt': 'a', 'other.txt': 'b', 'Extras/readme.txt': 'c', 'LICENCES.md': lic(['thing/inner.txt', 'other.txt', 'Extras/readme.txt']) });
  upper.map.delete('extras/readme.txt'); // the fixture's own, in lower case: a Mac's disk would keep that name for both
  const one = onDisk('project-shape-1', upper);
  const two = onDisk('project-shape-2', project({ 'game.json': JSON.stringify({ ...GAME, include: ['thing', 'other.txt/inner.txt', 'extras/readme.txt'] }), thing: 'a file now', 'other.txt/inner.txt': 'a folder now', 'extras/readme.txt': 'c', 'LICENCES.md': lic(['thing', 'other.txt/inner.txt', 'extras/readme.txt']) }));
  await exportToFolder({ project: one, runtime: R, out: d });
  const r2 = await exportToFolder({ project: two, runtime: R, out: d });
  const c = checkFolder(d);
  assert.deepEqual([c.ok, c.manifest, c.missing, c.extra], [true, r2.sha256, [], []], 'the folder is the new build: file-for-folder, folder-for-file, and the folder under its new name');
  assert.ok(scanFolder(d).dirs.includes('project/extras') && !scanFolder(d).dirs.includes('project/Extras'));
  const fresh = path.join(tmp, 'reshaped-fresh');
  await exportToFolder({ project: two, runtime: R, out: fresh });
  assert.equal(compareFolders(d, fresh).same, true, 'the same folder as a fresh export of it');
  await exportToFolder({ project: one, runtime: R, out: d }); // and back again
  assert.ok(checkFolder(d).ok);

  // a move that fails half way: the earlier build is put back whole, nothing of the new one or of staging is left
  const e = path.join(tmp, 'rollback');
  const first = await exportToFolder({ project: one, runtime: R, out: e }), before = snapshot(e);
  // moves in a commit: each old file held aside, then the manifest, then each new file in. Fail at the first hold, the
  // last hold, the manifest, a new file early on, and the very last new file
  const holds = first.files, moves = holds + 1 + r2.files;
  for (const failAt of [1, holds, holds + 1, holds + 3, moves]) {
    const { stage } = await staged(e, folderReader(two));
    const rename = fs.renameSync; let n = 0;
    fs.renameSync = (...a) => { if (++n === failAt) throw new Error('the disk said no'); return rename(...a); };
    try { assert.throws(() => stage.commit(), /the disk said no/, `failing at move ${failAt}`); } finally { fs.renameSync = rename; }
    assert.deepEqual(snapshot(e), before, `after failing at move ${failAt} the folder is the earlier build, byte for byte`);
    assert.deepEqual([checkFolder(e).ok, checkFolder(e).manifest, scanFolder(e).stale], [true, first.sha256, []]);
  }
  // the worst cases: the commit fails, and then the undoing fails too. Nothing held is deleted with the staging folder
  const failing = async (block) => {
    const { stage } = await staged(e, folderReader(two));
    const rename = fs.renameSync; let n = 0, blocked = 0;
    fs.renameSync = (from, to) => {
      if (++n === holds + 3) throw new Error('the disk said no'); // a new file on its way in, after the manifest swap
      if (n > holds + 3 && String(from).includes('.held') && block(String(from)) && blocked++ < 2) throw new Error('still no');
      return rename(from, to);
    };
    try { stage.commit(); } catch (err) { return err; } finally { fs.renameSync = rename; }
    return null;
  };
  // (a) two files of the earlier build can't be put back: they stay held, the error says so, and the next export
  //     restores them by the folder's own manifest, which is the earlier build's again
  const a = await failing((from) => !from.endsWith('vrmxg-build.json'));
  assert.equal(a?.code, 'failed');
  assert.match(a.message, /^the disk said no; and 2 files of the earlier build could not be put back \(.*\): kept in \.vrmxg-export-[0-9a-f-]+, and restored by the next export into this folder$/);
  const left = scanFolder(e);
  assert.equal(left.stale.length, 1, 'the staging folder is kept: the held files are in it');
  for (const f of a.files) assert.ok(fs.existsSync(path.join(e, left.stale[0], '.held', f)), `${f} is still held`);
  await assert.rejects(openFolder(e), (err) => err.code === 'incomplete', 'until then the folder does not pass for a build');
  assert.deepEqual(recoverFolder(e).moved.sort(), [...a.files].sort());
  assert.deepEqual(snapshot(e), before, 'and the earlier build is whole');
  // (b) the earlier build's manifest can't be put back over the new one: nothing is undone, the folder is the new
  //     build's, incomplete, and the next export finishes it from the staging folder
  const b = await failing((from) => from.endsWith('vrmxg-build.json'));
  assert.match(b?.message ?? '', /^the disk said no; and the earlier build's manifest could not be put back, so the folder is the new build's, incomplete/);
  assert.deepEqual([checkFolder(e).state, checkFolder(e).manifest], ['incomplete', r2.sha256]);
  await assert.rejects(openFolder(e), (err) => err.code === 'incomplete');
  recoverFolder(e);
  assert.deepEqual([checkFolder(e).ok, checkFolder(e).manifest, scanFolder(e).stale], [true, r2.sha256, []], 'finished: the folder is the new build, whole');
  await exportToFolder({ project: one, runtime: R, out: e }); // back to the earlier build for what follows
  assert.deepEqual(snapshot(e), before);

  assert.equal((await exportToFolder({ project: two, runtime: R, out: e })).sha256, r2.sha256, 'and the next export goes through');
  assert.ok(checkFolder(e).ok);
});

test('a folder whose manifest lists files that are not there is incomplete, and says so everywhere', async () => {
  const d = path.join(tmp, 'incomplete');
  const r = await exportToFolder({ project: P, runtime: R, out: d });
  assert.equal(checkFolder(d).state, 'whole');
  // as a kill after the manifest was put in place would leave it: the manifest, and only some of its files
  fs.rmSync(path.join(d, 'project/level.vrmxs')); fs.rmSync(path.join(d, 'project/props/door.glb'));
  const c = checkFolder(d);
  assert.deepEqual([c.ok, c.state, c.missing], [false, 'incomplete', ['project/level.vrmxs', 'project/props/door.glb']]);
  await assert.rejects(openFolder(d), (e) => e.code === 'incomplete' && /^this build is incomplete: 2 of the 15 files its manifest lists are not there \(project\/level\.vrmxs, project\/props\/door\.glb\)/.test(e.message) && e.files.length === 2);
  // the loader over any reader (a page's fetch): the first listed file that isn't there says the same, by name
  const build = await openBuild(folderReader(d).read);
  await assert.rejects(build.bytes('props/door.glb'), (e) => e.code === 'incomplete' && /^this build is incomplete: project\/props\/door\.glb, which its manifest lists, is not there/.test(e.message) && e.files[0] === 'project/props/door.glb');
  await assert.rejects(build.verifyAll(), (e) => e.code === 'incomplete');
  // the command line
  const v = spawnSync(process.execPath, [cli, '--verify', d], { encoding: 'utf8' });
  assert.equal(v.status, 1);
  assert.equal(JSON.parse(v.stdout).state, 'incomplete');
  assert.match(v.stderr, /^incomplete: 2 of the 15 files the manifest lists are not there/);
  // a file that is there and wrong is a different thing
  fs.writeFileSync(path.join(d, 'project/level.vrmxs'), '{}'); fs.writeFileSync(path.join(d, 'project/props/door.glb'), 'x');
  assert.equal(checkFolder(d).state, 'different');
  // and the next export puts it right
  assert.equal((await exportToFolder({ project: P, runtime: R, out: d })).sha256, r.sha256);
  assert.equal(checkFolder(d).state, 'whole');
});

test('nothing in a staging folder is licence to delete or overwrite anything outside it', async () => {
  // a planted staging manifest that lists the folder's own files
  const d = path.join(tmp, 'planted');
  fs.mkdirSync(path.join(d, `${STAGING}old`), { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), 'my own page'); fs.writeFileSync(path.join(d, 'thesis.txt'), 'years of work');
  const some = await exportBuild({ project: { files: folderReader(P).files, read: folderReader(P).read }, runtime: folderReader(R) });
  const m = structuredClone(some.manifest);
  m.files.push({ path: 'thesis.txt', role: 'runtime', bytes: 13, sha256: '0'.repeat(64), licence: 'x' });
  m.files.sort((a, b) => (a.path < b.path ? -1 : 1)); m.digest = (await import('@vrmxg/bundle')).filesDigest(m.files); m.bytes += 13;
  fs.writeFileSync(path.join(d, `${STAGING}old`, 'vrmxg-build.json'), serializeManifest(m));
  const before = snapshot(d);
  await assert.rejects(exportToFolder({ project: P, runtime: R, out: d }), (e) => e.code === 'not_empty' && /holds files that aren't a build's \(index\.html, thesis\.txt\)/.test(e.message));
  assert.deepEqual(snapshot(d), before, 'nothing was deleted, and the planted folder was not acted on');
  // a manifest may not list a path under the staging prefix, so a build can't carry one in
  const bad = structuredClone(some.manifest);
  bad.files.unshift({ path: `${STAGING}zz/vrmxg-build.json`, role: 'runtime', bytes: 1, sha256: '0'.repeat(64), licence: 'x' });
  bad.digest = (await import('@vrmxg/bundle')).filesDigest(bad.files);
  assert.throws(() => parseManifest(serializeManifest(bad)), (e) => e.code === 'bad_manifest' && /a name an export keeps/.test(e.message));
});

test('what a cut-short export left is cleared away, and only what the folder\'s own manifest vouches for is moved in', async () => {
  // killed while the new build's files were moving in: its manifest is in place, some files still staged
  const a = path.join(tmp, 'cut-in');
  const r = await exportToFolder({ project: P, runtime: R, out: a });
  const left = path.join(a, `${STAGING}killed`);
  fs.mkdirSync(path.join(left, 'project'), { recursive: true });
  fs.renameSync(path.join(a, 'project/level.vrmxs'), path.join(left, 'project/level.vrmxs'));
  fs.renameSync(path.join(a, 'index.html'), path.join(left, 'index.html'));
  fs.writeFileSync(path.join(left, 'vrmxg-core.js'), 'not the file the manifest lists'); // a staged file that disagrees: not moved in
  fs.writeFileSync(path.join(left, 'thesis.txt'), 'planted'); // nor one the manifest doesn't list
  assert.deepEqual([checkFolder(a).ok, checkFolder(a).state], [false, 'incomplete']);
  await assert.rejects(openFolder(a), (e) => e.code === 'incomplete' && /index\.html/.test(e.message), 'killed after the manifest swap, the folder does not pass for a build');
  assert.deepEqual(recoverFolder(a), { moved: ['index.html', 'project/level.vrmxs'], removed: [`${STAGING}killed`] });
  assert.deepEqual([checkFolder(a).ok, checkFolder(a).manifest], [true, r.sha256], 'the build is whole again');
  assert.ok(!fs.existsSync(path.join(a, 'thesis.txt')));
  // killed while the earlier build's files were on their way out: its manifest is still in place, its files held
  const b = path.join(tmp, 'cut-out');
  await exportToFolder({ project: P, runtime: R, out: b });
  const held = path.join(b, `${STAGING}killed`, '.held');
  for (const f of listFolder(b, { hidden: true }).filter((x) => x !== 'vrmxg-build.json')) { fs.mkdirSync(path.dirname(path.join(held, f)), { recursive: true }); fs.renameSync(path.join(b, f), path.join(held, f)); }
  const again = await exportToFolder({ project: P, runtime: R, out: b }); // the next export puts it right first, then replaces it
  assert.deepEqual([checkFolder(b).ok, again.sha256, scanFolder(b).stale], [true, r.sha256, []]);
  // staging folders don't pile up: after refusals and failures there is none
  const c = path.join(tmp, 'no-pile');
  await exportToFolder({ project: P, runtime: R, out: c });
  for (let k = 0; k < 3; k++) { const s = stageFolder(c); await s.write('index.html', new Uint8Array([1])); assert.throws(() => s.commit()); }
  assert.deepEqual(scanFolder(c).stale, []);
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
