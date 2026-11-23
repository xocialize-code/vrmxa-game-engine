// M4 W8 (AB-T-0580): coverage by rule. The sample script's shots, each rule on its own, the 180° line kept, moves
// between marks, and the same bytes every time (and under native or portable maths).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { createValidator } from '@vrmxg/scene';
import { checkSequence, composeSequence } from '@vrmxg/sequence';
import { RIGS } from '@vrmxg/camera/rigs';
import { withPortableMath } from '@vrmxg/dmath';
import { lintLine, sideOf } from '../src/index.js';
import { build, ruleByShot, cams, node, set, sample, sha, text, SAMPLE } from './helpers.mjs';

const valid = (doc) => assert.deepEqual(checkSequence(doc.sequence, { nodeIds: new Set([...set.nodes, ...doc.nodes].map((n) => n.id)) }), []);
const pos = (doc, id) => doc.sequence.cast[id].transform.p;
const HEAD = `Title: T
Set: cafe.vrmxs
Marks:
    HANA = behind-counter
    MIRA = counter-front

INT. CAFE - MORNING
`;

test('the sample gets coverage by rule: establishing, master, close-ups on beats, shot / reverse', () => {
  const r = build();
  assert.deepEqual(ruleByShot(r), {
    '010': 'establishing', // INT. CAFE - MORNING
    '020': 'master', //       Sun through the front window …
    '030': 'closeUp', //      HANA (smiling) Good morning!
    '040': 'shotReverse', //  MIRA Hmm. A latte, please …            (to Hana)
    '050': 'shotReverse', //  HANA (nods) Coming right up!           (to Mira; a gesture isn't a beat)
    '060': 'master', //       Hana turns to the espresso machine …
    '070': 'shotReverse', //  MIRA (to Hana) Is it always this quiet …
    '080': 'closeUp', //      HANA (beat) Only until the students wake up.
    '090': 'closeUp', //      Hana sets the cup … [[HANA happy]]
    '100': 'shotReverse', //  HANA Here you go. Enjoy!
    '110': 'closeUp', //      MIRA (warmly) Thank you!
  });
  const { doc } = r;
  assert.deepEqual(cams(doc).map((c) => c.camera), ['vc-est', 'vc-two', 'vc-cu-hana-1', 'vc-ots-mira-hana-1', 'vc-ots-hana-1-mira', 'vc-two', 'vc-ots-mira-hana-1', 'vc-cu-hana-1', 'vc-cu-hana-1', 'vc-ots-hana-1-mira', 'vc-cu-mira']);
  assert.deepEqual(cams(doc).find((c) => c.blend)?.blend, { frames: 12, style: 'easeInOut' }, 'DISSOLVE TO: still blends');
  // every camera is a VirtualCamera on one of M2's rig presets
  const vcs = doc.nodes.filter((n) => n.type === 'VirtualCamera');
  assert.deepEqual(vcs.map((n) => n.id), ['vc-est', 'vc-two', 'vc-cu-hana-1', 'vc-ots-mira-hana-1', 'vc-ots-hana-1-mira', 'vc-cu-mira']);
  for (const n of vcs) assert.ok(RIGS[n.props.rig], `${n.id} is on a rig preset`);
  assert.deepEqual(vcs.map((n) => n.props.rig), ['twoShot', 'twoShot', 'closeUp', 'shotReverse', 'shotReverse', 'closeUp']);
  assert.deepEqual(node(doc, 'vc-ots-mira-hana-1').props.aim.target, 'mira', 'over Hana\'s shoulder onto Mira');
  // a valid sequence in its set, and nothing crosses the line
  valid(doc);
  const world = composeSequence(doc, set);
  const prefabs = new Map(fs.readdirSync(path.join(SAMPLE, 'prefabs')).map((f) => [`prefabs/${f}`, JSON.parse(fs.readFileSync(path.join(SAMPLE, 'prefabs', f), 'utf8'))]));
  assert.deepEqual(createValidator(m0Registry()).check(world, { prefabs }).errors, []);
  assert.deepEqual(lintLine(doc, { set }), { issues: [], unchecked: [] });
});

