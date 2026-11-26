// M5 W7 (AB-T-0609): character layers (layers.js, LAYERS.md) on the fixture character walking: a wave on the upper
// body leaves the legs bit for bit as walking alone; a carried pose holds the arms while the legs walk; additive adds
// the clip's difference from rest; a one-shot fades out and leaves no state behind; a cross-fade inside a layer; a
// snapshot taken mid-fade restores into the unbroken run's following steps; a sequence's layer track plays on a layer;
// the layers prop replaces the default list. Skips without the VRMXA specification and the avatar studio beside the repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion } from 'three';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installCharacters, layerDefs, readLayers, slerpInto, sampleTrack, MASKS } from '@vrmxg/character';
import { installTracks, applyTrack, checkTrack, setNodePath } from '@vrmxg/tracks';
import { captureWorld, restoreWorld, worldHashes, hashValue } from '@vrmxg/snapshot';
import { available, read, vrmxaCore, testAnimations } from './fixtures.mjs';

installPortableMath();
const OK = available('core', 'coreAnim', 'full');
const SKIP = OK ? false : 'needs vrmxa-core beside this repository';
const R = OK ? await loadRapier() : null;
const core = OK ? await vrmxaCore() : null;
const anims = OK ? await testAnimations(core, { layers: true, carry: true }) : null;
const reg = m0Registry();

// walk along +z at 1.4 m/s from step 30, a pure function of the step
class Walk extends Behaviour { physicsProcess() { this.node.input.move = this.tree.clock.step >= 30 ? [0, 1.4] : [0, 0]; } }

async function setup({ props = {}, seed = 3 } = {}) {
  const tree = new SceneTree({ registry: reg, behaviours: new Map([['walk', Walk]]), seed });
  installPhysics(tree, R);
  installTracks(tree);
  const lib = installCharacters(tree, { resolve: () => read('full'), vrmxaCore: core, stubTextures: true });
  lib.setAnimations('characters/full.vrmxa', anims);
  const doc = {
    format: 'vrmxs', version: 1, id: 'layers-test', assets: [{ id: 'mira', type: 'vrmxa', ref: 'characters/full.vrmxa' }],
    nodes: [
      { id: 'floor', type: 'Collider', transform: { p: [0, -0.1, 0] }, props: { shape: 'box', size: [60, 0.2, 60] } },
      { id: 'mira', type: 'Character', asset: 'mira', props, behaviours: [{ use: 'walk' }] },
    ],
  };
  await lib.prepare(doc);
  tree.instantiate(doc);
  return { tree, mira: /** @type {any} */ (tree.find('mira')) };
}

const bone = (m, b) => m.vrm.humanoid.getNormalizedBoneNode(b);
const LOWER = MASKS.lowerBody;
const UPPER_ANIMATED = ['spine', 'leftUpperArm', 'rightUpperArm'];
/** the lower body's pose (rotations and the hips' position) exactly, as numbers */
const lower = (m) => LOWER.flatMap((b) => { const n = bone(m, b); return n ? [...n.quaternion.toArray(), ...(b === 'hips' ? n.position.toArray() : [])] : []; });
const angle = (a, b) => { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, d)); };
const q = (m, b) => bone(m, b).quaternion.toArray();

test('slerpInto and sampleTrack agree with three\'s slerp (through dmath)', () => {
  const a = new Quaternion(0.1, 0.7, -0.2, 0.6).normalize(), b = new Quaternion(-0.5, 0.1, 0.3, 0.8).normalize(), out = [0, 0, 0, 0];
  for (const t of [0, 0.25, 0.5, 0.9, 1]) {
    slerpInto(out, 0, a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w, t);
    const r = a.clone().slerp(b, t);
    assert.ok(angle(out, r.toArray()) < 1e-6, `t ${t}`);
  }
  // a linear track: held at the ends, interpolated between keys
  const track = { times: new Float32Array([0, 1]), values: new Float32Array([0, 0, 0, 1, 0, Math.sin(0.5), 0, Math.cos(0.5)]), getInterpolation: () => 2301 };
  const v = [0, 0, 0, 0];
  sampleTrack(track, -1, v); assert.deepEqual(v, [0, 0, 0, 1]);
  sampleTrack(track, 0.5, v); assert.ok(Math.abs(angle(v, [0, 0, 0, 1]) - 0.5) < 1e-6, 'halfway is half the angle');
});

