// M4 W4 (AB-T-0576): a script → a sequence over the cafe. Numbered shots, the cast on marks, a dialogue track per
// speaker, look-at, the default performance and cameras; a valid sequence in its set; the same bytes every time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { createValidator } from '@vrmxg/scene';
import { checkSequence, composeSequence, subtitles } from '@vrmxg/sequence';
import { buildSequence, defaultCoverage } from '../src/index.js';
import { sample, set, marks, sha, text, track, SAMPLE } from './helpers.mjs';

const build = (src = sample, o = {}) => buildSequence(src, { set, marks, id: 'cafe-order', source: 'scripts/cafe-order.fountain', ...o });

test('the sample builds: numbered shots, the cast on its marks, cameras and a brain', () => {
  const r = build();
  assert.ok(r.ok, JSON.stringify(r.errors));
  const { doc } = r, seq = doc.sequence;
  assert.equal(doc.set, 'cafe.vrmxs');
  assert.deepEqual(seq.shots.map((s) => s.name), ['010', '020', '030', '040', '050', '060', '070', '080', '090', '100', '110']);
  for (let i = 1; i < seq.shots.length; i++) assert.equal(seq.shots[i].start, seq.shots[i - 1].end, 'shots tile the film');
  assert.equal(seq.shots.at(-1).end, seq.duration);
  assert.deepEqual(seq.cast['hana-1'], { behaviours: [], src: 'cast#hana-1', transform: marks['behind-counter'] });
  assert.deepEqual(seq.cast.mira.transform, marks['counter-front']);
  assert.deepEqual(doc.nodes.filter((n) => n.type === 'Marker').map((n) => n.id), ['mark-behind-counter', 'mark-counter-front']);
  assert.deepEqual(doc.nodes.find((n) => n.id === 'brain').props, { camera: 'cam' });
  const cams = track(doc, 'cameras').clips;
  assert.equal(cams.length, seq.shots.length);
  assert.equal(cams[0].camera, 'vc-wide', 'the scene heading establishes');
  assert.equal(cams[2].camera, 'vc-hana-1', 'a line is on the speaker');
  assert.deepEqual(cams.find((c) => c.blend)?.blend, { frames: 12, style: 'easeInOut' }, 'DISSOLVE TO: blends into the next shot');
  assert.deepEqual(seq.markers.map((m) => [m.frame, m.name]), [[0, 'INT. CAFE - MORNING']]);
});

test('a dialogue track per speaker, the speaker\'s look-at, and a performance from tags and parentheticals', () => {
  const { doc } = build();
  const hana = track(doc, 'hana-1-says').clips, mira = track(doc, 'mira-says').clips;
  assert.deepEqual(hana.map((c) => c.text), ['Good morning! What can I get you?', 'Coming right up!', 'Only until the students wake up.', 'Here you go. Enjoy!']);
  assert.equal(mira.length, 3);
  assert.equal(hana[2].start - track(doc, 'cameras').clips[7].start, 12, '(beat) waits half a second before the line');
  // eyes: the speaker on the one she talks to, the listener on the speaker
  const he = track(doc, 'hana-1-eyes').clips, me = track(doc, 'mira-eyes').clips;
  assert.ok(he.every((c) => c.at === 'mira') && me.every((c) => c.at === 'hana-1'));
  assert.ok(me.some((c) => c.src.startsWith('ac-')), '[[MIRA look: HANA]] in action');
  // body: talk under every line; gestures from tags and parentheticals
  const act = track(doc, 'hana-1-act');
  assert.equal(act.step, 2, 'characters on twos');
  const slots = act.clips.map((c) => c.slot);
  for (const s of ['talk', 'greet', 'nod', 'laugh']) assert.ok(slots.includes(s), s);
  assert.deepEqual(track(doc, 'mira-act').clips.filter((c) => c.slot !== 'talk').map((c) => c.slot), ['point', 'sip']);
  // a gesture starting with a line sorts after its talk clip, so it blends in over it
  const nod = act.clips.findIndex((c) => c.slot === 'nod'), talk = act.clips.findIndex((c) => c.slot === 'talk' && c.start === act.clips[nod].start);
  assert.ok(talk >= 0 && talk < nod);
  // face: (smiling) and [[HANA happy]] → happy; (warmly) → relaxed
  assert.deepEqual(Object.keys(track(doc, 'hana-1-face').keys), ['happy']);
  assert.deepEqual(Object.keys(track(doc, 'mira-face').keys), ['relaxed']);
  assert.match(subtitles(doc.sequence, { 'hana-1': 'Hana', mira: 'Mira' }), /^1\n00:00:06,500 --> 00:00:09,125\nHana: Good morning! What can I get you\?/);
});

test('the sequence is valid in its set: checkSequence, composeSequence and the schema', () => {
  const { doc } = build();
  const ids = new Set([...set.nodes, ...doc.nodes].map((n) => n.id));
  assert.deepEqual(checkSequence(doc.sequence, { nodeIds: ids }), []);
  const world = composeSequence(doc, set);
  assert.deepEqual(world.nodes.find((n) => n.id === 'mira').transform, marks['counter-front']);
  assert.deepEqual(world.nodes.find((n) => n.id === 'mira').behaviours, [], 'Mira stands for the camera, no player input');
  const v = createValidator(m0Registry()).check(world, { prefabs: new Map([...fs.readdirSync(path.join(SAMPLE, 'prefabs'))].map((f) => [`prefabs/${f}`, JSON.parse(fs.readFileSync(path.join(SAMPLE, 'prefabs', f), 'utf8'))])) });
  assert.deepEqual(v.errors, []);
});

