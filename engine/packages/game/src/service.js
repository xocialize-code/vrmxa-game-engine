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
//   3. checkpoints whose condition became true are asked for;
//   4. the `timeout` signals of the timers that reached zero in 1;
//   5. the result, once: won if anything asked for a win this step (the `win` action, from any connection) or the
//      rules' `win` condition holds (without one: every goal that isn't optional done); otherwise lost if anything
//      asked for a loss or the rules' `lose` condition holds;
//   6. the checkpoints asked for this step are taken, unless 5 just decided the game.
// win() and lose() only ask: the game is decided in one place, 5, whatever the source and wherever in the step it
// fired, so a win and a loss on the same step is a win, always. What is asked after 5 has run (by a service installed
// after this one, or between steps) is decided by the next step's 5, or, when the scene changes first, as the world is
// left (decideAsked): either way with the step it was asked on, never lost. A checkpoint is asked for in the same way and taken
// in 6, so none is ever taken on or after the step the game is decided (it would save a lost game over a good one),
// and none while the world can't be saved (a closet redraw in flight: it waits, asked for, until a step that can).
// Deciding the game holds the timers that were running (the HUD keeps the final time); while it is decided 2, 3, 5
// and 6 do nothing and the first result stands. A timer started afterwards runs (an ending's own clock). A new game
// (changeScene with reset, or restart) or a scene whose rules don't keep the outcome starts undecided, and there a
// held timer that was carried over (the whole game's clock) runs on.
//
// A scene change and a checkpoint are only recorded here, during the step. GameFlow (flow.js) acts on them at the step
// boundary; whether it has is not simulation state, so the hashes are the same whoever drives the world.
import { HZ } from '@vrmxg/core';
import { holds, checkCondition, checkKeys, checkCall, readReads, READS } from './conditions.js';

