// W2 (AB-T-0514): VRMXI items in the engine, on the specification's own fixtures and checker. Skips without
// VRMXA_Specification (with the VRMXI draft) and vrmxa-avatar-studio beside the repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion } from 'three';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { captureWorld, restoreWorld, recordRun, compareRuns } from '@vrmxg/snapshot';
import { installItems, readItem, ItemError } from '@vrmxg/item';
import { SPEC, fixture, expected, specChecker } from './fixtures.mjs';
import { available, vrmxaCore, read } from '../../character/test/fixtures.mjs';
import { installCharacters } from '@vrmxg/character';

installPortableMath();
const OK = SPEC && available('core');
const SKIP = OK ? false : 'needs VRMXA_Specification (fixtures-vrmxi/, tools/check) and vrmxa-avatar-studio beside this repository';
const R = OK ? await loadRapier() : null;
const core = OK ? await vrmxaCore() : null;
const check = OK ? await specChecker() : null;
const files = OK ? Object.fromEntries(Object.keys(expected().valid).map((k) => [k, fixture(k)])) : {};

// A kinematic body the test moves: from x 2, z 4 through the door's Reach (x within ±0.6) and back; not a character.
const PATH = (k) => (k < 30 ? 4 : k < 90 ? 4 - (3.6 * (k - 30)) / 60 : k < 150 ? 0.4 : 4);
class Walk extends Behaviour { physicsProcess() { this.node.object3d.position.z = PATH(this.tree.clock.step); } }

async function world(items, { seed = 1 } = {}) {
  const tree = new SceneTree({ registry: m0Registry(), behaviours: new Map([['walk', Walk]]), seed });
  installPhysics(tree, R);
  const lib = installItems(tree, { resolve: (ref) => files[ref], vrmxaCore: core, check, stubTextures: true });
  const doc = {
    format: 'vrmxs', version: 1, id: 'items',
    assets: Object.keys(files).map((k) => ({ id: k.replace(/\W/g, '_'), type: 'vrmxi', ref: k })),
    nodes: [{ id: 'floor', type: 'Collider', transform: { p: [0, -0.1, 0] }, props: { shape: 'box', size: [30, 0.2, 30] } }, ...items],
  };
  await lib.prepare(doc);
  tree.instantiate(doc);
  return { tree, lib, physics: tree.services.get('physics') };
}
const item = (id, file, extra = {}) => ({ id, type: 'Item', asset: file.replace(/\W/g, '_'), ...extra });

