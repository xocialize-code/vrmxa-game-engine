// A play session (M5 W1, AB-D-0286): what the game app plays between the title menu and going back to it. It wraps a
// GameFlow (@vrmxg/game) and keeps the session's log, so a session played through the app's menus replays to the same
// per-step hashes anywhere (replaySession, below; acceptance/m5/game.mjs replays the app's log in Node).
//
// How each menu action reaches the simulation:
//
//   New Game        starts the session: flow.start(entry) at step 0, with input recorded from step 0
//   Continue, Load  starts a segment from a save file: flow.load(file). The flow stops the recording in progress and
//                   hands it over, and it is kept as the segment before; a new recording starts at the loaded step
//   Save            flow.saveTo(slot), between two steps. It reads the world and changes nothing in it
//   Pause, Resume   the host takes no step while paused: nothing in the world changes, and nothing is recorded
//   Quit to title   ends the session
//
// A save belongs to the builds that can restore it (M6 W5, AB-T-0631). Every file this session writes (a player's save,
// a checkpoint) carries, in its `extra.build`, the build's digest and its save-compatibility fingerprint (@vrmxg/bundle's
// compat.js, the manifest's `compat`: the scene documents and prefabs, the state the behaviours declare or else their
// code, the action map, the engine's snapshot format and maths). A file loads into the build that made it, and into any
// later export of the game with the same fingerprint: a re-export that changed only a texture, a sound or the game's
// `release` goes on from its earlier saves with the same per-step hashes. A file whose fingerprint differs is refused
// with what changed (its scenes, a behaviour's state or code, the controls, the engine); so is one from before M6, which
// has a digest and no fingerprint, unless it is this build's. (@vrmxg/save checks the scene being restored, the maths and
// the physics build on its own, as it always has.)
//
// A session log names the whole build's digest, and replaySession refuses a log from any other build: a replay is exact
// only on the build it was played on, so a re-export, however small, doesn't replay an earlier log.
//
// None of them is an input: the first two are where a segment of the log starts, and the rest never touch the world.
// Whatever a game's own scenes offer (a title scene that waits for a button) is an action in the recorded input frame.
// Nothing here runs inside a step: a menu's handler is a DOM event or an animation frame, so each lands on a boundary.
//
// No DOM and no wall clock: the time a save is stamped with comes in as `stamp`.
import { GameFlow, CHECKPOINT_PREFIX } from '@vrmxg/game';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { compatProblems } from '@vrmxg/bundle';

export const SESSION_FORMAT = 'vrmxg-session';
export const SESSION_VERSION = 1;
/** Rapier's whole state goes into a step's hash every this many steps (as the engine's other per-step runs do). */
const PHYSICS_BYTES_EVERY = 60;

const stepHash = (tree) => hashValue(worldHashes(tree, { physicsBytes: tree.clock.step % PHYSICS_BYTES_EVERY === 0 }));

