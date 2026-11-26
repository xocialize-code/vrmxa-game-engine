// Hot reload of a project's behaviours in the editor's play in place (M6 W2, AB-T-0645; AB-D-0297 item 5). The editor's
// only: an exported build never watches or reloads anything (the game app has no import of this file, and the shell's
// project.watch exists only in an app that asks for it; a test checks both).
//
// While the editor plays, the shell watches the project's behaviours module and every module it imports relatively
// (project.watch, shell 0.15.0). When one changes, the module graph is imported again through Export Game's fresh path
// (export-game.js freshImporter: the bytes as they are now, linked by blob: URLs, so no module cache hands back an older
// copy; a graph with an import cycle can't be linked that way and the reload says so), its declarations go into the play
// world's registry and the editor's, and every behaviour the module provides is swapped for its new class on its node,
// on a step boundary, without restarting the scene:
//   - a behaviour keeps its state (the old instance's getState, handed to the new one's setState after its ready) when
//     the state shape it declares is unchanged, compared only by `stateShape` (@vrmxg/registry, M6 W0). A behaviour that
//     declares none on either side (or one that allows anything, `true` or `{}`, as W5's fingerprint counts it) keeps
//     it only when its class's source text is unchanged too: nothing says what its state is, so changed code starts
//     afresh, as the fingerprint counts such a behaviour by its code;
//   - otherwise it restarts on that node: a new instance, its ready(), its own fresh state.
// Either way the new instance's ready() runs (it sets up what the behaviour listens to and the timers it keeps), and the
// code listeners, timers and tweens the old instance made in its own ready() go (core's `readying`, `dropListenersOf`,
// `timers.cancelMadeBy`); a kept behaviour's timers start again from its new ready(). What a behaviour sets up anywhere
// else (its constructor, a step, a signal) isn't known to be its own and stays, running the old code: a limit of
// in-place reload (the editor's README says so). A failed swap cancels what the new instances made and gives the timer
// ids back, so the world's state is as it was.
//
// A reload that throws (the module won't import, its declarations are refused, a new ready() or setState throws) keeps
// the old code running, as it was, and shows the error in a field of its own (the host's `behaviourError`, AB-T-0654
// item 5). A session recorded across a reload is marked (its input recording's `reloaded`), and the input service
// refuses to replay a marked recording, so it is never used as a replay fixture.
import { declareProjectBehaviours } from '@vrmxg/registry';
import { moduleGraph, declaredShape as compatShape } from '@vrmxg/bundle';
import { freshImporter } from './export-game.js';

/**
 * A fresh import of a project's behaviours module, through Export Game's path (freshImporter): its classes and the text
 * of the module graph they came from.
 * @param {{ bytes: (ref: string) => Promise<Uint8Array> }} project
 * @param {{ url?: (ref: string, source: string) => string }} [o] url: as freshImporter's (tests: a file)
 * @returns {(ref: string) => Promise<{ classes: Map<string, any>, sources: Map<string, string> }>}
 */
export function freshBehaviours(project, { url } = {}) {
  return async (ref) => {
    let sources = new Map();
    const mod = await freshImporter(project, { ...(url ? { url } : {}), onGraph: (s) => { sources = s; } })(ref);
    return { classes: behaviourClasses(mod), sources };
  };
}

/**
 * The text of a module and every module it imports relatively, read now without importing anything (null when it can't
 * be read as a module graph: hot reload then has nothing to compare or watch).
 * @param {{ bytes: (ref: string) => Promise<Uint8Array> }} project @param {string} ref
 * @returns {Promise<Map<string, string> | null>}
 */
export async function moduleSources(project, ref) {
  try { return await moduleGraph({ top: ref, read: (r) => project.bytes(r) }); } catch { return null; }
}

/**
 * The behaviour classes a module provides, under the names scenes use (what project.js keeps of a module).
 * @param {Record<string, any>} mod @returns {Map<string, any>}
 */
export function behaviourClasses(mod) {
  return new Map(Object.entries(mod).filter(([, v]) => typeof v === 'function' && typeof v.prototype?.getState === 'function'));
}

