// M4 W8 (AB-T-0580): the 180° lint on hand edits, replacing a shot's camera as one undoable edit (kept through a
// re-script), and the storyboard's data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { m0Registry } from '@vrmxg/registry/m0';
import { EditorSession } from '@vrmxg/editor-core';
import { applyScript } from '@vrmxg/script';
import { lintLine, replaceShotCamera, cameraOnRig, storyboard, thumbFrame, sideOf } from '../src/index.js';
import { build, cams, node, set, sample, marks, text } from './helpers.mjs';
import { coverByRule } from '../src/index.js';

const session = (doc) => { const s = new EditorSession({ registry: m0Registry(), text: text(doc) }); s.setDoc = set; return s; };
/** A copy of a camera mirrored across the line between Hana and Mira (x = 0.6 in the cafe). */
const mirrored = (n, id) => ({ ...structuredClone(n), id, name: `${n.name}, across the line`, transform: { p: [1.2 - n.transform.p[0], n.transform.p[1], n.transform.p[2]] } });

test('the 180° lint flags a cut across the line, and not a neutral shot or a deliberate cross', () => {
  const { doc } = build();
  assert.deepEqual(lintLine(doc, { set }).issues, []);
  // shot 050 (Hana over Mira) swapped by hand for the same setup from the other side
  const bad = structuredClone(doc);
  bad.nodes.push(mirrored(node(doc, 'vc-ots-hana-1-mira'), 'vc-wrong'));
  const c050 = cams(bad).find((c) => c.camera === 'vc-ots-hana-1-mira');
  c050.camera = 'vc-wrong';
  const { issues } = lintLine(bad, { set });
  // both cuts that touch it cross: 040 → 050 and 050 → 060
  assert.deepEqual(issues.map((x) => [x.shots, x.cameras, x.line]), [
    [['040', '050'], ['vc-ots-mira-hana-1', 'vc-wrong'], ['hana-1', 'mira']],
    [['050', '060'], ['vc-wrong', 'vc-two'], ['hana-1', 'mira']],
  ]);
  assert.match(issues[0].message, /^frame 310 \(040 → 050\): the cut from vc-ots-mira-hana-1 to vc-wrong crosses the line between hana-1 and mira$/);
  // the storyboard marks the shot the bad cut goes into
  assert.deepEqual(storyboard(bad, { set }).shots.filter((s) => s.crossesLine).map((s) => s.name), ['050', '060']);
  // a crossing on purpose is marked on the shot it cuts into
  const meant = structuredClone(bad);
  for (const s of meant.sequence.shots) if (s.name === '050' || s.name === '060') s.crossLine = true;
  assert.deepEqual(lintLine(meant, { set }).issues, []);
  // a neutral shot on the line itself (behind Hana, looking down the line) is the way across: not flagged
  const neutral = structuredClone(bad);
  neutral.nodes.push({ id: 'vc-neutral', type: 'VirtualCamera', transform: { p: [0.6, 1.5, -6] }, props: { rig: 'shotReverse', aim: { target: 'mira' } } });
  cams(neutral).find((c) => c.camera === 'vc-ots-mira-hana-1' && c.start === 225).camera = 'vc-neutral';
  assert.deepEqual(lintLine(neutral, { set }).issues.map((x) => x.shots), [['050', '060']]);
});

test('the lint places cameras by their bodies: follow close-ups from their target, a dolly unchecked', () => {
  const { doc } = build();
  const d = structuredClone(doc);
  // M2's closeUp rig as is: a follow body 0.9 m in front of Mira, who faces Hana along the line: on the line, neutral
  d.nodes.push({ id: 'vc-follow', type: 'VirtualCamera', props: { rig: 'closeUp', aim: { target: 'mira' }, body: { target: 'mira' } } });
  // the same with the offset to the far side of the line: Mira's +X is the world's −X (she is turned half round)
  d.nodes.push({ id: 'vc-follow-far', type: 'VirtualCamera', props: { rig: 'closeUp', aim: { target: 'mira' }, body: { target: 'mira', offset: [-1.2, 1.55, 0.9] } } });
  d.nodes.push({ id: 'vc-dolly', type: 'VirtualCamera', props: { rig: 'dolly', aim: { target: 'mira' }, body: { path: 'rail' } } });
  const at = (shot) => cams(d).find((c) => c.start === d.sequence.shots.find((s) => s.name === shot).start);
  at('040').camera = 'vc-follow';
  assert.deepEqual(lintLine(d, { set }).issues, []);
  at('040').camera = 'vc-follow-far';
  assert.deepEqual(lintLine(d, { set }).issues.map((x) => x.shots), [['030', '040'], ['040', '050']]);
  at('040').camera = 'vc-dolly';
  assert.deepEqual(lintLine(d, { set }), { issues: [], unchecked: [{ frame: 225, cameras: ['vc-cu-hana-1-to-mira', 'vc-dolly'] }, { frame: 310, cameras: ['vc-dolly', 'vc-ots-hana-1-mira'] }] });
});