export class GameSession {
  /**
   * @param {object} o
   * @param {{ id: string, entry: string, title?: string }} o.game the build's game document
   * @param {string | null} [o.digest] the build's digest (the log names the build it was played on)
   * @param {any} [o.compat] the build's save-compatibility fingerprint (its manifest's `compat`): saves another export
   *   made load when it matches (null: a build from before M6, whose saves load only into it)
   * @param {(req: any) => Promise<any>} o.load builds a world (world.js `worldLoader`)
   * @param {(tree: any) => void} [o.unload] frees one
   * @param {any} [o.store] a @vrmxg/save store: the player's slots and the game's checkpoints
   * @param {() => string} [o.stamp] the time a save is stamped with (the app's clock)
   * @param {number} [o.seed] a new game's seed
   * @param {Map<string, any> | null} [o.scenes] @param {Map<string, any> | null} [o.prefabs] the game's documents, for the flow's whole-game check
   * @param {(tree: any, info: any) => void} [o.onWorld] the world being played changed (a host re-points its renderer)
   * @param {(event: any) => void} [o.onEvent] the flow's events (the game's, and scene, loaded, checkpointWritten, …)
   * @param {boolean} [o.hashes] keep a hash of the world after every step (an acceptance run; it costs a hash a step)
   */
  constructor({ game, digest = null, compat = null, load, unload = null, store = null, stamp = null, seed = 1, scenes = null, prefabs = null, onWorld = null, onEvent = null, hashes = false }) {
    this.game = game; this.digest = digest;
    this.loadWorld = load; this.unload = unload; this.store = store; this.stamp = stamp;
    /**
     * Counts the segments begun and the sessions ended. A save or a checkpoint is written to the store outside the step
     * and may land after the player has loaded another save or quit: it makes progress safe only for the segment it was
     * started in. (A load keeps the same GameFlow, so comparing flows isn't enough.)
     */
    this.segment = 0;
    /** What every file written here says about the build that made it (null: no build, as in some tests). */
    this.build = digest ? { digest, game: game.id, ...(compat ? { compat } : {}) } : null;
    // the store as the flow sees it: every write (a player's save, a checkpoint) is stamped with the build, and moves
    // safeStep once it has succeeded, only if no other segment began meanwhile
    this._store = store && {
      read: (slot) => store.read(slot),
      list: () => store.list(),
      remove: (slot) => store.remove(slot),
      write: async (slot, file) => {
        const seg = this.segment;
        const entry = await store.write(slot, this.build ? { ...file, extra: { ...(file?.extra ?? {}), build: this.build } } : file);
        if (seg === this.segment && this.flow) this.safeStep = Math.max(this.safeStep, file?.summary?.step ?? 0);
        return entry;
      },
    };
    this.seed = seed >>> 0; this.scenes = scenes; this.prefabs = prefabs;
    this.onWorld = onWorld; this.onEvent = onEvent; this.keepHashes = hashes;
    /** The flow being played, or null (the title menu). @type {GameFlow | null} */ this.flow = null;
    /** Finished segments of the log. @type {any[]} */ this.segments = [];
    /** The segment being played: { from, at, marks }. Its recording is the input service's. */ this.current = /** @type {any} */ (null);
    /** The step up to which the session is safe in the store (a save, a written checkpoint, or where it was loaded from). */
    this.safeStep = 0;
    /** @type {Array<{ step: number, scene: string | null, hash: string }>} */ this.trace = [];
    /** The log of the session that ended last (Quit to title), for a runner to read. */ this.last = /** @type {any} */ (null);
    this._handed = null;
    this._changing = false; // a New Game or a load under way
    /** A log being played back (replay), or null. */ this.replaying = /** @type {any} */ (null);
  }

  get active() { return !!this.flow; }
  get tree() { return this.flow?.tree ?? null; }
  get step() { return this.flow?.tree?.clock.step ?? 0; }
  get scene() { return this.flow?.scene ?? null; }
  /** What step() would wait for (a scene or a save loading), or null. */
  get held() { return this.flow?.held ?? null; }
  /** Steps played since the session was last safe in the store: what closing now would lose. */
  get unsavedSteps() { return this.flow && !this.replaying ? Math.max(0, this.step - this.safeStep) : 0; } // a replay is nobody's progress
  get dirty() { return this.unsavedSteps > 0; }
  view() { return this.flow?.view() ?? null; }

  _flow({ store = this._store } = {}) {
    const flow = new GameFlow({
      load: this.loadWorld, unload: this.unload, store, seed: this.seed, stamp: this.stamp, scenes: this.scenes, prefabs: this.prefabs,
      onWorld: (tree, info) => { if (info.recording) this._handed = info.recording; this.onWorld?.(tree, info); },
    });
    flow.on((e) => this.onEvent?.(e)); // a checkpoint makes progress safe through the store's write (above), not its event
    return flow;
  }

  _begin(flow, from) { this.flow = flow; this.segments = []; this.trace = []; this._open(from); }
  _open(from) {
    const tree = this.flow.tree;
    this.segment++;
    this.current = { from, at: tree.clock.step, marks: [] };
    tree.services.get('input').record(); // from the next step: every frame the simulation reads is in the log
    this.safeStep = tree.clock.step;
  }

  /** New Game: a fresh session in the game's entry scene, at step 0. An earlier session ends first. */
  async newGame() {
    if (this._changing) throw new Error('a game is starting or loading already');
    this.end();
    const flow = this._flow();
    this._changing = true;
    try { await flow.start(this.game.entry); } catch (e) { flow.dispose(); throw e; } finally { this._changing = false; }
    this._begin(flow, { start: this.game.entry, seed: this.seed });
    return this;
  }

