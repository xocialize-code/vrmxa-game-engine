// Virtual cameras (M2 W2, AB-T-0525; research/cinematics.md §1.2): a VirtualCamera is a candidate shot, with a body
// (where the camera is), an aim (where it looks), a lens, seeded noise and impulses. It steps with the simulation at
// 60 Hz in the cameras service, so its damping, noise and shake re-simulate identically (AB-D-0248). A CameraBrain
// (brain.js) picks the live one for its output and blends; nothing renders through a VirtualCamera by itself.
//
// Bodies: fixed (the node's own transform), follow (offset from the target, damped), orbit (radius, yaw, pitch around
//         the target; yawSpeed turns it: a turntable), thirdPerson (shoulder offset, arm length, spring arm),
//         firstPerson (the target's eyes), dolly (along a Path3D: a fixed u, or the point closest to the target,
//         damped), hardLock (the target's own transform).
// Aims:   none (keeps the body's rotation), lookAt (hard, at the target plus an offset), composer (keeps the target at
//         a screen point: a dead zone it may drift in, damped beyond it, never outside the soft zone), groupFraming
//         (looks at several targets' centre and sets the lens so they fill `size` of the frame height), panTilt
//         (yaw and pitch from props: input or keys).
import { Vector3, Quaternion, Matrix4, Euler } from 'three';
import { Node } from '@vrmxg/core';
import { rigDefaults } from './rigs.js';
import { focalForFov, sensorSize } from './lens.js';

const _m = new Matrix4(), _v = new Vector3(), _w = new Vector3(), _q = new Quaternion(), _up = new Vector3(0, 1, 0), _e = new Euler(0, 0, 0, 'YXZ');
const DEG = Math.PI / 180;

/** Seeded smooth value noise in [-1, 1]: lattice values from an integer hash, smoothstep between them. */
export function noise1(seed, x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const h = (n) => { let v = Math.imul(n ^ Math.imul(seed, 0x9e3779b1), 0x85ebca6b); v ^= v >>> 13; v = Math.imul(v, 0xc2b2ae35); v ^= v >>> 16; return ((v >>> 0) / 4294967295) * 2 - 1; };
  return h(i) + (h(i + 1) - h(i)) * u;
}

/** Noise profiles: amplitude (degrees) of yaw, pitch and roll, and frequency (Hz). */
export const NOISE = {
  handheldLight: { amp: [0.35, 0.25, 0.15], freq: 0.9 },
  handheldHeavy: { amp: [1.1, 0.8, 0.5], freq: 1.6 },
  vehicle: { amp: [0.3, 0.6, 0.2], freq: 3.2 },
};

const seedOf = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return h >>> 0; };

/** Exponential damping factor for a step: 1 − e^(−dt/τ) (τ ≤ 0: no damping). */
const damp = (dt, tau) => (tau > 0 ? 1 - Math.exp(-dt / tau) : 1);

export class VirtualCameraNode extends Node {
  static actions = ['activate', 'impulse'];

  constructor(data, def) {
    super(data, def);
    /** Simulated state: the damped position and look target, aim angles, trauma, when it was last activated. */
    this.vstate = { p: null, look: null, yaw: 0, pitch: 0, trauma: 0, activated: 0, punch: 0, u: null };
    this.pose = { p: new Vector3(), q: new Quaternion(), focalLength: 50, fStop: 2.8, focusDistance: 3, dutch: 0 };
    this.seed = seedOf(this.id ?? 'vcam');
  }

  /** The settings in effect: the rig preset's defaults under the node's own body / aim / lens / noise props. */
  settings() {
    const d = rigDefaults(this.props.rig);
    return { body: { ...d.body, ...(this.props.body ?? {}) }, aim: { ...d.aim, ...(this.props.aim ?? {}) }, lens: { ...d.lens, ...(this.props.lens ?? {}) }, noise: this.props.noise ?? d.noise ?? null };
  }

  get priority() { return this.props.priority ?? 10; }
  get channel() { return this.props.channel ?? 'main'; }

  enterTree() { this.tree.services.get('cameras')?.registerVirtual(this); }
  exitTree() { this.tree.services.get('cameras')?.unregisterVirtual(this); }

