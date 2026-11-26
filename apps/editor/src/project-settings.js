// The project's settings (M6 W3, AB-T-0646): the game's title, id and version, its entry scene and the scenes it can
// reach, the input map with rebinding, and the physics layers. What game.json holds, edited without typing JSON.
//
// Every edit is one undo step of its own history (the scene's history is the session's; this is the project's), and
// is written to disk at once: game.json, and the input map's own file when game.json names one (`"input": "input.json"`).
// A write that fails puts the settings back as they were before the edit and says why, so what the panel shows is
// what is on disk. Undo and Redo write too. Each edit is checked as an export would check it (@vrmxg/bundle's
// checkGame), so the panel can't save a game.json the export then refuses.
//
// Rebinding uses @vrmxg/game-ui's plan (the same rows, conflicts and moves the game's own settings menu has) and
// @vrmxg/input's checks; here the result is the game's map itself, not a player's overrides.
import { checkGame, GAME_FILE, MAX_LAYERS } from '@vrmxg/bundle';
import { DEFAULT_ACTIONS, checkBinding } from '@vrmxg/input';
import { rebindRows, rebindPlan, describeBinding } from '@vrmxg/game-ui';

/** How the editor writes game.json (and an input map's file): the sample's and the templates' form. */
export const writeJson = (doc) => `${JSON.stringify(doc, null, 1)}\n`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sceneFile = (f) => f.endsWith('.vrmxs') && !f.startsWith('prefabs/') && !f.startsWith('sequences/');

/** A game.json for a project that has none: its first scene as the entry, the engine's default controls. */
export function startingGame({ name = 'game', scenes = [] } = {}) {
  const entry = scenes.find(sceneFile) ?? 'main.vrmxs';
  const id = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'game';
  return { format: 'vrmxg-game', version: 1, id, title: String(name).trim() || id, entry, scenes: [entry], input: { actions: structuredClone(DEFAULT_ACTIONS) } };
}

export class ProjectSettings {
  /**
   * @param {{ game: any | null, input?: any | null, files: string[], name?: string,
   *   write: (ref: string, text: string) => Promise<any>, onChange?: () => void }} o
   *   game: game.json as parsed (null: the project has none; the first edit writes one); input: the input map's own
   *   file as parsed, when game.json names one; files: the project's files (the scenes come from these)
   */
  constructor({ game, input = null, files, name = 'game', write, onChange = () => {} }) {
    this.state = { game: game ? structuredClone(game) : null, input: input ? structuredClone(input) : null };
    this.files = files; this.name = name; this.write = write; this.onChange = onChange;
    this.undoStack = []; this.redoStack = [];
    this.error = ''; // why the last edit didn't happen (refused, or its write failed)
    this._queue = Promise.resolve();
  }

  /** Read a project's settings through its Project (project.js). */
  static async load(project, o = {}) {
    let game = null, input = null, error = '';
    if (project.has(GAME_FILE)) {
      try { game = JSON.parse(await project.text(GAME_FILE)); } catch (e) { error = `${GAME_FILE} isn't JSON (${e.message}): fix it in a text editor, or every edit here starts it again`; }
      if (game && typeof game.input === 'string' && project.has(game.input)) input = JSON.parse(await project.text(game.input));
    }
    const s = new ProjectSettings({ game, input, files: project.files, name: project.name, write: (ref, text) => project.write(ref, text), ...o });
    s.error = error;
    return s;
  }

  get game() { return this.state.game; }
  /** The action map as edited: game.json's inline one, its file's, or the engine's default when it names none. */
  get actions() {
    const g = this.state.game;
    if (typeof g?.input === 'string') return this.state.input?.actions ?? {};
    return g?.input?.actions ?? DEFAULT_ACTIONS;
  }

  // ---------------------------------------------------------------- history

  history() { return { undo: this.undoStack.at(-1)?.label ?? null, redo: this.redoStack.at(-1)?.label ?? null }; }

  /**
   * One edit: `fn` changes a copy of the settings ({ game, input }); the result is checked, written and made one undo
   * step. Nothing changed: no step. Refused or failed: the settings stay as they were, `error` says why, and it throws.
   * @param {string} label @param {(draft: { game: any, input: any }) => void} fn
   */
  edit(label, fn) {
    return this._serial(async () => {
      const before = structuredClone(this.state);
      const draft = structuredClone(this.state);
      if (!draft.game) draft.game = startingGame({ name: this.name, scenes: this.files });
      fn(draft);
      if (same(draft, before)) return false;
      this._check(draft);
      await this._commit(before, draft);
      this.undoStack.push({ label, before, after: structuredClone(draft) });
      this.redoStack = [];
      return true;
    });
  }

  undo() { return this._serial(async () => this._travel(this.undoStack, this.redoStack, 'before')); }
  redo() { return this._serial(async () => this._travel(this.redoStack, this.undoStack, 'after')); }

