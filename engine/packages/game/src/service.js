// The "game" service (M5 W2, AB-D-0283): the game's state. Counters (the score is the counter "score"), flags, timers
// counted in steps, goals, the outcome (won or lost), the scene change that is pending and the checkpoints taken. The
// scene's game nodes (nodes.js) declare what exists and when things happen; the values live here, so the world snapshot
// holds them (getState / setState), every step's hashes include them (service:game) and a scene change carries them to
// the next world (carryTo). Nothing here reads a wall clock: time is the tree's step.
//
// Its part of a step is afterNodes, so install it after physics: the step's contacts and sensors have fired, and the
// actions their connections called (a counter added to, a flag set) are in the state the rules read.
//   1. timers tick (the nodes that declare them give the pause and the time scale);
//   2. goals, in the order the scene declares them: one whose condition holds is done;
//   3. checkpoints whose condition became true are taken;
//   4. win: the rules' `win` condition, or without one every goal that isn't optional done;
//   5. the `timeout` signals of the timers that reached zero in 1 (a connection may call `lose`);
//   6. lose: the rules' `lose` condition.
// So a win and a loss on the same step is a win. Deciding the game holds the timers that were running (the HUD keeps
// the final time), and while it is decided 2, 3, 4 and 6 are skipped: no goal is done, no checkpoint is taken (it
// would save a lost game over a good one), and the first result stands. A timer started afterwards runs (an ending's
// own clock). A new game (changeScene with reset, or restart) or a scene whose rules don't keep the outcome starts
// undecided, and there a held timer that was carried over (the whole game's clock) runs on.
//
// A scene change and a checkpoint are only recorded here, during the step. GameFlow (flow.js) acts on them at the step
// boundary; whether it has is not simulation state, so the hashes are the same whoever drives the world.
import { HZ } from '@vrmxg/core';
import { holds, checkCondition } from './conditions.js';

const toSteps = (seconds) => Math.round(Number(seconds) * HZ);
const sortKeys = (o) => { const out = {}; for (const k of Object.keys(o).sort()) out[k] = o[k]; return out; };
const FLAG_TYPES = new Set(['boolean', 'number', 'string']);
const KINDS = { counter: 'counters', timer: 'timers', goal: 'goals' };
const DEFAULT_SCOPE = { counter: 'game', timer: 'scene', goal: 'scene' };
const MAX_EVENTS = 1024;

export class GameService {
  /**
   * @param {any} tree a SceneTree
   * @param {{ scene?: string | null, seed?: number }} [o] scene: this world's scene, as changeScene names scenes (its
   *   path in the project); seed: the session's seed (default: the tree's). GameFlow sets both.
   */
  constructor(tree, { scene = null, seed } = {}) {
    this.tree = tree;
    /** This world's scene. */ this.scene = scene;
    /** The session's seed: each world's own seed comes from it and `arrivals` (flow.js worldSeed). */
    this.seed = (seed ?? tree.rng.seed) >>> 0;
    /** Scene changes so far. */ this.arrivals = 0;
    /** The step this scene was entered on. */ this.enteredAt = tree.clock.step;
    /** @type {Record<string, number>} */ this.counters = {};
    /** @type {Record<string, boolean | number | string>} */ this.flags = {};
    /** @type {Record<string, { steps: number, elapsed: number, running: boolean, done: boolean, acc: number, held: boolean }>} steps: the countdown's length (0: a stopwatch); held: stopped by the game's result */
    this.timers = {};
    /** @type {Record<string, { done: boolean, step: number | null }>} */ this.goals = {};
    /** @type {null | { result: 'won' | 'lost', step: number, scene: string | null }} */ this.outcome = null;
    /** @type {null | { to: string, at: number, reset: boolean }} the scene change asked for: done at the boundary where the clock is `at` */
    this.pending = null;
    /** @type {Record<string, { id: string, label: string | null, requested: number, seq: number }>} the last checkpoint taken into each slot; seq counts every one */
    this.checkpoints = {};
    /** How many checkpoints have been taken. */ this.checkpointSeq = 0;
    /** @type {Record<string, boolean>} checkpoint nodes of this scene: what their condition last was (true for good once taken, with `once`) */
    this.fired = {};

    // The scene's declarations: live nodes, in tree order. Not state: a world built from the same scene has the same.
    this.decl = { /** @type {any} */ rules: null, counters: new Map(), timers: new Map(), goals: new Map(), /** @type {any[]} */ checkpoints: [] };
    /** Changes whenever view() would give something else (the clock aside): a HUD re-reads the view when it moves. */
    this.version = 0;
    this._events = [];
    /** @type {Set<(event: any) => void>} */ this._listeners = new Set();
    this._view = /** @type {any} */ (null); this._viewVersion = -1; this._viewStep = -1; // _rulesView's cache
  }