test('the lint reads what plays: a shot\'s override and a transform track move a camera, a turntable is unchecked', () => {
  const { doc } = build();
  const shot = (d, n) => d.sequence.shots.find((x) => x.name === n);
  const mirror = (p) => [1.2 - p[0], p[1], p[2]];
  const across = [['040', '050'], ['050', '060']];
  // shot 050's override moves its own camera across the line (only while 050 plays: 090 → 100 → 110 is untouched)
  const o = structuredClone(doc);
  shot(o, '050').overrides = { 'vc-ots-hana-1-mira': { transform: { p: mirror(node(o, 'vc-ots-hana-1-mira').transform.p) } } };
  assert.deepEqual(lintLine(o, { set }).issues.map((x) => x.shots), across);
  // a prop override that turns it into another kind of camera counts too: a follow close-up on Mira's far side
  const po = structuredClone(doc);
  shot(po, '050').overrides = { 'vc-ots-hana-1-mira': { props: { rig: 'closeUp', aim: { target: 'mira' }, body: { target: 'mira', offset: [-1.2, 1.55, 0.9] } } } };
  assert.deepEqual(lintLine(po, { set }).issues.map((x) => x.shots), across);
  // a transform track on the camera, eased across the line over shot 050 (sampled as it plays, not as a step)
  const t = structuredClone(doc), s050 = shot(t, '050'), p0 = node(t, 'vc-ots-hana-1-mira').transform.p;
  t.sequence.tracks.push({ id: 'cam-move', type: 'transform', target: 'vc-ots-hana-1-mira', keys: [[s050.start - 40, { p: p0 }], [s050.start + 40, { p: mirror(p0) }]] });
  const L = lintLine(t, { set }).issues.map((x) => x.shots);
  assert.deepEqual(L.slice(0, 1), [['050', '060']], 'at 040 → 050 it is only half way: on the line, neutral; at 050 → 060 it is across');
  // a turntable: where it stands depends on how long it has turned, so its cuts aren't checked
  const d = structuredClone(doc);
  d.nodes.push({ id: 'vc-turn', type: 'VirtualCamera', props: { rig: 'turntable', aim: { target: 'mira' }, body: { target: 'mira', yaw: 90 } } });
  cams(d).find((x) => x.start === shot(d, '050').start).camera = 'vc-turn';
  assert.deepEqual(lintLine(d, { set }), { issues: [], unchecked: [{ frame: 310, cameras: ['vc-ots-mira-hana-1', 'vc-turn'] }, { frame: 349, cameras: ['vc-turn', 'vc-two'] }] });
  // the same orbit standing still is placed and checked
  node(d, 'vc-turn').props.body.yawSpeed = 0;
  assert.deepEqual(lintLine(d, { set }).unchecked, []);
});

test('cuts are where the live clip changes: a clip laid over a longer one cuts in and back out', () => {
  const { doc } = build();
  const d = structuredClone(doc);
  const sh = (n) => d.sequence.shots.find((s) => s.name === n);
  // a hand edit: 040's clip runs on through 060 (050's and 060's clips removed)
  const track = d.sequence.tracks.find((t) => t.type === 'camera');
  track.clips.find((c) => c.start === sh('040').start).end = sh('060').end;
  track.clips = track.clips.filter((c) => !(c.start === sh('050').start || c.start === sh('060').start));
  // then 050 gets a camera from across the line: laid over the long clip for 050 alone
  const s = session(d);
  const out = replaceShotCamera(s, '050', mirrored(node(d, 'vc-ots-hana-1-mira'), 'vc-wrong'));
  assert.equal(out.previous, 'vc-ots-mira-hana-1');
  const t = s.doc.sequence.tracks.find((x) => x.type === 'camera');
  assert.deepEqual(t.clips.filter((c) => c.start >= sh('040').start && c.start < sh('060').end).map((c) => [c.start, c.end, c.camera]), [[225, sh('060').end, 'vc-ots-mira-hana-1'], [310, 349, 'vc-wrong']]);
  assert.deepEqual(lintLine(s.doc, { set }).issues.map((x) => [x.frame, x.cameras]), [[310, ['vc-ots-mira-hana-1', 'vc-wrong']], [349, ['vc-wrong', 'vc-ots-mira-hana-1']]]);
  const board = storyboard(s.doc, { set });
  assert.deepEqual(board.shots.filter((x) => ['040', '050', '060'].includes(x.name)).map((x) => [x.name, x.camera, !!x.crossesLine]), [['040', 'vc-ots-mira-hana-1', false], ['050', 'vc-wrong', true], ['060', 'vc-ots-mira-hana-1', true]]);
  s.undo();
  assert.equal(s.text(), text(d));
});

