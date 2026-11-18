// PhysicsWorld: the engine-neutral adapter (physics-engine-research.md), implemented on Rapier. Engine
// code talks to this, never to Rapier, so Jolt (or Box3D) stays a swap rather than a rewrite. Plain
// arrays in and out ([x, y, z], [x, y, z, w]); handles are opaque numbers (Rapier's are bit-cast
// floats: use them as keys, never print them).
import { DT } from '@vrmxg/core';
import { Layers } from './layers.js';

const v = (a) => ({ x: a[0], y: a[1], z: a[2] });
const q = (a) => ({ x: a[0], y: a[1], z: a[2], w: a[3] });
const arr3 = (o) => [o.x, o.y, o.z];
const arr4 = (o) => [o.x, o.y, o.z, o.w];

/**
 * @typedef {object} ShapeSpec
 * @property {'box'|'sphere'|'capsule'|'cylinder'|'convex'|'trimesh'} shape
 * @property {number[]} [size] box: full extents in metres (as glTF KHR shapes; Rapier takes half)
 * @property {number} [radius] sphere, capsule, cylinder
 * @property {number} [height] capsule (total, caps included, as Godot), cylinder
 * @property {Float32Array} [vertices] convex, trimesh
 * @property {Uint32Array} [indices] trimesh
 */

export class PhysicsWorld {
  /**
   * @param {any} R initialised Rapier module (loadRapier())
   * @param {{ gravity?: number[], layers?: Layers, substeps?: number }} [opts]
   */
  constructor(R, { gravity = [0, -9.81, 0], layers = new Layers(), substeps = 1 } = {}) {
    this.R = R;
    this.layers = layers;
    this.substeps = substeps;
    this.world = new R.World(v(gravity));
    this.world.timestep = DT / substeps;
    this.events = new R.EventQueue(true);
    /**
     * Debug draw's ray tap: called with (origin, dir, maxDistance, distance | null) for every raycast
     * when set. Presentation only: it must record, never change the world.
     * @type {null | ((origin: number[], dir: number[], maxDistance: number, distance: number | null) => void)}
     */
    this.onRay = null;
    /** Character controllers made by createCharacterController (rebuilt after restore). */
    this.controllers = new Set();
  }

  // ---------------------------------------------------------------- bodies, colliders, joints

  /**
   * @param {{ type?: 'dynamic'|'kinematic'|'fixed', p?: number[], q?: number[], linearDamping?: number, angularDamping?: number, ccd?: boolean }} spec
   * @returns {number} body handle
   */
  createBody({ type = 'dynamic', p = [0, 0, 0], q: rot = [0, 0, 0, 1], linearDamping = 0, angularDamping = 0, ccd = false }) {
    const R = this.R;
    const desc = type === 'fixed' ? R.RigidBodyDesc.fixed() : type === 'kinematic' ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic();
    desc.setTranslation(p[0], p[1], p[2]).setRotation(q(rot)).setLinearDamping(linearDamping).setAngularDamping(angularDamping).setCcdEnabled(ccd);
    // A kinematic body is moved by its node every step; once asleep, Rapier ignores its next pose and its
    // collider stays behind (a character standing still for a second then can't walk).
    if (type === 'kinematic') desc.setCanSleep(false);
    return this.world.createRigidBody(desc).handle;
  }

  /** @param {ShapeSpec} s */
  shapeDesc(s) {
    const R = this.R;
    switch (s.shape) {
      case 'box': { const z = s.size ?? [1, 1, 1]; return R.ColliderDesc.cuboid(z[0] / 2, z[1] / 2, z[2] / 2); }
      case 'sphere': return R.ColliderDesc.ball(s.radius ?? 0.5);
      case 'capsule': { const r = s.radius ?? 0.3; return R.ColliderDesc.capsule(Math.max(0, (s.height ?? 1.8) / 2 - r), r); }
      case 'cylinder': return R.ColliderDesc.cylinder((s.height ?? 1) / 2, s.radius ?? 0.5);
      case 'convex': if (!s.vertices) throw new Error('convex collider needs vertices'); return R.ColliderDesc.convexHull(s.vertices);
      case 'trimesh': if (!s.vertices || !s.indices) throw new Error('trimesh collider needs vertices and indices'); return R.ColliderDesc.trimesh(s.vertices, s.indices);
      default: throw new Error(`unknown collider shape "${s.shape}"`);
    }
  }

