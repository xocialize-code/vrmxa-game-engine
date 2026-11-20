// What the camera sees, as events (M3 W5, AB-T-0544): presence, where the face is and turns, a wave, a nod, a head
// shake and a point, from feature frames. A feature frame is what a capture path gives for one camera frame (the shell's
// Vision path, or MediaPipe in a page: spike-camera/):
//   { t: ms, face: { x, y, w, yaw, pitch, roll } | null, hands: [{ side, wrist: [x, y], tips: [[x, y] ×5], pips: [[x, y] ×5] }] }
// Mirrored as a selfie preview (the person's right is +x), y up; x runs −1…1 across the image and y uses the same unit
// (pixels / half the width), so distances are true; w is the face's width in that unit; angles in radians.
//
// This runs outside the simulation, on the camera's own clock (t). Its events enter the world through the sense
// service, stamped with the step they apply on and logged, so a replay needs neither the camera nor this detector. It is
// still a pure function of the frames, so a recorded stream of frames gives the same events every time (the tests use
// that). Thresholds are in face widths where they can be, so they hold whatever the person's distance from the camera;
// nod and shake trigger on an excursion and a return either way, so neither path's angle sign convention matters.

export const DEFAULTS = {
  /** a face narrower than this (x units) is no one there */
  minFace: 0.05,
  /** a face this long (ms) is someone there; none for this long, gone */
  presentAfter: 300, absentAfter: 1500,
  /** face updates: at most every faceEvery ms, when it moved faceMove (face widths) or turned faceTurn (rad), and every faceKeep ms */
  faceEvery: 100, faceMove: 0.25, faceTurn: 0.08, faceKeep: 1000,
  /** a wave: an open hand held up, its wrist turning back `reversals` times within `window` ms, each swing `amplitude` face widths */
  wave: { window: 1600, reversals: 3, amplitude: 0.3, cooldown: 1500 },
  /** a nod: the head pitched `depth` rad away from where it rests and back within `window` ms, the yaw staying within maxYaw */
  nod: { depth: 0.11, window: 900, maxYaw: 0.15, cooldown: 1200 },
  /** a shake: the head turned `depth` rad to both sides and back within `window` ms */
  shake: { depth: 0.16, window: 1100, cooldown: 1200 },
  /** a point: an index finger out (the others in) held `hold` ms */
  point: { hold: 400, cooldown: 1500 },
};

const dist = (a, b) => Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));
const r4 = (v) => Math.round(v * 10000) / 10000;

/** A hand's shape from its joints: which fingers are out (tip farther from the wrist than its middle joint), open, pointing. */
export function handShape(h) {
  const out = h.tips.map((tip, i) => dist(tip, h.wrist) > dist(h.pips[i], h.wrist) * 1.15);
  const fingers = out.slice(1).filter(Boolean).length;
  return { out, open: out[1] && out[2] && fingers >= 3, point: out[1] && !out[2] && !out[3] && !out[4] };
}

export class GestureDetector {
  /** @param {Partial<typeof DEFAULTS>} [opts] */
  constructor(opts = {}) {
    this.o = { ...DEFAULTS, ...opts, wave: { ...DEFAULTS.wave, ...opts.wave }, nod: { ...DEFAULTS.nod, ...opts.nod }, shake: { ...DEFAULTS.shake, ...opts.shake }, point: { ...DEFAULTS.point, ...opts.point } };
    this.present = false; this.seenSince = null; this.lastSeen = -Infinity;
    this.lastFace = null; this.faceAt = -Infinity;
    /** per hand side: a wave in progress */ this.waves = new Map();
    this.head = { pitch: null, yaw: null, nod: null, shake: null };
    this.cool = { wave: -Infinity, nod: -Infinity, shake: -Infinity, point: -Infinity };
    this.pointSince = null;
  }

  /** One feature frame → the events it completes (often none). */
  push(f) {
    const ev = [], t = f.t, o = this.o, face = f.face && f.face.w >= o.minFace ? f.face : null;
    // presence
    if (face) { this.lastSeen = t; this.seenSince ??= t; }
    else this.seenSince = null;
    if (!this.present && face && t - this.seenSince >= o.presentAfter) { this.present = true; ev.push({ type: 'presence', present: true, t }); }
    if (this.present && t - this.lastSeen > o.absentAfter) { this.present = false; this.lastFace = null; ev.push({ type: 'presence', present: false, t }); }
    if (!this.present) { this.waves.clear(); this.pointSince = null; this.head = { pitch: null, yaw: null, nod: null, shake: null }; return ev; }
    if (face) {
      this.faceUpdate(face, t, ev);
      this.headGestures(face, t, ev);
    }
    this.handGestures(f.hands ?? [], face ?? this.lastFace, t, ev);
    return ev;
  }

