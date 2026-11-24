// M2 W1 (AB-T-0524) without characters: composing a sequence with its set, the sequence tracks (camera, events,
// property, post), shots and their overrides, checks, subtitles, and scrubbing that lands on exactly the world a
// straight play reaches (physics included), from snapshots, forwards and backwards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installCameras } from '@vrmxg/camera';
import { installTracks } from '@vrmxg/tracks';
import { worldHashes, hashValue, captureWorld, restoreWorld } from '@vrmxg/snapshot';
import { composeSequence, isSequence, installSequence, checkSequence, subtitles, clipAt, samplePost, SequencePlayer, bake, useBake, bakeToJSON, bakeFromJSON } from '@vrmxg/sequence';

installPortableMath();

const SET = { format: 'vrmxs', version: 1, id: 'set', assets: [], nodes: [
  { id: 'root', type: 'Node3D' },
  { id: 'mira', type: 'Marker', parent: 'root', transform: { p: [0, 0, 0] } },
  { id: 'hana', type: 'Marker', parent: 'root', transform: { p: [0, 0, 3] } },
  { id: 'lamp', type: 'OmniLight', parent: 'root', props: { intensity: 5 } },
  { id: 'cam', type: 'Camera', parent: 'root', props: { focalLength: 35 } },
  { id: 'floor', type: 'Collider', parent: 'root', transform: { p: [0, -0.5, 0] }, props: { shape: 'box', size: [20, 1, 20] } },
  { id: 'crate', type: 'RigidBody', parent: 'root', transform: { p: [0, 3, 0] }, props: { mass: 2 } },
  { id: 'crate-shape', type: 'Collider', parent: 'crate', props: { shape: 'box', size: [0.5, 0.5, 0.5], restitution: 0.3 } },
] };

const SEQ = { format: 'vrmxs', version: 1, id: 'scene-1', set: 'set.vrmxs', assets: [], nodes: [
  { id: 'brain', type: 'CameraBrain', props: { camera: 'cam' } },
  { id: 'vc-a', type: 'VirtualCamera', transform: { p: [4, 1.6, 0] }, props: { body: { type: 'fixed' }, aim: { type: 'lookAt', target: 'mira' } } },
  { id: 'vc-b', type: 'VirtualCamera', transform: { p: [0, 1.6, 6] }, props: { body: { type: 'fixed' }, aim: { type: 'lookAt', target: 'hana' } } },
], sequence: {
  fps: 24, duration: 240,
  shots: [
    { id: 's1', name: 'Wide', start: 0, end: 96 },
    { id: 's2', name: 'Hana', start: 96, end: 168, overrides: { lamp: { props: { intensity: 40 } }, hana: { transform: { p: [0.2, 0, 3] } } } },
    { id: 's3', name: 'Back', start: 168, end: 240 },
  ],
  markers: [{ frame: 120, name: 'beat' }],
  tracks: [
    { id: 'cams', type: 'camera', clips: [{ start: 0, end: 96, camera: 'vc-a' }, { start: 96, end: 168, camera: 'vc-b' }, { start: 168, end: 240, camera: 'vc-a', blend: { frames: 12 } }] },
    { id: 'kick', type: 'event', keys: [[60, { target: 'crate', call: 'applyImpulse', args: { impulse: [3, 4, 0] } }], [61, { emit: 'kicked' }]] },
    { id: 'lamp-fade', type: 'property', target: 'lamp', path: 'props.color', keys: [[0, '#ffffff'], [48, '#ff8000']] },
    { id: 'lines', type: 'post', keys: { 'anime.speedLines': [[90, 0], [96, 0.8], [120, 0, 'easeOut']], 'vignette.darkness': [[0, 0.4]] } },
    { id: 'say', type: 'dialogue', target: 'hana', clips: [{ start: 100, end: 150, text: 'Welcome in!' }, { start: 170, end: 200, text: 'Sit anywhere.' }] },
    { id: 'sim', type: 'simulation', clips: [{ start: 0, end: 240, mode: 'live' }] },
  ],
} };

