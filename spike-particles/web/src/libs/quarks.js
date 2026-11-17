// three.quarks 0.18.0 behind the spike's adapter shape. No three.js renderer is needed to step it,
// so the same code runs in Node (determinism) and the page (performance, screenshots).
import * as THREE from 'three';
import * as Q from 'three.quarks';
import { Rng, withRandom } from '../core/rng.js';
import { withPortableMath } from '../core/detmath.js';
import { hashRows, frameSeed } from '../core/state.js';
import { TILES, ATLAS_COLS, ATLAS_ROWS, atlasTexture } from '../core/atlas.js';

export const id = 'quarks';
export const label = 'three.quarks 0.18.0';

const V3 = (x, y, z) => new Q.Vector3(x, y, z);
const V4 = (x, y, z, w) => new Q.Vector4(x, y, z, w);
const C = (v) => new Q.ConstantValue(v);
const I = (a, b) => new Q.IntervalValue(a, b);
const bez = (a, b, c, d) => new Q.PiecewiseBezier([[new Q.Bezier(a, b, c, d), 0]]);

let sharedAtlas = null;
export function materials() {
  sharedAtlas ??= atlasTexture(THREE);
  const base = { map: sharedAtlas, transparent: true, depthWrite: false };
  return {
    additive: new THREE.MeshBasicMaterial({ ...base, blending: THREE.AdditiveBlending }),
    normal: new THREE.MeshBasicMaterial({ ...base, blending: THREE.NormalBlending }),
  };
}
const tiles = (tile) => ({ uTileCount: ATLAS_COLS, vTileCount: ATLAS_ROWS, startTileIndex: C(tile) });

/**
 * A world: one scene, one BatchedRenderer, the systems in it, and the adapter-owned RNG.
 * seeding: 'none'   the library's own Math.random (what you get out of the box)
 *          'stream' one seeded stream swapped in for Math.random during create and step
 *          'frame'  the stream is re-seeded from (seed, frame) before every step, so a frame's
 *                   randomness never depends on history; this is what makes window restore work
 */
// math: 'native'   the engine's Math.sin/cos/… (differs in the last bit between V8 and JSC)
//       'portable' core/detmath.js swapped in during create and step, for cross-engine identity
export function createWorld({ seed = 1, seeding = 'frame', scene = null, math = 'native', Batched = Q.BatchedRenderer } = {}) {
  const ownScene = !scene;
  scene ??= new THREE.Scene();
  const batch = new Batched(); // three.quarks/webgpu passes its WebGPUBatchedRenderer here
  scene.add(batch);
  const rng = new Rng(seed);
  const mats = materials();
  const world = {
    lib: id, scene, batch, rng, seed, seeding, math, mats, systems: [], frame: 0,
    run(fn) {
      const f = math === 'portable' ? () => withPortableMath(fn) : fn;
      return seeding === 'none' ? f() : withRandom(rng, f);
    },
    add(systems, parent = scene) {
      for (const s of [systems].flat()) {
        parent.add(s.emitter); batch.addSystem(s); world.systems.push(s);
      }
      return systems;
    },
    step(dt = 1 / 60) {
      // emitters read matrixWorld; an engine updates the graph before simulating. Without this a
      // system loaded from JSON keeps an identity matrixWorld in Node (no renderer to update it).
      if (seeding === 'frame') rng.seed(frameSeed(seed, world.frame));
      world.run(() => { scene.updateMatrixWorld(); batch.update(dt); });
      world.frame++;
    },
    count() { let n = 0; for (const s of world.systems) n += s.particleNum; return n; },
    rows() {
      const rows = [];
      for (const s of world.systems) for (let i = 0; i < s.particleNum; i++) {
        const p = s.particles[i];
        const rot = typeof p.rotation === 'number' ? p.rotation : p.rotation.w;
        rows.push([p.position.x, p.position.y, p.position.z, p.velocity.x, p.velocity.y, p.velocity.z,
          p.age, p.life, p.size.x, p.size.y, p.color.x, p.color.y, p.color.z, p.color.w, rot, p.uvTile]);
      }
      return rows;
    },
    hash() { return hashRows(world.rows()); },
    drawObjects() { return batch.batches.length; },
    dispose() {
      for (const s of world.systems) s.dispose();
      scene.remove(batch); batch.batches.forEach((b) => b.geometry?.dispose());
      world.systems.length = 0;
      if (ownScene) scene.clear();
    },
  };
  return world;
}