  faceUpdate(face, t, ev) {
    const o = this.o, l = this.lastFace;
    const moved = !l || dist([face.x, face.y], [l.x, l.y]) > o.faceMove * face.w || Math.abs(face.yaw - l.yaw) > o.faceTurn || Math.abs(face.pitch - l.pitch) > o.faceTurn;
    if ((moved && t - this.faceAt >= o.faceEvery) || t - this.faceAt >= o.faceKeep) {
      this.lastFace = { x: r4(face.x), y: r4(face.y), w: r4(face.w), yaw: r4(face.yaw), pitch: r4(face.pitch) };
      this.faceAt = t;
      ev.push({ type: 'face', ...this.lastFace, t });
    }
  }

  /** Nods and shakes: excursions from where the head rests (a slow average, held still during an excursion). */
  headGestures(face, t, ev) {
    const h = this.head, o = this.o;
    if (h.pitch === null) { h.pitch = face.pitch; h.yaw = face.yaw; h.at = t; return; }
    const dt = Math.max(0, t - h.at), k = Math.min(1, dt / 1000); h.at = t;
    const dp = face.pitch - h.pitch, dy = face.yaw - h.yaw;
    // nod
    if (!h.nod && Math.abs(dp) > o.nod.depth && Math.abs(dy) < o.nod.maxYaw) h.nod = { t0: t, maxYaw: Math.abs(dy) };
    else if (h.nod) {
      h.nod.maxYaw = Math.max(h.nod.maxYaw, Math.abs(dy));
      if (t - h.nod.t0 > o.nod.window || h.nod.maxYaw >= o.nod.maxYaw) h.nod = null;
      else if (Math.abs(dp) < o.nod.depth / 3) { h.nod = null; if (t - this.cool.nod >= o.nod.cooldown) { this.cool.nod = t; ev.push({ type: 'nod', t }); } }
    }
    // shake: both sides visited, then back near the middle
    if (!h.shake && Math.abs(dy) > o.shake.depth) h.shake = { t0: t, sides: new Set([Math.sign(dy)]) };
    else if (h.shake) {
      if (Math.abs(dy) > o.shake.depth) h.shake.sides.add(Math.sign(dy));
      if (t - h.shake.t0 > o.shake.window) h.shake = null;
      else if (h.shake.sides.size === 2 && Math.abs(dy) < o.shake.depth / 3) { h.shake = null; h.nod = null; if (t - this.cool.shake >= o.shake.cooldown) { this.cool.shake = t; ev.push({ type: 'shake', t }); } }
    }
    if (!h.nod && !h.shake) { h.pitch += dp * k; h.yaw += dy * k; } // rest drifts with the head only between gestures
  }

  /** Waves (per hand) and points. */
  handGestures(hands, face, t, ev) {
    const o = this.o, unit = face ? face.w : 0.25;
    const seen = new Set();
    let pointing = null;
    hands.forEach((hand, i) => {
      const key = hand.side ?? `hand${i}`, s = handShape(hand);
      seen.add(key);
      if (s.point) pointing = hand;
      const raised = hand.wrist[1] > (face ? face.y - face.w * 0.9 : -0.3);
      let w = this.waves.get(key);
      if (!s.open || !raised) { if (w && t - w.last > 300) this.waves.delete(key); return; }
      const x = hand.wrist[0], thr = o.wave.amplitude * unit;
      if (!w) { this.waves.set(key, { dir: 0, peak: x, trough: x, turns: [], last: t }); return; }
      w.last = t;
      if (w.dir >= 0) { if (x > w.peak) w.peak = x; else if (w.peak - x > thr) { if (w.dir > 0) w.turns.push(t); w.dir = -1; w.trough = x; } }
      if (w.dir <= 0) { if (x < w.trough) w.trough = x; else if (x - w.trough > thr) { if (w.dir < 0) w.turns.push(t); w.dir = 1; w.peak = x; } }
      w.turns = w.turns.filter((tt) => t - tt <= o.wave.window);
      if (w.turns.length >= o.wave.reversals - 1) { // the first change of direction starts the count
        this.waves.delete(key);
        if (t - this.cool.wave >= o.wave.cooldown) { this.cool.wave = t; ev.push({ type: 'wave', hand: hand.side ?? null, t }); }
      }
    });
    for (const k of [...this.waves.keys()]) if (!seen.has(k) && t - this.waves.get(k).last > 300) this.waves.delete(k);
    // a point: the pointing hand held
    if (!pointing) { this.pointSince = null; return; }
    this.pointSince ??= t;
    if (t - this.pointSince >= o.point.hold && t - this.cool.point >= o.point.cooldown) {
      this.cool.point = t;
      const tip = pointing.tips[1], pip = pointing.pips[1], d = dist(tip, pip) || 1;
      ev.push({ type: 'point', hand: pointing.side ?? null, at: [r4(tip[0]), r4(tip[1])], dir: [r4((tip[0] - pip[0]) / d), r4((tip[1] - pip[1]) / d)], t });
    }
  }
}
