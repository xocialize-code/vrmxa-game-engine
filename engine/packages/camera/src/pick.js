// Picking: what is under the pointer. Two kinds (physics-engine-research.md "Two kinds of raycast"):
//   - pickPhysics: a ray through the physics world, for gameplay (what can I click to walk to, interact
//     with); returns the node whose body or collider it hits.
//   - pickMeshes: exact triangles of rendered meshes, skinned VRMs in their current pose included, through
//     three-mesh-bvh (the skinned pose is baked with StaticGeometryGenerator, then the BVH is refit).
// Picking is presentation (a UI query): it never writes simulated state.
import { Raycaster, Vector2, Mesh, MeshBasicMaterial } from 'three';
import { StaticGeometryGenerator, computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

const _ndc = new Vector2();

/** A ray from a camera node through normalised device coordinates (x, y in -1..1). */
export function rayFrom(cameraNode, ndcX, ndcY) {
  const rc = new Raycaster();
  cameraNode.object3d.updateWorldMatrix(true, true);
  rc.setFromCamera(_ndc.set(ndcX, ndcY), cameraNode.camera);
  return rc;
}

/**
 * First physics hit under the pointer: { node, colliderNode, point, normal, distance } or null.
 * @param {any} physics @param {any} cameraNode @param {number} ndcX @param {number} ndcY
 * @param {{ maxDistance?: number, layers?: string[] }} [opts]
 */
export function pickPhysics(physics, cameraNode, ndcX, ndcY, { maxDistance = 1000, layers } = {}) {
  const { ray } = rayFrom(cameraNode, ndcX, ndcY);
  return physics.raycast(ray.origin.toArray(), ray.direction.toArray(), maxDistance, { layers });
}

/**
 * Exact mesh picking against nodes' rendered meshes (characters' skinned meshes in their current pose).
 * Keeps one baked, BVH-indexed proxy per node, refreshed on each pick.
 */
export class MeshPicker {
  constructor() { /** @type {Map<any, { gen: any, mesh: Mesh }>} */ this.proxies = new Map(); }

  /** @param {any} node a node with meshes under its Object3D (a Character's VRM, a Model) */
  proxyOf(node) {
    let p = this.proxies.get(node);
    const meshes = [];
    node.object3d.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o); });
    if (!meshes.length) return null;
    node.object3d.updateWorldMatrix(true, true);
    // Bone matrices are normally refreshed by the renderer; a pick between renders must do it itself, or
    // the bake reuses the last rendered pose.
    for (const m of meshes) if (m.isSkinnedMesh) m.skeleton.update();
    if (!p) {
      const gen = new StaticGeometryGenerator(meshes);
      gen.attributes = ['position'];
      const geometry = gen.generate();
      computeBoundsTree.call(geometry);
      const mesh = new Mesh(geometry, new MeshBasicMaterial());
      mesh.raycast = acceleratedRaycast;
      p = { gen, mesh };
      this.proxies.set(node, p);
    } else {
      p.gen.generate(p.mesh.geometry); // re-bake the current (skinned) pose into the same buffers
      p.mesh.geometry.boundsTree.refit();
    }
    return p;
  }

  /**
   * @param {any} cameraNode @param {number} ndcX @param {number} ndcY
   * @param {any[]} nodes candidates (characters, models)
   * @returns {{ node: string, point: number[], distance: number, faceIndex: number } | null}
   */
  pick(cameraNode, ndcX, ndcY, nodes) {
    const rc = rayFrom(cameraNode, ndcX, ndcY);
    rc.firstHitOnly = true;
    let best = null;
    for (const node of nodes) {
      const p = this.proxyOf(node);
      if (!p) continue;
      const hit = rc.intersectObject(p.mesh, false)[0];
      if (hit && (!best || hit.distance < best.distance)) best = { node: node.id, point: hit.point.toArray(), distance: hit.distance, faceIndex: hit.faceIndex };
    }
    return best;
  }

  dispose() { for (const { mesh } of this.proxies.values()) { mesh.geometry.disposeBoundsTree?.(); mesh.geometry.dispose(); } this.proxies.clear(); }
}
