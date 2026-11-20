// The VRM humanoid as a ragdoll (M3 W7, AB-T-0546): one mapping for every VRM, sized from the skeleton alone (no
// per-model numbers). Eleven parts on the normalized humanoid bones: hips, torso (spine, with chest, upper chest and neck
// riding on it), head, upper and lower arms (the hands ride on the forearms), upper and lower legs (the feet ride on the
// shins). Ball joints at the spine, neck, shoulders and hips; hinges at the elbows and knees.
//
// Each part's body frame is its bone's world pose when the character is knocked down, so writing the pose back is a
// bone's world rotation equal to its body's. Every joint's zero is the bone's rest relative to its own parent bone (the
// T-pose of the normalized rig, whatever the bones in between are doing), and its limits are anatomical, about the
// rig's axes facing +z with the left on +x (a VRM 0.x rig, mirrored, is turned to match). Radii come from the shoulder
// and hip widths and from each bone's length; masses are fractions of the character's.
//
// Plain arithmetic and three's quaternions only: the same bits in every engine (dmath is installed over Math).
import { Quaternion, Vector3 } from 'three';

/** The bones that get bodies, parents first. */
export const RAGDOLL_BONES = ['hips', 'spine', 'head', 'leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm', 'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg'];

const I = [0, 0, 0, 1];
const S = Math.SQRT1_2;
/** x onto −y (left elbow: the forearm bends forward, towards +z), x onto +y (right elbow). */
const TO_NEG_Y = [0, 0, -S, S], TO_POS_Y = [0, 0, S, S];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * The parts' table: [bone, parent part, joint, mass fraction]. Limits in radians, about the rig's axes (facing +z, left
 * +x, up +y): x bends forward (+) at the spine, neck and knees, the thigh swings forward at −x; y twists; z tilts.
 * @type {[string, number, { type: 'ball' | 'hinge', limits?: { x: number[], y: number[], z: number[] }, align?: number[], range?: number[] } | null, number][]}
 */
const TABLE = [
  ['hips', -1, null, 0.15],
  ['spine', 0, { type: 'ball', limits: { x: [-0.45, 0.9], y: [-0.6, 0.6], z: [-0.45, 0.45] } }, 0.30],
  ['head', 1, { type: 'ball', limits: { x: [-0.7, 0.8], y: [-1.0, 1.0], z: [-0.5, 0.5] } }, 0.08],
  ['leftUpperArm', 1, { type: 'ball', limits: { x: [-1.2, 1.2], y: [-1.6, 0.9], z: [-1.6, 1.4] } }, 0.03],
  ['leftLowerArm', 3, { type: 'hinge', align: TO_NEG_Y, range: [-0.05, 2.5] }, 0.025],
  ['rightUpperArm', 1, { type: 'ball', limits: { x: [-1.2, 1.2], y: [-0.9, 1.6], z: [-1.4, 1.6] } }, 0.03],
  ['rightLowerArm', 5, { type: 'hinge', align: TO_POS_Y, range: [-0.05, 2.5] }, 0.025],
  ['leftUpperLeg', 0, { type: 'ball', limits: { x: [-1.9, 0.5], y: [-0.6, 0.6], z: [-0.35, 1.0] } }, 0.10],
  ['leftLowerLeg', 7, { type: 'hinge', align: I, range: [-0.05, 2.6] }, 0.06],
  ['rightUpperLeg', 0, { type: 'ball', limits: { x: [-1.9, 0.5], y: [-0.6, 0.6], z: [-1.0, 0.35] } }, 0.10],
  ['rightLowerLeg', 9, { type: 'hinge', align: I, range: [-0.05, 2.6] }, 0.06],
];
const MASS_SUM = TABLE.reduce((a, r) => a + r[3], 0);

const _p = new Vector3(), _q = new Quaternion(), _u = new Quaternion(), _y = new Vector3(0, 1, 0);

/**
 * The ragdoll's parts for a VRM in its current pose (@vrmxg/physics buildRagdoll takes them). The VRM's world matrices
 * must be current (the character updates its node before calling).
 * @param {any} vrm @param {{ mass?: number }} [opts] mass: the character's, kg
 * @returns {any[]} @vrmxg/physics RagdollParts, in RAGDOLL_BONES order
 */
