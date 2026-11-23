// The creator's project of shorts (M4 W5): discovery, shorts.json, title pages, beats for the storyboard, and the
// script text that follows undo and redo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildSequence } from '@vrmxg/script';
import { parse } from '@vrmxg/scene';
import { slugOf, titlePage, shortFor, readShorts, shortsManifest, upsertShort, beatIndex, errorLines, ScriptHistory, SHORTS_FILE } from '../src/shorts.js';

const sample = path.join(import.meta.dirname, '../../../content/sample');
const files = fs.readdirSync(sample, { recursive: true }).map((f) => String(f).split(path.sep).join('/'));
const script = fs.readFileSync(path.join(sample, 'scripts/cafe-order.fountain'), 'utf8');

test('slugs and title pages', () => {
  assert.equal(slugOf('scripts/Cafe Order (v2).fountain'), 'cafe-order-v2');
  assert.equal(slugOf('???.fountain'), 'untitled');
  assert.deepEqual(titlePage(script), { title: 'The Order', set: 'cafe.vrmxs' });
  assert.deepEqual(titlePage('INT. ROOM\n\nNothing.'), { title: null, set: null });
});

test('the sample has one short, found from its script: the committed sequence keeps its cameras', () => {
  const shorts = readShorts(files, null, { 'scripts/cafe-order.fountain': script });
  assert.deepEqual(shorts, [{ id: 'cafe-order', title: 'The Order', script: 'scripts/cafe-order.fountain', sequence: 'sequences/cafe-order.vrmxs', marks: 'scripts/cafe-marks.json', set: 'cafe.vrmxs', coverage: 'default' }]);
  const fresh = shortFor('scripts/new-scene.fountain', { files, text: script });
  assert.equal(fresh.coverage, 'rule', 'a new short is covered by rule');
  assert.equal(fresh.marks, 'scripts/cafe-marks.json', 'the set\'s marks');
  assert.equal(shortFor('scripts/x.fountain', { files }).marks, null);
});

test('shorts.json round-trips and is checked', () => {
  const shorts = readShorts(files, null, { 'scripts/cafe-order.fountain': script });
  const text = shortsManifest(upsertShort(shorts, { id: 'second', title: 'Second', script: 'scripts/second.fountain', sequence: 'sequences/second.vrmxs', marks: null, set: null, coverage: 'rule' }));
  assert.ok(text.endsWith('\n'));
  const back = readShorts(files, text);
  assert.deepEqual(back.map((s) => s.id), ['cafe-order', 'second']);
  assert.equal(shortsManifest(back), text, 'the same bytes again');
  assert.deepEqual(upsertShort(back, { id: 'cafe-order', title: 'Renamed' }).map((s) => s.title), ['Renamed', 'Second']);
  assert.throws(() => readShorts(files, '{"format":"x","version":1}'), /not a shorts list/);
  assert.throws(() => readShorts(files, '{"format":"vrmxg-shorts","version":2}'), /newer/);
  assert.throws(() => readShorts(files, '{"format":"vrmxg-shorts","version":1,"shorts":[{"id":"a"}]}'), /needs an id and a script/);
  assert.equal(SHORTS_FILE, 'shorts.json');
});

test('beats point the storyboard at script lines; errors list by line', () => {
  const set = parse(fs.readFileSync(path.join(sample, 'cafe.vrmxs'), 'utf8'));
  const { marks } = JSON.parse(fs.readFileSync(path.join(sample, 'scripts/cafe-marks.json'), 'utf8'));
  const r = buildSequence(script, { set, marks, id: 'cafe-order', source: 'scripts/cafe-order.fountain' });
  assert.ok(r.ok);
  const beats = beatIndex(r.parsed);
  const shot = r.doc.sequence.shots.find((s) => String(s.src).startsWith('ln-'));
  const b = beats[shot.src.split('#')[0]];
  assert.equal(b.line, 15);
  assert.equal(b.text, 'HANA: Good morning! What can I get you?');
  assert.equal(beats[r.parsed.beats[0].id].text, 'INT. CAFE - MORNING');
  const bad = buildSequence(script.replace('[[greet]]', '[[gret]]'), { set, marks });
  assert.ok(!bad.ok);
  assert.match(errorLines(bad.errors)[0].text, /^17: .*gret/);
});

test('the script text follows undo and redo through the document\'s hashes', () => {
  const h = new ScriptHistory();
  h.record('a', 'v1');              // opened
  h.record('b', 'v2');              // re-scripted
  assert.equal(h.follow('c', 'v2'), 'v2', 'a timeline edit keeps the pane\'s text');
  assert.equal(h.follow('a', 'v2'), 'v1', 'undo back to the opened state shows its script');
  assert.equal(h.follow('b', 'v1'), 'v2', 'redo shows the re-scripted text');
  assert.equal(h.textFor('zzz'), null);
});

test('file kinds, a set made from a model, and a new short\'s script', async () => {
  const { kindOf, setForModel, scriptTemplate, titlePage: tp } = await import('../src/shorts.js');
  assert.deepEqual(['a.fountain', 'B.VRMXA', 'c.vrmxs', 'd.glb', 'e.txt'].map(kindOf), ['script', 'character', 'set', 'model', null]);
  const { EditorSession } = await import('@vrmxg/editor-core');
  const { m0Registry } = await import('@vrmxg/registry/m0');
  const doc = setForModel('sets/stairs.glb', 'stairs-set');
  const s = new EditorSession({ registry: m0Registry(), doc });
  assert.deepEqual(s.validate().errors, [], 'a valid scene');
  assert.equal(doc.nodes.find((n) => n.type === 'Model').asset, 'set-model');
  assert.deepEqual(tp(scriptTemplate({ title: 'Second Take', set: 'stairs-set.vrmxs' })), { title: 'Second Take', set: 'stairs-set.vrmxs' });
});
