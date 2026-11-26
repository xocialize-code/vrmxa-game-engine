// M2 W8 (AB-T-0531), two-bone IK on the sample cafe (needs vrmxa-core beside the repo for Mira): a step under
// one foot drops her pelvis and bends that leg so both feet stand on their own ground; flat ground changes nothing; a
// reach brings her hand to a point and lets go; opening the cupboard reaches for its knob; all of it the same every run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Vector3 } from 'three';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from './fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const OK = fs.existsSync(PATHS.core);

async function world(extra = [], miraAt = null) {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  sample.doc = { ...sample.doc, nodes: [...sample.doc.nodes.map((n) => (n.id === 'mira' ? { ...n, behaviours: [], ...(miraAt ? { transform: { p: miraAt, q: [0, 1, 0, 0] } } : {}) } : n)), ...extra] };
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  return buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true });
}
const footY = (m, s) => new Vector3().setFromMatrixPosition(m.vrm.humanoid.getNormalizedBoneNode(`${s}Foot`).matrixWorld).y;
const handAt = (m, s) => new Vector3().setFromMatrixPosition(m.vrm.humanoid.getNormalizedBoneNode(`${s}Hand`).matrixWorld);

test('feet: flat ground changes nothing; a step under one foot drops the pelvis and lifts that foot onto it', { skip: !OK && 'needs vrmxa-core' }, async () => {
  const flat = await world([], [1.5, 0, 2.5]);
  const m0 = /** @type {any} */ (flat.tree.find('mira'));
  for (let i = 0; i < 90; i++) flat.tree.step();
  assert.deepEqual(m0.ctrl.feet, [0, 0], 'flat: no IK');
  const dy0 = footY(m0, 'left') - footY(m0, 'right');
  // A 12 cm slab under the foot on +X, clear of her capsule's middle.
  const W = await world([{ id: 'slab', type: 'Collider', parent: 'root', transform: { p: [1.8, 0.06, 2.5] }, props: { shape: 'box', size: [0.5, 0.12, 0.6] } }], [1.5, 0, 2.5]);
  const m = /** @type {any} */ (W.tree.find('mira'));
  for (let i = 0; i < 90; i++) W.tree.step();
  const lift = footY(m, 'left') - footY(m, 'right') - dy0;
  assert.ok(Math.abs(m.ctrl.feet[0] - m.ctrl.feet[1]) > 0.1, `the feet see different ground (${m.ctrl.feet.map((v) => v.toFixed(3))})`);
  assert.ok(Math.abs(Math.abs(lift) - Math.abs(m.ctrl.feet[0] - m.ctrl.feet[1])) < 0.02, `one foot stands ${Math.abs(lift).toFixed(3)} m higher than the other, as the ground under them does`);
  // the same every run
  const W2 = await world([{ id: 'slab', type: 'Collider', parent: 'root', transform: { p: [1.8, 0.06, 2.5] }, props: { shape: 'box', size: [0.5, 0.12, 0.6] } }], [1.5, 0, 2.5]);
  for (let i = 0; i < 90; i++) W2.tree.step();
  assert.equal(hashValue(worldHashes(W2.tree)), hashValue(worldHashes(W.tree)));
});

test('hands: a reach brings the hand to the point and lets go; opening the cupboard reaches for its knob', { skip: !OK && 'needs vrmxa-core' }, async () => {
  const W = await world([], [1.5, 0, 2.5]);
  const m = /** @type {any} */ (W.tree.find('mira'));
  for (let i = 0; i < 30; i++) W.tree.step();
  const p = m.object3d.position, point = [p.x + 0.2, p.y + 1.25, p.z - 0.4]; // her right is +X (she faces -Z)
  const rest = handAt(m, 'right').distanceTo(new Vector3(...point));
  m.reach({ hand: 'right', point, seconds: 1 });
  for (let i = 0; i < 30; i++) W.tree.step();
  const reached = handAt(m, 'right').distanceTo(new Vector3(...point));
  assert.ok(reached < 0.03 && rest > 0.2, `the hand reached the point (${reached.toFixed(3)} m, from ${rest.toFixed(3)})`);
  for (let i = 0; i < 40; i++) W.tree.step();
  assert.equal(m.ctrl.reach, undefined, 'and let go');
  // the cupboard: walk Mira in front of it and open it
  const C = await world([], [-4.85, 0, -3.6]);
  const mc = /** @type {any} */ (C.tree.find('mira'));
  mc.placeAt(-4.85, 0, -3.6, -Math.PI / 2);
  for (let i = 0; i < 20; i++) C.tree.step();
  C.interact.request('mira', 'cupboard', 'open');
  assert.equal(mc.ctrl.reach?.part, 'Knob', 'the open verb reaches for the knob');
  let closest = Infinity;
  const knob = C.tree.find('cupboard').part('Knob');
  for (let i = 0; i < 40; i++) { C.tree.step(); closest = Math.min(closest, handAt(mc, 'right').distanceTo(knob.getWorldPosition(new Vector3()))); }
  assert.ok(closest < 0.12, `the hand came to the knob (${closest.toFixed(3)} m)`);
});
