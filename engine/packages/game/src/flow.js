// GameFlow (M5 W2, AB-D-0283): the session. It owns the world being played and is what an app steps in place of a
// tree, because a game is more than one scene and each scene is a world of its own.
//
// A scene change builds a FRESH world for the next scene, the way a load builds one, and carries the session into it:
// the game state (GameService.carryTo), the services named in `always` (input: the latched frame, a recording, a
// replay) and in `carry` (save's flags, the inventory), and the clock. Emptying one tree and filling it again was the
// other way, and was rejected: such a tree differs from a fresh one in ways a snapshot can't be restored onto (timer
// ids, Rapier's handles, every service's own caches). Built fresh, "the world after a change" and "the world a save
// loads into" are the same thing, so a save taken in the second scene loads like any other.
//
// When. changeScene() during step N only records the request in the game state; step N finishes whole. The change is
// made here, at the step boundary where the clock reaches the request's `at` (N + 1, or later with `after`), before
// any work of the next step. Building a world is asynchronous in a browser (WASM, models): the build starts as soon
// as the request is seen, and if it isn't done at `at`, step() returns false and nothing steps, as with a service
// that holds a step in core. So the next scene's first step is `at` + 1 in every runtime, whatever loading takes.
//
// One timeline. The next world starts at the step the last one ended on, so one input recording, one run of per-step
// hashes and every save's step count along the same clock. Its random streams start from a seed derived from the
// session's seed and the number of changes so far: a scene entered twice differs, a replay doesn't.
//
// Checkpoints. A Checkpoint node's trigger is recorded in the game state during the step; the save is taken here at
// the boundary (@vrmxg/save, as any save) and written to the store outside the simulation, under CHECKPOINT_PREFIX
// and the node's slot, so a checkpoint never lands on a save the player made.
import { worldHashes } from '@vrmxg/snapshot';
import { checkGame } from './describe.js';

/** Checkpoint slots in the save store: this and the Checkpoint node's `slot` ("auto-checkpoint"). A player's own saves use other names. */
export const CHECKPOINT_PREFIX = 'auto-';

