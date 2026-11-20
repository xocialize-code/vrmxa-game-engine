// The locomotion graph: a state machine on VRMXA animation slots (idle, walk, run, jump, fall, land),
// with a 1D speed blend between walk and run and crossfades on every change. It is a stateless driver
// (AB-R-0924's recommendation): its whole state is a few numbers, and every step it *sets* each action's
// time and weight from them, so a snapshot of the graph restores the pose exactly; the mixer itself keeps
// nothing that matters (it is updated with 0).
//
// States:  idle ⇄ move (speed > 0.1 m/s) ; idle/move → jump (jumped) → fall (falling, when a fall clip
//          exists) → land (grounded again, when a land clip exists) → idle/move.
//
// Layers (M2 W8; proposed to VRMXA as G10, "a mask per clip or slot"): a slot entry may carry a `mask` (fullBody, the
// default; upperBody, lowerBody, arms, hands, face), and a masked clip plays over the state's full-body pose on its
// bones only:
//   hold     the `hold` slot (an equipped set's pose: the sword held up) layers over every state but sitting and
//            the full-body actions, fading in and out with them, so Mira walks and runs with the sword raised
//   gesture  a masked one-shot (`act('greet')` with a masked entry) plays over locomotion instead of replacing it:
//            a wave while walking; it fades in and out over its blendIn

const MOVING = 0.1; // m/s

/**
 * Action states (VRMXA §8.2 slots a character plays while it does something with an item, VRMXI §8): one-shots
 * return to idle or move when their clip ends (at once when the slot is empty); `sit` settles into `sitIdle`,
 * held until `stand`.
 */
export const ACTIONS = new Set(['use', 'take', 'talk', 'sit', 'sitIdle', 'stand', 'getUp']); // getUp (M3 W12): rising from a fall
/** States that own the whole body: the hold layer fades out in them. */
const FULL_BODY = new Set(['use', 'take', 'sit', 'sitIdle', 'stand']);

/**
 * @typedef {{ clip: string, weight?: number, rate?: number, blendIn?: number }} SlotEntry
 * @typedef {{ duration: number, loops: boolean, speed: number | null, rootMotion: string | null }} ClipInfo
 */

export class LocomotionGraph {
  /**
   * @param {Record<string, { clips: SlotEntry[] }>} slots resolved slots (resolveSlots)
   * @param {Map<string, ClipInfo>} info clip facts by sha256
   * @param {() => number} rand uniform [0, 1) from the character's random stream (clip choice by weight)
   */
  constructor(slots, info, rand) {
    this.info = info;
    this.rand = rand;
    this.state = 'idle';
    this.prev = null;
    this.fade = 0;       // steps of crossfade left
    this.fadeTotal = 0;  // steps the current crossfade lasts
    this.time = 0;       // seconds in the current state
    this.prevTime = 0;   // seconds the previous state had reached (frozen once it fades)
    this.phase = 0;      // normalised walk/run cycle phase
    this.prevPhase = 0;
    this.speed = 0;
    this.prevSpeed = 0;
    this.picks = {};     // slot → chosen entry (by weight, on entering the state)
    this.hold = { w: 0, t: 0 }; // the hold layer: its weight and time
    this.layer = null;   // a masked one-shot playing over the state: { slot, clip, t }
    this.setSlots(slots);
  }

  /** New slots (equipment changed): states pick their clip again from now on. */
  setSlots(slots) {
    this.slots = slots;
    this.picks = {};
    this._pick(this.state);
    if (this.has('hold')) this._pickSlot('hold');
  }

  _pickSlot(slot) {
    const list = this.slots[slot]?.clips ?? [];
    if (!list.length) return null;
    const total = list.reduce((a, e) => a + (e.weight ?? 1), 0);
    let x = this.rand() * total, chosen = list[list.length - 1];
    for (const e of list) { x -= e.weight ?? 1; if (x <= 0) { chosen = e; break; } }
    this.picks[slot] = chosen;
    return chosen;
  }

  has(slot) { return !!this.slots[slot]?.clips?.length; }

  _pick(state) { for (const slot of slotsOf(state, this)) this._pickSlot(slot); }

  _go(state, dtSteps = 60) {
    if (state === this.state) return;
    this.prev = this.state; this.prevTime = this.time; this.prevPhase = this.phase; this.prevSpeed = this.speed;
    this.state = state; this.time = 0;
    if (state !== 'move') this.phase = 0;
    this._pick(state);
    const entry = this.picks[slotsOf(state, this)[0]];
    this.fadeTotal = this.fade = Math.max(1, Math.round((entry?.blendIn ?? 0.25) * dtSteps));
  }

