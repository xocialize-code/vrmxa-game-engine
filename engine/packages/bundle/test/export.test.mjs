// The exporter: a build's files and manifest, the same bytes every time, and the exports it refuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { exportBuild, parseManifest, filesDigest, sha256, BUILD_FILE, RUNTIME_FILE, runtimeTable, serializeRuntime } from '@vrmxg/bundle';
import { folderReader } from '@vrmxg/bundle/node';
import { project, runtime, sink, enc, dec, GAME, LICENCES } from './helpers.mjs';

const run = async (p = project(), rt = runtime(), o = {}) => { const out = sink(); const r = await exportBuild({ project: p, runtime: rt, write: out.write, ...o }); return { ...r, out }; };

test('a build holds the runtime, the project under project/, and a manifest listing every file with its hash and licence', async () => {
  const { manifest, out, files, bytes, text } = await run();
  assert.deepEqual(manifest.files.map((f) => f.path), [
    'assets/app.js', 'index.html',
    'project/LICENCES.md', 'project/animations.json', 'project/animations/clips/idle.vrma', 'project/behaviours.js', 'project/brains/guard.json', 'project/game.json',
    'project/level.vrmxs', 'project/lib/maths.js', 'project/prefabs/door.vrmxs', 'project/props/door.glb', 'project/voice/hello.timings.json', 'project/voice/hello.wav',
    'vrmxg-core.js',
  ]);
  assert.equal(files, 15);
  assert.deepEqual([...out.map.keys()].sort(), [...manifest.files.map((f) => f.path), BUILD_FILE].sort(), 'what was written is what is listed, and the manifest');
  assert.equal(out.order.at(-1), BUILD_FILE, 'the manifest is written last');
  for (const f of manifest.files) {
    const b = out.map.get(f.path);
    assert.equal(f.bytes, b.length, f.path);
    assert.equal(f.sha256, createHash('sha256').update(b).digest('hex'), f.path);
    assert.equal(f.role, f.path.startsWith('project/') ? 'project' : 'runtime', f.path);
    assert.ok(f.licence, f.path);
  }
  const of = (p) => manifest.files.find((f) => f.path === p).licence;
  assert.equal(of('project/props/door.glb'), 'CC0-1.0');
  assert.equal(of('project/voice/hello.wav'), "Kokoro output (Apache-2.0 | no one's voice)");
  assert.equal(of('assets/app.js'), 'Ours; includes three (MIT)', 'a runtime file\'s licence is its table\'s');
  assert.equal(bytes, manifest.files.reduce((n, f) => n + f.bytes, 0));
  assert.equal(dec(out.map.get(BUILD_FILE)), text);
  assert.deepEqual(parseManifest(text), manifest);
  assert.deepEqual([manifest.game.id, manifest.game.entry, manifest.runtime.name, manifest.runtime.version, manifest.runtime.entry], ['test-game', 'level.vrmxs', 'test-runtime', '1.0.0', 'index.html']);
});

test('the digest is what shasum would print over the listing, and names the build', async () => {
  const { manifest } = await run();
  const listing = manifest.files.map((f) => `${f.sha256}  ${f.path}\n`).join('');
  assert.equal(manifest.digest, createHash('sha256').update(listing).digest('hex'));
  assert.equal(manifest.digest, filesDigest(manifest.files));
  const other = await run(project({ 'props/door.glb': new Uint8Array([9]) }));
  assert.notEqual(other.manifest.digest, manifest.digest, 'one changed file changes it');
  const rt2 = await run(project(), runtime({ 'assets/app.js': 'console.log("another runtime");\n' }));
  assert.notEqual(rt2.manifest.runtime.digest, manifest.runtime.digest, 'and so does a different runtime');
});