  /**
   * Play on from a save file. From the title it starts a session; in one, the world being played is left alone when the
   * file can't load (the error says why), and otherwise the log gets a new segment that starts from the file.
   * @param {any} file a @vrmxg/save file @param {{ slot?: string | null }} [o] the slot it came from, for the log
   * @returns {Promise<number>} the step play goes on from
   */
  async loadFile(file, { slot = null } = {}) {
    if (this._changing) throw new Error('a game is starting or loading already');
    this.checkBuild(file);
    this._changing = true;
    try { return await this._loadFile(file, slot); } finally { this._changing = false; }
  }

  async _loadFile(file, slot) {
    // from the title, or over a replay (the pause menu's Load during ?replay): a fresh flow with the player's store, and
    // a fresh log. A replay's flow has no store and its segments aren't the player's, so neither is kept
    if (!this.flow || this.replaying) {
      const flow = this._flow();
      try { await flow.load(file); } catch (e) { flow.dispose(); throw e; }
      const replayed = this.replaying ? this.flow : null;
      if (replayed) this._endReplay();
      replayed?.dispose();
      this._begin(flow, { save: file, slot });
      return this.step;
    }
    this._handed = null;
    const flow = this.flow, ended = this.segment;
    await flow.load(file);
    if (this.flow !== flow || this.segment !== ended) {
      // the session ended while the save loaded (Quit to Title, a close): the world it built goes with the flow
      flow.dispose();
      throw new Error('the game ended while the save was loading');
    }
    // the flow stopped the recording as it left the old world, and handed it to onWorld: the segment that just ended
    this.segments.push({ ...this.current, recording: this._handed });
    this._handed = null;
    this._open({ save: file, slot });
    return this.step;
  }

  /**
   * Refuse a save this build can't restore (see the top): one from another game, or from another build whose
   * fingerprint differs or that has none. A session with no build (tests) loads any file. The error says what changed;
   * its `code` is 'incompatible_save' and its `problems` are @vrmxg/bundle's compatProblems.
   * @param {any} file
   */
  checkBuild(file) {
    const problems = this.buildProblems(file);
    if (problems === null) return;
    throw Object.assign(new Error(problems.message), { code: 'incompatible_save', problems: problems.list });
  }

  /**
   * Why this build can't restore a save, or null when it can (checkBuild without the throw).
   * @param {any} file @returns {{ message: string, list: Array<{ part: string, items: string[], text: string }> } | null}
   */
  buildProblems(file) {
    if (!this.build) return null;
    const b = file?.extra?.build;
    if (!b?.digest) return { message: 'This save doesn\'t say which version of the game made it, so it can\'t be loaded safely.', list: [{ part: 'build', items: [], text: 'it names no build' }] };
    if (b.game && b.game !== this.build.game) return { message: `This save is from another game ("${b.game}"), not this one.`, list: [{ part: 'game', items: [b.game], text: `it is from the game "${b.game}"` }] };
    if (b.digest === this.build.digest) return null;
    if (b.compat && this.build.compat) {
      const list = compatProblems(b.compat, this.build.compat);
      if (!list.length) return null; // another export, and nothing a restore depends on changed
      const why = list.map((p) => p.text).join('; ');
      return { message: `This save was made with another version of the game, and this one can't restore it: ${why}.`, list };
    }
    // a build from before M6 on one side: only the build that made the save can restore it
    return { message: `This save was made with another version of the game (build ${String(b.digest).slice(0, 12)}); this one is build ${this.build.digest.slice(0, 12)}. A save loads only into the version that made it, or a later one that restores it the same.`, list: [{ part: 'build', items: [], text: `${b.compat ? 'this' : 'that'} version doesn't record what its saves depend on` }] };
  }

  /** Load a slot of the store: a player's save, or a checkpoint by its full name ("auto-…"). */
  async loadSlot(slot) {
    if (!this.store) throw new Error('this game has nowhere to load from');
    const seg = this.segment;
    const file = await this.store.read(slot);
    if (seg !== this.segment) throw new Error('the game ended while the save was loading'); // ended, or another load began, during the read
    return this.loadFile(file, { slot });
  }