async function world(seq = SEQ, { scrub = false } = {}) {
  const doc = composeSequence(structuredClone(seq), structuredClone(SET));
  const tree = new SceneTree({ registry: m0Registry(), seed: 3 });
  installPhysics(tree, await loadRapier());
  const cams = installCameras(tree);
  installTracks(tree);
  const sequence = installSequence(tree);
  await sequence.prepare(doc);
  tree.instantiate(doc);
  cams.setAspect(16 / 9);
  return { tree, sequence, player: scrub ? new SequencePlayer(tree, { every: 60 }) : null };
}
const hash = (tree) => hashValue(worldHashes(tree, { physicsBytes: true }));
async function steps(tree, n) { for (let i = 0; i < n; i++) while (!tree.step()) await tree.settle(); }

test('composing: the set\'s nodes keep their ids, the sequence\'s join under the root; clashes are refused', () => {
  assert.ok(isSequence(SEQ) && !isSequence(SET));
  const d = composeSequence(SEQ, SET);
  assert.equal(d.id, 'scene-1');
  assert.deepEqual(d.nodes.map((n) => n.id).slice(-3), ['brain', 'vc-a', 'vc-b']);
  assert.equal(d.nodes.find((n) => n.id === 'brain').parent, 'root');
  assert.equal(d.sequence.fps, 24);
  assert.throws(() => composeSequence({ ...SEQ, nodes: [{ id: 'mira', type: 'Marker' }] }, SET), /also in the set/);
  assert.throws(() => composeSequence({ ...SEQ, assets: [{ id: 'a', type: 'vrma', ref: 'x.vrma' }] }, { ...SET, assets: [{ id: 'a', type: 'vrma', ref: 'y.vrma' }] }), /asset "a"/);
});

test('casting (M2 W11): sequence.cast recasts set nodes for the film (props merged, behaviours and transform replaced); the set is untouched', () => {
  const seq = { ...SEQ, sequence: { ...SEQ.sequence, cast: { hana: { transform: { p: [1, 0, 1] }, props: { purpose: 'mark' }, behaviours: [{ use: 'brain', preset: 'server' }] } } } };
  const before = JSON.stringify(SET);
  const d = composeSequence(seq, SET);
  const h = d.nodes.find((n) => n.id === 'hana');
  assert.deepEqual(h.transform, { p: [1, 0, 1] });
  assert.deepEqual(h.behaviours, [{ use: 'brain', preset: 'server' }]);
  assert.equal(h.props.purpose, 'mark');
  assert.deepEqual(d.nodes.find((n) => n.id === 'mira').transform, { p: [0, 0, 0] }, 'others as in the set');
  assert.equal(JSON.stringify(SET), before, 'the set document is not changed');
  assert.throws(() => composeSequence({ ...SEQ, sequence: { ...SEQ.sequence, cast: { nobody: { props: {} } } } }, SET), /cast names "nobody"/);
});

const SET_M = SET;
test('roles (M4 W6, @vrmxg/cast): a role cast from another .vrmxa gives its node that asset, with the cast as well; the set is untouched', () => {
  const seq = { ...SEQ, assets: [{ id: 'cast-aiko', type: 'vrmxa', ref: 'characters/aiko.vrmxa' }], sequence: { ...SEQ.sequence, cast: { hana: { transform: { p: [1, 0, 1] } } }, roles: { hana: { cue: 'HANA', asset: 'cast-aiko' }, mira: { cue: 'MIRA' } } } };
  // the set's hana and mira are characters here (elsewhere in this file they are markers)
  const SET = { ...SET_M, nodes: SET_M.nodes.map((n) => (n.id === 'hana' || n.id === 'mira' ? { ...n, type: 'Character' } : n)) };
  const before = JSON.stringify(SET);
  const d = composeSequence(seq, SET);
  const h = d.nodes.find((n) => n.id === 'hana'), m = d.nodes.find((n) => n.id === 'mira');
  assert.equal(h.asset, 'cast-aiko');
  assert.deepEqual(h.transform, { p: [1, 0, 1] }, 'the cast entry still applies');
  assert.equal(m.asset, SET.nodes.find((n) => n.id === 'mira').asset, 'a role with no asset keeps the set\'s character');
  assert.ok(d.assets.some((a) => a.id === 'cast-aiko'));
  assert.equal(JSON.stringify(SET), before);
  assert.throws(() => composeSequence(seq, SET_M), /role "hana" is a Marker, not a Character/);
  assert.throws(() => composeSequence({ ...seq, sequence: { ...seq.sequence, roles: { nobody: { asset: 'cast-aiko' } } } }, SET), /roles names "nobody"/);
  assert.throws(() => composeSequence({ ...seq, assets: [] }, SET), /role "hana" is cast from asset "cast-aiko", which neither the sequence nor the set has/);
  const other = SET.nodes.find((n) => n.id === 'lamp');
  assert.throws(() => composeSequence({ ...seq, sequence: { ...seq.sequence, roles: { [other.id]: { asset: 'cast-aiko' } } } }, SET), /not a Character: only characters are cast/);
});

