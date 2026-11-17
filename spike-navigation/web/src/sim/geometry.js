// The navmesh input: one triangle soup built from the very arrays that build the Rapier colliders
// (level.js: groundMesh() for the trimesh, fixedBoxes() for the cuboids). An engine would do the
// same from its collider list: trimesh → as is, cuboid → 12 triangles, everything else → its
// debug mesh. Only + - * / here (a quaternion rotation needs no trig), so the soup is bit-identical
// in V8 and JavaScriptCore, like the level.
import { groundMesh, fixedBoxes, DOOR } from './level.js';

/** Rotates v by the unit quaternion q: v + 2w(q×v) + 2q×(q×v). */
function rotate(q, x, y, z) {
  const tx = 2 * (q.y * z - q.z * y), ty = 2 * (q.z * x - q.x * z), tz = 2 * (q.x * y - q.y * x);
  return [x + q.w * tx + (q.y * tz - q.z * ty), y + q.w * ty + (q.z * tx - q.x * tz), z + q.w * tz + (q.x * ty - q.y * tx)];
}

// Box corners and faces, counter-clockwise seen from outside (OpenGL convention, normals out).
const CORNERS = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const FACES = [
  [4, 5, 6, 4, 6, 7], // +z
  [1, 0, 3, 1, 3, 2], // -z
  [5, 1, 2, 5, 2, 6], // +x
  [0, 4, 7, 0, 7, 3], // -x
  [3, 7, 6, 3, 6, 2], // +y (top: the walkable face)
  [0, 1, 5, 0, 5, 4], // -y
];

/** Appends a (possibly rotated) box as 12 triangles (10 without its top face). */
export function pushBox(pos, idx, b, { top = true } = {}) {
  const base = pos.length / 3;
  const q = b.rot ?? { x: 0, y: 0, z: 0, w: 1 };
  for (const [sx, sy, sz] of CORNERS) {
    const r = rotate(q, sx * b.half.x, sy * b.half.y, sz * b.half.z);
    pos.push(b.pos.x + r[0], b.pos.y + r[1], b.pos.z + r[2]);
  }
  for (let fi = 0; fi < FACES.length; fi++) if (top || fi !== 4) for (const k of FACES[fi]) idx.push(base + k);
}

/**
 * The level as one soup. `kinds` picks which fixed boxes go in (default: all). The invisible
 * boundary walls are "blocker only": they go in without their top face, because a 1 m thick wall
 * top survives the 0.3 m erosion and bakes as a walkable strip 7 m up (an engine wants a per-collider
 * nav flag for this, or a flood-fill prune from seed points). The door is not baked in: the
 * doorway bakes open and the door is a run-time obstacle.
 */
export function navInput({ kinds = null } = {}) {
  const g = groundMesh();
  const pos = Array.from(g.vertices);
  const idx = Array.from(g.indices);
  for (const b of fixedBoxes()) if (!kinds || kinds.includes(b.kind)) pushBox(pos, idx, b, { top: b.kind !== 'bound' });
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

/** The closed door as an axis-aligned box that fills the doorway (for obstacles and tile rebuilds). */
export const DOOR_BLOCK = {
  center: { x: 0, y: 1.05, z: DOOR.hinge.z },
  half: { x: 0.6, y: 1.05, z: 0.12 },
};

/**
 * Navmesh build settings for a human-sized agent, the same capsule as the physics spike's player
 * (radius 0.3, total height 1.7, autostep 0.35 → climb 0.35, max slope 45°).
 */
export const AGENT = { radius: 0.3, height: 1.7, climb: 0.35, slope: 45, maxSpeed: 3.5, maxAccel: 12 };
export const BAKE = {
  cs: 0.15, ch: 0.1,
  tileVoxels: 32, // 4.8 m tiles for the tiled / tile-cache builds
  maxEdgeLen: 12, maxSimplificationError: 1.3, minRegionArea: 8, mergeRegionArea: 20, maxVertsPerPoly: 6,
  detailSampleDist: 6, detailSampleMaxError: 1,
};
export const voxels = {
  radius: Math.ceil(AGENT.radius / BAKE.cs),
  height: Math.ceil(AGENT.height / BAKE.ch),
  climb: Math.floor(AGENT.climb / BAKE.ch),
};

/** A one-way jump down from the third stair (0.8 m) to the ground west of the stairs. */
export const JUMP_LINK = { start: [-5.2, 0.8, 2], end: [-6.8, 0, 2.6], radius: 0.4, bidirectional: false };
