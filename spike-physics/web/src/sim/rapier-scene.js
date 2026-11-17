// The spike's physics world on Rapier, independent of three.js so it runs in Node, a browser and
// the WKWebView wrapper alike. The stage (src/stage) renders it; the tests (tests.js) hash it.
import { DOOR, CLOTH, PLAYER, groundMesh, fixedBoxes, dynamicBoxes } from './level.js';

export const DT = 1 / 60;
export const GRAVITY = -9.81;

export const VARIANTS = {
  standard: '@dimforge/rapier3d-compat',
  simd: '@dimforge/rapier3d-simd-compat',
  deterministic: '@dimforge/rapier3d-deterministic-compat',
};

const loaded = new Map();

/** Loads and initialises one Rapier build. The -compat builds carry their WASM inline. */
export async function loadRapier(variant = 'deterministic') {
  if (loaded.has(variant)) return loaded.get(variant);
  let mod;
  // Literal specifiers so the bundler can see them.
  if (variant === 'standard') mod = await import('@dimforge/rapier3d-compat');
  else if (variant === 'simd') mod = await import('@dimforge/rapier3d-simd-compat');
  else if (variant === 'deterministic') mod = await import('@dimforge/rapier3d-deterministic-compat');
  else throw new Error(`unknown Rapier variant ${variant}`);
  const R = mod.default ?? mod;
  const t0 = performance.now();
  await R.init();
  const initMs = performance.now() - t0;
  const entry = { R, initMs, version: R.version?.() ?? 'unknown' };
  loaded.set(variant, entry);
  return entry;
}

/**
 * Builds the world. Returns a `Sim`: the world, the handles of what matters, and `step(input)`.
 * Options: boxes (count), cloth (bool), player (bool), door (bool).
 */
export function createSim(R, opts = {}) {
  const { boxes = 300, cloth = true, player = true, door = true } = opts;
  const world = new R.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = DT;
  return attach(R, world, buildContents(R, world, { boxes, cloth, player, door }), { boxes, cloth, player, door });
}

function buildContents(R, world, { boxes, cloth, player, door }) {
  const h = { boxes: [], fixed: [] };

  // Ground: one trimesh on a fixed body.
  const g = groundMesh();
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed());
  world.createCollider(R.ColliderDesc.trimesh(g.vertices, g.indices), ground);
  h.ground = ground.handle;

  for (const b of fixedBoxes()) {
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(b.pos.x, b.pos.y, b.pos.z).setRotation(b.rot));
    world.createCollider(R.ColliderDesc.cuboid(b.half.x, b.half.y, b.half.z), body);
    h.fixed.push(body.handle);
  }

  for (const b of dynamicBoxes(boxes)) {
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(b.pos.x, b.pos.y, b.pos.z));
    world.createCollider(R.ColliderDesc.cuboid(b.half.x, b.half.y, b.half.z).setDensity(200), body);
    h.boxes.push(body.handle);
  }

  if (door) {
    const { hinge, halfExtents: he, sensor } = DOOR;
    const hingeBody = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(hinge.x, hinge.y, hinge.z));
    const doorBody = world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(hinge.x + he.x, hinge.y, hinge.z).setAngularDamping(2),
    );
    world.createCollider(R.ColliderDesc.cuboid(he.x, he.y, he.z).setDensity(250), doorBody);
    const jd = R.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: -he.x, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const joint = world.createImpulseJoint(jd, hingeBody, doorBody, true);
    joint.setLimits(-1.7, 1.7);
    joint.configureMotorPosition(0, 400, 60);
    h.hinge = hingeBody.handle;
    h.door = doorBody.handle;
    h.doorJoint = joint.handle;

    // The trigger volume: a sensor on a fixed body. Kinematic-vs-fixed pairs are off by default,
    // so turn them on or the (kinematic) player never registers.
    const sBody = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(sensor.center.x, sensor.center.y, sensor.center.z));
    const sCol = world.createCollider(
      R.ColliderDesc.cuboid(sensor.halfExtents.x, sensor.halfExtents.y, sensor.halfExtents.z)
        .setSensor(true)
        .setActiveCollisionTypes(R.ActiveCollisionTypes.DEFAULT | R.ActiveCollisionTypes.KINEMATIC_FIXED),
      sBody,
    );
    h.sensor = sCol.handle;
  }

  if (player) {
    const { start, halfHeight, radius } = PLAYER;
    const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y, start.z));
    const col = world.createCollider(R.ColliderDesc.capsule(halfHeight, radius), body);
    h.player = body.handle;
    h.playerCollider = col.handle;
  }

  if (cloth && R.SoftBodyDesc) {
    const c = CLOTH;
    const desc = R.SoftBodyDesc.cloth(c.origin, c.du, c.dv, c.nu, c.nv).setMass(1.5);
    const sb = world.createSoftBody(desc);
    // Pin the top row. The particle order of the generator isn't documented, so find the row by
    // position instead of assuming an index layout.
    for (let i = 0; i < sb.numParticles(); i++) {
      if (sb.particlePosition(i).y > c.origin.y - 1e-4) sb.setParticlePinned(i, true);
    }
    h.cloth = sb.handle;
  }
  return h;
}

