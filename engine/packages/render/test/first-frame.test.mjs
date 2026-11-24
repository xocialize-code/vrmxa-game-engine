// AB-T-0595: a film's frame 0. A sequence's tracks apply in the step, and at step 0 no step has run: the Environment has
// the set's own post (no look), the output camera stands where the set left it, nobody is posed. Frame 0 maps to step 0
// at α 0, so it used to draw that world. The host now draws the first step as simulated for any blend that would reach
// back to step 0, in an export and a scrub alike, without touching the simulation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree, frameToStep } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installCameras } from '@vrmxg/camera';
import { installTracks } from '@vrmxg/tracks';
import { composeSequence, installSequence, SequencePlayer } from '@vrmxg/sequence';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { RenderHost } from '@vrmxg/render';

installPortableMath();
const R = await loadRapier();

const LOOK = [{ effect: 'bloom', intensity: 0.7 }, { effect: 'toneMapping' }, { effect: 'vignette' }];
const SET = { format: 'vrmxs', version: 1, id: 'set', assets: [], nodes: [
  { id: 'root', type: 'Node3D' },
  { id: 'env', type: 'Environment', parent: 'root', props: { background: 'gradient' } },
  { id: 'mira', type: 'Marker', parent: 'root', transform: { p: [0, 0, 0] } },
  { id: 'lamp', type: 'OmniLight', parent: 'root', props: { intensity: 5 } },
  { id: 'cam', type: 'Camera', parent: 'root', transform: { p: [-0.5, 1.6, 12.5] }, props: { focalLength: 35 } },
  { id: 'floor', type: 'Collider', parent: 'root', transform: { p: [0, -0.5, 0] }, props: { shape: 'box', size: [20, 1, 20] } },
  { id: 'crate', type: 'RigidBody', parent: 'root', transform: { p: [0, 3, 0] }, props: { mass: 2 } },
  { id: 'crate-shape', type: 'Collider', parent: 'crate', props: { shape: 'box', size: [0.5, 0.5, 0.5] } },
] };
const SEQ = { format: 'vrmxs', version: 1, id: 'film', set: 'set.vrmxs', assets: [], nodes: [
  { id: 'brain', type: 'CameraBrain', props: { camera: 'cam' } },
  { id: 'vc-a', type: 'VirtualCamera', transform: { p: [4, 1.6, 0] }, props: { body: { type: 'fixed' }, aim: { type: 'lookAt', target: 'mira' } } },
], sequence: {
  fps: 24, duration: 240,
  shots: [{ id: 's1', name: 'Wide', start: 0, end: 240, overrides: { lamp: { props: { intensity: 40 } } } }],
  tracks: [
    { id: 'cams', type: 'camera', clips: [{ start: 0, end: 240, camera: 'vc-a' }] },
    { id: 'look', type: 'property', target: 'env', path: 'props.post', keys: [[0, LOOK]] },
    { id: 'fade', type: 'post', keys: { 'vignette.darkness': [[0, 0.4]] } },
    { id: 'sim', type: 'simulation', clips: [{ start: 0, end: 240, mode: 'live' }] },
  ],
} };

async function world() {
  const tree = new SceneTree({ registry: m0Registry(), seed: 3 });
  installPhysics(tree, R);
  installCameras(tree);
  installTracks(tree);
  const sequence = installSequence(tree);
  const doc = composeSequence(structuredClone(SEQ), structuredClone(SET));
  await sequence.prepare(doc);
  tree.instantiate(doc);
  return { tree, sequence };
}

/** A host on stand-ins: every draw notes what it shows (the look the stack was given, the camera, the lamp, the crate). */
function hostFor(tree) {
  const drawn = [], v = new Vector3();
  const renderer = { shadowMap: { enabled: false }, setPixelRatio() {}, setSize() {}, dispose() {}, render(scene, camera) { scene.updateMatrixWorld(); camera.updateMatrixWorld?.(); note(camera); } };
  const stack = { look: null, params: null, active: false, configure(post) { this.look = post; this.active = !!post; }, setParams(p) { this.params = p; }, setSize() {}, render(scene, camera) { renderer.render(scene, camera); } };
  const note = (camera) => {
    camera.getWorldPosition(v);
    drawn.push({ step: tree.clock.step, look: stack.look, params: stack.params, camera: v.toArray().map((x) => +x.toFixed(6)), lamp: tree.find('lamp').props.intensity, crateY: tree.find('crate').object3d.matrixWorld.elements[13] });
  };
  const host = new RenderHost({ renderer, dprCap: 1, post: () => stack }).attach(tree);
  return { host, drawn };
}
const hash = (tree) => hashValue(worldHashes(tree, { physicsBytes: true }));

