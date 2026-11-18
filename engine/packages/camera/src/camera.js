// The Camera node: a three.js PerspectiveCamera driven by a physical lens, and a rig preset that places
// it every step. Camera nodes look down their -Z, as three.js cameras do (characters face +Z).
//
// Rig state (yaw, pitch, distance, the spring arm's current length) steps with the simulation in the
// cameras service's afterNodes phase, after physics, so camera-relative movement replays exactly
// (AB-D-0248 clarified). Interpolating the rendered pose between steps is the render host's job (W5).
//
// Presets: free (left where it is), fixed (stays, looks at its target), orbit (around the target, look
// input turns it, zoom changes distance), follow (third person behind the target, spring arm),
// overShoulder (follow, shorter and offset to the right), firstPerson (at the target's eyes).
import { PerspectiveCamera, Matrix4, Vector3, Quaternion } from 'three';
import { Node } from '@vrmxg/core';
import { verticalFov, thinLens } from './lens.js';

export const PRESETS = ['free', 'fixed', 'orbit', 'follow', 'overShoulder', 'firstPerson'];
const DEFAULTS = {
  orbit: { distance: 4, height: 1.2, side: 0 },
  follow: { distance: 3.2, height: 1.5, side: 0 },
  overShoulder: { distance: 1.6, height: 1.55, side: 0.45 },
  firstPerson: { distance: 0, height: 0, side: 0 },
};
const PITCH_MIN = -1.2, PITCH_MAX = 1.3; // radians; positive looks down
const ARM_RADIUS = 0.2, ARM_RETURN = 4;  // spring arm: keep 0.2 m off walls, ease back out at 4 m/s

const _m = new Matrix4(), _q = new Quaternion(), _v = new Vector3(), _up = new Vector3(0, 1, 0), _eye = new Vector3(), _at = new Vector3();

export class CameraNode extends Node {
  static actions = ['makeCurrent', 'setPreset', 'nextPreset'];

  constructor(data, def) {
    super(data, def);
    this.camera = new PerspectiveCamera(40, 16 / 9, this.props.near ?? 0.1, this.props.far ?? 500);
    this.camera.name = `${this.id}:camera`;
    this.object3d.add(this.camera);
    /** Rig state: view yaw (0 looks along +Z), pitch (positive looks down), orbit distance, spring-arm length. */
    this.rig = { yaw: 0, pitch: 0.2, distance: null, arm: null };
    // The starting view, when the scene gives one (degrees): rig { yaw: 180 } looks along -Z.
    const deg = Math.PI / 180, start = this.props.rig ?? {};
    if (typeof start.yaw === 'number') this.rig.yaw = start.yaw * deg;
    if (typeof start.pitch === 'number') this.rig.pitch = start.pitch * deg;
    this.applyLens();
  }

  get preset() { return this.props.preset ?? 'free'; }
  /** The rig's yaw: what camera-relative movement is relative to. */
  get rigYaw() { return this.preset === 'free' || this.preset === 'fixed' ? this.viewYaw() : this.rig.yaw; }

  enterTree() { this.tree.services.get('cameras')?.register(this); }
  exitTree() { this.tree.services.get('cameras')?.unregister(this); }

  /** Field of view and clip planes from the lens props and the output aspect. */
  applyLens(aspect = this.camera.aspect) {
    const p = this.props;
    this.camera.aspect = aspect;
    this.camera.fov = verticalFov(p.focalLength ?? 50, p.sensor ?? 'super35', aspect);
    this.camera.near = p.near ?? 0.1;
    this.camera.far = p.far ?? 500;
    this.camera.updateProjectionMatrix();
  }

  /** Thin-lens depth of field for the current lens and focus (focus follows the target when set). */
  dof() {
    const p = this.props;
    let focus = p.focusDistance ?? 3;
    const t = p.target ? this.tree?.find(p.target) : null;
    if (t) focus = Math.max(0.05, this.object3d.getWorldPosition(_v).distanceTo(this.pivotOf(t, new Vector3())));
    return thinLens({ focalMm: p.focalLength ?? 50, focusM: focus, fStop: p.fStop ?? 2.8, sensor: p.sensor ?? 'super35' });
  }

  // ---------------------------------------------------------------- actions
  makeCurrent() { this.tree.services.get('cameras')?.setCurrent(this); }
  setPreset({ preset }) {
    if (!PRESETS.includes(preset)) throw new Error(`unknown camera preset "${preset}" (${PRESETS.join(', ')})`);
    if (preset === this.preset) return;
    const yaw = this.viewYaw();
    this.props.preset = preset;
    this.rig.yaw = yaw; this.rig.distance = null; this.rig.arm = null; // carry the view direction over
  }
  nextPreset() { const i = PRESETS.indexOf(this.preset); this.setPreset({ preset: PRESETS[(i + 1) % PRESETS.length] }); }

  // ---------------------------------------------------------------- the rig, once per step (cameras service)

