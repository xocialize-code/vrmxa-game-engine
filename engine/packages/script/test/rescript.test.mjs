// M4 W4 (AB-T-0576): editing the script keeps hand edits. Each case builds, edits the sequence the way the timeline or
// MCP would, edits the script, re-scripts, and checks what was kept, what moved and what the script took back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { m0Registry } from '@vrmxg/registry/m0';
import { EditorSession } from '@vrmxg/editor-core';
import { checkSequence } from '@vrmxg/sequence';
import { buildSequence, applyScript } from '../src/index.js';
import { set, marks, text, track, SMALL } from './helpers.mjs';

const build = (src, previous = null, o = {}) => {
  const r = buildSequence(src, { set, marks, id: 'small', previous, ...o });
  assert.ok(r.ok, JSON.stringify(r.errors));
  return r;
};
const clip = (doc, trackId, pred) => track(doc, trackId).clips.find(pred);
const valid = (doc) => assert.deepEqual(checkSequence(doc.sequence, { nodeIds: new Set([...set.nodes, ...doc.nodes].map((n) => n.id)) }), []);
const lineId = (r, words) => r.parsed.beats.find((b) => b.kind === 'line' && b.text.startsWith(words)).id;

test('a hand-moved gesture is marked, kept and moves with its line when a line is added above', () => {
  const a = build(SMALL);
  const doc = structuredClone(a.doc);
  const greet = clip(doc, 'hana-1-act', (c) => c.slot === 'greet');
  greet.start += 5; greet.end += 5; // nudged in the timeline
  const was = greet.start;
  const edited = SMALL.replace('Hana wipes the counter.\n', 'Hana wipes the counter.\n\nMIRA\nExcuse me?\n');
  const b = build(edited, doc);
  const kept = clip(b.doc, 'hana-1-act', (c) => c.slot === 'greet');
  assert.equal(kept.hand, true, 'marked');
  const id = lineId(a, 'Good morning');
  assert.equal(lineId(b, 'Good morning'), id, 'the line kept its id');
  const shift = b.plan.beats.find((x) => x.id === id).start - a.plan.beats.find((x) => x.id === id).start;
  assert.ok(shift > 0);
  assert.equal(kept.start, was + shift, 'moved with its line');
  assert.equal(track(b.doc, 'hana-1-act').clips.filter((c) => c.slot === 'greet').length, 1, 'not generated again beside the kept one');
  // untouched clips are simply the new build's
  assert.ok(!clip(b.doc, 'hana-1-act', (c) => c.src === `${id}#talk`).hand);
  valid(b.doc);
  // shot numbers survive; the new shot goes between
  const names = (r) => new Map(r.doc.sequence.shots.map((s) => [s.src.split('#')[0], s.name]));
  for (const [beat, n] of names(a)) assert.equal(names(b).get(beat), n, `shot ${n} kept its number`);
  assert.deepEqual(b.doc.sequence.shots.map((s) => s.name), ['010', '020', '025', '030', '040', '050']);
});

test('editing a line\'s words updates the dialogue and keeps the line\'s hand edits; a cut line takes its own clips with it', () => {
  const a = build(SMALL);
  const doc = structuredClone(a.doc);
  const id = lineId(a, 'Coming right up');
  const look = clip(doc, 'hana-1-eyes', (c) => c.src === `${id}#look`);
  look.at = 'camera'; // she breaks the fourth wall
  const b = build(SMALL.replace('Coming right up!', 'Coming right up, one moment!'), doc);
  assert.equal(clip(b.doc, 'hana-1-says', (c) => c.src === `${id}#say`).text, 'Coming right up, one moment!');
  assert.equal(clip(b.doc, 'hana-1-eyes', (c) => c.src === `${id}#look`).at, 'camera');
  assert.equal(clip(b.doc, 'hana-1-eyes', (c) => c.src === `${id}#look`).hand, true);
  const say = clip(b.doc, 'hana-1-says', (c) => c.src === `${id}#say`), lk = clip(b.doc, 'hana-1-eyes', (c) => c.src === `${id}#look`);
  assert.deepEqual([lk.start, lk.end], [say.start, say.end], 'retargeted, not retimed: it still spans the (longer) line');
  assert.deepEqual(b.report.changed, [id]);
  // cut Mira's line: her generated clips go; Hana's hand look stays
  const cut = build(SMALL.replace('MIRA\nA latte, please.\n\n', ''), b.doc);
  assert.equal(track(cut.doc, 'mira-says'), undefined, 'a generated track left empty is removed');
  assert.ok(clip(cut.doc, 'hana-1-eyes', (c) => c.at === 'camera'));
  assert.equal(cut.report.removed.length, 1);
  valid(cut.doc);
});