  // ---------------------------------------------------------------- declarations (the scene's game nodes)

  /** A game node entered the tree. @param {'rules' | 'counter' | 'timer' | 'goal' | 'checkpoint'} kind @param {any} node */
  declare(kind, node) {
    const p = node.props;
    const bad = (problems) => { if (problems.length) throw new Error(`${node.type} "${node.id}": ${problems.join('; ')}`); };
    if (kind === 'rules') {
      if (this.decl.rules) throw new Error(`a scene has one GameRules node: "${this.decl.rules.id}" and "${node.id}"`);
      bad([...(p.win !== undefined ? checkCondition(p.win, 'win') : []), ...(p.lose !== undefined ? checkCondition(p.lose, 'lose') : [])]);
      for (const [k, v] of Object.entries(p.flags ?? {})) { if (!FLAG_TYPES.has(typeof v)) bad([`flag "${k}" is not a boolean, a number or a string`]); if (!(k in this.flags)) this.flags[k] = v; }
      this.decl.rules = node;
    } else if (kind === 'checkpoint') {
      if (p.when !== undefined) bad(checkCondition(p.when, 'when'));
      this.decl.checkpoints.push(node);
    } else {
      const map = this.decl[KINDS[kind]], key = node.key;
      if (map.has(key)) throw new Error(`two ${kind}s named "${key}": "${map.get(key).id}" and "${node.id}"`);
      if (kind === 'goal' && p.when !== undefined) bad(checkCondition(p.when, 'when'));
      map.set(key, node);
      // What it starts at, unless the state already has it (a node added while playing keeps the value that is there).
      const state = this[KINDS[kind]];
      if (!(key in state)) state[key] = this._fresh(kind, node);
    }
    this.version++;
  }

  /** A game node left the tree: it declares nothing any more. Its value stays, as data. */
  undeclare(kind, node) {
    if (kind === 'rules') { if (this.decl.rules === node) this.decl.rules = null; }
    else if (kind === 'checkpoint') { const i = this.decl.checkpoints.indexOf(node); if (i >= 0) this.decl.checkpoints.splice(i, 1); }
    else if (this.decl[KINDS[kind]].get(node.key) === node) this.decl[KINDS[kind]].delete(node.key);
    this.version++;
  }

  _fresh(kind, node) {
    const p = node.props;
    if (kind === 'counter') return this._clamp(node, Number(p.start ?? 0));
    if (kind === 'timer') return { steps: Math.max(0, toSteps(p.seconds ?? 0)), elapsed: 0, running: p.autostart !== false, done: false, acc: 0, held: false };
    return { done: false, step: null };
  }

  _clamp(node, v) {
    if (!Number.isFinite(v)) throw new Error(`counter "${node?.key ?? '?'}": ${v} is not a number`);
    const min = node?.props.min, max = node?.props.max;
    if (typeof min === 'number' && v < min) v = min;
    if (typeof max === 'number' && v > max) v = max;
    return v;
  }

  // ---------------------------------------------------------------- the state, changed (inside a step: by actions)

  /** A counter's value (0 when nothing has counted it). */
  get(key) { return this.counters[key] ?? 0; }
  get score() { return this.counters.score ?? 0; }

  /** Set a counter (held within its node's min and max). */
  set(key, value) {
    const node = this.decl.counters.get(key), was = this.counters[key] ?? 0, v = this._clamp(node ?? { key, props: {} }, Number(value));
    if (v === was && key in this.counters) return v;
    this.counters[key] = v;
    this._event({ type: 'counter', key, value: v, by: v - was });
    node?.emit('changed', { value: v, by: v - was });
    return v;
  }
  /** Add to a counter. */
  add(key, by = 1) { return this.set(key, (this.counters[key] ?? 0) + Number(by)); }
  addScore(by = 1) { return this.add('score', by); }

