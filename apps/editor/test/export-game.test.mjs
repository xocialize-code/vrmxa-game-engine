// Export Game's page side (M5 W0) against a stand-in for the Mac shell that keeps the shell's rules: a build is staged
// under an id, moved in at the end, and dropped on abort. What is checked here is the order of things: no folder is
// asked for before every check has passed, a large file crosses the bridge in pieces, each file is read once, and an
// export that fails on the way is aborted so the same folder takes the next try. apps/shell's own tests check the
// real folder (BuildFolderTests.swift).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimeTable, serializeRuntime, parseManifest, sha256, RUNTIME_FILE, BUILD_FILE } from '@vrmxg/bundle';
import { questions } from '@vrmxg/editor-ui';
import { exportGame, exportClosing } from '../src/export-game.js';

const enc = (s) => new TextEncoder().encode(s);
const LICENCES = '| `game.json` | Ours | |\n| `level.vrmxs` | Ours | |\n| `props/*.glb` | CC0-1.0 | |\n| `LICENCES.md` | Ours | |\n';
const big = Uint8Array.from({ length: 2500 }, (_, i) => (i * 7) & 255);

function project(over = {}) {
  const files = new Map(Object.entries({
    'game.json': JSON.stringify({ format: 'vrmxg-game', version: 1, id: 'test-game', entry: 'level.vrmxs' }),
    'LICENCES.md': LICENCES,
    'level.vrmxs': JSON.stringify({ assets: [{ ref: 'props/big.glb' }, { ref: 'props/empty.glb' }] }),
    'props/big.glb': big, 'props/empty.glb': new Uint8Array(0),
    ...over,
  }).map(([k, v]) => [k, typeof v === 'string' ? enc(v) : v]));
  const reads = new Map();
  return { files: [...files.keys()], reads, has: (ref) => files.has(ref), bytes: async (ref) => { reads.set(ref, (reads.get(ref) ?? 0) + 1); if (!files.has(ref)) throw new Error(`${ref}: 404`); return files.get(ref); } };
}

function runtime() {
  const files = { 'index.html': '<!doctype html>', 'assets/app.js': 'console.log(1)' };
  const table = runtimeTable({ name: 'test-runtime', runtimeVersion: '1.0.0', files: Object.entries(files).map(([path, v]) => ({ path, bytes: enc(v), licence: 'Ours' })) });
  const map = new Map([...Object.entries(files).map(([k, v]) => [k, enc(v)]), [RUNTIME_FILE, enc(serializeRuntime(table))]]);
  return { read: async (p) => { if (!map.has(p)) throw new Error(`${p}: 404`); return map.get(p); } };
}

/** The shell's build.* methods over a folder in memory: staged under an id, moved in by build.end, dropped by build.abort. */
function shell({ failAt = null, cancel = false } = {}) {
  const s = { inShell: true, calls: [], folder: new Map(), stage: null, id: null, n: 0, largest: 0 };
  s.call = async (method, p = {}) => {
    s.calls.push(method === 'build.write' ? `write ${p.path}${p.offset ? ` @${p.offset}` : ''}` : method);
    if (method === 'build.begin') {
      if (cancel) throw Object.assign(new Error('nothing was exported'), { code: 'cancelled' });
      s.id = `export-${++s.n}`; s.stage = new Map();
      return { id: s.id, path: `/builds/${p.name}`, name: p.name };
    }
    if (p.id !== s.id || !s.stage) throw Object.assign(new Error('no build is being written under that id'), { code: 'no_build' });
    if (method === 'build.write') {
      if (p.path === failAt) throw new Error('the disk is full');
      const bytes = Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0));
      s.largest = Math.max(s.largest, bytes.length);
      if (p.offset !== (s.stage.get(p.path)?.length ?? 0) || (p.offset === 0 && s.stage.has(p.path))) throw new Error(`${p.path}: a piece at ${p.offset} out of turn`);
      s.stage.set(p.path, p.offset ? Uint8Array.from([...s.stage.get(p.path), ...bytes]) : bytes);
      return { path: p.path, bytes: bytes.length };
    }
    if (method === 'build.end') { s.folder = s.stage; s.stage = null; s.id = null; return { path: '/builds/test-game', name: 'test-game', files: s.folder.size - 1 }; }
    if (method === 'build.abort') { s.stage = null; s.id = null; return { aborted: true }; }
    throw new Error(`unknown method ${method}`);
  };
  return s;
}