/**
 * The state shape a behaviour declares, by `stateShape` only, read as W5's save fingerprint reads it (@vrmxg/bundle's
 * `declaredShape`: a state of `true` or `{}` allows anything, so it declares nothing): its class's own describe, else the
 * engine's declaration of that name (the sample's wander is the engine's behaviour, implemented in the project), else
 * none (null).
 * @param {string} name @param {any} Cls @param {any} registry @returns {string | null}
 */
export function reloadShape(name, Cls, registry) {
  if (Cls && Object.hasOwn(Cls, 'describe')) return compatShape(Cls.describe);
  const entry = registry?.behaviours?.get(name);
  return entry?.source === 'engine' ? compatShape(entry) : null;
}

/**
 * What a reload does with each behaviour the module provided or provides now: keep (its state goes to the new class),
 * restart (the new class starts afresh on the node), add (a name it didn't provide before), remove (one it no longer
 * provides: the nodes that use it keep the data and run nothing, as a world built without it would).
 * @param {{ before: Map<string, any>, after: Map<string, any>, registry: any }} o before/after: the module's classes
 * @returns {Map<string, { action: 'keep' | 'restart' | 'add' | 'remove', why: string }>}
 */
export function reloadPlan({ before, after, registry }) {
  const out = new Map();
  for (const [name, Old] of before) {
    const New = after.get(name);
    if (!New) { out.set(name, { action: 'remove', why: 'the module no longer exports it' }); continue; }
    const a = reloadShape(name, Old, registry), b = reloadShape(name, New, registry);
    if (a !== null || b !== null) {
      out.set(name, a === b ? { action: 'keep', why: 'its declared state shape is unchanged' } : { action: 'restart', why: a === null || b === null ? 'it declares a state shape on one side only' : 'its declared state shape changed' });
    } else {
      out.set(name, String(Old) === String(New) ? { action: 'keep', why: 'it declares no state shape, and its code is unchanged' } : { action: 'restart', why: 'it declares no state shape, and its code changed' });
    }
  }
  for (const name of after.keys()) if (!before.has(name)) out.set(name, { action: 'add', why: 'the module exports it now' });
  return out;
}

/**
 * Swap a running tree's behaviours for the module's new classes (reloadPlan's verdicts), all or nothing: a new ready()
 * or setState that throws puts every node's old instances back, with their listeners, and the error goes on. Run it
 * between two steps. Only the names in `plan` whose running class is the module's old one (or a bare subclass of it,
 * the editor's stand-in when declarations were refused) are touched: an engine class installed under a name wins in a
 * world, and stays.
 * @param {any} tree a SceneTree @param {Map<string, any>} before the module's old classes @param {Map<string, any>} after
 * @param {Map<string, { action: string }>} plan
 * @returns {{ kept: string[], restarted: string[], added: string[], removed: string[], instances: number }} the names
 *   whose instances were kept, restarted, added or removed in this tree, and how many instances were made
 */
export function swapBehaviours(tree, before, after, plan) {
  const ours = (name) => {
    const running = tree.behaviourClasses.get(name), old = before.get(name);
    if (!running) return !old; // a name the module adds: nothing runs it yet
    return running === old || (!!old && Object.getPrototypeOf(running) === old);
  };
  const touched = new Map([...plan].filter(([name]) => ours(name)));
  const undo = [], made = [], gone = [], nextId = tree.timers.nextId;
  const did = { kept: new Set(), restarted: new Set(), added: new Set(), removed: new Set() };
  try {
    for (const node of tree.all()) {
      if (!node.behaviourEntries.some((e) => touched.has(e.use))) continue;
      const byEntry = new Map(node.behaviours.map((b) => [b.params, b])); // a live behaviour's params are its entry
      const next = [];
      for (const entry of node.behaviourEntries) {
        const was = byEntry.get(entry) ?? null, p = touched.get(entry.use);
        if (!p) { if (was) next.push(was); continue; }
        if (was) gone.push(was);
        if (p.action === 'remove') { if (was) did.removed.add(entry.use); continue; }
        const b = new (after.get(entry.use))(node, entry);
        next.push(b);
        const keep = p.action === 'keep' && !!was;
        made.push({ b, state: keep ? structuredClone(was.getState()) : null });
        did[keep ? 'kept' : was ? 'restarted' : 'added'].add(entry.use);
      }
      undo.push({ node, behaviours: node.behaviours });
      node.behaviours = next;
    }
    for (const m of made) { tree.readyBehaviour(m.b); if (m.state !== null && m.state !== undefined) m.b.setState(m.state); }
  } catch (e) {
    for (const m of made) { tree.dropListenersOf(m.b); tree.timers.cancelMadeBy(m.b); }
    tree.timers.nextId = nextId; // the ids a failed swap took are free again: the state is as it was
    for (const u of undo) u.node.behaviours = u.behaviours;
    tree._order = null;
    throw e;
  }
  for (const b of gone) { tree.dropListenersOf(b); tree.timers.cancelMadeBy(b); } // what the old code set up in its ready() goes with it
  for (const [name, p] of touched) { if (p.action === 'remove') tree.behaviourClasses.delete(name); else tree.behaviourClasses.set(name, after.get(name)); }
  tree._order = null; // which nodes have step work may have changed
  const sorted = (s) => [...s].sort();
  return { kept: sorted(did.kept), restarted: sorted(did.restarted), added: sorted(did.added), removed: sorted(did.removed), instances: made.length };
}