  /**
   * Save into one of the player's slots, between two steps. The session counts as saved only once the store has the
   * file: a write that fails throws, and the progress stays unsaved. Checkpoint slots ("auto-…") are refused by the flow.
   * @param {string} slot @param {{ name?: string }} [o] → the store's entry for the slot
   */
  async saveSlot(slot, { name } = {}) {
    if (!this.flow) throw new Error('there is no game to save');
    const seg = this.segment, step = this.step;
    const entry = await this.flow.saveTo(slot, { name }); // the store's write moves safeStep (see _store)
    const kept = seg === this.segment; // still the segment it was saved in: not loaded over or ended meanwhile
    if (kept) this.current.marks.push({ type: 'save', slot, step });
    return { ...entry, kept };
  }

  /** Can a slot be written by the player? (Checkpoint slots are the game's.) */
  static playerSlot(slot) { return typeof slot === 'string' && slot !== '' && !slot.startsWith(CHECKPOINT_PREFIX); }

  /** One simulation step (the host's frame loop calls this in place of flow.step()). False when it is held. */
  advance() {
    const flow = this.flow;
    if (!flow) return false;
    const r = this.replaying;
    if (r && r.left <= 0) return false; // this segment's recorded frames are played: the host starts the next (replayNext)
    if (!flow.step()) return false;
    if (r) r.left--;
    if (this.keepHashes) this.trace.push({ step: flow.tree.clock.step, scene: flow.scene, hash: stepHash(flow.tree) });
    return true;
  }

  /**
   * Play a session's log back (M5 W10): each segment's start (a new game, or its save file), then its recorded input,
   * stepped by the host's own frame loop with everything drawn, as live play is. With `hashes` on, the trace is the
   * hash after every step, which is the log's own `hashes` when the replay is exact. The host calls replayNext() when a
   * segment's frames run out (`replaying.left` 0); `replaying.done` once every segment is played.
   * @param {any} log GameSession.log() of a session played on this build
   */
  async replay(log) {
    if (this._changing) throw new Error('a game is starting or loading already');
    if (log?.format !== SESSION_FORMAT) throw new Error(`not a session log (format "${log?.format}")`);
    if (log.version !== SESSION_VERSION) throw new Error(`session log version ${log.version}; this reads ${SESSION_VERSION}`);
    if (this.digest && log.game?.digest !== this.digest) throw new Error(`this log was played on build ${String(log.game?.digest).slice(0, 12)}; this is build ${this.digest.slice(0, 12)}: a log replays only on the build it was played on`);
    this.end();
    this.trace = [];
    this.replaying = { log, segment: -1, left: 0, done: false, seed: this.seed }; // the session's own seed, given back after
    await this.replayNext();
  }

  /** A replay is over (ended, or a save loaded over it): the session's own seed back, and nothing of it kept. */
  _endReplay() {
    if (!this.replaying) return;
    this.seed = this.replaying.seed;
    this.replaying = null;
  }

  /** The next segment of the log being replayed (see replay). False when there is none left. */
  async replayNext() {
    const r = this.replaying;
    if (!r || r.done) return false;
    r.segment++;
    const seg = r.log.segments[r.segment];
    if (!seg) { r.done = true; r.left = 0; return false; }
    this._changing = true;
    try {
      if (seg.from.start !== undefined) {
        this.flow?.dispose();
        this.flow = null; // a start that fails leaves no flow behind, not a disposed one
        this.seed = (seg.from.seed ?? 1) >>> 0;
        const flow = this._flow({ store: null }); // a replay writes no checkpoints into the player's store
        try { await flow.start(seg.from.start); } catch (e) { flow.dispose(); throw e; }
        this.flow = flow;
      } else if (seg.from.save) {
        this.flow ??= this._flow({ store: null });
        await this.flow.load(seg.from.save);
      } else throw new Error(`segment ${r.segment} doesn't say where it starts`);
    } finally { this._changing = false; }
    if (this.flow.tree.clock.step !== seg.at) throw new Error(`segment ${r.segment} starts at step ${seg.at}; the replay is at step ${this.flow.tree.clock.step}`);
    this.current = { from: seg.from, at: seg.at, marks: [] };
    const frames = seg.recording?.frames.length ?? 0;
    if (frames) this.flow.tree.services.get('input').replay(seg.recording);
    r.left = frames;
    return true;
  }

