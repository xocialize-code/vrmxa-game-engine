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
import { checkGame, GAME_FILE, MAX_LAYERS, layersUsed, gameLayers } from '@vrmxg/bundle';
import { DEFAULT_ACTIONS, checkBinding } from '@vrmxg/input';
import { rebindRows, rebindPlan, describeBinding } from '@vrmxg/game-ui';

/** How the editor writes game.json (and an input map's file): the sample's and the templates' form. */
export const writeJson = (doc) => `${JSON.stringify(doc, null, 1)}\n`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sceneFile = (f) => f.endsWith('.vrmxs') && !f.startsWith('prefabs/') && !f.startsWith('sequences/');
// a module a game can name as its behaviours (M6 W10): a project's .js files, not the editor's or a build's own
const scriptFile = (f) => f.endsWith('.js') && !f.startsWith('tools/') && !f.startsWith('node_modules/') && !f.includes('/.');

/** A game.json for a project that has none: its first scene as the entry, the engine's default controls. */
export function startingGame({ name = 'game', scenes = [] } = {}) {
  const entry = scenes.find(sceneFile) ?? 'main.vrmxs';
  const id = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'game';
  return { format: 'vrmxg-game', version: 1, id, title: String(name).trim() || id, entry, scenes: [entry], input: { actions: structuredClone(DEFAULT_ACTIONS) } };
}

export class ProjectSettings {
  /**
   * @param {{ game: any | null, input?: any | null, files: string[], name?: string,
   *   write: (ref: string, text: string) => Promise<any>, onChange?: () => void,
   *   layerUses?: () => Promise<{ ref: string, node: string, layer: string }[]>, source?: any, seen?: { game: string | null, input: string | null } }} o
   *   game: game.json as parsed (null: the project has none; the first edit writes one); input: the input map's own
   *   file as parsed, when game.json names one; files: the project's files (the scenes come from these)
   */
  constructor({ game, input = null, files, name = 'game', write, onChange = () => {}, layerUses = async () => [], source = null, seen = null }) {
    this.state = { game: game ? structuredClone(game) : null, input: input ? structuredClone(input) : null };
    /**
     * The project to read again before each change (review of PR #52): its file list (a scene saved since), and
     * game.json and the input map's file, in case something else (MCP, a text editor) changed them. Null: none.
     * @type {{ files: string[], has: (ref: string) => boolean, text: (ref: string) => Promise<string> } | null}
     */
    this.source = source;
    /** The text of game.json and the input map's file as last read or written here: what "changed on disk" is measured against. */
    this.seen = seen ?? { game: null, input: null };
    /** Said when the files changed on disk and were read again (the undo history starts again there). */
    this.note = '';
    this.files = files; this.name = name; this.write = write; this.onChange = onChange;
    /** Where the project's scenes name collision layers now: [{ ref, node, layer }] (projectLayerUses). */
    this.layerUses = layerUses;
    this.undoStack = []; this.redoStack = [];
    this.error = ''; // why the last edit didn't happen (refused, or its write failed)
    this._queue = Promise.resolve();
  }

  /** Read a project's settings through its Project (project.js). */
  static async load(project, o = {}) {
    const r = await readSettings(project);
    const s = new ProjectSettings({ game: r.game, input: r.input, files: project.files, name: project.name, write: (ref, text) => project.write(ref, text), source: project, seen: r.seen, ...o });
    s.error = r.error;
    return s;
  }

