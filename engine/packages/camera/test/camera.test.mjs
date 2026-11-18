import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Bone, Skeleton, SkinnedMesh, MeshBasicMaterial, Float32BufferAttribute, Uint16BufferAttribute, Vector3 } from 'three';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree, Node } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installInput, VirtualDevice } from '@vrmxg/input';
import { installCameras, verticalFov, thinLens, pickPhysics, MeshPicker, PRESETS } from '@vrmxg/camera';

installPortableMath();
const R = await loadRapier();
const reg = m0Registry();

const scene = (extra = []) => ({
  format: 'vrmxs', version: 1, id: 'cams', nodes: [
    { id: 'floor', type: 'Collider', transform: { p: [0, -0.1, 0] }, props: { shape: 'box', size: [40, 0.2, 40] } },
    { id: 'avatar', type: 'RigidBody', transform: { p: [0, 0, 0] }, props: { bodyType: 'kinematic' } },
    { id: 'avatar-shape', type: 'Collider', parent: 'avatar', transform: { p: [0, 0.9, 0] }, props: { shape: 'capsule', radius: 0.3, height: 1.8 } },
    { id: 'cam', type: 'Camera', transform: { p: [5, 3, 5] }, props: { preset: 'free', target: 'avatar', focalLength: 35 } },
    ...extra,
  ],
});

function setup(doc = scene()) {
  const tree = new SceneTree({ registry: reg });
  const physics = installPhysics(tree, R);
  const input = installInput(tree);
  const cameras = installCameras(tree);
  tree.instantiate(doc);
  return { tree, physics, input, cameras, cam: tree.find('cam'), avatar: tree.find('avatar') };
}
const pos = (n) => n.object3d.getWorldPosition(new Vector3());
const viewDir = (cam) => { cam.object3d.updateWorldMatrix(true, false); const e = cam.object3d.matrixWorld.elements; return new Vector3(-e[8], -e[9], -e[10]); };

test('the lens: field of view from focal length and sensor, thin-lens depth of field', () => {
  const fov50 = verticalFov(50, 'super35', 16 / 9);
  assert.ok(Math.abs(fov50 - (2 * Math.atan(24.89 / (16 / 9) / 100) * 180) / Math.PI) < 1e-12, 'width-fit at 16:9');
  assert.ok(verticalFov(85) < fov50 && verticalFov(24) > fov50);
  assert.ok(Math.abs(verticalFov(50, 'super35', 1) - (2 * Math.atan(18.66 / 100) * 180) / Math.PI) < 1e-12, 'height-fit when the output is narrower');
  const d = thinLens({ focalMm: 50, focusM: 4, fStop: 1.8 });
  assert.ok(d.near < 4 && d.far > 4 && d.far - d.near < 1, `shallow at f/1.8: ${d.near.toFixed(2)}–${d.far.toFixed(2)} m`);
  assert.equal(d.cocAt(4), 0, 'in focus at the focus distance');
  assert.ok(thinLens({ focalMm: 50, focusM: 4, fStop: 11 }).far - thinLens({ focalMm: 50, focusM: 4, fStop: 11 }).near > 1.5);
  const { cam } = setup();
  assert.ok(Math.abs(cam.camera.fov - verticalFov(35)) < 1e-12, 'the Camera node applies its lens');
});

test('every preset can be switched to at run time and places the camera as it should', () => {
  const { tree, cam, avatar } = setup();
  const start = pos(cam).toArray();
  tree.run(5);
  assert.deepEqual(pos(cam).toArray(), start, 'free: stays');
  const head = new Vector3(0, 1.5, 0);
  const results = {};
  for (const preset of PRESETS) {
    cam.call('setPreset', { preset });
    tree.run(30);
    const p = pos(cam), d = viewDir(cam);
    results[preset] = { p, d };
  }
  assert.equal(cam.preset, 'firstPerson');
  // fixed: where it was left, looking at the target's head height
  assert.ok(results.fixed.d.angleTo(head.clone().sub(results.fixed.p)) < 1e-6, 'fixed looks at its target');
  // orbit: 4 m from the pivot
  assert.ok(Math.abs(results.orbit.p.distanceTo(head) - 4) < 1e-6, `orbit at 4 m (${results.orbit.p.distanceTo(head).toFixed(3)})`);
  // follow: 3.2 m behind the pivot (1.5 m up), looking at it
  const followPivot = new Vector3(0, 1.5, 0);
  assert.ok(Math.abs(results.follow.p.distanceTo(followPivot) - 3.2) < 1e-6);
  // overShoulder: shorter, and offset to the camera's right
  const right = new Vector3().crossVectors(results.overShoulder.d, new Vector3(0, 1, 0)).normalize();
  const osPivot = new Vector3(0, 1.55, 0).addScaledVector(right, 0.45);
  assert.ok(Math.abs(results.overShoulder.p.distanceTo(osPivot) - 1.6) < 1e-6, 'over the shoulder: 1.6 m from a pivot 0.45 m right');
  // firstPerson: at the eyes (no VRM: 1.5 m above the origin)
  assert.ok(results.firstPerson.p.distanceTo(head) < 1e-9);
  cam.call('nextPreset');
  assert.equal(cam.preset, 'free', 'nextPreset cycles');
  assert.ok(avatar);
});

