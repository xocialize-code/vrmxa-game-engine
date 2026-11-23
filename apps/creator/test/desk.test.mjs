// The script pane on the sample short (M4 W5, acceptance 2): editing the script updates the sequence, keeps a hand
// edit, and is one undo step; undo and redo bring the script back with the document; errors change nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse, serialize } from '@vrmxg/scene';
import { m0Registry } from '@vrmxg/registry/m0';
import { EditorSession } from '@vrmxg/editor-core';
import { ScriptDesk, buildShort, coverageFor } from '../src/desk.js';
import { readShorts } from '../src/shorts.js';

const sample = path.join(import.meta.dirname, '../../../content/sample');
const read = (f) => fs.readFileSync(path.join(sample, f), 'utf8');
const script = read('scripts/cafe-order.fountain');
const set = parse(read('cafe.vrmxs'));
const { marks } = JSON.parse(read('scripts/cafe-marks.json'));
const files = fs.readdirSync(sample, { recursive: true }).map((f) => String(f).split(path.sep).join('/'));
const [short] = readShorts(files, null, { 'scripts/cafe-order.fountain': script });

function open() {
  const s = new EditorSession({ registry: m0Registry(), text: read('sequences/cafe-order.vrmxs'), path: short.sequence });
  s.setDoc = set; s.targetIds = () => new Set(set.nodes.map((n) => n.id));
  return { s, desk: new ScriptDesk({ session: s, short, marks, text: script }) };
}
const track = (doc, id) => doc.sequence.tracks.find((t) => t.id === id);

test('opening the sample short changes nothing: its script builds the committed sequence', () => {
  const { s, desk } = open();
  const r = desk.apply();
  assert.equal(r.ok, true);
  assert.equal(r.changed, false, 'the committed cafe-order.vrmxs is what its script builds (default cameras)');
  assert.equal(s.history().undo, null);
  const shot = s.doc.sequence.shots.find((x) => String(x.src).startsWith('ln-'));
  assert.equal(desk.beats()[shot.src.split('#')[0]].line, 15);
});

test('a script edit re-scripts the sequence as one undo step and keeps a hand edit; undo brings the script back', () => {
  const { s, desk } = open();
  const opened = s.text();
  // a hand edit on the timeline: Hana's greet gesture three frames later
  const act = track(s.doc, 'hana-1-act');
  const i = act.clips.findIndex((c) => /#g:greet$/.test(c.src));
  const src = act.clips[i].src;
  s.seq.moveClip('hana-1-act', i, { start: act.clips[i].start + 3, end: act.clips[i].end + 3 });
  desk.follow();
  const handEdited = s.text();
  // reword Mira's line in the pane
  const edited = script.replace('A latte, please.', 'A latte, please. To go.');
  desk.text = edited;
  assert.ok(desk.pending && desk.dirty);
  const r = desk.apply();
  assert.equal(r.changed, true);
  assert.equal(r.label, 'Re-script (1 changed)');
  assert.equal(s.history().undo, 'Re-script (1 changed)', 'one undo step');
  const said = track(s.doc, 'mira-says').clips.find((c) => c.text.includes('To go.'));
  assert.ok(said, 'the sequence has the new words');
  assert.ok(track(s.doc, 'hana-1-act').clips.find((c) => c.src === src).hand, 'the hand edit was kept');
  assert.deepEqual(s.validate().errors, []);
  const after = s.text();
  s.undo(); assert.equal(desk.follow(), script, 'undo: the pane shows the script before the edit');
  assert.equal(s.text(), handEdited, 'one undo takes back the whole re-script');
  s.undo(); desk.follow(); assert.equal(s.text(), opened);
  s.redo(); s.redo(); assert.equal(desk.follow(), edited, 'redo: the edited script again');
  assert.equal(s.text(), after);
});

test('a script with an error changes nothing and points at its line', () => {
  const { s, desk } = open();
  const before = s.text();
  const r = desk.apply(script.replace('[[greet]]', '[[gret]]'));
  assert.equal(r.ok, false);
  assert.equal(desk.errorList()[0].line, 17);
  assert.equal(s.text(), before);
  assert.equal(s.history().undo, null);
  assert.ok(desk.pending, 'the typed text stays in the pane, unapplied');
});

test('a new short builds from its script with cameras by rule, the same bytes twice', () => {
  const fresh = { ...short, id: 'cafe-take-2', script: 'scripts/cafe-take-2.fountain', coverage: 'rule' };
  const a = buildShort(script, { short: fresh, set, marks }), b = buildShort(script, { short: fresh, set, marks });
  assert.ok(a.ok);
  assert.equal(serialize(a.doc), serialize(b.doc));
  assert.ok(a.doc.nodes.some((n) => n.id === 'vc-est-int-cafe-morning'), 'coverage by rule names its establishing camera');
  assert.equal(coverageFor({ coverage: 'default' }), undefined);
});

test('typing that isn\'t applied yet survives a timeline edit, and is applied after it', () => {
  const { s, desk } = open();
  const typed = script.replace('Coming right up!', 'Coming right up! Two minutes.');
  desk.text = typed;                                   // typed, not applied
  const act = track(s.doc, 'hana-1-act');
  s.seq.moveClip('hana-1-act', 0, { start: act.clips[0].start + 2, end: act.clips[0].end + 2 });
  assert.equal(desk.follow(), typed, 'the pane keeps what was typed');
  assert.ok(desk.pending);
  const r = desk.apply();
  assert.equal(r.changed, true);
  assert.ok(track(s.doc, 'hana-1-says').clips.some((c) => c.text.endsWith('Two minutes.')));
  s.undo(); assert.equal(desk.follow(), script, 'undo goes back to the script the hand-edited state was built from');
});