/** A take (the last play, a take file, a bare recording as `{ input }`) recorded across a hot reload: its input says so. */
export const reloadedTake = (t) => (t?.input?.reloaded?.length ?? 0) > 0;

/**
 * Refuse to replay a take recorded across a hot reload (exported as video, baked into a sequence, replayed as a fixture):
 * code that changed part-way through wouldn't play it again as it was.
 * @param {any} take @param {string} id 'play' (the last play) or the take file's ref
 */
export function assertReplayable(take, id) {
  if (!reloadedTake(take)) return;
  const what = id === 'play' ? 'the last play reloaded the project\'s behaviours while it ran' : `${id} was recorded across a hot reload of the project's behaviours`;
  throw Object.assign(new Error(`${what}, so it can't be replayed exactly: play it again without reloading`), { code: 'reloaded' });
}

/**
 * Mark a play world's input recording as made across a reload (it is then never replayed: the input service refuses it).
 * @param {any} world @param {any} entry what the reload did, with the step it happened on
 */
export function markRecording(world, entry) {
  const rec = world?.input?.recording;
  if (!rec) return;
  (rec.reloaded ??= []).push(entry);
}

/**
 * One reload, from the module's new text to the swapped tree, or nothing changed and the error thrown. Declarations go
 * into each registry in turn (all or nothing each); a later failure puts the earlier ones back.
 * @param {{ tree: any, before: Map<string, any>, after: Map<string, any>, registries: any[] }} o registries: the play
 *   world's (connections and actions) and the editor's (validation, the inspector)
 */
export function applyReload({ tree, before, after, registries }) {
  const declared = [];
  try {
    for (const r of registries) { declareProjectBehaviours(r, after); declared.push(r); }
    const plan = reloadPlan({ before, after, registry: registries[0] });
    return { plan, ...swapBehaviours(tree, before, after, plan) };
  } catch (e) {
    for (const r of declared) { try { declareProjectBehaviours(r, before); } catch { r.project(new Map()); } }
    throw e;
  }
}

/**
 * The editor's watcher while it plays: watches the module graph through the shell, reloads on a change (one at a time,
 * a change during a reload makes one more), applies it to the play world and says what happened.
 *
 * @param {object} o
 * @param {string} o.ref the project's behaviours module
 * @param {Map<string, any>} o.classes the classes the play world runs now (the module's)
 * @param {Map<string, string> | null} o.sources the module graph's text they came from (null: not known; the first
 *   change then reloads whatever it reads)
 * @param {(ref: string) => Promise<{ classes: Map<string, any>, sources: Map<string, string> }>} o.load a fresh import
 * @param {(paths: string[]) => Promise<void>} o.watch watch these project paths (replacing what was watched)
 * @param {() => Promise<void>} o.unwatch
 * @param {(fn: (paths: string[]) => void) => () => void} o.onChanged hear the shell's project.changed
 * @param {() => { tree: any, registries: any[], world: any } | null} o.target the play world now (null once stopped)
 * @param {(r: any) => void} o.report a reload's result ({ ok, step, kept, restarted, … } or { ok: false, error })
 * @param {number} [o.settle] ms to wait after a change for more (an editor writes a file in more than one go)
 * @param {(() => Promise<Map<string, string> | null>) | null} [o.read] the graph's text now, without importing it: once
 *   the watch is up, a change saved before it was (while Play built its world) is reloaded at once
 */
