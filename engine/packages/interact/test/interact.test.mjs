// W3 (AB-T-0515): interaction with VRMXI items, a real character (spec.vrm) driven through the action map, the
// specification's item fixtures. Skips without VRMXA_Specification (with the VRMXI draft) and vrmxa-avatar-studio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installInput, VirtualDevice } from '@vrmxg/input';
import { installCharacters } from '@vrmxg/character';
import { installItems } from '@vrmxg/item';
import { installInteraction } from '@vrmxg/interact';
import { captureWorld, restoreWorld, recordRun, compareRuns } from '@vrmxg/snapshot';
import { SPEC, fixture, specChecker } from '../../item/test/fixtures.mjs';
import { available, vrmxaCore, read, testAnimations } from '../../character/test/fixtures.mjs';

installPortableMath();
const OK = SPEC && available('core', 'coreAnim', 'spec');
const SKIP = OK ? false : 'needs VRMXA_Specification (fixtures-vrmxi/), spec.vrm and vrmxa-avatar-studio beside this repository';
const R = OK ? await loadRapier() : null;
const core = OK ? await vrmxaCore() : null;
const check = OK ? await specChecker() : null;
const anims = OK ? await testAnimations(core, { actions: true }) : null;
const files = OK ? Object.fromEntries(['items/door.vrmxi', 'items/stool.vrmxi', 'items/key-pickup.vrmxi', 'items/switch.vrmxi'].map((k) => [k, fixture(k)])) : {};

// Mira at the origin facing +Z (the player controller with no camera walks along +Z on W). The door 2.5 m ahead, a
// stool to her right, a key on the floor to her left, a switch behind.
const scene = () => ({
  format: 'vrmxs', version: 1, id: 'interact',
  assets: [{ id: 'door', type: 'vrmxi', ref: 'items/door.vrmxi' }, { id: 'stool', type: 'vrmxi', ref: 'items/stool.vrmxi' }, { id: 'key', type: 'vrmxi', ref: 'items/key-pickup.vrmxi' }, { id: 'switch', type: 'vrmxi', ref: 'items/switch.vrmxi' }, { id: 'mira', type: 'vrm', ref: 'spec.vrm' }],
  nodes: [
    { id: 'floor', type: 'Collider', transform: { p: [0, -0.1, 0] }, props: { shape: 'box', size: [30, 0.2, 30] } },
    { id: 'door', type: 'Item', asset: 'door', transform: { p: [0, 0, 2.5], q: [0, 1, 0, 0] } },
    { id: 'stool', type: 'Item', asset: 'stool', transform: { p: [4, 0, 0] } },
    { id: 'key', type: 'Item', asset: 'key', transform: { p: [-4, 0, 0] } },
    { id: 'switch', type: 'Item', asset: 'switch', transform: { p: [0, 0, -4] } },
    { id: 'mira', type: 'Character', asset: 'mira', behaviours: [{ use: 'player' }] },
  ],
});

async function world() {
  const tree = new SceneTree({ registry: m0Registry(), seed: 4 });
  const input = installInput(tree);
  installPhysics(tree, R);
  const items = installItems(tree, { resolve: (ref) => files[ref], vrmxaCore: core, check, stubTextures: true });
  const chars = installCharacters(tree, { resolve: () => read('spec'), stubTextures: true });
  chars.setAnimations('spec.vrm', anims);
  const { interact, inventory } = installInteraction(tree);
  const doc = scene();
  await items.prepare(doc); await chars.prepare(doc);
  tree.instantiate(doc);
  return { tree, input, interact, inventory, dev: input.addDevice(new VirtualDevice()), mira: tree.find('mira') };
}
const tap = (w, key) => { w.dev.press(key); w.tree.step(); w.dev.release(key); w.tree.step(); };
// a sensor's overlap updates in the physics step; the service reads it at the start of the next: three steps after a move
const face = (w, x, z, yaw) => { w.mira.placeAt(x, 0, z, yaw); w.tree.run(3); };

test('walking up to the door focuses it, the prompt names the verb, and interact opens it with the use slot', { skip: SKIP }, async () => {
  const w = await world();
  const seen = [];
  w.mira.on('focusChanged', (f) => seen.push(f.prompt));
  w.tree.run(10);
  assert.deepEqual(w.interact.prompts(), [], 'nothing in reach at the start');
  w.dev.press('KeyW');
  for (let k = 0; k < 120 && !w.interact.prompts().length; k++) w.tree.step();
  w.dev.release('KeyW');
  assert.deepEqual(w.interact.prompts().map((p) => [p.item, p.verb, p.prompt]), [['door', 'open', 'Open']]);
  const log = [];
  w.tree.find('door').on('stateChanged', (e) => log.push(e.to));
  w.mira.on('interacted', (e) => log.push(`${e.verb} ${e.item}`));
  tap(w, 'KeyE');
  assert.deepEqual(log, ['open', 'open door']);
  assert.equal(w.mira.graph.state, 'use', 'the use slot plays');
  w.dev.press('KeyW'); w.tree.run(10);
  assert.ok(w.mira.object3d.position.z < 1.5, 'no walking while the action plays');
  w.tree.run(60); w.dev.release('KeyW');
  assert.deepEqual(seen.slice(0, 1), ['Open']);
});

