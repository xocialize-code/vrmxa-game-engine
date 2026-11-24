// AB-T-0597: cameras by rule and the set. The set's solid boxes (its colliders) keep every camera inside the set and
// in sight of the people it films; a close-up of people far apart shows her face; the lint reports a camera in or
// behind geometry. Tested on the sample cafe, with Mira's move to the window table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readGLBJson } from '@vrmxg/model';
import { readPhysics } from '@vrmxg/physics';
import { withPortableMath } from '@vrmxg/dmath';
import { buildSequence } from '@vrmxg/script';
import { lintLine, sceneAt, storyboard, setBlockers, loadSetBlockers, coverByRule, inBox, segmentHitsBox, blocked, pullIn, faceOn, facing, sideOf, subjectsOf, EYE } from '../src/index.js';
import { build, cams, node, set, sample, marks, text, SAMPLE } from './helpers.mjs';

const readColliders = (b) => readPhysics(readGLBJson(b)).colliders;
const blockers = await loadSetBlockers(set, { bytes: (ref) => new Uint8Array(fs.readFileSync(path.join(SAMPLE, ref))), readColliders });
const HEAD = `Title: T
Set: cafe.vrmxs
Marks:
    HANA = behind-counter
    MIRA = counter-front

INT. CAFE - MORNING
`;
// Mira takes her cup to the window table, 4.25 m from Hana, and the next shot is the master of the two of them
const MOVE = `${HEAD}
HANA
What can I get you?

MIRA
A latte.

Mira takes her cup to the window. [[MIRA at: window-table]]

HANA
(grins)
Anything else?

MIRA
(warmly)
No, thanks.
`;
/** Every camera clip with where its camera stands and the heads it films, on the clip's first frame. */
function placed(doc) {
  const S = sceneAt(doc, set);
  return cams(doc).map((c) => {
    const who = subjectsOf(S.byId.get(c.camera)).filter((id) => S.people.has(id));
    return { camera: c.camera, frame: c.start, at: S.cameraAt(c.camera, c.start), who, heads: who.map((id) => { const p = S.posAt(id, c.start); return [p[0], p[1] + EYE, p[2]]; }) };
  });
}
const inRoom = (p) => Math.abs(p[0]) < 6 && Math.abs(p[2]) < 6;

test('boxes: a point in one, a segment through one, turned or not', () => {
  const wall = { p: [0, 1.5, -6.1], size: [12.4, 3, 0.2] };
  assert.ok(inBox([0, 1.5, -6.05], wall) && !inBox([0, 1.5, -5.9], wall) && inBox([0, 1.5, -5.9], wall, 0.25));
  assert.ok(Math.abs(segmentHitsBox([0, 1.5, -3], [0, 1.5, -7.2], wall) - 3 / 4.2) < 1e-12, 'where it meets the wall\'s face');
  assert.equal(segmentHitsBox([0, 1.5, -3], [0, 1.5, -5], wall), null, 'stops short of it');
  assert.equal(segmentHitsBox([0, 3.5, -3], [0, 3.5, -7.2], wall), null, 'over it');
  assert.equal(segmentHitsBox([0, 1.5, -6.1], [0, 1.5, 0], wall), 0, 'from inside');
  // a bench turned a quarter turn about y: long along x in the world
  const bench = { p: [0, 0.42, -3.3], q: [0, -0.7071068, 0, 0.7071068], size: [0.7, 0.85, 1.7] };
  assert.ok(inBox([0.8, 0.4, -3.3], bench) && !inBox([0, 0.4, -2.5], bench));
  assert.ok(segmentHitsBox([0.8, 0.4, 0], [0.8, 0.4, -5], bench) !== null && segmentHitsBox([1.2, 0.4, 0], [1.2, 0.4, -5], bench) === null);
  assert.deepEqual(blocked([0, 1.5, -7], [[0, 1.5, -4]], [wall]).what, 'behind');
  assert.deepEqual(blocked([0, 1.5, -5.9], [[0, 1.5, -4]], [wall]).what, 'inside', 'within the clearance');
  assert.equal(blocked([0, 1.5, -5.5], [[0, 1.5, -4]], [wall]), null);
  const r = pullIn([0, 1.5, -8], [0, 1.5, -4], [[0, 1.5, -4]], [wall]);
  assert.deepEqual(r, { p: [0, 1.5, -5.6], t: 0.4 }, 'a twentieth at a time, to the first clear place');
  assert.equal(pullIn([0, 1.5, -6.1], [0, 1.5, -6.05], [], [wall]), null, 'nowhere clear');
  assert.equal(faceOn([0, 0, 0], [0, 1], [0, 1.5, 2]), 1); assert.equal(faceOn([0, 0, 0], [0, 1], [2, 1.5, 0]), 0);
});