test('deterministic: the same script gives the same bytes, and re-scripting an unchanged script changes nothing', () => {
  const a = text(build().doc), b = text(build().doc);
  assert.equal(a, b);
  const again = build(sample, { previous: build().doc });
  assert.equal(text(again.doc), a);
  assert.deepEqual(again.report.added, []);
  // the committed sample sequence is this build (content/sample/tools/make-script-sequence.mjs writes it)
  assert.equal(fs.readFileSync(path.join(SAMPLE, 'sequences/cafe-order.vrmxs'), 'utf8'), a);
  // golden: a deliberate change to the build changes this, in Node, Chromium and WKWebView alike (acceptance/m4)
  assert.equal(sha(a), JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'golden.json'), 'utf8')).sample);
});

test('the coverage hook replaces the default cameras; vocabularies narrow the tags', () => {
  const coverage = (ctx) => {
    const d = defaultCoverage(ctx);
    for (const [k] of d.cuts) d.cuts.set(k, { camera: 'vc-wide' });
    return { nodes: d.nodes.filter((n) => n.id === 'vc-wide'), cuts: d.cuts };
  };
  const r = build(sample, { coverage });
  assert.ok(track(r.doc, 'cameras').clips.every((c) => c.camera === 'vc-wide'));
  assert.ok(!r.doc.nodes.some((n) => n.id === 'vc-mira'));
  const narrow = build(sample, { vocab: { gestures: ['nod'] } });
  assert.equal(narrow.ok, false);
  assert.deepEqual(narrow.errors.map((e) => e.line), [17, 20, 34, 45]);
});

test('a coverage hook may cut inside a shot (splits, M4 W8): a clip of its own per piece, kept through a re-script', () => {
  const coverage = (ctx) => {
    const d = defaultCoverage(ctx);
    const s = ctx.shots[3], mid = s.start + 20;
    d.cuts.set(s.beat, { ...d.cuts.get(s.beat), splits: [{ frame: mid, camera: 'vc-wide' }, { frame: s.end + 5, camera: 'vc-wide' }] });
    return d;
  };
  const r = build(sample, { coverage });
  const shot = r.doc.sequence.shots[3], beat = shot.src.split('#')[0];
  const clips = track(r.doc, 'cameras').clips.filter((c) => c.start >= shot.start && c.start < shot.end);
  assert.deepEqual(clips.map((c) => [c.start, c.end, c.camera, c.src]), [[shot.start, shot.start + 20, 'vc-mira', `${beat}#cam`], [shot.start + 20, shot.end, 'vc-wide', `${beat}#cam:2`]], 'a split outside the shot is ignored');
  assert.deepEqual(checkSequence(r.doc.sequence, { nodeIds: new Set([...set.nodes, ...r.doc.nodes].map((n) => n.id)) }), []);
  assert.equal(text(build(sample, { coverage, previous: JSON.parse(text(r.doc)) }).doc), text(r.doc));
  // without splits the build is as before
  assert.equal(text(build(sample, { coverage: defaultCoverage }).doc), text(build().doc));
});

test('a parenthetical may hold any word: "constructor" or "valueOf" looks up nothing in the vocabularies', () => {
  for (const p of ['(constructor)', '(valueOf, toString)', '(__proto__ hasOwnProperty)']) {
    const r = build(`Title: T\nSet: cafe.vrmxs\nMarks:\n    HANA = behind-counter\n    MIRA = counter-front\n\nINT. CAFE - MORNING\n\nHANA\n${p}\nHello there.\n\nMIRA\nHi.\n`);
    assert.ok(r.ok, JSON.stringify(r.errors));
    assert.ok(!r.plan.events.some((e) => e.type === 'expression' || e.type === 'gesture'), p);
  }
});

test('voice-over, off-screen and dual dialogue; marks moved by [[at]]; behaviours kept on request', () => {
  const src = `Title: Kinds
Set: cafe.vrmxs
Marks:
    HANA = behind-counter

INT. CAFE

MIRA (V.O.)
I remember that morning.

HANA (O.S.)
Back in a second!

HANA
Hello.

MIRA ^
Hi!

Mira crosses to the window. [[MIRA at: window-table]] Hana steps round the counter. [[HANA at: counter-front]]
`;
  const r = buildSequence(src, { set, marks, behaviours: true });
  assert.ok(r.ok, JSON.stringify(r.errors));
  const act = (id) => track(r.doc, `${id}-act`)?.clips ?? [];
  assert.equal(act('mira').length, 1, 'no talk for a voice-over line; the dual line talks');
  assert.equal(act('hana-1').length, 1, 'no talk off screen');
  const lines = [...track(r.doc, 'hana-1-says').clips, ...track(r.doc, 'mira-says').clips].sort((a, b) => a.start - b.start);
  assert.equal(lines[2].start, lines[3].start, 'dual dialogue starts together');
  assert.equal(r.doc.sequence.shots.length, 5, 'the dual line shares its shot (heading, three lines, action)');
  assert.equal(track(r.doc, 'cameras').clips[3].camera, 'vc-wide', 'an overlap plays in the wide');
  assert.equal(track(r.doc, 'mira-moves'), undefined, 'Mira\'s only mark places her for the film');
  assert.deepEqual(r.doc.sequence.cast.mira.transform, marks['window-table']);
  const moves = track(r.doc, 'hana-1-moves').keys;
  assert.deepEqual(moves[0], [0, marks['behind-counter']], 'Hana starts on her title-page mark …');
  assert.deepEqual(moves[1].slice(1), [marks['counter-front'], 'step'], '… and cuts to the next');
  assert.ok(moves[1][0] > 0);
  assert.equal(r.doc.sequence.cast.mira.behaviours, undefined, 'behaviours: true keeps the set\'s');
});
