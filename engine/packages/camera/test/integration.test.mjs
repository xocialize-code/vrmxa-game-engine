// Input + cameras + characters together (W4 acceptance): 10 s of keyboard and gamepad drive Mira through
// the player controller, camera-relative to a follow camera the mouse turns; replaying the recording gives
// the identical end state. Skips without VRMXA_Specification and vrmxa-avatar-studio beside the repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installCharacters } from '@vrmxg/character';
import { installInput, VirtualDevice } from '@vrmxg/input';
import { installCameras, MeshPicker, pickPhysics } from '@vrmxg/camera';
import { available, read, vrmxaCore, testAnimations } from '../../character/test/fixtures.mjs';

installPortableMath();
const OK = available('spec', 'core', 'coreAnim', 'full');
const SKIP = OK ? false : 'needs VRMXA_Specification/assets/spec/spec.vrm and vrmxa-avatar-studio beside this repository';
const R = OK ? await loadRapier() : null;
const core = OK ? await vrmxaCore() : null;
const anims = OK ? await testAnimations(core) : null;

const doc = {
  format: 'vrmxs', version: 1, id: 'play',
  assets: [{ id: 'mira', type: 'vrmxa', ref: 'characters/full.vrmxa' }],
  nodes: [
    { id: 'floor', type: 'Collider', transform: { p: [0, -0.1, 0] }, props: { shape: 'box', size: [60, 0.2, 60] } },
    { id: 'wall', type: 'Collider', transform: { p: [0, 1.5, 6] }, props: { shape: 'box', size: [10, 3, 0.3] } },
    { id: 'mira', type: 'Character', asset: 'mira', behaviours: [{ use: 'player' }] },
    { id: 'cam', type: 'Camera', props: { preset: 'follow', target: 'mira', focalLength: 35 } },
  ],
};

async function setup() {
  const tree = new SceneTree({ registry: m0Registry(), seed: 11 });
  const input = installInput(tree);
  const physics = installPhysics(tree, R);
  const lib = installCharacters(tree, { resolve: () => read('full'), vrmxaCore: core, stubTextures: true });
  installCameras(tree);
  lib.setAnimations('characters/full.vrmxa', anims);
  await lib.prepare(doc);
  tree.instantiate(doc);
  return { tree, input, physics, mira: tree.find('mira'), cam: tree.find('cam') };
}

// Keyboard and gamepad changing over 10 s: walk, run, turn the camera with the mouse, jump, strafe on
// the stick, switch camera preset.
function drive(dev, k) {
  if (k === 20) dev.press('KeyW');
  if (k === 80) dev.press('ShiftLeft');
  if (k >= 100 && k < 160) dev.moveMouse(6, k % 3);
  if (k === 170) dev.press('Space');
  if (k === 172) dev.release('Space');
  if (k === 240) { dev.release('KeyW'); dev.release('ShiftLeft'); dev.setGamepad([0.8, -0.5, 0, 0]); }
  if (k === 330) { const b = new Array(17).fill(0); b[0] = 1; dev.setGamepad([0.8, -0.5, 0.4, 0], b); }
  if (k === 332) dev.setGamepad([0.8, -0.5, 0.4, 0]);
  if (k === 400) dev.press('KeyC');
  if (k === 402) dev.release('KeyC');
  if (k === 450) dev.setGamepad([0, 0, 0, 0]);
  if (k === 480) dev.press('KeyA');
  if (k === 560) dev.release('KeyA');
}

const hash = (o) => { const s = JSON.stringify(o, (k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v)); let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };

test('10 s of keyboard + gamepad drive the character; replaying the recording reaches the identical end state', { skip: SKIP }, async () => {
  const A = await setup();
  const dev = A.input.addDevice(new VirtualDevice());
  A.input.record();
  let maxY = 0, presets = new Set();
  for (let k = 0; k < 600; k++) { drive(dev, k); A.tree.step(); maxY = Math.max(maxY, A.mira.object3d.position.y); presets.add(A.cam.preset); }
  const rec = A.input.stop();
  const end = { mira: hash(A.mira.getState()), cam: hash(A.cam.getState()) };
  const p = A.mira.object3d.position;
  assert.ok(Math.hypot(p.x, p.z) > 5, `she went somewhere (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  assert.ok(p.z < 5.85 - 0.25, 'the wall stopped her');
  assert.ok(maxY > 0.6, `she jumped (${maxY.toFixed(2)} m)`);
  assert.deepEqual([...presets], ['follow', 'overShoulder'], 'camera_next switched the preset mid-run');

  const B = await setup();
  B.input.replay(JSON.parse(JSON.stringify(rec)));
  for (let k = 0; k < 600; k++) B.tree.step();
  assert.deepEqual({ mira: hash(B.mira.getState()), cam: hash(B.cam.getState()) }, end);
});

test('clicking: the mesh picker hits the skinned character, the physics ray the floor', { skip: SKIP }, async () => {
  const { tree, physics, mira, cam } = await setup();
  tree.run(30);
  const picker = new MeshPicker();
  const hit = picker.pick(cam, 0, 0.1, [mira]);
  assert.equal(hit?.node, 'mira', 'screen centre: Mira\'s skinned mesh');
  assert.equal(picker.pick(cam, 0.9, 0.9, [mira]), null, 'a corner: not her');
  assert.equal(pickPhysics(physics, cam, 0.9, -0.95)?.node, 'floor');
});
