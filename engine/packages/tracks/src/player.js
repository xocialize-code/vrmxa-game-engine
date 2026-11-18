// Playing tracks in the simulation (M2 W0): the AnimationPlayer node and the "tracks" service.
//
// An AnimationPlayer holds tracks in its props and plays them on the step clock: frame = from + (step − startStep) ·
// fps · speed / 60. The service runs before the nodes in every step (services' physicsProcess), so what a player sets
// (a door's prop, a character's animation, an expression) is there when those nodes step, in the same step. Events
// fire as playback crosses their frames. Playing is simulation: deterministic, and in the snapshot (the node's
// getState), so a door an AnimationPlayer opens replays bit for bit.
import { Node } from '@vrmxg/core';
import { evaluateTrack, eventsBetween, sampleAnimation, sampleAudio, checkTrack } from './evaluate.js';

/** Set a value at a dotted path on a node: "visible" shows or hides it; "props.x.y" sets a prop. */
export function setNodePath(node, path, value) {
  if (path === 'visible') { if (value) node.show?.(); else node.hide?.(); return; }
  const ks = path.split('.');
  let o = node;
  for (const k of ks.slice(0, -1)) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
  o[ks[ks.length - 1]] = value;
}

/**
 * Apply one track at a frame to a tree (what its targets show). Events and audio are not applied here: the player
 * fires events between frames, and audio is a provider for the audio service.
 * @param {any} tree @param {any} track @param {number} frame @param {number} fps
 */
export function applyTrack(tree, track, frame, fps) {
  if (track.type === 'event' || track.type === 'audio') return;
  const node = /** @type {any} */ (tree.find(track.target));
  if (!node) return;
  if (track.type === 'animation') { node.trackAnimation = sampleAnimation(track, frame, fps); return; }
  const v = evaluateTrack(track, frame, fps);
  if (v === undefined) return;
  if (track.type === 'property') setNodePath(node, track.path, v);
  else if (track.type === 'transform') {
    const o = node.object3d;
    if (v.p) o.position.set(v.p[0], v.p[1], v.p[2]);
    if (v.q) o.quaternion.set(v.q[0], v.q[1], v.q[2], v.q[3]);
    if (v.s) o.scale.set(v.s[0], v.s[1], v.s[2]);
  } else if (track.type === 'expression') {
    for (const [name, w] of Object.entries(v)) if (w !== undefined) (node.setExpression ? node.setExpression(name, w) : node.vrm?.expressionManager?.setValue(name, w));
  }
}

export class AnimationPlayerNode extends Node {
  static actions = ['play', 'stop', 'seek'];

  constructor(data, def) {
    super(data, def);
    /** Playback state (simulation): playing, the step it started on, the frame it started from, the frame last applied. */
    this.playback = { playing: false, startStep: 0, from: 0, frame: 0 };
  }

  get tracks() { return this.props.tracks ?? []; }
  get fps() { return this.props.fps ?? 30; }
  get length() { return this.props.length ?? Math.max(1, ...this.tracks.flatMap((t) => [...(t.keys && !Array.isArray(t.keys) ? Object.values(t.keys).flat() : t.keys ?? []).map((k) => k[0]), ...(t.clips ?? []).map((c) => c.end)])); }

  enterTree() { this.tree.services.get('tracks')?.register(this); }
  exitTree() { this.release(); this.tree.services.get('tracks')?.unregister(this); }
  ready() { if (this.props.autoplay) this.play({}); }

  /** Problems with the tracks (empty when fine). */
  check() { return this.tracks.flatMap((t) => checkTrack(t)); }

  // ---------------------------------------------------------------- actions
  play({ from = 0 } = {}) {
    this.playback = { playing: true, startStep: this.tree.clock.step, from, frame: from - 1e-9 };
    this.tree.emit(this, 'started', { from });
  }
  stop() { if (!this.playback.playing) return; this.playback.playing = false; this.release(); this.tree.emit(this, 'finished', { stopped: true }); }
  /** Jump to a frame and show it (no events fire on a jump); playback, if on, continues from there. */
  seek({ frame = 0 } = {}) {
    this.playback = { ...this.playback, startStep: this.tree.clock.step, from: frame, frame };
    this.applyAt(frame);
  }