  /**
   * @param {number} body handle of the body it moves with
   * @param {ShapeSpec & { p?: number[], q?: number[], sensor?: boolean, friction?: number, restitution?: number, mass?: number, layer?: string, events?: boolean }} spec
   *   p / q: pose relative to the body
   * @returns {number} collider handle
   */
  createCollider(body, spec) {
    const R = this.R;
    const d = this.shapeDesc(spec);
    if (spec.p) d.setTranslation(spec.p[0], spec.p[1], spec.p[2]);
    if (spec.q) d.setRotation(q(spec.q));
    if (spec.friction !== undefined) d.setFriction(spec.friction);
    if (spec.restitution !== undefined) d.setRestitution(spec.restitution);
    if (spec.mass !== undefined) d.setMass(spec.mass);
    d.setCollisionGroups(this.layers.groups(spec.layer));
    if (spec.sensor) {
      d.setSensor(true);
      // Sensors don't see kinematic bodies unless KINEMATIC_FIXED is on (spike gotcha 2).
      d.setActiveCollisionTypes(R.ActiveCollisionTypes.DEFAULT | R.ActiveCollisionTypes.KINEMATIC_FIXED | R.ActiveCollisionTypes.KINEMATIC_KINEMATIC);
    }
    if (spec.sensor || spec.events) d.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    return this.world.createCollider(d, this.world.getRigidBody(body)).handle;
  }

  /** Switch collision events on or off for a collider (contact signals cost only when used). */
  setColliderEvents(collider, on) { this.world.getCollider(collider).setActiveEvents(on ? this.R.ActiveEvents.COLLISION_EVENTS : this.R.ActiveEvents.NONE); }

  /** Set a collider's mass after the fact (inertia follows from its shape). */
  setColliderMass(collider, mass) { this.world.getCollider(collider).setMass(mass); }
  /** Shape volume in m³, for sharing a body's mass among its colliders. */
  colliderVolume(collider) { return this.world.getCollider(collider).volume(); }

  /**
   * A revolute (hinge) joint with optional limits and a position motor.
   * @param {number} a body handle
   * @param {number} b body handle
   * @param {{ anchorA?: number[], anchorB?: number[], axis?: number[], limits?: number[], motor?: { target: number, stiffness: number, damping: number }, contacts?: boolean }} spec
   *   contacts: whether the two jointed bodies collide with each other (Rapier's default, true)
   */
  createRevolute(a, b, { anchorA = [0, 0, 0], anchorB = [0, 0, 0], axis = [0, 1, 0], limits, motor, contacts = true }) {
    const jd = this.R.JointData.revolute(v(anchorA), v(anchorB), v(axis));
    const joint = this.world.createImpulseJoint(jd, this.world.getRigidBody(a), this.world.getRigidBody(b), true);
    if (!contacts) joint.setContactsEnabled(false);
    if (limits) joint.setLimits(limits[0], limits[1]);
    if (motor) joint.configureMotorPosition(motor.target, motor.stiffness, motor.damping);
    return joint.handle;
  }
  /**
   * A prismatic (slider) joint along an axis, with optional limits and a position motor.
   * @param {number} a @param {number} b body handles
   * @param {{ anchorA?: number[], anchorB?: number[], axis?: number[], limits?: number[], motor?: { target: number, stiffness: number, damping: number }, contacts?: boolean }} spec
   */
  createPrismatic(a, b, { anchorA = [0, 0, 0], anchorB = [0, 0, 0], axis = [0, 1, 0], limits, motor, contacts = true }) {
    const jd = this.R.JointData.prismatic(v(anchorA), v(anchorB), v(axis));
    const joint = this.world.createImpulseJoint(jd, this.world.getRigidBody(a), this.world.getRigidBody(b), true);
    if (!contacts) joint.setContactsEnabled(false);
    if (limits) joint.setLimits(limits[0], limits[1]);
    if (motor) joint.configureMotorPosition(motor.target, motor.stiffness, motor.damping);
    return joint.handle;
  }