test('an establishing wide per scene, further back and higher than the two-shot', () => {
  const r = build(`${HEAD}
Hana wipes the counter.

EXT. CAFE - LATER

Mira waves from the street.
`);
  assert.deepEqual(ruleByShot(r), { '010': 'establishing', '020': 'master', '030': 'establishing', '040': 'master' });
  assert.deepEqual(cams(r.doc).map((c) => c.camera), ['vc-est', 'vc-two', 'vc-est-2', 'vc-two']);
  assert.equal(node(r.doc, 'vc-est-2').name, 'Establishing: EXT. CAFE - LATER');
  const est = node(r.doc, 'vc-est').transform.p, two = node(r.doc, 'vc-two').transform.p;
  assert.ok(est[1] > two[1], 'higher');
  const mid = [0.6, 0, -3.95];
  const d = (p) => Math.sqrt((p[0] - mid[0]) * (p[0] - mid[0]) + (p[2] - mid[2]) * (p[2] - mid[2]));
  assert.ok(d(est) > d(two), 'further back');
  assert.equal(node(r.doc, 'vc-est').props.aim.size, 0.4);
});

test('shot / reverse: both setups on the side of the 180° line the scene is shot from; the side is a choice', () => {
  for (const side of [undefined, 1, -1]) {
    const r = build(sample, side ? { coverage: { side } } : {});
    const a = pos(r.doc, 'hana-1'), b = pos(r.doc, 'mira');
    const sides = ['vc-est', 'vc-two', 'vc-ots-mira-hana-1', 'vc-ots-hana-1-mira', 'vc-cu-hana-1', 'vc-cu-mira'].map((id) => sideOf(a, b, node(r.doc, id).transform.p));
    assert.equal(new Set(sides).size, 1, `one side (${sides})`);
    assert.equal(sides[0], side ?? -1, 'by default the side facing the middle of the set (the cafe\'s origin is at −x of the line)');
    // the shot frames its speaker away from the listener's shoulder: the reverse mirrors it
    assert.equal(node(r.doc, 'vc-ots-mira-hana-1').props.aim.screen[0], -node(r.doc, 'vc-ots-hana-1-mira').props.aim.screen[0]);
    assert.deepEqual(lintLine(r.doc, { set }).issues, []);
  }
  // the OTS stands behind the listener, off the line by the rig's shoulder
  const { doc } = build();
  const ots = node(doc, 'vc-ots-mira-hana-1').transform.p;
  assert.deepEqual(ots, [0.15, 1.5, -5.7], 'behind Hana (z −4.6), 1.1 m back and 0.45 m off the line');
});

test('three people: each pair\'s line is crossed by none of its cameras', () => {
  const trio = structuredClone(set);
  trio.nodes.push({ id: 'kai', type: 'Character', name: 'Kai', transform: { p: [-0.6, 0, -3.3] } });
  const src = `Title: Three
Set: cafe.vrmxs
Marks:
    HANA = behind-counter
    MIRA = counter-front
    KAI = window-table

INT. CAFE - MORNING

HANA
Morning, Mira.

MIRA
Morning! This is Kai.

KAI
(to Hana)
Hi.

HANA
Hello, Kai.
`;
  const r = build(src, { set: trio });
  assert.deepEqual(ruleByShot(r), { '010': 'establishing', '020': 'shotReverse', '030': 'shotReverse', '040': 'shotReverse', '050': 'shotReverse' });
  assert.deepEqual(cams(r.doc).map((c) => c.camera), ['vc-est', 'vc-ots-hana-1-mira', 'vc-ots-mira-hana-1', 'vc-ots-kai-hana-1', 'vc-ots-hana-1-kai']);
  assert.deepEqual(lintLine(r.doc, { set: trio }).issues, []);
  // the pair Hana–Kai is shot from the side of their line the master stands on
  const master = node(r.doc, 'vc-est').transform.p, h = pos(r.doc, 'hana-1'), k = pos(r.doc, 'kai');
  assert.equal(sideOf(h, k, node(r.doc, 'vc-ots-kai-hana-1').transform.p), sideOf(h, k, master));
  assert.equal(sideOf(h, k, node(r.doc, 'vc-ots-hana-1-kai').transform.p), sideOf(h, k, master));
});

