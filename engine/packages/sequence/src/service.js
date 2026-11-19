// The "sequence" service (M2 W1): plays a sequence inside the simulation step, so a shot replays and exports bit for bit.
//
// Sequence time follows the step clock: after s steps the sequence is at frame from + (s − startStep) · fps / 60,
// exactly the frame frameToStep() maps an export frame to. The service runs before the nodes (physicsProcess): it
// applies the @vrmxg/tracks tracks, starts the dialogue lines and fires the events the step crossed, sets which
// VirtualCamera a CameraBrain shows (override), points characters' eyes, and applies the live shot's overrides; the
// cameras service and the nodes then step with all of it in place. Baked simulation spans (bake.js) write their cached
// poses after the nodes (afterNodes, after physics). Post tracks are presentation: postValues(alpha) is what the render
// host hands the post stack, and changes no hash. The playback state, the overrides' saved values and the lookAt state
// are in getState(), so a snapshot of a sequence world restores mid-shot.
import { frameToStep, rationalFps } from '@vrmxg/core';
import { applyTrack, sampleAudio, eventsBetween, TRACK_TYPES } from '@vrmxg/tracks';
import { clipAt, shotAt, samplePost, linesBetween } from './evaluate.js';

const START = -1e-9;
/** The aspect a sequence frames at (its export sizes, SIZES in @vrmxg/export, are all 16:9). */
export const ASPECT = 16 / 9;

export class SequenceService {
  constructor(tree) {
    this.tree = tree;
    /** The sequence block (doc.sequence), or null. */ this.seq = null;
    /** Playback (simulation): playing, the step and frame it started at, the frame last applied. */
    this.pb = { playing: false, startStep: 0, from: 0, frame: START };
    /** The live shot's id and the values its overrides replaced (restored when it ends). */
    this.shot = { id: null, saved: {} };
    /** lookAt track id → the target it last set (so a gap clears only what the track set). */
    this.looks = {};
    /** A baked simulation cache (bake.js): step → { nodeId: pose }. Data, like an asset: not in the snapshot. */
    this.baked = null;
    const audio = tree.services.get('audio');
    if (audio) audio.addProvider(() => this.sounds());
  }

  get fps() { return this.seq?.fps ?? 24; }
  get duration() { return this.seq?.duration ?? 0; }
  get tracks() { return this.seq?.tracks ?? []; }

  /** Read what the sequence's dialogue and audio tracks play (before instantiate), and take its block. */
  async prepare(doc) {
    this.seq = doc.sequence ?? null;
    if (!this.seq) return this;
    // the virtual cameras frame in screen space, so the output aspect is a simulation input: a sequence steps at its
    // export's (every export size is 16:9), never at a window's, or a resize between snapshot and scrub moves the shot
    this.tree.services.get('cameras')?.fixAspect?.(ASPECT);
    const voice = this.tree.services.get('voice'), audio = this.tree.services.get('audio');
    for (const t of this.tracks) for (const c of t.clips ?? []) {
      if (t.type === 'dialogue' && c.clip && voice) await voice.preload(c.clip);
      if (t.type === 'audio' && c.asset && audio) await audio.library.add(c.asset);
    }
    if (this.seq.autoplay !== false) this.play({});
    return this;
  }

  // ---------------------------------------------------------------- control (simulation: call between steps)

  /** Play from a frame, starting now. */
  play({ from = 0 } = {}) { this.pb = { playing: true, startStep: this.tree.clock.step, from, frame: from === 0 ? START : from }; }
  stop() { this.pb.playing = false; }

  /** The frame the sequence is at after `steps` steps (default: now). */
  frameAt(steps = this.tree.clock.step) {
    if (!this.pb.playing && this.pb.frame !== START) return this.pb.frame;
    const { num, den } = rationalFps(this.fps);
    return this.pb.from + ((steps - this.pb.startStep) * num) / (60 * den);
  }
  /** The step on which a frame is reached (and the α past it): frame f of a sequence that started at step 0 from 0. */
  stepOf(frame) { const r = frameToStep(frame - this.pb.from, this.fps); return { step: r.step + this.pb.startStep, alpha: r.alpha }; }

  // ---------------------------------------------------------------- the step

  physicsProcess() {
    const pb = this.pb;
    if (!this.seq || !pb.playing) return;
    let frame = this.frameAt(this.tree.clock.step + 1); // the frame this step arrives at
    let done = false;
    if (frame >= this.duration) { frame = this.duration; done = true; }
    const prev = pb.frame;
    pb.frame = frame;
    const held = done ? frame - 1e-6 : frame; // the last frame holds: its shot, camera and looks stay when the sequence ends
    this.applyShot(held);
    for (const t of this.tracks) {
      if (TRACK_TYPES.includes(t.type)) {
        applyTrack(this.tree, t, frame, this.fps);
        if (t.type === 'event') this.fire(t, prev, frame);
      } else if (t.type === 'camera') this.applyCamera(t, held);
      else if (t.type === 'lookAt') this.applyLook(t, held);
      else if (t.type === 'dialogue') for (const c of linesBetween(t, prev, frame)) this.say(t.target, c);
    }
    if (done) {
      pb.playing = false;
      for (const t of this.tracks) if (t.type === 'animation') { const n = /** @type {any} */ (this.tree.find(t.target)); if (n) n.trackAnimation = null; }
      this.tree.emit(this.tree.root, 'sequenceFinished', { frame });
    }
  }