  // ---------------------------------------------------------------- actions
  /** Make it the most recently activated (wins ties on priority). */
  activate() { this.vstate.activated = this.tree.clock.step + 1; }
  /** Trauma shake (and a zoom punch): strength adds trauma, which decays over `duration` seconds. */
  impulse({ strength = 0.6, zoom = 0 } = {}) { this.vstate.trauma = Math.min(1, this.vstate.trauma + strength); this.vstate.punch += zoom; }

  // ---------------------------------------------------------------- the step (cameras service)
  targetPoint(id, eyes, out) {
    const t = /** @type {any} */ (id ? this.tree.find(id.split('#')[0]) : null);
    if (!t) return null;
    const head = (eyes || id.endsWith('#head')) && t.vrm?.humanoid?.getNormalizedBoneNode?.('head');
    if (head) return head.getWorldPosition(out);
    t.object3d.getWorldPosition(out);
    if (eyes && !head) out.y += 1.5;
    return out;
  }

  /** One step: body, aim, lens, noise, shake → this.pose (world space). */
  step(dt, physics, aspect) {
    const { body, aim, lens, noise } = this.settings();
    const st = this.vstate;
    const target = body.target ?? aim.target;
    // ------------------------------------------------ body: where the camera is
    const want = this.bodyPoint(body, dt, physics);
    if (!st.p) st.p = want.toArray();
    const k = damp(dt, body.damping ?? 0);
    st.p = [st.p[0] + (want.x - st.p[0]) * k, st.p[1] + (want.y - st.p[1]) * k, st.p[2] + (want.z - st.p[2]) * k];
    const eye = this.pose.p.fromArray(st.p);
    // ------------------------------------------------ aim: where it looks
    let focal = lens.focalLength ?? 50;
    const q = this.pose.q;
    if (aim.type === 'none') { this.object3d.getWorldQuaternion(q); if (body.type === 'firstPerson' || body.type === 'hardLock') { const t = this.tree.find(target); if (t) t.object3d.getWorldQuaternion(q); q.multiply(_q.setFromAxisAngle(_up, Math.PI)); } }
    else if (aim.type === 'panTilt') { _e.set(-(aim.pitch ?? 0) * DEG, ((aim.yaw ?? 0) + 180) * DEG, 0); q.setFromEuler(_e); }
    else {
      const at = aim.type === 'groupFraming' ? this.groupCentre(aim.targets ?? [], _w) : this.targetPoint(aim.target ?? target, aim.eyes ?? true, _w);
      if (at) {
        if (aim.offset) at.add(_v.fromArray(aim.offset));
        if (aim.type === 'composer') this.compose(eye, at, aim, dt, focal, aspect, q);
        else lookAtQ(eye, at, q);
        if (aim.type === 'groupFraming') focal = this.frameGroup(eye, aim, lens, aspect, focal);
      }
    }
    // ------------------------------------------------ noise and shake (rotation offsets, seeded on the step)
    const t = this.tree.clock.step / 60;
    let yaw = 0, pitch = 0, roll = (lens.dutch ?? 0) * DEG;
    const prof = noise ? { ...(NOISE[noise.profile] ?? NOISE.handheldLight), ...noise } : null;
    if (prof) {
      const a = prof.amp, f = prof.freq * (prof.frequency ?? 1), g = prof.amplitude ?? 1;
      yaw += noise1(this.seed, t * f) * a[0] * g * DEG; pitch += noise1(this.seed + 1, t * f) * a[1] * g * DEG; roll += noise1(this.seed + 2, t * f) * a[2] * g * DEG;
    }
    if (st.trauma > 0) {
      const s = st.trauma * st.trauma;
      yaw += noise1(this.seed + 7, t * 18) * 3 * s * DEG; pitch += noise1(this.seed + 8, t * 18) * 3 * s * DEG; roll += noise1(this.seed + 9, t * 18) * 2 * s * DEG;
      st.trauma = Math.max(0, st.trauma - dt / (this.props.impulseDecay ?? 0.6));
    }
    if (yaw || pitch || roll) { _e.set(pitch, yaw, roll, 'YXZ'); q.multiply(_q.setFromEuler(_e)); }
    if (st.punch) { focal *= 1 + st.punch; st.punch *= 1 - damp(dt, 0.12); if (Math.abs(st.punch) < 1e-4) st.punch = 0; }
    this.pose.focalLength = focal;
    this.pose.fStop = lens.fStop ?? 2.8;
    this.pose.focusDistance = lens.focusTarget || target ? this.focusTo(eye, lens.focusTarget ?? target) : lens.focusDistance ?? 3;
    this.pose.dutch = lens.dutch ?? 0;
    // the node itself shows where the shot is (the editor draws it; nothing renders through it)
    this.placeNode(eye, q);
  }

