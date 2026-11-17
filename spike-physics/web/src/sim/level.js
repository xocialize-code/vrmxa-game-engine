// The test level, as plain arrays, so the physics world and the three.js stage are built from the
// same numbers. Everything here is integer or + - * / arithmetic only: Math.sin and friends are
// not guaranteed to round the same way in V8 and JavaScriptCore, and a level that differs in the
// last bit would make a cross-runtime determinism check meaningless.

export const LEVEL_SIZE = 40; // metres, square, centred on the origin
const CELLS = 48;

// Small integer hash -> [0, 1). Integer ops only, so identical everywhere.
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

// Value noise with smoothstep interpolation, flat in the middle where the action is.
export function heightAt(x, z) {
  const s = 0.25; // one noise cell every 4 m
  const fx = x * s, fz = z * s;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = smooth(fx - ix), tz = smooth(fz - iz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const n = a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  const r = Math.max(Math.abs(x), Math.abs(z));
  const blend = r < 10 ? 0 : r > 14 ? 1 : smooth((r - 10) / 4);
  const h = n * 1.6 * blend;
  return Math.round(h * 4096) / 4096; // quantise: kills any last-bit difference
}

/** The ground as a triangle mesh: { vertices: Float32Array, indices: Uint32Array }. */
export function groundMesh() {
  const n = CELLS + 1;
  const step = LEVEL_SIZE / CELLS;
  const half = LEVEL_SIZE / 2;
  const vertices = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -half + i * step, z = -half + j * step;
      const k = (j * n + i) * 3;
      vertices[k] = x; vertices[k + 1] = heightAt(x, z); vertices[k + 2] = z;
    }
  }
  const indices = new Uint32Array(CELLS * CELLS * 6);
  let t = 0;
  for (let j = 0; j < CELLS; j++) {
    for (let i = 0; i < CELLS; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      // Counter-clockwise seen from above (+Y), so normals point up.
      indices[t++] = a; indices[t++] = c; indices[t++] = b;
      indices[t++] = b; indices[t++] = c; indices[t++] = d;
    }
  }
  return { vertices, indices };
}

// 15 degrees about X, written out: no trig at run time.
const RAMP_Q = { x: 0.13052619222005157, y: 0, z: 0, w: 0.9914448613738104 };
const IDENT = { x: 0, y: 0, z: 0, w: 1 };

export const DOOR = {
  hinge: { x: -0.55, y: 1.05, z: -6 },
  halfExtents: { x: 0.5, y: 1.0, z: 0.04 },
  sensor: { center: { x: 0, y: 1, z: -6 }, halfExtents: { x: 1.6, y: 1, z: 2.2 } },
  openAngle: 1.4,
};

/** Fixed boxes: walls with a doorway, stairs, a ramp. { half, pos, rot, kind } */
export function fixedBoxes() {
  const boxes = [];
  const wallZ = DOOR.hinge.z;
  // Wall along X at z = -6 with a 1.2 m gap at x in [-0.6, 0.6].
  boxes.push({ kind: 'wall', half: { x: 3.7, y: 1.4, z: 0.1 }, pos: { x: -4.3, y: 1.4, z: wallZ }, rot: IDENT });
  boxes.push({ kind: 'wall', half: { x: 3.7, y: 1.4, z: 0.1 }, pos: { x: 4.3, y: 1.4, z: wallZ }, rot: IDENT });
  boxes.push({ kind: 'wall', half: { x: 0.6, y: 0.3, z: 0.1 }, pos: { x: 0, y: 2.5, z: wallZ }, rot: IDENT }); // lintel
  // Stairs: five 0.2 m steps going up toward -X.
  for (let s = 0; s < 5; s++) {
    const h = 0.1 + s * 0.1;
    boxes.push({ kind: 'stair', half: { x: 0.2, y: h, z: 1.0 }, pos: { x: -4 - s * 0.4, y: h, z: 2 }, rot: IDENT });
  }
  // A ramp.
  boxes.push({ kind: 'ramp', half: { x: 1.0, y: 0.1, z: 2.5 }, pos: { x: -8, y: 0.55, z: -1 }, rot: RAMP_Q });
  // Invisible walls around the edge so nothing walks or rolls off the world.
  const e = LEVEL_SIZE / 2;
  boxes.push({ kind: 'bound', half: { x: e, y: 4, z: 0.5 }, pos: { x: 0, y: 3, z: -e - 0.5 }, rot: IDENT });
  boxes.push({ kind: 'bound', half: { x: e, y: 4, z: 0.5 }, pos: { x: 0, y: 3, z: e + 0.5 }, rot: IDENT });
  boxes.push({ kind: 'bound', half: { x: 0.5, y: 4, z: e }, pos: { x: -e - 0.5, y: 3, z: 0 }, rot: IDENT });
  boxes.push({ kind: 'bound', half: { x: 0.5, y: 4, z: e }, pos: { x: e + 0.5, y: 3, z: 0 }, rot: IDENT });
  return boxes;
}

// mulberry32: a seeded PRNG with integer ops only.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dynamic boxes in a loose stack beside the start: { half, pos } × count. */
export function dynamicBoxes(count, seed = 1234) {
  const rand = rng(seed);
  const out = [];
  const perLayer = 30; // 6 × 5
  for (let i = 0; i < count; i++) {
    const layer = Math.floor(i / perLayer), k = i % perLayer;
    const gx = k % 6, gz = Math.floor(k / 6);
    const hx = 0.15 + rand() * 0.2, hy = 0.15 + rand() * 0.2, hz = 0.15 + rand() * 0.2;
    out.push({
      half: { x: hx, y: hy, z: hz },
      pos: { x: 3 + gx * 0.85 + rand() * 0.05, y: 0.6 + layer * 0.85, z: -2 + gz * 0.85 + rand() * 0.05 },
    });
  }
  return out;
}

export const CLOTH = { origin: { x: -4.0, y: 3.2, z: -5.6 }, du: { x: 0.1, y: 0, z: 0 }, dv: { x: 0, y: -0.1, z: 0.0 }, nu: 20, nv: 14 };

export const PLAYER = { start: { x: 0, y: 1.2, z: 4 }, halfHeight: 0.55, radius: 0.3, speed: 4, jump: 5.5 };

// Scripted input for the tests: a fixed path (directions written out, no trig) with two jumps.
// Through the doorway (the sensor opens the door), back out, into the box pile, then away.
export function scriptedInput(step) {
  const s = step % 600;
  let x = 0, z = 0;
  if (s < 180) z = -1;
  else if (s < 300) z = 1;
  else if (s < 420) x = 1;
  else if (s < 540) { x = -0.7071067811865476; z = 0.7071067811865476; }
  else x = -1;
  return { x, z, jump: s === 330 || s === 400 };
}