test('a camera id says what it films: a person\'s pick is still that camera after a re-script', () => {
  const trio = structuredClone(set);
  trio.nodes.push({ id: 'kai', type: 'Character', name: 'Kai', transform: { p: [-0.6, 0, -3.3] } });
  const S1 = `Title: Three
Set: cafe.vrmxs
Marks:
    HANA = behind-counter
    MIRA = counter-front
    KAI = window-table

INT. CAFE - MORNING

HANA
(to Mira)
(smiling)
Morning, Mira.

MIRA
Morning! This is Kai.

HANA
(to Kai)
(beat)
Hello, Kai.

KAI
Hi.
`;
  const r = build(S1, { set: trio });
  assert.deepEqual(cams(r.doc).map((c) => c.camera), ['vc-est-int-cafe-morning', 'vc-cu-hana-1-to-mira', 'vc-ots-mira-hana-1', 'vc-cu-hana-1-to-kai', 'vc-ots-kai-hana-1']);
  const s = new EditorSession({ registry: m0Registry(), text: text(r.doc) }); s.setDoc = trio;
  replaceShotCamera(s, '050', 'vc-cu-hana-1-to-mira');
  const chosen = structuredClone(node(s.doc, 'vc-cu-hana-1-to-mira'));
  // the first line loses its (smiling): the rules no longer make Hana's Mira-facing close-up, but no other camera takes
  // its id, and the person's clip keeps it (with what it was)
  applyScript(s, S1.replace('(to Mira)\n(smiling)\n', '(to Mira)\n'), { marks, coverage: coverByRule(), set: trio });
  const sh = s.doc.sequence.shots.find((x) => x.name === '050');
  assert.equal(cams(s.doc).find((c) => c.start === sh.start).camera, 'vc-cu-hana-1-to-mira');
  assert.deepEqual(node(s.doc, 'vc-cu-hana-1-to-mira'), chosen);
  assert.deepEqual(node(s.doc, 'vc-cu-hana-1-to-kai').transform.p, node(r.doc, 'vc-cu-hana-1-to-kai').transform.p);
});

test('replacing a shot\'s camera is one edit: one undo step, exact bytes on undo and redo, a new camera in the same step', () => {
  const { doc } = build();
  const s = session(doc);
  const before = s.text(), depth = s.history().undoDepth;
  // an existing camera, by shot number
  const out = replaceShotCamera(s, '030', 'vc-two');
  assert.deepEqual(out, { label: 'Shot 030: camera vc-two', camera: 'vc-two', shot: 'shot-ln-cd2c6011', previous: 'vc-cu-hana-1-to-mira' });
  assert.equal(s.history().undo, out.label);
  assert.equal(s.history().undoDepth, depth + 1);
  assert.equal(cams(s.doc)[2].camera, 'vc-two');
  assert.equal(cams(s.doc)[2].src, 'ln-cd2c6011#cam', 'the clip keeps its src: a hand edit to the script');
  const after = s.text();
  s.undo(); assert.equal(s.text(), before);
  s.redo(); assert.equal(s.text(), after);
  // a new camera on a rig preset, added with the replacement as one step
  const cu = cameraOnRig({ id: 'vc-mira-low', rig: 'closeUp', name: 'Mira, low', p: [-0.3, 0.9, -3.9], target: 'mira', props: { body: { type: 'fixed' } } });
  assert.deepEqual(cu, { id: 'vc-mira-low', type: 'VirtualCamera', name: 'Mira, low', transform: { p: [-0.3, 0.9, -3.9] }, props: { body: { type: 'fixed' }, rig: 'closeUp', aim: { target: 'mira' } } });
  const two = replaceShotCamera(s, 'shot-ln-f31ec2ee', cu);
  assert.equal(two.label, 'Shot 040: camera vc-mira-low');
  assert.ok(s.doc.nodes.some((n) => n.id === 'vc-mira-low'));
  assert.equal(cams(s.doc)[3].camera, 'vc-mira-low');
  assert.deepEqual(s.validate().errors, []);
  assert.deepEqual(lintLine(s.doc, { set }).issues, [], 'the new camera keeps to the scene\'s side');
  s.undo();
  assert.equal(s.text(), after, 'one undo takes the camera and the clip back together');
  assert.ok(!s.doc.nodes.some((n) => n.id === 'vc-mira-low'));
  // refused, with no step: an unknown camera, a node that isn't a camera, an id taken, the camera already there
  const d = s.history().undoDepth;
  assert.throws(() => replaceShotCamera(s, '030', 'vc-nope'), /no camera "vc-nope"/);
  assert.throws(() => replaceShotCamera(s, '030', 'mira'), /is a Character, not a VirtualCamera/);
  assert.throws(() => replaceShotCamera(s, '030', { ...cu, id: 'vc-two' }), /already exists/);
  assert.throws(() => replaceShotCamera(s, '030', 'vc-two'), /already shows vc-two/);
  assert.throws(() => replaceShotCamera(s, '999', 'vc-two'), /no shot "999"/);
  assert.equal(s.history().undoDepth, d);
  assert.equal(s.text(), after);
});

