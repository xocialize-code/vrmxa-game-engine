// Hands and gaze as @vrmxg/input actions, as far as the input service's devices allow. A device writes only keys, mouse
// (deltas, wheel, buttons) and a gamepad (axes, buttons) into the step's state, and actions bind only to those, so XR
// input has to be squeezed into them:
//   - a right-hand pinch is mouse button 0, which the default map binds to `interact`
//   - a left-hand pinch held and dragged is the left stick: the hand's offset from where the pinch began, in the
//     reference space's floor plane, 10 cm for full tilt, quantised to 1/64 (so recordings are small and exact)
//   - gaze (or Apple's transient-pointer, whose ray is the gaze at the moment of a pinch) has no binding kind at all:
//     at the frame a right pinch begins, the page casts the ray against the scene and hands the node it hits to the
//     simulation as a choice (`input.choose('xr.target', id)`), which the next step latches and a recording keeps
// The pinch is read from the joints (thumb tip to index tip, pressed under 1.5 cm, let go over 3 cm), which works for
// Quest-style hands with a gamepad and for visionOS hands without one. Everything here is read in the XR frame callback,
// before the steps that frame runs; read(out) is the step's latch, as for every device.
const PRESS = 0.015, RELEASE = 0.03, FULL = 0.1, QUANT = 64;
const q = (v) => Math.round(Math.max(-1, Math.min(1, v)) * QUANT) / QUANT;

export class XRHandsDevice {
  constructor() {
    this.select = false; this.move = false; this.anchor = null; this.axes = [0, 0];
    this.rays = new Map(); // targetRayMode → { origin, direction } in the reference space, this frame
    this.seen = new Set(); this.selectStarts = 0; this.jointsPerHand = 0;
  }

  /** From the XR frame callback: the frame, its reference space and session. Returns { selectStarted }. */
  update(frame, ref, session) {
    let selectStarted = false;
    this.rays.clear();
    for (const src of session.inputSources) {
      this.seen.add(`${src.handedness}:${src.targetRayMode}${src.hand ? ':hand' : ''}${src.gamepad ? `:gamepad(${src.gamepad.mapping || 'none'})` : ''}`);
      if (src.targetRayMode === 'gaze' || src.targetRayMode === 'transient-pointer') {
        const p = frame.getPose(src.targetRaySpace, ref);
        if (p) { const m = p.transform.matrix; this.rays.set(src.targetRayMode, { origin: [m[12], m[13], m[14]], direction: [-m[8], -m[9], -m[10]] }); }
      }
      if (!src.hand) continue;
      this.jointsPerHand = src.hand.size;
      const a = frame.getJointPose(src.hand.get('thumb-tip'), ref), b = frame.getJointPose(src.hand.get('index-finger-tip'), ref);
      const w = frame.getJointPose(src.hand.get('wrist'), ref);
      if (!a || !b) continue;
      const d = Math.hypot(a.transform.position.x - b.transform.position.x, a.transform.position.y - b.transform.position.y, a.transform.position.z - b.transform.position.z);
      if (src.handedness === 'right') {
        const was = this.select;
        this.select = d < PRESS ? true : d > RELEASE ? false : was;
        if (this.select && !was) { selectStarted = true; this.selectStarts++; }
      } else if (src.handedness === 'left' && w) {
        const was = this.move, pos = [w.transform.position.x, w.transform.position.z];
        this.move = d < PRESS ? true : d > RELEASE ? false : was;
        if (this.move && !was) this.anchor = pos;
        if (this.move && this.anchor) this.axes = [q((pos[0] - this.anchor[0]) / FULL), q((pos[1] - this.anchor[1]) / FULL)];
        else { this.axes = [0, 0]; this.anchor = null; }
      }
    }
    return { selectStarted };
  }

  read(out) {
    out.mouse = { dx: out.mouse?.dx ?? 0, dy: out.mouse?.dy ?? 0, wheel: out.mouse?.wheel ?? 0, buttons: new Set([...(out.mouse?.buttons ?? []), ...(this.select ? [0] : [])]) };
    // the stick: x as is, z forward is negative (move_y reads gamepad axis 1 with scale -1, as a pad's up is negative)
    out.gamepad = { axes: [this.axes[0], this.axes[1], 0, 0], buttons: new Array(17).fill(0) };
  }
  peek(out) { this.read(out); }
}
