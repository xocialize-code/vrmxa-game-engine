// The review's cases (M4 W5): a new short, a Save As and an opened script can never open or overwrite a sequence or
// script the project holds; unsaved shorts stay out of shorts.json; a file opened under a name the project holds with
// different bytes is never silently mixed with it; a .vrmxs is a set only when it is one; a manifest entry without
// coverage keeps the cameras of a sequence that exists, as a discovered short does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@vrmxg/scene';
import { ShortList, readShorts, shortFor, slugOf, placeFile, freeRef, sameBytes, sceneKind, missingRefs, scriptTemplate } from '../src/shorts.js';

const sample = path.join(import.meta.dirname, '../../../content/sample');
const files = fs.readdirSync(sample, { recursive: true }).map((f) => String(f).split(path.sep).join('/'));
const read = (f) => fs.readFileSync(path.join(sample, f), 'utf8');
const list = () => new ShortList(readShorts(files, null, { 'scripts/cafe-order.fountain': read('scripts/cafe-order.fountain') }).filter((s) => s.id === 'cafe-order'));

test('New Short "Morning" and Save As "Morning" never take sequences/morning.vrmxs (hand-made, 288 frames)', () => {
  assert.ok(files.includes('sequences/morning.vrmxs'));
  const shorts = list();
  const id = shorts.freeId(slugOf('Morning'), files);
  assert.equal(id, 'morning-2');
  const draft = shorts.addDraft({ ...shortFor(`scripts/${id}.fountain`, { files, text: scriptTemplate({ title: 'Morning', set: 'cafe.vrmxs' }), coverage: 'rule' }), title: 'Morning' });
  assert.equal(draft.sequence, 'sequences/morning-2.vrmxs');
  assert.equal(shorts.freeId('morning', files), 'morning-3', 'the draft holds its id too');
  assert.equal(shorts.freeId('cafe-order', files), 'cafe-order-2', 'a saved short\'s id and files are taken');
  assert.equal(shorts.freeId('conversation', files), 'conversation-2', 'any sequence in the project is taken');
  assert.equal(shorts.freeId('', files), 'untitled');
});

test('an opened x.fountain never replaces short x: it gets a free id', () => {
  const shorts = new ShortList([{ id: 'x', title: 'X', script: 'scripts/other.fountain', sequence: 'sequences/x.vrmxs', marks: null, set: null, coverage: 'rule' }]);
  assert.equal(shorts.forScript('scripts/x.fountain'), null, 'not short x\'s script');
  const id = shorts.freeId(slugOf('x.fountain'), files);
  assert.equal(id, 'x-2');
  shorts.addDraft(shortFor(`scripts/${id}.fountain`, { files }));
  assert.deepEqual(shorts.all.map((s) => [s.id, s.script]), [['x', 'scripts/other.fountain'], ['x-2', 'scripts/x-2.fountain']]);
  assert.throws(() => shorts.addDraft({ id: 'x' }), /exists already/);
});

test('drafts stay out of shorts.json until saved, and a discarded draft is gone', () => {
  const shorts = list();
  shorts.addDraft({ id: 'second', title: 'Second', script: 'scripts/second.fountain', sequence: 'sequences/second.vrmxs', marks: null, set: 'cafe.vrmxs', coverage: 'rule' });
  assert.deepEqual(JSON.parse(shorts.manifest()).shorts.map((s) => s.id), ['cafe-order']);
  assert.equal(shorts.discard('cafe-order'), false, 'a saved short is never discarded');
  shorts.markSaved('second');
  assert.deepEqual(JSON.parse(shorts.manifest()).shorts.map((s) => s.id), ['cafe-order', 'second']);
  shorts.addDraft({ id: 'third', title: 'Third', script: 'scripts/third.fountain', sequence: 'sequences/third.vrmxs', coverage: 'rule' });
  assert.equal(shorts.discard('third'), true);
  assert.equal(shorts.byId('third'), null);
});

test('placing an opened file: new, the same bytes, or a clash that asks', async () => {
  const a = new Uint8Array([1, 2, 3]), b = new Uint8Array([1, 2, 4]);
  const store = { 'characters/mira.vrmxa': a };
  const fl = Object.keys(store);
  const o = (onClash) => ({ files: fl, read: async (r) => store[r], onClash });
  assert.deepEqual(await placeFile('characters/new.vrmxa', b, o()), { ref: 'characters/new.vrmxa', write: true });
  assert.deepEqual(await placeFile('characters/mira.vrmxa', a.slice(), o()), { ref: 'characters/mira.vrmxa', write: false, same: true });
  let asked = null;
  assert.equal(await placeFile('characters/mira.vrmxa', b, o((r) => { asked = r; return 'cancel'; })), null);
  assert.equal(asked, 'characters/mira.vrmxa');
  assert.equal(await placeFile('characters/mira.vrmxa', b, o()), null, 'no one to ask: nothing written');
  assert.deepEqual(await placeFile('characters/mira.vrmxa', b, o(() => 'replace')), { ref: 'characters/mira.vrmxa', write: true, replaced: true });
  assert.deepEqual(await placeFile('characters/mira.vrmxa', b, o(async () => 'rename')), { ref: 'characters/mira-2.vrmxa', write: true, renamed: true });
  assert.equal(freeRef('sets/cafe.glb', ['sets/cafe.glb', 'sets/cafe-2.glb']), 'sets/cafe-3.glb');
  assert.ok(sameBytes(a, a.slice()) && !sameBytes(a, b) && !sameBytes(a, a.subarray(1)));
});

test('a .vrmxs is a set, a sequence or a prefab; its missing refs are named', () => {
  assert.equal(sceneKind(parse(read('cafe.vrmxs'))), 'set');
  assert.equal(sceneKind(parse(read('sequences/morning.vrmxs'))), 'sequence');
  assert.equal(sceneKind(parse(read('prefabs/door.vrmxs'))), 'prefab');
  assert.deepEqual(missingRefs(parse(read('cafe.vrmxs')), files), []);
  assert.deepEqual(missingRefs({ assets: [{ ref: 'sets/elsewhere.glb' }, { ref: 'sets/cafe.glb' }] }, files), ['sets/elsewhere.glb']);
});

test('a manifest entry with no coverage keeps the cameras of a sequence that exists, as a discovered short does', () => {
  const m = JSON.stringify({ format: 'vrmxg-shorts', version: 1, shorts: [{ id: 'cafe-order', script: 'scripts/cafe-order.fountain' }, { id: 'fresh', script: 'scripts/fresh.fountain' }] });
  assert.deepEqual(readShorts(files, m).map((s) => s.coverage), ['default', 'rule']);
  assert.equal(list().byId('cafe-order').coverage, 'default');
});