  /** Yaw of the direction this camera looks along (0 = +Z). */
  viewYaw() {
    this.object3d.updateWorldMatrix(true, false);
    const e = this.object3d.matrixWorld.elements; // -Z column is the view direction
    return Math.atan2(-e[8], -e[10]);
  }

  /** Where the rig looks: the target's eyes (a VRM's head bone) or 1.5 m above its origin. */
  pivotOf(target, out) {
    const head = target.vrm?.humanoid?.getNormalizedBoneNode?.('head');
    if (head) { head.getWorldPosition(out); return out; }
    target.object3d.getWorldPosition(out);
    out.y += 1.5;
    return out;
  }

  /**
   * One rig step.
   * @param {number} dt
   * @param {{ lookX: number, lookY: number, zoom: number } | null} look this step's look input (current camera only)
   * @param {any} physics the physics service, for the spring arm (optional)
   */
  stepRig(dt, look, physics) {
    const preset = this.preset, r = this.rig;
    if (preset === 'free') return;
    const target = this.props.target ? this.tree.find(this.props.target) : null;
    if (preset === 'fixed' || !target) { if (target) this.lookFrom(this.object3d.getWorldPosition(_eye), this.pivotOf(target, _at)); return; }
    if (look) {
      r.yaw -= look.lookX;
      r.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, r.pitch + look.lookY));
    }
    const d = { ...DEFAULTS[preset], ...(this.props.rig ?? {}) };
    if (r.distance === null) r.distance = d.distance;
    if (look && preset === 'orbit') r.distance = Math.max(0.5, Math.min(30, r.distance * (1 + look.zoom)));
    const pivot = this.pivotOf(target, _at);
    if (preset !== 'orbit' && preset !== 'firstPerson') { target.object3d.getWorldPosition(_v); pivot.set(_v.x, _v.y + d.height, _v.z); }
    // view direction from yaw/pitch; camera right = forward × up
    const cp = Math.cos(r.pitch), fx = Math.sin(r.yaw) * cp, fy = -Math.sin(r.pitch), fz = Math.cos(r.yaw) * cp;
    const rx = -Math.cos(r.yaw), rz = Math.sin(r.yaw);
    if (preset === 'firstPerson') {
      _eye.copy(pivot);
      this.lookFrom(_eye, _v.set(_eye.x + fx, _eye.y + fy, _eye.z + fz));
      return;
    }
    pivot.x += rx * d.side; pivot.z += rz * d.side;
    let length = r.distance;
    if (physics && preset !== 'orbit') length = this.springArm(physics, pivot, [-fx, -fy, -fz], r.distance, target, dt);
    _eye.set(pivot.x - fx * length, pivot.y - fy * length, pivot.z - fz * length);
    this.lookFrom(_eye, pivot);
  }

  /**
   * Spring arm: the boom from the pivot back to the camera pulls in at once when something is in the way
   * and eases back out at ARM_RETURN m/s. Ignores the target's own body.
   */
  springArm(physics, pivot, dir, wanted, target, dt) {
    const r = this.rig;
    const exclude = target.body ?? target.ownBody;
    const hit = physics.world.raycast([pivot.x, pivot.y, pivot.z], dir, wanted + ARM_RADIUS, { excludeBody: exclude });
    const free = hit ? Math.max(0.1, hit.distance - ARM_RADIUS) : wanted;
    const prev = r.arm ?? wanted;
    r.arm = free < prev ? free : Math.min(free, prev + ARM_RETURN * dt);
    return r.arm;
  }

  /** Put the camera node at `eye` looking at `at` (world space), local to its parent. */
  lookFrom(eye, at) {
    _m.lookAt(eye, at, _up); // -Z towards `at`
    _q.setFromRotationMatrix(_m);
    const o = this.object3d;
    o.parent?.updateWorldMatrix(true, false);
    if (o.parent && !isIdentity(o.parent.matrixWorld)) {
      _m.compose(eye, _q, _v.set(1, 1, 1)).premultiply(new Matrix4().copy(o.parent.matrixWorld).invert());
      _m.decompose(o.position, o.quaternion, _v);
    } else {
      o.position.copy(eye);
      o.quaternion.copy(_q);
    }
  }

  getState() { return { rig: { ...this.rig }, preset: this.preset, p: this.object3d.position.toArray(), q: this.object3d.quaternion.toArray() }; }
  setState(s) { this.rig = { ...s.rig }; this.props.preset = s.preset; this.object3d.position.fromArray(s.p); this.object3d.quaternion.fromArray(s.q); }
}

function isIdentity(m) {
  const e = m.elements;
  return e[0] === 1 && e[5] === 1 && e[10] === 1 && e[15] === 1 && e[1] === 0 && e[2] === 0 && e[3] === 0 && e[4] === 0 && e[6] === 0 && e[7] === 0 && e[8] === 0 && e[9] === 0 && e[11] === 0 && e[12] === 0 && e[13] === 0 && e[14] === 0;
}
