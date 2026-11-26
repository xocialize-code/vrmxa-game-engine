// M2 W8 (AB-T-0531), G10 layers on the sample cafe (needs vrmxa-core beside the repo for Mira): with a sword in
// hand her upper body holds the sword's pose (the sword set's `hold`, masked upperBody) while her legs walk; without it
// her arms swing; a masked `greet` wave plays over walking without stopping her; the same every run; a snapshot mid-wave
// replays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { captureWorld, restoreWorld, worldHashes, hashValue } from '@vrmxg/snapshot';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from './fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const OK = fs.existsSync(PATHS.core);

async function world() {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  sample.doc = { ...sample.doc, nodes: sample.doc.nodes.map((n) => (n.id === 'mira' ? { ...n, behaviours: [] } : n)) };
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  return buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true });
}
const q = (m, bone) => m.vrm.humanoid.getNormalizedBoneNode(bone).quaternion.toArray();
const angle = (a, b) => { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, d)); };

test('the sword\'s hold layers over walking: upper body in the sword pose, legs walking; a wave plays over the walk', { skip: !OK && 'needs vrmxa-core' }, async () => {
  const W = await world(), tree = W.tree, mira = /** @type {any} */ (tree.find('mira'));
  const walk = async (n) => { for (let i = 0; i < n; i++) { mira.input.move = [0, -1.4]; tree.step(); } };
  // without a sword: walking swings the arms
  await walk(90);
  const armsFree = [], legs = [];
  for (let i = 0; i < 40; i++) { await walk(1); armsFree.push(q(mira, 'leftUpperArm')); legs.push(q(mira, 'leftUpperLeg')); }
  const swing = Math.max(...armsFree.map((a) => angle(a, armsFree[0])));
  assert.ok(swing > 0.1, `free arms swing while walking (${swing.toFixed(3)} rad)`);
  // with the sword in hand: the hold layer takes the upper body
  mira.setEquippedTags([...mira.equipped, 'held:sword']);
  assert.ok(mira.graph.has('hold'), 'the sword set brings a hold slot');
  await walk(60);
  assert.ok(mira.graph.hold.w > 0.99, `the hold layer faded in (${mira.graph.hold.w})`);
  const armsHeld = [], legsHeld = [];
  for (let i = 0; i < 40; i++) { await walk(1); armsHeld.push(q(mira, 'leftUpperArm')); legsHeld.push(q(mira, 'leftUpperLeg')); }
  const held = Math.max(...armsHeld.map((a) => angle(a, armsHeld[0])));
  const legSwing = Math.max(...legsHeld.map((a) => angle(a, legsHeld[0])));
  assert.ok(held < swing * 0.25, `the held arm keeps the sword pose (${held.toFixed(3)} rad against ${swing.toFixed(3)})`);
  assert.ok(legSwing > 0.3, `the legs still walk (${legSwing.toFixed(3)} rad)`);
  assert.equal(mira.graph.state, 'move');
  // a masked greet (arms) over walking
  const before = mira.object3d.position.z;
  mira.startAction('greet');
  assert.ok(mira.graph.gesturing && !mira.graph.busy, 'a gesture is a layer, not an action state');
  await walk(30);
  assert.ok(before - mira.object3d.position.z > 0.5, 'she keeps walking while she waves');
  assert.ok(angle(q(mira, 'rightUpperArm'), armsHeld[0]) > 0.3, 'the right arm waves');
  await walk(60);
  assert.equal(mira.graph.gesturing, false, 'the wave ends by itself');
});

test('layers replay: two runs identical, a snapshot mid-wave restores the same', { skip: !OK && 'needs vrmxa-core' }, async () => {
  const run = async (snapAt = null, from = null) => {
    const W = await world(), tree = W.tree, mira = /** @type {any} */ (tree.find('mira'));
    if (from) restoreWorld(tree, from);
    let snap = null;
    while (tree.clock.step < 300) {
      if (tree.clock.step === 60 && !from) mira.setEquippedTags([...mira.equipped, 'held:sword']);
      if (tree.clock.step === 150 && !from) mira.startAction('greet');
      mira.input.move = [0.8, -1.0];
      tree.step();
      if (tree.clock.step === snapAt) snap = captureWorld(tree);
    }
    return { hash: hashValue(worldHashes(tree, { physicsBytes: true })), snap };
  };
  const a = await run(170), b = await run();
  assert.equal(b.hash, a.hash);
  const c = await run(null, a.snap);
  assert.equal(c.hash, a.hash, 'restored mid-wave (step 170)');
});

test('an emote is state: a snapshot taken during one restores, and the expression goes back to 0 a second later (M2 W12)', { skip: !OK && 'needs vrmxa-core' }, async () => {
  const run = async (from = null) => {
    const W = await world(), tree = W.tree, mira = /** @type {any} */ (tree.find('mira'));
    if (from) restoreWorld(tree, from);
    let snap = null, mid = null;
    while (tree.clock.step < 200) {
      if (tree.clock.step === 100 && !from) mira.emote({ name: 'happy' });
      tree.step();
      if (tree.clock.step === 130) { snap = captureWorld(tree); mid = mira.vrm.expressionManager.getValue('happy'); }
    }
    return { hash: hashValue(worldHashes(tree, { physicsBytes: true })), snap, mid, end: mira.vrm.expressionManager.getValue('happy') };
  };
  const a = await run();
  assert.equal(a.mid, 1, 'still smiling half a second in');
  assert.equal(a.end, 0, 'back to 0 after the second');
  const b = await run(a.snap); // a closure timer here used to throw: "created at run time; a snapshot can't recreate its code"
  assert.equal(b.hash, a.hash, 'restored mid-emote (step 130)');
});