test('checks, clips, post values and SRT subtitles', () => {
  const ids = new Set(composeSequence(SEQ, SET).nodes.map((n) => n.id));
  assert.deepEqual(checkSequence(SEQ.sequence, { nodeIds: ids }), []);
  const bad = { fps: 24, duration: 10, shots: [{ id: 'a', start: 0, end: 6 }, { id: 'b', start: 4, end: 10, overrides: { ghost: {} } }],
    tracks: [{ id: 'c', type: 'camera', clips: [{ start: 0, end: 5, camera: 'nope' }] }, { id: 'd', type: 'dialogue', clips: [{ start: 0, end: 2 }] }, { id: 'e', type: 'wobble' }] };
  const p = checkSequence(bad, { nodeIds: ids });
  for (const re of [/b overlaps/, /override of "ghost"/, /camera "nope"/, /needs a target/, /needs a clip or text/, /unknown type "wobble"/]) assert.ok(p.some((m) => re.test(m)), `${re} in ${p.join('; ')}`);
  assert.equal(clipAt(SEQ.sequence.tracks[0], 96).camera, 'vc-b');
  assert.equal(clipAt(SEQ.sequence.tracks[0], 240), null);
  assert.deepEqual(samplePost(SEQ.sequence.tracks[3], 96), { 'anime.speedLines': 0.8, 'vignette.darkness': 0.4 });
  assert.equal(subtitles(SEQ.sequence, { hana: 'Hana' }), '1\n00:00:04,167 --> 00:00:06,250\nHana: Welcome in!\n\n2\n00:00:07,083 --> 00:00:08,333\nHana: Sit anywhere.\n');
});

test('playing: the camera track switches the brain, events fire on their step, shots override and put back', async () => {
  const { tree, sequence } = await world();
  const brain = /** @type {any} */ (tree.find('brain')), lamp = tree.find('lamp'), hana = tree.find('hana');
  const seen = { kicked: null, shots: [], cams: [] };
  tree.listen(tree.root, 'event', (a) => { if (a.name === 'kicked') seen.kicked = tree.clock.step; });
  tree.listen(tree.root, 'shotChanged', (a) => seen.shots.push([a.shot, tree.clock.step]));
  tree.listen(brain, 'cameraChanged', (a) => seen.cams.push([a.to, tree.clock.step]));
  await steps(tree, 1);
  assert.equal(brain.bstate.override, 'vc-a');
  await steps(tree, 148); // frame 60 is reached by the 150th step (24 fps: 2.5 steps a frame)
  const x0 = tree.find('crate').object3d.position.x;
  assert.ok(Math.abs(x0) < 0.1, `no kick in the first 149 steps: a bounce only (${x0})`);
  await steps(tree, 4);
  assert.equal(seen.kicked, 152, 'the emit at frame 61 (152.5 steps) fired in the step that crossed it, the 153rd');
  await steps(tree, 240 - 153);
  assert.equal(lamp.props.intensity, 40, 'shot s2 overrides the lamp');
  assert.deepEqual(hana.object3d.position.toArray(), [0.2, 0, 3]);
  assert.equal(lamp.props.color, '#ff8000', 'the property track got there');
  await steps(tree, 420 - 240);
  assert.equal(lamp.props.intensity, 5, 'and s3 puts it back');
  assert.deepEqual(hana.object3d.position.toArray(), [0, 0, 3]);
  assert.deepEqual(seen.shots, [['s1', 0], ['s2', 239], ['s3', 419]]);
  assert.deepEqual(seen.cams.map((c) => c[0]), ['vc-a', 'vc-b', 'vc-a']);
  assert.equal(brain.bstate.steps, 30, 'the s3 blend: 12 frames at 24 fps = 30 steps');
  assert.ok(tree.find('crate').object3d.position.x > x0 + 0.5, 'the crate was kicked');
  assert.equal(sequence.pb.frame, 168);
  await steps(tree, 600 - 420);
  assert.equal(sequence.pb.playing, false, 'finished at the end');
  assert.equal(brain.bstate.override, 'vc-a', 'holding the last camera');
});

