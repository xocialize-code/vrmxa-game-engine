// The loader: a build opened, its files handed out by ref, and what it refuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportBuild, openBuild, serializeManifest, filesDigest, sha256, BUILD_FILE } from '@vrmxg/bundle';
import { project, runtime, sink, enc, dec, GAME } from './helpers.mjs';

async function built(p = project(), o = {}) {
  const out = sink();
  await exportBuild({ project: p, runtime: runtime(), write: out.write, ...o });
  const read = async (path) => { if (!out.map.has(path)) throw new Error(`${path}: no such file`); return out.map.get(path); };
  return { out, read, build: await openBuild(read) };
}

test('a build opens: the game, the runtime, the project\'s files by ref', async () => {
  const { build } = await built();
  assert.deepEqual([build.game.id, build.game.entry, build.runtime.name], ['test-game', 'level.vrmxs', 'test-runtime']);
  assert.deepEqual(build.refs().slice(0, 3), ['LICENCES.md', 'animations.json', 'animations/clips/idle.vrma']);
  assert.ok(build.has('level.vrmxs') && !build.has('tools/make.mjs') && !build.has('index.html'));
  assert.equal((await build.json('level.vrmxs')).id, 'level');
  assert.deepEqual([...await build.bytes('animations/clips/idle.vrma')], [1, 2, 3, 4, 5]);
  assert.equal(build.info('props/door.glb').licence, 'CC0-1.0');
  assert.equal(build.path('behaviours.js'), 'project/behaviours.js');
  const resolve = build.bytes; // handed to an engine service as its resolve
  assert.equal(dec(await resolve('lib/maths.js')), 'export const twice = (n) => n * 2;\n');
});

test('a ref the manifest does not list is refused by name', async () => {
  const { build, out } = await built();
  out.map.set('project/voice/unused.wav', new Uint8Array([1])); // even when a file is there
  await assert.rejects(build.bytes('voice/unused.wav'), (e) => e.code === 'not_in_build' && e.files[0] === 'voice/unused.wav' && /voice\/unused\.wav is not in this build/.test(e.message));
  await assert.rejects(build.bytes('../vrmxg-build.json'), (e) => e.code === 'not_in_build');
  await assert.rejects(build.bytes('index.html'), (e) => e.code === 'not_in_build', 'the runtime\'s files are not the project\'s');
});

test('a file that is not the one exported is refused; with verify off it is read as it is', async () => {
  const { build, out, read } = await built();
  await build.bytes('level.vrmxs');
  out.map.set('project/brains/guard.json', enc('{"format":"vrmxg-brain","tree":{"do":"something else"}}'));
  await assert.rejects(build.bytes('brains/guard.json'), (e) => e.code === 'changed' && e.files[0] === 'project/brains/guard.json');
  await assert.rejects(build.verifyAll(), (e) => e.code === 'changed');
  const loose = await openBuild(read, { verify: false });
  assert.equal((await loose.json('brains/guard.json')).tree.do, 'something else');
});

test('verifyAll reads every file, the runtime\'s too', async () => {
  const { build } = await built();
  assert.deepEqual(await build.verifyAll(), { files: 15, bytes: build.manifest.bytes, digest: build.manifest.digest });
  assert.equal(build.checked.size, 15);
});

test('a folder with no manifest, or one that has been edited, is not a build', async () => {
  await assert.rejects(openBuild(async (p) => { throw new Error(`${p}: 404`); }), (e) => e.code === 'bad_manifest' && /this isn't a build, or its export didn't finish/.test(e.message));
  const { out, read, build } = await built();
  const edit = (fn) => { const m = structuredClone(build.manifest); fn(m); out.map.set(BUILD_FILE, enc(serializeManifest(m))); return openBuild(read); };
  await assert.rejects(edit((m) => { m.files[0].sha256 = '0'.repeat(64); }), (e) => e.code === 'bad_manifest' && /digest/.test(e.message));
  await assert.rejects(edit((m) => { m.version = 2; }), (e) => /this loader reads version 1/.test(e.message));
  await assert.rejects(edit((m) => { m.files.reverse(); }), (e) => /out of order/.test(e.message));
  await assert.rejects(edit((m) => { m.files[0].path = '../escape.js'; }), (e) => e.code === 'bad_manifest');
  await assert.rejects(edit((m) => { m.game.entry = 'gone.vrmxs'; }), (e) => /the scene gone\.vrmxs is not among the files/.test(e.message));
  await assert.rejects(edit((m) => { m.files[1].role = 'project'; }), (e) => /in the wrong place/.test(e.message));
});

test('the input map: inline, from a file, or none', async () => {
  const actions = { jump: { type: 'button', bindings: [{ key: 'Space' }] } };
  assert.equal(await (await built()).build.actions(), null, 'none: the engine\'s default');
  assert.deepEqual(await (await built(project({ 'game.json': JSON.stringify({ ...GAME, input: { actions } }) }))).build.actions(), actions);
  const p = project({ 'game.json': JSON.stringify({ ...GAME, input: 'input/actions.json' }), 'input/actions.json': JSON.stringify({ actions }) });
  p.map.set('LICENCES.md', enc(dec(p.map.get('LICENCES.md')) + '| `input/actions.json` | Ours | The map |\n'));
  const { build } = await built(p);
  assert.ok(build.has('input/actions.json'));
  assert.deepEqual(await build.actions(), actions);
});