test('a deleted generated clip stays deleted; a deleted generated track stays deleted; release gives a beat back', () => {
  const a = build(SMALL);
  const id = lineId(a, 'Good morning');
  const doc = structuredClone(a.doc);
  track(doc, 'hana-1-act').clips = track(doc, 'hana-1-act').clips.filter((c) => c.slot !== 'greet');
  doc.sequence.tracks = doc.sequence.tracks.filter((t) => t.id !== 'mira-eyes');
  const b = build(SMALL.replace('A latte, please.', 'A latte, please. Large.'), doc);
  assert.ok(!track(b.doc, 'hana-1-act').clips.some((c) => c.slot === 'greet'), 'the gesture stays deleted');
  assert.ok(b.doc.sequence.script.removed.includes(`hana-1-act|${id}#g:greet`));
  assert.equal(track(b.doc, 'mira-eyes'), undefined, 'the track stays deleted');
  assert.deepEqual(b.doc.sequence.script.dropped, ['mira-eyes']);
  // and again: still gone
  const c = build(SMALL.replace('A latte, please.', 'A latte, please. Large. Hot.'), b.doc);
  assert.ok(!track(c.doc, 'hana-1-act').clips.some((x) => x.slot === 'greet'));
  // release the line: the gesture comes back as the script's
  const d = build(SMALL, c.doc, { release: [id] });
  assert.ok(clip(d.doc, 'hana-1-act', (x) => x.slot === 'greet' && !x.hand));
  assert.ok(!(d.doc.sequence.script.removed ?? []).some((k) => k.includes(id)));
});

test('hand keys on an expression are kept (the group is listed as hand); the other groups follow the script', () => {
  const src = `${SMALL}\nMIRA\n(smiling)\nThanks!\n`;
  const a = build(src);
  const doc = structuredClone(a.doc);
  const happy = track(doc, 'hana-1-face').keys.happy;
  happy[1] = [happy[1][0], 1, 'easeOut']; // a bigger smile
  const mira = track(doc, 'mira-face'); // and a key a person added to Mira's face
  mira.keys.surprised = [[10, 0], [14, 0.5]];
  const edited = src.replace('Hana wipes the counter.', 'Hana wipes the counter slowly, humming to herself.');
  const b = build(edited, doc);
  const id = lineId(a, 'Good morning');
  const shift = b.plan.beats.find((x) => x.id === id).start - a.plan.beats.find((x) => x.id === id).start;
  assert.ok(shift > 0);
  assert.deepEqual(track(b.doc, 'hana-1-face').keys.happy, happy.map((k) => [k[0] + shift, ...k.slice(1)]), 'kept, moved with the line');
  assert.deepEqual(b.doc.sequence.script.hand, [`hana-1-face|${id}#x:happy`]);
  assert.deepEqual(track(b.doc, 'mira-face').keys.surprised, [[10, 0], [14, 0.5]], 'before the first beat moves nothing: kept where it was');
  const thanks = lineId(a, 'Thanks');
  assert.equal(track(b.doc, 'mira-face').keys.happy[0][0], b.plan.beats.find((x) => x.id === thanks).start, 'the script\'s group moved with its line');
  // the hand group stays the person's on the next re-script too
  const c = build(edited.replace('Coming right up!', 'Right away!'), b.doc);
  assert.deepEqual(track(c.doc, 'hana-1-face').keys.happy, track(b.doc, 'hana-1-face').keys.happy);
});