test('layerDefs: the four default layers, and a layers prop checked', () => {
  assert.deepEqual(layerDefs(undefined).map((l) => `${l.name}:${l.mask}:${l.blend}`), ['upperBody:upperBody:overwrite', 'arms:arms:overwrite', 'face:face:overwrite', 'additive:fullBody:additive']);
  assert.deepEqual(layerDefs([{ name: 'tray', mask: ['leftUpperArm', 'rightUpperArm'] }]), [{ name: 'tray', mask: ['leftUpperArm', 'rightUpperArm'], blend: 'overwrite', weight: 1 }]);
  assert.throws(() => layerDefs([{ name: 'x', mask: 'tail' }]), /mask/);
  assert.throws(() => layerDefs([{ name: 'x' }, { name: 'x' }]), /two layers/);
  assert.throws(() => layerDefs([{ name: 'x', blend: 'multiply' }]), /blend/);
  assert.throws(() => layerDefs([{ name: 'x', weight: 2 }]), /weight/);
});

test('a wave on the upper-body layer plays over walk without disturbing the legs (every step, bit for bit)', { skip: SKIP }, async () => {
  const A = await setup(), B = await setup();
  let maxArm = 0, differs = 0, sawState = false;
  for (let k = 0; k < 260; k++) {
    if (B.tree.clock.step === 90) B.mira.playLayer({ layer: 'upperBody', clip: 'greet', loop: false, fade: 0.2 });
    A.tree.step(); B.tree.step();
    assert.deepEqual(lower(B.mira), lower(A.mira), `step ${A.tree.clock.step}: the lower body is walking's`);
    assert.equal(B.mira.graph.state, A.mira.graph.state);
    const qa = q(A.mira, 'rightUpperArm'), qb = q(B.mira, 'rightUpperArm');
    maxArm = Math.max(maxArm, angle(qb, qa)); if (qb.some((x, i) => x !== qa[i])) differs++;
    if (B.mira.getState().layers) sawState = true;
  }
  assert.ok(maxArm > 1, `the right arm waves (up to ${maxArm.toFixed(2)} rad from walking's)`);
  assert.equal(differs, 71, 'only while the 1.2 s wave plays: 72 steps, the last at weight 0');
  assert.ok(sawState, 'the layer is in the character\'s state while it plays');
  assert.equal(B.mira.getState().layers, undefined, 'and gone once the one-shot has faded out');
  assert.equal(B.mira.layers.playing('upperBody'), false);
  // the upper body is walking's again exactly (the springs swung differently; the bones don't)
  for (const b of [...UPPER_ANIMATED, 'rightLowerArm', 'neck', 'head']) assert.deepEqual(q(B.mira, b), q(A.mira, b), `${b} back to walking's`);
  assert.ok(B.mira.object3d.position.z > 4, 'she kept walking');
  assert.equal(B.mira.object3d.position.z, A.mira.object3d.position.z, 'exactly as far');
});