  /**
   * Advance one step.
   * @param {number} dt seconds
   * @param {{ speed: number, grounded: boolean, verticalSpeed: number, jumped: boolean }} m
   */
  step(dt, { speed, grounded, verticalSpeed, jumped }) {
    const hz = Math.round(1 / dt);
    this.speed = speed;
    const s = this.state;
    if (ACTIONS.has(s)) {
      const done = this.time >= this.durationOf(slotsOf(s, this)[0]);
      if (s === 'sit' && done) this._go('sitIdle', hz);
      else if (s !== 'sitIdle' && s !== 'sit' && done) this._go(speed > MOVING ? 'move' : 'idle', hz);
    } else if (jumped && this.has('jump')) this._go('jump', hz);
    else if (s === 'jump' && verticalSpeed < 0 && this.has('fall')) this._go('fall', hz);
    else if ((s === 'jump' || s === 'fall') && grounded && this.time > 0.1) this._go(this.has('land') ? 'land' : speed > MOVING ? 'move' : 'idle', hz);
    else if (s === 'land' && this.time >= this.durationOf('land')) this._go(speed > MOVING ? 'move' : 'idle', hz);
    else if (s === 'idle' && speed > MOVING && grounded) this._go('move', hz);
    else if (s === 'move' && speed <= MOVING) this._go('idle', hz);
    this.time += dt;
    if (this.state === 'move') this.phase = advancePhase(this, this.phase, speed, dt);
    if (this.fade > 0) this.fade--;
    // layers: the hold pose follows the state (not while sitting or in a full-body action); a gesture runs out
    const h = this.picks.hold, holdOn = !!h && this.has('hold') && !FULL_BODY.has(this.state);
    const rate = dt / Math.max(dt, h?.blendIn ?? 0.25);
    this.hold.w = holdOn ? Math.min(1, this.hold.w + rate) : Math.max(0, this.hold.w - rate);
    this.hold.t += dt;
    if (this.layer) { this.layer.t += dt; if (this.layer.t >= (this.info.get(this.layer.clip)?.duration ?? 1)) this.layer = null; }
  }

  /** Start an action state (use, take, talk, sit, stand; sitIdle follows sit). */
  act(state, hz = 60) {
    // a slot whose entry is masked plays as a layer over whatever the body is doing (a gesture), not as a state
    const list = this.slots[state]?.clips ?? [];
    if (list.length && list.every((e) => e.mask && e.mask !== 'fullBody')) {
      const e = this._pickSlot(state);
      this.layer = { slot: state, clip: e.clip, t: 0 };
      return;
    }
    if (!ACTIONS.has(state)) throw new Error(`"${state}" isn't an action (${[...ACTIONS].join(', ')}) or a masked slot`);
    this._go(state, hz);
  }
  /** True while a masked one-shot (a gesture) plays over the body. */
  get gesturing() { return !!this.layer; }
  /** True while an action plays or the character sits. */
  get busy() { return ACTIONS.has(this.state); }

  durationOf(slot) { const e = this.picks[slot]; return e ? this.info.get(e.clip)?.duration ?? 1 : 0; }

  /** Walk/run blend weight of run at a speed (by the clips' authored speeds), 0 without a run clip. */
  runWeight(speed) {
    const w = this.picks.walk, r = this.picks.run;
    if (!r || !this.has('run')) return 0;
    if (!w) return 1;
    const sw = this.info.get(w.clip)?.speed ?? 1.4, sr = this.info.get(r.clip)?.speed ?? 4;
    return Math.min(1, Math.max(0, (speed - sw) / (sr - sw || 1)));
  }

  /**
   * What to play now: [{ clip, time, weight }] (times in clip seconds), crossfade included.
   */
  output() {
    const f = this.fadeTotal > 0 ? 1 - this.fade / this.fadeTotal : 1;
    const out = new Map();
    const add = (list, k) => { for (const { clip, time, weight } of list) { const o = out.get(clip); if (o) { o.weight += weight * k; o.time = time; } else out.set(clip, { clip, time, weight: weight * k }); } };
    add(this.contributions(this.state, this.time, this.phase, this.speed), this.prev ? f : 1);
    if (this.prev && f < 1) add(this.contributions(this.prev, this.prevTime, this.prevPhase, this.prevSpeed), 1 - f);
    const list = [...out.values()];
    // masked layers on top: { clip, time, weight (its share on the masked bones), mask }
    const h = this.picks.hold;
    if (h && this.hold.w > 0) { const c = this.clipAt(h, this.hold.t); list.push({ ...c, weight: this.hold.w, mask: h.mask ?? 'upperBody' }); }
    if (this.layer) {
      const e = this.picks[this.layer.slot], d = this.info.get(this.layer.clip)?.duration ?? 1, bi = Math.max(1e-3, e?.blendIn ?? 0.2), t = this.layer.t;
      list.push({ clip: this.layer.clip, time: Math.min(t, d), weight: Math.max(0, Math.min(1, t / bi, (d - t) / bi)), mask: e?.mask ?? 'upperBody' });
    }
    return list;
  }

