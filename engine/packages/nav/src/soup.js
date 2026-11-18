// The triangles a navmesh is baked from (M2 W6): the physics world's fixed colliders, the same shapes the characters
// collide with, so the navmesh and the controller agree on where the floor and the walls are (spike-navigation:
// geometry.js). Boxes give 12 triangles, trimeshes their own, round shapes a box around them. Moving bodies (doors on
// hinges, items, characters) and sensors are left out: a doorway stays walkable, and a locked door becomes an obstacle
// at run time instead. Thick walls would bake a walkable strip on top (spike gotcha 2), so a box's top face is left
// out when it is higher than `maxTop` above the lowest floor.

// faces wound so cross(b − a, c − a) points out of the box (Recast reads the normal that way: the top faces up)
const BOX = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [3, 0, 4], [3, 4, 7]];
const TOP = new Set([2, 3]); // the faces at +y (corners 4–7)

/** Rotate v by quaternion q (x, y, z, w). */
function rot(q, v) {
  const [x, y, z] = v, { x: qx, y: qy, z: qz, w: qw } = q;
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
}

/**
 * @param {any} R Rapier @param {any} world the Rapier World
 * @param {{ maxTop?: number }} [o] maxTop: a box whose top is higher than this above the lowest point loses its top face
 * @returns {{ positions: number[], indices: number[], colliders: number }}
 */
export function collidersToSoup(R, world, { maxTop = 2.2 } = {}) {
  const boxes = [], meshes = [];
  world.colliders.forEach((c) => {
    if (c.isSensor()) return;
    const body = c.parent();
    if (body && !body.isFixed()) return;
    const t = c.translation(), q = c.rotation(), type = c.shapeType();
    if (type === R.ShapeType.TriMesh) meshes.push({ t, q, v: c.vertices(), i: c.indices() });
    else {
      let h;
      if (type === R.ShapeType.Cuboid) { const e = c.halfExtents(); h = [e.x, e.y, e.z]; }
      else if (type === R.ShapeType.Ball) { const r = c.radius(); h = [r, r, r]; }
      else if (type === R.ShapeType.Capsule || type === R.ShapeType.Cylinder) { const r = c.radius(), hh = c.halfHeight() + (type === R.ShapeType.Capsule ? r : 0); h = [r, hh, r]; }
      else return; // other shapes don't occur in our scenes
      boxes.push({ t, q, h });
    }
  });
  const positions = [], indices = [];
  let lowest = Infinity;
  for (const m of meshes) for (let k = 0; k < m.v.length; k += 3) lowest = Math.min(lowest, rot(m.q, [m.v[k], m.v[k + 1], m.v[k + 2]])[1] + m.t.y);
  for (const b of boxes) lowest = Math.min(lowest, b.t.y - b.h[1]);
  if (!Number.isFinite(lowest)) lowest = 0;
  for (const m of meshes) {
    const base = positions.length / 3;
    for (let k = 0; k < m.v.length; k += 3) { const p = rot(m.q, [m.v[k], m.v[k + 1], m.v[k + 2]]); positions.push(p[0] + m.t.x, p[1] + m.t.y, p[2] + m.t.z); }
    for (const i of m.i) indices.push(base + i);
  }
  for (const b of boxes) {
    const base = positions.length / 3, [hx, hy, hz] = b.h;
    const corners = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]];
    for (const c of corners) { const p = rot(b.q, c); positions.push(p[0] + b.t.x, p[1] + b.t.y, p[2] + b.t.z); }
    const tall = b.t.y + hy - lowest > maxTop;
    BOX.forEach((f, i) => { if (!(tall && TOP.has(i))) indices.push(base + f[0], base + f[1], base + f[2]); });
  }
  return { positions, indices, colliders: boxes.length + meshes.length };
}