test('an export asks for the folder once every check has passed, writes each file once, and ends the build', async () => {
  const p = project(), s = shell();
  const r = await exportGame(p, { shell: s, runtime: runtime(), name: 'my-build' });
  assert.equal(s.calls[0], 'build.begin');
  assert.equal(s.calls.at(-1), 'build.end');
  assert.equal(s.calls.at(-2), `write ${BUILD_FILE}`, 'the manifest is written last');
  assert.deepEqual([r.written, r.id, r.files, r.path, r.byPattern], [true, 'test-game', 7, '/builds/test-game', 2]); // 2 of the runtime's and 5 of the project's; 2 licensed by `props/*.glb`
  const manifest = parseManifest(new TextDecoder().decode(s.folder.get(BUILD_FILE)));
  assert.equal(sha256(s.folder.get(BUILD_FILE)), r.manifest);
  for (const f of manifest.files) assert.equal(sha256(s.folder.get(f.path)), f.sha256, f.path);
  assert.equal(p.reads.get('props/big.glb'), 1, 'a file is fetched and hashed once');
  assert.equal(p.reads.get('props/empty.glb'), 1);
  assert.deepEqual([...s.folder.get('project/props/empty.glb')], [], 'an empty file is still written');
});

test('a file larger than one piece crosses the bridge in pieces, in order', async () => {
  const s = shell();
  await exportGame(project(), { shell: s, runtime: runtime(), chunk: 1000 });
  assert.deepEqual(s.calls.filter((c) => c.includes('big.glb')), ['write project/props/big.glb', 'write project/props/big.glb @1000', 'write project/props/big.glb @2000'], 'each piece says where it begins');
  assert.ok(s.largest <= 1000, `no message carried more than a piece (${s.largest})`);
  assert.deepEqual(s.folder.get('project/props/big.glb'), big);
});

test('a refused export asks for no folder', async () => {
  for (const [over, code] of [[{ 'LICENCES.md': '| `game.json` | Ours | |\n| `LICENCES.md` | Ours | |\n' }, 'no_licence'], [{ 'level.vrmxs': JSON.stringify({ assets: [{ ref: 'Props/Big.glb' }] }) }, 'missing_file']]) {
    const s = shell();
    await assert.rejects(exportGame(project(over), { shell: s, runtime: runtime() }), (e) => e.name === 'BuildError' && e.code === code);
    assert.deepEqual(s.calls, [], code);
  }
  const cut = project(); cut.truncated = true;
  const s = shell();
  await assert.rejects(exportGame(cut, { shell: s, runtime: runtime() }), (e) => e.code === 'too_many_files');
  assert.deepEqual(s.calls, [], 'a project listing that was cut short is not exported from');
});

test('an export that fails on the way is aborted, and the same folder takes the next try', async () => {
  const s = shell({ failAt: 'project/props/big.glb' });
  s.folder = new Map([['index.html', enc('the earlier build')]]);
  await assert.rejects(exportGame(project(), { shell: s, runtime: runtime() }), /the disk is full/);
  assert.equal(s.calls.at(-1), 'build.abort', 'the shell is told to drop what was written');
  assert.equal(s.stage, null, 'no build is left open: nothing more can be written under the old id');
  assert.equal(new TextDecoder().decode(s.folder.get('index.html')), 'the earlier build', 'the earlier build is as it was');
  // a file of the project that can't be read fails the same way
  const gone = project(); const bytes = gone.bytes;
  gone.bytes = async (ref) => { if (ref === 'props/big.glb') throw new Error('props/big.glb: 404'); return bytes(ref); };
  const s2 = shell();
  await assert.rejects(exportGame(gone, { shell: s2, runtime: runtime() }), /404/);
  assert.equal(s2.calls.at(-1), 'build.abort');
  // and the next export into that folder goes through
  const again = shell(); again.folder = s.folder;
  const r = await exportGame(project(), { shell: again, runtime: runtime() });
  assert.equal(r.written, true);
  assert.ok(again.folder.has(BUILD_FILE) && again.folder.get('index.html').length === 15, 'the earlier build is replaced by the whole new one');
});

test('a cancelled folder panel exports nothing and aborts nothing; a browser tab checks and hashes only', async () => {
  const s = shell({ cancel: true });
  await assert.rejects(exportGame(project(), { shell: s, runtime: runtime() }), (e) => e.code === 'cancelled');
  assert.deepEqual(s.calls, ['build.begin'], 'there was no build to abort');
  const calls = [];
  const r = await exportGame(project(), { shell: { inShell: false, call: async (m) => { calls.push(m); } }, runtime: runtime() });
  assert.deepEqual([r.written, r.path, calls.length], [false, null, 0]);
  assert.match(r.manifest, /^[0-9a-f]{64}$/);
});

test('a project with no game.json exports the open scene, and with no scene says so', async () => {
  const p = project(); p.files = p.files.filter((f) => f !== 'game.json'); const has = p.has; p.has = (ref) => ref !== 'game.json' && has(ref);
  const s = shell();
  const r = await exportGame(p, { shell: s, runtime: runtime(), scene: 'level.vrmxs' });
  assert.deepEqual([r.id, r.entry], ['level', 'level.vrmxs']);
  await assert.rejects(exportGame(p, { shell: shell(), runtime: runtime() }), /no scene is open/);
});

