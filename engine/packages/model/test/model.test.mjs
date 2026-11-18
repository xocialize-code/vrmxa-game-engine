import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installModels, writeGLB, readGLBJson } from '@vrmxg/model';

installPortableMath();
const R = await loadRapier();

const set = writeGLB({ name: 'room', parts: [
  { name: 'floor', size: [10, 0.2, 10], p: [0, -0.1, 0], color: '#a08060', collider: true },
  { name: 'counter', size: [2, 1, 0.6], p: [0, 0.5, -3], color: '#5a3c28', collider: true },
  { name: 'lamp', size: [0.2, 0.2, 0.2], p: [0, 2.5, 0], color: '#fff2cc' },
  { name: 'doorway', size: [1.2, 2, 1], p: [3, 1, 0], color: '#000000', trigger: true, visible: false },
] });
const prefab = { format: 'vrmxs', version: 1, id: 'p', assets: [{ id: 'g', type: 'glb', ref: 'sets/room.glb' }], nodes: [{ id: 'm', type: 'Model', asset: 'g' }] };
const files = { 'sets/room.glb': set };

async function world(nodes) {
  const prefabs = new Map([['prefabs/p.vrmxs', prefab]]);
  const tree = new SceneTree({ registry: m0Registry(), prefabs });
  const physics = installPhysics(tree, R);
  const models = installModels(tree, { resolve: (ref) => files[ref], stubTextures: true });
  const doc = { format: 'vrmxs', version: 1, id: 't', assets: [{ id: 'room', type: 'glb', ref: 'sets/room.glb' }, { id: 'p', type: 'vrmxs', ref: 'prefabs/p.vrmxs' }], nodes };
  await models.prepare(doc);
  tree.instantiate(doc);
  tree.step(); // Rapier's query pipeline is built by a step
  return { tree, physics, models };
}

test('the GLB writer: a valid binary glTF with meshes, materials and KHR physics shapes', () => {
  const j = readGLBJson(set);
  assert.equal(j.asset.version, '2.0');
  assert.equal(j.nodes.length, 4);
  assert.equal(j.meshes.length, 3, 'the invisible trigger has no mesh');
  assert.deepEqual(j.extensionsUsed, ['KHR_physics_rigid_bodies', 'KHR_implicit_shapes']);
  assert.equal(j.extensions.KHR_implicit_shapes.shapes.length, 3);
  assert.ok(j.nodes[3].extensions.KHR_physics_rigid_bodies.trigger);
  assert.equal(set.byteLength % 4, 0);
});

test('a Model node shows its GLB and gets its colliders and triggers from it, at the node\'s pose', async () => {
  const { tree, physics, models } = await world([{ id: 'set', type: 'Model', asset: 'room', transform: { p: [5, 0, 0] } }]);
  const node = tree.find('set');
  const meshes = []; node.object3d.traverse((o) => { if (o.isMesh) meshes.push(o.name); });
  assert.deepEqual(meshes.sort(), ['counter', 'floor', 'lamp']);
  assert.equal([...physics.colliders.values()].filter((c) => c.owner === node).length, 3);
  const hit = physics.raycast([5, 5, 0], [0, -1, 0], 10);
  assert.equal(hit.node, 'set');
  assert.ok(Math.abs(hit.point[1]) < 1e-5, 'the floor\'s top at y 0');
  assert.equal(physics.raycast([-1, 5, 0], [0, -1, 0], 10), null, 'nothing past the floor\'s edge (x 0 to 10)');
  const trigger = [...physics.colliders].find(([h, c]) => c.owner === node && physics.world.world.getCollider(h).isSensor());
  assert.ok(trigger, 'the doorway is a sensor');
  assert.deepEqual(models.skipped, []);
});

test('Models inside prefab instances load; two nodes share one parsed file; removing frees the body', async () => {
  const { tree, physics, models } = await world([
    { id: 'a', type: 'Instance', asset: 'p' }, { id: 'b', type: 'Instance', asset: 'p', transform: { p: [20, 0, 0] } },
    { id: 'gen', type: 'Model', asset: 'room', transform: { p: [-20, 0, 0] }, props: { colliders: 'trimesh' } },
  ]);
  assert.equal(models.files.size, 1);
  const ga = tree.find('a/m').model.children[0].geometry, gb = tree.find('b/m').model.children[0].geometry;
  assert.equal(ga, gb, 'geometry shared between clones');
  assert.equal(physics.raycast([20, 5, 0], [0, -1, 0], 10)?.node, 'b/m');
  assert.deepEqual(models.skipped.map((s) => s.node), ['gen'], 'generated colliders reported, not faked');
  const before = physics.colliders.size;
  tree.remove('a');
  assert.equal(physics.colliders.size, before - 3);
});