test('close-ups on beats: (beat), (pause), an expression from a parenthetical or a tag; a gesture alone isn\'t one', () => {
  const r = build(`${HEAD}
HANA
(beat)
Well.

MIRA
(pause)
Hmm.

HANA
(smiling)
Hello!

MIRA
Hi there. [[surprised]]

HANA
(nods)
Sure.

Mira looks up. [[MIRA happy]]
`);
  assert.deepEqual(ruleByShot(r), { '010': 'establishing', '020': 'closeUp', '030': 'closeUp', '040': 'closeUp', '050': 'closeUp', '060': 'shotReverse', '070': 'closeUp' });
  assert.deepEqual(cams(r.doc).map((c) => c.camera), ['vc-est', 'vc-cu-hana-1', 'vc-cu-mira', 'vc-cu-hana-1', 'vc-cu-mira', 'vc-ots-hana-1-mira', 'vc-cu-mira']);
  assert.deepEqual(r.rules.get(r.doc.sequence.shots[1].src.split('#')[0]).why, 'a beat in the line');
  // a clean single: on the scene's side of her eyeline, the one she plays to behind the camera
  const cu = node(r.doc, 'vc-cu-hana-1');
  assert.deepEqual(cu.props, { rig: 'closeUp', body: { type: 'fixed' }, aim: { target: 'hana-1', offset: [0, 0.07, 0] } });
  assert.deepEqual(cu.transform.p, [-0.5, 1.5, -3.625]);
  assert.deepEqual(lintLine(r.doc, { set }).issues, []);
});

test('two-shots for overlapping lines; voice-over plays in the master; a lone speaker gets her close-up', () => {
  const r = build(`${HEAD}
HANA
Did you hear that?

MIRA ^
Did you hear that?

HANA (V.O.)
She always says that.
`);
  // the dual line shares the shot before it: one two-shot for both
  assert.deepEqual(ruleByShot(r), { '010': 'establishing', '020': 'twoShot', '030': 'master' });
  const two = node(r.doc, cams(r.doc)[1].camera);
  assert.deepEqual(two.props, { rig: 'twoShot', aim: { targets: ['hana-1', 'mira'] } });
  assert.equal(cams(r.doc)[2].camera, 'vc-two');
  // nobody else in the script: a frontal close-up, 1.5 m in front of her (Mira's mark turns her to face −Z)
  const lone = build(`Title: Alone
Set: cafe.vrmxs
Marks:
    MIRA = counter-front

INT. CAFE - MORNING

MIRA
Nobody tells me anything.
`);
  assert.deepEqual(ruleByShot(lone), { '010': 'establishing', '020': 'closeUp' });
  assert.equal(lone.rules.get(lone.doc.sequence.shots[1].src.split('#')[0]).why, 'nobody on a mark to play to');
  assert.deepEqual(node(lone.doc, 'vc-cu-mira').transform.p, [0.6, 1.5, -4.8]);
  valid(lone.doc);
});

test('people who move between marks get cameras placed for where they stand then', () => {
  const r = build(`${HEAD}
HANA
What can I get you?

MIRA
A latte.

Mira takes her cup to the window. [[MIRA at: window-table]]

HANA
Anything else?

MIRA
No, thanks.
`);
  assert.deepEqual(cams(r.doc).map((c) => c.camera), ['vc-est', 'vc-ots-hana-1-mira', 'vc-ots-mira-hana-1', 'vc-two', 'vc-ots-hana-1-mira-2', 'vc-ots-mira-hana-1-2']);
  assert.notDeepEqual(node(r.doc, 'vc-ots-hana-1-mira-2').transform, node(r.doc, 'vc-ots-hana-1-mira').transform);
  valid(r.doc);
  assert.deepEqual(lintLine(r.doc, { set }).issues, [], 'the lint reads the move (a transform track) too');
});

test('deterministic: the same script and marks give the same cameras, byte for byte, under native or portable maths', () => {
  const a = text(build().doc);
  assert.equal(text(build().doc), a);
  assert.equal(withPortableMath(() => text(build().doc)), a);
  // golden: a deliberate change to the rules changes this (and the thumbnails' sequence hash in the playground)
  assert.equal(sha(a), JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'golden.json'), 'utf8')).sample);
  // re-scripting the unchanged script over its own build changes nothing
  assert.equal(text(build(sample, { previous: JSON.parse(a) }).doc), a);
});
