// Two-bone IK (M2 W8): an analytic solve for a limb of two bones (thigh and shin, upper arm and forearm) so its end
// (the ankle, the wrist) reaches a target, bending in the plane of the limb's current bend, as Godot's TwoBoneIK3D and
// Unity's analytic solvers do. Law of cosines through the portable Math.acos (dmath is installed over Math), quaternions
// from unit vectors (square roots only): deterministic in every engine. It works on the VRM's normalized humanoid
// bones, before vrm.update copies them to the raw ones.
import { Quaternion, Vector3 } from 'three';

const _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _t = new Vector3(), _n = new Vector3(), _k = new Vector3(), _d = new Vector3();
const _q = new Quaternion(), _w = new Quaternion(), _p = new Quaternion(), _orig1 = new Quaternion(), _orig2 = new Quaternion();

/** Rotate a bone in world space by q (premultiplied), keeping its parent. */
function rotateWorld(bone, q) {
  bone.getWorldQuaternion(_w);
  _w.premultiply(q);
  bone.parent.getWorldQuaternion(_p);
  bone.quaternion.copy(_p.invert().multiply(_w));
  bone.updateWorldMatrix(false, true);
}

/**
 * Bend upper → lower → end so `end` reaches `target` (world, a Vector3), at `weight` (0…1). `pole` (world) picks the bend
 * direction when the limb is straight. → the distance left between end and target
 */
export function twoBoneIK(upper, lower, end, target, { weight = 1, pole = null } = {}) {
  if (weight <= 0) return null;
  upper.updateWorldMatrix(true, true);
  _orig1.copy(upper.quaternion); _orig2.copy(lower.quaternion);
  upper.getWorldPosition(_a); lower.getWorldPosition(_b); end.getWorldPosition(_c); _t.copy(target);
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
  if (l1 < 1e-6 || l2 < 1e-6) return null;
  const toT = _d.subVectors(_t, _a), dist = Math.min(Math.max(toT.length(), Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const dir = toT.normalize();
  // the bend plane: through the root, the target and the current joint (or the pole when the limb is straight)
  _k.subVectors(_b, _a);
  _n.crossVectors(dir, _k);
  if (_n.lengthSq() < 1e-10 && pole) _n.crossVectors(dir, _k.subVectors(pole, _a));
  if (_n.lengthSq() < 1e-10) return null;
  _n.normalize();
  // the joint's new place: from the root, along the target direction turned by the root angle, towards the bend
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const angA = Math.acos(Math.min(1, Math.max(-1, cosA)));
  const joint = _k.copy(dir).applyQuaternion(_q.setFromAxisAngle(_n, angA)).multiplyScalar(l1).add(_a);
  // turn the upper bone so its joint goes there, then the lower bone so the end points at the target
  rotateWorld(upper, _q.setFromUnitVectors(_b.sub(_a).normalize(), _c.copy(joint).sub(_a).normalize()));
  lower.getWorldPosition(_b); end.getWorldPosition(_c);
  rotateWorld(lower, _q.setFromUnitVectors(_c.sub(_b).normalize(), _d.subVectors(_t, _b).normalize()));
  if (weight < 1) { upper.quaternion.slerpQuaternions(_orig1, upper.quaternion.clone(), weight); lower.quaternion.slerpQuaternions(_orig2, lower.quaternion.clone(), weight); upper.updateWorldMatrix(false, true); }
  end.getWorldPosition(_c);
  return _c.distanceTo(_t);
}