test('a person\'s own track, shot and marker move with the beat they fell in', () => {
  const a = build(SMALL);
  const doc = structuredClone(a.doc);
  const id = lineId(a, 'A latte');
  const at = a.plan.beats.find((x) => x.id === id).start + 4;
  doc.sequence.tracks.push({ id: 'door', type: 'event', keys: [[at, { call: 'open', target: 'door-1' }]] });
  doc.sequence.markers.push({ frame: at, name: 'bell' });
  const b = build(SMALL.replace('INT. CAFE - MORNING\n', 'INT. CAFE - MORNING\n\nThe sun is up. The street is quiet. A bus goes by.\n'), doc);
  const now = b.plan.beats.find((x) => x.id === id).start + 4;
  assert.ok(now > at);
  assert.equal(track(b.doc, 'door').keys[0][0], now);
  assert.equal(b.doc.sequence.markers.find((m) => m.name === 'bell').frame, now);
  assert.equal(b.doc.sequence.markers.find((m) => m.name === 'bell').hand, undefined, 'a person\'s own items aren\'t marked: they were never the script\'s');
});

test('a hand-trimmed line gives the line its length; a baked voice is kept while its words are', () => {
  const a = build(SMALL);
  const doc = structuredClone(a.doc);
  const id = lineId(a, 'Good morning'), next = lineId(a, 'A latte');
  const say = clip(doc, 'hana-1-says', (c) => c.src === `${id}#say`);
  say.end += 24; // a second longer
  const latte = clip(doc, 'mira-says', (c) => c.src === `${next}#say`);
  latte.clip = 'voice/small-mira-says-1.wav'; // baked
  const b = build(SMALL, doc);
  const nb = (r, x) => r.plan.beats.find((y) => y.id === x);
  assert.equal(nb(b, next).start - nb(a, next).start, 24, 'the next line waits for the longer one');
  assert.equal(clip(b.doc, 'mira-says', (c) => c.src === `${next}#say`).clip, 'voice/small-mira-says-1.wav', 'baked voice kept');
  assert.ok(!clip(b.doc, 'mira-says', (c) => c.src === `${next}#say`).hand, 'baking is not a hand edit');
  const c = build(SMALL.replace('A latte, please.', 'A tea, please.'), b.doc);
  const tea = clip(c.doc, 'mira-says', (x) => x.src === `${next}#say`);
  assert.deepEqual([tea.text, tea.clip], ['A tea, please.', undefined], 'new words: the old voice is stale and goes');
  // M4 W7: the length stays the person's on every later re-script, not only the first (the record says "-L")
  const d = build(SMALL, b.doc), e = build(SMALL, d.doc);
  for (const r of [d, e]) {
    assert.equal(clip(r.doc, 'hana-1-says', (x) => x.src === `${id}#say`).end - clip(r.doc, 'hana-1-says', (x) => x.src === `${id}#say`).start, say.end - say.start, 'still a second longer');
    assert.equal(nb(r, next).start - nb(a, next).start, 24, 'and the next line still waits for it');
  }
  assert.equal(text(e.doc), text(d.doc), 'a re-script of an unchanged script changes nothing');
  // a line only reworded by hand (its times as the script gave them) keeps taking the script's length
  const w = structuredClone(a.doc);
  clip(w, 'hana-1-says', (x) => x.src === `${id}#say`).text = 'Morning!';
  const f = build(SMALL, build(SMALL, w).doc);
  assert.equal(nb(f, next).start, nb(a, next).start, 'no hand length from a reworded line');
});

