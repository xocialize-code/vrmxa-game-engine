// Crowd agents driving Rapier kinematic character controllers, the way the engine moves characters
// (never by teleporting a body). Per fixed step:
//
//   1. sync     write each body's foot position into its crowd agent (mode 'sync'), so the crowd
//               plans from where the character really is
//   2. crowd    crowd.update(dt): paths, steering, agent-agent avoidance
//   3. move     agent velocity × dt (+ gravity) → computeColliderMovement → setNextKinematicTranslation
//   4. physics  world.step()
//   5. drift    horizontal distance between the agent and its body; past DRIFT_HARD the agent is
//               teleported to the body and its target re-requested (counted)
//
// Mode 'free' skips step 1 and the hard reset, to show what happens when the two run open loop.
// The characters ignore each other in the controller (collision groups): the crowd owns agent-agent
// separation; physics owns the world (walls, stairs, slopes, the door collider).
import { groundMesh, fixedBoxes, rng } from './level.js';
import { DOOR_BLOCK, AGENT } from './geometry.js';
import { hashState, stats, randomNavPoint } from './util.js';

export const DT = 1 / 60;
const GRAVITY = -9.81;
const HALF_HEIGHT = AGENT.height / 2 - AGENT.radius; // capsule: 0.55 + 2 × 0.3 = 1.7 m
const FOOT_TO_CENTRE = AGENT.height / 2;
const OFFSET = 0.02; // the controller's skin
const DRIFT_HARD = 0.5;
const DOOR_CLOSE_AT = 200, DOOR_OPEN_AT = 400;

// Groups: characters are in group 2; the controller's query only accepts colliders that are not.
const CHAR_GROUPS = (0x0002 << 16) | 0xfffd;
const QUERY_GROUPS = (0x0001 << 16) | 0xfffd;

let loaded = null;
export async function loadRapier() {
  if (loaded) return loaded;
  const mod = await import('@dimforge/rapier3d-deterministic-compat');
  const R = mod.default ?? mod;
  const t0 = performance.now();
  await R.init();
  loaded = { R, initMs: performance.now() - t0, version: R.version?.() ?? 'unknown' };
  return loaded;
}