  async _travel(from, to, side) {
    const step = from.at(-1);
    if (!step) return false;
    await this._commit(structuredClone(this.state), structuredClone(step[side]));
    to.push(from.pop());
    return true;
  }

  _serial(fn) {
    const run = this._queue.then(async () => {
      try { const r = await fn(); this.error = ''; return r; } catch (e) { this.error = String(e?.message ?? e); throw e; } finally { this.onChange(); }
    });
    this._queue = run.catch(() => {});
    return run;
  }

  _check(draft) {
    checkGame(draft.game); // what the export would refuse, refused now (an id with capitals, a scene that isn't one, …)
    for (const [name, a] of Object.entries(typeof draft.game.input === 'string' ? draft.input?.actions ?? {} : draft.game.input?.actions ?? {})) {
      if (a.type !== 'axis' && a.type !== 'button') throw new Error(`the action "${name}" is an axis or a button`);
      a.bindings.forEach((b, i) => { const why = checkBinding(a.type, b); if (why) throw new Error(`"${name}" binding ${i + 1}: ${why}`); });
    }
  }

  /** Write what changed (the input map's file first, then game.json); on a failure, the settings as they were. */
  async _commit(before, after) {
    this.state = after;
    try {
      const ref = typeof after.game?.input === 'string' ? after.game.input : null;
      if (ref && !same(before.input, after.input)) await this.write(ref, writeJson(after.input));
      if (!same(before.game, after.game)) await this.write(GAME_FILE, writeJson(after.game));
      if (!this.files.includes(GAME_FILE)) this.files = [...this.files, GAME_FILE].sort();
    } catch (e) {
      this.state = before;
      throw new Error(`not saved: ${e?.message ?? e}`);
    }
  }

  // ---------------------------------------------------------------- edits (each one undo step)

  setTitle(title) {
    const t = String(title ?? '').trim();
    return this.edit(`Title ${t}`, (d) => { if (!t) throw new Error('a game needs a title'); d.game.title = t; });
  }
  setId(id) { return this.edit(`Id ${id}`, (d) => { d.game.id = String(id ?? '').trim(); }); }
  setRelease(v) { return this.edit(v ? `Version ${v}` : 'No version', (d) => { if (v) d.game.release = String(v).trim(); else delete d.game.release; }); }
  setEntry(ref) {
    return this.edit(`Entry scene ${ref}`, (d) => {
      d.game.entry = ref;
      if (!(d.game.scenes ?? []).includes(ref)) d.game.scenes = [...(d.game.scenes ?? []), ref].sort();
    });
  }
  /** A scene in the game (reachable by a scene change) or out of it; the entry is always in. */
  setScene(ref, included) {
    return this.edit(`${included ? 'Add' : 'Remove'} scene ${ref}`, (d) => {
      if (!included && ref === d.game.entry) throw new Error(`${ref} is the entry scene: choose another entry first`);
      const list = new Set(d.game.scenes ?? [d.game.entry]);
      if (included) list.add(ref); else list.delete(ref);
      d.game.scenes = [...list].sort();
    });
  }

  /** The map being edited inside a draft (made inline from the engine's default the first time). */
  _map(d) {
    if (typeof d.game.input === 'string') { d.input ??= { actions: {} }; d.input.actions ??= {}; return d.input.actions; }
    if (!d.game.input?.actions) d.game.input = { actions: structuredClone(DEFAULT_ACTIONS) };
    return d.game.input.actions;
  }

