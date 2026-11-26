// M6 W4 (AB-T-0647): every starter file has a LICENCES.md row, every content file is CC0, and the table is what
// tools/make-licences.mjs writes from the provenance files. Runs everywhere (no sibling repositories needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { checkLicences } from '../tools/check-licences.mjs';

const tools = path.join(import.meta.dirname, '../tools');

test('every file in content/starter has a licence row, and every content file is CC0', () => {
  const r = checkLicences();
  assert.deepEqual(r.missing, [], 'files without a row');
  assert.deepEqual(r.stale, [], 'rows that match nothing');
  assert.deepEqual(r.notCC0, [], 'content that isn\'t CC0');
  assert.ok(r.files > 50);
});

test('LICENCES.md is what tools/make-licences.mjs writes from the clips\' and items\' provenance', () => {
  execFileSync(process.execPath, [path.join(tools, 'make-licences.mjs'), '--check'], { stdio: 'pipe' });
});

test('no starter file is git-ignored (a clip left out of the commit would pass the licence check here and fail elsewhere)', (t) => {
  const root = path.join(import.meta.dirname, '..');
  let out;
  try { execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, stdio: 'pipe' }); } catch { t.skip('not in a git checkout'); return; }
  try { out = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '.'], { cwd: root, encoding: 'utf8' }); } catch (e) { out = e.stdout ?? ''; }
  assert.deepEqual(out.split('\n').filter((f) => f && !f.endsWith('.DS_Store')), []);
});

test('the check takes only an exact CC0-1.0 cell, and exempts only code', async () => {
  const fs = await import('node:fs'), os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-licences-'));
  const put = (rel, data = 'x') => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), data); };
  const table = (rows) => put('LICENCES.md', `| File | Licence | Source |\n|---|---|---|\n${rows.map(([f, l]) => `| \`${f}\` | ${l} | s |`).join('\n')}\n`);
  try {
    put('items/a.vrmxi'); put('tools/make.mjs'); put('tools/mixamo-walk.vrma');
    table([['LICENCES.md', 'CC0-1.0'], ['items/a.vrmxi', 'CC0-1.0'], ['tools/make.mjs', 'Xocialize original (code)'], ['tools/mixamo-walk.vrma', 'CC0-1.0']]);
    assert.ok(checkLicences(dir).ok, 'exact CC0 everywhere, code exempt');
    table([['LICENCES.md', 'CC0-1.0'], ['items/a.vrmxi', 'CC0-1.0 / CC-BY-4.0'], ['tools/make.mjs', 'Xocialize original (code)'], ['tools/mixamo-walk.vrma', 'CC0-1.0']]);
    assert.deepEqual(checkLicences(dir).notCC0, ['items/a.vrmxi (CC0-1.0 / CC-BY-4.0)'], 'a cell that only starts with CC0 is refused');
    table([['LICENCES.md', 'CC0-1.0'], ['items/a.vrmxi', 'CC0-1.0'], ['tools/make.mjs', 'Xocialize original (code)'], ['tools/mixamo-walk.vrma', 'Mixamo']]);
    assert.deepEqual(checkLicences(dir).notCC0, ['tools/mixamo-walk.vrma (Mixamo)'], 'a binary under tools/ isn\'t code');
    put('test/deep/x.mjs');
    table([['LICENCES.md', 'CC0-1.0'], ['items/a.vrmxi', 'CC0-1.0'], ['tools/make.mjs', 'Xocialize original (code)'], ['tools/mixamo-walk.vrma', 'CC0-1.0'], ['test/deep/x.mjs', 'Xocialize original (code)']]);
    assert.deepEqual(checkLicences(dir).notCC0, ['test/deep/x.mjs (Xocialize original (code))'], 'only a .mjs directly in tools/ or test/ is code');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