  /**
   * The session so far as a log (plain data): the build it was played on, and its segments, each with where it starts
   * and the input recorded from there. With `hashes` on, the hash of the world after every step, in order.
   */
  log() {
    if (!this.flow) return this.last;
    const recording = this.flow.tree.services.get('input').recording;
    const segments = [...this.segments, { ...this.current, recording: recording ? { ...recording, frames: recording.frames.slice() } : null }];
    return {
      format: SESSION_FORMAT, version: SESSION_VERSION,
      game: { id: this.game.id, entry: this.game.entry, digest: this.digest },
      segments: segments.map((s) => ({ from: s.from, at: s.at, steps: s.recording?.frames.length ?? 0, marks: s.marks.slice(), recording: s.recording })),
      ...(this.keepHashes ? { hashes: this.trace.slice() } : {}),
    };
  }

  /** End the session (Quit to title): its world is freed, and its log kept as `last`. Does nothing with none. */
  end() {
    if (!this.flow) { this._endReplay(); return null; }
    const replay = !!this.replaying;
    const log = replay ? null : this.log();
    this.flow.tree.services.get('input')?.stop();
    this.flow.dispose();
    this.flow = null; this.current = null; this.segments = []; this.safeStep = 0;
    this._endReplay();
    this.segment++; // a write still in flight belongs to a session that has gone
    if (!replay) this.last = log; // a replay is nobody's session: the last one played stays the last log
    return log;
  }
}

/**
 * Replay a session's log: each segment's start (a new game, or its save file), then its recorded input for as many
 * steps as it has frames, with a hash of the world after every step. The result is the app's `hashes` when the replay
 * is exact.
 * @param {any} log GameSession.log()
 * @param {{ digest: string, load: (req: any) => Promise<any>, unload?: (tree: any) => void, scenes?: Map<string, any> | null, prefabs?: Map<string, any> | null }} o
 *   digest: the digest of the build it is replayed on (its manifest's): a log from another build is refused; load,
 *   unload: this runtime's world builder (world.js); scenes, prefabs: the game's documents
 * @returns {Promise<Array<{ step: number, scene: string | null, hash: string }>>}
 */
export async function replaySession(log, { digest, load, unload = null, scenes = null, prefabs = null }) {
  if (log?.format !== SESSION_FORMAT) throw new Error(`not a session log (format "${log?.format}")`);
  if (log.version !== SESSION_VERSION) throw new Error(`session log version ${log.version}; this reads ${SESSION_VERSION}`);
  if (typeof digest !== 'string' || !digest) throw new Error('replaySession needs the digest of the build it replays on');
  if (log.game?.digest !== digest) throw new Error(`this log was played on build ${String(log.game?.digest).slice(0, 12)}; this is build ${digest.slice(0, 12)}: a log replays only on the build it was played on`);
  /** @type {GameFlow | null} */ let flow = null;
  const out = [];
  try {
    for (const [i, seg] of log.segments.entries()) {
      if (seg.from.start !== undefined) {
        flow?.dispose();
        flow = new GameFlow({ load, unload, seed: seg.from.seed ?? 1, scenes, prefabs });
        await flow.start(seg.from.start);
      } else if (seg.from.save) {
        flow ??= new GameFlow({ load, unload, scenes, prefabs });
        await flow.load(seg.from.save);
      } else throw new Error(`segment ${i} doesn't say where it starts`);
      if (flow.tree.clock.step !== seg.at) throw new Error(`segment ${i} starts at step ${seg.at}; the replay is at step ${flow.tree.clock.step}`);
      const rec = seg.recording;
      if (!rec?.frames.length) continue;
      flow.tree.services.get('input').replay(rec);
      for (let k = 0; k < rec.frames.length; k++) {
        while (!flow.step()) await flow.settle();
        out.push({ step: flow.tree.clock.step, scene: flow.scene, hash: stepHash(flow.tree) });
      }
    }
  } finally { flow?.dispose(); }
  return out;
}

/** Where two per-step runs first differ (an index), or -1: the same steps, scenes and hashes. */
export function firstDifference(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i]?.step !== b[i]?.step || a[i]?.scene !== b[i]?.scene || a[i]?.hash !== b[i]?.hash) return i;
  return -1;
}