test('sitting puts the character on the seat point with sit then sitIdle; moving stands it up at the exit, control back', { skip: SKIP }, async () => {
  const w = await world();
  face(w, 3.2, 0, Math.PI / 2); // just left of the stool, facing it (+X)
  assert.deepEqual(w.interact.prompts().map((p) => p.verb), ['sit']);
  tap(w, 'KeyE');
  const seat = w.tree.find('stool').seatPoints()[0].node.getWorldPosition(w.mira.object3d.position.clone());
  const p = w.mira.object3d.position;
  assert.ok(Math.hypot(p.x - seat.x, p.z - seat.z) < 1e-3 && Math.abs(p.y - (seat.y - 0.5)) < 1e-3, `feet under the seat point, hips on it (following the stool as it settles): ${p.toArray()} vs ${seat.toArray()}`);
  assert.equal(w.mira.graph.state, 'sit');
  w.tree.run(60);
  assert.equal(w.mira.graph.state, 'sitIdle', 'settles into sitIdle');
  assert.ok(w.mira.ctrl.seat);
  w.dev.press('KeyW'); w.tree.step(); w.dev.release('KeyW'); w.tree.step();
  assert.equal(w.mira.ctrl.seat, null, 'moving stands her up');
  assert.equal(w.mira.graph.state, 'stand');
  const exit = w.tree.find('stool').seatPoints()[0].exit.getWorldPosition(w.mira.object3d.position.clone());
  assert.ok(Math.hypot(w.mira.object3d.position.x - exit.x, w.mira.object3d.position.z - exit.z) < 0.05, 'at the exit point');
  w.tree.run(60);
  const before = w.mira.object3d.position.clone();
  w.dev.press('KeyW'); w.tree.run(30); w.dev.release('KeyW');
  assert.ok(w.mira.object3d.position.distanceTo(before) > 0.3, 'and she walks again');
});

test('taking a key that isn\'t takeable puts it in the inventory and removes it from the world', { skip: SKIP }, async () => {
  const w = await world();
  face(w, -3.2, 0, -Math.PI / 2);
  assert.deepEqual(w.interact.prompts().map((p) => p.verb), ['take']);
  tap(w, 'KeyE');
  assert.equal(w.tree.find('key'), null, 'gone from the scene');
  assert.deepEqual(w.inventory.list('mira').map((e) => e.type), ['pickup']);
  assert.equal(w.mira.graph.state, 'take', 'the take slot plays (the equip clip until VRMXA has take)');
});

test('a run with interactions is identical twice, and restores from a snapshot taken while seated and after a take', { skip: SKIP }, async () => {
  const script = (w) => (step) => {
    if (step === 5) w.mira.placeAt(-3.2, 0, 0, -Math.PI / 2);
    if (step === 10) w.dev.press('KeyE'); if (step === 12) w.dev.release('KeyE');            // take the key
    if (step === 80) w.mira.placeAt(3.2, 0, 0, Math.PI / 2);
    if (step === 85) w.dev.press('KeyE'); if (step === 87) w.dev.release('KeyE');            // sit
    if (step === 200) w.dev.press('KeyD'); if (step === 202) w.dev.release('KeyD');          // stand up
    if (step === 260) w.mira.placeAt(0, 0, 1.6, 0);
    if (step === 265) w.dev.press('KeyE'); if (step === 267) w.dev.release('KeyE');          // open the door
  };
  const A = await world(), B = await world();
  const ra = recordRun(A.tree, 360, { onStep: script(A) }), rb = recordRun(B.tree, 360, { onStep: script(B) });
  assert.equal(compareRuns(ra, rb), null);
  assert.equal(A.tree.find('door').current, 'open');
  // snapshot at 150: key taken, seated
  const C = await world();
  recordRun(C.tree, 150, { onStep: script(C) });
  assert.ok(C.mira.ctrl.seat);
  const snap = captureWorld(C.tree);
  const rest = recordRun(C.tree, 210, { onStep: script(C) });
  const D = await world();
  restoreWorld(D.tree, snap);
  assert.equal(D.tree.find('key'), null, 'the taken key stays taken');
  assert.equal(compareRuns(rest, recordRun(D.tree, 210, { onStep: script(D) })), null);
});