  /** A fixed joint: holds body b where it is relative to a, at the anchors (frames identity). */
  createFixedJoint(a, b, { anchorA = [0, 0, 0], anchorB = [0, 0, 0], contacts = true } = {}) {
    const id = { w: 1, x: 0, y: 0, z: 0 };
    const jd = this.R.JointData.fixed(v(anchorA), id, v(anchorB), id);
    const joint = this.world.createImpulseJoint(jd, this.world.getRigidBody(a), this.world.getRigidBody(b), true);
    if (!contacts) joint.setContactsEnabled(false);
    return joint.handle;
  }

  /** Switch a collider (a sensor, say) on or off; off, it neither collides nor senses. Part of the snapshot. */
  setColliderEnabled(collider, on) { this.world.getCollider(collider)?.setEnabled(on); }

  setMotorTarget(joint, target, stiffness, damping) {
    this.world.getImpulseJoint(joint).configureMotorPosition(target, stiffness, damping);
    // A sleeping door wouldn't feel its motor change.
    this.world.getImpulseJoint(joint).body2().wakeUp();
  }

  removeBody(handle) { const b = this.world.getRigidBody(handle); if (b) this.world.removeRigidBody(b); }
  removeCollider(handle) { const c = this.world.getCollider(handle); if (c) this.world.removeCollider(c, true); }
  removeJoint(handle) { const j = this.world.getImpulseJoint(handle); if (j) this.world.removeImpulseJoint(j, true); }

  // ---------------------------------------------------------------- poses and forces

  /**
   * Copy a body's world pose into objects with set(x, y, z) and set(x, y, z, w) (three's Vector3 and
   * Quaternion): no arrays per call, and one set() each. Setting a three Quaternion's components one by
   * one fires its change callback (and Object3D's Euler re-sync) four times.
   */
  readPose(handle, outPosition, outQuaternion) {
    const b = this.world.getRigidBody(handle);
    const t = b.translation(), r = b.rotation();
    outPosition.set(t.x, t.y, t.z);
    outQuaternion.set(r.x, r.y, r.z, r.w);
  }
  /** World pose of a body. */
  bodyPose(handle) { const b = this.world.getRigidBody(handle); return { p: arr3(b.translation()), q: arr4(b.rotation()) }; }
  /** Where a kinematic body should be after the next step. */
  setKinematicPose(handle, p, rot) { const b = this.world.getRigidBody(handle); b.setNextKinematicTranslation(v(p)); b.setNextKinematicRotation(q(rot)); }
  /** Teleport (any body type). */
  setPose(handle, p, rot) { const b = this.world.getRigidBody(handle); b.setTranslation(v(p), true); b.setRotation(q(rot), true); }
  /** A body's velocities: linear (m/s) and angular (rad/s), world space. */
  bodyMotion(handle) { const b = this.world.getRigidBody(handle); return { lv: arr3(b.linvel()), av: arr3(b.angvel()) }; }
  setMotion(handle, lv, av) { const b = this.world.getRigidBody(handle); b.setLinvel(v(lv), true); b.setAngvel(v(av), true); }
  applyImpulse(handle, impulse) { this.world.getRigidBody(handle).applyImpulse(v(impulse), true); }
  isSleeping(handle) { return this.world.getRigidBody(handle).isSleeping(); }
  /** Call f(handle) for every awake body (Rapier's active set): cheap on a settled scene. */
  forEachAwakeBody(f) { this.world.bodies.forEachActiveRigidBody(this.world.islands, (b) => f(b.handle)); }
  bodyOfCollider(collider) { return this.world.getCollider(collider)?.parent()?.handle; }

