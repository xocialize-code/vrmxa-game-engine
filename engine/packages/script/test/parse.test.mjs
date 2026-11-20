// M4 W4 (AB-T-0576): the Fountain subset. Elements and their types, the title page, ids that survive edits elsewhere,
// and errors that point at script lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, buildSequence, formatErrors, plain, numberShots } from '../src/index.js';
import { sample, set, marks } from './helpers.mjs';

test('the sample reads as scene, action, cues, dialogue, parentheticals and transitions', () => {
  const p = parseScript(sample);
  assert.deepEqual(p.errors, []);
  assert.equal(p.title.title, 'The Order');
  assert.equal(p.title.set, 'cafe.vrmxs');
  assert.deepEqual(p.title.cast, { HANA: 'hana-1', MIRA: 'mira' });
  assert.deepEqual(p.title.marks, { HANA: 'behind-counter', MIRA: 'counter-front' });
  const types = new Set(p.elements.map((e) => e.type));
  for (const t of ['scene', 'action', 'character', 'dialogue', 'parenthetical', 'transition']) assert.ok(types.has(t), t);
  const first = p.beats.find((b) => b.kind === 'line');
  assert.equal(first.cue, 'HANA');
  assert.deepEqual(first.parts.map((x) => x.kind), ['paren', 'text']);
  assert.equal(first.text, 'Good morning! What can I get you?', 'notes are not words');
  assert.deepEqual(first.parts[1].tags.map((g) => [g.name, g.word]), [['greet', 2]]);
  assert.deepEqual(p.beats.filter((b) => b.kind === 'transition').map((b) => b.text), ['DISSOLVE TO:', 'FADE OUT.']);
  // every element has an id, unique, and children hang off their beat's
  const ids = p.elements.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const e of p.elements.filter((x) => x.type === 'dialogue' || x.type === 'parenthetical')) assert.ok(e.id.startsWith(`${e.beat}.`));
  assert.ok(p.elements.every((e) => e.line >= 1));
});

test('the subset: forced elements, scene numbers, extensions, dual dialogue, notes, boneyard, sections', () => {
  const p = parseScript(`.THE ROOFTOP #12#

!WHAM. It's loud.

@McCLANE (O.S.)
Yippee!

HANA (V.O.)
(softly)
Hello.

MIRA ^
Hi!

# Act two
= she leaves

/* cut this
INT. NOWHERE */
> SMASH CUT TO:

>THE END<

Fine. [[fix this later]] [[nod]]
`);
  assert.deepEqual(p.errors, []);
  const [scene, act, a, b, c, smash, end, fine] = p.beats;
  assert.deepEqual([scene.kind, scene.heading, scene.number], ['scene', 'THE ROOFTOP', '12']);
  assert.deepEqual([act.kind, act.text], ['action', "WHAM. It's loud."]);
  assert.deepEqual([a.cue, a.ext], ['McCLANE'.toUpperCase(), 'O.S.']);
  assert.deepEqual([b.cue, b.ext, b.parts[0].text], ['HANA', 'V.O.', 'softly']);
  assert.equal(c.dual, true);
  assert.deepEqual([smash.kind, smash.text], ['transition', 'SMASH CUT TO:']);
  assert.deepEqual([end.kind, end.text], ['action', 'THE END']);
  assert.deepEqual(fine.notes, ['fix this later'], 'a note that isn\'t a tag is a writer\'s note');
  assert.equal(p.beats.length, 8, 'sections, synopses and the boneyard add nothing');
});

test('ids survive edits elsewhere: insert, delete and reorder other beats', () => {
  const base = parseScript(sample);
  const idOf = (p, text) => p.beats.find((b) => b.kind === 'line' && b.text.startsWith(text)).id;
  const coming = idOf(base, 'Coming right up');
  const inserted = parseScript(sample.replace('INT. CAFE - MORNING\n', 'INT. CAFE - MORNING\n\nA bell rings.\n\nMIRA\nHello?\n'));
  assert.equal(idOf(inserted, 'Coming right up'), coming);
  const cut = parseScript(sample.replace('MIRA\n(to Hana)\nIs it always this quiet in the morning?\n\n', ''));
  assert.equal(idOf(cut, 'Coming right up'), coming);
  // the same words twice get distinct ids
  const twice = parseScript('INT. A\n\nHANA\nYes.\n\nHANA\nYes.\n');
  const [x, y] = twice.beats.filter((b) => b.kind === 'line');
  assert.notEqual(x.id, y.id);
  assert.equal(y.id, `${x.id}-2`);
});

test('an edited beat keeps its id when the last build\'s beat table is given', () => {
  const r = buildSequence(sample, { set, marks });
  const before = r.parsed.beats.find((b) => b.kind === 'line' && b.text.startsWith('Coming right up'));
  const edited = parseScript(sample.replace('Coming right up!', 'Coming right up, one moment!'), { previous: r.doc.sequence.script });
  const after = edited.beats.find((b) => b.kind === 'line' && b.text.startsWith('Coming right up'));
  assert.equal(after.id, before.id, 'words edited, id kept');
  assert.notEqual(after.fp, before.fp);
  // without the table, the edited beat is a new one
  assert.notEqual(parseScript(sample.replace('Coming right up!', 'Coming right up, one moment!')).beats.find((b) => b.text?.startsWith('Coming')).id, before.id);
  // a changed speaker is a new beat
  const swapped = parseScript(sample.replace('HANA\n(nods)\nComing right up!', 'MIRA\n(nods)\nComing right up!'), { previous: r.doc.sequence.script });
  assert.notEqual(swapped.beats.find((b) => b.text?.startsWith('Coming')).id, before.id);
});