test('a replaced camera is the person\'s: a re-script keeps it on its shot, following the shot\'s new timing', () => {
  const { doc } = build();
  const s = session(doc);
  replaceShotCamera(s, '040', 'vc-two');
  const edited = sample.replace('Hmm. [[point]] A latte, please.', 'Hmm. [[point]] A large latte, please, with oat milk.');
  const out = applyScript(s, edited, { marks, coverage: coverByRule() });
  assert.equal(out.changed, true);
  const shot = s.doc.sequence.shots.find((x) => x.name === '040'), clip = cams(s.doc).find((c) => c.src === shot.src.replace('#shot', '#cam'));
  assert.equal(clip.camera, 'vc-two');
  assert.equal(clip.hand, true);
  assert.deepEqual([clip.start, clip.end], [shot.start, shot.end], 'it follows its shot, which the longer line made longer');
  assert.ok(shot.end - shot.start > 85);
  // vc-ots-mira-hana-1 is still the rule's camera for 070
  assert.equal(cams(s.doc).find((c) => c.start === s.doc.sequence.shots.find((x) => x.name === '070').start).camera, 'vc-ots-mira-hana-1');
  s.undo(); s.undo();
  assert.equal(s.text(), text(doc));
});

test('the storyboard: a thumbnail frame per shot, its camera, rig and people, and whether it is a hand edit', () => {
  const { doc } = build();
  const board = storyboard(doc, { set });
  assert.equal(board.shots.length, 11);
  assert.deepEqual(board.shots.map((x) => x.frame), [24, 102, 190, 267, 329, 378, 445, 521, 594, 653, 718]);
  assert.deepEqual(board.shots[3], { id: 'shot-ln-f31ec2ee', name: '040', start: 225, end: 310, frame: 267, camera: 'vc-ots-mira-hana-1', cameras: ['vc-ots-mira-hana-1'], rig: 'shotReverse', lens: 50, subjects: ['mira'], beat: 'ln-f31ec2ee', hand: false, crossesLine: null });
  // after a dissolve, the frame waits for the blend; never past the shot
  assert.equal(thumbFrame({ start: 100, end: 120 }, { blend: { frames: 16 } }), 116);
  assert.equal(thumbFrame({ start: 100, end: 110 }, { blend: { frames: 16 } }), 109);
  assert.equal(thumbFrame({ start: 0, end: 1 }), 0);
  const s = session(doc);
  replaceShotCamera(s, '030', 'vc-two');
  assert.deepEqual(storyboard(s.doc, { set }).shots[2].hand, false, 'not yet: the merge marks hand edits on the next re-script');
  applyScript(s, sample, { marks, coverage: coverByRule() });
  assert.deepEqual(storyboard(s.doc, { set }).shots.filter((x) => x.hand).map((x) => [x.name, x.camera]), [['030', 'vc-two']]);
  // the people on both sides of each cut keep to one side of the line: the board's cameras agree with sideOf
  const h = doc.sequence.cast['hana-1'].transform.p, m = doc.sequence.cast.mira.transform.p;
  assert.equal(new Set(board.shots.map((x) => sideOf(h, m, node(doc, x.camera).transform.p))).size, 1);
});