test('post values follow the frame and α (presentation only)', async () => {
  const { tree, sequence } = await world();
  await steps(tree, 240); // frame 96 is the 240th step's: drawn at α = 1
  assert.deepEqual(sequence.postValues(1), { 'anime.speedLines': 0.8, 'vignette.darkness': 0.4 });
  assert.ok(sequence.postValues(0)['anime.speedLines'] < 0.8, 'α = 0 is the step before: still rising');
  await steps(tree, 1);
  const a = sequence.postValues(0.5)['anime.speedLines'], b = sequence.postValues(1)['anime.speedLines'];
  assert.ok(b < a && a < 0.8, `fading out between steps (${a}, ${b})`);
});

test('scrubbing lands on exactly the world of a straight play, from snapshots and backwards', async () => {
  const ref = await world();
  const want = new Map();
  for (const f of [0, 61, 97, 150, 239]) {
    const { step } = ref.sequence.stepOf(f);
    await steps(ref.tree, step - ref.tree.clock.step);
    want.set(f, hash(ref.tree));
  }
  const { tree, player } = await world(SEQ, { scrub: true });
  const order = [239, 61, 150, 97, 0, 239, 150];
  const how = [];
  for (const f of order) {
    const r = await player.seek(f);
    how.push([f, r.restored, r.stepped]);
    assert.equal(hash(tree), want.get(f), `frame ${f}: the same world as playing to it (${JSON.stringify(r)})`);
  }
  assert.equal(how[1][1], 120, "back to 61 (step 152) from 239: restored the snapshot at 120");
  assert.equal(how[2][1], 360, 'forward from 61 to 150 (step 375): from the snapshot at 360, nearer than stepping on');
  assert.equal(how[3][1], 240, 'back to 97 (step 242): from the snapshot at 240');
  assert.ok(how[5][2] < 60, `239 again: from the nearest snapshot (${how[5][2]} steps)`);
  player.invalidate(100);
  assert.deepEqual([...player.snaps.keys()].sort((a, b) => a - b).filter((s) => s > 250), [], 'an edit at frame 100 forgets the snapshots after it');
});

test('a snapshot mid-shot restores the sequence (overrides, camera, playback) and replays the same', async () => {
  const a = await world();
  await steps(a.tree, 300);
  const snap = captureWorld(a.tree);
  await steps(a.tree, 200);
  const b = await world();
  restoreWorld(b.tree, snap);
  assert.equal(b.tree.find('lamp').props.intensity, 40);
  await steps(b.tree, 200);
  assert.equal(hash(b.tree), hash(a.tree));
  assert.equal(b.tree.find('lamp').props.intensity, 5, 'the restored shot put its override back when it ended');
});

test('baking: a baked span replays the cached take even when the live simulation would differ', async () => {
  const seq = structuredClone(SEQ);
  seq.sequence.tracks.find((t) => t.id === 'sim').clips = [{ start: 0, end: 96, mode: 'live' }, { start: 96, end: 192, mode: 'baked' }];
  const a = await world(seq);
  const cache = await bake(a.tree, { targets: ['crate'], state: false });
  assert.equal(cache.poses.size, 480 - 240, 'one pose a step over the span (frames 96–192 = steps 240–480)');
  const round = bakeFromJSON(JSON.parse(JSON.stringify(bakeToJSON(cache))));
  // a different take of the simulation: a heavier kick
  const other = structuredClone(seq);
  other.sequence.tracks.find((t) => t.id === 'kick').keys[0][1].args.impulse = [9, 4, 0];
  const b = await world(other);
  useBake(b.tree, round);
  await steps(b.tree, 300);
  const p = b.tree.find('crate').object3d.position.toArray();
  assert.deepEqual(p, round.poses.get(300).crate.t.slice(0, 3), 'inside the baked span: the cached take');
  const c = await world(other);
  await steps(c.tree, 300);
  assert.notDeepEqual(c.tree.find('crate').object3d.position.toArray(), p, 'the live take differs there');
  await steps(a.tree, 600 - 480); await steps(b.tree, 300);
  assert.deepEqual(b.tree.find('crate').object3d.position.toArray(), a.tree.find('crate').object3d.position.toArray(), 'after the span, the simulation carries on from the baked take');
});

