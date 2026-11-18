// The "ai" service (M2 W7): what brains share. Stimuli (speech and other sounds) heard by every brain within their
// loudness; line-of-sight rays; smart-object adverts (items offering a verb, seats with a free place); the brains by
// agent, for setGoal; and the recorded-input hook M3's director will use: decisions made outside the step (an LLM's
// reply, a person's command) enter as events stamped with the step they apply on, are logged, and replay from the log,
// so a shot never calls the model again (research/npc-ai.md §4.3).
import { ACTIONS } from './actions.js';

export class AiService {
  /** @param {any} tree @param {{ resolve?: (ref: string) => Promise<Uint8Array> | Uint8Array }} [opts] resolve: project files (brain documents) */
  constructor(tree, { resolve } = {}) {
    this.tree = tree; this.resolve = resolve ?? null;
    /** Brain documents a scene names by path ("brains/hana.json"): ref → preset (data, like an asset; not state). */
    this.presets = new Map();
    /** @type {any[]} brains in the order they became ready */ this.brains = [];
    /** Stimuli of recent steps: { step, kind, source, position, loudness, topic, to, text } (simulation state). */
    this.stimuli = [];
    /** Injected decisions waiting for their step, and every one applied (the log a replay reads). */
    this.pending = []; this.log = [];
  }

  /** Read every brain document the scene's brains name by path (before instantiate), prefab instances aside. */
  async prepare(doc) {
    const refs = new Set();
    for (const n of doc.nodes ?? []) for (const b of n.behaviours ?? []) if (b.use === 'brain' && typeof b.preset === 'string' && /\.json$/i.test(b.preset)) refs.add(b.preset);
    for (const ref of refs) {
      if (this.presets.has(ref)) continue;
      if (!this.resolve) throw new Error(`a brain names ${ref}: install the AI service with a resolve to read it`);
      const d = JSON.parse(new TextDecoder().decode(await this.resolve(ref)));
      if (d.format !== 'vrmxg-brain' || !d.tree) throw new Error(`${ref}: not a brain document ({ "format": "vrmxg-brain", "plan", "senses", "tree" })`);
      this.presets.set(ref, d);
    }
    return this;
  }

  register(b) { this.brains.push(b); }
  brainOf(id) { return this.brains.find((b) => b.node.id === id && b.node.tree === this.tree) ?? null; }
  characters() {
    if (this._chars?.v !== this.tree.structureVersion) this._chars = { v: this.tree.structureVersion, list: this.tree.all().filter((n) => n.type === 'Character') };
    return this._chars.list;
  }

  physicsProcess() {
    const step = this.tree.clock.step;
    this.brains = this.brains.filter((b) => this.tree.find(b.node.id) === b.node);
    if (this.stimuli.length) this.stimuli = this.stimuli.filter((s) => step - s.step <= 120);
  }

  /** A sound brains can hear (say emits one per line). */
  stimulus(s) { this.stimuli.push({ step: this.tree.clock.step, kind: s.kind, source: s.source, position: s.position.slice(), loudness: s.loudness ?? 5, topic: s.topic ?? null, to: s.to ?? null, text: s.text ?? null }); }
  /** Stimuli since a brain last listened (an LOD-slowed brain still hears what was said between its ticks). */
  heard(step, since = step - 1) { return this.stimuli.filter((s) => s.step >= since && s.step < step); }

  /** Can `me` see `o`: a ray from eye to eye, unblocked short of the other's capsule. */
  lineOfSight(me, o, eye = 1.5) {
    const physics = this.tree.services.get('physics');
    if (!physics) return true;
    const a = me.object3d.position, b = o.object3d.position;
    const from = [a.x, a.y + eye, a.z], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-6) return true;
    const hit = physics.world.raycast(from, [dx / d, dy / d, dz / d], d, { excludeBody: me.body });
    return !hit || hit.distance >= d - 0.45;
  }

  /** Items offering `verb` within `range` of a node, nearest first; a seat counts only with a free place. */
  adverts(node, verb, range = 10) {
    const p = node.object3d.position, out = [];
    const seated = new Map();
    for (const c of this.characters()) if (c.ctrl?.seat && c !== node) seated.set(c.ctrl.seat.item, (seated.get(c.ctrl.seat.item) ?? 0) + 1);
    for (const n of this.tree.all()) {
      if (n.type !== 'Item' || !n.offered?.().some((v) => v.verb === verb)) continue;
      if (verb === 'sit' && (seated.get(n.id) ?? 0) >= (n.seatPoints?.().length ?? 0)) continue;
      const q = n.object3d.getWorldPosition(n.object3d.position.clone()), dx = q.x - p.x, dz = q.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d <= range) out.push({ id: n.id, d });
    }
    return out.sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
  }

  standUp(node) { const s = this.tree.services.get('interact'); if (s && node.ctrl?.seat) s.standUp(node); }

  /** True when a player character is farther than `distance` (brains tick four times slower then: the LOD). */
  farFromPlayer(node, distance) {
    const player = this.characters().find((c) => c.behaviours.some((b) => b.name === 'player'));
    if (!player || player === node) return false;
    const a = node.object3d.position, b = player.object3d.position, dx = a.x - b.x, dz = a.z - b.z;
    return dx * dx + dz * dz > distance * distance;
  }

  // ---------------------------------------------------------------- the recorded-input hook (M3's director)

  /**
   * A decision from outside the step: { step, agent, goal: { name, params } } or { step, agent, action: { do, args } }.
   * It applies on that step (or the next brain tick after it), is logged, and replays from the log.
   */
  inject(e) {
    if (!e.agent || (!e.goal && !e.action)) throw new Error('inject needs an agent and a goal or an action');
    if (e.action && !ACTIONS[e.action.do]) throw new Error(`unknown action "${e.action.do}"`);
    this.pending.push(structuredClone({ step: e.step ?? this.tree.clock.step, agent: e.agent, ...(e.goal ? { goal: e.goal } : {}), ...(e.action ? { action: e.action } : {}) }));
    this.pending.sort((a, b) => a.step - b.step);
  }
  /** Replay a log: every event queued again for its step. */
  replay(log) { for (const e of log) this.inject(e); }
  /** The events applied so far. */
  record() { return structuredClone(this.log); }

  /** A brain's tick: apply its due events (goals onto the blackboard, actions as an override the tree waits behind). */
  applyInjected(brain, ctx) {
    const due = this.pending.filter((e) => e.agent === brain.node.id && e.step <= ctx.step);
    if (due.length) {
      this.pending = this.pending.filter((e) => !due.includes(e));
      for (const e of due) {
        if (e.goal) brain.bb.goal = { ...structuredClone(e.goal), from: 'director', step: ctx.step };
        if (e.action) brain.bb.override = { do: e.action.do, args: structuredClone(e.action.args ?? {}), data: null };
        this.log.push(e);
      }
    }
  }

  getState() { return { stimuli: structuredClone(this.stimuli), pending: structuredClone(this.pending), log: structuredClone(this.log) }; }
  setState(s) { this.stimuli = structuredClone(s.stimuli); this.pending = structuredClone(s.pending); this.log = structuredClone(s.log); }
}
