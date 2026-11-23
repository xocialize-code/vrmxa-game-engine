// The M4 sample short, "The Regular" (M4 W12, AB-T-0584), as the creator opens it: the sample project's shorts.json lists
// it with cameras by rule; opening it changes nothing (its script, built by rule over its sequence, gives the committed
// bytes: the cast, the bake, the fit and the hand-keyed take are all kept); every line is voiced in its role's voice,
// nobody talks over anybody, and the take's items are the person's (no src), so a re-script keeps them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@vrmxg/scene';
import { m0Registry } from '@vrmxg/registry/m0';
import { EditorSession } from '@vrmxg/editor-core';
import { checkSequence } from '@vrmxg/sequence';
import { lintLine, storyboard } from '@vrmxg/coverage';
import { voicingPlan, speechOverlaps } from '@vrmxg/voicing';
import { ScriptDesk } from '../src/desk.js';
import { readShorts, SHORTS_FILE } from '../src/shorts.js';

const sample = path.join(import.meta.dirname, '../../../content/sample');
const read = (f) => fs.readFileSync(path.join(sample, f), 'utf8');
const files = fs.readdirSync(sample, { recursive: true }).map((f) => String(f).split(path.sep).join('/'));
const shorts = readShorts(files, read(SHORTS_FILE));
const short = shorts.find((s) => s.id === 'the-regular');
const set = parse(read(short.set));

test('the sample project lists its two shorts: The Order (default cameras) first, The Regular (by rule)', () => {
  assert.deepEqual(shorts.map((s) => [s.id, s.title, s.coverage]), [['cafe-order', 'The Order', 'default'], ['the-regular', 'The Regular', 'rule']]);
  for (const s of shorts) for (const f of [s.script, s.sequence, s.marks, s.set]) assert.ok(files.includes(f), `${s.id}: ${f} is in the project`);
});

test('opening The Regular changes nothing: its script, covered by rule, builds the committed sequence', () => {
  const text = read(short.sequence);
  const s = new EditorSession({ registry: m0Registry(), text, path: short.sequence });
  s.setDoc = set; s.targetIds = () => new Set(set.nodes.map((n) => n.id));
  const desk = new ScriptDesk({ session: s, short, marks: JSON.parse(read(short.marks)).marks, text: read(short.script) });
  const r = desk.apply();
  assert.equal(r.ok, true);
  assert.equal(r.changed, false, 'the-regular.vrmxs is what its script builds by rule, with the cast, the bake and the take kept');
  assert.equal(s.history().undo, null);
});

test('The Regular: a minute long, valid in the cafe, every line voiced in its role\'s voice, no overlaps, no line crossed', () => {
  const doc = parse(read(short.sequence)), seq = doc.sequence;
  const seconds = seq.duration / seq.fps;
  assert.ok(seconds >= 55 && seconds <= 70, `about a minute (${seconds.toFixed(2)} s)`);
  assert.deepEqual(checkSequence(seq, { nodeIds: new Set([...set.nodes, ...doc.nodes].map((n) => n.id)) }), []);
  const lines = seq.tracks.filter((t) => t.type === 'dialogue').flatMap((t) => t.clips.map((c) => ({ ...c, speaker: t.target })));
  assert.equal(lines.length, 13);
  for (const l of lines) {
    assert.ok(l.clip && l.words && l.visemes && l.audio, `"${l.text}" is baked`);
    assert.equal(l.voice, seq.roles[l.speaker].voice.preset, `"${l.text}" is in ${l.speaker}'s voice`);
    assert.ok(files.includes(l.clip) && files.includes(l.timings), `${l.clip} and its timings are in the project`);
  }
  assert.deepEqual(voicingPlan(doc, {}, {}), [], 'nothing left to voice');
  assert.deepEqual(speechOverlaps(doc), []);
  assert.deepEqual(lintLine(doc, { set }).issues, []);
  const board = storyboard(doc, { set }).shots;
  assert.equal(board.length, seq.shots.length);
  assert.deepEqual(board.filter((b) => b.crossesLine), []);
  assert.deepEqual(Object.keys(seq.roles).sort(), ['hana-1', 'mira']);
});

test('The Regular\'s take is hand-keyed: its clips carry no src, so the script keeps them as the person\'s', () => {
  const seq = parse(read(short.sequence)).sequence;
  const take = seq.tracks.flatMap((t) => (t.clips ?? []).filter((c) => c.take === 'hand-1').map((c) => ({ ...c, track: t.id })));
  assert.equal(take.length, 6);
  for (const c of take) assert.equal(c.src, undefined, `${c.track} ${c.slot} is the person's`);
});

test('the park, the set made with Gaea, films a script: New Short over park.vrmxs builds by rule, valid, on its marks', async () => {
  const { buildShort } = await import('../src/desk.js');
  const { shortFor } = await import('../src/shorts.js');
  const park = parse(read('park.vrmxs'));
  assert.ok(park.assets.filter((a) => a.type === 'glb' && a.ref.startsWith('props/')).every((a) => files.includes(a.ref)), 'the Gaea props are in the project');
  const text = 'Title: In the Park\nSet: park.vrmxs\nMarks:\n    HANA = by-the-bench\n    MIRA = on-the-path\n\nEXT. PARK - DAY\n\nMira crosses the square to the bench.\n\nMIRA\nThere you are!\n\nHANA\n(smiling)\nI saved you a seat.\n';
  const s = shortFor('scripts/in-the-park.fountain', { files, text, coverage: 'rule' });
  assert.equal(s.marks, 'scripts/park-marks.json', 'the set\'s marks are found for it');
  const r = buildShort(text, { short: s, set: park, marks: JSON.parse(read(s.marks)).marks });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(checkSequence(r.doc.sequence, { nodeIds: new Set([...park.nodes, ...r.doc.nodes].map((n) => n.id)) }), []);
  assert.deepEqual(lintLine(r.doc, { set: park }).issues, []);
  assert.deepEqual(Object.keys(r.doc.sequence.cast).sort(), ['hana-1', 'mira']);
  assert.deepEqual(r.doc.sequence.cast.mira.transform.p, [1.4, 0, 1.2], 'Mira on her mark');
});