// ---- snapshot / restore -------------------------------------------------------------------
// three.quarks has no snapshot API. Two adapter-side ways to restore a frame:
//  full:   copy every live particle's fields plus each system's emission state (bytes ~ particles)
//  window: keep only the tiny emission state per frame; restore = restart the systems, put the
//          emission state of frame (N - W) back and re-simulate W frames with per-frame seeds.
//          W must cover the longest particle life. Needs seeding = 'frame'.
const PFIELDS = ['startSpeed', 'age', 'life', 'speedModifier', 'uvTile'];
const VFIELDS = ['startColor', 'startSize', 'position', 'velocity', 'size', 'color'];
const cloneEmission = (e) => ({ ...e, previousWorldPos: e.previousWorldPos ? e.previousWorldPos.clone() : undefined });

export function snapshotFull(world) {
  return {
    frame: world.frame, rng: world.rng.getState(),
    systems: world.systems.map((s) => ({
      emission: cloneEmission(s.emissionState), emitEnded: s.emitEnded, n: s.particleNum,
      particles: s.particles.slice(0, s.particleNum).map((p) => {
        const o = {}; for (const f of PFIELDS) o[f] = p[f];
        for (const f of VFIELDS) o[f] = p[f].toArray ? p[f].toArray() : [p[f].x, p[f].y, p[f].z, p[f].w];
        o.rotation = typeof p.rotation === 'number' ? p.rotation : p.rotation.toArray();
        o.angularVelocity = typeof p.angularVelocity === 'number' ? p.angularVelocity : undefined;
        o.memory = JSON.parse(JSON.stringify(p.memory));
        return o;
      }),
    })),
  };
}
export function restoreFull(world, snap) {
  world.frame = snap.frame; world.rng.setState(snap.rng);
  snap.systems.forEach((ss, k) => {
    const s = world.systems[k];
    s.emissionState = cloneEmission(ss.emission); s.emitEnded = ss.emitEnded; s.particleNum = ss.n;
    ss.particles.forEach((o, i) => {
      const p = s.particles[i] ?? (s.particles[i] = new Q.SpriteParticle());
      for (const f of PFIELDS) p[f] = o[f];
      for (const f of VFIELDS) p[f].fromArray ? p[f].fromArray(o[f]) : p[f].set(...o[f]);
      if (typeof o.rotation === 'number') p.rotation = o.rotation; else p.rotation.fromArray(o.rotation);
      if (o.angularVelocity !== undefined) p.angularVelocity = o.angularVelocity;
      p.memory = JSON.parse(JSON.stringify(o.memory));
    });
  });
}
export function emitterState(world) {
  return world.systems.map((s) => ({ emission: cloneEmission(s.emissionState), emitEnded: s.emitEnded }));
}
export function restoreWindow(world, emitterStates, fromFrame, toFrame, dt = 1 / 60) {
  for (const s of world.systems) {
    s.restart();
    s.particleNum = 0;
  }
  world.systems.forEach((s, k) => { s.emissionState = cloneEmission(emitterStates[k].emission); s.emitEnded = emitterStates[k].emitEnded; });
  world.frame = fromFrame;
  while (world.frame < toFrame) world.step(dt);
}

// ---- JSON round trip ----------------------------------------------------------------------
// Effects save as three.js Object JSON (the format quarks.art exports) via emitter.toJSON() and
// load with QuarksLoader. Textures travel inside as data-URL images unless stripped.
// Gotcha: emitter.toJSON() on its own drops the materials and textures (it passes an undefined meta
// to the system and three's root-object pass has already run), so serialise from a parent Group.
// Second gotcha: three writes object.matrix, which is stale until updateMatrix() runs, so an emitter
// rotated in code and saved before the first render loses its rotation.
export function toJSON(world) {
  world.scene.updateMatrixWorld();
  const root = new THREE.Group();
  root.children = world.systems.map((s) => s.emitter); // borrow the emitters without reparenting
  const doc = root.toJSON();
  root.children = [];
  return [doc];
}
export function fromJSON(world, jsons) {
  const loader = new Q.QuarksLoader();
  const out = [];
  for (const j of jsons) {
    const obj = loader.parse(j, () => {});
    obj.traverse((child) => {
      if (child.type === 'ParticleEmitter') { world.batch.addSystem(child.system); world.systems.push(child.system); }
    });
    world.scene.add(obj); out.push(obj);
  }
  return out;
}