  /** Set a flag (a boolean, a number or a string). */
  setFlag(flag, value = true) {
    if (typeof flag !== 'string' || flag === '') throw new Error('setFlag needs the flag\'s name');
    if (!FLAG_TYPES.has(typeof value)) throw new Error(`flag "${flag}": a flag is a boolean, a number or a string`);
    if (this.flags[flag] === value) return;
    this.flags[flag] = value;
    this._event({ type: 'flag', flag, value });
    this.decl.rules?.emit('flagChanged', { flag, value });
  }
  getFlag(flag) { return this.flags[flag]; }
  clearFlag(flag) {
    if (!(flag in this.flags)) return;
    delete this.flags[flag];
    this._event({ type: 'flag', flag, value: null });
    this.decl.rules?.emit('flagChanged', { flag, value: null });
  }

  _timer(key) { const t = this.timers[key]; if (!t) throw new Error(`no timer "${key}" (${Object.keys(this.timers).join(', ') || 'none'})`); return t; }
  /** Run a timer, on from where it stopped. */
  startTimer(key) { const t = this._timer(key); if ((t.running && !t.held) || t.done) return; t.running = true; t.held = false; this._event({ type: 'timer', key, event: 'started' }); this.decl.timers.get(key)?.emit('started', {}); }
  stopTimer(key) { const t = this._timer(key); if (!t.running || t.held) return; t.running = false; this._event({ type: 'timer', key, event: 'stopped' }); this.decl.timers.get(key)?.emit('stopped', {}); }
  /** Back to its full length; running as its node says (or as it was, without one). */
  resetTimer(key) {
    const t = this._timer(key), node = this.decl.timers.get(key);
    t.elapsed = 0; t.done = false; t.acc = 0; t.held = false;
    if (node) { t.steps = Math.max(0, toSteps(node.props.seconds ?? 0)); t.running = node.props.autostart !== false; }
    this._event({ type: 'timer', key, event: 'reset' });
  }
  /** Lengthen (or, negative, shorten) a countdown. */
  addTime(key, seconds) {
    const t = this._timer(key), by = toSteps(seconds);
    if (!Number.isFinite(by)) throw new Error(`timer "${key}": addTime needs seconds`);
    t.steps = Math.max(0, t.steps + by);
    if (t.done && t.steps > t.elapsed) t.done = false; // time added after zero: it can run again (start it)
    this._event({ type: 'timer', key, event: 'changed' });
  }

  /** A goal done, now. */
  completeGoal(key) {
    const g = this.goals[key];
    if (!g) throw new Error(`no goal "${key}" (${Object.keys(this.goals).join(', ') || 'none'})`);
    if (g.done) return;
    g.done = true; g.step = this.tree.clock.step;
    this._event({ type: 'goal', key, done: true });
    this.decl.goals.get(key)?.emit('completed', {});
  }

  win() { this._decide('won'); }
  lose() { this._decide('lost'); }
  _decide(result) {
    if (this.outcome) return; // decided already: the first result stands
    this.outcome = { result, step: this.tree.clock.step, scene: this.scene };
    this._event({ type: 'outcome', result });
    for (const [key, node] of this.decl.timers) { // the clocks hold
      const t = this.timers[key];
      if (!t?.running || t.held) continue;
      t.held = true; this._event({ type: 'timer', key, event: 'stopped' }); node.emit('stopped', {});
    }
    const rules = this.decl.rules;
    rules?.emit(result, {});
    rules?.emit('ended', { result });
  }

  /**
   * Ask for a scene change. Only recorded here: the step it is asked in finishes whole, play goes on for `after`
   * seconds (rounded to steps), and GameFlow makes the change at that step boundary, in every runtime the same one
   * whatever loading takes. A later request replaces one still pending (Godot's change_scene does the same).
   * @param {{ to: string, after?: number, reset?: boolean }} o reset: a new game there, nothing carried over
   */
  changeScene({ to, after = 0, reset = false } = /** @type {any} */ ({})) {
    if (typeof to !== 'string' || to === '') throw new Error('changeScene needs { to }: the scene\'s path in the project');
    const wait = toSteps(after ?? 0);
    if (!Number.isFinite(wait) || wait < 0) throw new Error(`changeScene: after is ${after}`);
    this.pending = { to, at: this.tree.clock.step + 1 + wait, reset: reset === true };
    this._event({ type: 'pending', to, at: this.pending.at });
  }
  /** Start this scene again as a new game. */
  restart({ after = 0 } = {}) {
    if (!this.scene) throw new Error('restart: this world\'s scene isn\'t named (installGame(tree, { scene }))');
    this.changeScene({ to: this.scene, after, reset: true });
  }