export function humanoidRagdoll(vrm, { mass = 60 } = {}) {
  const h = vrm.humanoid;
  const node = (name) => h?.getNormalizedBoneNode(name) ?? null;
  for (const b of [...RAGDOLL_BONES, 'leftHand', 'rightHand', 'leftFoot', 'rightFoot']) if (!node(b)) throw new Error(`a ragdoll needs the humanoid bone ${b}`);
  const wp = (name) => node(name).getWorldPosition(new Vector3());
  const wq = (o) => o.getWorldQuaternion(new Quaternion());
  // a VRM 0.x rig faces −z in its own frame (its left on −x): turn the joints' axes half way round y to match
  const mirror = node('leftUpperLeg').position.x < 0 ? [0, 1, 0, 0] : null;
  const turn = (a) => (mirror ? _u.fromArray(mirror).multiply(_q.fromArray(a)).toArray() : a);

  const sw = wp('leftUpperArm').distanceTo(wp('rightUpperArm')), hw = wp('leftUpperLeg').distanceTo(wp('rightUpperLeg'));
  const frames = RAGDOLL_BONES.map((b) => ({ p: wp(b), q: wq(node(b)) }));
  /** a point in a part's body frame */
  const local = (i, w) => _p.copy(w).sub(frames[i].p).applyQuaternion(_q.copy(frames[i].q).invert()).toArray();
  /** a capsule from world point a to b in part i's frame; its caps reach r/2 past each end */
  const segment = (i, a, b, r) => {
    const la = new Vector3().fromArray(local(i, a)), lb = new Vector3().fromArray(local(i, b));
    const d = lb.clone().sub(la), len = d.length();
    return { shape: 'capsule', radius: r, height: Math.max(2 * r, len + r), p: la.add(lb).multiplyScalar(0.5).toArray(), q: new Quaternion().setFromUnitVectors(_y, d.divideScalar(len || 1)).toArray() };
  };
  const shapes = {
    hips: () => { // across the hip joints, half way up to the hips
      const l = wp('leftUpperLeg'), r = wp('rightUpperLeg'), lift = frames[0].p.clone().sub(l.clone().add(r).multiplyScalar(0.5)).multiplyScalar(0.5);
      return segment(0, l.add(lift), r.add(lift), clamp(0.55 * hw, 0.07, 0.14));
    },
    spine: (i) => segment(i, frames[i].p, node('neck') ? wp('neck') : wp('head'), clamp(0.32 * sw, 0.07, 0.15)),
    head: (i) => { const r = clamp(0.34 * sw, 0.08, 0.14); return { shape: 'sphere', radius: r, p: [0, r, 0] }; },
    upperArm: (i, side) => { const len = wp(`${side}UpperArm`).distanceTo(wp(`${side}LowerArm`)); return segment(i, wp(`${side}UpperArm`), wp(`${side}LowerArm`), clamp(0.2 * len, 0.03, 0.06)); },
    lowerArm: (i, side) => {
      const a = wp(`${side}LowerArm`), hand = wp(`${side}Hand`), len = a.distanceTo(hand);
      return segment(i, a, hand.clone().add(hand.clone().sub(a).multiplyScalar(0.3)), clamp(0.16 * len, 0.025, 0.05)); // the hand rides on the forearm
    },
    upperLeg: (i, side) => { const len = wp(`${side}UpperLeg`).distanceTo(wp(`${side}LowerLeg`)); return segment(i, wp(`${side}UpperLeg`), wp(`${side}LowerLeg`), clamp(0.2 * len, 0.045, 0.09)); },
    lowerLeg: (i, side) => { const len = wp(`${side}LowerLeg`).distanceTo(wp(`${side}Foot`)); return segment(i, wp(`${side}LowerLeg`), wp(`${side}Foot`), clamp(0.14 * len, 0.035, 0.065)); },
  };
  const shapeOf = (bone, i) => {
    const m = /^(left|right)(UpperArm|LowerArm|UpperLeg|LowerLeg)$/.exec(bone);
    return m ? shapes[m[2][0].toLowerCase() + m[2].slice(1)](i, m[1]) : shapes[bone](i);
  };

  return TABLE.map(([bone, parent, joint, frac], i) => ({
    name: bone, parent, p: frames[i].p.toArray(), q: frames[i].q.toArray(), shape: shapeOf(bone, i), mass: mass * frac / MASS_SUM,
    ...(joint ? {
      joint: {
        type: joint.type,
        rest: wq(node(bone).parent).toArray(), // the bone's zero: identity relative to its own parent bone
        align: turn(joint.align ?? I),
        ...(joint.limits ? { limits: joint.limits } : {}),
        ...(joint.range ? { range: joint.range } : {}),
      },
    } : {}),
  }));
}

/**
 * Pose the VRM's normalized bones from the ragdoll's bodies: each body bone's world rotation is its body's (the bones
 * between ride on their parents), and the hips go where the hips' body is.
 * @param {any} vrm @param {{ p: number[], q: number[] }[]} poses the bodies' world poses, in RAGDOLL_BONES order
 */
export function poseFromRagdoll(vrm, poses) {
  const h = vrm.humanoid;
  RAGDOLL_BONES.forEach((name, i) => {
    const n = h.getNormalizedBoneNode(name), { p, q } = poses[i];
    n.parent.getWorldQuaternion(_q); // brings the parents' world matrices up to date
    n.quaternion.copy(_q.invert().multiply(_u.fromArray(q)));
    if (i === 0) n.position.copy(n.parent.worldToLocal(_p.fromArray(p)));
    n.updateMatrixWorld(true);
  });
}