test('the set\'s blockers: its Collider nodes and its Models\' colliders, where the nodes put them', () => {
  assert.equal(blockers.length, 16);
  assert.deepEqual(blockers.find((b) => b.name === 'set/wall-north'), { name: 'set/wall-north', p: [0, 1.5, -6.1], q: [0, 0, 0, 1], size: [12.4, 3, 0.2] });
  assert.ok(!blockers.some((b) => /espresso/.test(b.name)), 'a Model with colliders: "none" has none');
  // a Model turned and moved by its node and its parent; a Collider node; a sensor and a mesh shape left out
  const doc = { assets: [{ id: 'm', type: 'glb', ref: 'sets/x.glb' }], nodes: [
    { id: 'root', type: 'Node3D', transform: { p: [10, 0, 0] } },
    { id: 'hall', type: 'Model', parent: 'root', asset: 'm', transform: { p: [0, 0, 5], q: [0, 0.7071068, 0, 0.7071068] } },
    { id: 'crate', type: 'Collider', parent: 'root', transform: { p: [1, 0.5, 1] }, props: { shape: 'box', size: [1, 1, 1] } },
    { id: 'pillar', type: 'Collider', parent: 'root', transform: { p: [-2, 1.5, 0] }, props: { shape: 'cylinder', radius: 0.3, height: 3 } },
    { id: 'hull', type: 'Collider', parent: 'root', props: { shape: 'convex' } },
  ] };
  const got = setBlockers(doc, { 'sets/x.glb': [{ name: 'wall', shape: { shape: 'box', size: [4, 3, 0.2] }, p: [0, 1.5, -2], q: [0, 0, 0, 1], sensor: false }, { name: 'door-reach', shape: { shape: 'box', size: [1, 2, 1] }, p: [0, 1, 0], q: [0, 0, 0, 1], sensor: true }] });
  assert.deepEqual(got.map((b) => b.name), ['hall/wall', 'crate', 'pillar']);
  assert.deepEqual(got[0].p, [8, 1.5, 5], 'the asset\'s −z is the world\'s −x after the node\'s quarter turn');
  assert.ok(inBox([8, 1, 6.9], got[0]) && !inBox([9.9, 1, 5], got[0]), 'and its long side runs along z');
  assert.deepEqual(got[1], { name: 'crate', p: [11, 0.5, 1], q: [0, 0, 0, 1], size: [1, 1, 1] });
  assert.deepEqual(got[2].size, [0.6, 3, 0.6], 'a cylinder as the box around it');
});

