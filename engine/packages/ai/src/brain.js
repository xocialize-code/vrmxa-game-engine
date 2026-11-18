// The `brain` behaviour (M2 W7): what an NPC perceives, knows and does. On a Character:
//   { "use": "brain", "preset": "server", "vars": { "counter": [0.6, 0, -4.6] }, "tickEvery": 1 }
// Each tick (every `tickEvery` steps; four times slower beyond `lodDistance` of the player, the LOD), in order:
//   perception   sight (a cone, range and line-of-sight rays from the eyes), hearing (speech and other stimuli within
//                their loudness), proximity; each sensed thing becomes or refreshes a memory record whose strength
//                rises while sensed and decays when not, forgotten after `maxAge`
//   decision     the preset's behaviour tree (bt.js), its utility options scored against the blackboard and memory
//   action       the tree's leaves run the action vocabulary on the character
// Its randomness is the behaviour's own stream (scene seed + node id + "brain"); its blackboard, memory, tree state and
// running actions are plain data in getState, so a brain restores mid-thought and replays bit for bit.
import { Behaviour } from '@vrmxg/core';
import { compile, tick, resolve } from './bt.js';
import { ACTIONS } from './actions.js';
import { PRESETS } from './presets.js';

const EYE = 1.5;

export class BrainBehaviour extends Behaviour {
  ready() {
    const preset = typeof this.params.preset === 'object' ? this.params.preset : PRESETS[this.params.preset ?? 'wanderer'];
    if (!preset) throw new Error(`${this.node.id}: no brain preset "${this.params.preset}" (${Object.keys(PRESETS).join(', ')})`);
    this.preset = preset;
    this.nodes = compile(preset.tree);
    const p = this.node.object3d.position;
    /** The blackboard: the preset's plan, the scene's vars over it, home. */
    this.bb = { home: [p.x, p.y, p.z], ...structuredClone(preset.plan ?? {}), ...structuredClone(this.params.vars ?? {}), goal: null };
    /** Tree state by node index. */ this.treeState = {};
    /** Memory: key (kind:source[:topic]) → { kind, source, topic, text, pos, first, last, strength, sensed } */ this.memory = {};
    this.lastTick = -1; this.status = null;
    this.tree.services.get('ai')?.register(this);
  }

  get senses() { return { sight: { range: 10, fov: 120, every: 6 }, hearing: { sensitivity: 1 }, proximity: { radius: 1.5 }, maxAge: 20, decay: 0.02, ...(this.preset?.senses ?? {}), ...(this.params.senses ?? {}) }; }

  physicsProcess() {
    const ai = this.tree.services.get('ai'), step = this.tree.clock.step;
    if (!ai) return;
    const every = Math.max(1, (this.params.tickEvery ?? this.preset.tickEvery ?? 1) * (ai.farFromPlayer(this.node, this.params.lodDistance ?? 25) ? 4 : 1));
    if (step % every !== 0) return;
    this.perceive(step, ai);
    const ctx = { node: this.node, tree: this.tree, ai, brain: this, bb: this.bb, step, rng: this.rng };
    ai.applyInjected(this, ctx);
    const o = this.bb.override;
    if (o) { // an injected action (the director's, a cue's) runs first; the tree waits behind it
      const act = ACTIONS[o.do], args = resolve(o.args, ctx);
      if (!o.data) o.data = act.start(ctx, args) ?? {};
      const r = act.update(ctx, args, o.data);
      if (r !== 'running') this.bb.override = null;
      this.status = `override:${r}`;
    } else this.status = tick(this.nodes, this.treeState, ctx);
    this.lastTick = step;
  }

  // ---------------------------------------------------------------- perception and memory

  remember(rec, step) {
    const key = `${rec.kind}:${rec.source}${rec.topic ? `:${rec.topic}` : ''}`;
    const m = this.memory[key];
    if (m) { m.last = step; m.pos = rec.pos; m.strength = Math.min(1, m.strength + (rec.gain ?? 0.25)); m.sensed = true; if (rec.text) m.text = rec.text; }
    else this.memory[key] = { kind: rec.kind, source: rec.source, topic: rec.topic ?? null, text: rec.text ?? null, to: rec.to ?? null, pos: rec.pos, first: step, last: step, strength: rec.gain ?? 0.25, sensed: true };
  }