  /**
   * Take a checkpoint (a Checkpoint node's trigger). Recorded here; GameFlow saves the world at the step boundary.
   * @param {any} node the Checkpoint node @returns {boolean} false when it isn't taken: it is `once` and was taken
   *   before, or the game is decided
   */
  takeCheckpoint(node) {
    const once = node.props.once !== false;
    if (this.outcome !== null || (once && this.fired[node.id])) return false;
    if (once) this.fired[node.id] = true;
    const slot = node.props.slot ?? 'checkpoint';
    this.checkpoints[slot] = { id: node.id, label: node.props.label ?? null, requested: this.tree.clock.step, seq: ++this.checkpointSeq };
    this._event({ type: 'checkpoint', id: node.id, slot });
    node.emit('written', { slot });
    return true;
  }

  // ---------------------------------------------------------------- the step

  afterNodes() {
    const d = this.decl;
    // 1. timers
    const timedOut = [];
    for (const [key, node] of d.timers) {
      const t = this.timers[key];
      if (!t || !t.running || t.held || t.done) continue;
      t.acc += this.tree.scaleOf(node);
      while (t.acc >= 1) {
        t.acc -= 1; t.elapsed++; this.version++;
        if (t.steps > 0 && t.elapsed >= t.steps) { t.done = true; t.running = false; t.acc = 0; timedOut.push([key, node]); break; }
      }
    }
    // 2. goals
    for (const [key, node] of d.goals) {
      if (this.outcome !== null) break;
      if (!this.goals[key] || this.goals[key].done || node.props.when === undefined) continue;
      if (holds(node.props.when, this._rulesView())) this.completeGoal(key);
    }
    // 3. checkpoints: taken when their condition becomes true
    for (const node of d.checkpoints) {
      if (this.outcome !== null) break;
      if (node.props.when === undefined) continue;
      const now = holds(node.props.when, this._rulesView()), was = this.fired[node.id] === true;
      if (now && !was) this.takeCheckpoint(node);
      if (node.props.once === false) this.fired[node.id] = now;
    }
    // 4. win (a goal's or a checkpoint's connections may have decided the game already)
    if (this.outcome === null && d.rules) {
      const p = d.rules.props;
      let won;
      if (p.win !== undefined) won = holds(p.win, this._rulesView());
      else { const needed = [...d.goals].filter(([, n]) => n.props.optional !== true); won = needed.length > 0 && needed.every(([k]) => this.goals[k]?.done === true); }
      if (won) this.win();
    }
    // 5. timeouts: a signal says what happened, so it fires even when the same step was won
    for (const [key, node] of timedOut) { this._event({ type: 'timer', key, event: 'timeout' }); node.emit('timeout', {}); }
    // 6. lose
    if (this.outcome === null && d.rules?.props.lose !== undefined && holds(d.rules.props.lose, this._rulesView())) this.lose();
  }

  // ---------------------------------------------------------------- what a HUD, a condition and a tool read

  /**
   * The game state as plain data: what conditions test, what a HUD shows, what MCP reads. A fresh object on every call
   * (structuredClone, JSON and postMessage carry it); changing it changes nothing.
   */
  view() {
    const step = this.tree.clock.step;
    const timers = {};
    for (const key of Object.keys(this.timers).sort()) {
      const t = this.timers[key], node = this.decl.timers.get(key), leftSteps = t.steps > 0 ? Math.max(0, t.steps - t.elapsed) : null;
      timers[key] = {
        seconds: t.steps / HZ, elapsed: t.elapsed / HZ, left: leftSteps === null ? null : leftSteps / HZ,
        steps: t.steps, elapsedSteps: t.elapsed, leftSteps,
        running: t.running && !t.held && node !== undefined, done: t.done, declared: node !== undefined, label: node?.props.label ?? null,
      };
    }
    const goals = {};
    for (const key of Object.keys(this.goals).sort()) goals[key] = { done: this.goals[key].done, step: this.goals[key].step };
    const objectives = [...this.decl.goals].map(([key, node]) => ({ key, text: node.props.text ?? key, done: this.goals[key]?.done === true, optional: node.props.optional === true }));
    const slots = Object.keys(this.checkpoints).sort(), latest = slots.reduce((a, k) => (a === null || this.checkpoints[k].seq > this.checkpoints[a].seq ? k : a), /** @type {string | null} */ (null));
    const next = objectives.find((o) => !o.done && !o.optional) ?? objectives.find((o) => !o.done) ?? null;
    return {
      scene: this.scene, step, sceneSteps: step - this.enteredAt, arrivals: this.arrivals,
      score: this.counters.score ?? 0,
      counters: sortKeys(this.counters),
      labels: Object.fromEntries([...this.decl.counters].filter(([, n]) => n.props.label !== undefined).map(([k, n]) => [k, n.props.label])),
      flags: sortKeys(this.flags),
      timers, goals, objectives,
      goal: next ? { key: next.key, text: next.text } : null,
      outcome: this.outcome ? this.outcome.result : null,
      decided: this.outcome ? { ...this.outcome } : null,
      pending: this.pending ? { to: this.pending.to, at: this.pending.at, reset: this.pending.reset } : null,
      checkpoint: latest === null ? null : { slot: latest, id: this.checkpoints[latest].id, requested: this.checkpoints[latest].requested },
      checkpoints: Object.fromEntries(slots.map((k) => [k, { id: this.checkpoints[k].id, requested: this.checkpoints[k].requested }])),
    };
  }

