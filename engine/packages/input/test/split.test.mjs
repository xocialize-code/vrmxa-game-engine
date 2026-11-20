// M3 W9 (AB-T-0548) on the sample cafe (needs vrmxa-avatar-studio beside the repo for the characters): two players.
// Mira is player 1 on WASD, Hana player 2 on the arrows, each walking relative to their own follow camera; the gamepad's
// right stick turns player 2's camera only, the mouse player 1's only. A recording of both players' input replays with
// the same hash after every step, and a snapshot re-simulates to the same end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { VirtualDevice, twoPlayerActions, ActionMap } from '@vrmxg/input';
import { worldHashes, captureWorld, restoreWorld, compareRuns } from '@vrmxg/snapshot';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { withTwoPlayers, TWO_PLAYER_ROUTE, routeKeys, HANA_AT } from '../../../../apps/playground/src/split.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const OK = fs.existsSync(PATHS.core);
const STEPS = 320, SNAP = 160;

test('the two-player map: player 1 on the keyboard\'s left and the mouse, player 2 on the arrows and the gamepad', () => {
  const m = new ActionMap(twoPlayerActions());
  const read = (keys, gamepad = null) => { const v = m.evaluate({ keys: new Set(keys), mouse: { dx: 0, dy: 0, wheel: 0, buttons: new Set() }, gamepad }); return Object.fromEntries([...m.axes.map((a, i) => [a, v.axes[i]]), ...m.buttons.map((b, i) => [b, v.buttons[i]])]); };
  const w = read(['KeyW']), up = read(['ArrowUp']);
  assert.equal(w.move_y, 1); assert.equal(w['p2.move_y'], 0);
  assert.equal(up.move_y, 0); assert.equal(up['p2.move_y'], 1);
  const pad = read([], { axes: [0, -1, 0.8, 0], buttons: [1, 0, 1] });
  assert.equal(pad['p2.move_y'], 1, 'the stick forward'); assert.ok(pad['p2.look_x'] > 0, 'the right stick looks');
  assert.equal(pad['p2.jump'], true); assert.equal(pad['p2.interact'], true); assert.equal(pad.jump, false);
  assert.ok(m.buttons.length <= 32, 'it fits a recording');
});

async function world() {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  sample.doc = withTwoPlayers(sample.doc);
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  return buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true, players: 2 });
}

async function live({ snapAt = null } = {}) {
  const W = await world(), tree = W.tree, dev = W.input.addDevice(new VirtualDevice());
  const mira = /** @type {any} */ (tree.find('mira')), hana = /** @type {any} */ (tree.find('hana-1'));
  const cam = /** @type {any} */ (tree.find('cam')), cam2 = /** @type {any} */ (tree.find('cam-2'));
  W.input.record();
  const run = [], seen = { hanaAir: 0, cam2Yaw: [], camYaw: [] };
  let held = new Set(), snap = null;
  const mira0 = mira.object3d.position.clone(), hana0 = hana.object3d.position.clone();
  for (let k = 0; k < STEPS; k++) {
    held = routeKeys(TWO_PLAYER_ROUTE, k, dev, held);
    // player 2's right stick, half right, for a second; then centred
    if (k === 260) dev.setGamepad([0, 0, 0.5, 0]); else if (k === 300) dev.setGamepad([0, 0, 0, 0]);
    if (k === 260) { seen.cam2Yaw.push(cam2.rig.yaw); seen.camYaw.push(cam.rig.yaw); }
    tree.step();
    if (!hana.ctrl.grounded) seen.hanaAir++;
    run.push({ step: tree.clock.step, h: worldHashes(tree, { physicsBytes: tree.clock.step % 60 === 0 }) });
    if (tree.clock.step === snapAt) snap = captureWorld(tree);
  }
  seen.cam2Yaw.push(cam2.rig.yaw); seen.camYaw.push(cam.rig.yaw);
  return { W, mira, hana, mira0, hana0, seen, run, snap, rec: W.input.stop() };
}

test('two players move two characters, each relative to their own camera; each camera takes its own player\'s look', { skip: !OK && 'needs vrmxa-avatar-studio' }, async () => {
  const { mira, hana, mira0, hana0, seen, W } = await live();
  const dm = mira.object3d.position.clone().sub(mira0), dh = hana.object3d.position.clone().sub(hana0);
  // both follow cameras look into the cafe (−z) behind their players: forward is −z, right +x
  assert.ok(dm.z < -1, `Mira walked forward (${dm.z.toFixed(2)} m along z)`);
  assert.ok(dh.z < -1, `Hana walked forward (${dh.z.toFixed(2)} m along z)`);
  assert.ok(dm.x < -2, `Mira ran left, on A (${dm.x.toFixed(2)} m along x)`);
  assert.ok(dh.x > 2, `Hana ran right, on the right arrow (${dh.x.toFixed(2)} m along x)`);
  assert.ok(seen.hanaAir > 10, `Hana jumped (${seen.hanaAir} steps in the air)`);
  assert.ok(Math.abs(seen.cam2Yaw[1] - seen.cam2Yaw[0]) > 0.3, `the right stick turned player 2's camera (${(seen.cam2Yaw[1] - seen.cam2Yaw[0]).toFixed(2)} rad)`);
  assert.equal(seen.camYaw[1], seen.camYaw[0], 'and not player 1\'s');
  assert.equal(W.tree.services.get('cameras').forPlayer(2).id, 'cam-2');
  void HANA_AT;
});

test('a recording of both players replays with the same hash after every step, and from a snapshot', { skip: !OK && 'needs vrmxa-avatar-studio' }, async () => {
  const A = await live({ snapAt: SNAP });
  assert.ok(A.rec.axes.includes('p2.move_x') && A.rec.buttons.includes('p2.jump'), 'the recording carries player 2\'s actions');
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
  assert.equal(compareRuns(A.run.slice(SNAP), rest), null, 'restored: the same to the end');
});