/** Wraps a world (fresh or restored from a snapshot) with the per-step logic. */
function attach(R, world, h, opts, js = { vy: 0, step: 0, doorOpen: false }) {
  let controller = null;
  if (opts.player) {
    controller = world.createCharacterController(0.02);
    controller.setMaxSlopeClimbAngle(0.7853981633974483); // 45°
    controller.setMinSlopeSlideAngle(0.5235987755982988); // 30°
    controller.enableAutostep(0.35, 0.2, true);
    controller.enableSnapToGround(0.3);
    controller.setApplyImpulsesToDynamicBodies(true);
    controller.setCharacterMass(70);
  }

  const sim = {
    R, world, handles: h, opts, js, controller,
    get grounded() { return js.grounded ?? false; },

    /** One fixed step. input: { x, z, jump } in world space, x/z a unit-or-zero direction. */
    step(input = { x: 0, z: 0, jump: false }) {
      if (controller) {
        const body = world.getRigidBody(h.player);
        const col = world.getCollider(h.playerCollider);
        if (js.grounded && input.jump) js.vy = PLAYER.jump;
        js.vy += GRAVITY * DT;
        const desired = { x: input.x * PLAYER.speed * DT, y: js.vy * DT, z: input.z * PLAYER.speed * DT };
        controller.computeColliderMovement(col, desired, R.QueryFilterFlags.EXCLUDE_SENSORS);
        const mv = controller.computedMovement();
        js.grounded = controller.computedGrounded();
        if (js.grounded && js.vy < 0) js.vy = 0;
        const p = body.translation();
        body.setNextKinematicTranslation({ x: p.x + mv.x, y: p.y + mv.y, z: p.z + mv.z });
      }
      world.step();
      if (h.sensor !== undefined && h.playerCollider !== undefined) {
        const inside = world.intersectionPair(world.getCollider(h.sensor), world.getCollider(h.playerCollider));
        if (inside !== js.doorOpen) {
          js.doorOpen = inside;
          world.getImpulseJoint(h.doorJoint).configureMotorPosition(inside ? DOOR.openAngle : 0, 400, 60);
        }
      }
      js.step++;
    },

    /** World snapshot plus the little JS-side state (vertical speed, door latch, step count). */
    snapshot() {
      return { bytes: world.takeSnapshot(), js: { ...js } };
    },

    free() { world.free(); },
  };
  return sim;
}

/** Restores a snapshot into a new, independent Sim (the old one keeps running untouched). */
export function restoreSim(R, snap, source) {
  const world = R.World.restoreSnapshot(snap.bytes);
  // Handles survive a snapshot, so the source sim's handle table is reused as-is. The character
  // controller is not part of the world and is recreated by attach().
  return attach(R, world, source.handles, source.opts, { ...snap.js });
}

/** Every number that describes the state, as one Float32Array (for hashing and comparing). */
export function stateVector(sim) {
  const { world, handles: h } = sim;
  const out = [];
  const push = (b) => {
    const t = b.translation(), r = b.rotation();
    out.push(t.x, t.y, t.z, r.x, r.y, r.z, r.w);
  };
  for (const id of h.boxes) push(world.getRigidBody(id));
  if (h.door !== undefined) push(world.getRigidBody(h.door));
  if (h.player !== undefined) push(world.getRigidBody(h.player));
  if (h.cloth !== undefined) {
    const sb = world.getSoftBody(h.cloth);
    if (sb) out.push(...sb.particlePositions());
  }
  return new Float32Array(out);
}