  // The view the step's conditions read: built again only when something changed since the last one (a goal done, a
  // counter a connection added to), so a scene with many conditions doesn't build one for each.
  _rulesView() {
    const step = this.tree.clock.step;
    if (this._viewVersion !== this.version || this._viewStep !== step) { this._view = this.view(); this._viewVersion = this.version; this._viewStep = step; }
    return this._view;
  }

  /**
   * Listen to changes: fn({ type, …, step }). Events are queued during the step and delivered at presentation (or by
   * flush()), never inside the step, so a listener can't change what the step computes. → a function that stops it
   */
  on(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  /** Deliver the queued events to the listeners. → the events */
  flush() {
    if (!this._events.length) return [];
    const events = this._events; this._events = [];
    for (const e of events) for (const fn of [...this._listeners]) fn(e);
    return events;
  }

  /** Presentation: the tree calls this once per display frame, after the nodes. */
  present() { this.flush(); }

  _event(e) {
    this.version++;
    this._events.push({ ...e, step: this.tree.clock.step });
    if (this._events.length > MAX_EVENTS) this._events.splice(0, this._events.length - MAX_EVENTS); // nobody is listening: keep the latest
  }

  // ---------------------------------------------------------------- scene changes and the snapshot

  /**
   * A scene change: give the next world's game service this one's state (GameFlow does it, after the next world is
   * built and before its first step). What the next scene declares with scope "scene" starts fresh there; the rest is
   * carried, whether the next scene declares it or not (an ending scene reads the level's clock). `reset` carries
   * nothing but the session: a new game.
   * @param {GameService} next @param {{ reset?: boolean }} [o]
   */
  carryTo(next, { reset = false } = {}) {
    next.seed = this.seed;
    next.arrivals = this.arrivals + 1;
    next.enteredAt = next.tree.clock.step;
    next.pending = null;
    next.checkpointSeq = this.checkpointSeq; // counts on through a reset: a new game's first checkpoint is a new one
    if (!reset) {
      for (const kind of /** @type {const} */ (['counter', 'timer', 'goal'])) {
        const name = KINDS[kind];
        for (const [key, value] of Object.entries(this[name])) {
          const scope = next.decl[name].get(key)?.props.scope ?? (next.decl[name].has(key) ? DEFAULT_SCOPE[kind] : 'game');
          if (scope !== 'scene') next[name][key] = structuredClone(value);
        }
      }
      next.flags = { ...next.flags, ...this.flags };
      next.outcome = next.decl.rules && next.decl.rules.props.keepOutcome !== true ? null : structuredClone(this.outcome);
      if (next.outcome === null) for (const t of Object.values(next.timers)) t.held = false; // undecided again: the game's clock runs on
      next.checkpoints = structuredClone(this.checkpoints);
    }
    next.version++;
  }

  getState() {
    return {
      scene: this.scene, seed: this.seed, arrivals: this.arrivals, enteredAt: this.enteredAt,
      counters: sortKeys(this.counters), flags: sortKeys(this.flags), timers: sortKeys(this.timers), goals: sortKeys(this.goals),
      outcome: this.outcome, pending: this.pending, checkpoints: sortKeys(this.checkpoints), checkpointSeq: this.checkpointSeq, fired: sortKeys(this.fired),
    };
  }

  setState(s) {
    const c = structuredClone(s);
    this.scene = c.scene; this.seed = c.seed; this.arrivals = c.arrivals; this.enteredAt = c.enteredAt;
    this.counters = c.counters; this.flags = c.flags; this.timers = c.timers; this.goals = c.goals;
    this.outcome = c.outcome; this.pending = c.pending; this.checkpoints = c.checkpoints; this.checkpointSeq = c.checkpointSeq; this.fired = c.fired;
    this._event({ type: 'restored' });
  }
}
