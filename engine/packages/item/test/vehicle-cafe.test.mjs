// M3 W8 (AB-T-0547) on the sample cafe (needs vrmxa-core beside the repo for Mira): the cart. Mira, beside its
// driver's door, gets in with the interact key, drives along the pavement (W), changes lane (A, then D), brakes (S) and gets out once it
// has stopped. The run is recorded through the input service; the recording replays with the same hash after every step,
// and a snapshot taken mid-drive re-simulates to the same end. The camera chases the cart while she drives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Vector3 } from 'three';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { VirtualDevice } from '@vrmxg/input';
import { worldHashes, captureWorld, restoreWorld, compareRuns } from '@vrmxg/snapshot';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { withCart, CART, DRIVE_ROUTE as ROUTE, routeKeys } from '../../../../apps/playground/src/vehicle.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const OK = fs.existsSync(PATHS.core);

const STEPS = 540, SNAP = 260;

async function world() {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  sample.doc = withCart(sample.doc);
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  return buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true });
}

async function live({ snapAt = null } = {}) {
  const W = await world(), tree = W.tree, dev = W.input.addDevice(new VirtualDevice());
  const mira = /** @type {any} */ (tree.find('mira')), cart = /** @type {any} */ (tree.find('cart')), cam = /** @type {any} */ (tree.find('cam'));
  W.input.record();
  const run = [], seen = { seated: null, left: null, maxSpeed: 0, chased: 0, drift: 0 };
  let snap = null, held = new Set();
  for (let k = 0; k < STEPS; k++) {
    held = routeKeys(ROUTE, k, dev, held);
    tree.step();
    if (mira.ctrl.seat && seen.seated === null) seen.seated = tree.clock.step;
    if (!mira.ctrl.seat && seen.seated !== null && seen.left === null) seen.left = tree.clock.step;
    seen.maxSpeed = Math.max(seen.maxSpeed, cart.vehicleSpeed());
    if (cam.rig.vehicle) seen.chased++;
    if (mira.ctrl.seat) { // she rides at her seat point, not a step behind it
      const pt = cart.seatPoints()[mira.ctrl.seat.point].node.getWorldPosition(new Vector3());
      const p = mira.object3d.position;
      seen.drift = Math.max(seen.drift, Math.hypot(pt.x - p.x, pt.z - p.z));
    }
    run.push({ step: tree.clock.step, h: worldHashes(tree, { physicsBytes: tree.clock.step % 60 === 0 }) });
    if (tree.clock.step === snapAt) snap = captureWorld(tree);
  }
  return { W, mira, cart, seen, run, snap, rec: W.input.stop() };
}

const chassisAt = (cart) => cart.part('Chassis').getWorldPosition(new Vector3());

test('Mira gets in the cart, drives along the pavement, changes lane, brakes and gets out', { skip: !OK && 'needs vrmxa-core' }, async () => {
  const { mira, cart, seen } = await live();
  assert.ok(seen.seated !== null && seen.seated <= 40, `she got in with the interact key (step ${seen.seated})`);
  assert.equal(cart.current, null, 'the cart has no states');
  const at = chassisAt(cart);
  assert.ok(at.x < CART.p[0] - 4, `the cart drove forward, along −x (${at.x.toFixed(2)})`);
  assert.ok(at.z - CART.p[2] > 0.5, `and changed lane to its left, +z (z ${at.z.toFixed(2)})`);
  assert.ok(seen.maxSpeed > 2.5 && seen.maxSpeed <= 6.2, `up to ${seen.maxSpeed.toFixed(2)} m/s (6 at most)`);
  assert.ok(seen.drift < 0.05, `she rode at her seat (${seen.drift.toFixed(3)} m at most from it)`);
  assert.ok(seen.chased > 200, `the camera chased the cart while she drove (${seen.chased} steps)`);
  assert.ok(seen.left !== null && seen.left > 420, `she got out once it stopped (step ${seen.left})`);
  assert.ok(Math.abs(cart.vehicleSpeed()) < 0.05, 'the cart parked');
  const exit = cart.seatPoints()[0].exit.getWorldPosition(new Vector3()), p = mira.object3d.position;
  assert.ok(Math.hypot(exit.x - p.x, exit.z - p.z) < 0.6, `she stands by the driver's door (${Math.hypot(exit.x - p.x, exit.z - p.z).toFixed(2)} m from the exit point)`);
  assert.ok(mira.physics.world.world.getCollider(mira.collider).isEnabled(), 'her capsule is back on');
});

test('the recorded drive replays with the same hash after every step, and from a snapshot taken mid-drive', { skip: !OK && 'needs vrmxa-core' }, async () => {
  const A = await live({ snapAt: SNAP });
  assert.ok(A.snap.nodes.mira.ctrl.seat, 'the snapshot is mid-drive');
  const B = await world();
  B.input.replay(structuredClone(A.rec));
  const again = [];
  for (let k = 0; k < STEPS; k++) { B.tree.step(); again.push({ step: B.tree.clock.step, h: worldHashes(B.tree, { physicsBytes: B.tree.clock.step % 60 === 0 }) }); }
  assert.equal(compareRuns(A.run, again), null, 'replayed: the same hash after every step');
  const C = await world();
  C.input.replay(structuredClone(A.rec));
  restoreWorld(C.tree, A.snap);
  const rest = [];
  for (let k = SNAP; k < STEPS; k++) { C.tree.step(); rest.push({ step: C.tree.clock.step, h: worldHashes(C.tree, { physicsBytes: C.tree.clock.step % 60 === 0 }) }); }
  assert.equal(compareRuns(A.run.slice(SNAP), rest), null, 'restored mid-drive: the same to the end');
});
