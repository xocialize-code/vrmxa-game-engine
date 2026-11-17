// three-nebula 13.3.0 behind the same adapter shape. Since 13.0.0 it seeds itself
// (System.setSeed) and never reads Math.random in the simulation, so the adapter only owns stepping.
// Units: forces are scaled x100 internally (Proton heritage), so gravity is given in "hundredths".
import * as THREE from 'three';
import System, {
  Emitter, Rate, Span, Position, Mass, Radius, Life, RadialVelocity, Vector3D, Alpha, Scale, Color,
  Gravity, Rotate, Body, SphereZone, PointZone, Rotation, Force, BoxZone, VectorVelocity,
} from 'three-nebula';
import { hashRows } from '../core/state.js';
import { withPortableMath } from '../core/detmath.js';
import { TILES, tileCanvasTexture, buildTilePixels } from '../core/atlas.js';

export const id = 'nebula';
export const label = 'three-nebula 13.3.0';

// One cache per world, never global: GPURenderer stamps `texture.textureIndex` on first use and skips
// adding a stamped texture to its atlas, so a texture shared with a second GPURenderer renders
// garbage there (found by the pixel scrub test: same particle state, different pixels).
let spriteCache = new Map();
function sprite(tile, blending = THREE.AdditiveBlending) {
  const key = `${tile}:${blending}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  let map;
  if (typeof document !== 'undefined') map = tileCanvasTexture(THREE, tile);
  else { const p = buildTilePixels(tile, 32); map = new THREE.DataTexture(p.data, 32, 32); }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, blending, transparent: true, depthWrite: false }));
  spriteCache.set(key, s);
  return s;
}

export function createWorld({ seed = 1, seeding = 'seed', scene = null, renderer = null, math = 'native' } = {}) {
  scene ??= new THREE.Scene();
  spriteCache = new Map(); // emitters built after this call belong to this world
  const system = new System();
  if (seeding !== 'none') system.setSeed(seed);
  if (renderer) system.addRenderer(renderer);
  const world = {
    lib: id, scene, system, seed, seeding, frame: 0, emitters: [],
    add(emitters) {
      for (const e of [emitters].flat()) { system.addEmitter(e); world.emitters.push(e); }
      // addEmitter re-derives each emitter's seed from the system seed and its index
      if (seeding !== 'none') system.setSeed(seed);
      return emitters;
    },
    step(dt = 1 / 60) { if (math === 'portable') withPortableMath(() => system.update(dt)); else system.update(dt); world.frame++; },
    count() { return system.getCount(); },
    rows() {
      const rows = [];
      for (const e of system.emitters) for (const p of e.particles) {
        rows.push([p.position.x, p.position.y, p.position.z, p.velocity.x, p.velocity.y, p.velocity.z,
          p.age, p.life, p.radius, p.scale, p.color.r, p.color.g, p.color.b, p.alpha, p.rotation.z, 0]);
      }
      return rows;
    },
    hash() { return hashRows(world.rows()); },
    dispose() { system.destroy(); },
  };
  return world;
}

export const perStep = (perEmitter) => Math.max(1, Math.round(perEmitter / 60));

/** Same emitter as quarks' benchSystem: sphere, random life/speed/size, alpha/scale/colour curves, gravity, spin. */
export function benchSystem(world, i, n, perEmitter) {
  const cols = Math.ceil(Math.sqrt(n));
  const e = new Emitter();
  // Rate(numPan, timePan) fires at most once per update and drops the remainder, so the only exact
  // continuous rate is an INTEGER count every step. A fractional count loops forever in 13.3.0
  // (`for (; n--;)` never reaches 0), which is the OOM this spike hit first.
  e.setRate(new Rate(new Span(perStep(perEmitter)), new Span(1 / 60)))
    .setInitializers([
      new Position(new SphereZone(0, 0, 0, 0.3)),
      new Mass(1), new Radius(0.05, 0.15), new Life(0.8, 1.2),
      new RadialVelocity(new Span(1, 3), new Vector3D(0, 1, 0), 180),
      // Rotation(x, y, z) takes fixed angles only and, with its default useEmitterRotation = true,
      // throws (particle.parent is null at init) in 13.3.0, so there is no random start angle.
      new Body(sprite(TILES.star4)),
    ])
    .setBehaviours([
      new Alpha(1, 0), new Scale(1, 0.2),
      new Color(new THREE.Color(1, 1, 1), new THREE.Color(1, 0.7, 0.9)),
      new Gravity(0.02), // x100 internally: 2 m/s^2
      new Rotate(0, 0, new Span(-0.03, 0.03)),
    ]);
  e.position.x = (i % cols) * 1.5 - cols * 0.75;
  e.position.y = 1 + Math.floor(i / cols) * 1.5;
  e.emit();
  return e;
}

export const effects = {
  /** Impact: flash + ring + 40 sparks. Nebula has no stretched billboards, so sparks are dots. */
  impact() {
    const burst = (count, life, init, beh, tile) => {
      const e = new Emitter();
      e.setRate(new Rate(new Span(count), new Span(99))).setLife(1)
        .setInitializers([new Position(new PointZone(0, 0, 0)), new Mass(1), new Life(...life), ...init, new Body(sprite(tile))])
        .setBehaviours(beh);
      e.emit(1, 0.4);
      return e;
    };
    // no Color behaviour = black particles (invisible when additive), so every emitter sets one
    const flash = burst(1, [0.16], [new Radius(0.9)], [new Scale(1, 0.3), new Color('#ffffee', '#ffdd88')], TILES.flash);
    const ring = burst(1, [0.22], [new Radius(1.6)], [new Scale(0.2, 1.1), new Alpha(1, 0), new Color('#ffffff', '#ffcc66')], TILES.ring);
    const sparks = burst(40, [0.22, 0.42], [new Radius(0.06, 0.1), new RadialVelocity(new Span(5, 11), new Vector3D(0, 1, 0), 180)],
      [new Gravity(0.09), new Alpha(1, 0), new Color('#ffffff', '#ff6619')], TILES.dot);
    return [ring, flash, sparks];
  },
  /** Sparkles: pop in/out glints + glitter. Scale(a, b) is a two-point ramp, so no pop-in curve. */
  sparkles() {
    const glints = new Emitter();
    glints.setRate(new Rate(new Span(1), new Span(1 / 26)))
      .setInitializers([new Position(new SphereZone(0, 0, 0, 0.55)), new Mass(1), new Radius(0.12, 0.26), new Life(0.5, 0.9),
        new RadialVelocity(new Span(0.05, 0.2), new Vector3D(0, 1, 0), 180), new Body(sprite(TILES.star4))])
      // no Rotate: GPURenderer rotates the UV about the centre of the whole atlas, not the tile, so a
      // rotating particle samples the wrong part of the atlas once a system uses two textures
      .setBehaviours([new Scale(1.2, 0.2), new Color('#ffbff2', '#bff2ff')]);
    glints.emit();
    const glitter = new Emitter();
    glitter.setRate(new Rate(new Span(1), new Span(1 / 60)))
      .setInitializers([new Position(new SphereZone(0, 0, 0, 0.7)), new Mass(1), new Radius(0.025, 0.05), new Life(0.8, 1.4),
        new RadialVelocity(new Span(0.1, 0.35), new Vector3D(0, 1, 0), 180), new Body(sprite(TILES.diamond))])
      .setBehaviours([new Alpha(1, 0), new Color('#fff299', '#ffffff'), new Force(0, 0.0025, 0)]);
    glitter.emit();
    return [glints, glitter];
  },
};