  /**
   * Catch up with the project before a change, and when the panel opens again (review of PR #52): its file list now
   * (Project.write replaces the array, so a scene saved since appears), and game.json and the input map's file as they
   * are on disk. When either changed since this panel last read or wrote it (MCP's game tool, a text editor), the
   * settings are read again and the undo history starts there, so no step of it writes the other edit away.
   * → true when they were read again.
   */
  async refresh() {
    const src = this.source;
    if (!src) return false;
    this.files = src.files;
    const r = await readSettings(src);
    if (r.seen.game === this.seen.game && r.seen.input === this.seen.input) return false;
    if (r.error) throw new Error(r.error);
    this.state = { game: r.game, input: r.input };
    this.seen = r.seen;
    this.undoStack = []; this.redoStack = [];
    this.note = `${GAME_FILE} changed on disk: read again, and the undo history starts here`;
    return true;
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
   * step. Nothing changed: no step and no write (a project without a game.json gets none from an edit that changes
   * nothing). Refused or failed: the settings stay as they were, `error` says why, and it throws.
   * @param {string} label @param {(draft: { game: any, input: any }) => void | Promise<void>} fn
   */
  edit(label, fn) {
    return this._serial(async () => {
      await this.refresh();
      const before = structuredClone(this.state);
      const draft = structuredClone(this.state);
      if (!draft.game) draft.game = startingGame({ name: this.name, scenes: this.files });
      const start = structuredClone(draft);
      await fn(draft);
      if (same(draft, start)) return false;
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
    if (await this.refresh()) return false; // changed on disk: nothing of the old history is undone over it
    const step = from.at(-1);
    if (!step) return false;
    // an undo or redo can drop a layer as an edit can: a node put on it since keeps it (review of PR #52)
    await this._keepUsedLayers(this.state.game, step[side].game);
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

  /**
   * Write what changed: the input map's own file, then game.json. On a failure the settings go back as they were, and
   * a file this commit already wrote is written back as it was (review of PR #52), so the disk and the panel agree.
   */
  async _commit(before, after) {
    this.state = after;
    const ref = typeof after.game?.input === 'string' ? after.game.input : null;
    const writes = [];
    if (ref && !same(before.input, after.input)) writes.push([ref, writeJson(after.input), before.input ? writeJson(before.input) : null]);
    if (!same(before.game, after.game)) writes.push([GAME_FILE, writeJson(after.game), before.game ? writeJson(before.game) : null]);
    const done = [];
    try {
      for (const [file, text, old] of writes) {
        await this.write(file, text); done.push([file, old]);
        if (file === GAME_FILE) this.seen.game = text; else this.seen.input = text;
      }
      if (!this.files.includes(GAME_FILE)) this.files = [...this.files, GAME_FILE].sort();
    } catch (e) {
      this.state = before;
      let restored = true;
      for (const [file, old] of done.reverse()) {
        try { if (old !== null) { await this.write(file, old); if (file === GAME_FILE) this.seen.game = old; else this.seen.input = old; } } catch { restored = false; }
      }
      throw new Error(`not saved: ${e?.message ?? e}${restored ? '' : ` (and ${done.map(([f]) => f).join(', ')} couldn't be put back: check it in a text editor)`}`);
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

  /**
   * The game's behaviours module (M6 W10): a .js file of the project, whose classes the scenes' behaviours name (and
   * which play in place runs and an export ships), or none (undefined: the key leaves game.json).
   */
  setBehaviours(ref) {
    return this.edit(ref ? `Behaviours ${ref}` : 'No behaviours module', (d) => {
      if (ref && !scriptFile(ref)) throw new Error(`${ref} isn't a behaviours module: a .js file of the project`);
      if (ref) d.game.behaviours = ref; else delete d.game.behaviours;
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

  /**
   * The layers' names, in order (a node with none is on the first). Only `renames` ({ old: new }) renames a layer, and
   * carries it through `collides`; any other name is the same layer moved, or a new one (a move used to be read as
   * renames when the list kept its length, and swapped the layers' rules: review of PR #52). A layer a scene's node
   * is on (`layerUses`) can't be renamed or removed: every world with that node would stop being built.
   * @param {string[]} names @param {{ label?: string, renames?: Record<string, string> }} [o]
   */
  setLayers(names, { label = 'Physics layers', renames = {} } = {}) {
    return this.edit(label, async (d) => {
      const next = (names ?? []).map((n) => String(n ?? '').trim());
      if (next.length > MAX_LAYERS) throw new Error(`at most ${MAX_LAYERS} layers`);
      const old = d.game.physics?.layers ?? [];
      const to = (n) => (Object.hasOwn(renames, n) ? renames[n] : n);
      await this._keepUsedLayers(d.game, { physics: next.length ? { layers: next } : undefined });
      if (!next.length) { delete d.game.physics; return; }
      const collides = {};
      for (const [k, list] of Object.entries(d.game.physics?.collides ?? {})) {
        const nk = to(k);
        if (!next.includes(nk)) continue;
        collides[nk] = next.filter((x) => list.map(to).includes(x));
        if (collides[nk].length === next.length) delete collides[nk]; // with every layer: as physics reads none
      }
      // a layer new to the list collides with everything, as a layer missing from collides does; one a list leaves
      // out is added to it, so the matrix stays symmetric
      for (const n of next) if (!old.map(to).includes(n)) for (const k of Object.keys(collides)) collides[k] = next.filter((x) => collides[k].includes(x) || x === n);
      for (const k of Object.keys(collides)) if (collides[k].length === next.length) delete collides[k];
      d.game.physics = { layers: next, ...(Object.keys(collides).length ? { collides } : {}) };
    });
  }
  /**
   * Refuse a change that leaves out a layer a scene's node is on: every world with that node would stop being built. A
   * rename doesn't reach into the scenes (their nodes keep the old name, so the old name must stay); a node already on a
   * layer the game doesn't have is the editor's warning to fix, and doesn't block this change.
   */
  async _keepUsedLayers(fromGame, toGame) {
    const known = new Set(gameLayers(fromGame)), have = new Set(gameLayers(toGame));
    const lost = (await this.layerUses()).filter((u) => known.has(u.layer) && !have.has(u.layer));
    if (!lost.length) return;
    const byLayer = [...new Set(lost.map((u) => u.layer))];
    throw new Error(`${byLayer.map((l) => `"${l}"`).join(', ')} ${byLayer.length > 1 ? 'are' : 'is'} in use (${lost.slice(0, 3).map((u) => `${u.ref}: ${u.node}`).join(', ')}${lost.length > 3 ? `, and ${lost.length - 3} more` : ''}): change those nodes' layer first`);
  }
  addLayer(name) {
    const n = String(name ?? '').trim(), l = this.view().layers;
    // the first layer added to a game with none keeps "default" (where every node is now) first, unless it is "default"
    return this.setLayers([...(l.length || n === 'default' ? l : ['default']), n], { label: `Add layer ${n}` });
  }
  renameLayer(from, to) {
    const t = String(to ?? '').trim();
    return this.setLayers(this.view().layers.map((x) => (x === from ? t : x)), { label: `Rename layer ${from} to ${t}`, renames: { [from]: t } });
  }
  moveLayer(name, by) {
    const l = this.view().layers, i = l.indexOf(name), j = i + by;
    if (i < 0 || j < 0 || j >= l.length) return Promise.resolve(false);
    const [x] = l.splice(i, 1); l.splice(j, 0, x);
    return this.setLayers(l, { label: `Move layer ${name} ${by < 0 ? 'up' : 'down'}` });
  }
  removeLayer(name) { return this.setLayers(this.view().layers.filter((x) => x !== name), { label: `Remove layer ${name}` }); }
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
      exists: !!g, file: GAME_FILE, error: this.error, note: this.note,
      title: g?.title ?? '', id: g?.id ?? '', release: g?.release ?? '',
      behaviours: g?.behaviours ?? '', scripts: this.files.filter(scriptFile).sort(),
      entry: g?.entry ?? '', scenes: scenes.map((ref) => ({ ref, included: !!g && (ref === g.entry || (g.scenes ?? []).includes(ref)), entry: ref === g?.entry })),
      inputFile: typeof g?.input === 'string' ? g.input : null, defaultControls: !g?.input,
      actions: Object.entries(actions).map(([name, a]) => ({ name, type: a.type, bindings: a.bindings.length })),
      rows: rebindRows(actions),
      layers, matrix: layers.map((x) => ({ layer: x, with: layers.map((y) => ({ layer: y, on: collides(x, y) && collides(y, x) })) })),
      history: this.history(),
    };
  }
}

/**
 * Where a project's scenes and prefabs put nodes on collision layers: [{ ref, node, layer }], the open scene as edited
 * (its unsaved changes too), every other as saved. What the settings check before a layer is renamed or removed.
 * @param {{ scenes: () => string[], text: (ref: string) => Promise<string> }} project
 * @param {{ ref: string | null, doc: any } | null} [open] the scene open in the editor
 */
export async function projectLayerUses(project, open = null) {
  const out = [];
  for (const ref of project.scenes()) {
    let doc = null;
    if (open?.ref === ref && open.doc) doc = open.doc;
    else { try { doc = JSON.parse(await project.text(ref)); } catch { continue; } }
    for (const u of layersUsed(doc)) out.push({ ref, ...u });
  }
  if (open?.doc && open.ref && !project.scenes().includes(open.ref)) for (const u of layersUsed(open.doc)) out.push({ ref: open.ref, ...u });
  return out;
}

/**
 * game.json and the input map's file, parsed, and their text (what ProjectSettings measures "changed on disk" against).
 * @param {{ has: (ref: string) => boolean, text: (ref: string) => Promise<string> }} project
 */
async function readSettings(project) {
  let game = null, input = null, error = '', gameText = null, inputText = null;
  if (project.has(GAME_FILE)) {
    gameText = await project.text(GAME_FILE);
    try { game = JSON.parse(gameText); } catch (e) { error = `${GAME_FILE} isn't JSON (${e.message}): fix it in a text editor, or every edit here starts it again`; }
    if (game && typeof game.input === 'string' && project.has(game.input)) { inputText = await project.text(game.input); input = JSON.parse(inputText); }
  }
  return { game, input, error, seen: { game: gameText, input: inputText } };
}
