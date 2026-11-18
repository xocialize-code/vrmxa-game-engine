// W5 (AB-T-0506) in Node, with a stand-in renderer that does what WebGLRenderer does to the scene graph
// (updateMatrixWorld, then reads it), so it runs on CI. Real WebGL runs in demo/ (Chromium, WKWebView).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Vector3 } from 'three';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { parse } from '@vrmxg/scene';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installInput, VirtualDevice } from '@vrmxg/input';
import { installCameras } from '@vrmxg/camera';
import { worldHashes } from '@vrmxg/snapshot';
import { RenderHost, SHADOW_PRESETS } from '@vrmxg/render';

installPortableMath();
const R = await loadRapier();
const reg = m0Registry();
const read = (p) => parse(fs.readFileSync(new URL(`../../core/test/fixtures/${p}`, import.meta.url), 'utf8'));
const prefabs = new Map(['prefabs/door.vrmxs', 'prefabs/double-door.vrmxs'].map((p) => [p, read(p)]));

class FakeRenderer {
  constructor() { this.frames = 0; this.shadowMap = { enabled: false }; this.toneMapping = 0; this.toneMappingExposure = 1; this.onRender = null; }
  setPixelRatio() {} setSize() {} dispose() {}
  render(scene, camera) { scene.updateMatrixWorld(); camera.updateMatrixWorld?.(); this.frames++; this.onRender?.(scene, camera); }
}

// The walker strides along +X at 3 m/s while D is held; a timer blinks a prop; the doors swing.
class Walker extends Behaviour {
  ready() { this.node.after(0.5, () => { this.node.props.lit = !this.node.props.lit; }, { repeat: true }); }
  physicsProcess(dt) { const i = this.tree.services.get('input'); this.node.object3d.position.x += i.axis('move_x') * 3 * dt; this.node.object3d.position.z -= i.axis('move_y') * 3 * dt; }
}
const scene = (extra = []) => ({
  format: 'vrmxs', version: 1, id: 'w5',
  assets: [{ id: 'door', type: 'vrmxs', ref: 'prefabs/door.vrmxs' }, { id: 'double', type: 'vrmxs', ref: 'prefabs/double-door.vrmxs' }],
  nodes: [
    { id: 'root', type: 'Node3D' },
    { id: 'env', type: 'Environment', parent: 'root', props: { fog: 'linear', fogNear: 5, fogFar: 40, toneMapping: 'agx', exposure: 1.2, ground: true, background: 'gradient' } },
    { id: 'sun', type: 'DirectionalLight', parent: 'root', transform: { q: [-0.383, 0, 0, 0.924] }, props: { intensity: 2.5, shadowPreset: 'high', shadowUpdate: 'once', shadowExtent: 6 } },
    { id: 'lamp', type: 'SpotLight', parent: 'root', transform: { p: [0, 3, 0] }, props: { angle: 25, castShadow: true, shadowPreset: 'low' } },
    { id: 'bulb', type: 'PointLight', parent: 'root', transform: { p: [2, 2, 2] } },
    { id: 'floor', type: 'Collider', parent: 'root', transform: { p: [0, -0.1, 0] }, props: { shape: 'box', size: [30, 0.2, 30] } },
    { id: 'entrance', type: 'Instance', parent: 'root', asset: 'double', transform: { p: [0, 0, 6] } },
    { id: 'walker', type: 'RigidBody', parent: 'root', transform: { p: [-0.5, 0.9, 3] }, props: { bodyType: 'kinematic' }, behaviours: [{ use: 'walker' }] },
    { id: 'walker-shape', type: 'Collider', parent: 'walker', props: { shape: 'capsule', radius: 0.3, height: 1.2 } },
    { id: 'cam', type: 'Camera', parent: 'root', props: { preset: 'follow', target: 'walker' } },
    ...extra,
  ],
});

function world(doc = scene()) {
  const tree = new SceneTree({ registry: reg, prefabs, behaviours: new Map([['walker', Walker]]), seed: 3 });
  const input = installInput(tree);
  installPhysics(tree, R);
  installCameras(tree);
  tree.instantiate(doc);
  return { tree, input, dev: input.addDevice(new VirtualDevice()) };
}
// 10 s: walk into the entrance trigger and back, sidestep, turn the camera.
const drive = (dev, k) => {
  if (k === 10) dev.press('KeyS'); if (k === 150) dev.release('KeyS');
  if (k === 200) dev.press('KeyD'); if (k === 260) dev.release('KeyD');
  if (k >= 270 && k < 330) dev.moveMouse(5, 0);
  if (k === 340) dev.press('KeyW'); if (k === 470) dev.release('KeyW');
};

