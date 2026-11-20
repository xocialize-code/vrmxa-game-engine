// Ragdolls (M3 W7, AB-T-0546): a tree of parts becomes dynamic bodies joined by ball-and-socket joints and hinges,
// through the adapter only (so a Jolt swap keeps it). Engine-neutral: the parts come from a mapping (the VRM humanoid's
// is @vrmxg/character's ragdoll.js), each a body frame in the world, a shape in that frame, a mass and a joint to its
// parent part.
//
// A joint is given by where its zero is: `rest`, the world rotation the part's body frame has when the joint is at
// zero, and `align`, a rotation in the part's own frame that turns the joint's x axis onto the hinge (identity for a
// ball). Its frame on the parent then holds `rest` relative to the parent's body, so the joint measures how far the
// part has turned from its rest, about axes of the part's own frame, wherever the parent's frame points. Limits are
// angles about those axes.
//
// Parts never touch each other (Layers.ragdollGroups), only the world. Everything is made in the parts' order, so the
// handles and the solver's order are the same in every run, and Rapier's snapshot holds the whole ragdoll.
import { Quaternion, Vector3 } from 'three';

const _q = new Quaternion(), _r = new Quaternion(), _a = new Quaternion(), _b = new Quaternion(), _v = new Vector3();

/**
 * @typedef {object} RagdollJoint
 * @property {'ball' | 'hinge'} type
 * @property {number[]} rest world rotation of this part's body frame at the joint's zero
 * @property {number[]} [align] in this part's frame: the rotation taking x onto the hinge axis (identity by default)
 * @property {{ x?: number[], y?: number[], z?: number[] }} [limits] a ball's, radians about the part's axes
 * @property {number[]} [range] a hinge's limits, radians
 *
 * @typedef {object} RagdollPart
 * @property {string} name
 * @property {number} parent index of the parent part (earlier in the list), or -1 for the root
 * @property {number[]} p world position of the body frame: where its joint to the parent is
 * @property {number[]} q world rotation of the body frame
 * @property {import('./world.js').ShapeSpec & { p?: number[], q?: number[] }} shape in the body frame
 * @property {number} mass kg
 * @property {RagdollJoint} [joint] to the parent (none for the root)
 */

/**
 * Make the ragdoll's bodies, colliders and joints.
 * @param {import('./world.js').PhysicsWorld} world
 * @param {RagdollPart[]} parts parents before children
 * @param {{ layer?: string, friction?: number, jointFriction?: number, linearDamping?: number, angularDamping?: number, iterations?: number, ccd?: boolean, velocity?: number[] }} [opts]
 *   friction: the parts' surface friction; jointFriction: each joint's (createSpherical); iterations: extra solver
 *   iterations for the ragdoll's island (createBody); velocity: every part's at the start (m/s)
 * @returns {{ bodies: number[], joints: number[], balls: number[] }} handles, in the parts' order (joints: one per part
 *   after the root; balls: the ball joints among them)
 */
export function buildRagdoll(world, parts, { layer, friction = 0.8, jointFriction = 0.4, linearDamping = 0.05, angularDamping = 0.6, iterations = 0, ccd = false, velocity = [0, 0, 0] } = {}) {
  const bodies = [], joints = [], balls = [];
  parts.forEach((part, i) => {
    if (part.parent >= i) throw new Error(`ragdoll part ${part.name}: its parent must come before it`);
    const b = world.createBody({ type: 'dynamic', p: part.p, q: part.q, linearDamping, angularDamping, iterations, ccd });
    world.createCollider(b, { ...part.shape, mass: part.mass, friction, layer, ragdoll: true });
    world.setMotion(b, velocity, [0, 0, 0]);
    bodies.push(b);
    if (part.parent < 0) return;
    const parent = parts[part.parent], j = part.joint;
    if (!j) throw new Error(`ragdoll part ${part.name} has a parent and no joint`);
    // the anchor: this part's origin, in the parent's frame
    _r.fromArray(parent.q).invert();
    const anchorA = _v.set(part.p[0] - parent.p[0], part.p[1] - parent.p[1], part.p[2] - parent.p[2]).applyQuaternion(_r).toArray();
    const align = j.align ?? [0, 0, 0, 1];
    const frameA = _q.copy(_r).multiply(_a.fromArray(j.rest)).multiply(_b.fromArray(align)).toArray();
    const spec = { anchorA, anchorB: [0, 0, 0], frameA, frameB: align, friction: jointFriction, contacts: false };
    if (j.type === 'hinge') joints.push(world.createHinge(bodies[part.parent], b, { ...spec, limits: j.range }));
    else { const h = world.createSpherical(bodies[part.parent], b, { ...spec, limits: j.limits }); joints.push(h); balls.push(h); }
  });
  return { bodies, joints, balls };
}

/**
 * Lying down: damp every part hard and open the joints' limits. A part resting on the ground at a limit has the limit
 * and the contact pushing against each other, and Rapier's angular limits then shake it (measured: a head and arms still
 * turning at 1–5 rad/s with damping 8, the limits on; open, the island rests within a few steps). The limits shaped
 * the fall; lying still, the damping keeps the pose.
 */
export function settleRagdoll(world, { bodies, joints, balls }, { linearDamping = 2, angularDamping = 8 } = {}) {
  for (const b of bodies) world.setDamping(b, linearDamping, angularDamping);
  const open = [-Math.PI, Math.PI], ball = new Set(balls);
  for (const j of joints) world.setAngularLimits(j, ball.has(j) ? { x: open, y: open, z: open } : { x: open });
}

/** Remove a ragdoll's bodies (Rapier removes their colliders and joints with them). */
export function removeRagdoll(world, { bodies }) { for (const b of bodies) world.removeBody(b); }

/**
 * The fastest part's linear (m/s) and angular (rad/s) speed: how far from settled the ragdoll is.
 * @param {number} [count] only the first `count` parts (the root and the trunk: a body lies still before its fingers do)
 */
export function ragdollMotion(world, { bodies }, count = bodies.length) {
  let lin = 0, ang = 0;
  for (const b of bodies.slice(0, count)) {
    const { lv, av } = world.bodyMotion(b);
    lin = Math.max(lin, Math.sqrt(lv[0] * lv[0] + lv[1] * lv[1] + lv[2] * lv[2]));
    ang = Math.max(ang, Math.sqrt(av[0] * av[0] + av[1] * av[1] + av[2] * av[2]));
  }
  return { lin, ang };
}