  // ---------------------------------------------------------------- stepping

  /**
   * One engine step (1/60 s, split into `substeps` Rapier steps). Returns the collision events that
   * started or stopped, in Rapier's order: [{ a, b, started }] with collider handles.
   */
  step() {
    const out = [];
    for (let i = 0; i < this.substeps; i++) {
      this.world.step(this.events);
      this.events.drainCollisionEvents((a, b, started) => out.push({ a, b, started }));
    }
    return out;
  }

  // ---------------------------------------------------------------- character controllers

  /**
   * A kinematic character controller (Rapier's KinematicCharacterController): slides along walls, climbs
   * slopes up to `maxSlope`, steps up to `stepHeight`, snaps down to the ground, pushes dynamic bodies.
   * Sensors never block it (spike gotcha 1).
   * @param {{ offset?: number, groundMargin?: number, maxSlope?: number, minSlide?: number, stepHeight?: number, stepWidth?: number, snap?: number, mass?: number, layers?: string[] }} [opts] angles in radians
   * @returns {{ move: (collider: number, desired: number[]) => { movement: number[], grounded: boolean }, free: () => void, rebuild: () => void }}
   */
  createCharacterController({ offset = 0.02, groundMargin = 0.005, maxSlope = 0.7853981633974483, minSlide = 0.5235987755982988, stepHeight = 0.35, stepWidth = 0.2, snap = 0.3, mass = 70, layers } = {}) {
    const R = this.R;
    // Rapier's controllers live outside the world and aren't in its snapshots: build one now and again
    // whenever restore() replaces the world.
    const build = () => {
      const k = this.world.createCharacterController(offset);
      k.setMaxSlopeClimbAngle(maxSlope);
      k.setMinSlopeSlideAngle(minSlide);
      k.enableAutostep(stepHeight, stepWidth, true);
      k.enableSnapToGround(snap);
      k.setApplyImpulsesToDynamicBodies(true);
      k.setCharacterMass(mass);
      return k;
    };
    let kcc = build();
    const groups = this.layers.queryGroups(layers);
    const ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    const handle = {
      rebuild: () => { kcc = build(); },
      move: (collider, desired) => {
        const c = this.world.getCollider(collider);
        kcc.computeColliderMovement(c, v(desired), R.QueryFilterFlags.EXCLUDE_SENSORS, groups);
        const m = arr3(kcc.computedMovement());
        let grounded = kcc.computedGrounded();
        // Rapier 0.21's controller lets a capsule sink into box, convex and round-box colliders (not
        // trimeshes) a little each step until it sticks, in all three builds (AB-L recorded). Keep the
        // capsule's bottom `offset` above the ground under it with one downward ray from its centre.
        const shape = c.shape;
        if (desired[1] <= 0 && shape.halfHeight !== undefined && shape.radius !== undefined) {
          const t = c.translation();
          // Rapier stores shapes in f32, but a collider created in this session caches its JS shape with the
          // description's f64 numbers, while one from restoreSnapshot reads the f32 ones: round to f32 so a
          // restored run computes exactly what the original did.
          const reach = Math.fround(shape.halfHeight) + Math.fround(shape.radius);
          ray.origin = { x: t.x + m[0], y: t.y + m[1], z: t.z + m[2] };
          const hit = this.world.castRay(ray, reach + 0.05, true, R.QueryFilterFlags.EXCLUDE_SENSORS, groups, c, c.parent());
          if (hit) {
            const ground = ray.origin.y - hit.timeOfImpact, bottom = ray.origin.y - reach;
            // Held `groundMargin` above the controller's own offset: at exactly the offset the floor
            // intermittently reads as an obstacle and the step stalls (22 stalls in 600 steps at 0, none at 5 mm).
            const rest = ground + offset + groundMargin;
            if (bottom < rest) { m[1] += rest - bottom; grounded = true; }
          }
        }
        return { movement: m, grounded };
      },
      free: () => { this.world.removeCharacterController(kcc); this.controllers.delete(handle); },
    };
    this.controllers.add(handle);
    return handle;
  }

