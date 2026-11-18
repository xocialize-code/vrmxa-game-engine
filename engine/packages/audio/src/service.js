// The audio service: makes what is heard match what the simulation says is playing.
//
// Sources: every AudioPlayer node, plus providers other systems register (a character's voice line, @vrmxg/voice).
// Each one describes a sound as plain data: { key, ref, startStep, loop, bus, gain, position | null, distance }.
//   present()       every frame: starts the sounds that should be playing (at the offset the step clock says, plus the
//                   output's latency), stops the ones that shouldn't, moves positional ones and the listener (the
//                   current camera). Presentation only; nothing here changes the simulation (AB-D-0248).
//   afterNodes()    every step, while recording: the same descriptions and the listener, for the offline mix (mix.js).
// Without an output (headless, the editor's edit view) present() does nothing and nothing else changes: the simulation
// hashes the same with sound or without.
import { AudioLibrary } from './library.js';

const DT = 1 / 60;
const RESYNC = 0.08; // seconds of drift from the step clock before a playing sound is restarted at the right offset

export class AudioService {
  /** @param {any} tree @param {{ resolve: (ref: string) => any, output?: import('./output.js').AudioOutput | null, prefabs?: Map<string, any> }} opts */
  constructor(tree, { resolve, output = null, prefabs }) {
    this.tree = tree;
    this.library = new AudioLibrary({ resolve, prefabs: prefabs ?? tree.prefabs });
    this.output = output;
    /** @type {Array<(step: number) => any[]>} */ this.providers = [];
    /** key → { src, gain, panner, ref, startStep, startedAt, offset } */ this.voices = new Map();
    this.rec = null;
    this.lastAlpha = 1;
  }

  prepare(doc) { return this.library.prepare(doc); }

  /** Add a source of sounds: fn(step) → descriptions (see the header). */
  addProvider(fn) { this.providers.push(fn); }

  /** What should be playing at a step. */
  sounds(step = this.tree.clock.step) {
    const out = [];
    for (const n of this.tree.all()) {
      if (!n.ref || typeof n.elapsedAt !== 'function' || !n.playing) continue;
      out.push({
        key: `node:${n.id}`, ref: n.ref, startStep: n.startStep, loop: !!n.props.loop, bus: n.props.bus ?? 'sfx', gain: n.props.volume ?? 1,
        position: n.positional ? worldPosition(n.object3d) : null,
        distance: n.positional ? { ref: n.props.refDistance ?? 1, max: n.props.maxDistance ?? 30, rolloff: n.props.rolloff ?? 1 } : null,
      });
    }
    for (const p of this.providers) out.push(...p(step));
    return out;
  }

  /** The listener: the current camera's world position and its forward and up directions. */
  listener() {
    const cam = this.tree.services.get('cameras')?.current?.camera;
    if (!cam) return null;
    cam.updateWorldMatrix(true, false);
    const e = cam.matrixWorld.elements;
    return { p: [e[12], e[13], e[14]], f: [-e[8], -e[9], -e[10]], u: [e[4], e[5], e[6]] };
  }

  // ---------------------------------------------------------------- live (presentation)

  present(_elapsed, alpha) {
    this.lastAlpha = alpha;
    const out = this.output;
    if (!out) return;
    const ctx = out.ctx;
    // the step being shown: the last one simulated, plus the blend toward the next
    const now = this.tree.clock.step - 1 + alpha;
    const want = this.sounds(this.tree.clock.step);
    const keep = new Set();
    for (const s of want) {
      const clip = this.library.clip(s.ref);
      if (!clip) continue;
      let offset = (now - s.startStep) * DT + out.latency;
      if (s.loop) offset %= clip.duration; else if (offset >= clip.duration) continue;
      offset = Math.max(0, offset);
      keep.add(s.key);
      let v = this.voices.get(s.key);
      if (v && v.startStep !== s.startStep) { this.stopVoice(s.key); v = null; } // played again: from the start
      if (v && v.src && !s.loop) { // drifted from the step clock (a hitch, a held step): put it back
        const heard = ctx.currentTime - v.startedAt + v.offset;
        if (Math.abs(heard - offset) > RESYNC) { this.stopVoice(s.key); v = null; }
      }
      if (!v) v = this.startVoice(s, offset);
      if (v.panner && s.position) setPos(v.panner, s.position, ctx.currentTime);
      v.gain.gain.setTargetAtTime(s.gain, ctx.currentTime, 0.02);
    }
    for (const k of [...this.voices.keys()]) if (!keep.has(k)) this.stopVoice(k);
    const l = this.listener();
    if (l) setListener(ctx.listener, l, ctx.currentTime);
  }