test('a carried pose on the upper body over walk: the arms hold the tray while the legs walk (the sample game\'s case)', { skip: SKIP }, async () => {
  const A = await setup(), B = await setup();
  B.mira.playLayer({ layer: 'upperBody', slot: 'carry', fade: 0.3 });
  const free = [], held = [], forearm = [];
  for (let k = 0; k < 200; k++) {
    A.tree.step(); B.tree.step();
    assert.deepEqual(lower(B.mira), lower(A.mira), `step ${A.tree.clock.step}: the lower body is walking's`);
    if (k >= 120) { free.push(q(A.mira, 'leftUpperArm')); held.push(q(B.mira, 'leftUpperArm')); forearm.push(q(B.mira, 'leftLowerArm')); }
  }
  const swing = (list) => Math.max(...list.map((x) => angle(x, list[0])));
  assert.ok(swing(free) > 0.2, `walking alone swings the arm (${swing(free).toFixed(3)} rad)`);
  assert.ok(swing(held) < 1e-6, `carrying holds it still (${swing(held).toFixed(6)} rad)`);
  assert.ok(Math.abs(angle(forearm[0], [0, 0, 0, 1]) - 1.5) < 0.06, `the forearm is bent level under the tray (${angle(forearm[0], [0, 0, 0, 1]).toFixed(3)} rad)`);
  assert.ok(B.mira.layers.playing('upperBody'));
  assert.ok(B.mira.object3d.position.z > 3);
  // letting go: the arms swing again and the lower arms (no clip but carry animates them) go back to rest
  B.mira.stopLayer({ layer: 'upperBody', fade: 0.25 });
  for (let k = 0; k < 30; k++) { A.tree.step(); B.tree.step(); }
  assert.deepEqual(q(B.mira, 'leftLowerArm'), [0, 0, 0, 1], 'the forearm back at rest');
  assert.deepEqual(q(B.mira, 'leftUpperArm'), q(A.mira, 'leftUpperArm'));
  assert.equal(B.mira.getState().layers, undefined);
});

test('additive adds the clip\'s difference from rest; overwrite at half weight is halfway', { skip: SKIP }, async () => {
  const A = await setup(), B = await setup({ props: { layers: [{ name: 'lean', mask: ['spine'], blend: 'additive' }, { name: 'half', mask: ['leftUpperArm'], blend: 'overwrite', weight: 0.5 }] } });
  assert.throws(() => B.mira.playLayer({ layer: 'upperBody', clip: 'carry' }), /no layer "upperBody"/, 'the prop replaced the defaults');
  B.mira.playLayer({ layer: 'lean', clip: 'carry', fade: 0 });
  B.mira.playLayer({ layer: 'half', clip: 'carry', fade: 0 });
  for (let k = 0; k < 100; k++) { A.tree.step(); B.tree.step(); }
  const clip = B.mira.actions.get(anims.sha.carry).getClip(), track = (b) => clip.tracks.find((t) => t.name === `${bone(B.mira, b).name}.quaternion`);
  const s = B.mira.layers.state.get('lean'), t = s.t - Math.floor(s.t / 2) * 2, c = [0, 0, 0, 0];
  sampleTrack(track('spine'), t, c);
  const want = new Quaternion().fromArray(q(A.mira, 'spine')).multiply(new Quaternion().fromArray(c));
  assert.ok(angle(q(B.mira, 'spine'), want.toArray()) < 1e-6, 'spine = walking\'s · carry\'s lean');
  sampleTrack(track('leftUpperArm'), t, c);
  const walkArm = q(A.mira, 'leftUpperArm'), got = q(B.mira, 'leftUpperArm');
  assert.ok(Math.abs(angle(got, walkArm) - angle(got, c)) < 1e-5 && angle(got, walkArm) > 0.05, 'the half-weight arm sits halfway between walking\'s and the clip\'s');
  assert.deepEqual(lower(B.mira), lower(A.mira));
});

test('a clip played on a playing layer cross-fades; a snapshot mid-fade restores into the unbroken run\'s following steps', { skip: SKIP }, async () => {
  const script = (w) => {
    const s = w.tree.clock.step;
    if (s === 40) w.mira.playLayer({ layer: 'upperBody', slot: 'carry', fade: 0.5 });
    if (s === 100) w.mira.playLayer({ layer: 'upperBody', clip: 'greet', loop: true, fade: 0.5 }); // carry → wave
    if (s === 110) w.mira.playLayer({ layer: 'additive', clip: 'idle-breathe', weight: 0.6, fade: 0.4 });
    if (s === 170) w.mira.layerWeight({ layer: 'upperBody', weight: 0.4, fade: 0.3 });
    if (s === 220) w.mira.stopLayer({ layer: 'upperBody', fade: 0.4 });
  };
  const run = async (from = null, snapAt = null) => {
    const w = await setup();
    if (from) restoreWorld(w.tree, from);
    const hashes = [];
    let snap = null, mid = null;
    while (w.tree.clock.step < 300) {
      script(w); w.tree.step();
      hashes.push([w.tree.clock.step, hashValue(worldHashes(w.tree, { physicsBytes: true }))]);
      if (w.tree.clock.step === snapAt) { snap = captureWorld(w.tree); mid = structuredClone(w.mira.layers.state.get('upperBody')); }
    }
    return { hashes, snap, mid };
  };
  const a = await run(null, 112), b = await run();
  assert.deepEqual(b.hashes, a.hashes, 'two runs: every step the same');
  assert.ok(a.mid.xf && a.mid.prev && a.mid.fade === null, 'the snapshot is mid cross-fade from carry to the wave');
  const c = await run(a.snap);
  assert.deepEqual(c.hashes, a.hashes.filter(([s]) => s > 112), 'restored mid-fade: the same hashes on every following step');
});