  contributions(state, t, phase, speed) {
    if (state === 'move') {
      const wr = this.runWeight(speed);
      const list = [];
      const w = this.picks.walk, r = this.picks.run;
      if (w && wr < 1) list.push({ clip: w.clip, time: phase * (this.info.get(w.clip)?.duration ?? 1), weight: 1 - wr });
      if (r && wr > 0) list.push({ clip: r.clip, time: phase * (this.info.get(r.clip)?.duration ?? 1), weight: wr });
      if (!list.length && this.picks.idle) list.push(this.clipAt(this.picks.idle, t));
      return list;
    }
    const slot = slotsOf(state, this)[0];
    const e = this.picks[slot] ?? this.picks.idle;
    return e ? [this.clipAt(e, t)] : [];
  }

  clipAt(e, t) {
    const info = this.info.get(e.clip) ?? { duration: 1, loops: true };
    const d = info.duration || 1, local = t * (e.rate ?? 1);
    return { clip: e.clip, time: info.loops ? local - Math.floor(local / d) * d : Math.min(local, d), weight: 1 };
  }

  /**
   * The move clip's root-motion kind ('travel' moves the character by the clip, 'inPlace' by input) at a speed:
   * the speed the controller is asked for, or the graph's own.
   */
  moveRootMotion(speed = this.speed) {
    const e = this.picks[this.runWeight(speed) > 0.5 ? 'run' : 'walk'] ?? this.picks.walk;
    return e ? this.info.get(e.clip)?.rootMotion ?? 'inPlace' : 'inPlace';
  }
  /**
   * Authored speed of the move clips blended for a speed (m/s), for travel root motion. Pass the speed asked for:
   * blending from the graph's own speed, which travel root motion has already set to a clip's speed, would hold
   * the blend where it is (a walk could never become a run).
   */
  moveSpeed(speed = this.speed) {
    const wr = this.runWeight(speed);
    const sw = this.picks.walk ? this.info.get(this.picks.walk.clip)?.speed ?? 1.4 : 1.4;
    const sr = this.picks.run ? this.info.get(this.picks.run.clip)?.speed ?? 4 : sw;
    return sw + (sr - sw) * wr;
  }

  getState() {
    const { state, prev, fade, fadeTotal, time, prevTime, phase, prevPhase, speed, prevSpeed } = this;
    return { state, prev, fade, fadeTotal, time, prevTime, phase, prevPhase, speed, prevSpeed, picks: Object.fromEntries(Object.entries(this.picks).map(([k, e]) => [k, e.clip])), hold: { ...this.hold }, layer: this.layer ? { ...this.layer } : null };
  }
  setState(s) {
    Object.assign(this, { state: s.state, prev: s.prev, fade: s.fade, fadeTotal: s.fadeTotal, time: s.time, prevTime: s.prevTime, phase: s.phase, prevPhase: s.prevPhase, speed: s.speed, prevSpeed: s.prevSpeed });
    this.picks = {};
    for (const [slot, clip] of Object.entries(s.picks)) { const e = (this.slots[slot]?.clips ?? []).find((x) => x.clip === clip); if (e) this.picks[slot] = e; }
    this.hold = s.hold ? { ...s.hold } : { w: 0, t: 0 };
    this.layer = s.layer ? { ...s.layer } : null;
  }
}

function slotsOf(state, g) {
  switch (state) {
    case 'move': return g.has('walk') ? ['walk', 'run'] : ['run'];
    case 'fall': return g.has('fall') ? ['fall'] : ['jump'];
    case 'land': return g.has('land') ? ['land'] : ['idle'];
    case 'take': return g.has('take') ? ['take'] : ['equip']; // `take` is proposed for VRMXA §8.2 (VRMXI Q3); until then, equip
    case 'sitIdle': return g.has('sitIdle') ? ['sitIdle'] : ['sit'];
    default: return [state];
  }
}

// Walk and run share one normalised phase, so feet line up through the blend. The cycle plays at the
// rate that makes the clips' authored speeds match the character's speed.
function advancePhase(g, phase, speed, dt) {
  const wr = g.runWeight(speed);
  const dw = g.picks.walk ? g.info.get(g.picks.walk.clip)?.duration ?? 1 : 1;
  const dr = g.picks.run ? g.info.get(g.picks.run.clip)?.duration ?? dw : dw;
  const sw = g.picks.walk ? g.info.get(g.picks.walk.clip)?.speed ?? null : null;
  const sr = g.picks.run ? g.info.get(g.picks.run.clip)?.speed ?? null : null;
  const dur = dw + (dr - dw) * wr;
  const authored = sw !== null && sr !== null ? sw + (sr - sw) * wr : sw ?? sr;
  const rate = authored ? speed / authored : 1;
  const p = phase + (dt * rate) / dur;
  return p - Math.floor(p);
}