test('an export stopped on the way (the window is closing) is aborted like a failed one', async () => {
  const abort = new AbortController(), s = shell();
  s.folder = new Map([['index.html', enc('the earlier build')]]);
  const call = s.call;
  s.call = async (method, p) => { if (method === 'build.write' && p.path === 'project/level.vrmxs') abort.abort(); return call(method, p); };
  await assert.rejects(exportGame(project(), { shell: s, runtime: runtime(), signal: abort.signal }), (e) => e.code === 'aborted');
  assert.equal(s.calls.at(-1), 'build.abort');
  assert.ok(!s.calls.includes('build.end'), 'a stopped export is never moved in');
  assert.equal(new TextDecoder().decode(s.folder.get('index.html')), 'the earlier build');
  // stopped before a folder was asked for: nothing to abort, no folder asked for
  const before = new AbortController(); before.abort();
  const s2 = shell();
  await assert.rejects(exportGame(project(), { shell: s2, runtime: runtime(), signal: before.signal }), (e) => e.code === 'aborted');
  assert.deepEqual(s2.calls, []);
});

test('closing the window while a game is exported asks first, and Stop and Close waits for the export to let go', async () => {
  let shown = null;
  const sheet = questions((q) => { shown = q; });
  const o = { ask: sheet.ask, asking: () => sheet.asking };
  // nothing is being exported: no question
  assert.equal(await exportClosing({ gameExporting: null }, o), true);
  assert.equal(shown, null);
  // Keep Exporting: the window stays, the export goes on
  let cancelled = 0;
  const ed = { gameExporting: { n: 3, total: 60 }, cancelGameExport: async () => { cancelled++; ed.gameExporting = null; } };
  let answer = exportClosing(ed, o);
  assert.deepEqual([shown.title, shown.options.map((x) => x.id)], ['A game is being exported', ['cancel', 'stop']]);
  // the menu's Export Game while this sheet is up would be a second question: it is not asked (App.vue: sheet.asking)
  assert.equal(await exportClosing(ed, o), false, 'a close asked again while the sheet is up waits for the first');
  sheet.reply('cancel');
  assert.deepEqual([await answer, cancelled, shown], [false, 0, null]);
  // Stop and Close: the export is stopped and has settled before the close goes on
  answer = exportClosing(ed, o);
  sheet.reply('stop');
  assert.deepEqual([await answer, cancelled, ed.gameExporting], [true, 1, null]);
});

test('the build carries its save-compatibility fingerprint, with what the project\'s behaviours declare (M6 W5)', async () => {
  const level = JSON.stringify({ assets: [{ ref: 'props/big.glb' }], nodes: [{ id: 'a', type: 'Node3D', behaviours: [{ use: 'spin' }] }] });
  const p = project({ 'game.json': JSON.stringify({ format: 'vrmxg-game', version: 1, id: 'test-game', entry: 'level.vrmxs', behaviours: 'behaviours.js' }), 'level.vrmxs': level, 'behaviours.js': 'export class spin {}\n', 'LICENCES.md': `${LICENCES}| \`behaviours.js\` | Ours | |\n` });
  const asked = [];
  const importBehaviours = async ({ ref, code, sources }) => { asked.push([ref, code.length, [...sources.keys()]]); return { spin: class spin { static describe = { state: { type: 'object' } }; } }; };
  const s = shell();
  await exportGame(p, { shell: s, runtime: runtime(), importBehaviours });
  const manifest = parseManifest(new TextDecoder().decode(s.folder.get(BUILD_FILE)));
  assert.deepEqual(asked, [['behaviours.js', 64, ['behaviours.js']]], 'the module was imported once, from the sources the export read, with the hash of its code');
  assert.match(manifest.compat.behaviours.spin, /^state:[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(manifest.compat.scenes), ['level.vrmxs']);
  assert.equal(p.reads.get('behaviours.js'), 2, 'read no more than before: once to trace what it imports, once for its hash and the build');
});

test('an import that fails counts every project behaviour by its code, as Node\'s exporter does (M6 W5)', async () => {
  const level = JSON.stringify({ assets: [{ ref: 'props/big.glb' }], nodes: [{ id: 'a', type: 'Node3D', behaviours: [{ use: 'spin' }] }] });
  const p = project({ 'game.json': JSON.stringify({ format: 'vrmxg-game', version: 1, id: 'test-game', entry: 'level.vrmxs', behaviours: 'behaviours.js' }), 'level.vrmxs': level, 'behaviours.js': 'export class spin {}\n', 'LICENCES.md': `${LICENCES}| \`behaviours.js\` | Ours | |\n` });
  const s = shell();
  await exportGame(p, { shell: s, runtime: runtime(), importBehaviours: async () => { throw new Error('no blob: imports here'); } });
  const manifest = parseManifest(new TextDecoder().decode(s.folder.get(BUILD_FILE)));
  assert.match(manifest.compat.behaviours.spin, /^code:[0-9a-f]{64}$/, 'the export goes on, counting by code');
});