// ---- benchmark emitter ---------------------------------------------------------------------
// A typical mid-weight effect: sphere shape, random life/speed/size/colour, size and colour
// curves, gravity and spin. Steady state holds about `perEmitter` live particles.
export function benchSystem(world, i, n, perEmitter) {
  return world.run(() => {
    const cols = Math.ceil(Math.sqrt(n));
    const ps = new Q.ParticleSystem({
      duration: 2, looping: true, worldSpace: true,
      startLife: I(0.8, 1.2), startSpeed: I(1, 3), startSize: I(0.05, 0.15),
      startColor: new Q.ColorRange(V4(1, 0.6, 0.8, 1), V4(0.6, 0.9, 1, 1)),
      startRotation: I(0, 6.28),
      maxParticle: Math.ceil(perEmitter * 1.6),
      emissionOverTime: C(Math.max(1, Math.round(perEmitter / 60)) * 60), // same integer-per-step rate as nebula
      shape: new Q.SphereEmitter({ radius: 0.3, thickness: 1, arc: Math.PI * 2 }),
      material: world.mats.additive,
      renderMode: Q.RenderMode.BillBoard,
      ...tiles(TILES.star4),
    });
    ps.addBehavior(new Q.SizeOverLife(bez(0.2, 1, 1, 0)));
    ps.addBehavior(new Q.ColorOverLife(new Q.Gradient([[V3(1, 1, 1), 0], [V3(1, 0.7, 0.9), 1]], [[1, 0], [0, 1]])));
    ps.addBehavior(new Q.ApplyForce(V3(0, -1, 0), C(2)));
    ps.addBehavior(new Q.RotationOverLife(I(-2, 2)));
    ps.emitter.position.set((i % cols) * 1.5 - cols * 0.75, 1 + Math.floor(i / cols) * 1.5, 0);
    ps.emitter.name = `bench-${i}`;
    return ps;
  });
}