const toSteps = (seconds) => Math.round(Number(seconds) * HZ);
const sortKeys = (o) => { const out = {}; for (const k of Object.keys(o).sort()) out[k] = o[k]; return out; };
// The state's maps are plain objects (a snapshot is plain data), read by own property only: a counter may be named
// "constructor" or "toString" like any other. "__proto__" is the one name refused: assigning it sets no property.
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);
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
    /** @type {Record<string, { steps: number | null, elapsed: number, running: boolean, done: boolean, acc: number, held: boolean }>} steps: the countdown's length, or null for a stopwatch (no limit: it never times out); held: stopped by the game's result */
    this.timers = {};
    /** @type {Record<string, { done: boolean, step: number | null }>} */ this.goals = {};
    /** @type {null | { result: 'won' | 'lost', step: number, scene: string | null }} */ this.outcome = null;
    /** @type {null | { to: string, at: number, reset: boolean }} the scene change asked for: done at the boundary where the clock is `at` */
    this.pending = null;
    /** @type {Record<string, { id: string, label: string | null, requested: number, seq: number, was?: any }>} the last checkpoint taken into each slot (and, as `was`, the one it replaced); seq counts every one */
    this.checkpoints = {};
    /** How many checkpoints have been taken. */ this.checkpointSeq = 0;
    /** @type {Record<string, boolean>} checkpoint nodes of this scene: what their condition last was (true for good once taken, with `once`) */
    this.fired = {};
    /**
     * What has been asked for and is decided at the end of the step's rules: a win and a loss (the step each was
     * asked on, or null), and checkpoints.
     * @type {{ win: number | null, lose: number | null, checkpoints: Array<{ id: string, slot: string, label: string | null, once: boolean }> }}
     */
    this.requests = { win: null, lose: null, checkpoints: [] };

    // The scene's declarations: live nodes, in tree order. Not state: a world built from the same scene has the same.
    this.decl = { /** @type {any} */ rules: null, counters: new Map(), timers: new Map(), goals: new Map(), /** @type {any[]} */ checkpoints: [] };
    /** What this scene's GameRules says its conditions read that another scene owns (`reads`), by kind: names. */
    this.reads = readReads(null).reads;
    /** @type {Record<string, number>} What a read counter is seen as while the game has none (reads.counters as a map; else 0). */
    this.readDefaults = {};
    /**
     * The values this scene reads from elsewhere as the game brought them when it got here, by kind: what a restart
     * of the scene gives them back as. State (a restart after a load needs it); absent from it while empty.
     * @type {Record<string, Record<string, any>>}
     */
    this.arrived = {};
    this._unchecked = false; // declarations changed since checkRules last looked
    /** @type {Array<{ kind: string, node: any, made: Array<[string, string]> }>} what was declared since then, and the state it made */
    this._batch = [];
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
    const name = (what, k) => { if (k === '__proto__') bad([`${what} can't be named "__proto__"`]); return k; };
    /** @type {Array<[string, string]>} */ const made = []; // the state this declaration makes: [map, key]
    if (kind === 'rules') {
      if (this.decl.rules) throw new Error(`a scene has one GameRules node: "${this.decl.rules.id}" and "${node.id}"`);
      const reads = readReads(p.reads);
      bad([...(p.win !== undefined ? checkCondition(p.win, 'win') : []), ...(p.lose !== undefined ? checkCondition(p.lose, 'lose') : []), ...reads.problems]);
      for (const [k, v] of Object.entries(p.flags ?? {})) { if (!FLAG_TYPES.has(typeof v)) bad([`flag "${k}" is not a boolean, a number or a string`]); name('a flag', k); }
      for (const [k, v] of Object.entries(p.flags ?? {})) if (!Object.hasOwn(this.flags, k)) { this.flags[k] = v; made.push(['flags', k]); }
      // What the scene reads from another is NOT made state by being read: only its owner's scene gives it a value
      // (its start, when that scene first arrives). While it is absent a condition and a HUD see its default (view()).
      this.decl.rules = node; this.reads = reads.reads; this.readDefaults = reads.defaults;
    } else if (kind === 'checkpoint') {
      if (p.when !== undefined) bad(checkCondition(p.when, 'when'));
      name('a checkpoint', node.id); name('a checkpoint\'s slot', p.slot ?? 'checkpoint');
      this.decl.checkpoints.push(node);
    } else {
      const map = this.decl[KINDS[kind]], key = name(`a ${kind}`, node.key);
      if (map.has(key)) throw new Error(`two ${kind}s named "${key}": "${map.get(key).id}" and "${node.id}"`);
      if (kind === 'goal' && p.when !== undefined) bad(checkCondition(p.when, 'when'));
      if (kind === 'timer' && p.seconds !== undefined && !(typeof p.seconds === 'number' && p.seconds > 0)) bad([`seconds is ${JSON.stringify(p.seconds)}: a countdown needs seconds above zero (leave seconds out for a stopwatch)`]);
      const state = this[KINDS[kind]], fresh = Object.hasOwn(state, key) ? undefined : this._fresh(kind, node);
      map.set(key, node);
      // What it starts at, unless the state already has it (a node added while playing keeps the value that is there).
      if (fresh !== undefined) { state[key] = fresh; made.push([KINDS[kind], key]); }
    }
    this._batch.push({ kind, node, made });
    this._unchecked = true;
    this.version++;
  }

  /** A game node left the tree: it declares nothing any more. Its value stays, as data. */
  undeclare(kind, node) {
    if (kind === 'rules') { if (this.decl.rules === node) { this.decl.rules = null; this.reads = readReads(null).reads; this.readDefaults = {}; } }
    else if (kind === 'checkpoint') { const i = this.decl.checkpoints.indexOf(node); if (i >= 0) this.decl.checkpoints.splice(i, 1); }
    else if (this.decl[KINDS[kind]].get(node.key) === node) this.decl[KINDS[kind]].delete(node.key);
    this.version++;
  }

  // The scene's own connections into its game nodes (data, from the scene: code listeners aren't these).
  _connections() {
    const out = [];
    for (const [from, signals] of this.tree.links) for (const [signal, list] of signals) for (const l of list) {
      const to = l.to === undefined ? null : this.tree.byId.get(l.to);
      if (to && typeof to.kind === 'string' && to.game === this) out.push({ from: from.id, signal, to, call: l.call, args: l.args });
    }
    return out;
  }

  /**
   * What this scene's conditions may read, by the names the game state has (conditions.js checkKeys): what it declares
   * with its nodes, the flags its GameRules starts or its connections set, and what its GameRules' `reads` lists as
   * another scene's (a read timer is neither countdown nor stopwatch here: that depends on the scene it comes from).
   */
  declared() {
    const r = this.reads, sets = this._connections().filter((c) => c.to.kind === 'rules' && c.call === 'setFlag' && typeof c.args?.flag === 'string').map((c) => c.args.flag);
    const timers = new Map(r.timers.map((k) => [k, /** @type {boolean | null} */ (null)]));
    for (const [k, n] of this.decl.timers) timers.set(k, n.props.seconds !== undefined);
    return {
      counters: new Set([...this.decl.counters.keys(), ...r.counters]),
      flags: new Set([...Object.keys(this.decl.rules?.props.flags ?? {}), ...sets, ...r.flags]),
      timers,
      goals: new Set([...this.decl.goals.keys(), ...r.goals]),
      slots: new Set([...this.decl.checkpoints.map((n) => n.props.slot ?? 'checkpoint'), ...r.checkpoints]),
    };
  }

  /** What is wrong with the scene's rules as a whole: its conditions' keys, and its connections' calls of game nodes. */
  rulesProblems() {
    const d = this.decl, declared = this.declared(), problems = [];
    // a name is this scene's own or another's, not both: which value would it start with?
    const mine = { counters: d.counters, timers: d.timers, goals: d.goals, flags: new Map(Object.keys(d.rules?.props.flags ?? {}).map((k) => [k, true])), checkpoints: new Map(d.checkpoints.map((n) => [n.props.slot ?? 'checkpoint', n])) };
    for (const kind of Object.keys(READS)) for (const k of this.reads[kind]) if (mine[kind].has(k)) problems.push(`GameRules "${d.rules?.id}": reads.${kind} lists "${k}", which this scene declares itself: take it out of reads`);
    const check = (node, prop) => { for (const m of checkKeys(node.props[prop], declared, prop)) problems.push(`${node.type} "${node.id}": ${m}`); };
    if (d.rules) { check(d.rules, 'win'); check(d.rules, 'lose'); }
    for (const node of d.goals.values()) check(node, 'when');
    for (const node of d.checkpoints) check(node, 'when');
    for (const c of this._connections()) {
      const m = checkCall(c.to.kind, { stopwatch: c.to.kind === 'timer' && c.to.props.seconds === undefined }, c.call, c.args);
      if (m) problems.push(`the connection ${c.from}.${c.signal} → ${c.to.id}.${c.call}: ${m}`);
    }
    return problems;
  }

  /**
   * Check the scene's rules once all its game nodes are in (a game node's ready() calls it; it looks again only after
   * a declaration changed): every condition against what the scene declares or says it reads, every connection's
   * call of a game node against what that node can do. A scene with a rule that can't work doesn't start, and the
   * error names the node and the key; left to run, such a rule would never hold, or hold from the first step. What
   * the failed batch declared is taken back out, nodes and state: a refused tree.add leaves nothing behind.
   */
  checkRules() {
    if (!this._unchecked) return;
    this._unchecked = false;
    const batch = this._batch; this._batch = [];
    const problems = this.rulesProblems();
    if (!problems.length) return;
    for (const b of batch) { this.undeclare(b.kind, b.node); for (const [map, key] of b.made) delete this[map][key]; }
    for (const b of batch) if (this.tree.byId.get(b.node.id) === b.node) this.tree.remove(b.node.id);
    this._unchecked = false;
    throw new Error(problems.join('; '));
  }

  _fresh(kind, node) {
    const p = node.props;
    if (kind === 'counter') return this._clamp(node, Number(p.start ?? 0));
    // a countdown has seconds, above zero (however few: at least one step); without them it is a stopwatch
    if (kind === 'timer') return { steps: p.seconds === undefined ? null : Math.max(1, toSteps(p.seconds)), elapsed: 0, running: p.autostart !== false, done: false, acc: 0, held: false };
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

  /**
   * A counter's value: 0 when nothing has counted it, or, for a counter this scene reads from another (GameRules'
   * `reads.counters`) that the game doesn't have yet, the read's default, as the view shows it. So code that adds to a
   * read counter starts from what the scene shows (`lives: 3` then `add('lives', -1)` gives 2, not -1); the write then
   * makes it state, carried on like any value the game has (AB-T-0629).
   */
  get(key) { return own(this.counters, key) ?? (this.reads.counters.includes(key) ? own(this.readDefaults, key) ?? 0 : 0); }
  get score() { return own(this.counters, 'score') ?? 0; }

  /** Set a counter (held within its node's min and max). */
  set(key, value) {
    if (typeof key !== 'string' || key === '' || key === '__proto__') throw new Error(`a counter can't be named ${JSON.stringify(key)}`);
    const node = this.decl.counters.get(key), was = this.get(key), v = this._clamp(node ?? { key, props: {} }, Number(value));
    if (v === was && Object.hasOwn(this.counters, key)) return v;
    this.counters[key] = v;
    this._event({ type: 'counter', key, value: v, by: v - was });
    node?.emit('changed', { value: v, by: v - was });
    return v;
  }
  /** Add to a counter. */
  add(key, by = 1) { return this.set(key, this.get(key) + Number(by)); }
  addScore(by = 1) { return this.add('score', by); }

  /** Set a flag (a boolean, a number or a string). */
  setFlag(flag, value = true) {
    if (typeof flag !== 'string' || flag === '' || flag === '__proto__') throw new Error(`a flag can't be named ${JSON.stringify(flag)}`);
    if (!FLAG_TYPES.has(typeof value)) throw new Error(`flag "${flag}": a flag is a boolean, a number or a string`);
    if (own(this.flags, flag) === value) return;
    this.flags[flag] = value;
    this._event({ type: 'flag', flag, value });
    this.decl.rules?.emit('flagChanged', { flag, value });
  }
  getFlag(flag) { return own(this.flags, flag); }
  clearFlag(flag) {
    if (!Object.hasOwn(this.flags, flag)) return;
    delete this.flags[flag];
    this._event({ type: 'flag', flag, value: null });
    this.decl.rules?.emit('flagChanged', { flag, value: null });
  }

  _timer(key) { const t = own(this.timers, key); if (!t) throw new Error(`no timer "${key}" (${Object.keys(this.timers).join(', ') || 'none'})`); return t; }
  /** Run a timer, on from where it stopped. */
  startTimer(key) { const t = this._timer(key); if ((t.running && !t.held) || t.done) return; t.running = true; t.held = false; this._event({ type: 'timer', key, event: 'started' }); this.decl.timers.get(key)?.emit('started', {}); }
  stopTimer(key) { const t = this._timer(key); if (!t.running || t.held) return; t.running = false; this._event({ type: 'timer', key, event: 'stopped' }); this.decl.timers.get(key)?.emit('stopped', {}); }
  /** Back to its full length; running as its node says (or as it was, without one). */
  resetTimer(key) {
    const t = this._timer(key), node = this.decl.timers.get(key);
    t.elapsed = 0; t.done = false; t.acc = 0; t.held = false;
    if (node) { t.steps = this._fresh('timer', node).steps; t.running = node.props.autostart !== false; }
    this._event({ type: 'timer', key, event: 'reset' });
  }
  /**
   * Lengthen (or, negative, shorten) a countdown. Shortened to nothing it stays a countdown, with no time left: it
   * times out on its next tick. A stopwatch has no length to change, and saying so is better than making one up.
   */
  addTime(key, seconds) {
    const t = this._timer(key), by = toSteps(seconds);
    if (!Number.isFinite(by)) throw new Error(`timer "${key}": addTime needs seconds`);
    if (t.steps === null) throw new Error(`timer "${key}" is a stopwatch (no seconds): it has no time to add to`);
    t.steps = Math.max(0, t.steps + by);
    if (t.done && t.steps > t.elapsed) t.done = false; // time added after zero: it can run again (start it)
    this._event({ type: 'timer', key, event: 'changed' });
  }

  /** A goal done, now. */
  completeGoal(key) {
    const g = own(this.goals, key);
    if (!g) throw new Error(`no goal "${key}" (${Object.keys(this.goals).join(', ') || 'none'})`);
    if (g.done) return;
    g.done = true; g.step = this.tree.clock.step;
    this._event({ type: 'goal', key, done: true });
    this.decl.goals.get(key)?.emit('completed', {});
  }

  /** Ask for a win: the step's rules decide the game once, at their end (a win and a loss asked for on one step is a win). */
  win() { if (this.outcome === null && this.requests.win === null) this.requests.win = this.tree.clock.step; }
  /** Ask for a loss (see win). */
  lose() { if (this.outcome === null && this.requests.lose === null) this.requests.lose = this.tree.clock.step; }
  _decide(result, step = this.tree.clock.step) {
    this.outcome = { result, step, scene: this.scene };
    // A result asked for late is of an earlier step: a checkpoint taken on that step or since was of a game already
    // lost or won (GameFlow didn't write it: checkpointSkipped). It is taken back, so the state says what the files do.
    for (const [slot, c] of Object.entries(this.checkpoints)) if (c.requested >= step) { if (c.was) this.checkpoints[slot] = c.was; else delete this.checkpoints[slot]; }
    this._event({ type: 'outcome', result, step }); // the step it is the result of (asked late, the step before this one)
    for (const [key, node] of this.decl.timers) { // the clocks hold
      const t = own(this.timers, key);
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
   * Ask for a checkpoint (a Checkpoint node's trigger). It is taken at the end of the step's rules (6 above), and
   * GameFlow saves the world at the step boundary after that.
   * @param {any} node the Checkpoint node @returns {boolean} false when it won't be: it is `once` and was taken
   *   before, or the game is decided
   */
  takeCheckpoint(node) {
    const once = node.props.once !== false;
    if (this.outcome !== null || (once && own(this.fired, node.id) === true)) return false;
    if (!this.requests.checkpoints.some((r) => r.id === node.id)) this.requests.checkpoints.push({ id: node.id, slot: node.props.slot ?? 'checkpoint', label: node.props.label ?? null, once });
    return true;
  }

  /**
   * A scene change is about to leave this world (GameFlow): what was asked for and not yet done doesn't go with it. A
   * checkpoint still waiting for a step that can save is not taken, and says so.
   */
  dropRequests(reason = 'scene') {
    const waiting = this.requests.checkpoints;
    this.requests = { win: null, lose: null, checkpoints: [] };
    for (const r of waiting) this._event({ type: 'checkpointSkipped', id: r.id, slot: r.slot, reason });
  }

  /**
   * Decide a win or a loss that was asked for after the step's rules ran (by a service installed after this one, or
   * between steps) and is still waiting: GameFlow calls it as it leaves this world for the next scene, so the result
   * is the one the same calls would give from anywhere else in the step (a win beats a loss; the step is the one it
   * was asked on) and goes with the game. Without a scene change the next step's rules decide it.
   */
  decideAsked() {
    const req = this.requests;
    if (this.outcome === null) { if (req.win !== null) this._decide('won', req.win); else if (req.lose !== null) this._decide('lost', req.lose); }
    req.win = null; req.lose = null;
  }

  /** A game node's action that can't be done (a connection's mistake): said as an event, never thrown inside the step. */
  refuse(node, action, reason) { this._event({ type: 'refused', id: node.id, action, reason }); }

  // ---------------------------------------------------------------- the step

  afterNodes() {
    const d = this.decl, req = this.requests;
    // 1. timers
    const timedOut = [];
    for (const [key, node] of d.timers) {
      const t = own(this.timers, key);
      if (!t || !t.running || t.held || t.done) continue;
      t.acc += this.tree.scaleOf(node);
      while (t.acc >= 1) {
        t.acc -= 1; t.elapsed++; this.version++;
        if (t.steps !== null && t.elapsed >= t.steps) { t.done = true; t.running = false; t.acc = 0; timedOut.push([key, node]); break; }
      }
    }
    if (this.outcome === null) {
      // 2. goals
      for (const [key, node] of d.goals) {
        const g = own(this.goals, key);
        if (!g || g.done || node.props.when === undefined) continue;
        if (holds(node.props.when, this._rulesView())) this.completeGoal(key);
      }
      // 3. checkpoints: asked for when their condition becomes true
      for (const node of d.checkpoints) {
        if (node.props.when === undefined) continue;
        const now = holds(node.props.when, this._rulesView()), was = own(this.fired, node.id) === true;
        if (now && !was) this.takeCheckpoint(node);
        if (node.props.once === false) this.fired[node.id] = now;
      }
    }
    // 4. timeouts: a signal says what happened, so it fires whatever the result
    for (const [key, node] of timedOut) { this._event({ type: 'timer', key, event: 'timeout' }); node.emit('timeout', {}); }
    // 5. the result, once: everything that asked for one this step has, wherever in the step it fired
    if (this.outcome === null) {
      let won = req.win !== null;
      if (!won && d.rules) {
        const p = d.rules.props;
        if (p.win !== undefined) won = holds(p.win, this._rulesView());
        else { const needed = [...d.goals].filter(([, n]) => n.props.optional !== true); won = needed.length > 0 && needed.every(([k]) => own(this.goals, k)?.done === true); }
      }
      const lost = !won && (req.lose !== null || (d.rules?.props.lose !== undefined && holds(d.rules.props.lose, this._rulesView())));
      // a result that was asked for is of the step it was asked on (an earlier one, when it was asked after that step's rules)
      const at = won ? req.win : lost ? req.lose : null;
      req.win = null; req.lose = null;
      if (won) this._decide('won', at ?? undefined); else if (lost) this._decide('lost', at ?? undefined);
    } else { req.win = null; req.lose = null; }
    // 6. the checkpoints asked for
    this._takeCheckpoints();
  }

  _takeCheckpoints() {
    const asked = this.requests.checkpoints;
    if (!asked.length) return;
    if (this.outcome !== null) { // decided on this step (or since they were asked for): a decided game is never saved
      this.requests.checkpoints = [];
      for (const r of asked) this._event({ type: 'checkpointSkipped', id: r.id, slot: r.slot, reason: 'decided' });
      return;
    }
    // A world that can't be saved now (a closet redraw in flight: its jobs are simulation state, so this is the same
    // in every run) keeps them asked for; they are taken on the first step that can.
    if (this.tree.services.get('save')?.cannotSave?.()) return;
    this.requests.checkpoints = [];
    for (const r of asked) {
      if (r.once) this.fired[r.id] = true;
      const was = own(this.checkpoints, r.slot); // the slot's last one, kept in case this one has to be taken back
      this.checkpoints[r.slot] = { id: r.id, label: r.label, requested: this.tree.clock.step, seq: ++this.checkpointSeq, ...(was ? { was: { id: was.id, label: was.label, requested: was.requested, seq: was.seq } } : {}) };
      this._event({ type: 'checkpoint', id: r.id, slot: r.slot });
      const node = this.tree.find(r.id);
      if (node && this.decl.checkpoints.includes(node)) node.emit('written', { slot: r.slot });
    }
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
      const t = this.timers[key], node = this.decl.timers.get(key), limit = t.steps !== null, leftSteps = limit ? Math.max(0, t.steps - t.elapsed) : null;
      timers[key] = {
        seconds: limit ? t.steps / HZ : null, elapsed: t.elapsed / HZ, left: limit ? leftSteps / HZ : null,
        steps: t.steps, elapsedSteps: t.elapsed, leftSteps, limit,
        running: t.running && !t.held && node !== undefined, done: t.done, declared: node !== undefined, label: node?.props.label ?? null,
      };
    }
    // What the scene reads from another and the game doesn't have (yet) is seen as its default: a flag false, a goal
    // not done, a counter 0 or the default its `reads` gives. Seen, not stored: the state has it only once its owner does.
    const absent = (map, kind) => this.reads[kind].filter((k) => !Object.hasOwn(map, k));
    const counters = { ...this.counters }, flags = { ...this.flags }, seenGoals = { ...this.goals };
    for (const k of absent(counters, 'counters')) counters[k] = own(this.readDefaults, k) ?? 0;
    for (const k of absent(flags, 'flags')) flags[k] = false;
    for (const k of absent(seenGoals, 'goals')) seenGoals[k] = { done: false, step: null };
    const goals = {};
    for (const key of Object.keys(seenGoals).sort()) goals[key] = { done: seenGoals[key].done, step: seenGoals[key].step };
    const objectives = [...this.decl.goals].map(([key, node]) => ({ key, text: node.props.text ?? key, done: own(this.goals, key)?.done === true, optional: node.props.optional === true }));
    const slots = Object.keys(this.checkpoints).sort(), latest = slots.reduce((a, k) => (a === null || this.checkpoints[k].seq > this.checkpoints[a].seq ? k : a), /** @type {string | null} */ (null));
    const next = objectives.find((o) => !o.done && !o.optional) ?? objectives.find((o) => !o.done) ?? null;
    return {
      scene: this.scene, step, sceneSteps: step - this.enteredAt, arrivals: this.arrivals,
      score: own(counters, 'score') ?? 0,
      counters: sortKeys(counters),
      labels: Object.fromEntries([...this.decl.counters].filter(([, n]) => n.props.label !== undefined).map(([k, n]) => [k, n.props.label])),
      flags: sortKeys(flags),
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
    this._events.push({ step: this.tree.clock.step, ...e });
    if (this._events.length > MAX_EVENTS) this._events.splice(0, this._events.length - MAX_EVENTS); // nobody is listening: keep the latest
  }

  // ---------------------------------------------------------------- scene changes and the snapshot

  /**
   * A scene change: give the next world's game service this one's state (GameFlow does it, after the next world is
   * built and before its first step). What the next scene declares with scope "scene" starts fresh there; the rest is
   * carried, whether the next scene declares it or not (an ending's HUD shows the level's clock). `reset` carries
   * nothing but the session: a new game (and, into the same scene, what that scene reads from elsewhere as it
   * arrived: a restart). What was asked for and not decided (requests) stays behind: dropRequests.
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
      // what the next scene reads from elsewhere, as the game brought it: what its restart gives back
      const arrived = {};
      for (const kind of Object.keys(READS)) for (const k of [...next.reads[kind]].sort()) if (Object.hasOwn(next[READS[kind]], k)) (arrived[kind] ??= {})[k] = structuredClone(next[READS[kind]][k]);
      next.arrived = arrived;
    } else if (next.scene === this.scene) {
      // A restart: a new game in this scene. Everything of the scene's own starts again; what it reads from elsewhere
      // is none of its own to reset, and comes back as it was when the game arrived here (three lives, not none).
      for (const [kind, values] of Object.entries(this.arrived)) for (const [k, v] of Object.entries(values)) if (next.reads[kind].includes(k)) next[READS[kind]][k] = structuredClone(v);
      next.arrived = structuredClone(this.arrived);
    }
    next.version++;
  }

  getState() {
    return {
      scene: this.scene, seed: this.seed, arrivals: this.arrivals, enteredAt: this.enteredAt,
      counters: sortKeys(this.counters), flags: sortKeys(this.flags), timers: sortKeys(this.timers), goals: sortKeys(this.goals),
      outcome: this.outcome, pending: this.pending, checkpoints: sortKeys(this.checkpoints), checkpointSeq: this.checkpointSeq, fired: sortKeys(this.fired),
      requests: this.requests,
      ...(Object.keys(this.arrived).length ? { arrived: this.arrived } : {}), // absent while empty, as `hidden` is in core's node record
    };
  }

  setState(s) {
    const c = structuredClone(s);
    this.scene = c.scene; this.seed = c.seed; this.arrivals = c.arrivals; this.enteredAt = c.enteredAt;
    this.counters = c.counters; this.flags = c.flags; this.timers = c.timers; this.goals = c.goals;
    this.outcome = c.outcome; this.pending = c.pending; this.checkpoints = c.checkpoints; this.checkpointSeq = c.checkpointSeq; this.fired = c.fired;
    this.requests = c.requests; this.arrived = c.arrived ?? {};
    this._event({ type: 'restored' });
  }
}