  bodyPoint(body, dt, physics) {
    const out = new Vector3(), st = this.vstate;
    const t = /** @type {any} */ (body.target ? this.tree.find(body.target) : null);
    switch (body.type ?? 'fixed') {
      case 'fixed': return this.object3d.getWorldPosition(out);
      case 'hardLock': return t ? t.object3d.getWorldPosition(out) : this.object3d.getWorldPosition(out);
      case 'firstPerson': return t ? this.targetPoint(body.target, true, out) : this.object3d.getWorldPosition(out);
      case 'follow': {
        if (!t) return this.object3d.getWorldPosition(out);
        const o = body.offset ?? [0, 1.6, -3.2];
        t.object3d.updateWorldMatrix(true, false);
        return out.set(o[0], o[1], o[2]).applyMatrix4(body.space === 'world' ? _m.makeTranslation(t.object3d.getWorldPosition(_v)) : t.object3d.matrixWorld);
      }
      case 'orbit': {
        if (!t) return this.object3d.getWorldPosition(out);
        st.yaw += (body.yawSpeed ?? 0) * DEG * dt;
        const yaw = ((body.yaw ?? 0) * DEG) + st.yaw, pitch = (body.pitch ?? 15) * DEG, r = body.radius ?? 4;
        this.targetPoint(body.target, true, out);
        return out.add(_v.set(Math.sin(yaw) * Math.cos(pitch) * r, Math.sin(pitch) * r, Math.cos(yaw) * Math.cos(pitch) * r));
      }
      case 'thirdPerson': {
        if (!t) return this.object3d.getWorldPosition(out);
        const pivot = this.targetPoint(body.target, true, new Vector3());
        t.object3d.updateWorldMatrix(true, false);
        const e = t.object3d.matrixWorld.elements, fwd = _v.set(e[8], 0, e[10]).normalize(), right = _w.set(-fwd.z, 0, fwd.x);
        pivot.addScaledVector(right, -(body.shoulder ?? 0.45));
        const arm = body.arm ?? 2.2, dir = new Vector3(-fwd.x, 0.25, -fwd.z).normalize();
        let len = arm;
        if (physics && body.collide !== false) { const hit = physics.world.raycast(pivot.toArray(), dir.toArray(), arm + 0.2, { excludeBody: t.body ?? t.ownBody }); if (hit) len = Math.max(0.2, hit.distance - 0.2); }
        return out.copy(pivot).addScaledVector(dir, len);
      }
      case 'dolly': {
        const path = /** @type {any} */ (this.tree.find(body.path));
        if (!path?.pointAt) return this.object3d.getWorldPosition(out);
        let u = body.u ?? 0;
        if (body.u === undefined && t) u = path.closestU(t.object3d.getWorldPosition(_v)) + (body.lead ?? 0);
        if (st.u === null) st.u = u;
        st.u += (u - st.u) * damp(dt, body.pathDamping ?? 0);
        return path.pointAt(st.u, out);
      }
      default: throw new Error(`VirtualCamera "${this.id}": unknown body "${body.type}"`);
    }
  }

  groupCentre(ids, out) {
    let n = 0; out.set(0, 0, 0);
    for (const id of ids) { if (this.targetPoint(id, true, _v)) { out.add(_v); n++; } }
    return n ? out.multiplyScalar(1 / n) : null;
  }