export class HotReload {
  constructor({ ref, classes, sources, load, watch, unwatch, onChanged, target, report, settle = 120, read = null }) {
    Object.assign(this, { ref, classes, sources, load, watch, unwatch, target, report, settle, read });
    this.count = 0; this.running = null; this.again = false; this.stopped = false; this.timer = null;
    /** The last reload failed, and the running code isn't what is on disk. */ this.failed = false;
    this.off = onChanged((paths) => this.changed(paths));
  }

  /** Start watching: the module and what it imports (read now, when the sources aren't known). */
  async start() {
    if (!this.sources) {
      try { this.sources = (await this.load(this.ref)).sources; } catch { this.sources = new Map([[this.ref, '']]); }
    }
    if (this.stopped) return []; // Play stopped while the module was read: nothing to watch
    await this.watch([...this.sources.keys()]);
    if (this.stopped) { try { await this.unwatch(); } catch { /* gone already */ } return []; }
    // the shell compares with the files as they were when the watch began: an edit saved between the module's read and
    // that moment would never be heard, so compare once now (the reload runs on; `running` settles when it is done)
    const now = this.read ? await this.read() : null;
    if (now && !sameSources(now, this.sources) && !this.stopped) this.reload();
    return [...this.sources.keys()];
  }

  changed(paths) {
    if (this.stopped || !paths.some((p) => this.sources?.has(p))) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.reload(), this.settle);
  }

  /** Reload now (a change was heard). Resolves once this reload and any it queued are done. */
  async reload() {
    if (this.running) { this.again = true; return this.running; }
    this.running = (async () => {
      do { this.again = false; await this.once(); } while (this.again && !this.stopped);
    })().finally(() => { this.running = null; });
    return this.running;
  }

  async once() {
    let loaded;
    try { loaded = await this.load(this.ref); } catch (e) {
      if (!this.stopped) { this.failed = true; this.report({ ok: false, error: message(e), step: this.target()?.tree.clock.step ?? null }); }
      return;
    }
    if (this.stopped) return;
    // what is watched follows the graph (an import added or taken out), whether or not the reload takes
    if (!sameKeys(this.sources, loaded.sources)) { try { await this.watch([...loaded.sources.keys()]); } catch { /* the old paths stay watched */ } }
    // `sources` is always the text the running code came from: the same text again (a save with no edit, or an edit that
    // failed put back) reloads nothing and marks nothing, but after a failure it says the error is over
    if (sameSources(this.sources, loaded.sources)) {
      if (this.failed) { this.failed = false; this.report({ ok: true, unchanged: true, n: this.count, step: this.target()?.tree.clock.step ?? null }); }
      return;
    }
    const t = this.target();
    if (!t) return;
    const step = t.tree.clock.step;
    let r;
    try { r = applyReload({ tree: t.tree, before: this.classes, after: loaded.classes, registries: t.registries }); } catch (e) {
      this.failed = true;
      this.report({ ok: false, error: message(e), step });
      return;
    }
    this.failed = false;
    this.classes = loaded.classes; this.sources = loaded.sources; this.count++;
    const entry = { step, kept: r.kept, restarted: r.restarted, added: r.added, removed: r.removed };
    markRecording(t.world, entry);
    this.report({ ok: true, n: this.count, ...entry, instances: r.instances, plan: Object.fromEntries(r.plan), classes: loaded.classes });
  }

  /** Stop watching (Play stopped). */
  async stop() {
    this.stopped = true; clearTimeout(this.timer); this.off?.();
    try { await this.unwatch(); } catch { /* the shell has let go already */ }
  }
}

const message = (e) => String(e?.message ?? e);
/** Two module graphs' text, the same file for file. */
export const sameSources = (a, b) => !!a && !!b && sameKeys(a, b) && [...b].every(([k, v]) => a.get(k) === v);
const sameKeys = (a, b) => !!a && a.size === b.size && [...b.keys()].every((k) => a.has(k));