test('a sequence\'s animation track with a layer plays on that layer (a function of the frame), and checkTrack knows it', { skip: SKIP }, async () => {
  assert.deepEqual(checkTrack({ id: 't', type: 'animation', target: 'mira', layer: 'upperBody', clips: [{ start: 0, end: 30, clip: 'greet' }] }), []);
  assert.equal(checkTrack({ id: 't', type: 'property', target: 'x', path: 'props.y', layer: 'upperBody', keys: [] }).length, 1);
  const A = await setup(), B = await setup();
  const track = { id: 'wave', type: 'animation', target: 'mira', layer: 'upperBody', clips: [{ start: 60, end: 120, clip: 'greet', loop: false, blendIn: 10, blendOut: 10 }] };
  let moved = 0;
  for (let k = 0; k < 140; k++) {
    applyTrack(B.tree, track, B.tree.clock.step, 60); // the frame is the step (60 fps)
    A.tree.step(); B.tree.step();
    assert.deepEqual(lower(B.mira), lower(A.mira));
    const f = B.tree.clock.step - 1; // the frame this step applied
    if (f > 60 && f < 120) moved = Math.max(moved, angle(q(B.mira, 'rightUpperArm'), q(A.mira, 'rightUpperArm')));
  }
  assert.ok(moved > 1, `the track waved the right arm during frames 60 to 120 (up to ${moved.toFixed(2)} rad from walking's)`);
  assert.equal(B.mira.trackAnimation, null, 'the body is left to the graph');
  assert.deepEqual(q(B.mira, 'rightUpperArm'), q(A.mira, 'rightUpperArm'), 'over by frame 120');
  assert.equal(B.mira.getState().layers, undefined, 'a track layer is not character state');
});

test('the layers prop is read by value (an edit in place counts); a layer it drops stops; a one-shot at rate 2 fades out inside its clip; the same loop asked again goes on', { skip: SKIP }, async () => {
  const W = await setup({ props: { layers: [{ name: 'tray', mask: 'upperBody' }, { name: 'extra', mask: 'face' }] } });
  W.mira.playLayer({ layer: 'tray', slot: 'carry', fade: 0 });
  W.mira.playLayer({ layer: 'extra', clip: 'idle', fade: 0 });
  W.tree.run(40);
  const t = W.mira.layers.state.get('tray').t;
  W.mira.playLayer({ layer: 'tray', slot: 'carry', fade: 0.2 });
  assert.equal(W.mira.layers.state.get('tray').t, t, 'the carry asked for again goes on from where it was');
  const full = q(W.mira, 'leftLowerArm');
  W.mira.props.layers[0].weight = 0; // as a property track keying props.layers.0.weight would
  W.tree.step();
  assert.notDeepEqual(q(W.mira, 'leftLowerArm'), full, 'the weight edited in place took effect');
  W.mira.props.layers = [W.mira.props.layers[0]]; // drop "extra" while it plays
  W.tree.step();
  assert.equal(W.mira.layers.state.has('extra'), false, 'what played on a dropped layer stops');
  assert.doesNotThrow(() => W.mira.stopLayer({ layer: 'tray', fade: 0 }));
  assert.throws(() => W.mira.stopLayer({ layer: 'extra' }), /no layer "extra"/);
  W.tree.step();
  assert.equal(W.mira.getState().layers, undefined);
  // a 1.2 s wave at twice the speed lasts 36 steps, its fade-out (0.25 s = 15 steps) inside them
  assert.throws(() => W.mira.playLayer({ layer: 'tray', clip: 'greet', loop: false, rate: -1 }), /rate > 0/);
  W.mira.playLayer({ layer: 'tray', clip: 'greet', loop: false, rate: 2, fade: 0.25 });
  let steps = 0;
  while (W.mira.layers.state.has('tray') && steps < 100) { W.tree.step(); steps++; }
  assert.equal(steps, 36, `gone after ${steps} steps`);
});