  // ---------------------------------------------------------------- queries

  /**
   * First hit along a ray.
   * @param {number[]} origin @param {number[]} dir unit direction @param {number} maxDistance
   * @param {{ layers?: string[], excludeSensors?: boolean, excludeBody?: number }} [opts]
   * @returns {{ collider: number, distance: number, point: number[], normal: number[] } | null}
   */
  raycast(origin, dir, maxDistance, { layers, excludeSensors = true, excludeBody } = {}) {
    const R = this.R;
    const ray = new R.Ray(v(origin), v(dir));
    const flags = excludeSensors ? R.QueryFilterFlags.EXCLUDE_SENSORS : 0;
    const exclude = excludeBody !== undefined ? this.world.getRigidBody(excludeBody) : undefined;
    const hit = this.world.castRayAndGetNormal(ray, maxDistance, true, flags, this.layers.queryGroups(layers), undefined, exclude);
    this.onRay?.(origin, dir, maxDistance, hit ? hit.timeOfImpact : null);
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return { collider: hit.collider.handle, distance: t, point: [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t], normal: arr3(hit.normal) };
  }

  /**
   * Sweep a shape along a velocity; first hit within maxToi (in units of the velocity vector).
   * @param {ShapeSpec} shape @param {number[]} p @param {number[]} rot @param {number[]} velocity @param {number} maxToi
   * @param {{ layers?: string[], excludeSensors?: boolean }} [opts]
   */
  shapecast(shape, p, rot, velocity, maxToi, { layers, excludeSensors = true } = {}) {
    const R = this.R;
    const s = this.shapeDesc(shape).shape;
    const flags = excludeSensors ? R.QueryFilterFlags.EXCLUDE_SENSORS : 0;
    const hit = this.world.castShape(v(p), q(rot), v(velocity), s, 0, maxToi, true, flags, this.layers.queryGroups(layers));
    if (!hit) return null;
    return { collider: hit.collider.handle, toi: hit.time_of_impact ?? hit.timeOfImpact, normal: arr3(hit.normal1 ?? hit.normal2 ?? { x: 0, y: 0, z: 0 }) };
  }

  /** Colliders currently overlapping a sensor (or touching a solid collider). */
  overlapping(collider) {
    const c = this.world.getCollider(collider), out = [];
    if (c.isSensor()) this.world.intersectionPairsWith(c, (o) => out.push(o.handle));
    else this.world.contactPairsWith(c, (o) => out.push(o.handle));
    return out;
  }

  // ---------------------------------------------------------------- snapshot and debug

  /** The whole world as bytes (bodies, colliders, joints, contacts, sleep state). Handles survive. */
  snapshot() { return this.world.takeSnapshot(); }
  /** Replace the world with a snapshot (from this build of Rapier only). */
  restore(bytes) {
    const ts = this.world.timestep;
    this.world.free();
    this.world = this.R.World.restoreSnapshot(bytes);
    this.world.timestep = ts;
    for (const c of this.controllers) c.rebuild();
  }

  /** Line segments of every collider, for debug draw: { vertices: Float32Array (xyz pairs), colors: Float32Array (rgba) }. */
  debugLines() { const d = this.world.debugRender(); return { vertices: d.vertices, colors: d.colors }; }

  free() { this.world.free(); this.events.free(); }
}
