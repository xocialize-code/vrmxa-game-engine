import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installCharacters } from '@vrmxg/character';
import { available, read, vrmxaCore, testAnimations } from './fixtures.mjs';

installPortableMath();
const OK = available('spec', 'core', 'coreAnim', 'full');
const SKIP = OK ? false : 'needs VRMXA_Specification/assets/spec/spec.vrm and vrmxa-core beside this repository';
const R = OK ? await loadRapier() : null;
const core = OK ? await vrmxaCore() : null;
const anims = OK ? await testAnimations(core) : null;
const animsTravel = OK ? await testAnimations(core, { travel: true }) : null;
const reg = m0Registry();

// Scripted intent, a pure function of the step index (so a restored run sees the same input):
// idle 0–59 · walk +z at 1.4 m/s 60–179 · run +x at 4 m/s 180–359 with a jump at 300 · stop.
function intent(k) {
  if (k < 60) return { move: [0, 0], jump: false };
  if (k < 180) return { move: [0, 1.4], jump: false };
  if (k < 360) return { move: [4, 0], jump: k === 300 };
  return { move: [0, 0], jump: false };
}
class Script extends Behaviour { physicsProcess() { const i = intent(this.tree.clock.step); this.node.input.move = i.move; if (i.jump) this.node.input.jump = true; } }

const scene = (extra = []) => ({
  format: 'vrmxs', version: 1, id: 'char-test',
  assets: [{ id: 'mira', type: 'vrmxa', ref: 'characters/full.vrmxa' }, { id: 'spec', type: 'vrmxa', ref: 'characters/spec.vrm' }],
  nodes: [
    { id: 'floor', type: 'Collider', transform: { p: [0, -0.1, 0] }, props: { shape: 'box', size: [40, 0.2, 40] } },
    { id: 'mira', type: 'Character', asset: 'mira', behaviours: [{ use: 'script' }] },
    { id: 'post', type: 'Marker', transform: { p: [3, 1.5, 1] } },
    ...extra,
  ],
});

async function setup({ doc = scene(), animations = anims } = {}) {
  const tree = new SceneTree({ registry: reg, behaviours: new Map([['script', Script]]), seed: 3 });
  const physics = installPhysics(tree, R);
  const files = { 'characters/full.vrmxa': read('full'), 'characters/spec.vrm': read('spec') };
  const lib = installCharacters(tree, { resolve: (ref) => files[ref], vrmxaCore: core, stubTextures: true });
  lib.setAnimations('characters/full.vrmxa', animations);
  lib.setAnimations('characters/spec.vrm', animations);
  await lib.prepare(doc);
  tree.instantiate(doc);
  return { tree, physics, lib, mira: tree.find('mira') };
}