test('simulation hashes are the same headless, rendered with interpolation, and rendered without', () => {
  const headless = world(), hashes = [];
  for (let k = 0; k < 600; k++) { drive(headless.dev, k); headless.tree.step(); hashes.push(worldHashes(headless.tree, { physicsBytes: k % 60 === 59 })); }
  for (const interpolate of [true, false]) {
    const w = world(), host = new RenderHost({ renderer: new FakeRenderer(), interpolate }).attach(w.tree);
    host.debug.set(true); // debug draw and its ray tap on, too
    const got = [];
    // A 120 Hz display: one step every other frame. Input is latched per step, so drive it per step.
    while (w.tree.clock.step < 600) {
      const k = w.tree.clock.step;
      host.frame(1 / 120, (s) => { got.push(worldHashes(w.tree, { physicsBytes: s % 60 === 0 })); });
      if (w.tree.clock.step !== k) drive(w.dev, w.tree.clock.step);
    }
    // drive() above runs after step k+1 for step k+1's input, as the headless loop does before stepping
    for (let k = 0; k < 600; k++) assert.deepEqual(got[k], hashes[k], `interpolate ${interpolate}: step ${k + 1}`);
    assert.ok(host.renderer.frames >= 1199, `${host.renderer.frames} frames drawn for 600 steps`);
  }
});

test('at a 120 Hz display the rendered walker moves every frame; without interpolation it judders', () => {
  const trace = {};
  for (const interpolate of [true, false]) {
    const w = world(), host = new RenderHost({ renderer: new FakeRenderer(), interpolate }).attach(w.tree);
    w.dev.press('KeyD');
    const xs = [], v = new Vector3();
    host.onPresent = () => { w.tree.find('walker').object3d.getWorldPosition(v); xs.push(v.x); };
    for (let f = 0; f < 240; f++) host.frame(1 / 120);
    trace[interpolate] = xs.slice(120).map((x, i, a) => (i ? x - a[i - 1] : null)).slice(1);
  }
  const on = trace.true, off = trace.false, per = 3 / 120;
  assert.ok(on.every((d) => Math.abs(d - per) < 1e-9), `interpolated: every frame moves 2.5 cm (${on.slice(0, 4).map((d) => d.toFixed(4))})`);
  assert.ok(off.filter((d) => d === 0).length >= 59 && off.filter((d) => Math.abs(d - 2 * per) < 1e-9).length >= 59, `not interpolated: 0, 5 cm, 0, 5 cm … (${off.slice(0, 4).map((d) => d.toFixed(4))})`);
});

test('the blend never stays in the objects, and never fires change callbacks', () => {
  const w = world(), host = new RenderHost({ renderer: new FakeRenderer() }).attach(w.tree);
  w.dev.press('KeyD');
  const walker = w.tree.find('walker').object3d;
  let calls = 0;
  const cb = walker.quaternion._onChangeCallback;
  walker.quaternion._onChange(() => { calls++; cb(); });
  for (let f = 0; f < 30; f++) host.frame(1 / 60);
  const sim = walker.position.x;
  let seen;
  host.onPresent = () => { seen = walker.position.x; };
  host.render(0.5, false); // between the last two steps: the blend is drawn, then put back
  assert.notEqual(seen, sim, 'drawn between steps');
  assert.equal(walker.position.x, sim, 'simulated value restored exactly');
  assert.ok(walker.matrixWorld.elements[12] === sim, 'world matrix re-derived from it');
  assert.equal(calls, 0, 'no quaternion change callback ran');
});

