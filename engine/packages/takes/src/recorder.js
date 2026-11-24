// Recording a take (M4 W9): the live side. A take world is the film's world, stepped to where the take starts, with one
// more service just before the sequence's: the recorder. Each step it latches what the performer is doing and writes it
// into live tracks of the world's own sequence (after the film's tracks, as the kept take's will be), and the sequence
// service plays them in that same step. So the performer is driven through the same tracks, by the same rules, as the
// film that is kept: her walk and her gestures are the kept take's keys and clips exactly, and her eyes and her face are
// its keys before thinning (one a step). The recorder also collects the log. Stopping takes the live tracks out again and
// gives the take document; nothing else is kept.
//
// A director take's performer is her brain: the take world casts her with the `actor` preset (takeWorldDoc), the host
// runs an @vrmxg/director Director on it, and the log is what the ai service applied for her.
//
// No DOM here: devices are @vrmxg/input's (a KeyboardDevice the page attached, a VirtualDevice in a test), face samples
// are pushed in by whoever has a camera, and the director is the host's.
import { InputService } from '@vrmxg/input';
import { makeTake, frameOfStep, r4 } from './take.js';
import { PUPPET_ACTIONS, PuppetState, puppetSetup, gestureClip } from './puppet.js';
import { FaceFilter, faceSetup } from './face.js';
import { ACTOR } from './director.js';

/**
 * The document a take world is built from: the film as it is, and for a director take the performer cast with the
 * `actor` brain when she has none (the director decides through it).
 * @param {any} doc a sequence document @param {{ kind: string, target: string }} o
 */
export function takeWorldDoc(doc, { kind, target }) {
  if (kind !== 'director') return doc;
  const had = doc.sequence?.cast?.[target] ?? {};
  if ((had.behaviours ?? []).some((b) => b.use === 'brain')) return doc;
  const out = structuredClone(doc);
  out.sequence.cast = { ...(out.sequence.cast ?? {}), [target]: { ...had, behaviours: [...(had.behaviours ?? []), structuredClone(ACTOR)] } };
  return out;
}

/** The lengths (seconds) of a character's gesture slots, for a take's setup: a gesture's clip is as long as its slot. */
export function slotSeconds(node, slots) {
  const out = {};
  for (const slot of slots) {
    const sha = node.graph?.picks?.[slot]?.clip ?? node.graph?.slots?.[slot]?.clips?.[0]?.clip;
    const d = sha ? node.clipInfo?.get(sha)?.duration : null;
    if (d > 0) out[slot] = r4(d);
  }
  return out;
}

class TakeRecorder {
  /**
   * @param {any} tree the take world @param {{ kind: 'puppet' | 'director' | 'face', target: string, id: string, fps: number | { num: number, den: number },
   *   sequence?: { id?: string, hash?: string } | null, setup?: any, devices?: any[] }} o
   */
  constructor(tree, { kind, target, id, fps, sequence = null, setup = {}, devices = [] }) {
    const node = /** @type {any} */ (tree.find(target));
    if (!node) throw new Error(`no ${target} in this world`);
    this.tree = tree; this.kind = kind; this.target = target; this.id = id; this.fps = fps; this.sequence = sequence;
    this.node = node;
    this.start = tree.clock.step;
    this.stopped = null;
    const seq = tree.services.get('sequence')?.seq;
    if (!seq) throw new Error('a take is recorded in a sequence world');
    /** the live tracks, in the world's own sequence while recording */ this.live = {};
    const live = (what, track) => { const t = { id: `${target}-${what}-live`, target, ...track }; seq.tracks.push(t); this.live[what] = t; return t; };
    this.seq = seq;
    if (kind === 'puppet') {
      const o = puppetSetup(setup);
      this.setup = { ...setup, gestures: o.gestures, slots: { ...slotSeconds(node, o.gestures), ...(setup.slots ?? {}) } };
      this.state = new PuppetState(this.setup);
      this.input = new InputService(tree, { actions: PUPPET_ACTIONS });
      for (const d of devices) this.input.addDevice(d);
      this.input.record();
      this.yaw = []; this.moving = [0, 0]; this.looking = false;
      live('walk', { type: 'move', keys: [] });
      live('gaze', { type: 'property', path: 'props.gaze', release: true, keys: [] });
      live('act', { type: 'animation', release: true, clips: [] });
    } else if (kind === 'face') {
      this.setup = { ...setup };
      this.filter = new FaceFilter(this.setup);
      this.face = [];
      live('face', { type: 'expression', release: true, keys: {} });
      live('head', { type: 'property', path: 'props.head', release: true, keys: [] });
    } else if (kind === 'director') {
      if (!tree.services.get('ai')?.brainOf(target)) throw new Error(`${target} has no brain in this world: build it from takeWorldDoc`);
      this.setup = { ...setup, slots: { ...slotSeconds(node, Object.keys(node.graph?.slots ?? {})), ...(setup.slots ?? {}) } };
    } else throw new Error(`unknown take kind "${kind}"`);
    // before the sequence service: what is latched this step is in the live tracks when the sequence plays this step
    const services = [...tree.services];
    tree.services.clear();
    for (const [name, svc] of services) { if (name === 'sequence') tree.services.set('take', this); tree.services.set(name, svc); }
  }

