// LICENCES.md as a table: the rows the exporter licenses files by, read the way CI's checker reads the sample's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseLicences, licenceOf } from '@vrmxg/bundle';
import { listFolder } from '@vrmxg/bundle/node';
import { LICENCES } from './helpers.mjs';

test('rows are the lines whose first cell is a backticked path', () => {
  const rows = parseLicences(LICENCES);
  assert.equal(rows.length, 13);
  assert.deepEqual(rows[3], { pattern: 'props/door.glb', licence: 'CC0-1.0', source: 'Made by `tools/make.mjs`', re: rows[3].re });
  assert.equal(licenceOf(rows, 'props/door.glb').licence, 'CC0-1.0');
  assert.equal(licenceOf(rows, 'props/other.glb'), null);
});

test('a * matches within one folder level, an escaped bar stays in its cell, and an exact row beats a pattern', () => {
  const rows = parseLicences(LICENCES);
  assert.equal(licenceOf(rows, 'voice/hello.wav').licence, "Kokoro output (Apache-2.0 | no one's voice)");
  assert.equal(licenceOf(rows, 'voice/deep/hello.wav'), null, 'not across folders');
  assert.equal(licenceOf(rows, 'voice/hello.timings.json').licence, 'CC0-1.0');
  const both = parseLicences('| `a/*.txt` | Pattern | |\n| `a/b.txt` | Exact | |\n');
  assert.equal(licenceOf(both, 'a/b.txt').licence, 'Exact');
  assert.equal(licenceOf(both, 'a/c.txt').licence, 'Pattern');
  assert.equal(licenceOf(parseLicences('| `a.txt` |  | no licence said |\n'), 'a.txt'), null, 'an empty licence cell licenses nothing');
});

test('the sample project: every file has a row, as CI\'s checker finds', () => {
  const sample = path.resolve(import.meta.dirname, '../../../../content/sample');
  const rows = parseLicences(fs.readFileSync(path.join(sample, 'LICENCES.md'), 'utf8'));
  const missing = listFolder(sample).filter((f) => !licenceOf(rows, f));
  assert.deepEqual(missing, []);
});
