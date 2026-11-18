// @vrmxg/physics — M0 W2 (AB-T-0503). An engine-neutral adapter on Rapier's deterministic build
// (AB-R-0923), the RigidBody / Collider / Area nodes, the hinge behaviour, ray and shape casts, named
// collision layers, snapshots and debug render data. Inside the determinism boundary (AB-D-0248).
import { PhysicsServer } from './server.js';
import { RigidBodyNode, ColliderNode, AreaNode } from './nodes.js';
import { HingeBehaviour } from './hinge.js';
import { readPhysics } from './khr.js';

export { loadRapier, RAPIER_BUILD } from './rapier.js';
export { PhysicsWorld } from './world.js';
export { Layers } from './layers.js';
export { PhysicsServer, worldPose, relativePose } from './server.js';
export { RigidBodyNode, ColliderNode, AreaNode } from './nodes.js';
export { HingeBehaviour } from './hinge.js';
export { readPhysics } from './khr.js';

/**
 * Give a SceneTree physics: registers the node classes and the hinge behaviour, and adds the
 * "physics" service. Call before instantiate().
 * @param {import('@vrmxg/core').SceneTree} tree
 * @param {any} R initialised Rapier (await loadRapier())
 * @param {any} [config] vrmxg.json "physics": { gravity, layers: { layers, collides }, substeps }
 * @returns {PhysicsServer}
 */
export function installPhysics(tree, R, config = {}) {
  tree.classes.set('RigidBody', RigidBodyNode);
  tree.classes.set('Collider', ColliderNode);
  tree.classes.set('Area', AreaNode);
  tree.behaviourClasses.set('hinge', HingeBehaviour);
  return tree.addService('physics', new PhysicsServer(tree, R, config));
}

/**
 * Static colliders from a model's GLB physics data (KHR_physics_rigid_bodies / OMI), placed at the
 * model node's world pose on one fixed body. Returns what was skipped.
 * @param {PhysicsServer} server @param {any} modelNode the Model node @param {any} gltf glTF JSON
 */
export function addAssetColliders(server, modelNode, gltf) {
  const { colliders, skipped } = readPhysics(gltf);
  if (!colliders.length) return { added: 0, skipped };
  const body = server.addBody(modelNode, { type: 'fixed' });
  modelNode.assetBody = body;
  for (const c of colliders) server.addCollider(modelNode, modelNode, body, { ...c.shape, p: c.p, q: c.q, sensor: c.sensor });
  return { added: colliders.length, skipped };
}