test('a bad layers value never throws inside the step: keyed onto a scene without the prop, the defaults play; a weight is clamped; it is said', { skip: SKIP }, async () => {
  assert.deepEqual(readLayers({ 0: { weight: 0.5 } }).defs.map((d) => d.name), ['upperBody', 'arms', 'face', 'additive']);
  assert.equal(readLayers({ 0: { weight: 0.5 } }).problems.length, 1);
  assert.deepEqual(readLayers([{ name: 'a', weight: 1.4 }, { name: 'b', mask: 'tail' }, { name: 'c', weight: -0.2 }]).defs.map((d) => `${d.name}:${d.weight}`), ['a:1', 'c:0']);
  const warn = console.warn, said = [];
  console.warn = (m) => said.push(String(m));
  try {
    const W = await setup();
    W.mira.playLayer({ layer: 'upperBody', slot: 'carry', fade: 0 });
    W.tree.run(5);
    setNodePath(W.mira, 'props.layers.0.weight', 0.5); // what a property track keying that path does on this scene
    assert.doesNotThrow(() => W.tree.run(5));
    assert.ok(W.mira.layers.playing('upperBody'), 'the default layers still play');
    assert.equal(said.filter((m) => m.includes('layers prop')).length, 1, 'said once');
    // a list whose weight a bezier ease overshoots: clamped
    const V = await setup({ props: { layers: [{ name: 'tray', mask: 'upperBody' }] } });
    V.mira.playLayer({ layer: 'tray', slot: 'carry', fade: 0 });
    V.mira.props.layers[0].weight = 1.07;
    assert.doesNotThrow(() => V.tree.run(3));
    assert.equal(V.mira.layers.defs[0].weight, 1);
    // a track on a layer she doesn't have plays nowhere and is said once
    const track = { id: 't', type: 'animation', target: 'mira', layer: 'tail', clips: [{ start: 0, end: 30, clip: 'greet' }] };
    for (let k = 0; k < 3; k++) { applyTrack(V.tree, track, V.tree.clock.step, 60); V.tree.step(); }
    assert.equal(said.filter((m) => m.includes('"tail"')).length, 1);
  } finally { console.warn = warn; }
});

test('a layer dropped from the prop between steps: the snapshot restored into a world of the edited document plays what the unbroken run plays', { skip: SKIP }, async () => {
  const layers = [{ name: 'tray', mask: 'upperBody' }, { name: 'extra', mask: 'face' }];
  const A = await setup({ props: { layers } });
  A.mira.playLayer({ layer: 'tray', slot: 'carry', fade: 0.2 });
  A.mira.playLayer({ layer: 'extra', clip: 'idle', fade: 0.2 });
  A.tree.run(30);
  A.mira.props.layers = [layers[0]]; // dropped between steps
  const snap = captureWorld(A.tree);
  assert.ok(snap.nodes.mira.layers.playing.extra, 'the snapshot still has it (nothing has stepped since)');
  const B = await setup({ props: { layers: [layers[0]] } });
  restoreWorld(B.tree, snap);
  assert.equal(B.mira.layers.state.has('extra'), false, 'restored: what played on the dropped layer is gone');
  const ha = [], hb = [];
  for (let k = 0; k < 40; k++) { A.tree.step(); B.tree.step(); ha.push(hashValue(worldHashes(A.tree))); hb.push(hashValue(worldHashes(B.tree))); }
  assert.deepEqual(hb, ha);
});