  /**
   * What binding one slot of a row to `binding` would change, and where that key or button works now (to confirm before
   * moving it): @vrmxg/game-ui's rebindPlan over the game's map.
   * @param {string} rowId a row of view().rows @param {'keyboard' | 'gamepad'} slot @param {any} binding { key } or { gamepadButton }
   */
  planRebind(rowId, slot, binding) {
    const row = rebindRows(this.actions).find((r) => r.id === rowId);
    if (!row) throw new Error(`no control "${rowId}"`);
    return { row, ...rebindPlan(this.actions, row, slot, binding) };
  }
  /** Bind one slot (a plan's changes: the slot, and the key moved out of anywhere else it was), one undo step. */
  rebind(rowId, slot, binding) {
    const { row, changes } = this.planRebind(rowId, slot, binding);
    return this.edit(`${row.label}: ${describeBinding(binding)}`, (d) => { const m = this._map(d); for (const [n, b] of Object.entries(changes)) m[n].bindings = b; });
  }
  /** Clear one slot of a row (its bindings of that kind, in that direction). */
  unbind(rowId, slot) {
    const row = rebindRows(this.actions).find((r) => r.id === rowId);
    const kind = slot === 'keyboard' ? (b) => b.key !== undefined || b.mouseButton !== undefined : (b) => b.gamepadButton !== undefined;
    const dir = (b) => row.type === 'button' || ((b.value ?? 1) < 0 ? -1 : 1) === row.direction;
    return this.edit(`${row?.label ?? rowId}: no ${slot === 'keyboard' ? 'key' : 'button'}`, (d) => { if (!row) throw new Error(`no control "${rowId}"`); const a = this._map(d)[row.action]; a.bindings = a.bindings.filter((b) => !(kind(b) && dir(b))); });
  }
  resetControls() { return this.edit('Default controls', (d) => { const m = this._map(d); for (const k of Object.keys(m)) delete m[k]; Object.assign(m, structuredClone(DEFAULT_ACTIONS)); }); }
  /** A game's own action (a button "serve", an axis "steer"), with nothing bound yet. */
  addAction(name, type = 'button') {
    return this.edit(`Add action ${name}`, (d) => {
      const n = String(name ?? '').trim();
      if (!/^[A-Za-z_][A-Za-z0-9_.]{0,47}$/.test(n)) throw new Error(`an action's name is letters, digits, _ and . ("${n}")`);
      const m = this._map(d);
      if (Object.hasOwn(m, n)) throw new Error(`the game has an action "${n}" already`);
      if (type !== 'axis' && type !== 'button') throw new Error('an action is an axis or a button');
      m[n] = { type, bindings: [] };
    });
  }
  removeAction(name) { return this.edit(`Remove action ${name}`, (d) => { delete this._map(d)[name]; }); }

  /** The layers' names, in order (a collider with none is on the first). Renames carry through `collides`. */
  setLayers(names) {
    return this.edit('Physics layers', (d) => {
      const next = (names ?? []).map((n) => String(n ?? '').trim());
      if (!next.length) { delete d.game.physics; return; }
      if (next.length > MAX_LAYERS) throw new Error(`at most ${MAX_LAYERS} layers`);
      const old = d.game.physics?.layers ?? [];
      const renamed = new Map(old.map((n, i) => [n, old.length === next.length ? next[i] : (next.includes(n) ? n : null)]));
      const collides = {};
      for (const [k, list] of Object.entries(d.game.physics?.collides ?? {})) {
        const nk = renamed.get(k);
        if (nk) collides[nk] = list.map((x) => renamed.get(x)).filter((x) => x && next.includes(x));
        if (nk && collides[nk].length === next.length) delete collides[nk]; // with every layer: as physics reads none
      }
      d.game.physics = { layers: next, ...(Object.keys(collides).length ? { collides } : {}) };
    });
  }
  /**
   * Whether two layers collide, both ways (Rapier pairs two colliders only when each lists the other). A layer that
   * collides with every layer is left out of `collides`, as @vrmxg/physics reads it.
   */
  setCollides(a, b, on) {
    return this.edit(`${a} ${on ? 'collides with' : 'passes through'} ${b}`, (d) => {
      const p = d.game.physics;
      if (!p?.layers?.includes(a) || !p.layers.includes(b)) throw new Error(`${a} and ${b} must both be layers`);
      const all = p.layers;
      const list = (n) => new Set(p.collides?.[n] ?? all);
      const la = list(a), lb = list(b);
      if (on) { la.add(b); lb.add(a); } else { la.delete(b); lb.delete(a); }
      const collides = { ...(p.collides ?? {}), [a]: all.filter((x) => la.has(x)), [b]: all.filter((x) => lb.has(x)) };
      for (const n of Object.keys(collides)) if (collides[n].length === all.length) delete collides[n];
      if (Object.keys(collides).length) p.collides = collides; else delete p.collides;
    });
  }

  // ---------------------------------------------------------------- what the panel draws

  /** The settings as plain data for the panel. */
  view() {
    const g = this.state.game, actions = this.actions;
    const scenes = this.files.filter(sceneFile).sort();
    const layers = g?.physics?.layers ?? [];
    const collides = (x, y) => (g?.physics?.collides?.[x] ?? layers).includes(y);
    return {
      exists: !!g, file: GAME_FILE, error: this.error,
      title: g?.title ?? '', id: g?.id ?? '', release: g?.release ?? '',
      entry: g?.entry ?? '', scenes: scenes.map((ref) => ({ ref, included: !!g && (ref === g.entry || (g.scenes ?? []).includes(ref)), entry: ref === g?.entry })),
      inputFile: typeof g?.input === 'string' ? g.input : null, defaultControls: !g?.input,
      actions: Object.entries(actions).map(([name, a]) => ({ name, type: a.type, bindings: a.bindings.length })),
      rows: rebindRows(actions),
      layers, matrix: layers.map((x) => ({ layer: x, with: layers.map((y) => ({ layer: y, on: collides(x, y) && collides(y, x) })) })),
      history: this.history(),
    };
  }
}