  startVoice(s, offset) {
    const ctx = this.output.ctx;
    const gain = ctx.createGain();
    gain.gain.value = s.gain;
    let panner = null;
    if (s.position) {
      panner = ctx.createPanner();
      Object.assign(panner, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: s.distance.ref, maxDistance: s.distance.max, rolloffFactor: s.distance.rolloff });
      setPos(panner, s.position, ctx.currentTime);
      gain.connect(panner).connect(this.output.bus(s.bus).gain);
    } else gain.connect(this.output.bus(s.bus).gain);
    const v = { src: null, gain, panner, ref: s.ref, startStep: s.startStep, startedAt: ctx.currentTime, offset, pending: true };
    this.voices.set(s.key, v);
    this.library.buffer(ctx, s.ref).then((buffer) => {
      if (this.voices.get(s.key) !== v) return; // stopped before it was decoded
      const src = ctx.createBufferSource();
      src.buffer = buffer; src.loop = s.loop;
      src.connect(gain);
      // decoding took a moment: start that much further in
      const late = ctx.currentTime - v.startedAt;
      v.offset = s.loop ? (offset + late) % buffer.duration : offset + late;
      v.startedAt = ctx.currentTime;
      if (!s.loop && v.offset >= buffer.duration) return;
      src.start(ctx.currentTime, v.offset);
      v.src = src; v.pending = false;
    }).catch((e) => console.warn(`[audio] ${s.ref}: ${e.message}`));
    return v;
  }

  stopVoice(key) {
    const v = this.voices.get(key);
    if (!v) return;
    try { v.src?.stop(); } catch { /* already ended */ }
    v.src?.disconnect(); v.gain.disconnect(); v.panner?.disconnect();
    this.voices.delete(key);
  }

  /** Stop everything this tree is playing (Stop in the editor, a reload, a pause). */
  silence() { for (const k of [...this.voices.keys()]) this.stopVoice(k); }
  dispose() { this.silence(); this.providers.length = 0; }

  // ---------------------------------------------------------------- recording (for the offline mix)

  /** Start recording what plays, from this step on. */
  record() { this.rec = { from: this.tree.clock.step, steps: [] }; }

  afterNodes() {
    if (!this.rec) return;
    const step = this.tree.clock.step;
    this.rec.steps.push({ step, sounds: this.sounds(step).map((s) => ({ ...s, position: s.position && s.position.map(round) })), listener: roundListener(this.listener()) });
  }

  /** The recording so far, as plain data (JSON-safe). */
  recording() { return this.rec ? { from: this.rec.from, to: this.tree.clock.step, steps: this.rec.steps } : null; }

}

const round = (v) => Math.round(v * 1e5) / 1e5;
const roundListener = (l) => (l ? { p: l.p.map(round), f: l.f.map(round), u: l.u.map(round) } : null);

function worldPosition(o) {
  o.updateWorldMatrix(true, false);
  const e = o.matrixWorld.elements;
  return [e[12], e[13], e[14]];
}

export function setPos(panner, p, t) {
  if (panner.positionX) { panner.positionX.setValueAtTime(p[0], t); panner.positionY.setValueAtTime(p[1], t); panner.positionZ.setValueAtTime(p[2], t); }
  else panner.setPosition(p[0], p[1], p[2]);
}

export function setListener(l, { p, f, u }, t) {
  if (l.positionX) {
    l.positionX.setValueAtTime(p[0], t); l.positionY.setValueAtTime(p[1], t); l.positionZ.setValueAtTime(p[2], t);
    l.forwardX.setValueAtTime(f[0], t); l.forwardY.setValueAtTime(f[1], t); l.forwardZ.setValueAtTime(f[2], t);
    l.upX.setValueAtTime(u[0], t); l.upY.setValueAtTime(u[1], t); l.upZ.setValueAtTime(u[2], t);
  } else { l.setPosition(p[0], p[1], p[2]); l.setOrientation(f[0], f[1], f[2], u[0], u[1], u[2]); }
}
