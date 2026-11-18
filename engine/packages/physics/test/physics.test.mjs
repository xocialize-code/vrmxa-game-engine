import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { parse } from '@vrmxg/scene';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { loadRapier, installPhysics, addAssetColliders, readPhysics, Layers } from '@vrmxg/physics';

installPortableMath();
const R = await loadRapier();
const reg = m0Registry();
const read = (p) => parse(fs.readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8'));
const prefabs = new Map([['prefabs/door.vrmxs', read('prefabs/door.vrmxs')]]);

// A kinematic "walker": stands at z = 3, walks into the door's trigger (z 0.3 … 1.3) by step 150,
// waits, walks back out from step 330 to 420. Position is a pure function of the step index.
const zAt = (k) => (k < 60 ? 3 : k < 150 ? 3 - (2.2 * (k - 60)) / 90 : k < 330 ? 0.8 : k < 420 ? 0.8 + (2.2 * (k - 330)) / 90 : 3);
class Walk extends Behaviour { physicsProcess() { this.node.object3d.position.z = zAt(this.tree.clock.step); } }

const scene = () => ({
  format: 'vrmxs', version: 1, id: 'door-test',
  assets: [{ id: 'door', type: 'vrmxs', ref: 'prefabs/door.vrmxs' }],
  nodes: [
    { id: 'root', type: 'Node3D' },
    { id: 'door-1', type: 'Instance', parent: 'root', asset: 'door' },
    { id: 'walker', type: 'RigidBody', parent: 'root', transform: { p: [0, 0.9, 3] }, props: { bodyType: 'kinematic' }, behaviours: [{ use: 'walk' }] },
    { id: 'walker-shape', type: 'Collider', parent: 'walker', props: { shape: 'capsule', radius: 0.3, height: 1.6 } },
  ],
});

function makeTree(doc = scene(), config) {
  const tree = new SceneTree({ registry: reg, prefabs, behaviours: new Map([['walk', Walk]]) });
  const physics = installPhysics(tree, R, config);
  tree.instantiate(doc);
  return { tree, physics };
}

function hashF64(f64) {
  const u = new Uint32Array(f64.buffer, f64.byteOffset, f64.length * 2);
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) for (let x = u[i], b = 0; b < 4; b++, x >>>= 8) { h ^= x & 0xff; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

test('the door prefab swings open when a kinematic body enters its trigger, and closes when it leaves', () => {
  const { tree } = makeTree();
  const hinge = tree.find('door-1/hinge').behaviours[0];
  const log = [];
  tree.find('door-1/trigger').on('bodyEntered', (e) => log.push(`entered ${e.body} @${tree.clock.step}`));
  tree.find('door-1/trigger').on('bodyExited', (e) => log.push(`exited ${e.body} @${tree.clock.step}`));
  tree.find('door-1/hinge').on('opened', () => log.push(`opened @${tree.clock.step}`));
  tree.find('door-1/hinge').on('closed', () => log.push(`closed @${tree.clock.step}`));
  let maxAngle = 0;
  for (let k = 0; k < 600; k++) { tree.step(); maxAngle = Math.max(maxAngle, hinge.angle()); }
  const deg = (r) => (r * 180) / Math.PI;
  const kinds = log.map((l) => l.split(' ')[0]);
  assert.deepEqual(kinds, ['entered', 'opened', 'exited', 'closed'], log.join('\n'));
  assert.match(log[0], /^entered walker @/);
  assert.ok(deg(maxAngle) > 95 && deg(maxAngle) < 106, `opened to ${deg(maxAngle).toFixed(1)}°`);
  assert.ok(Math.abs(deg(hinge.angle())) < 5, `closed again at ${deg(hinge.angle()).toFixed(1)}°`);
  // The node follows its body: the hinge node's transform is the swung door
  assert.ok(Math.abs(tree.find('door-1/hinge').object3d.position.x + 0.45) < 1e-6, 'the hinge stays on its axis');
});

test('a locked door ignores its trigger', () => {
  const doc = scene();
  doc.nodes[1].overrides = { hinge: { behaviours: [{ use: 'hinge', locked: true }] } };
  const { tree } = makeTree(doc);
  const hinge = tree.find('door-1/hinge').behaviours[0];
  let maxAngle = 0;
  for (let k = 0; k < 300; k++) { tree.step(); maxAngle = Math.max(maxAngle, Math.abs(hinge.angle())); }
  assert.ok(maxAngle < 0.02, `stayed shut (max ${maxAngle})`);
});

test('two runs are bit-identical at every step', () => {
  const run = () => { const { tree, physics } = makeTree(); const hs = []; for (let k = 0; k < 600; k++) { tree.step(); hs.push(hashF64(physics.stateVector())); } return hs; };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(new Set(a).size > 100, `the state really moves (${new Set(a).size} distinct states; bodies sleep while the door is idle)`);
});

test('snapshot at step 300, restore into a new tree, re-simulate to 600: bit-identical', () => {
  const A = makeTree();
  for (let k = 0; k < 300; k++) A.tree.step();
  const snap = A.physics.snapshot();
  for (let k = 300; k < 600; k++) A.tree.step();
  const expected = hashF64(A.physics.stateVector());

  const B = makeTree();
  B.physics.restore(snap);
  B.tree.clock.setState({ step: 300 });
  assert.deepEqual(B.tree.find('door-1/hinge').behaviours[0].getState(), snap.watchers[0][2], 'hinge state restored (open at step 300)');
  assert.ok(snap.watchers[0][2].target > 1.7);
  for (let k = 300; k < 600; k++) B.tree.step();
  assert.equal(hashF64(B.physics.stateVector()), expected);
  assert.equal(B.tree.find('door-1/hinge').behaviours[0].reported, 'closed');
  assert.ok(snap.bytes.byteLength > 1000);
});

test('ray and shape casts return nodes; layers filter them', () => {
  const doc = scene();
  doc.nodes[3].props.layer = 'player';
  const { tree, physics } = makeTree(doc, { layers: { layers: ['default', 'player'], collides: { player: ['default'] } } });
  tree.step();
  const hit = physics.raycast([0, 1, -2], [0, 0, 1], 10);
  assert.equal(hit.node, 'door-1/hinge');
  assert.equal(hit.colliderNode, 'door-1/panel');
  assert.ok(Math.abs(hit.distance - 1.98) < 1e-6, `distance ${hit.distance}`);
  assert.deepEqual(hit.normal.map((x) => Math.round(x)), [0, 0, -1]);
  assert.equal(physics.raycast([0, 1, -2], [0, 0, 1], 10, { layers: ['player'] }).node, 'walker', 'only the player layer: through the door to the walker');
  assert.equal(physics.raycast([0, 1, -2], [0, 0, -1], 10), null);
  const sweep = physics.shapecast({ shape: 'sphere', radius: 0.2 }, [0, 1, -2], [0, 0, 0, 1], [0, 0, 1], 10);
  assert.equal(sweep.node, 'door-1/hinge');
  const L = new Layers({ layers: ['default', 'player', 'trigger'], collides: { trigger: ['player'] } });
  assert.equal(L.groups('trigger'), ((0b100 << 16) | 0b010) >>> 0);
  assert.throws(() => L.bit('ghost'), /unknown collision layer "ghost"/);
});

test('contact signals only for bodies someone listens to; a body\'s mass is shared by its colliders', () => {
  const doc = { format: 'vrmxs', version: 1, id: 'drop', nodes: [
    { id: 'floor', type: 'Collider', props: { shape: 'box', size: [10, 0.2, 10] } },
    { id: 'crate', type: 'RigidBody', transform: { p: [0, 2, 0] }, props: { mass: 12 } },
    { id: 'a', type: 'Collider', parent: 'crate', props: { shape: 'box', size: [0.5, 0.5, 0.5] } },
    { id: 'b', type: 'Collider', parent: 'crate', transform: { p: [0, 0.5, 0] }, props: { shape: 'sphere', radius: 0.2 } },
  ] };
  const tree = new SceneTree({ registry: reg });
  const physics = installPhysics(tree, R);
  tree.instantiate(doc);
  const crate = tree.find('crate');
  tree.step(); // Rapier recomputes mass properties on the next step
  assert.ok(Math.abs(physics.world.world.getRigidBody(crate.body).mass() - 12) < 1e-4, 'mass 12 shared by volume');
  const contacts = [];
  crate.on('contact', (e) => contacts.push(e.other));
  tree.run(120);
  assert.equal(contacts[0], 'floor');
  assert.ok(crate.object3d.position.y < 0.5, `the crate landed (y ${crate.object3d.position.y})`);
});

test('colliders from a GLB\'s KHR_physics_rigid_bodies / OMI data, read tolerantly', () => {
  const gltf = {
    extensions: { KHR_implicit_shapes: { shapes: [{ type: 'box', box: { size: [2, 1, 2] } }, { type: 'sphere', sphere: { radius: 0.5 } }, { type: 'capsule', capsule: { height: 1, radiusBottom: 0.25 } }, { type: 'torus' }] } },
    nodes: [
      { name: 'table', translation: [0, 0.5, 0], children: [1], extensions: { KHR_physics_rigid_bodies: { collider: { geometry: { shape: 0 } } } } },
      { name: 'lamp', translation: [0, 1, 0], scale: [2, 2, 2], extensions: { KHR_physics_rigid_bodies: { trigger: { geometry: { shape: 1 } } } } },
      { name: 'statue', translation: [3, 0, 0], extensions: { KHR_physics_rigid_bodies: { collider: { geometry: { node: 5, convexHull: true } } } } },
      { name: 'pillar', translation: [-3, 0, 0], extensions: { KHR_physics_rigid_bodies: { collider: { geometry: { shape: 2 } }, motion: { mass: 4 } } } },
      { name: 'donut', extensions: { KHR_physics_rigid_bodies: { collider: { geometry: { shape: 3 } } } } },
    ],
  };
  const { colliders, skipped } = readPhysics(gltf);
  assert.equal(colliders.length, 3);
  assert.deepEqual(colliders[1], { node: 1, name: 'lamp', shape: { shape: 'sphere', radius: 1 }, p: [0, 1.5, 0], q: [0, 0, 0, 1], sensor: true, motion: null }, 'world pose through the parent, scale baked');
  assert.deepEqual(colliders[2].shape, { shape: 'capsule', radius: 0.25, height: 1.5 }, 'cap-centre height + caps');
  assert.equal(skipped.length, 2, skipped.join('\n'));
  const tree = new SceneTree({ registry: reg });
  const physics = installPhysics(tree, R);
  tree.instantiate({ format: 'vrmxs', version: 1, id: 'set', nodes: [{ id: 'set', type: 'Model', transform: { p: [10, 0, 0] }, asset: 'x' }] });
  assert.equal(addAssetColliders(physics, tree.find('set'), gltf).added, 3);
  tree.step();
  const hit = physics.raycast([10, 5, 0.5], [0, -1, 0], 10);
  assert.equal(hit.node, 'set');
  assert.ok(Math.abs(hit.point[1] - 1) < 1e-6, 'table top at y = 1 (centre 0.5 + half height 0.5)');
});

test('removing an instance removes its bodies and colliders; debug lines cover every collider', () => {
  const { tree, physics } = makeTree();
  const bodies = physics.world.world.bodies.len(), colliders = physics.world.world.colliders.len();
  const lines = physics.debugLines();
  assert.ok(lines.vertices.length > 0 && lines.vertices.length % 6 === 0);
  assert.equal(lines.colors.length / 4, lines.vertices.length / 3);
  tree.remove('door-1');
  assert.equal(physics.world.world.colliders.len(), colliders - 2, 'panel and trigger');
  assert.ok(physics.world.world.bodies.len() <= bodies - 2, 'hinge body and the trigger\'s fixed body (and the hinge anchor)');
  tree.run(10);
});