test('a move track (M4 W9) is her walking intent from its first key to its last; a walk begun after a cut owns her place; lookAt tracks hand back', async () => {
  const seq = structuredClone(SEQ);
  seq.sequence.tracks.push(
    { id: 'mira-moves', type: 'transform', target: 'mira', interp: 'step', keys: [[0, { p: [0, 0, 0] }], [200, { p: [5, 0, 5] }]] },
    { id: 'mira-walk', type: 'move', target: 'mira', keys: [[20, [0, 1.4]], [30, [1, 1]], [40, [0, 0, 1]], [44, [0, 0]]] },
    { id: 'mira-eyes', type: 'lookAt', target: 'mira', clips: [{ start: 0, end: 240, at: 'hana' }] },
    { id: 'mira-eyes-take', type: 'lookAt', target: 'mira', clips: [{ start: 50, end: 60, at: 'lamp' }] },
  );
  assert.deepEqual(checkSequence(seq.sequence), []);
  assert.match(checkSequence({ ...seq.sequence, tracks: [{ id: 'w', type: 'move', keys: [[0, [1]]] }] }).join(), /a move track needs a target.*a move key is \[frame, \[vx, vz\]\]/s);
  assert.match(checkSequence({ ...seq.sequence, tracks: [{ id: 'w', type: 'move', target: 'mira', keys: [[9, [0, 0]], [3, [0, 0]]] }] }).join(), /move keys aren't in frame order/);
  const { tree, sequence } = await world(seq);
  const mira = /** @type {any} */ (tree.find('mira')), looks = [];
  mira.input = { move: [9, 9], jump: false }; // a Marker stands in for a character: the service writes her intent
  mira.lookAt = ({ target }) => looks.push([tree.clock.step, target ?? null]);
  const seen = [];
  for (let i = 0; i < 200; i++) {
    if (i === 60) mira.object3d.position.set(1, 0, 2); // frame 24: her walk has begun, and took her here
    tree.step();
    seen.push({ step: i, frame: sequence.pb.frame, move: [...mira.input.move], jump: mira.input.jump, x: mira.object3d.position.x });
    mira.input.jump = false;
  }
  const at = (frame) => seen.find((s) => s.frame >= frame);
  assert.deepEqual(at(10).move, [9, 9], 'before its first key the track leaves her alone');
  assert.deepEqual(at(20).move, [0, 1.4]); assert.deepEqual(seen.findLast((x) => x.frame < 30).move, [0, 1.4], 'held between keys');
  assert.deepEqual(at(30).move, [1, 1]);
  assert.deepEqual(seen.filter((s) => s.jump).map((s) => s.frame), [40], 'a jump on the step that crosses its key, once');
  assert.deepEqual(at(44).move, [0, 0], 'the last key stops her');
  mira.input.move = [3, 3];
  tree.step();
  assert.deepEqual(mira.input.move, [3, 3], 'and past it she is let go');
  assert.equal(at(10).x, 0, 'before the walk the cut holds her on her mark');
  assert.equal(at(60).x, 1, 'after it the walk owns her place: the earlier cut no longer puts her back');
  while (sequence.pb.frame < 201) tree.step();
  assert.equal(mira.object3d.position.x, 5, 'until the next cut, which takes her again');
  assert.deepEqual(looks.map((l) => l[1]), ['hana', 'lamp', 'hana'], 'the take\'s look ends and the film\'s has her eyes again');
});
