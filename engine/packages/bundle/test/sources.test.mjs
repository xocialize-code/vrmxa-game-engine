// M5 W1's additions to the bundle: a game's own version ("release") in game.json, and a runtime's source stamp, so a
// runtime built from older sources than the checkout's is refused rather than shipped without a word.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkGame } from '../src/game.js';
import { runtimeSources, checkRuntimeSources, SOURCES_FORMAT } from '../src/node.js';

const base = { format: 'vrmxg-game', version: 1, id: 'cafe', entry: 'cafe.vrmxs' };

test('a game\'s release: kept as written, after the game\'s other keys; anything else refused, by name', () => {
  assert.equal(checkGame({ ...base, release: '1.2.0' }).release, '1.2.0');
  assert.deepEqual(Object.keys(checkGame({ ...base, release: '2' })).at(-1), 'release');
  assert.equal('release' in checkGame(base), false, 'no release: none in the manifest (earlier builds stay the same bytes)');
  for (const bad of ['1.2.3.4', 'v1', '', 1.2, '1..2']) assert.throws(() => checkGame({ ...base, release: bad }), /"release" is the game's version/, String(bad));
});

test('a source stamp names every file with its hash; the check finds a file changed or gone since', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-sources-'));
  try {
    fs.mkdirSync(path.join(dir, 'src'));
    for (const [f, t] of [['src/a.js', 'export const a = 1;\n'], ['src/b.js', 'export const b = 2;\n'], ['lock.json', '{}\n']]) fs.writeFileSync(path.join(dir, f), t);
    const stamp = runtimeSources({ files: ['src/b.js', 'src/a.js', 'lock.json', 'src/a.js'].map((f) => path.join(dir, f)), base: path.join(dir, 'app'), runtime: 'vrmxg-game 0.1.0' });
    assert.equal(stamp.format, SOURCES_FORMAT);
    assert.deepEqual(stamp.files.map((r) => r.path), ['../lock.json', '../src/a.js', '../src/b.js'], 'sorted, once each, relative to the stamp\'s folder');
    assert.match(stamp.digest, /^[0-9a-f]{64}$/);
    fs.mkdirSync(path.join(dir, 'app'));
    const file = path.join(dir, 'app/dist-sources.json');
    fs.writeFileSync(file, JSON.stringify(stamp));
    assert.deepEqual(checkRuntimeSources(file), { ok: true, digest: stamp.digest, runtime: 'vrmxg-game 0.1.0', changed: [], missing: [] });
    fs.writeFileSync(path.join(dir, 'src/a.js'), 'export const a = 3;\n');
    fs.rmSync(path.join(dir, 'src/b.js'));
    const r = checkRuntimeSources(file);
    assert.equal(r.ok, false);
    assert.deepEqual(r.changed, ['../src/a.js']); assert.deepEqual(r.missing, ['../src/b.js']);
    assert.deepEqual(checkRuntimeSources(path.join(dir, 'nothing.json')).missing, ['nothing.json'], 'no stamp: not ok');
    fs.writeFileSync(path.join(dir, 'odd.json'), '{"format":"x"}');
    assert.throws(() => checkRuntimeSources(path.join(dir, 'odd.json')), /not a runtime's source stamp/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('vrmxg-export refuses the game runtime when its stamp says the sources changed since it was built', { skip: !fs.existsSync(new URL('../../../../apps/game/dist-sources.json', import.meta.url)) && 'needs the game app built (npm run build -w @vrmxg/game-app)' }, () => {
  const stampFile = new URL('../../../../apps/game/dist-sources.json', import.meta.url);
  const cli = new URL('../src/cli.js', import.meta.url).pathname, project = new URL('../../../../content/sample', import.meta.url).pathname;
  const original = fs.readFileSync(stampFile, 'utf8');
  try {
    const doc = JSON.parse(original);
    if (!checkRuntimeSources(stampFile.pathname).ok) return; // a checkout edited since the build: the refusal below is what it already gets
    doc.files[0].sha256 = '0'.repeat(64); // as if that file had changed since the build
    fs.writeFileSync(stampFile, JSON.stringify(doc));
    let err = null;
    try { execFileSync(process.execPath, [cli, project, '--check'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { err = e; }
    assert.ok(err, 'refused');
    assert.match(err.stderr, /is older than this checkout: 1 of its source files changed since it was built .*npm run build -w @vrmxg\/game-app/);
  } finally { fs.writeFileSync(stampFile, original); }
});
