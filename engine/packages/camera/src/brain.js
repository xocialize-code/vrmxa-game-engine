// CameraBrain (M2 W2): one per output (the main view, a picture-in-picture, each split-screen player, a render job). It
// picks the live VirtualCamera on its channel (highest priority; the most recently activated wins a tie) and blends from
// the one before it, both still evaluated every step, as Cinemachine does: a cut, or easeInOut / linear over a
// duration, from `defaultBlend` or a per-pair entry in `blends`. A sequence's camera track overrides the choice
// (`override`, W1). The result goes to a Camera node (its pose and lens), which the render host draws through. All of it
// steps at 60 Hz with the simulation, so a blend replays identically.
import { Node } from '@vrmxg/core';
import { Vector3, Quaternion, Matrix4 } from 'three';

const _m = new Matrix4(), _p = new Vector3(), _q = new Quaternion(), _s = new Vector3(1, 1, 1);
const EASE = { cut: () => 1, linear: (t) => t, easeInOut: (t) => t * t * (3 - 2 * t), easeIn: (t) => t * t, easeOut: (t) => 1 - (1 - t) * (1 - t) };

export class CameraBrainNode extends Node {
  static actions = ['override', 'clearOverride'];

  constructor(data, def) {
    super(data, def);
    /** Simulated state: the live vcam, the one it blends from, when the blend began, its style and length (steps). */
    this.bstate = { live: null, from: null, blendStart: 0, style: 'cut', steps: 0, override: null };
  }

  get channel() { return this.props.channel ?? 'main'; }

  enterTree() { this.tree.services.get('cameras')?.registerBrain(this); }
  exitTree() { this.tree.services.get('cameras')?.unregisterBrain(this); }

  /** A sequence's camera track: this vcam is live whatever the priorities (blend: { style, seconds } or the table's). */
  /** @param {{ camera?: string, blend?: any }} [o] */
  override({ camera, blend } = {}) { this.bstate.override = camera ?? null; this.bstate.overrideBlend = blend ?? null; }
  clearOverride() { this.bstate.override = null; this.bstate.overrideBlend = null; }

  /** The blend from one vcam to another: a per-pair entry, else the default. */
  blendFor(from, to) {
    const list = this.props.blends ?? [];
    const hit = list.find((b) => (b.from === from || b.from === '*') && (b.to === to || b.to === '*'));
    return hit ?? this.props.defaultBlend ?? { style: 'easeInOut', seconds: 1 };
  }

  /** Pick the live vcam for this step. */
  choose(vcams) {
    const st = this.bstate;
    if (st.override) return vcams.find((v) => v.id === st.override) ?? null;
    let best = null;
    for (const v of vcams) {
      if (v.channel !== this.channel || this.tree.scaleOf(v) === 0 || v.props.enabled === false) continue;
      if (!best || v.priority > best.priority || (v.priority === best.priority && v.vstate.activated > best.vstate.activated)) best = v;
    }
    return best;
  }

  /** One step: choose, start a blend when the live vcam changes, write the blended pose and lens to the camera. */
  step(vcams) {
    const st = this.bstate, step = this.tree.clock.step;
    const live = this.choose(vcams);
    if (!live) return;
    if (st.live !== live.id) {
      const b = st.override && st.overrideBlend ? st.overrideBlend : this.blendFor(st.live, live.id);
      st.from = st.live; st.live = live.id; st.blendStart = step;
      st.style = st.from ? b.style ?? 'easeInOut' : 'cut';
      st.steps = st.style === 'cut' ? 0 : Math.max(1, Math.round((b.frames !== undefined ? (b.frames * 60) / (b.fps ?? 24) : (b.seconds ?? 1) * 60)));
      this.tree.emit(this, 'cameraChanged', { from: st.from, to: st.live });
    }
    const from = st.from ? vcams.find((v) => v.id === st.from) : null;
    const t = st.steps > 0 ? Math.min(1, (step - st.blendStart) / st.steps) : 1;
    const k = (EASE[st.style] ?? EASE.easeInOut)(t);
    if (t >= 1) st.from = null;
    const a = from?.pose, b = live.pose;
    const pose = !a || k >= 1 ? b : {
      p: _p.copy(a.p).lerp(b.p, k), q: _q.copy(a.q).slerp(b.q, k),
      focalLength: a.focalLength + (b.focalLength - a.focalLength) * k, fStop: a.fStop + (b.fStop - a.fStop) * k,
      focusDistance: a.focusDistance + (b.focusDistance - a.focusDistance) * k, dutch: a.dutch + (b.dutch - a.dutch) * k,
    };
    this.write(pose);
  }

  /** Put the blended shot on the output Camera node: its world pose and its lens. */
  write(pose) {
    const cam = /** @type {any} */ (this.tree.find(this.props.camera));
    if (!cam?.camera) return;
    cam.drivenBy = this;
    const o = cam.object3d;
    o.parent?.updateWorldMatrix(true, false);
    _m.compose(pose.p, pose.q, _s);
    if (o.parent) _m.premultiply(new Matrix4().copy(o.parent.matrixWorld).invert());
    _m.decompose(o.position, o.quaternion, new Vector3());
    Object.assign(cam.props, { focalLength: pose.focalLength, fStop: pose.fStop, focusDistance: pose.focusDistance });
    cam.applyLens();
    if (this.props.makeCurrent !== false) { const cams = this.tree.services.get('cameras'); if (cams && cams.current !== cam) cams.setCurrent(cam); }
  }

  getState() { return { bstate: { ...this.bstate } }; }
  setState(s) { this.bstate = { ...s.bstate }; }
}