  perceive(step, ai) {
    const S = this.senses, me = this.node, p = me.object3d.position;
    for (const m of Object.values(this.memory)) m.sensed = false;
    // proximity and sight: the other characters
    const q = me.object3d.quaternion, fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y); // facing (+Z turned)
    const cosHalf = cosDeg(S.sight.fov / 2);
    const lookNow = S.sight.range > 0 && step % S.sight.every === 0;
    for (const o of ai.characters()) {
      if (o === me) continue;
      const op = o.object3d.position, dx = op.x - p.x, dz = op.z - p.z, d = Math.sqrt(dx * dx + dz * dz), pos = [op.x, op.y, op.z];
      if (d <= S.proximity.radius) this.remember({ kind: 'near', source: o.id, pos, gain: 0.5 }, step);
      if (lookNow && d <= S.sight.range && (d < 1e-6 || (dx * fx + dz * fz) / d >= cosHalf) && ai.lineOfSight(me, o, EYE)) this.remember({ kind: 'sight', source: o.id, pos, gain: 0.34 }, step);
    }
    // hearing: the stimuli of the last step within their loudness
    for (const s of ai.heard(step, this.lastTick < 0 ? step - 1 : this.lastTick)) {
      if (s.source === me.id) continue;
      const dx = s.position[0] - p.x, dz = s.position[2] - p.z;
      if (dx * dx + dz * dz <= (s.loudness * S.hearing.sensitivity) * (s.loudness * S.hearing.sensitivity)) this.remember({ kind: s.kind, source: s.source, topic: s.topic, text: s.text, to: s.to, pos: s.position, gain: 1 }, step);
    }
    // decay and forget
    for (const [k, m] of Object.entries(this.memory)) {
      if (!m.sensed) m.strength = Math.max(0, m.strength - S.decay);
      if (step - m.last > S.maxAge * 60) delete this.memory[k];
    }
  }

  /**
   * The strongest memory matching { kind, topic?, source?, within? (s), to? }, or null.
   * @param {{ kind?: string, topic?: string, source?: string, within?: number, to?: string }} [q]
   */
  recall({ kind, topic, source, within, to } = {}) {
    let best = null;
    const step = this.tree.clock.step;
    for (const m of Object.values(this.memory)) {
      if (kind && m.kind !== kind) continue;
      if (topic && m.topic !== topic) continue;
      if (source && m.source !== source) continue;
      if (to && m.to && m.to !== to) continue;
      if (within !== undefined && step - m.last > within * 60) continue;
      if (!best || m.strength > best.strength || (m.strength === best.strength && m.last > best.last)) best = m;
    }
    return best;
  }

  // ---------------------------------------------------------------- inspect, snapshot

  /** What a debugger or MCP reads: the running branch, scores, blackboard and memory. */
  inspect() {
    const running = Object.keys(this.treeState).map(Number).sort((a, b) => a - b).map((i) => ({ i, type: this.nodes[i].spec.type, ...(this.nodes[i].spec.do ? { do: this.nodes[i].spec.do } : {}), ...(this.nodes[i].spec.name ? { name: this.nodes[i].spec.name } : {}) }));
    const utility = Object.entries(this.treeState).filter(([i]) => this.nodes[i].spec.type === 'utility').map(([i, s]) => ({ i: Number(i), options: this.nodes[i].spec.children.map((o) => o.name), current: s.cur, scores: s.scores }));
    return { preset: this.params.preset, status: this.status, running, utility, bb: structuredClone(this.bb), memory: structuredClone(Object.values(this.memory)) };
  }

  getState() { return { bb: structuredClone(this.bb), tree: structuredClone(this.treeState), memory: structuredClone(this.memory), lastTick: this.lastTick, status: this.status }; }
  setState(s) { this.bb = structuredClone(s.bb); this.treeState = structuredClone(s.tree); this.memory = structuredClone(s.memory); this.lastTick = s.lastTick; this.status = s.status; }
}

/** cos of an angle in degrees, through the portable Math.cos (dmath is installed over Math in every runtime). */
function cosDeg(d) { return Math.cos((d * Math.PI) / 180); }
