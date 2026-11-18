// The hinge behaviour on a RigidBody: a revolute joint to a fixed anchor where the body starts, with
// limits and a position motor. open / close / toggle move the motor's target; `opened` and `closed`
// fire when the panel gets within 5° of it. `locked` keeps it shut (and is an override a scene can set).
import { Behaviour } from '@vrmxg/core';
import { worldPose } from './server.js';

const DEG = Math.PI / 180;
const ARRIVED = 5 * DEG;
const STIFFNESS = 400, DAMPING = 60; // the physics spike's door motor

export class HingeBehaviour extends Behaviour {
  ready() {
    const node = /** @type {any} */ (this.node); // a RigidBodyNode
    if (node.body === undefined) throw new Error(`hinge on "${node.id}" needs a RigidBody`);
    this.physics = node.physics;
    const pose = worldPose(node);
    this.anchor = this.physics.world.createBody({ type: 'fixed', ...pose });
    this.q0 = pose.q;
    const axis = normalise(this.params.axis ?? [0, 1, 0]);
    this.axis = axis;
    const open = (this.params.openAngle ?? 100) * DEG;
    this.openTarget = open;
    this.joint = this.physics.world.createRevolute(this.anchor, node.body, {
      axis, limits: [Math.min(0, open) - 0.05, Math.max(0, open) + 0.05], motor: { target: 0, stiffness: STIFFNESS, damping: DAMPING },
    });
    this.target = 0;
    this.reported = 'closed';
    this.unwatch = this.physics.watch(this);
  }

  exitTree() {
    this.unwatch?.();
    if (this.joint !== undefined) this.physics.world.removeJoint(this.joint);
    if (this.anchor !== undefined) this.physics.world.removeBody(this.anchor);
  }

  /** Current hinge angle in radians (relative to where the body started, about the hinge axis). */
  angle() {
    const [x, y, z, w] = this.physics.world.bodyPose(/** @type {any} */ (this.node).body).q;
    const [ax, ay, az, aw] = this.q0;
    // qrel = q0⁻¹ · q, expressed in the body's starting frame
    const rx = aw * x - ax * w - ay * z + az * y;
    const ry = aw * y + ax * z - ay * w - az * x;
    const rz = aw * z - ax * y + ay * x - az * w;
    const rw = aw * w + ax * x + ay * y + az * z;
    const [ux, uy, uz] = this.axis;
    return 2 * Math.atan2(rx * ux + ry * uy + rz * uz, rw);
  }

  setTarget(target) {
    this.target = target;
    this.physics.world.setMotorTarget(this.joint, target, STIFFNESS, DAMPING);
  }

  // Actions (declared by the hinge behaviour in the registry)
  open() { if (!this.params.locked) this.setTarget(this.openTarget); }
  close() { this.setTarget(0); }
  toggle() { return this.target === 0 ? this.open() : this.close(); }

  afterPhysics() {
    const a = this.angle();
    const state = Math.abs(a - this.openTarget) < ARRIVED && this.target !== 0 ? 'opened' : Math.abs(a) < ARRIVED && this.target === 0 ? 'closed' : null;
    if (state && state !== this.reported) { this.reported = state; this.emit(state); }
  }

  getState() { return { target: this.target, reported: this.reported }; }
  setState(s) { this.target = s.target; this.reported = s.reported; }
}

function normalise([x, y, z]) { const l = Math.sqrt(x * x + y * y + z * z) || 1; return [x / l, y / l, z / l]; }