test('hand-set shots and duration are kept; generated shots give way', () => {
  const a = build(SMALL);
  const doc = structuredClone(a.doc);
  const s = doc.sequence.shots[2];
  s.end += 10; s.overrides = { 'counter-light': { props: { intensity: 30 } } }; // longer, and a cheated light
  doc.sequence.duration += 100;
  const b = build(SMALL.replace('Coming right up!', 'Right away!'), doc);
  const kept = b.doc.sequence.shots.find((x) => x.id === s.id);
  assert.equal(kept.hand, true);
  assert.deepEqual(kept.overrides, s.overrides);
  const after = b.doc.sequence.shots[b.doc.sequence.shots.indexOf(kept) + 1];
  assert.equal(after.start, kept.end, 'the shot after starts where the kept one ends');
  assert.equal(b.doc.sequence.duration, doc.sequence.duration);
  assert.ok(b.warnings.some((w) => /duration was set by hand/.test(w)));
  valid(b.doc);
});

test('a swapped camera or a shot given overrides keeps following its shot\'s timing; a retimed one doesn\'t', () => {
  const a = build(SMALL);
  const doc = structuredClone(a.doc);
  const id = lineId(a, 'A latte');
  clip(doc, 'cameras', (c) => c.src === `${id}#cam`).camera = 'vc-wide'; // replace the shot's camera (W8's one edit)
  doc.sequence.shots.find((x) => x.src === `${id}#shot`).overrides = { 'counter-light': { props: { intensity: 30 } } };
  const longer = SMALL.replace('A latte, please.', 'A latte, please. Large, with oat milk, and an extra shot.');
  const b = build(longer, doc);
  const shot = b.doc.sequence.shots.find((x) => x.src === `${id}#shot`), cam = clip(b.doc, 'cameras', (c) => c.src === `${id}#cam`);
  assert.equal(shot.hand, true); assert.equal(cam.hand, true); assert.equal(cam.camera, 'vc-wide');
  const shots = b.doc.sequence.shots, k = shots.indexOf(shot), was = a.doc.sequence.shots.find((x) => x.src === `${id}#shot`);
  assert.equal(shot.start, b.plan.beats.find((x) => x.id === id).start);
  assert.equal(shot.end, shots[k + 1].start, 'the shot tiles with the next');
  assert.ok(shot.end - shot.start > was.end - was.start, 'the shot grew with its line');
  assert.deepEqual([cam.start, cam.end], [shot.start, shot.end], 'so did its camera');
  valid(b.doc);
  // retimed by hand: it keeps its length from then on
  const doc2 = structuredClone(b.doc);
  clip(doc2, 'cameras', (c) => c.src === `${id}#cam`).end -= 6;
  const kept = clip(doc2, 'cameras', (c) => c.src === `${id}#cam`).end - clip(doc2, 'cameras', (c) => c.src === `${id}#cam`).start;
  const c = build(longer.replace('and an extra shot.', 'and two extra shots, please.'), doc2);
  const cam2 = clip(c.doc, 'cameras', (x) => x.src === `${id}#cam`);
  assert.equal(cam2.end - cam2.start, kept);
  valid(c.doc);
});

test('in the editor: a re-script is one undo step; undo and redo restore exact bytes; errors change nothing', () => {
  const r = build(SMALL);
  const s = new EditorSession({ registry: m0Registry(), text: text(r.doc) });
  s.setDoc = set;
  const before = s.text();
  // a timeline edit first (one step), then a re-script (one step)
  const id = lineId(r, 'Good morning');
  const i = track(s.doc, 'hana-1-act').clips.findIndex((c) => c.src === `${id}#g:greet`);
  s.seq.moveClip('hana-1-act', i, { start: track(s.doc, 'hana-1-act').clips[i].start + 3, end: track(s.doc, 'hana-1-act').clips[i].end + 3 });
  const moved = s.text();
  const edited = SMALL.replace('A latte, please.', 'A latte, please. To go.');
  const out = applyScript(s, edited, { marks });
  assert.equal(out.changed, true);
  assert.match(out.label, /^Re-script \(1 changed\)$/);
  assert.equal(s.history().undo, out.label);
  assert.ok(clip(s.doc, 'hana-1-act', (c) => c.src === `${id}#g:greet`).hand, 'the timeline edit was kept');
  assert.equal(clip(s.doc, 'mira-says', (c) => c.text.endsWith('To go.'))?.text, 'A latte, please. To go.');
  const after = s.text();
  s.undo(); assert.equal(s.text(), moved, 'one undo takes back the whole re-script');
  s.undo(); assert.equal(s.text(), before);
  s.redo(); s.redo(); assert.equal(s.text(), after);
  assert.deepEqual(s.validate().errors, []);
  // errors: nothing changes, no undo step
  const depth = s.history().undoDepth;
  const bad = applyScript(s, `${edited}\nHANA\nOops [[wink]]\n`, { marks });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors[0].line, edited.split('\n').length + 2);
  assert.equal(s.text(), after);
  assert.equal(s.history().undoDepth, depth);
  // the same script again: no change, no step
  assert.equal(applyScript(s, edited, { marks }).changed, false);
  assert.equal(s.history().undoDepth, depth);
});