  /** Lens for group framing: the focal length that makes the targets' spread fill `size` of the frame height. */
  frameGroup(eye, aim, lens, aspect, focal) {
    const c = this.groupCentre(aim.targets ?? [], new Vector3());
    if (!c) return focal;
    let r = 0.4;
    for (const id of aim.targets ?? []) if (this.targetPoint(id, true, _v)) r = Math.max(r, _v.distanceTo(c) + 0.35);
    const dist = Math.max(0.5, eye.distanceTo(c)), size = aim.size ?? 0.7;
    const fov = (2 * Math.atan(r / size / dist) * 180) / Math.PI;
    return Math.max(12, Math.min(300, focalForFov(fov, lens.sensor ?? 'super35', aspect)));
  }

  /**
   * Composer: keep the target at screen point `screen` ([x, y] in [-1, 1], 0 = centre). While the target is inside the
   * dead zone around it the aim holds; beyond, it turns towards it with `damping` (s), and never lets it leave the soft
   * zone. Angles are the aim's yaw / pitch, stepped here.
   */
  compose(eye, at, aim, dt, focal, aspect, q) {
    const st = this.vstate, [w, h] = sensorSize(aim.sensor ?? 'super35');
    const tanV = (Math.min(h, w / aspect) / 2) / focal, tanH = tanV * aspect; // the fill gate's half-tangents
    const dx = at.x - eye.x, dy = at.y - eye.y, dz = at.z - eye.z;
    const toYaw = Math.atan2(dx, dz), toPitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
    const [sx, sy] = aim.screen ?? [0, 0];
    const wantYaw = toYaw + Math.atan(sx * tanH), wantPitch = toPitch - Math.atan(sy * tanV);
    if (st.look === null) { st.yaw = wantYaw; st.pitch = wantPitch; st.look = true; }
    const dYaw = wrap(wantYaw - st.yaw), dPitch = wantPitch - st.pitch;
    const [dzx, dzy] = aim.deadZone ?? [0.1, 0.1], [szx, szy] = aim.softZone ?? [0.6, 0.6];
    const ex = Math.tan(Math.abs(dYaw)) / tanH, ey = Math.tan(Math.abs(dPitch)) / tanV; // screen-space error
    const k = damp(dt, aim.damping ?? 0.5);
    if (ex > dzx / 2) st.yaw += dYaw * k;
    if (ey > dzy / 2) st.pitch += dPitch * k;
    // hard limit: back inside the soft zone at once
    const mx = Math.atan((szx / 2) * tanH), my = Math.atan((szy / 2) * tanV);
    const ry = wrap(wantYaw - st.yaw), rp = wantPitch - st.pitch;
    if (ry > mx) st.yaw = wantYaw - mx; else if (ry < -mx) st.yaw = wantYaw + mx;
    if (rp > my) st.pitch = wantPitch - my; else if (rp < -my) st.pitch = wantPitch + my;
    _e.set(st.pitch, st.yaw + Math.PI, 0, 'YXZ'); // a camera looks down its -Z: turned half round to face +Z at yaw 0
    q.setFromEuler(_e);
  }

  focusTo(eye, id) { const p = this.targetPoint(id, true, _v); return p ? Math.max(0.05, eye.distanceTo(p)) : this.props.lens?.focusDistance ?? 3; }

  placeNode(eye, q) {
    const o = this.object3d;
    o.parent?.updateWorldMatrix(true, false);
    if ((this.settings().body.type ?? 'fixed') === 'fixed') return; // a fixed body *is* the node's transform
    _m.compose(eye, q, _v.set(1, 1, 1));
    if (o.parent) _m.premultiply(new Matrix4().copy(o.parent.matrixWorld).invert());
    _m.decompose(o.position, o.quaternion, _v);
  }

  getState() { return { vstate: structuredClone(this.vstate) }; }
  setState(s) { this.vstate = structuredClone(s.vstate); }
}

/** A quaternion that looks from `eye` at `at` the way three's cameras do (down their -Z). */
export function lookAtQ(eye, at, out) { _m.lookAt(eye, at, _up); return out.setFromRotationMatrix(_m); }
const wrap = (a) => a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