export function createCoupled(R, be, n, { mode = 'sync', seed = 1 } = {}) {
  const world = new R.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = DT;
  const g = groundMesh();
  world.createCollider(R.ColliderDesc.trimesh(g.vertices, g.indices), world.createRigidBody(R.RigidBodyDesc.fixed()));
  for (const b of fixedBoxes()) {
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(b.pos.x, b.pos.y, b.pos.z).setRotation(b.rot));
    world.createCollider(R.ColliderDesc.cuboid(b.half.x, b.half.y, b.half.z), body);
  }
  // The door as one fixed collider toggled with the navmesh obstacle (a hinged door would do too).
  const doorBody = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(DOOR_BLOCK.center.x, DOOR_BLOCK.center.y, DOOR_BLOCK.center.z));
  const doorCol = world.createCollider(R.ColliderDesc.cuboid(DOOR_BLOCK.half.x, DOOR_BLOCK.half.y, 0.04), doorBody);
  doorCol.setEnabled(false);

  const controller = world.createCharacterController(OFFSET);
  controller.setMaxSlopeClimbAngle(0.7853981633974483); // 45°, as the navmesh
  controller.setMinSlopeSlideAngle(0.5235987755982988);
  controller.enableAutostep(AGENT.climb, 0.2, true);
  controller.enableSnapToGround(0.3);

  world.step(); // build the query pipeline so the spawn ray casts see the static colliders

  be.crowdCreate(n);
  const rand = rng(seed);
  const chars = [];
  let maxNavGap = 0;
  for (let i = 0; i < n; i++) {
    const p = randomNavPoint(be, rand);
    be.addAgent(p);
    const target = randomNavPoint(be, rand);
    be.setTarget(i, target);
    // The navmesh surface is within about one cell height of the physics surface, above or below
    // it. Spawning a capsule from the navmesh height can start it inside the trimesh, and the
    // character controller never depenetrates. So snap the spawn to the physics ground.
    const hit = world.castRay(new R.Ray({ x: p[0], y: p[1] + 1, z: p[2] }, { x: 0, y: -1, z: 0 }), 3, true, undefined, QUERY_GROUPS);
    const groundY = hit ? p[1] + 1 - hit.timeOfImpact : p[1];
    maxNavGap = Math.max(maxNavGap, Math.abs(groundY - p[1]));
    const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(p[0], groundY + FOOT_TO_CENTRE + OFFSET, p[2]));
    const col = world.createCollider(R.ColliderDesc.capsule(HALF_HEIGHT, AGENT.radius).setCollisionGroups(CHAR_GROUPS), body);
    chars.push({ body, col, vy: 0, target });
  }
  world.step(); // settle the query pipeline before the first controller query

  const ap = [0, 0, 0], av = [0, 0, 0], foot = [0, 0, 0];
  return {
    world,
    chars,
    run(steps, { time = true } = {}) {
      const crowdMs = [], moveMs = [], totalMs = [], driftEach = [];
      let maxDrift = 0, resets = 0, arrivals = 0, doorMs = [];
      for (let s = 0; s < steps; s++) {
        if (s === DOOR_CLOSE_AT || s === DOOR_OPEN_AT) {
          const close = s === DOOR_CLOSE_AT;
          doorMs.push(be.setDoor(close).ms);
          doorCol.setEnabled(close);
        }
        const t0 = time ? performance.now() : 0;
        if (mode === 'sync') {
          for (let i = 0; i < n; i++) {
            const t = chars[i].body.translation();
            foot[0] = t.x; foot[1] = t.y - FOOT_TO_CENTRE - OFFSET; foot[2] = t.z;
            be.syncPosition(i, foot);
          }
        }
        be.step(DT);
        const t1 = time ? performance.now() : 0;
        for (let i = 0; i < n; i++) {
          const c = chars[i];
          be.getVelocity(i, av);
          c.vy += GRAVITY * DT;
          controller.computeColliderMovement(c.col, { x: av[0] * DT, y: c.vy * DT, z: av[2] * DT }, R.QueryFilterFlags.EXCLUDE_SENSORS, QUERY_GROUPS);
          const mv = controller.computedMovement();
          c.grounded = controller.computedGrounded();
          if (c.grounded && c.vy < 0) c.vy = 0;
          const t = c.body.translation();
          c.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
        }
        world.step();
        const t2 = time ? performance.now() : 0;
        // Drift: agent (after its own integration) vs the body (after physics).
        let sum = 0;
        for (let i = 0; i < n; i++) {
          const c = chars[i];
          be.getPosition(i, ap);
          const t = c.body.translation();
          const dx = ap[0] - t.x, dz = ap[2] - t.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          sum += d;
          if (d > maxDrift) maxDrift = d;
          if (mode === 'sync' && d > DRIFT_HARD) {
            be.teleport(i, [t.x, t.y - FOOT_TO_CENTRE - OFFSET, t.z]);
            be.setTarget(i, c.target);
            resets++;
          }
          const tx = t.x - c.target[0], tz = t.z - c.target[2];
          if (tx * tx + tz * tz < 0.36) {
            arrivals++;
            c.target = randomNavPoint(be, rand);
            be.setTarget(i, c.target);
          }
        }
        driftEach.push(sum / n);
        if (time) { crowdMs.push(t1 - t0); moveMs.push(t2 - t1); totalMs.push(t2 - t0); }
      }
      const state = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const t = chars[i].body.translation(); state[i * 3] = t.x; state[i * 3 + 1] = t.y; state[i * 3 + 2] = t.z; }
      return {
        hash: hashState(state),
        arrivals, resets, maxNavGap: +maxNavGap.toFixed(3),
        stuck: chars.filter((c) => !c.grounded).length,
        drift: { meanOfMeans: +(driftEach.reduce((a, b) => a + b, 0) / driftEach.length).toFixed(4), max: +maxDrift.toFixed(3), lastMean: +driftEach[driftEach.length - 1].toFixed(3) },
        doorMs: doorMs.map((x) => +x.toFixed(3)),
        timing: time ? { crowd: stats(crowdMs), controllersAndPhysics: stats(moveMs), total: stats(totalMs) } : null,
      };
    },
    /** Door by hand (the stage): navmesh obstacle and physics collider together. */
    setDoor(blocked) {
      const r = be.setDoor(blocked);
      doorCol.setEnabled(blocked);
      return r;
    },
    /** Send agent i to p (the stage's click). */
    sendTo(i, p) { chars[i].target = p; be.setTarget(i, p); },
    free() { world.free(); },
  };
}
