// The Vite plugin's two hooks, run by hand over a small output folder: the notices it gathers from what a bundle
// includes, and the table it writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checkRuntime, sha256, RUNTIME_FILE } from '@vrmxg/bundle';
import { vrmxgRuntime, NOTICES_FILE } from '@vrmxg/bundle/vite';

const require = createRequire(import.meta.url);
const repo = path.resolve(import.meta.dirname, '../../../..');

function build(bundle, files, o = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-bundle-vite-'));
  const plugin = /** @type {any} */ (vrmxgRuntime({ name: 'test-runtime', version: '2.0.0', licence: 'Ours', ...o }));
  plugin.configResolved({ root: out, build: { outDir: 'dist' } });
  const emitted = {};
  plugin.generateBundle.call({ emitFile: (f) => { emitted[f.fileName] = f.source; } }, {}, bundle);
  for (const [p, text] of Object.entries({ ...files, ...emitted })) { fs.mkdirSync(path.dirname(path.join(out, 'dist', p)), { recursive: true }); fs.writeFileSync(path.join(out, 'dist', p), text); }
  plugin.closeBundle();
  const table = JSON.parse(fs.readFileSync(path.join(out, 'dist', RUNTIME_FILE), 'utf8'));
  const read = (p) => fs.readFileSync(path.join(out, 'dist', p));
  return { out, table, read, notices: read(NOTICES_FILE).toString(), done: () => fs.rmSync(out, { recursive: true, force: true }) };
}

const three = require.resolve('three'), dmath = path.join(repo, 'engine/packages/dmath/src/index.js'), core = path.join(repo, 'engine/packages/core/src/index.js');
const bundle = {
  'assets/app.js': { type: 'chunk', fileName: 'assets/app.js', moduleIds: [three, dmath, core, '\0virtual:thing', `${three}?commonjs-proxy`] },
  'assets/own.js': { type: 'chunk', fileName: 'assets/own.js', moduleIds: [core] },
  'style.css': { type: 'asset', fileName: 'style.css' },
};
const files = { 'index.html': '<!doctype html>', 'assets/app.js': 'app', 'assets/own.js': 'own', 'assets/data.wasm': 'wasm' };

test('the table lists every file of the output with its hash and licence, and is a runtime the exporter accepts', () => {
  const b = build(bundle, files, { licences: [['assets/*.wasm', 'Someone else (MIT)']] });
  try {
    assert.deepEqual(b.table.files.map((f) => f.path), [NOTICES_FILE, 'assets/app.js', 'assets/data.wasm', 'assets/own.js', 'index.html']);
    assert.deepEqual([b.table.name, b.table.runtimeVersion, b.table.entry, b.table.contract], ['test-runtime', '2.0.0', 'index.html', 1]);
    for (const f of b.table.files) assert.equal(f.sha256, sha256(new Uint8Array(b.read(f.path))), f.path);
    checkRuntime(b.table);
    const of = (p) => b.table.files.find((f) => f.path === p).licence;
    assert.match(of('assets/app.js'), /^Ours; includes @vrmxg\/dmath 0\.1\.0 \(.*fdlibm.*\), three 0\.187\.0 \(MIT\): see THIRD-PARTY-LICENCES\.txt$/);
    assert.equal(of('assets/own.js'), 'Ours', 'a chunk of our own code alone');
    assert.equal(of('assets/data.wasm'), 'Someone else (MIT)', 'a rule for a file no chunk names');
    assert.equal(of('index.html'), 'Ours');
  } finally { b.done(); }
});

test('the notices hold each package\'s licence text and the notices our own modules carry', () => {
  const b = build(bundle, files);
  try {
    assert.match(b.notices, /three 0\.187\.0 \(MIT\)/);
    assert.match(b.notices, /Copyright © 2010-\d{4} three\.js authors/);
    assert.match(b.notices, /@vrmxg\/dmath\/src\/index\.js/);
    assert.match(b.notices, /Copyright \(C\) 1993 by Sun Microsystems, Inc\. All rights reserved\./, 'fdlibm\'s notice ships with the port');
    assert.ok(!b.notices.includes(repo) && !b.notices.includes(os.homedir()), 'no path of this machine');
    assert.ok(!/@vrmxg\/core/.test(b.notices), 'a module with no notice adds nothing');
  } finally { b.done(); }
});

test('the same output gives the same table', () => {
  const a = build(bundle, files), b = build(bundle, files);
  try { assert.equal(a.read(RUNTIME_FILE).toString(), b.read(RUNTIME_FILE).toString()); assert.equal(a.notices, b.notices); } finally { a.done(); b.done(); }
});