test('errors point at script lines', () => {
  const src = [
    'Title: Bad', //                       1
    'Cast: HANA hana-1', //                2  malformed
    '', //                                 3
    'INT. CAFE #1#', //                    4
    '', //                                 5
    'HANA', //                             6
    'Hello [[hapy]] there.', //            7  unknown tag
    '', //                                 8
    'MIRA', //                             9
    '(beat)', //                           10 a cue with no dialogue
    '', //                                 11
    'EXT. STREET #1#', //                  12 duplicate scene number
    '', //                                 13
    '~la la la', //                        14 lyrics
    '', //                                 15
    'Mira waves. [[MIRA nod', //           16 unclosed note
    '', //                                 17
    'HANA', //                             18
    '[[look]]', //                         19 a keyed tag without its value
    '', //                                 20
    '/* never closed', //                  21
  ].join('\n');
  const p = parseScript(src);
  const lines = p.errors.map((e) => e.line);
  assert.deepEqual(lines, [2, 7, 9, 12, 14, 16, 18, 19, 21], formatErrors(p.errors, 'bad.fountain'));
  assert.match(p.errors.find((e) => e.line === 7).message, /unknown tag "hapy"/);
  assert.match(p.errors.find((e) => e.line === 12).message, /also on line 4/);
  assert.match(formatErrors(p.errors, 'bad.fountain'), /^bad\.fountain:2: Cast:/);
});

test('the build adds errors at lines: unknown characters, marks and tags out of place', () => {
  const src = `Title: Who
Set: cafe.vrmxs
Marks:
    HANA = nowhere

INT. CAFE

SATO
Hi.

Mira sits. [[nod]]

HANA
Hello. [[look: the moon]]
`;
  const r = buildSequence(src, { set, marks });
  assert.equal(r.ok, false);
  const got = r.errors.map((e) => [e.line, e.message.split(':')[0]]);
  assert.deepEqual(got, [[4, 'mark "nowhere"'], [8, 'SATO'], [11, '[[nod]]'], [14, 'mark "the moon"']], formatErrors(r.errors));
  assert.equal(r.doc, undefined, 'no document from a script with errors');
  // a script with no set named anywhere
  const noSet = buildSequence('INT. A\n\nHANA\nHi.\n');
  assert.equal(noSet.ok, false);
  assert.match(noSet.errors[0].message, /which set/);
});

test('review fixes: a boneyard line inside dialogue, dual dialogue placement, title keys, two spaces, tag spacing', () => {
  // a line the boneyard takes is gone, not blank: the cue keeps its dialogue
  const bone = parseScript('INT. A\n\nMIRA\n/* cut */\nHello there.\n');
  assert.deepEqual(bone.errors, []);
  assert.deepEqual(bone.beats.map((b) => b.kind), ['scene', 'line']);
  assert.equal(bone.beats[1].text, 'Hello there.');
  // dual dialogue goes straight after the line it overlaps
  const dual = parseScript('INT. A\n\nHANA\nHi.\n\nShe waves.\n\nMIRA ^\nHi!\n');
  assert.deepEqual(dual.errors.map((e) => [e.line, /straight after/.test(e.message)]), [[8, true]]);
  assert.deepEqual(parseScript('INT. A\n\nHANA\nHi.\n\nMIRA ^\nHi!\n').errors, []);
  // only known keys start a title page: FADE IN: is a transition, not a key
  const fade = parseScript('FADE IN:\n\nINT. A\n\nHANA\nHi.\n');
  assert.deepEqual(fade.title.keys, {});
  assert.deepEqual(fade.beats.map((b) => b.kind), ['transition', 'scene', 'line']);
  assert.equal(parseScript('Draft date: today\nSet: cafe.vrmxs\n\nINT. A\n').title.set, 'cafe.vrmxs');
  // a line of two spaces keeps a dialogue block going
  const two = parseScript('INT. A\n\nHANA\nFirst.\n  \nSecond.\n');
  assert.equal(two.beats.filter((b) => b.kind === 'line').length, 1);
  assert.equal(two.beats[1].text, 'First. Second.');
  // a tag cut from before punctuation leaves no space
  assert.equal(plain('Hi there [[nod]].'), 'Hi there.');
  assert.equal(plain('Good morning! [[greet]] What can I get you?'), 'Good morning! What can I get you?');
});

test('shot numbers: between, letters in reading order, and a warning where nothing fits', () => {
  const n = (prev, ids) => { const w = []; const m = numberShots(ids.map((id) => ({ id })), new Map(Object.entries(prev)), { warn: (x) => w.push(x) }); return [[...m.values()], w.length]; };
  assert.deepEqual(n({}, ['a', 'b', 'c']), [['010', '020', '030'], 0]);
  assert.deepEqual(n({ a: '010', c: '020' }, ['a', 'b', 'c']), [['010', '015', '020'], 0]);
  assert.deepEqual(n({ a: '030', c: '031' }, ['a', 'b', 'x', 'c']), [['030', '030A', '030B', '031'], 0]);
  assert.deepEqual(n({ a: '029A', c: '029B' }, ['a', 'b', 'c']), [['029A', '029AA', '029B'], 0]);
  assert.deepEqual(n({ a: '029', c: '029A' }, ['a', 'b', 'c']), [['029', '029B', '029A'], 1], 'no room between 029 and 029A: said, not hidden');
});