test('the same project and runtime give the same bytes: again, and with the files listed in another order', async () => {
  const a = await run(), b = await run();
  const p = project(); p.files.reverse();
  const c = await run(p);
  assert.equal(a.text, b.text); assert.equal(a.text, c.text); assert.equal(a.sha256, c.sha256);
  assert.equal(a.sha256, sha256(enc(a.text)));
  for (const [k, v] of a.out.map) assert.deepEqual(c.out.map.get(k), v, k);
  assert.ok(!/\d{4}-\d{2}-\d{2}T|\/Users\/|\/home\//.test(a.text), 'no clock and no path of the machine in the manifest');
});

test('a file with no row in LICENCES.md stops the export, and the error names it', async () => {
  const p = project({ 'game.json': JSON.stringify({ ...GAME, include: ['notes/unlicensed.txt'] }) }), out = sink();
  await assert.rejects(exportBuild({ project: p, runtime: runtime(), write: out.write }), (e) => e.name === 'BuildError' && e.code === 'no_licence' && e.files.includes('notes/unlicensed.txt') && /no row in LICENCES\.md for notes\/unlicensed\.txt/.test(e.message));
  assert.equal(out.map.size, 0, 'nothing was written');
  // every such file is named, not just the first
  const two = project({ 'LICENCES.md': LICENCES.replace(/^\| `props\/door\.glb`.*\n/m, '').replace(/^\| `brains\/guard\.json`.*\n/m, '') });
  await assert.rejects(run(two), (e) => e.code === 'no_licence' && e.files.join() === 'brains/guard.json,props/door.glb');
  // a file nothing ships needs no row
  await run(project());
});

test('a project with no LICENCES.md, or no game.json and no game given, is refused', async () => {
  const noLic = project(); noLic.files = noLic.files.filter((f) => f !== 'LICENCES.md');
  await assert.rejects(run(noLic), (e) => e.code === 'no_licence' && /has no LICENCES\.md/.test(e.message));
  const noGame = project(); noGame.files = noGame.files.filter((f) => f !== 'game.json');
  await assert.rejects(run(noGame), (e) => e.code === 'bad_game' && /has no game\.json/.test(e.message));
  const { manifest } = await run(noGame, runtime(), { game: GAME });
  assert.ok(!manifest.files.some((f) => f.path === 'project/game.json'), 'a game handed in ships no game.json');
  assert.equal(manifest.game.entry, 'level.vrmxs');
});

test('a runtime that is not what its table lists stops the export before anything is written', async () => {
  const rt = runtime(); rt.map.set('assets/app.js', enc('console.log("tampered");\n'));
  const out = sink();
  await assert.rejects(exportBuild({ project: project(), runtime: rt, write: out.write }), (e) => e.code === 'bad_runtime' && e.files[0] === 'assets/app.js');
  assert.equal(out.map.size, 0);
  const none = runtime(); none.map.delete(RUNTIME_FILE);
  await assert.rejects(run(project(), none), (e) => e.code === 'bad_runtime' && /build the runtime first/.test(e.message));
});

test('a runtime may not use the build\'s own names, and every file of it needs a licence', () => {
  const table = (files) => runtimeTable({ name: 'r', runtimeVersion: '1', files: files.map(([path, licence = 'Ours']) => ({ path, bytes: enc(path), licence })) });
  assert.throws(() => table([['index.html'], ['project/cafe.vrmxs']]), (e) => e.code === 'bad_runtime' && /project\/cafe\.vrmxs/.test(e.message));
  assert.throws(() => table([['index.html'], [BUILD_FILE]]), (e) => e.code === 'bad_runtime');
  assert.throws(() => table([['index.html'], ['a.js', ' ']]), (e) => e.code === 'no_licence' && e.files[0] === 'a.js');
  assert.throws(() => table([['main.html']]), (e) => /the entry index\.html/.test(e.message));
  assert.throws(() => table([['index.html'], ['A.js'], ['a.js']]), (e) => /differ only by case/.test(e.message));
  const ok = table([['index.html'], ['b.js'], ['a.js']]);
  assert.deepEqual(ok.files.map((f) => f.path), ['a.js', 'b.js', 'index.html'], 'in order');
  assert.equal(serializeRuntime(ok), serializeRuntime(table([['a.js'], ['index.html'], ['b.js']])), 'whatever order they came in');
});

test('with no writer the export checks and hashes everything and writes nothing', async () => {
  const a = await exportBuild({ project: project(), runtime: runtime() });
  const b = await run();
  assert.equal(a.text, b.text);
});

test('progress counts every file', async () => {
  const seen = [];
  await run(project(), runtime(), { onProgress: (done, total, p) => seen.push([done, total, p]) });
  assert.equal(seen.length, 15); assert.deepEqual(seen.at(-1).slice(0, 2), [15, 15]);
});

test('the sample project exports: every file listed with its hash and licence, twice the same', async () => {
  const sample = path.resolve(import.meta.dirname, '../../../../content/sample'), src = folderReader(sample);
  const once = () => exportBuild({ project: { files: src.files, read: src.read }, runtime: runtime() });
  const a = await once(), b = await once();
  assert.equal(a.sha256, b.sha256);
  const files = a.manifest.files.filter((f) => f.role === 'project');
  assert.ok(files.length >= 45, `${files.length} project files`);
  for (const f of a.manifest.files) assert.ok(/^[0-9a-f]{64}$/.test(f.sha256) && f.licence && f.bytes >= 0, f.path);
  for (const ref of ['cafe.vrmxs', 'behaviours.js', 'animations.json', 'personas.json', 'personas/hana.persona.json', 'characters/mira.vrmxa', 'sets/cafe.glb', 'sounds/music.wav', 'voice/hana-welcome.wav', 'voice/hana-welcome.timings.json', 'input/walk-in.json', 'LICENCES.md', 'game.json']) {
    const f = files.find((x) => x.path === `project/${ref}`);
    assert.ok(f, ref);
    assert.equal(f.sha256, createHash('sha256').update(fs.readFileSync(path.join(sample, ref))).digest('hex'), ref);
  }
  assert.ok(!files.some((f) => /^project\/(tools|props\/sources|scripts|sequences)\//.test(f.path)), 'the project\'s tools, sources and films are not the game\'s');
  assert.ok(a.manifest.game.input?.actions?.move_x, 'the input map travels in the manifest');
});