test('lights, shadows and the Environment follow their nodes and props', () => {
  const w = world(), r = new FakeRenderer(), host = new RenderHost({ renderer: r }).attach(w.tree);
  host.frame(1 / 60);
  const sun = w.tree.find('sun').object3d.children.find((o) => o.isDirectionalLight);
  assert.ok(sun && sun.castShadow && sun.intensity === 2.5);
  assert.equal(sun.shadow.mapSize.x, SHADOW_PRESETS.high.mapSize);
  assert.equal(sun.shadow.autoUpdate, false, 'shadowUpdate "once": frozen map');
  assert.equal(sun.shadow.camera.right, 6);
  const dir = new Vector3(); sun.updateMatrixWorld(true); sun.target.updateMatrixWorld(true);
  dir.subVectors(sun.target.getWorldPosition(new Vector3()), sun.getWorldPosition(new Vector3())).normalize();
  const fwd = new Vector3(0, 0, -1).applyQuaternion(w.tree.find('sun').object3d.quaternion);
  assert.ok(dir.distanceTo(fwd.normalize()) < 1e-3, 'shines along the node\'s -Z (the fixture\'s quaternion is rounded to 3 places)');
  const spot = w.tree.find('lamp').object3d.children.find((o) => o.isSpotLight);
  assert.ok(Math.abs(spot.angle - (25 * Math.PI) / 180) < 1e-12 && spot.castShadow && spot.shadow.mapSize.x === 512);
  assert.deepEqual(spot.position.toArray(), [0, 0, 0], 'at its node');
  const bulb = w.tree.find('bulb').object3d.children.find((o) => o.isPointLight);
  assert.ok(bulb && !bulb.castShadow && bulb.distance === 10);
  assert.equal(host.scene.fog?.near, 5);
  assert.equal(r.toneMappingExposure, 1.2);
  assert.ok(host.scene.background?.isDataTexture, 'gradient sky');
  assert.ok(host.scene.children.some((o) => o.name === 'environment:ground' && o.visible && o.receiveShadow));
  // prop edits apply on the next frame; a removed light takes its view with it
  w.tree.find('sun').props.intensity = 4; w.tree.find('env').props.fog = 'none';
  host.frame(1 / 60);
  assert.equal(sun.intensity, 4); assert.equal(host.scene.fog, null);
  w.tree.remove('bulb'); host.frame(1 / 60);
  assert.equal(host.views.lights.size, 2);
});

test('debug draw: a wire for every collider, the door triggers as sensors, rays from the camera\'s spring arm', () => {
  const w = world(), host = new RenderHost({ renderer: new FakeRenderer() }).attach(w.tree);
  host.debug.set(true);
  for (let f = 0; f < 4; f++) host.frame(1 / 60);
  const physics = w.tree.services.get('physics');
  const c = host.debug.counts();
  assert.equal(c.colliders + c.sensors + c.capsules, physics.colliders.size, 'one wire per collider');
  const sensors = [...host.debug.wires.values()].filter((x) => x.kind === 'sensor').map((x) => x.line.userData.node).sort();
  assert.deepEqual(sensors, ['entrance/left/trigger', 'entrance/right/trigger']);
  assert.ok(c.rays >= 1, `the follow camera's spring arm ray is drawn (${c.rays})`);
  const wire = [...host.debug.wires.values()].find((x) => x.line.userData.node === 'walker-shape');
  const t = physics.world.world.getCollider([...physics.colliders].find(([, i]) => i.node.id === 'walker-shape')[0]).translation();
  assert.ok(Math.abs(wire.line.matrix.elements[13] - t.y) < 1e-6, 'placed at the collider\'s pose');
  host.debug.set({ sensors: false });
  host.frame(1 / 60);
  assert.ok([...host.debug.wires.values()].every((x) => x.line.visible === (x.kind !== 'sensor')));
  host.debug.set(false); host.frame(1 / 60);
  assert.equal(host.debug.group.visible, false);
});

test('attaching another tree rebuilds its views and wires (and drops the old tree\'s)', () => {
  const host = new RenderHost({ renderer: new FakeRenderer() });
  const a = world(); host.attach(a.tree); host.debug.set(true); host.frame(1 / 60);
  const b = world(); host.attach(b.tree); host.frame(1 / 60);
  const lights = [...host.views.lights.keys()];
  assert.ok(lights.length === 3 && lights.every((n) => n.tree === b.tree), 'the new tree\'s lights');
  assert.ok(a.tree.find('sun').object3d.children.every((o) => !o.isLight), 'the old tree keeps no light objects');
  assert.equal(a.tree.services.get('physics').world.onRay, null, 'the old world\'s ray tap is off');
  assert.equal(host.debug.counts().sensors, 2);
});