test('the spring arm pulls in against a wall and eases back out', () => {
  const doc = scene([{ id: 'wall', type: 'Collider', transform: { p: [0, 1.5, -1.5] }, props: { shape: 'box', size: [4, 3, 0.2] } }]);
  const { tree, cam } = setup(doc);
  cam.call('setPreset', { preset: 'follow' }); // yaw carried over from the free camera's view
  cam.rig.yaw = 0;                              // look along +Z: the camera sits behind, at -Z, past the wall
  tree.run(2);
  const pivot = new Vector3(0, 1.5, 0);
  const pulled = pos(cam).distanceTo(pivot);
  // the boom tilts with the rig's pitch: it meets the wall's face (z = -1.4) at 1.4 / cos(pitch), less the 0.2 m margin
  const expected = 1.4 / Math.cos(cam.rig.pitch) - 0.2;
  assert.ok(Math.abs(pulled - expected) < 1e-4, `pulled in to ${pulled.toFixed(4)} m (expected ${expected.toFixed(4)})`);
  tree.remove('wall');
  tree.step();
  const after1 = pos(cam).distanceTo(pivot);
  assert.ok(Math.abs(after1 - (pulled + 4 / 60)) < 1e-6, 'eases out at 4 m/s, not at once');
  tree.run(60);
  assert.ok(Math.abs(pos(cam).distanceTo(pivot) - 3.2) < 1e-6, 'back to the full 3.2 m');
});

test('look input turns the current camera only; camera_next cycles its preset', () => {
  const doc = scene([{ id: 'cam2', type: 'Camera', props: { preset: 'orbit', target: 'avatar' } }]);
  const { tree, input, cameras, cam } = setup(doc);
  const dev = input.addDevice(new VirtualDevice());
  cam.call('setPreset', { preset: 'orbit' });
  assert.equal(cameras.current, cam);
  const yaw0 = cam.rig.yaw, other0 = tree.find('cam2').rig.yaw;
  dev.moveMouse(100, 0);
  tree.step();
  assert.ok(Math.abs(cam.rig.yaw - (yaw0 - 0.25)) < 1e-12, 'mouse dx 100 × 0.0025 turns it right by 0.25 rad');
  assert.equal(tree.find('cam2').rig.yaw, other0, 'the other camera ignores look input');
  dev.press('KeyC'); tree.step(); dev.release('KeyC'); tree.step();
  assert.equal(cam.preset, 'follow', 'camera_next: orbit → follow');
  tree.find('cam2').call('makeCurrent');
  assert.equal(cameras.current.id, 'cam2');
});

test('picking: the physics ray finds the floor and the avatar', () => {
  const { tree, physics, cam } = setup();
  cam.call('setPreset', { preset: 'follow' });
  tree.run(5);
  assert.equal(pickPhysics(physics, cam, 0, 0)?.node, 'avatar', 'screen centre: the target');
  assert.equal(pickPhysics(physics, cam, 0.9, -0.95)?.node, 'floor', 'bottom corner of the screen: the floor');
  assert.equal(pickPhysics(physics, cam, 0, 0.95), null, 'top of the screen: sky');
});

test('mesh picking through three-mesh-bvh hits a skinned mesh where its pose puts it, not its rest shape', () => {
  // A 2 m tall box skinned to two bones; the upper bone bends 90° so the top half sticks out along +X.
  const geo = new BoxGeometry(0.2, 2, 0.2, 1, 8, 1);
  geo.translate(0, 1, 0);
  const pos = geo.attributes.position, idx = [], w = [];
  for (let i = 0; i < pos.count; i++) { const up = pos.getY(i) > 1; idx.push(up ? 1 : 0, 0, 0, 0); w.push(1, 0, 0, 0); }
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new Float32BufferAttribute(w, 4));
  const root = new Bone(), upper = new Bone();
  upper.position.y = 1; root.add(upper);
  const mesh = new SkinnedMesh(geo, new MeshBasicMaterial());
  mesh.add(root); mesh.bind(new Skeleton([root, upper]));
  upper.quaternion.set(0, 0, -Math.SQRT1_2, Math.SQRT1_2); // bend: +Y becomes +X
  class Bent extends Node { enterTree() { this.object3d.add(mesh); } }
  const tree = new SceneTree({ registry: reg, classes: new Map([['Bent', Bent]]) });
  installCameras(tree);
  tree.instantiate({ format: 'vrmxs', version: 1, id: 'm', nodes: [{ id: 'thing', type: 'Bent' }, { id: 'cam', type: 'Camera', transform: { p: [0.6, 1, 5] } }] });
  const picker = new MeshPicker();
  const cam = tree.find('cam');
  const hitBent = picker.pick(cam, 0, 0, [tree.find('thing')]);
  assert.equal(hitBent?.node, 'thing', 'the bent upper half is at x 0.6');
  cam.object3d.position.set(0, 1.8, 5); // where the rest shape's top would be: nothing there now
  assert.equal(picker.pick(cam, 0, 0, [tree.find('thing')]), null);
  upper.quaternion.set(0, 0, 0, 1);   // straighten it: the same picker re-bakes the pose
  assert.equal(picker.pick(cam, 0, 0, [tree.find('thing')])?.node, 'thing');
});