  /** This step's performance into the live tracks (a service: just before the sequence service plays them). */
  physicsProcess() {
    if (this.stopped !== null) return;
    const tree = this.tree, step = tree.clock.step, frame = frameOfStep(step, this.fps);
    if (this.kind === 'puppet') {
      this.input.physicsProcess(); // latch this step's actions, and record them
      const yaw = r4(tree.services.get('cameras')?.forPlayer?.(1)?.rigYaw ?? 0);
      if (!this.yaw.length || this.yaw[this.yaw.length - 1][1] !== yaw) this.yaw.push([step, yaw]);
      const s = this.state.step((a) => this.input.axis(a), (b) => this.input.isDown(b), yaw);
      if (s.jump || s.move[0] !== this.moving[0] || s.move[1] !== this.moving[1]) { this.live.walk.keys.push([frame, s.jump ? [s.move[0], s.move[1], 1] : [s.move[0], s.move[1]]]); this.moving = s.move; }
      if (s.gaze) { this.live.gaze.keys.push([frame, s.gaze]); this.looking = true; }
      else if (this.looking) { this.live.gaze.keys.push([frame, null]); this.looking = false; }
      for (const slot of s.gestures) this.live.act.clips.push(gestureClip(slot, frame, this.fps, puppetSetup(this.setup)));
    } else if (this.kind === 'face' && this.filter.ready) {
      const v = this.filter.values();
      for (const [name, w] of Object.entries(v.expressions)) (this.live.face.keys[name] ??= []).push([frame, w]);
      if (v.head) this.live.head.keys.push([frame, v.head]);
    }
  }

  /** A face sample from the camera (face takes): it applies on the next step, and is logged with that step. */
  pushFace(sample) {
    if (this.kind !== 'face' || this.stopped !== null || !sample) return;
    const s = { step: this.tree.clock.step, ...sample };
    if (this.face.length && s.step < this.face[this.face.length - 1].step) return;
    this.face.push(s);
    this.filter.push(s);
  }

  /** How the take stands, for a status line. */
  status() {
    const steps = (this.stopped ?? this.tree.clock.step) - this.start;
    return { kind: this.kind, target: this.target, id: this.id, steps, seconds: Math.round((steps / 60) * 10) / 10, recording: this.stopped === null,
      ...(this.kind === 'face' ? { samples: this.face.length, ready: this.filter.ready } : {}),
      ...(this.kind === 'director' ? { events: this.tree.services.get('ai').record().filter((e) => e.agent === this.target && e.step >= this.start).length } : {}) };
  }

  /** Stop: she is let go, and the take document is made from what was logged. Null when nothing was recorded. */
  stop() {
    if (this.stopped !== null) return this.take ?? null;
    const tree = this.tree, n = this.node;
    this.stopped = tree.clock.step;
    tree.services.delete('take');
    const mine = new Set(Object.values(this.live));
    this.seq.tracks = this.seq.tracks.filter((t) => !mine.has(t)); // the live tracks leave the world's sequence
    let log;
    if (this.kind === 'puppet') {
      log = { input: this.input.stop(), yaw: this.yaw };
      n.input.move = [0, 0];
      if (n.props.gaze !== undefined) n.props.gaze = null;
    } else if (this.kind === 'face') {
      log = { face: this.face };
      this.setup = { ...faceSetup(this.setup), ...this.setup }; // the take keeps the settings it was made with
      if (this.filter.ready) { for (const name of Object.keys(this.filter.values().expressions)) n.setExpression?.(name, 0); if (n.props.head) n.props.head = [0, 0, 0]; }
    } else {
      log = { ai: tree.services.get('ai').record().filter((e) => e.agent === this.target && e.step >= this.start && e.step < this.stopped) };
    }
    if (this.stopped <= this.start) return null;
    this.take = makeTake({ id: this.id, kind: this.kind, target: this.target, sequence: this.sequence, fps: this.fps, start: this.start, end: this.stopped, setup: this.setup, log });
    return this.take;
  }
}

/**
 * Start recording a take in a take world that stands on the step the take begins at. → the recorder: `status()`,
 * `pushFace(sample)` for a face take, `stop()` → the take document.
 * @param {any} tree @param {ConstructorParameters<typeof TakeRecorder>[1]} o
 */
export function startTake(tree, o) { return new TakeRecorder(tree, o); }
export { TakeRecorder };