test('every module the behaviours import is checked before any of them runs', async () => {
  const { build, out } = await built();
  assert.deepEqual(await build.modules('behaviours.js'), ['behaviours.js', 'lib/maths.js']);
  // a module the entry imports is changed after the export: the entry itself is untouched
  out.map.set('project/lib/maths.js', enc('export const twice = (n) => { globalThis.pwned = true; return n; };\n'));
  const again = await openBuild(async (p) => out.map.get(p));
  let imported = false;
  await assert.rejects(again.behaviours(async () => { imported = true; return {}; }), (e) => e.code === 'changed' && e.files[0] === 'project/lib/maths.js');
  assert.equal(imported, false, 'nothing was imported');
  // a module that imports a file the build doesn't hold
  const gone = await built();
  gone.out.map.delete('project/lib/maths.js');
  const m = structuredClone(gone.build.manifest);
  m.files = m.files.filter((f) => f.path !== 'project/lib/maths.js');
  m.bytes = m.files.reduce((n, f) => n + f.bytes, 0); m.digest = filesDigest(m.files);
  gone.out.map.set(BUILD_FILE, enc(serializeManifest(m)));
  const without = await openBuild(gone.read);
  await assert.rejects(without.behaviours(async () => ({})), (e) => e.code === 'not_in_build' && /behaviours\.js imports \.\/lib\/maths\.js, which is not in this build/.test(e.message));
});

test('a module the loader can\'t account for is not imported', async () => {
  // the build is made by hand, as someone editing a folder would: a module that imports a path worked out as it runs,
  // and one that doesn't lex
  for (const [body, why] of [["export const twice = (n) => n * 2; export const more = (name) => import(name);\n", /^lib\/maths\.js imports a path it works out as it runs/], ["export const twice = (n) => n * 2; const re = /[abc;\n", /^lib\/maths\.js can't be read as a module/]]) {
    const { out, read, build } = await built();
    const odd = enc(body), m = structuredClone(build.manifest);
    const row = m.files.find((f) => f.path === 'project/lib/maths.js');
    row.bytes = odd.length; row.sha256 = sha256(odd);
    m.bytes = m.files.reduce((n, f) => n + f.bytes, 0); m.digest = filesDigest(m.files);
    out.map.set('project/lib/maths.js', odd); out.map.set(BUILD_FILE, enc(serializeManifest(m)));
    const again = await openBuild(read);
    let imported = false;
    await assert.rejects(again.behaviours(async () => { imported = true; return {}; }), (e) => e.code === 'bad_file' && why.test(e.message));
    assert.equal(imported, false);
  }
  // and a module imported after a decrement and a division is in the graph the loader checks
  const { build } = await built(project({ 'behaviours.js': "import { Behaviour } from '@vrmxg/core';\nlet t = 9; t-- / 3;\nexport const m = await import('./lib/maths.js');\nexport class patrol extends Behaviour {}\n" }));
  assert.deepEqual(await build.modules('behaviours.js'), ['behaviours.js', 'lib/maths.js']);
});

test('a ref is found as the exporter spelled it: ./ and the Unicode form don\'t matter, case does', async () => {
  const nfc = 'props/café.glb', nfd = 'props/café.glb';
  const p = project({ [nfd]: new Uint8Array([7]), 'game.json': JSON.stringify({ ...GAME, include: [nfc] }) });
  p.map.set('LICENCES.md', enc(dec(p.map.get('LICENCES.md')) + `| \`${nfc}\` | Ours | A cafe |\n`));
  const { build } = await built(p);
  assert.deepEqual([...await build.bytes(nfd)], [7]);
  assert.deepEqual([...await build.bytes(nfc)], [7]);
  assert.deepEqual([...await build.bytes('./props/door.glb')].slice(0, 4), [0x67, 0x6c, 0x54, 0x46]);
  assert.ok(build.has('./level.vrmxs') && !build.has('Level.vrmxs'));
  assert.equal(build.path(nfd), `project/${nfc}`);
  await assert.rejects(build.bytes('Props/Door.glb'), (e) => e.code === 'not_in_build');
});

test('behaviours come from the build\'s own module, checked before it runs', async () => {
  const { build, out } = await built();
  const seen = [];
  const map = await build.behaviours(async (path) => { seen.push(path); return { patrol: class {}, helper: () => 1, VERSION: 3 }; });
  assert.deepEqual(seen, ['project/behaviours.js']);
  assert.deepEqual([...map.keys()], ['patrol', 'helper'], 'the functions it exports');
  out.map.set('project/behaviours.js', enc('export class patrol { evil() {} }\n'));
  const again = await openBuild(async (p) => out.map.get(p));
  let imported = false;
  await assert.rejects(again.behaviours(async () => { imported = true; return {}; }), (e) => e.code === 'changed');
  assert.equal(imported, false, 'a changed module is never imported');
  const none = await built(project({ 'game.json': JSON.stringify({ ...GAME, behaviours: undefined }) }));
  assert.equal((await none.build.behaviours(async () => { throw new Error('not called'); })).size, 0);
});