test('every valid fixture reads and checks clean; every invalid one is refused with the codes the specification names', { skip: SKIP }, async () => {
  const exp = expected();
  for (const k of Object.keys(exp.valid)) {
    const r = readItem(fixture(k), { vrmxaCore: core, check, where: k });
    assert.equal(r.manifest.format, 'vrmxi', k);
  }
  for (const [k, e] of Object.entries(exp.invalid)) {
    let err = null;
    try { readItem(fixture(k), { vrmxaCore: core, check, where: k }); } catch (x) { err = x; }
    assert.ok(err instanceof ItemError, `${k} is refused (${e.rule})`);
    const codes = new Set(err.problems.map((p) => p.code));
    for (const c of e.spec) assert.ok([...codes].some((x) => x === c || x.startsWith(`${c}`)), `${k}: ${c} named (got ${[...codes].join(', ')})`);
    assert.match(err.message, new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the message names the file');
  }
});

test('every M1 type instantiates as an Item node with its bodies, colliders, sensors and joints', { skip: SKIP }, async () => {
  const { tree, physics } = await world([
    item('door', 'items/door.vrmxi', { transform: { p: [0, 0, 0] } }),
    item('chest', 'items/chest.vrmxi', { transform: { p: [4, 0, 0] } }),
    item('sword', 'items/sword-pickup.vrmxi', { transform: { p: [8, 0.9, 0] } }),
    item('key', 'items/key-pickup.vrmxi', { transform: { p: [8, 0.9, 2] } }),
    item('switch', 'items/switch.vrmxi', { transform: { p: [12, 0, 0] } }),
    item('stool', 'items/stool.vrmxi', { transform: { p: [16, 0, 0] } }),
    item('spawn', 'items/spawn.vrmxi', { transform: { p: [20, 0, 0] } }),
  ]);
  tree.run(5);
  const door = tree.find('door');
  assert.equal(door.current, 'closed', 'starts in its first state');
  assert.deepEqual(door.offered().map((v) => v.prompt), ['Open']);
  assert.equal(door.jointHandles.size, 1);
  assert.ok(door.sensorHandles.has('Reach'));
  assert.equal(tree.find('chest').parts.get('Lid pivot')?.proxy.bodyType, 'kinematic');
  assert.ok(tree.find('stool').seatPoints()[0].node, 'the seat point is a model node');
  assert.ok(tree.find('spawn').spawnPoint(), 'the spawn point is a model node');
  const sword = tree.find('sword');
  assert.equal(sword.manifest.takeable, true);
  assert.equal(await core.sha256(sword.wearableBytes()), sword.manifest.wearable.sha256, 'the embedded wearable, byte for byte');
  assert.equal(tree.find('key').wearableBytes(), null, 'a key that can\'t be taken carries none');
  assert.equal(physics.raycast([0, 1, 3], [0, 0, -1], 5)?.node, 'door', 'a ray hits the door, and names the item');
});

test('the door opens and closes from its verbs; the hinge moves the leaf; locked offers nothing', { skip: SKIP }, async () => {
  const { tree } = await world([item('door', 'items/door.vrmxi'), item('locked', 'items/door.vrmxi', { transform: { p: [5, 0, 0] }, props: { state: 'locked' } })]);
  const door = tree.find('door'), log = [];
  door.on('stateChanged', (e) => log.push(`${e.from}->${e.to}`));
  door.on('verb', (e) => log.push(`verb ${e.verb}`));
  tree.run(10);
  const leaf = door.part('Leaf'), q0 = leaf.quaternion.clone();
  const r = door.perform({ verb: 'open', by: 'mira' });
  assert.deepEqual(r, { verb: 'open', to: 'open', slot: 'use', prompt: 'Open' });
  tree.run(180);
  const angle = 2 * Math.acos(Math.min(1, Math.abs(leaf.quaternion.dot(q0))));
  assert.ok(Math.abs(angle - 1.6) < 0.1, `the leaf swung to the open state's target (${angle.toFixed(3)} rad)`);
  assert.deepEqual(door.offered().map((v) => v.prompt), ['Close']);
  door.perform({ verb: 'open' });
  tree.run(180);
  assert.ok(2 * Math.acos(Math.min(1, Math.abs(leaf.quaternion.dot(q0)))) < 0.05, 'and closed again');
  assert.deepEqual(log, ['verb open', 'closed->open', 'verb open', 'open->closed']);
  const locked = tree.find('locked');
  assert.equal(locked.current, 'locked');
  assert.equal(locked.perform({ verb: 'open' }), null, 'a locked door offers nothing');
  locked.enterState({ state: 'closed' });
  assert.equal(locked.perform({ verb: 'open' })?.to, 'open', 'the game unlocks it by setting its state');
});

test('the chest\'s lid and the switch\'s lever move by their own animations, kinematic bodies following; shown meshes follow state', { skip: SKIP }, async () => {
  const { tree, physics } = await world([item('chest', 'items/chest.vrmxi'), item('switch', 'items/switch.vrmxi', { transform: { p: [3, 0, 0] } })]);
  tree.run(2);
  const chest = tree.find('chest'), lid = chest.parts.get('Lid pivot').proxy;
  const before = physics.world.bodyPose(lid.body).q;
  chest.perform({ verb: 'open' });
  tree.run(90);
  const after = physics.world.bodyPose(lid.body).q;
  assert.ok(new Quaternion(...before).angleTo(new Quaternion(...after)) > 0.5, 'the kinematic lid turned in physics with its animation');
  const sw = tree.find('switch');
  const shownIn = (st) => sw.states.find((s) => s.name === st).show ?? [];
  const lit = shownIn('on')[0];
  assert.equal(sw.part(lit).visible, false, `${lit} hidden while off`);
  sw.perform({ verb: 'use' });
  tree.run(30);
  assert.equal(sw.current, 'on');
  assert.equal(sw.part(lit).visible, true, `${lit} shown when on`);
});

test('a sensor reports a character entering and leaving by its name; other bodies and the item\'s own parts don\'t count', { skip: SKIP || (available('spec') ? false : 'needs spec.vrm') }, async () => {
  const tree = new SceneTree({ registry: m0Registry(), behaviours: new Map([['walk', Walk]]) });
  installPhysics(tree, R);
  const lib = installItems(tree, { resolve: (ref) => files[ref], vrmxaCore: core, check, stubTextures: true });
  const chars = installCharacters(tree, { resolve: () => read('spec'), stubTextures: true });
  const doc = {
    format: 'vrmxs', version: 1, id: 'sense', assets: [{ id: 'door', type: 'vrmxi', ref: 'items/door.vrmxi' }, { id: 'spec', type: 'vrm', ref: 'spec.vrm' }],
    nodes: [
      { id: 'floor', type: 'Collider', transform: { p: [0, -0.1, 0] }, props: { shape: 'box', size: [30, 0.2, 30] } },
      { id: 'door', type: 'Item', asset: 'door' },
      { id: 'mira', type: 'Character', asset: 'spec', transform: { p: [0, 0, 4], q: [0, 1, 0, 0] } },
      { id: 'walker', type: 'RigidBody', transform: { p: [2, 0.9, 4] }, props: { bodyType: 'kinematic' }, behaviours: [{ use: 'walk' }] },
      { id: 'walker-shape', type: 'Collider', parent: 'walker', props: { shape: 'capsule', radius: 0.3, height: 1.6 } },
    ],
  };
  await lib.prepare(doc); await chars.prepare(doc);
  tree.instantiate(doc);
  const log = [], door = tree.find('door'), mira = tree.find('mira');
  door.on('entered', (e) => log.push(`entered ${e.sensor} ${e.body}`));
  door.on('exited', (e) => log.push(`exited ${e.sensor} ${e.body}`));
  door.perform({ verb: 'open' }); // the leaf swings through its own Reach: not reported
  for (let k = 0; k < 240; k++) { mira.input.move = k < 150 ? [0, -1.4] : [0, 1.4]; tree.step(); } // in, then back out
  assert.deepEqual(log, ['entered Reach mira', 'exited Reach mira'], 'only the character, once in and once out');
});

test('item state is in the world snapshot: a door snapshotted mid-swing restores and re-simulates bit for bit', { skip: SKIP }, async () => {
  const items = [item('door', 'items/door.vrmxi'), item('chest', 'items/chest.vrmxi', { transform: { p: [4, 0, 0] } }), item('switch', 'items/switch.vrmxi', { transform: { p: [8, 0, 0] } })];
  const A = await world(items);
  A.tree.run(10);
  A.tree.find('door').perform({ verb: 'open' });
  A.tree.find('chest').perform({ verb: 'open' });
  A.tree.find('switch').perform({ verb: 'use' });
  A.tree.run(20); // mid-swing, mid-animation
  const snap = captureWorld(A.tree);
  const rest = recordRun(A.tree, 120, { physicsBytesEvery: 30 });
  const B = await world(items);
  restoreWorld(B.tree, snap);
  assert.equal(B.tree.find('door').current, 'open');
  assert.equal(compareRuns(rest, recordRun(B.tree, 120, { physicsBytesEvery: 30 })), null);
  // and two fresh runs agree
  const C = await world(items), D = await world(items);
  for (const w of [C, D]) { w.tree.run(10); w.tree.find('door').perform({ verb: 'open' }); }
  assert.equal(compareRuns(recordRun(C.tree, 120), recordRun(D.tree, 120)), null);
});