  afterNodes() {
    if (!this.baked || !this.seq) return;
    const poses = this.baked.poses.get(this.tree.clock.step + 1);
    if (!poses || !this.inBakedSpan(this.pb.frame)) return;
    const world = this.tree.services.get('physics')?.world;
    for (const [id, p] of Object.entries(poses)) {
      const n = /** @type {any} */ (this.tree.find(id));
      if (!n) continue;
      if (p.b && world && n.body !== undefined) { world.setPose(n.body, p.b.slice(0, 3), p.b.slice(3, 7)); world.setMotion(n.body, p.b.slice(7, 10), p.b.slice(10, 13)); }
      n.object3d.position.fromArray(p.t, 0); n.object3d.quaternion.fromArray(p.t, 3); n.object3d.scale.fromArray(p.t, 7);
      if (p.state && n.setState) n.setState(structuredClone(p.state));
    }
  }

  /** True inside a simulation track's baked clip. */
  inBakedSpan(frame) { return this.tracks.some((t) => t.type === 'simulation' && clipAt(t, frame)?.mode === 'baked'); }

  fire(track, from, to) {
    for (const e of eventsBetween(track, from, to)) {
      if (e.call) { const n = this.tree.find(e.target); if (n) this.tree.call(n, e.call, e.args ?? {}); }
      else if (e.emit) this.tree.emit(this.tree.root, 'event', { name: e.emit, ...(e.args ?? {}) });
    }
  }

  say(target, c) {
    const n = /** @type {any} */ (this.tree.find(target));
    if (n?.say) this.tree.call(n, 'say', c.clip ? { clip: c.clip, text: c.text } : { text: c.text });
  }

  brainFor(track) {
    const brains = this.tree.services.get('cameras')?.brains ?? [];
    return track.brain ? brains.find((b) => b.id === track.brain) : brains[0];
  }

  applyCamera(track, frame) {
    const brain = this.brainFor(track);
    if (!brain) return;
    const c = clipAt(track, frame);
    const want = c?.camera ?? null;
    if (want === brain.bstate.override) return;
    if (want) brain.override({ camera: want, blend: c.blend ? { fps: this.fps, ...c.blend } : { style: 'cut' } });
    else brain.clearOverride();
  }

  applyLook(track, frame) {
    const n = /** @type {any} */ (this.tree.find(track.target));
    if (!n?.lookAt) return;
    const c = clipAt(track, frame);
    let at = c?.at ?? null;
    if (at === 'camera') at = this.brainFor(track)?.props.camera ?? null;
    const had = this.looks[track.id] ?? null;
    if (at === had) return;
    if (at || had) { n.lookAt({ target: at }); this.looks[track.id] = at; }
  }

  /** Enter or leave shots: apply the new shot's overrides, putting back what the last one replaced. */
  applyShot(frame) {
    const s = shotAt(this.seq, frame);
    const id = s?.id ?? null;
    if (id === this.shot.id) return;
    for (const [nid, saved] of Object.entries(this.shot.saved)) this.writeOverride(nid, saved);
    const saved = {};
    for (const [nid, o] of Object.entries(s?.overrides ?? {})) { saved[nid] = this.readOverride(nid, o); this.writeOverride(nid, o); }
    this.shot = { id, saved };
    if (id) this.tree.emit(this.tree.root, 'shotChanged', { shot: id, frame });
  }

  readOverride(nid, o) {
    const n = /** @type {any} */ (this.tree.find(nid));
    if (!n) return {};
    const out = {};
    if (o.transform) { const ob = n.object3d; out.transform = { p: ob.position.toArray(), q: ob.quaternion.toArray(), s: ob.scale.toArray() }; }
    if (o.props) out.props = Object.fromEntries(Object.keys(o.props).map((k) => [k, structuredClone(n.props[k] ?? null)]));
    return out;
  }

  writeOverride(nid, o) {
    const n = /** @type {any} */ (this.tree.find(nid));
    if (!n) return;
    const t = o.transform;
    if (t) { if (t.p) n.object3d.position.fromArray(t.p); if (t.q) n.object3d.quaternion.fromArray(t.q); if (t.s) n.object3d.scale.fromArray(t.s); }
    if (o.props) for (const [k, v] of Object.entries(o.props)) { if (v === null) delete n.props[k]; else n.props[k] = structuredClone(v); }
  }

  // ---------------------------------------------------------------- presentation

  /**
   * The post stack's values for the frame being drawn: presentation shows the blend of the last two steps at α, so that
   * is the sequence frame at (step − 1 + α). The render host passes them to host.post.setParams.
   */
  postValues(alpha = 1) {
    if (!this.seq) return null;
    const posts = this.tracks.filter((t) => t.type === 'post');
    if (!posts.length) return null;
    const f = this.pb.playing || this.pb.frame === START ? this.frameAt(this.tree.clock.step - 1 + alpha) : this.pb.frame;
    return Object.assign({}, ...posts.map((t) => samplePost(t, Math.min(this.duration, Math.max(0, f)))));
  }

  /** Sounds the sequence's audio tracks play now (the audio service's provider). */
  sounds() {
    const pb = this.pb;
    if (!this.seq || !pb.playing) return [];
    const out = [], perFrame = 60 / this.fps;
    for (const t of this.tracks) {
      if (t.type !== 'audio') continue;
      for (const c of sampleAudio(t, pb.frame, this.fps)) {
        const startStep = pb.startStep + (c.start - pb.from) * perFrame - (c.offset - (pb.frame - c.start) / this.fps) * 60;
        out.push({ key: `sequence:${t.id ?? 'audio'}:${c.start}`, ref: c.asset, startStep, loop: false, bus: c.bus, gain: c.gain, position: null, distance: null });
      }
    }
    return out;
  }

  getState() { return structuredClone({ pb: this.pb, shot: this.shot, looks: this.looks }); }
  setState(s) { this.pb = { ...s.pb }; this.shot = structuredClone(s.shot); this.looks = { ...s.looks }; }
}