  // ---------------------------------------------------------------- the step (the tracks service, before the nodes)

  /** Advance to this step's frame: fire the events crossed, apply every track, finish or loop at the end. */
  advance(step) {
    const pb = this.playback;
    if (!pb.playing) return;
    const len = this.length, speed = this.props.speed ?? 1;
    let frame = pb.from + ((step - pb.startStep) * this.fps * speed) / 60;
    let done = false;
    if (frame >= len) {
      if (this.props.loop) {
        this.fire(pb.frame, len);
        const wrapped = frame - Math.floor(frame / len) * len;
        pb.startStep = step; pb.from = wrapped; pb.frame = -1e-9; frame = wrapped;
      } else { frame = len; done = true; }
    }
    this.fire(pb.frame, frame);
    pb.frame = frame;
    this.applyAt(frame);
    if (done) { pb.playing = false; this.release(); this.tree.emit(this, 'finished', { stopped: false }); }
  }

  applyAt(frame) { for (const t of this.tracks) applyTrack(this.tree, t, frame, this.fps); }

  /** Events in (from, to]: call an action on a node, or emit a signal from the player. */
  fire(from, to) {
    for (const t of this.tracks) {
      if (t.type !== 'event') continue;
      for (const e of eventsBetween(t, from, to)) {
        if (e.call) { const n = this.tree.find(e.target); if (n) this.tree.call(n, e.call, e.args ?? {}); }
        else if (e.emit) this.tree.emit(this, 'event', { name: e.emit, ...(e.args ?? {}) });
      }
    }
  }

  /** Let characters this player animated go back to their own locomotion. */
  release() {
    for (const t of this.tracks) if (t.type === 'animation') { const n = /** @type {any} */ (this.tree?.find(t.target)); if (n) n.trackAnimation = null; }
  }

  /** Sounds the audio tracks play now (the audio service's provider). */
  sounds(step) {
    const pb = this.playback;
    if (!pb.playing) return [];
    const out = [];
    const perFrame = 60 / (this.fps * (this.props.speed ?? 1)); // steps per frame
    for (const t of this.tracks) {
      if (t.type !== 'audio') continue;
      for (const c of sampleAudio(t, pb.frame, this.fps)) {
        // the step the sound would have started on to be `offset` in now: the audio service schedules from it
        const startStep = pb.startStep + (c.start - pb.from) * perFrame - (c.offset - (pb.frame - c.start) / this.fps) * 60;
        out.push({ key: `track:${this.id}:${t.id ?? 'audio'}:${c.start}`, ref: c.asset, startStep, loop: false, bus: c.bus, gain: c.gain, position: null, distance: null });
      }
    }
    void step;
    return out;
  }

  getState() { return { playback: { ...this.playback } }; }
  setState(s) { this.playback = { ...s.playback }; }
}

/** The "tracks" service: advances every AnimationPlayer before the nodes step, in the order they entered the tree. */
export class TracksService {
  constructor(tree) {
    this.tree = tree;
    /** @type {AnimationPlayerNode[]} */ this.players = [];
    const audio = tree.services.get('audio');
    if (audio) audio.addProvider((step) => this.players.flatMap((p) => p.sounds(step)));
  }
  register(p) { this.players.push(p); }
  unregister(p) { this.players = this.players.filter((x) => x !== p); }
  physicsProcess() {
    const step = this.tree.clock.step;
    for (const p of this.players) if (this.tree.scaleOf(p) > 0) p.advance(step);
  }
  /** Read the sounds the scene's audio tracks name into the audio library (before instantiate). */
  async prepare(doc) {
    const audio = this.tree.services.get('audio');
    if (!audio) return this;
    for (const n of doc.nodes ?? []) for (const t of n.props?.tracks ?? []) if (t.type === 'audio') for (const c of t.clips ?? []) if (c.asset) await audio.library.add(c.asset);
    return this;
  }
}