test('re-scripting is deterministic: the same edits from the same document give the same bytes', () => {
  const a = build(SMALL);
  const doc = structuredClone(a.doc);
  clip(doc, 'hana-1-act', (c) => c.slot === 'greet').start += 2;
  const edited = SMALL.replace('Hana wipes the counter.\n', 'Hana wipes the counter.\n\nMIRA\nExcuse me?\n');
  assert.equal(text(build(edited, structuredClone(doc)).doc), text(build(edited, structuredClone(doc)).doc));
});

// review of PR #2, blocking 1: an edited line is matched by its words, not by its place in the gap
const TWO = `Title: Two
Set: cafe.vrmxs
Marks:
    HANA = behind-counter
    MIRA = counter-front

INT. CAFE - MORNING

HANA
Morning!

MIRA
A latte, please.

MIRA
Is it always this quiet in the morning?

HANA
Only until the students wake up.
`;

test('an edited line keeps its own id when the line before it by the same speaker is cut', () => {
  const a = build(TWO);
  const doc = structuredClone(a.doc);
  const quiet = lineId(a, 'Is it always');
  clip(doc, 'mira-eyes', (c) => c.src === `${quiet}#look`).at = 'camera';
  const edited = TWO.replace('MIRA\nA latte, please.\n\n', '').replace('Is it always this quiet in the morning?', 'Is it always this quiet in the mornings here?');
  const b = build(edited, doc);
  assert.equal(lineId(b, 'Is it always'), quiet, 'the reworded line is matched by its words, not the cut line\'s place');
  const looks = track(b.doc, 'mira-eyes').clips.filter((c) => c.src === `${quiet}#look`);
  assert.equal(looks.length, 1, 'one look for the line, not a hand one and a generated one');
  assert.equal(looks[0].at, 'camera');
  const say = clip(b.doc, 'mira-says', (c) => c.src === `${quiet}#say`);
  assert.deepEqual([looks[0].start, looks[0].end], [say.start, say.end]);
  assert.ok(!track(b.doc, 'mira-eyes').clips.some((c) => c.src.split('#')[0] !== quiet && c.hand), 'no hand item left on a cut line');
  valid(b.doc);
  // rewritten past recognition beside the cut line: a new line, and the old line's hand look goes (with a warning)
  const c = build(TWO.replace('MIRA\nA latte, please.\n\n', '').replace('Is it always this quiet in the morning?', 'Do you have oat milk?'), doc);
  assert.notEqual(lineId(c, 'Do you have'), quiet);
  assert.ok(!track(c.doc, 'mira-eyes').clips.some((x) => x.at === 'camera'));
  assert.ok(c.warnings.some((w) => w.includes(quiet) && /took 1 hand-edited item/.test(w)), c.warnings.join('\n'));
});