/** A world's seed: the session's own for the first scene, then mixed with the number of scene changes (integer maths). */
export function worldSeed(seed, arrivals) {
  if (arrivals === 0) return seed >>> 0;
  let h = (seed ^ Math.imul(arrivals, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

/**
 * @typedef {{ scene: string, seed: number, step: number, reason: 'start' | 'change' | 'load' }} WorldRequest
 * What the host's `load` is asked for: a world of `scene`, instantiated and ready to step, built as
 *   const tree = new SceneTree({ registry, seed: req.seed, … });  tree.clock.step = req.step;
 *   installPhysics(tree, R); …; installGame(tree, { scene: req.scene }); installSave(tree, { scene: { ref: req.scene, doc } });
 *   tree.instantiate(doc);
 * The clock is set before instantiate, so whatever notes the step when it starts notes the session's.
 */

export class GameFlow {
  /**
   * @param {object} o
   * @param {(req: WorldRequest) => Promise<any> | any} o.load builds a world (see WorldRequest)
   * @param {(tree: any) => void} [o.unload] frees a world that is no longer played (Rapier's memory, GPU resources)
   * @param {(tree: any, info: { reason: 'start' | 'change' | 'load', from: string | null, to: string, recording?: any }) => void} [o.onWorld]
   *   the world being played changed: point the renderer at flow.tree
   * @param {{ write: (slot: string, file: any) => Promise<any>, read: (slot: string) => Promise<any> }} [o.store] where checkpoints go (one of the save package's stores)
   * @param {number} [o.seed] the session's seed
   * @param {string[]} [o.carry] services whose state goes with the game to the next scene (not on a reset)
   * @param {string[]} [o.always] services that go even on a reset
   * @param {() => string} [o.stamp] the time a save is stamped with (the app's clock: nothing here reads one)
   * @param {Map<string, any> | Record<string, any>} [o.scenes] every scene of the game, parsed, by the name changeScene
   *   uses. Given them, start() checks the game as a whole first (checkGame: a scene that reads what no scene
   *   declares, a change to a scene the game doesn't have) and refuses a game that can't be right. Without them
   *   nothing here knows the other scenes, and that check is a tool's to run.
   * @param {Map<string, any>} [o.prefabs] the game's prefab documents by ref (as SceneTree takes them): with them the
   *   check sees game nodes inside prefab instances. A scene with instances it can't flatten isn't judged at all, so
   *   a valid game is never refused for what the check couldn't see (flow.unchecked says which scenes).
   */
  constructor({ load, unload = null, onWorld = null, store = null, seed = 1, carry = ['save', 'inventory'], always = ['input'], stamp = null, scenes = null, prefabs = null }) {
    if (typeof load !== 'function') throw new Error('GameFlow needs load: (request) => a world');
    this.scenes = scenes; this.prefabs = prefabs;
    /** Scenes the start's check couldn't read whole (prefab instances with no prefabs given), each with the reason. @type {string[]} */
    this.unchecked = [];
    this.loadWorld = load; this.unload = unload; this.onWorld = onWorld; this.store = store; this.stamp = stamp;
    this.seed = seed >>> 0;
    this.carry = carry; this.always = always;
    /** The world being played (a SceneTree). */ this.tree = /** @type {any} */ (null);
    /** The latest checkpoint file of each slot (also written to the store, when there is one). @type {Map<string, any>} */
    this.checkpoints = new Map();
    /** @type {null | { key: string, req: WorldRequest, tree: any, error: any, promise: Promise<void>, dropped: boolean }} */
    this._next = null;
    this._seq = 0;       // the last checkpoint handled (GameService.checkpointSeq)
    /** @type {Promise<any> | null} */ this._loading = null; // a load() in progress
    /** @type {Set<Promise<any>>} */ this._writes = new Set();
    /** @type {Set<(event: any) => void>} */ this._listeners = new Set();
    this._relay = (e) => { for (const fn of [...this._listeners]) fn(e); };
    this._off = null;
  }

  /** The game service of the world being played. @returns {import('./service.js').GameService} */
  get game() { return this.tree?.services.get('game') ?? null; }
  /** The scene being played. */
  get scene() { return this.game?.scene ?? null; }
  /** Why step() would do nothing now, or null. */
  get held() {
    if (this._loading) return 'loading a save';
    const p = this.game?.pending;
    if (p && this.tree.clock.step >= p.at && !this._next?.tree) return `loading ${p.to}`;
    return null;
  }

  /** Build the first scene's world. @param {string} scene */
  async start(scene) {
    if (this.tree) throw new Error('this flow has started: changeScene moves it on, load() restores a save');
    if (this.scenes) {
      const game = checkGame(this.scenes, { prefabs: this.prefabs });
      this.unchecked = game.unchecked;
      if (!game.ok) throw new Error(`this game can't start: ${game.problems.join('; ')}`);
    }
    const tree = await this._build({ scene, seed: worldSeed(this.seed, 0), step: 0, reason: 'start' });
    const game = tree.services.get('game');
    game.seed = this.seed; game.arrivals = 0;
    this._adopt(tree);
    this.onWorld?.(tree, { reason: 'start', from: null, to: scene });
    return this;
  }

  // ---------------------------------------------------------------- stepping

  /**
   * One simulation step of the world being played; first the scene change, if one is due. False when nothing stepped:
   * the next world is still loading, or a service holds the step (await settle(), or try again next frame).
   */
  step() {
    if (!this.tree) throw new Error('start() the flow first');
    if (this._loading) return false;
    const p = this.game.pending;
    if (p) {
      const next = this._prepare(p);
      if (this.tree.clock.step >= p.at) {
        if (next.error) throw new Error(`the scene change to "${p.to}" failed: ${next.error?.message ?? next.error}`, { cause: next.error });
        if (!next.tree) return false;
        this._change(next, p);
      }
    } else if (this._next) this._dropNext();
    if (!this.tree.step()) return false;
    this._boundary();
    return true;
  }

  /** `count` steps. A held step is an error here: use runAsync. */
  run(count) { for (let i = 0; i < count; i++) if (!this.step()) throw new Error(`step ${this.tree.clock.step} is held (${this.held ?? 'a service\'s pending work'}): use runAsync`); }

  /** `count` steps, waiting out loading and held steps. */
  async runAsync(count) { for (let i = 0; i < count; i++) while (!this.step()) await this.settle(); }

  /** Resolves when nothing is pending: the next world's build, checkpoint writes, the tree's own services. */
  async settle() {
    if (this._loading) await this._loading;
    if (this._next) await this._next.promise;
    await Promise.all([...this._writes]);
    await this.tree?.settle();
  }

  /** Live play: the due steps, then presentation. The frame loop calls this in place of tree.frame. → α */
  frame(elapsedSeconds) {
    const { steps, alpha } = this.tree.clock.advance(elapsedSeconds);
    for (let i = 0; i < steps; i++) if (!this.step()) break; // held (loading): the rest waits for the next frame
    this.tree.present(elapsedSeconds, alpha);
    return alpha;
  }

  // After a step: take the checkpoint it asked for, and start building the world it asked to change to.
  _boundary() {
    const game = this.game;
    if (game.checkpointSeq !== this._seq) this._checkpoint(game);
    if (game.pending) this._prepare(game.pending);
  }

  // ---------------------------------------------------------------- scene changes

  _prepare(p) {
    const key = `${p.to}\n${p.at}\n${p.reset}`;
    if (this._next?.key === key) return this._next;
    this._dropNext();
    const game = this.game;
    /** @type {WorldRequest} */ const req = { scene: p.to, seed: worldSeed(game.seed, game.arrivals + 1), step: p.at, reason: 'change' };
    const next = { key, req, tree: null, error: null, promise: /** @type {any} */ (null), dropped: false };
    next.promise = Promise.resolve().then(() => this._build(req)).then(
      (tree) => { if (next.dropped) this.unload?.(tree); else next.tree = tree; },
      (e) => { next.error = e; },
    );
    this._next = next;
    return next;
  }

  // The request changed or went away (a load, a later changeScene): the world being built for it isn't wanted.
  _dropNext() {
    const n = this._next;
    if (!n) return;
    this._next = null; n.dropped = true;
    if (n.tree) this.unload?.(n.tree);
  }

  async _build(req) {
    const tree = await this.loadWorld(req);
    const game = tree?.services?.get('game');
    if (!game) throw new Error(`the world for "${req.scene}" has no game service: installGame(tree, { scene }) before instantiate`);
    if (req.reason !== 'load') {
      if (tree.clock.step !== req.step) throw new Error(`the world for "${req.scene}" is at step ${tree.clock.step}, not ${req.step}: set tree.clock.step = request.step before instantiate`);
      if (tree.rng.seed !== req.seed >>> 0) throw new Error(`the world for "${req.scene}" has seed ${tree.rng.seed}, not ${req.seed}: new SceneTree({ seed: request.seed })`);
    }
    game.scene ??= req.scene;
    if (game.scene !== req.scene) throw new Error(`asked for "${req.scene}", got a world of "${game.scene}"`);
    return tree;
  }

  _change(next, p) {
    const prev = this.tree, was = this.game, from = was.scene;
    const tree = next.tree, game = tree.services.get('game');
    // A win or a loss asked for after the last step's rules ran (a service installed after the game) is decided here,
    // in the world it was asked in, before the game is carried: it is never lost to the change, whatever the order.
    was.decideAsked();
    try {
      was.carryTo(game, { reset: p.reset });
      // the services that go only when the game goes, then those that always go (input last: its hand-over moves a
      // recording in progress, which must not happen unless everything before it did)
      for (const name of [...(p.reset ? [] : this.carry), ...this.always]) {
        const a = prev.services.get(name), b = tree.services.get(name);
        if (!a || !b) continue;
        if (typeof a.carryTo === 'function') a.carryTo(b);
        else if (typeof a.getState === 'function' && typeof b.setState === 'function') b.setState(structuredClone(a.getState()));
      }
    } catch (e) {
      // The session couldn't be carried over: the world built for it is freed once, and the request keeps its error,
      // so every later step says the same without building it again. The world being played is untouched.
      next.tree = null; next.error = e;
      this.unload?.(tree);
      throw new Error(`the scene change to "${p.to}" failed: ${e?.message ?? e}`, { cause: e });
    }
    this._next = null;
    was.dropRequests('scene'); // a checkpoint still waiting for a step that could save isn't taken, and says so
    was.flush();               // what the last step queued reaches the listeners before the world goes
    tree.clock.timeScale = prev.clock.timeScale; tree.clock.paused = prev.clock.paused; // live play's speed is the session's
    tree.root.object3d.updateMatrixWorld(true); // a world that starts past step 0 steps from current matrices too (tree.step does this at 0)
    this._adopt(tree);
    this.unload?.(prev);
    this._relay({ type: 'scene', from, to: game.scene, reset: p.reset, step: tree.clock.step });
    this.onWorld?.(tree, { reason: 'change', from, to: game.scene });
  }

  _adopt(tree) {
    this._off?.();
    this.tree = tree;
    const game = tree.services.get('game');
    this._off = game.on(this._relay);
    this._seq = game.checkpointSeq; // the checkpoints the state already has were written by the run that took them
  }

  // ---------------------------------------------------------------- saves and checkpoints

  /**
   * A save file of the session now (between steps). It is @vrmxg/save's file: it names its scene, so load() knows
   * which world to build. `extra.game` carries a line for a slot list (scene, score, goal, outcome).
   * @param {{ name?: string, savedAt?: string, note?: string, extra?: any }} [o]
   */
  save(o = {}) {
    const save = this.tree?.services.get('save');
    if (!save) throw new Error('this world has no save service: installSave(tree, { scene: { ref, doc } })');
    const v = this.game.view();
    return save.save({ ...o, savedAt: o.savedAt ?? this.stamp?.() ?? null, extra: { ...(o.extra ?? {}), game: { scene: v.scene, score: v.score, goal: v.goal?.text ?? null, outcome: v.outcome } } });
  }

  /**
   * Save the session into a slot of the store: the player's own save (a menu's Save). Slots that start with
   * CHECKPOINT_PREFIX ("auto-") are the game's: a Checkpoint node with slot "quick" writes "auto-quick", so a player's
   * save there would be overwritten without a word. Such a name is refused. → the store's entry for the slot
   * @param {string} slot @param {{ name?: string, savedAt?: string, note?: string, extra?: any }} [o]
   */
  async saveTo(slot, o = {}) {
    if (!this.store) throw new Error('this flow has no store to save into (new GameFlow({ store }))');
    if (typeof slot !== 'string' || slot === '') throw new Error('saveTo needs a slot: the save\'s name in the store');
    if (slot.startsWith(CHECKPOINT_PREFIX)) throw new Error(`"${slot}" can't be a player's save: slots that start with "${CHECKPOINT_PREFIX}" are the game's checkpoints (a Checkpoint node's slot "${slot.slice(CHECKPOINT_PREFIX.length)}" is written there). Pick another name`);
    return this.store.write(slot, this.save(o));
  }

  /** Load the save in a slot of the store (a player's, or a checkpoint's by its full name). → the step play goes on from */
  async loadFrom(slot) {
    if (!this.store) throw new Error('this flow has no store to load from (new GameFlow({ store }))');
    return this.load(await this.store.read(slot));
  }

  /**
   * Load a save: build a world of the scene it was made in, restore it, and play that one. The world being played is
   * left as it is when the file can't load (the error says why). A load jumps the session's clock, so an input
   * recording in progress can't go on: it is stopped and handed over, in the `loaded` event and in onWorld's info
   * (`recording`: the frames up to the load). Those are the only two places it is handed to: a caller with neither a
   * listener nor onWorld stops the recording itself before it loads. A replay isn't in a save: replay it again on
   * flow.tree.
   * → the step play goes on from
   */
  load(file) {
    const scene = file?.requires?.scene?.ref ?? file?.summary?.scene;
    if (typeof scene !== 'string') return Promise.reject(new Error('this save doesn\'t name its scene (installSave(tree, { scene: { ref, doc } }) in the world that made it)'));
    if (this._loading) return Promise.reject(new Error('a save is loading already'));
    // cleared before the caller's await returns, so one load can follow another; what settle() waits for meanwhile
    const done = (async () => { try { return await this._load(file, scene); } finally { this._loading = null; } })();
    this._loading = done.catch(() => {});
    return done;
  }

  async _load(file, scene) {
    const tree = await this._build({ scene, seed: this.seed, step: 0, reason: 'load' });
    const save = tree.services.get('save');
    try {
      if (!save) throw new Error(`the world for "${scene}" has no save service`);
      await save.load(file);
    } catch (e) { this.unload?.(tree); throw e; }
    const prev = this.tree, from = this.scene;
    const input = prev?.services.get('input'), recording = input?.recording ? input.stop() : null;
    prev?.services.get('game')?.flush();
    this._dropNext();
    this._adopt(tree);
    this.seed = this.game.seed;
    if (prev) this.unload?.(prev);
    this._relay({ type: 'loaded', scene, step: tree.clock.step, ...(recording ? { recording } : {}) });
    this.onWorld?.(tree, { reason: 'load', from, to: scene, ...(recording ? { recording } : {}) });
    return tree.clock.step;
  }

  /**
   * Load the checkpoint in a slot: the one this session took (the newest there is, whether or not the store has
   * finished writing it, or failed to), else the store's.
   */
  async loadCheckpoint(slot = 'checkpoint') {
    let file = this.checkpoints.get(slot);
    if (!file && this.store) { try { file = await this.store.read(CHECKPOINT_PREFIX + slot); } catch { file = null; } }
    if (!file) throw new Error(`no checkpoint "${slot}"`);
    return this.load(file);
  }

  // The checkpoints the last step took (each slot's latest): one save of the world at this boundary, written to each.
  // The game service takes a checkpoint only on a step that leaves the game undecided and the world savable, so the
  // two refusals below are for what it can't see: something that began after its part of the step (a redraw started
  // by a later service), or a driver that isn't the step. Either way no file is written and the listeners are told;
  // a decided game is never saved over a good one.
  _checkpoint(game) {
    const tree = this.tree, save = tree.services.get('save'), step = tree.clock.step;
    const due = Object.entries(game.checkpoints).filter(([, c]) => c.seq > this._seq).sort((a, b) => a[1].seq - b[1].seq);
    this._seq = game.checkpointSeq;
    game.flush(); // the step's own `checkpoint` event reaches the listeners before what became of it
    // A win or a loss asked for after the step's rules took this checkpoint (a service installed after the game) is
    // decided by the next step or the scene change, as of this step: the checkpoint would hold a game that is lost
    // one step after it loads. It isn't written, and the game takes it back out of its state when it decides.
    if (game.requests.win !== null || game.requests.lose !== null) { for (const [slot, c] of due) this._relay({ type: 'checkpointSkipped', id: c.id, slot, reason: 'decided', step }); return; }
    const why = !save ? 'this world has no save service' : game.outcome !== null ? `the game is ${game.outcome.result}` : save.cannotSave();
    for (const [slot, c] of due) {
      const info = { id: c.id, slot, step };
      if (why) { this._relay({ type: 'checkpointFailed', ...info, error: why }); continue; }
      const file = this.save({ name: c.label ?? 'Checkpoint', note: `checkpoint ${c.id}` });
      this.checkpoints.set(slot, file);
      if (!this.store) { this._relay({ type: 'checkpointWritten', ...info, stored: false }); continue; }
      const w = Promise.resolve().then(() => this.store.write(CHECKPOINT_PREFIX + slot, file)).then(
        () => { this._relay({ type: 'checkpointWritten', ...info, stored: true }); },
        (e) => { this._relay({ type: 'checkpointFailed', ...info, error: String(e?.message ?? e) }); },
      ).finally(() => { this._writes.delete(w); });
      this._writes.add(w);
    }
  }

  // ---------------------------------------------------------------- what a HUD binds to

  /** The game state as plain data (GameService.view()), of whichever world is being played. */
  view() { return this.game?.view() ?? null; }
  /** Changes when the view would (see GameService.version); also across a scene change. */
  get version() { return `${this.game?.arrivals ?? 0}:${this.game?.version ?? 0}`; }

  /**
   * Listen to the session: the game's events (GameService.on) of whichever world is being played, plus the flow's own:
   *   { type: 'scene', from, to, reset, step }      the world changed
   *   { type: 'loaded', scene, step }               a save was loaded
   *   { type: 'checkpointWritten', id, slot, step, stored } | { type: 'checkpointFailed', id, slot, step, error }
   *   (written: the file exists, in flow.checkpoints and, with `stored`, in the store; failed: the store's write, or
   *   a world that couldn't be saved. A HUD says "saved" on checkpointWritten, not on the game's `checkpoint`.)
   * → a function that stops it
   */
  on(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  /** Deliver the game's queued events now (presentation does it every frame). */
  flush() { return this.game?.flush() ?? []; }

  /** End the session: the world being played and any being built are unloaded. */
  dispose() {
    this._dropNext(); this._off?.(); this._off = null;
    if (this.tree) this.unload?.(this.tree);
    this.tree = null;
  }
}

/**
 * Step a flow and hash the world being played after every step (@vrmxg/snapshot's worldHashes), across scene changes:
 * the run that compareRuns and assertSameRun compare between runtimes. Loading is waited out, so the run is the same
 * however long it took.
 * @param {GameFlow} flow @param {number} steps
 * @param {{ physicsBytesEvery?: number, onStep?: (step: number, flow: GameFlow) => void | Promise<void> }} [opts] onStep runs before each step
 * @returns {Promise<Array<{ step: number, scene: string | null, h: Record<string, string> }>>}
 */
export async function recordFlow(flow, steps, { physicsBytesEvery = 0, onStep } = {}) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    await onStep?.(flow.tree.clock.step, flow);
    while (!flow.step()) await flow.settle();
    const step = flow.tree.clock.step;
    out.push({ step, scene: flow.scene, h: worldHashes(flow.tree, { physicsBytes: physicsBytesEvery > 0 && step % physicsBytesEvery === 0 }) });
  }
  return out;
}
