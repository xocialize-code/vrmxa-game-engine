// Third-party notices for any app's Vite build (M6 W7, AB-T-0624): what bundleNotices gathers, that a package
// without a licence text stops the build, and that checkNotices sees a missing text or fdlibm's notice gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { bundleNotices, checkNotices, vrmxgNotices, NOTICES_FILE } from '@vrmxg/bundle/notices';

const require = createRequire(import.meta.url);
const repo = path.resolve(import.meta.dirname, '../../../..');
const three = require.resolve('three'), dmath = path.join(repo, 'engine/packages/dmath/src/index.js');
const chunk = (fileName, moduleIds) => ({ type: 'chunk', fileName, moduleIds });

/** A folder with node_modules/<name> holding package.json, index.js and the given extra files. */
function fakePackage(name, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-notices-')), pkg = path.join(dir, 'node_modules', name);
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name, version: '1.2.3', license: 'MIT' }));
  fs.writeFileSync(path.join(pkg, 'index.js'), 'export const x = 1;\n');
  for (const [f, t] of Object.entries(extra)) fs.writeFileSync(path.join(pkg, f), t);
  return { dir, index: path.join(pkg, 'index.js'), done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('the notices hold each package\'s licence text, our modules\' notices, and say which chunk carries what', () => {
  const n = bundleNotices({ 'a.js': chunk('assets/a.js', [three, dmath]), 'b.css': { type: 'asset' } }, { title: 'an-app 1.0.0' });
  assert.match(n.text, /^an-app 1\.0\.0: the licences of what it includes\./);
  assert.match(n.text, /Copyright © 2010-\d{4} three\.js authors/);
  assert.match(n.text, /Copyright \(C\) 1993 by Sun Microsystems, Inc\. All rights reserved\./);
  assert.deepEqual(n.packages, ['three@0.187.0']);
  assert.deepEqual(n.included.get('assets/a.js').map((s) => s.split(' ')[0]), ['@vrmxg/dmath', 'three']);
});

test('the engine\'s own licence is in every build\'s notices, and the workspace root is never listed as third party', () => {
  const shell = path.join(repo, 'apps/shell/js/shell.js'); // no package of its own: it belongs to the workspace root
  const n = bundleNotices({ 'a.js': chunk('assets/a.js', [shell]) }, { title: 'an-app 1.0.0' });
  assert.match(n.text, /={78}\nvrmxg\/LICENSE-MIT\n={78}\n\nMIT License\n\nCopyright \(c\) 2026 Xocialize LLC/);
  assert.match(n.text, /={78}\nvrmxg\/LICENSE-APACHE\n={78}\n\nApache License/);
  assert.deepEqual(n.included.get('assets/a.js'), []); // ours: not "vrmxg  (MIT OR Apache-2.0)"
  assert.equal(n.text.match(/vrmxg\/LICENSE-MIT\n/g).length, 1);
  const none = bundleNotices({ 'a.js': chunk('assets/a.js', [three]) }, { title: 'x 1' }); // and without any of our files
  assert.match(none.text, /vrmxg\/LICENSE-APACHE\n/);
});

test('a package that ships no licence text stops the build, naming it', () => {
  const p = fakePackage('no-licence-here');
  try {
    assert.throws(() => bundleNotices({ 'a.js': chunk('a.js', [p.index]) }, { title: 'x 1' }), /no licence text for no-licence-here 1\.2\.3 \(MIT\).*licences\//);
  } finally { p.done(); }
});

test('a package that ships none takes its text from engine/packages/bundle/licences/', () => {
  const p = fakePackage('@cfworker/json-schema');
  try {
    const n = bundleNotices({ 'a.js': chunk('a.js', [p.index]) }, { title: 'x 1' });
    assert.match(n.text, /@cfworker\/json-schema 1\.2\.3 \(MIT\)\n=+\n\nMIT License\n\nCopyright \(c\) 2020 Jeremy Danyow/);
    assert.match(n.text, /## punycode\.js[\s\S]*Copyright Mathias Bynens/, 'and the notices of the code it took in');
  } finally { p.done(); }
});

test('a package carried as copied files, not imported, is listed through packages', () => {
  const p = fakePackage('copied-in', { LICENSE: 'The copied-in licence' });
  try {
    const n = bundleNotices({}, { title: 'x 1', packages: [p.index] });
    assert.match(n.text, /copied-in 1\.2\.3 \(MIT\)\n=+\n\nThe copied-in licence/);
    assert.throws(() => bundleNotices({}, { title: 'x 1', packages: [path.join(os.tmpdir(), 'not-a-package-anywhere', 'f.js')] }), /is in no package/);
  } finally { p.done(); }
});

test('vrmxgNotices writes the file into a build', () => {
  const plugin = /** @type {any} */ (vrmxgNotices({ name: 'vrmxg-editor', version: '0.1.0' })), emitted = {};
  plugin.generateBundle.call({ emitFile: (f) => { emitted[f.fileName] = f.source; } }, {}, { 'a.js': chunk('a.js', [three, dmath]) });
  assert.deepEqual(Object.keys(emitted), [NOTICES_FILE]);
  assert.match(emitted[NOTICES_FILE], /^vrmxg-editor 0\.1\.0: /);
});

test('checkNotices fails when a package\'s licence text, fdlibm\'s notice or the file itself is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-notices-dist-'));
  try {
    const text = bundleNotices({ 'a.js': chunk('a.js', [three, dmath]) }, { title: 'x 1' }).text;
    const want = { packages: ['three'], from: repo };
    assert.deepEqual(checkNotices(dir, want), [`${NOTICES_FILE} is not in ${dir}`]);
    fs.writeFileSync(path.join(dir, NOTICES_FILE), text);
    assert.deepEqual(checkNotices(dir, want), []);
    fs.writeFileSync(path.join(dir, NOTICES_FILE), text.replace(/Copyright © 2010-\d{4} three\.js authors/, ''));
    assert.deepEqual(checkNotices(dir, want), ['three 0.187.0: its licence text']);
    fs.writeFileSync(path.join(dir, NOTICES_FILE), text.replace(/Sun Microsystems/g, 'Someone'));
    assert.deepEqual(checkNotices(dir, want), ['fdlibm\'s notice (the port in @vrmxg/dmath)']);
    fs.writeFileSync(path.join(dir, NOTICES_FILE), text.replace(/three 0\.187\.0/g, 'thr33'));
    assert.deepEqual(checkNotices(dir, want), ['three 0.187.0: not listed']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('checkNotices fails when a notice one of our files carries is missing, or no longer what the file says', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-notices-kept-'));
  const meta = path.join(repo, 'engine/packages/registry/src/vendor/ajv-meta-2020.js');
  try {
    const text = bundleNotices({ 'a.js': chunk('a.js', [three, dmath, meta]) }, { title: 'x 1' }).text;
    const want = { packages: [], from: repo, kept: { '@vrmxg/registry/src/vendor/ajv-meta-2020.js': meta, '@vrmxg/dmath/src/index.js': dmath } };
    fs.writeFileSync(path.join(dir, NOTICES_FILE), text);
    assert.deepEqual(checkNotices(dir, want), []);
    assert.match(text, /@vrmxg\/registry\/src\/vendor\/ajv-meta-2020\.js\n=+\n\nGenerated by[\s\S]*Copyright \(c\) 2015-2021 Evgeny Poberezkin/, 'Ajv\'s notice, from the precompiled meta-schema\'s header');
    fs.writeFileSync(path.join(dir, NOTICES_FILE), text.replace(/Evgeny Poberezkin/g, 'someone'));
    assert.deepEqual(checkNotices(dir, want), ['@vrmxg/registry/src/vendor/ajv-meta-2020.js: its notice']);
    fs.writeFileSync(path.join(dir, NOTICES_FILE), text.replace('@vrmxg/registry/src/vendor/ajv-meta-2020.js', 'gone'));
    assert.deepEqual(checkNotices(dir, want), ['@vrmxg/registry/src/vendor/ajv-meta-2020.js: its notice']);
    assert.deepEqual(checkNotices(dir, { ...want, kept: { 'x': path.join(repo, 'engine/packages/core/src/index.js') } }).at(-1), 'x: ' + path.join(repo, 'engine/packages/core/src/index.js') + ' carries no notice to keep');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