test('the cafe, after the move to the window table: no camera by rule stands in or behind the set', () => {
  // as it was: the line's side after the move faces the back wall, and the master stood beyond it
  const before = build(MOVE);
  const was = node(before.doc, 'vc-two-mira-at-window-table').transform.p;
  assert.ok(!inRoom(was), `without the set, the master is outside the cafe (${was})`);
  const found = lintLine(before.doc, { set, blockers }).issues.filter((x) => x.kind === 'geometry');
  assert.ok(found.some((x) => x.cameras[0] === 'vc-two-mira-at-window-table' && x.what === 'behind' && /behind the set's geometry \(set\/wall-/.test(x.message)), JSON.stringify(found.map((x) => x.message)));

  const r = build(MOVE, { coverage: { blockers } });
  for (const c of placed(r.doc)) {
    assert.ok(c.at && inRoom(c.at), `${c.camera} stands in the cafe (${c.at})`);
    assert.equal(blocked(c.at, c.heads, blockers), null, `${c.camera} is clear of the set and sees ${c.who.join(' and ')}`);
  }
  assert.deepEqual(lintLine(r.doc, { set, blockers }), { issues: [], unchecked: [] }, 'the lint agrees: nothing in geometry, no line crossed unmarked');
  // the master took the side with room, and says it crosses on purpose; the cameras after it follow it there
  const master = r.doc.sequence.shots.find((s) => cams(r.doc).some((c) => c.start === s.start && c.camera === 'vc-two-mira-at-window-table'));
  assert.equal(master.crossLine, true);
  assert.match(r.rules.get(master.src.split('#')[0]).why, /crosses the line/);
  assert.equal(r.doc.sequence.shots.filter((s) => s.crossLine).length, 1, 'one cross: the pair\'s side is the new one from then on');
  const S = sceneAt(r.doc, set), f = master.start, h = S.posAt('hana-1', f), m = S.posAt('mira', f);
  const side = sideOf(h, m, node(r.doc, 'vc-two-mira-at-window-table').transform.p);
  for (const c of placed(r.doc).filter((x) => x.frame > f)) assert.equal(sideOf(h, m, c.at), side, `${c.camera} is on the master's side`);
  // people near each other are filmed as before: the set changes nothing where there was room
  for (const id of ['vc-est-int-cafe-morning', 'vc-ots-hana-1-mira', 'vc-ots-mira-hana-1']) assert.deepEqual(node(r.doc, id).transform, node(before.doc, id).transform, id);
  assert.equal(text(build(sample, { coverage: { blockers } }).doc), text(build(sample).doc), 'the sample script\'s cameras are the same with the set as without');
  // the same bytes again, re-scripted, and under portable maths
  assert.equal(text(build(MOVE, { coverage: { blockers }, previous: JSON.parse(text(r.doc)) }).doc), text(r.doc));
  assert.equal(text(withPortableMath(() => build(MOVE, { coverage: { blockers } })).doc), text(r.doc));
});

test('a close-up of two people more than 3 m apart shows at least three-quarters of the face', () => {
  const far = (o) => {
    const r = build(MOVE, { coverage: o });
    const S = sceneAt(r.doc, set);
    return placed(r.doc).filter((c) => /^vc-cu-/.test(c.camera) && /window-table/.test(c.camera)).map((c) => ({ camera: c.camera, face: faceOn(S.posAt(c.who[0], c.frame), facing(S.tfAt(c.who[0], c.frame)), c.at) }));
  };
  const cus = far({ blockers });
  assert.deepEqual(cus.map((c) => c.camera), ['vc-cu-hana-1-to-mira-mira-at-window-table', 'vc-cu-mira-to-hana-1-mira-at-window-table']);
  for (const c of cus) assert.ok(c.face >= Math.SQRT1_2, `${c.camera}: within 45° of where she faces (cos ${c.face.toFixed(3)})`);
  // and the rule is what does it: with no blockers, and the master before them on the line's own side, a close-up that
  // would be a profile (as both were) takes the side that shows her face
  const alone = far({});
  for (const c of alone) assert.ok(c.face >= Math.SQRT1_2, `${c.camera} without the set: cos ${c.face.toFixed(3)}`);
  const old = far({ far: Infinity });
  assert.ok(old.some((c) => c.face < 0.2), `as it was, one of them is a profile (${old.map((c) => c.face.toFixed(2))})`);
  const r = build(MOVE, { coverage: {} });
  assert.deepEqual(lintLine(r.doc, { set }), { issues: [], unchecked: [] }, 'the cross for her face is marked, so the lint passes');
  assert.ok(r.doc.sequence.shots.some((s) => s.crossLine));
});

test('a group shot the set leaves a little short is pulled in on its own side; with no room, it takes the other', () => {
  const where = (bs) => { const r = build(MOVE, { coverage: { blockers: bs } }); return { p: node(r.doc, 'vc-est-int-cafe-morning').transform.p, cross: r.doc.sequence.shots.find((s) => s.name === '010').crossLine ?? false }; };
  const free = where([]).p; // the establishing wide: Hana and Mira across the counter (x 0.6), the camera 4.2 m off their line
  assert.deepEqual(free, [-3.6, 2.2, -3.95]);
  const short = where([{ name: 'screen', p: [-3.6, 1.5, -3.95], size: [0.2, 3, 4] }]);   // a screen right where it stood
  assert.deepEqual(short, { p: [-3.18, 2.2, -3.95], cross: false }, 'pulled in to 0.9 of its distance, clear of the screen, on its own side');
  const none = where([{ name: 'wall', p: [-0.4, 1.5, -3.95], size: [0.2, 3, 4] }]);       // a wall 1 m off the line: no room at all
  assert.deepEqual(none, { p: [4.8, 2.2, -3.95], cross: false }, 'the other side; a scene\'s first camera crosses nothing');
});

test('the lint reports a camera a person put in or behind geometry; the storyboard carries it', () => {
  const r = build(MOVE, { coverage: { blockers } });
  const doc = structuredClone(r.doc);
  node(doc, 'vc-ots-hana-1-mira').transform.p = [0.6, 1.5, -6.1];       // in the north wall
  node(doc, 'vc-ots-mira-hana-1').transform.p = [3, 1.5, 8];            // out on the pavement, the south wall between it and Mira
  const L = lintLine(doc, { set, blockers }).issues.filter((x) => x.kind === 'geometry');
  assert.deepEqual(L.map((x) => [x.cameras[0], x.what, x.blocker]), [['vc-ots-hana-1-mira', 'inside', 'set/wall-north'], ['vc-ots-mira-hana-1', 'behind', 'set/wall-south-b']]);
  assert.match(L[0].message, /^frame \d+ \(020\): camera vc-ots-hana-1-mira is inside the set's geometry \(set\/wall-north\)$/);
  assert.match(L[1].message, /camera vc-ots-mira-hana-1 is behind the set's geometry \(set\/wall-south-b, between it and mira\)$/);
  // through the open doorway it sees her: that is no issue
  node(doc, 'vc-ots-mira-hana-1').transform.p = [0.6, 1.5, 8];
  assert.equal(lintLine(doc, { set, blockers }).issues.filter((x) => x.kind === 'geometry').length, 1);
  node(doc, 'vc-ots-mira-hana-1').transform.p = [3, 1.5, 8];
  assert.deepEqual(lintLine(doc, { set }).issues.filter((x) => x.kind === 'geometry'), [], 'without blockers the lint checks the line only');
  const board = storyboard(doc, { set, blockers });
  assert.match(board.shots.find((s) => s.name === '020').inGeometry, /inside the set's geometry/);
  assert.equal(board.shots.find((s) => s.name === '010').inGeometry, null);
  assert.ok(!('inGeometry' in storyboard(doc, { set }).shots[0]), 'no blockers, no field: the strip\'s data is as it was');
});

test('coverByRule with blockers plugs into the script as before', () => {
  const r = buildSequence(MOVE, { set, marks, id: 'm', coverage: coverByRule({ blockers }) });
  assert.ok(r.ok && r.doc.sequence.shots.some((s) => s.crossLine));
});