test('frame 0 of a film draws the first step: the look, the shot\'s camera and its overrides are in it', async () => {
  const { tree } = await world(), { host, drawn } = hostFor(tree);
  const f0 = frameToStep(0, 24);
  assert.deepEqual(f0, { step: 0, alpha: 0 });
  await host.frameAt(f0.step, f0.alpha);
  const d = drawn.at(-1);
  assert.equal(tree.clock.step, 1, 'the first step ran before the frame was drawn');
  assert.deepEqual(tree.find('env').props.post, LOOK, 'the Environment has the look track\'s post');
  assert.deepEqual(d.look, LOOK, 'and the post stack was configured with it before the draw');
  assert.deepEqual(d.params, { 'vignette.darkness': 0.4 }, 'the post track\'s values too');
  assert.deepEqual(d.camera, [4, 1.6, 0], 'drawn through the first shot\'s camera, not from where the set left the output camera');
  assert.equal(d.lamp, 40, 'the first shot\'s override is on');
  assert.deepEqual(host.last, { ...host.last, steps: 1, alpha: 1 }, 'the host says what it drew: step 1 as simulated');
});

test('nothing of the simulation changes: the world after an export\'s frames is a headless run\'s, step for step', async () => {
  const a = await world(), { host } = hostFor(a.tree), b = await world();
  for (let n = 0; n < 24; n++) {
    const { step, alpha } = frameToStep(n, 24);
    await host.frameAt(step, alpha);
    while (b.tree.clock.step < a.tree.clock.step) b.tree.step();
    assert.equal(hash(a.tree), hash(b.tree), `frame ${n} (step ${a.tree.clock.step})`);
  }
  assert.equal(a.tree.clock.step, frameToStep(23, 24).step, 'and no extra step: frame 23 is on its own step');
});

test('every frame that would blend with step 0 draws step 1 as it is; the next ones are as before', async () => {
  // 60 fps: frames 0, 1 and 2 are (0, 0), (1, 0) and (2, 0), the moments −1, 0 and 1 in steps. 48 fps: frame 1 is (1, 0.25)
  for (const fps of [60, 48]) {
    const { tree } = await world(), { host, drawn } = hostFor(tree);
    const y = [];
    for (let n = 0; n < 4; n++) { const { step, alpha } = frameToStep(n, fps); await host.frameAt(step, alpha); y.push({ at: step - 1 + alpha, step: tree.clock.step, alpha: host.last.alpha, crateY: drawn.at(-1).crateY, look: drawn.at(-1).look }); }
    const first = y.filter((f) => f.at <= 1);
    assert.ok(first.length >= 2, `${fps} fps has frames in the first step`);
    for (const f of first) { assert.equal(f.crateY, first[0].crateY, `${fps} fps: the same picture`); assert.deepEqual(f.look, LOOK); }
    assert.ok(y.at(-1).crateY < first[0].crateY, `${fps} fps: then the crate falls`);
    assert.ok(y.every((f) => f.look), 'no frame without the look');
  }
});

test('a scrub back to frame 0 draws what the export\'s frame 0 drew, on the same world', async () => {
  const { tree, sequence } = await world(), { host, drawn } = hostFor(tree);
  const player = new SequencePlayer(tree, { every: 30 });
  const at0 = sequence.stepOf(0);
  await host.frameAt(at0.step, at0.alpha);                 // the export's frame 0
  const exported = { ...drawn.at(-1), world: hash(tree) };
  const far = sequence.stepOf(100);
  await player.seekStep(far.step - 1); await host.frameAt(far.step, far.alpha);
  assert.notEqual(drawn.at(-1).crateY, exported.crateY);
  const r = await player.seekStep(Math.max(0, at0.step - 1)); // the editor's scrub: restore, then the host draws the frame
  assert.equal(r.restored, 0);
  await host.frameAt(at0.step, at0.alpha);
  assert.deepEqual({ ...drawn.at(-1), world: hash(tree) }, exported);
  // and the redraw an export's check or a paused view makes of that frame is the same picture
  host.render(host.last.alpha, false);
  assert.deepEqual({ ...drawn.at(-1), world: hash(tree) }, exported);
  host.render(at0.alpha, false);
  assert.deepEqual({ ...drawn.at(-1), world: hash(tree) }, exported, 'even asked for with the frame\'s own α');
});

test('α = 1 asks for a step as simulated and gets it, step 0 included', async () => {
  const { tree } = await world(), { host, drawn } = hostFor(tree);
  await host.frameAt(0, 1);
  assert.equal(tree.clock.step, 0);
  assert.equal(drawn.at(-1).look, null, 'the world before anything ran: the set\'s own post');
  assert.deepEqual(drawn.at(-1).camera, [-0.5, 1.6, 12.5]);
  await host.frameAt(1, 1);
  assert.deepEqual(drawn.at(-1).look, LOOK);
  await host.frameAt(2, 1);
  await assert.rejects(host.frameAt(0, 0.5), /only go forward/, 'a frame in the first step after the world has gone on is still refused');
});