// blocking 2: a cut line takes its hand edits with it
test('a cut line takes its hand-edited dialogue, look, shot and face keys with it, and says so', () => {
  const src = `${SMALL}\nMIRA\n(smiling)\nThanks!\n`;
  const a = build(src);
  const doc = structuredClone(a.doc);
  const latte = lineId(a, 'A latte'), thanks = lineId(a, 'Thanks');
  const say = clip(doc, 'mira-says', (c) => c.src === `${latte}#say`); say.end += 12; // retimed
  clip(doc, 'mira-eyes', (c) => c.src === `${latte}#look`).at = 'camera';
  doc.sequence.shots.find((x) => x.src === `${latte}#shot`).overrides = { 'counter-light': { props: { intensity: 30 } } };
  const happy = track(doc, 'mira-face').keys.happy; happy[1] = [happy[1][0], 1, 'easeOut'];
  const b = build(src.replace('MIRA\nA latte, please.\n\n', '').replace('MIRA\n(smiling)\nThanks!\n', ''), doc);
  assert.ok(!track(b.doc, 'mira-says'), 'her words are gone with the line');
  assert.ok(!(track(b.doc, 'mira-eyes')?.clips ?? []).some((c) => [latte, thanks].includes(c.src.split('#')[0])));
  assert.ok(!b.doc.sequence.shots.some((x) => x.src.startsWith(latte)));
  assert.equal(track(b.doc, 'mira-face'), undefined, 'the hand-keyed smile went with its line');
  assert.ok(b.warnings.some((w) => w.includes(latte) && /took 3 hand-edited items/.test(w)), b.warnings.join('\n'));
  assert.ok(b.warnings.some((w) => w.includes(thanks) && /hand-edited item/.test(w)), b.warnings.join('\n'));
  assert.equal(b.doc.sequence.script.hand, undefined);
  assert.equal(b.doc.sequence.script.used, undefined, 'nothing refers to the cut ids any more');
  valid(b.doc);
});

// should-fix 4: the build's nodes follow the script too
test('generated nodes: a moved mark moves the wide; a cast member cut entirely loses her camera; hand-moved nodes stay', () => {
  const a = build(SMALL);
  const moved = SMALL.replace('MIRA = counter-front', 'MIRA = window-table');
  const b = build(moved, a.doc);
  const wide = (r) => r.doc.nodes.find((n) => n.id === 'vc-wide').transform.p;
  assert.notDeepEqual(wide(b), wide(a), 'the wide is placed off the new line');
  assert.deepEqual(b.doc.sequence.cast.mira.transform, marks['window-table']);
  assert.ok(b.setNodes.some((x) => x.id === 'vc-wide' && x.path === 'transform'));
  assert.ok(b.addNodes.some((n) => n.id === 'mark-window-table'));
  assert.ok(b.removeNodes.includes('mark-counter-front'), 'a mark nothing uses any more goes');
  // a hand-moved wide is the person's: kept where they put it
  const doc = structuredClone(a.doc);
  doc.nodes.find((n) => n.id === 'vc-wide').transform = { p: [5, 2, 5] };
  const c = build(moved, doc);
  assert.deepEqual(c.doc.nodes.find((n) => n.id === 'vc-wide').transform, { p: [5, 2, 5] });
  // cut all of Hana's lines: her close-up goes (nothing uses it)
  const noHana = build(SMALL.replace(/HANA\n\(smiling\)\nGood morning! \[\[greet\]\] What can I get you\?\n\n/, '').replace('HANA\n(nods)\nComing right up!\n', ''), a.doc);
  assert.ok(noHana.removeNodes.includes('vc-hana-1'));
  assert.ok(!noHana.doc.nodes.some((n) => n.id === 'vc-hana-1'));
  valid(noHana.doc);
  // in the editor, those node changes are part of the one undo step
  const s = new EditorSession({ registry: m0Registry(), text: text(a.doc) });
  s.setDoc = set;
  const before = s.text();
  const out = applyScript(s, moved, { marks });
  assert.equal(out.changed, true);
  assert.equal(s.text(), text(b.doc));
  s.undo(); assert.equal(s.text(), before);
});
