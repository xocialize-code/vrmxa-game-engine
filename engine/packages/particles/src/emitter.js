// The ParticleEmitter node (M2 W4): shows an effect where it stands. `mode` puts it on one side of the determinism
// boundary (AB-D-0248):
//   simulation    (default) stepped at 60 Hz by the particles service before the nodes, its randomness a pure function of
//                 (scene seed, emitter id, step), its particles in the snapshot and the world hash: gameplay particles,
//                 and anything a shot must replay or scrub to exactly (steam in a sequence)
//   presentation  stepped with the presented frame's time, not in the snapshot: visual-only dressing
import { Node } from '@vrmxg/core';
import * as Q from 'three.quarks';

/** A particle's fields as plain data (numbers, and vectors as arrays): what the snapshot holds. */
function particleState(p) {
  const o = {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'number' || typeof v === 'boolean') o[k] = v;
    else if (v && typeof v.toArray === 'function' && k !== 'parentMatrix') o[k] = v.toArray();
    else if (k === 'memory') o.memory = JSON.parse(JSON.stringify(v));
  }
  return o;
}
function setParticle(p, o) {
  for (const [k, v] of Object.entries(o)) {
    if (k === 'memory') p.memory = JSON.parse(JSON.stringify(v));
    else if (Array.isArray(v)) { if (p[k]?.fromArray) p[k].fromArray(v); }
    else p[k] = v;
  }
}
const cloneEmission = (e) => ({ ...e, previousWorldPos: e.previousWorldPos ? e.previousWorldPos.toArray() : null });

export class ParticleEmitterNode extends Node {
  static actions = ['play', 'stop', 'restart'];

  constructor(data, def) {
    super(data, def);
    /** @type {any[]} three.quarks systems (built by the service) */ this.systems = [];
    /** Playing (simulation state), and whether `finished` was emitted for this play. */
    this.pstate = { playing: false, finished: false };
  }

  get effect() { return this.props.effect ?? 'steam'; }
  get mode() { return this.props.mode ?? 'simulation'; }

  enterTree() { this.tree.services.get('particles')?.register(this); }
  exitTree() { this.tree.services.get('particles')?.unregister(this); }
  ready() { if (this.props.autoplay !== false) this.play(); }

  /** Start emitting (from the effect's start). */
  play() { this.restart(); this.pstate = { playing: true, finished: false }; }
  /** Stop emitting; live particles finish their lives. */
  stop() { for (const s of this.systems) if (!s.emitEnded) s.endEmit(); }
  restart() { for (const s of this.systems) { s.restart(); s.particleNum = 0; } this.pstate.finished = false; }

  /** Live particles across the effect's systems. */
  get count() { let n = 0; for (const s of this.systems) n += s.particleNum; return n; }

  /** One step (the service calls it, inside its seeded run). */
  advance(dt) {
    if (!this.pstate.playing) return;
    for (const s of this.systems) s.update(dt);
    if (!this.pstate.finished && this.systems.every((s) => s.emitEnded && s.particleNum === 0)) {
      this.pstate.finished = true; this.pstate.playing = false;
      this.emit('finished', {});
    }
  }

  getState() {
    if (this.mode !== 'simulation') return { pstate: { ...this.pstate } };
    return {
      pstate: { ...this.pstate },
      systems: this.systems.map((s) => ({
        emission: cloneEmission(s.emissionState), emitEnded: s.emitEnded, markForDestroy: s.markForDestroy, paused: s.paused,
        prewarmed: s.prewarmed, firstTimeUpdate: s.firstTimeUpdate, memory: JSON.parse(JSON.stringify(s.memory)),
        particles: s.particles.slice(0, s.particleNum).map(particleState),
      })),
    };
  }

  setState(st) {
    this.pstate = { ...st.pstate };
    if (!st.systems) return;
    st.systems.forEach((ss, k) => {
      const s = this.systems[k];
      if (!s) return;
      const { previousWorldPos, ...e } = ss.emission;
      s.emissionState = { ...e, ...(previousWorldPos ? { previousWorldPos: new Q.Vector3().fromArray(previousWorldPos) } : {}) };
      Object.assign(s, { emitEnded: ss.emitEnded, markForDestroy: ss.markForDestroy, paused: ss.paused, prewarmed: ss.prewarmed, firstTimeUpdate: ss.firstTimeUpdate });
      s.memory.length = 0; s.memory.push(...JSON.parse(JSON.stringify(ss.memory)));
      ss.particles.forEach((o, i) => setParticle(s.particles[i] ?? (s.particles[i] = new Q.SpriteParticle()), o));
      s.particleNum = ss.particles.length;
    });
  }
}