const typed = (k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v);
function hash(obj) {
  const s = JSON.stringify(obj, typed);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

test('walks, runs and jumps from scripted input: slots, blend, controller, facing', { skip: SKIP }, async () => {
  const { tree, mira } = await setup();
  const states = [], log = {};
  let maxY = 0;
  for (let k = 0; k < 480; k++) {
    tree.step();
    const s = mira.graph.state;
    if (states.at(-1) !== s) states.push(s);
    maxY = Math.max(maxY, mira.object3d.position.y);
    if (k === 178) log.walk = { z: mira.object3d.position.z, out: mira.graph.output() };
    if (k === 298) log.run = { x: mira.object3d.position.x, out: mira.graph.output(), yaw: mira.ctrl.yaw };
    if (k === 330) log.air = { grounded: mira.ctrl.grounded };
  }
  // the input stops at 360, before the landing ends, so land goes straight to idle
  assert.deepEqual(states, ['idle', 'move', 'jump', 'fall', 'land', 'idle'], states.join(' → '));
  const weightOf = (out, name) => out.find((o) => o.clip === anims.sha[name])?.weight ?? 0;
  assert.equal(weightOf(log.walk.out, 'walk'), 1, 'at 1.4 m/s: all walk');
  assert.equal(weightOf(log.run.out, 'run'), 1, 'at 4 m/s: all run');
  assert.ok(Math.abs(log.walk.z - 1.4 * 2) < 0.15, `walked ${log.walk.z.toFixed(2)} m in 2 s`);
  assert.ok(Math.abs(log.run.x - 4 * 2) < 0.4, `ran ${log.run.x.toFixed(2)} m in 2 s`);
  assert.ok(Math.abs(log.run.yaw - Math.PI / 2) < 1e-6, `faces +x (yaw ${log.run.yaw})`);
  assert.equal(log.air.grounded, false);
  assert.ok(maxY > 0.8 && maxY < 1.3, `jump apex ${maxY.toFixed(2)} m (4.5 m/s: about 1.03 m)`);
  assert.ok(mira.ctrl.grounded && Math.abs(mira.object3d.position.y) < 0.05, 'landed');
});

const still = () => ({ ...scene(), nodes: scene().nodes.map((n) => (n.id === 'mira' ? { ...n, behaviours: [] } : n)) });

test('animation slots follow what is worn (resolveSlots on equipped tags)', { skip: SKIP }, async () => {
  const { tree, mira, lib } = await setup({ doc: still() });
  const worn = (await core.equippedState(await core.readBundle(read('full')))).tags;
  assert.deepEqual([...mira.equipped], worn, 'starts with the bundle\'s equipped tags');
  tree.run(30);
  const idleClip = () => mira.graph.output().find((o) => o.weight > 0.99)?.clip;
  // the default idle is one of three weighted clips (M3 W12, AB-A-0315)
  const defaultIdle = (c) => [anims.sha.idle, anims.sha['idle-shift'], anims.sha['idle-breathe']].includes(c);
  assert.ok(defaultIdle(idleClip()), 'a default-set idle');
  mira.setEquippedTags([...worn, 'sword']);
  assert.equal(lib.resolveSlots(anims.doc, new Set(['sword'])).idle.set.id, 'sword', 'vrmxa-core picks the item set');
  tree.run(30);
  assert.equal(idleClip(), anims.sha['idle-sword'], 'idle now plays the sword set\'s clip');
  mira.setEquippedTags(worn);
  tree.run(30);
  assert.ok(defaultIdle(idleClip()), 'back to a default-set idle');
});

test('two runs are bit-identical at every step', { skip: SKIP }, async () => {
  const run = async () => { const { tree, mira } = await setup(); const hs = []; for (let k = 0; k < 420; k++) { tree.step(); hs.push(hash(mira.getState())); } return hs; };
  const a = await run(), b = await run();
  assert.deepEqual(a, b);
  assert.ok(new Set(a).size > 400);
});

test('snapshot mid-crossfade, restore into a new tree, re-simulate: bit-identical, through the state API only', { skip: SKIP }, async () => {
  const A = await setup();
  for (let k = 0; k < 64; k++) A.tree.step();
  assert.ok(A.mira.graph.fade > 0 && A.mira.graph.prev === 'idle' && A.mira.graph.state === 'move', 'mid-crossfade idle → move');
  const snap = { physics: A.physics.snapshot(), mira: A.mira.getState(), clock: A.tree.clock.getState(), rng: A.tree.rng.getState() };
  const expected = [];
  for (let k = 64; k < 420; k++) { A.tree.step(); expected.push(hash(A.mira.getState())); }

  const B = await setup();
  B.physics.restore(snap.physics);
  B.mira.setState(structuredClone(snap.mira));
  B.tree.clock.setState(snap.clock);
  B.tree.rng.setState(snap.rng);
  const got = [];
  for (let k = 64; k < 420; k++) { B.tree.step(); got.push(hash(B.mira.getState())); }
  const first = got.findIndex((h, i) => h !== expected[i]);
  assert.equal(first, -1, `first difference ${first + 64} steps in`);
  assert.ok(snap.mira.springs.length === 4 * 6, 'spring state: 4 joints × 6 numbers (vendored three-vrm getState)');
});

test('look-at, expressions, say, goTo and a bone attachment', { skip: SKIP }, async () => {
  const { tree, mira } = await setup({ doc: scene([{ id: 'sword', type: 'BoneAttachment', parent: 'mira', props: { bone: 'rightHand' } }]) });
  const heard = [];
  mira.on('spoke', (e) => heard.push(`spoke ${e.text}`));
  mira.on('arrived', (e) => heard.push(`arrived ${e.target} @${tree.clock.step}`));
  mira.call('lookAt', { target: 'post' });
  mira.call('say', { text: 'hello' });
  mira.call('emote', { name: 'happy' });
  tree.run(10);
  assert.ok(Math.abs(mira.vrm.lookAt.yaw) > 20, `turned her eyes (yaw ${mira.vrm.lookAt.yaw.toFixed(1)}°)`);
  assert.equal(mira.vrm.expressionManager.getValue('happy'), 1);
  tree.run(60);
  assert.equal(mira.vrm.expressionManager.getValue('happy'), 0, 'the emote ends after a second');
  const hand = mira.vrm.humanoid.getRawBoneNode('rightHand').getWorldPosition(new (await import('three')).Vector3());
  const att = tree.find('sword').object3d.getWorldPosition(new (await import('three')).Vector3());
  assert.ok(hand.distanceTo(att) < 1e-9, 'the attachment rides on the hand');
  // goTo overrides the script's input while it runs: script stands still before step 60, so start now
  const t2 = await setup({ doc: still() });
  const h2 = [];
  t2.mira.on('arrived', (e) => h2.push(e.target));
  t2.mira.call('goTo', { target: 'post' });
  t2.tree.run(240);
  assert.deepEqual(h2, ['post']);
  assert.deepEqual(heard, ['spoke hello']);
});

test('travel root motion: the clip\'s authored speed moves the character and the hips stay over it', { skip: SKIP }, async () => {
  const { tree, mira } = await setup({ animations: animsTravel });
  for (let k = 0; k < 179; k++) tree.step();
  const z = mira.object3d.position.z;
  assert.ok(Math.abs(z - 1.4 * (119 / 60)) < 0.15, `moved at the walk clip's 1.4 m/s (${z.toFixed(2)} m)`);
  const hips = mira.vrm.humanoid.getNormalizedBoneNode('hips').position;
  const rest = mira.vrm.humanoid.normalizedRestPose.hips.position;
  assert.deepEqual([hips.x, hips.z], [rest[0], rest[2]], 'the clip\'s forward drift is removed from the hips');
});

test('travel root motion blends from the speed asked for: a run input becomes a run, not a walk held at walk speed', { skip: SKIP }, async () => {
  const { tree, mira } = await setup({ animations: animsTravel });
  const step = (n, move) => { for (let k = 0; k < n; k++) { mira.input.move = move; tree.step(); } };
  step(30, [0, 0]);
  step(60, [0, 4]);
  assert.ok(Math.abs(mira.graph.speed - 4) < 1e-9 && mira.graph.runWeight(mira.graph.speed) === 1, `running at the run clip's 4 m/s (${mira.graph.speed})`);
  const z = mira.object3d.position.z;
  step(30, [0, 4]);
  assert.ok(Math.abs(mira.object3d.position.z - z - 2) < 0.05, 'moving 4 m/s');
  step(60, [0, 2.7]);
  assert.ok(Math.abs(mira.graph.speed - 2.7) < 1e-9 && mira.graph.runWeight(2.7) > 0.4 && mira.graph.runWeight(2.7) < 0.6, 'between the clips: blended, at the speed asked');
});

test('props.head turns the head over the animation and lets go: on bones no clip animates the turn neither builds up nor stays (M4 W9)', { skip: SKIP }, async () => {
  // the test set's clips move legs, arms and spine: nothing writes the neck or the head
  const { tree, mira } = await setup({ doc: still() });
  const neck = mira.vrm.humanoid.getNormalizedBoneNode('neck'), head = mira.vrm.humanoid.getNormalizedBoneNode('head');
  assert.ok(!mira.animated.has(neck.name) && !mira.animated.has(head.name), 'no clip animates her neck or head');
  const q = (b) => b.quaternion.toArray();
  tree.run(5);
  assert.deepEqual(q(neck), [0, 0, 0, 1]); assert.deepEqual(q(head), [0, 0, 0, 1]);
  assert.equal(mira.getState().ctrl.headTurned, undefined, 'a character whose head was never turned has nothing new in her state');
  mira.props.head = [0.4, 0.1, 0];
  tree.run(1);
  const turned = q(neck);
  assert.ok(Math.abs(turned[1]) > 0.09 && Math.abs(turned[1]) < 0.11, `the neck takes half the yaw (${turned[1].toFixed(4)})`);
  assert.deepEqual(q(head), turned, 'and the head the other half');
  tree.run(30);
  assert.deepEqual(q(neck), turned, 'thirty steps on it is the same turn: it does not build up');
  assert.equal(mira.getState().ctrl.headTurned, true, 'her state knows an unanimated bone holds a turn');
  // a snapshot mid-turn, restored into a fresh character, lets go the same way
  const snap = mira.getState();
  const other = await setup({ doc: still() });
  other.mira.setState(structuredClone(snap));
  for (const m of [mira, other.mira]) m.props.head = [0, 0, 0]; // a released track's last key, or a take stopping
  tree.run(1); other.tree.run(1);
  for (const m of [mira, other.mira]) {
    assert.deepEqual(q(m.vrm.humanoid.getNormalizedBoneNode('neck')), [0, 0, 0, 1], 'back at rest on the step the head returns to zero');
    assert.deepEqual(q(m.vrm.humanoid.getNormalizedBoneNode('head')), [0, 0, 0, 1]);
    assert.equal(m.getState().ctrl.headTurned, undefined);
  }
  // and when the prop goes away altogether
  mira.props.head = [0, -0.3, 0.2]; tree.run(2);
  assert.notDeepEqual(q(neck), [0, 0, 0, 1]);
  delete mira.props.head; tree.run(1);
  assert.deepEqual(q(neck), [0, 0, 0, 1]); assert.deepEqual(q(head), [0, 0, 0, 1]);
});