// ---- anime effects -------------------------------------------------------------------------
// Each returns the systems; the caller positions the group. Times are seconds.
export const effects = {
  /** Impact: one hard starburst flash, a shock ring and ~40 stretched sparks with gravity. */
  impact(world) {
    return world.run(() => {
      const m = world.mats;
      const flash = new Q.ParticleSystem({
        duration: 1, looping: false, worldSpace: true, startLife: C(0.16), startSpeed: C(0), startSize: C(0.6),
        startColor: new Q.ConstantColor(V4(1, 1, 0.85, 1)), startRotation: I(0, 0.8), maxParticle: 4,
        emissionOverTime: C(0), emissionBursts: [{ time: 0, count: C(1), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new Q.PointEmitter(), material: m.additive, renderMode: Q.RenderMode.BillBoard, ...tiles(TILES.flash),
      });
      flash.addBehavior(new Q.SizeOverLife(bez(0.6, 1.3, 1.1, 0.0)));
      const ring = new Q.ParticleSystem({
        duration: 1, looping: false, worldSpace: true, startLife: C(0.24), startSpeed: C(0), startSize: C(1.0),
        startColor: new Q.ConstantColor(V4(1, 0.95, 0.7, 1)), maxParticle: 4,
        emissionOverTime: C(0), emissionBursts: [{ time: 0, count: C(1), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new Q.PointEmitter(), material: m.additive, renderMode: Q.RenderMode.BillBoard, ...tiles(TILES.ring),
      });
      ring.addBehavior(new Q.SizeOverLife(bez(0.15, 0.6, 0.9, 1.0)));
      ring.addBehavior(new Q.ColorOverLife(new Q.Gradient([[V3(1, 1, 1), 0], [V3(1, 0.8, 0.4), 1]], [[0.5, 0], [1, 0.4], [0, 1]])));
      const sparks = new Q.ParticleSystem({
        duration: 1, looping: false, worldSpace: true, startLife: I(0.22, 0.42), startSpeed: I(5, 11), startSize: I(0.035, 0.06),
        startColor: new Q.ConstantColor(V4(1, 1, 1, 1)), maxParticle: 64,
        emissionOverTime: C(0), emissionBursts: [{ time: 0, count: C(40), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new Q.SphereEmitter({ radius: 0.05, thickness: 1, arc: Math.PI * 2 }), material: m.additive,
        // stretched length = size x (lengthFactor + speedFactor x speed), Unity's convention
        renderMode: Q.RenderMode.StretchedBillBoard, speedFactor: 0.35, lengthFactor: 1, ...tiles(TILES.spark),
      });
      sparks.addBehavior(new Q.SpeedOverLife(bez(1, 0.6, 0.3, 0.15)));
      sparks.addBehavior(new Q.ApplyForce(V3(0, -1, 0), C(9)));
      sparks.addBehavior(new Q.ColorOverLife(new Q.Gradient([[V3(1, 1, 1), 0], [V3(1, 0.85, 0.3), 0.4], [V3(1, 0.4, 0.1), 1]], [[1, 0], [1, 0.7], [0, 1]])));
      return [ring, flash, sparks];
    });
  },
  /** Sparkles: four-point glints that pop in and out, plus tiny glitter dots drifting up. */
  sparkles(world) {
    return world.run(() => {
      const m = world.mats;
      const glints = new Q.ParticleSystem({
        duration: 2, looping: true, worldSpace: true, startLife: I(0.5, 0.9), startSpeed: I(0.05, 0.2), startSize: I(0.12, 0.26),
        startColor: new Q.RandomColor(V4(1, 0.75, 0.95, 1), V4(0.75, 0.95, 1, 1)), startRotation: C(0), maxParticle: 64,
        emissionOverTime: C(26), shape: new Q.SphereEmitter({ radius: 0.55, thickness: 1, arc: Math.PI * 2 }),
        material: m.additive, renderMode: Q.RenderMode.BillBoard, ...tiles(TILES.star4), prewarm: true,
      });
      glints.addBehavior(new Q.SizeOverLife(bez(0, 1.25, 1.0, 0)));
      glints.addBehavior(new Q.RotationOverLife(I(-1.2, 1.2)));
      const glitter = new Q.ParticleSystem({
        duration: 2, looping: true, worldSpace: true, startLife: I(0.8, 1.4), startSpeed: I(0.1, 0.35), startSize: I(0.025, 0.05),
        startColor: new Q.RandomColor(V4(1, 0.95, 0.6, 1), V4(1, 1, 1, 1)), maxParticle: 128,
        emissionOverTime: C(60), shape: new Q.SphereEmitter({ radius: 0.7, thickness: 1, arc: Math.PI * 2 }),
        material: m.additive, renderMode: Q.RenderMode.BillBoard, ...tiles(TILES.diamond), prewarm: true,
      });
      glitter.addBehavior(new Q.ApplyForce(V3(0, 1, 0), C(0.25)));
      glitter.addBehavior(new Q.ColorOverLife(new Q.Gradient([[V3(1, 1, 1), 0], [V3(1, 1, 1), 1]], [[0, 0], [1, 0.15], [1, 0.7], [0, 1]])));
      return [glints, glitter];
    });
  },
  /** Speed lines: long thin streaks rushing past along -X (character dashing toward +X). */
  speedlines(world) {
    return world.run(() => {
      const lines = new Q.ParticleSystem({
        duration: 1, looping: true, worldSpace: true, startLife: I(0.18, 0.3), startSpeed: I(14, 22), startSize: I(0.008, 0.02),
        startColor: new Q.ConstantColor(V4(1, 1, 1, 0.9)), maxParticle: 128, prewarm: true,
        emissionOverTime: C(90),
        // RectangleEmitter fires outward inside its own plane, so a flat disc is a cone with angle 0:
        // lines start across a 1.1 m radius cross-section and fly along the cone axis (+Z, turned to -X)
        shape: new Q.ConeEmitter({ radius: 1.1, angle: 0, thickness: 1, arc: Math.PI * 2 }),
        material: world.mats.normal, renderMode: Q.RenderMode.StretchedBillBoard, speedFactor: 4, lengthFactor: 0,
        ...tiles(TILES.line),
      });
      lines.addBehavior(new Q.ColorOverLife(new Q.Gradient([[V3(1, 1, 1), 0], [V3(1, 1, 1), 1]], [[0, 0], [0.9, 0.2], [0.9, 0.7], [0, 1]])));
      lines.emitter.rotation.y = -Math.PI / 2; // rectangle emits along its +Z; turn it to fire along -X
      return [lines];
    });
  },
  /** Emote: a sweat drop that pops in with overshoot, slides down a little and fades. */
  sweatdrop(world) {
    return world.run(() => {
      const drop = new Q.ParticleSystem({
        duration: 2, looping: true, worldSpace: false, startLife: C(1.5), startSpeed: C(0), startSize: C(0.22),
        startColor: new Q.ConstantColor(V4(1, 1, 1, 1)), maxParticle: 2,
        emissionOverTime: C(0), emissionBursts: [{ time: 0, count: C(1), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new Q.PointEmitter(), material: world.mats.normal, renderMode: Q.RenderMode.BillBoard, ...tiles(TILES.drop),
      });
      // pop: 0 -> 1.25 -> 1 inside the first 15% of life, then hold
      drop.addBehavior(new Q.SizeOverLife(new Q.PiecewiseBezier([[new Q.Bezier(0, 1.3, 1.15, 1), 0], [new Q.Bezier(1, 1, 1, 1), 0.15]])));
      drop.addBehavior(new Q.ApplyForce(V3(0, -1, 0), C(0.12)));
      drop.addBehavior(new Q.ColorOverLife(new Q.Gradient([[V3(1, 1, 1), 0], [V3(1, 1, 1), 1]], [[1, 0], [1, 0.8], [0, 1]])));
      return [drop];
    });
  },
};
