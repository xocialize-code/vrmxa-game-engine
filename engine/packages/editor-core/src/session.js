// An editing session on one .vrmxs scene (M1 W7): the document, its edit history, the selection, and play in place.
// No UI and no three.js: the editor app draws it, MCP can drive the same session, and Node tests exercise it.
//
// Every command is one undo step (a batch of @vrmxg/scene's edit ops with a label: "Add cafe", "Move mira"), so the
// app's Undo menu, MCP's undo and the history read the same. Commands refuse while playing.
//
// Play in place: Play takes a snapshot of the document (its canonical text and hash) and hands a copy to the app's
// world builder; the edited document is never touched while playing. Stop disposes the play world and checks the
// document is exactly as it was before Play (text and hash), which is the promise the editor makes.
import { createEditor, createValidator, parse, serialize, prefabNodes, mergeOverride, overrideEntries, withOverride, withoutOverride, applyToPrefab, prefabUsers, fieldValue, innerIds, rawField, schemaChecker } from '@vrmxg/scene';
import { hashValue } from '@vrmxg/snapshot';
import { assetType, nodeTypeFor, slug, uniqueId } from './assets.js';
import { SequenceCommands } from './sequence.js';
import { copyNodes, pasteOps } from './clipboard.js';
import { baseOf, mapNodeRefs, mapArgRefs, behaviourRefKeys } from './refs.js';
import { composeSequence } from '@vrmxg/sequence';

const clone = (v) => structuredClone(v);
const TRANSFORM_KEYS = ['p', 'q', 's'];

export class EditorSession {
  /**
   * @param {{ registry: any, text?: string, doc?: any, prefabs?: Map<string, any>, path?: string | null }} opts
   *   text: the scene file as read (kept to tell saved from changed); prefabs: prefab documents by ref
   */
  constructor({ registry, text, doc, prefabs = new Map(), path = null }) {
    this.reg = registry;
    this.prefabs = prefabs;
    this.path = path;
    this.doc = doc ?? parse(text ?? '');
    this.doc.assets ??= [];
    this.doc.connections ??= [];
    /** Each prefab's canonical text as last read or saved, taken the first time an Apply changes it (M5 W6). @type {Map<string, string>} */
    this.prefabSaved = new Map();
    /** Counts changes to prefab documents (Apply, and its undo): the edit view rebuilds when it moves. */ this.prefabVersion = 0;
    // an Apply writes a prefab's document: the 'prefab' op replaces it in `prefabs` and returns the document it replaced, so
    // the scene's undo puts the prefab back too (one step across two files)
    const prefabOp = ({ ref, doc: next }) => {
      const before = this.prefabs.get(ref);
      if (!before) throw new Error(`prefab ${ref} not loaded`);
      if (!this.prefabSaved.has(ref)) this.prefabSaved.set(ref, serialize(before));
      this.prefabs.set(ref, clone(next));
      this.prefabVersion++;
      return { op: 'prefab', ref, doc: before };
    };
    this.editor = createEditor(registry, this.doc, { prefabs: () => this.prefabs, ops: { prefab: prefabOp } });
    this.validator = createValidator(registry);
    this.savedText = text ?? serialize(this.doc);
    /** @type {string[]} selected node ids; the last is the primary (the inspector's) */ this.selection = [];
    /** 'editing' | 'playing' */ this.mode = 'editing';
    /** An open gesture (a number field's drag): its own edits fold into one undo step. @type {{ depth: number, ops: any[], recording: boolean } | null} */ this.gesture = null;
    this.play = null;
    /** The nodes each removal step took with it (children included), by step: what a gesture's fold counts as touched. */
    this.removed = new WeakMap();
    this.listeners = new Set();
    /** Ids a sequence's tracks may target beyond the document's own (the set's nodes): the app sets it. @type {(() => Set<string>) | null} */
    this.targetIds = null;
    /** Where the project's other files name this scene's nodes (the app sets it before an id change: ./elsewhere.js). @type {((id: string) => { file: string, what: string }[]) | null} */
    this.elsewhere = null;
    /** The set document a sequence films (the app sets it): validation sees the sequence in its set. */
    this.setDoc = null;
    /** Timeline commands on the document's sequence (M2 W5), each one undo step. */
    this.seq = new SequenceCommands(this, () => (this.targetIds ? new Set([...this.targetIds(), ...this.doc.nodes.map((n) => n.id)]) : null));
  }

  /** True for a sequence document (a set it films and a sequence block). */
  get isSequence() { return typeof this.doc.set === 'string' && !!this.doc.sequence; }

  /** A new empty scene: a root Node3D. */
  static empty(registry, id = 'scene') {
    return new EditorSession({ registry, doc: { format: 'vrmxs', version: 1, id, assets: [], nodes: [{ id: 'root', type: 'Node3D', name: 'Scene' }], connections: [] } });
  }

  // ---------------------------------------------------------------- reading

  /** Listen for changes: fn({ kind: 'edit' | 'undo' | 'redo' | 'select' | 'save' | 'play' | 'stop', label? }). */
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(e) { for (const fn of this.listeners) fn(e); }

  node(id) { return this.doc.nodes.find((n) => n.id === id) ?? null; }
  get primary() { return this.selection.at(-1) ?? null; }
  /** The document's nodes as a tree: [{ node, children: [...] }] for the roots, in document order. */
  /**
   * The document's nodes as a tree: [{ node, children: [...] }] for the roots, in document order. With `inner`, each
   * prefab instance also lists its prefab's nodes (M5 W6) as children marked `inner: true`, addressed "<instance>/<inner>"
   * with the instance's overrides applied, and `overridden` on each inner node (and instance) the instance overrides.
   * @param {{ inner?: boolean }} [o]
   */
  tree({ inner = false } = {}) {
    const by = new Map(this.doc.nodes.map((n) => [n.id, { node: n, children: [] }]));
    const roots = [];
    for (const n of this.doc.nodes) (n.parent !== undefined && by.has(n.parent) ? by.get(n.parent).children : roots).push(by.get(n.id));
    if (inner) for (const n of this.doc.nodes) if (n.type === 'Instance') this.innerTree(by.get(n.id));
    return roots;
  }

  /** Hang an instance's prefab nodes under its tree item (tree({ inner: true })). */
  innerTree(item) {
    const inst = item.node, prefab = this.prefabOf(inst);
    item.overridden = !!inst.overrides && Object.keys(inst.overrides).length > 0;
    if (!prefab) return;
    let nodes;
    try { nodes = prefabNodes(prefab, this.prefabs); } catch { return; } // a cycle or a missing nested prefab: the instance alone
    const items = new Map();
    for (const [local, base] of nodes) {
      items.set(local, { node: { ...mergeOverride(base, inst.overrides?.[local]), id: `${inst.id}/${local}` }, children: [], inner: true, overridden: !!inst.overrides?.[local] });
    }
    for (const [local, base] of nodes) (base.parent !== undefined && items.has(base.parent) ? items.get(base.parent).children : item.children).push(items.get(local));
  }
  /** The canonical text of the document now (what Save writes). */
  text() { return serialize(this.doc); }
  /** A hash of the document's canonical text: equal hashes, equal files. */
  hash() { return hashValue(this.text()); }
  /** Unsaved: the scene's text, or a prefab an Apply changed (saved with the scene). */
  get dirty() { return this.text() !== this.savedText || this.dirtyPrefabs().length > 0; }
  validate() {
    let doc = this.doc;
    if (this.isSequence && this.setDoc) { try { doc = composeSequence(this.doc, this.setDoc); } catch (e) { return { ok: false, errors: [String(e.message)], warnings: [] }; } }
    return this.validator.check(doc, { prefabs: this.prefabs });
  }
  /** What Undo and Redo would do ("Move mira"), or null. */
  history() {
    const p = this.editor.peek();
    return { undo: p.undo ? label(p.undo) : null, redo: p.redo ? label(p.redo) : null, undoDepth: p.undoDepth, redoDepth: p.redoDepth };
  }

  // ---------------------------------------------------------------- selection

  select(ids, { add = false } = {}) {
    const want = (Array.isArray(ids) ? ids : ids == null ? [] : [ids]).filter((id) => this.node(id) || this.innerNode(id));
    this.selection = add ? [...this.selection.filter((x) => !want.includes(x)), ...want] : want;
    this.emit({ kind: 'select' });
  }

  // ---------------------------------------------------------------- commands (each one undo step)

  /** Apply edit ops as one undo step. */
  run(label, ops) {
    if (this.mode !== 'editing') throw new Error(`${label}: stop playing first`);
    if (!ops.length) return;
    // what a removal takes with it (its subtree), counted as touched by the step: a gesture's fold looks (AB-T-0634)
    const gone = ops.filter((o) => o.op === 'remove' && this.node(o.id)).flatMap((o) => this.subtreeIds(o.id));
    const step = ops.length === 1 && !ops[0].label ? { ...ops[0], label } : { op: 'batch', label, ops };
    this.editor.apply(step);
    if (gone.length) this.removed.set(step, gone);
    if (this.gesture?.recording) this.gesture.ops.push(this.editor.peek().undo); // one of the gesture's own edits
    this.tidySelection();
    this.emit({ kind: 'edit', label });
  }

  undo() { this.mustEdit('Undo'); const h = this.history().undo; if (!this.editor.undo()) return false; this.tidySelection(); this.emit({ kind: 'undo', label: h }); return true; }
  redo() { this.mustEdit('Redo'); const h = this.history().redo; if (!this.editor.redo()) return false; this.tidySelection(); this.emit({ kind: 'redo', label: h }); return true; }

  /**
   * Place a project file in the scene: its asset entry (reused when the document already has one for the ref) and a
   * node of the type the registry gives it, at `at`, under `parent`. Selects it. → the node's id
   * @param {string} ref @param {{ at?: number[], q?: number[], parent?: string, name?: string, id?: string }} [opts]
   */
  addFromAsset(ref, { at, q, parent, name, id } = {}) {
    const type = assetType(ref);
    if (!type) throw new Error(`${ref}: not a file the editor places`);
    const nodeType = nodeTypeFor(this.reg, type);
    if (!nodeType) throw new Error(`${ref}: a ${type} isn't placed in a scene (no node type takes it)`);
    if (type === 'vrmxs') this.mustPlacePrefab(ref);
    const base = slug(name ?? ref.split('/').pop().replace(/\.[^.]+$/, ''));
    const ops = [];
    let asset = this.doc.assets.find((a) => a.ref === ref);
    if (!asset) {
      asset = { id: uniqueId(base, new Set(this.doc.assets.map((a) => a.id))), type, ref };
      ops.push({ op: 'addAsset', asset });
    }
    const nodeId = id ?? uniqueId(base, new Set(this.doc.nodes.map((n) => n.id)));
    /** @type {any} */ const node = { id: nodeId, type: nodeType, asset: asset.id, ...(parent ?? this.defaultParent() ? { parent: parent ?? this.defaultParent() } : {}), ...(name ? { name } : {}) };
    const t = transform(at, q);
    if (t) node.transform = t;
    ops.push({ op: 'add', node });
    this.run(`Add ${nodeId}`, ops);
    this.select(nodeId);
    return nodeId;
  }

  /**
   * Add a node of a type with no asset (a light, a camera, a group). → its id
   * @param {string} type @param {{ at?: number[], parent?: string, name?: string, props?: object, id?: string }} [opts]
   */
  addNode(type, { at, parent, name, props, id } = {}) {
    const t = this.reg.get(type);
    if (!t) throw new Error(`no node type ${type}`);
    if (t.asset?.required) throw new Error(`${type} needs an asset: drop one from the asset list`);
    const nodeId = id ?? uniqueId(slug(name ?? type), new Set(this.doc.nodes.map((n) => n.id)));
    const p = parent ?? this.defaultParent();
    /** @type {any} */ const node = { id: nodeId, type, ...(p ? { parent: p } : {}), ...(name ? { name } : {}), ...(props ? { props: clone(props) } : {}) };
    const tr = transform(at); if (tr) node.transform = tr;
    this.run(`Add ${nodeId}`, [{ op: 'add', node }]);
    this.select(nodeId);
    return nodeId;
  }

  /**
   * A project file into a node's asset slot (M5 W6, AB-T-0606: a drop from the assets panel): the node names it (its
   * asset entry reused, or added), and an entry nothing uses any more goes. One undo step ("Set bench.asset"). Refused when
   * the node's type doesn't take that kind of file.
   * @param {string} id @param {string} ref
   */
  setNodeAsset(id, ref) {
    const n = this.node(id);
    if (!n) throw new Error(`no node ${id}`);
    const t = this.reg.get(n.type), type = assetType(ref);
    if (!t?.asset) throw new Error(`a ${n.type} has no asset`);
    if (!type || !t.asset.types.includes(type)) throw new Error(`${ref}: a ${n.type} takes ${t.asset.types.join(' or ')}, not ${type ?? 'this file'}`);
    if (type === 'vrmxs') this.mustPlacePrefab(ref);
    const ops = [];
    let asset = this.doc.assets.find((a) => a.ref === ref && a.type === type);
    if (asset?.id === n.asset) return;
    if (!asset) {
      asset = { id: uniqueId(slug(ref.split('/').pop().replace(/\.[^.]+$/, '')), new Set(this.doc.assets.map((a) => a.id))), type, ref };
      ops.push({ op: 'addAsset', asset });
    }
    ops.push({ op: 'set', id, path: 'asset', value: asset.id });
    // another prefab: the overrides that name nodes it doesn't have go, in the same step (the rest still apply)
    if (n.type === 'Instance' && n.overrides) {
      const ids = innerIds(this.prefabs.get(ref), this.prefabs);
      const kept = Object.fromEntries(Object.entries(n.overrides).filter(([target]) => ids.has(target)));
      if (Object.keys(kept).length !== Object.keys(n.overrides).length) ops.push({ op: 'set', id, path: 'overrides', value: Object.keys(kept).length ? kept : undefined });
    }
    if (n.asset !== undefined && !this.doc.nodes.some((x) => x !== n && x.asset === n.asset)) ops.push({ op: 'removeAsset', id: n.asset });
    this.run(`Set ${id}.asset`, ops);
  }

  /**
   * A prefab can be placed here: its document is loaded (the app reads it first: Project.prefabs), and it doesn't lead
   * back to this scene's own file (an instance cycle a saved file couldn't load).
   */
  mustPlacePrefab(ref) {
    if (!this.prefabs.has(ref)) throw new Error(`prefab ${ref} isn't loaded (the app reads it before placing it)`);
    if (this.path && this.reaches(ref, this.path)) throw new Error(`${ref} ${ref === this.path ? 'is this scene itself' : `uses ${this.path}, this scene`}: an instance of it here would be a cycle`);
  }

  /**
   * The prefab this scene places that leads to `ref` (itself or through the prefabs it places), or null: saving the scene
   * as `ref` would make it an instance of itself (Save As over a prefab it uses). The save refuses it.
   */
  cycleIfSavedAs(ref) {
    for (const a of this.doc.assets) if (a.type === 'vrmxs' && this.reaches(a.ref, ref)) return a.ref;
    return null;
  }

  /** Does prefab `from` lead to `to` (itself, or through the prefabs it places)? */
  reaches(from, to, seen = new Set()) {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    const d = this.prefabs.get(from);
    return (d?.assets ?? []).some((a) => a.type === 'vrmxs' && this.reaches(a.ref, to, seen));
  }

  /** Delete nodes (with their children); asset entries nothing uses any more go too. */
  remove(ids = this.selection) {
    const list = [...new Set(ids)].filter((id) => this.node(id));
    // a node whose ancestor is also being removed goes with it
    const top = list.filter((id) => !list.some((o) => o !== id && this.isAncestor(o, id)));
    if (!top.length) return;
    const gone = new Set(top.flatMap((id) => this.subtreeIds(id)));
    const assets = [...new Set(this.doc.nodes.filter((n) => gone.has(n.id) && n.asset).map((n) => n.asset))]
      .filter((a) => !this.doc.nodes.some((n) => !gone.has(n.id) && n.asset === a));
    this.run(top.length === 1 ? `Delete ${top[0]}` : `Delete ${top.length} nodes`, [...top.map((id) => ({ op: 'remove', id })), ...assets.map((id) => ({ op: 'removeAsset', id }))]);
  }

  /** Move a node under another (or to the top level with parent null), at a position among the nodes. */
  reparent(id, parent, index) {
    if (!this.node(id)) throw new Error(`no node ${id}`);
    this.run(`Move ${id} under ${parent ?? 'the scene'}`, [{ op: 'reparent', id, parent: parent ?? undefined, ...(index !== undefined ? { index } : {}) }]);
  }

  /**
   * Set a node's transform (any of p, q, s); unchanged parts kept. One undo step per call, so a gizmo drag commits once,
   * on release. Identity parts are dropped from the file (p 0,0,0; q 0,0,0,1; s 1,1,1).
   */
  setTransform(id, t, labelText) {
    const n = this.node(id);
    if (!n) throw new Error(`no node ${id}`);
    this.run(labelText ?? `${transformKind(t)} ${id}`, [transformOp(n, t)]);
  }

  /** Set (or with undefined, clear back to its default) one prop. */
  setProp(id, key, value) { const n = this.node(id); this.run(`Set ${id}.${key}`, n ? propOps(n, key, value) : [{ op: 'set', id, path: `props.${key}`, value }]); }
  rename(id, name) { this.run(`Rename ${id}`, [{ op: 'set', id, path: 'name', value: name || undefined }]); }

  // ---------------------------------------------------------------- a node's id and place (M6 W1, AB-T-0638)

  /**
   * Give a node another id, and rewrite every reference to it in this scene as the same undo step: its children's parent,
   * node props and the fields object props list (`nodeRef`, `meta.nodeRefs`: a camera's target, a Dialogue line's
   * speaker), behaviour params that name nodes, other instances' override values, connection ends ("door-1",
   * "door-1/hinge") and node arguments, a sequence's targets and cameras, and the selection. A game node's `key` defaults
   * to its id, so an unset key follows the new id. Refused for an inner node of an instance (its id is the prefab's) and
   * for an id that isn't free or isn't one ("a-z", "0-9", "-", "_").
   *
   * Only this file is rewritten (M6 W1 review): when `elsewhere` (the app sets it: ./elsewhere.js over the project's
   * files) says another file names the node (a sequence filming this scene, a scene placing it as a prefab), the change
   * is refused, naming those files, rather than leave them pointing at nothing.
   *
   * A game node's `key` defaults to its id (GameCounter, GameTimer, GameGoal). When the node has no key of its own and a
   * condition here names it ("counters.served", a GameRules' reads), its key is written as the old id in the same step,
   * so those conditions still find it; otherwise the key follows the id. → the new id
   * @param {string} id @param {string} to
   */
  setNodeId(id, to) {
    this.mustEdit('Change id');
    const n = this.node(id);
    if (!n) throw new Error(this.innerNode(id) ? `${id} is a node of a prefab: its id is the prefab's (change it there)` : `no node ${id}`);
    to = String(to ?? '').trim();
    if (to === id) return id;
    if (!/^[A-Za-z0-9_-]+$/.test(to)) throw new Error(`"${to}" can't be an id: letters, digits, "-" and "_" only`);
    if (this.node(to)) throw new Error(`there is already a node called ${to}`);
    const uses = this.elsewhere?.(id) ?? [];
    if (uses.length) throw new Error(`${id} is named in ${uses.length === 1 ? 'another file' : `${uses.length} other files`}: ${uses.map((u) => `${u.file} (${u.what})`).join('; ')}. Changing its id here would leave ${uses.length === 1 ? 'it' : 'them'} pointing at nothing: change it there too, or keep this id`);
    const keeps = this.keyNamed(n);
    const fn = (r) => (baseOf(r) === id ? to + String(r).slice(id.length) : r);
    /** @type {any[]} */ const ops = [{ op: 'renameNode', id, to }];
    for (const x of this.doc.nodes) {
      const nid = x.id === id ? to : x.id;
      const next = mapNodeRefs(this.reg, x, fn, { innerOf: (local) => this.innerBase(x, local) });
      if (x === n && keeps) next.props = { ...(next.props ?? {}), key: id };
      for (const k of ['props', 'behaviours', 'overrides']) if (!sameJSON(next[k], x[k])) ops.push({ op: 'set', id: nid, path: k, value: next[k] });
    }
    this.doc.connections.forEach((c, index) => {
      const target = this.endNode(c.to);
      const next = { ...c, from: fn(c.from), to: fn(c.to), ...(c.args ? { args: mapArgRefs(this.reg, c, target, fn) } : {}) };
      if (!sameJSON(next, c)) ops.push({ op: 'setConnection', index, connection: next });
    });
    if (this.doc.sequence) {
      const seq = renameInSequence(this.doc.sequence, fn);
      if (!sameJSON(seq, this.doc.sequence)) ops.push({ op: 'setDoc', path: 'sequence', value: seq });
    }
    const sel = this.selection.map(fn);
    this.run(`Change id ${id} to ${to}${keeps ? ` (its key stays ${id})` : ''}`, ops);
    this.selection = sel.filter((x) => this.node(x) || this.innerNode(x));
    this.emit({ kind: 'select' });
    return to;
  }

  /**
   * Does a condition in this scene name game node `n` by the key it takes from its id? A GameCounter, GameTimer or
   * GameGoal with no `key` of its own, named as "counters.<id>" ("timers.", "goals.") in any node's props or a
   * connection's arguments, or listed in a GameRules' `reads`.
   */
  keyNamed(n) {
    const kind = KEYED[n.type];
    if (!kind || n.props?.key !== undefined) return false;
    const want = `${kind}.${n.id}`;
    const hit = (v) => (typeof v === 'string' ? v === want || v.startsWith(`${want}.`) : Array.isArray(v) ? v.some(hit) : v && typeof v === 'object' ? Object.values(v).some(hit) : false);
    return this.doc.nodes.some((x) => hit(x.props) || (x.type === 'GameRules' && (x.props?.reads?.[kind] ?? []).includes(n.id))) || this.doc.connections.some((c) => hit(c.args));
  }

  /**
   * Move a node to just before another in the document's order (the order nodes are listed, built and stepped in), its
   * parent unchanged; `before` null: to the end. One undo step ("Move till before mira").
   * @param {string} id @param {string | null} before
   */
  moveBefore(id, before) {
    const n = this.node(id);
    if (!n) throw new Error(`no node ${id}`);
    if (before === id) return;
    if (before != null && !this.node(before)) throw new Error(`no node ${before}`);
    const rest = this.doc.nodes.filter((x) => x.id !== id);
    const index = before == null ? rest.length : rest.findIndex((x) => x.id === before);
    if (this.doc.nodes.indexOf(n) === index) return;
    this.run(before == null ? `Move ${id} to the end` : `Move ${id} before ${before}`, [{ op: 'reparent', id, parent: n.parent, index }]);
  }

  // ---------------------------------------------------------------- behaviours (M6 W1, AB-T-0638)
  // A node's behaviours are entries { use, ...params } (flat). Registry behaviours and the project's own (declared by
  // their static describe, M6 W0) are added, removed and edited the same way, each one undo step.

  /** Behaviours that may be added to node `id`: those whose `on` takes its type and that it doesn't have. → their names */
  addableBehaviours(id) {
    const n = this.node(id);
    if (!n) return [];
    const has = new Set((n.behaviours ?? []).map((b) => b.use));
    return [...this.reg.behaviours.values()].filter((b) => !has.has(b.name) && (!b.on || b.on.some((o) => this.reg.isA(n.type, o)))).map((b) => b.name);
  }

  /** Add behaviour `use` to a node, with no params (its defaults). One undo step ("Add tableZone to table-1"). */
  addBehaviour(id, use) {
    const n = this.node(id);
    if (!n) throw new Error(`no node ${id}`);
    const d = this.reg.behaviours.get(use);
    if (!d) throw new Error(`no behaviour ${use}`);
    if (d.on && !d.on.some((o) => this.reg.isA(n.type, o))) throw new Error(`${use} attaches to ${d.on.join(' or ')}, not a ${n.type}`);
    if ((n.behaviours ?? []).some((b) => b.use === use)) throw new Error(`${id} has ${use} already`);
    this.run(`Add ${use} to ${id}`, [{ op: 'set', id, path: 'behaviours', value: [...clone(n.behaviours ?? []), { use }] }]);
  }

  /**
   * Remove behaviour `use` from a node. The connections that need it go in the same step (one from a signal, or to an
   * action, that only it gives the node), so the scene stays valid. One undo step. → how many connections went
   */
  removeBehaviour(id, use) {
    const n = this.node(id);
    if (!n) throw new Error(`no node ${id}`);
    const left = (n.behaviours ?? []).filter((b) => b.use !== use);
    if (left.length === (n.behaviours ?? []).length) throw new Error(`${id} has no ${use}`);
    // only what the behaviour gave the node goes: a signal or action it had before and hasn't after (a node of a type the
    // registry doesn't know keeps the connections its type's own members make, which the registry can't list)
    const before = this.reg.surface(n), after = this.reg.surface({ ...n, behaviours: left });
    const lost = (have, now, name) => !!have[name] && !now[name];
    const gone = this.doc.connections.map((c, i) => [c, i]).filter(([c]) => (c.from === id && lost(before.signals, after.signals, c.signal)) || (c.to === id && lost(before.actions, after.actions, c.call))).map(([, i]) => i);
    const ops = [...gone.reverse().map((index) => ({ op: 'disconnect', index })), { op: 'set', id, path: 'behaviours', value: left.length ? clone(left) : undefined }];
    this.run(`Remove ${use} from ${id}`, ops);
    return gone.length;
  }

  /**
   * Set (or with undefined, clear back to its default) one param of a node's behaviour. A param that names a node must
   * name one this scene has. One undo step ("Set table-1.tableZone.points"); nothing when it holds that value already.
   */
  setBehaviourParam(id, use, key, value) {
    const n = this.node(id);
    if (!n) throw new Error(`no node ${id}`);
    const list = clone(n.behaviours ?? []), b = list.find((x) => x.use === use);
    if (!b) throw new Error(`${id} has no ${use}`);
    if (key === 'use') throw new Error('"use" names the behaviour: remove it and add another');
    if (sameJSON(b[key], value)) return;
    if (value === undefined) delete b[key]; else b[key] = clone(value);
    if (value !== undefined && behaviourRefKeys(this.reg, use).includes(key) && !this.endNode(value)) throw new Error(`${id}.${use}.${key} must name a node of this scene; "${value}" isn't one`);
    this.run(`Set ${id}.${use}.${key}`, [{ op: 'set', id, path: 'behaviours', value: list }]);
  }

  // ---------------------------------------------------------------- connections (M6 W1, AB-T-0638)
  // A connection: a node's signal → another node's action, with arguments. Each edit is one undo step, and checked as a
  // whole: the signal is one the sending node has (its type's or a behaviour's), the action one the target has, and the
  // arguments fit the action's (a node argument names a node of this scene).

  /** The node a connection end or a node reference names ("id", "id/inner", "id#head"), or null. */
  endNode(ref) {
    if (typeof ref !== 'string' || !ref) return null;
    const r = ref.split('#')[0];
    return this.node(r) ?? this.innerNode(r)?.node ?? null;
  }

  /** What's wrong with a connection, or null. */
  connectionProblem(c) {
    const from = this.endNode(c.from), to = this.endNode(c.to);
    if (!from) return `no node ${c.from}`;
    if (!to) return `no node ${c.to}`;
    const sig = this.reg.surface(from).signals, act = this.reg.surface(to).actions;
    if (this.reg.get(from.type) && !sig[c.signal]) return `${c.from} has no signal ${c.signal}`;
    if (this.reg.get(to.type) && !act[c.call]) return `${c.to} has no action ${c.call}`;
    const defs = act[c.call]?.args ?? {};
    if (c.args !== undefined) {
      if (!c.args || typeof c.args !== 'object' || Array.isArray(c.args)) return `${c.call}'s arguments are an object`;
      // each argument the action declares is checked against its schema; one it doesn't is kept, as @vrmxg/scene keeps it
      for (const [k, v] of Object.entries(c.args)) {
        if (!defs[k]) continue;
        const errs = checkerOf(defs[k].schema)(v);
        if (errs.length) return `${c.call}'s ${k}: ${errs.join('; ')}`;
        if (defs[k].nodeRef && !this.endNode(v)) return `${c.call}'s ${k} must name a node of this scene; "${v}" isn't one`;
      }
    }
    return null;
  }

  /**
   * Connect a node's signal to another node's action: one undo step ("Connect order-1.chose to brew-1.start"). Empty
   * arguments are left out. → the connection's index
   * @param {{ from: string, signal: string, to: string, call: string, args?: Record<string, any> }} c
   */
  connect(c) {
    const next = tidyConnection(c);
    const why = this.connectionProblem(next);
    if (why) throw new Error(`Connect: ${why}`);
    this.run(`Connect ${next.from}.${next.signal} to ${next.to}.${next.call}`, [{ op: 'connect', ...next }]);
    return this.doc.connections.length - 1;
  }

  /**
   * Change connection `index` (any of its signal, target, action and arguments): one undo step. A changed action drops
   * the arguments it doesn't take. → nothing when it changes nothing
   * @param {number} index @param {{ signal?: string, to?: string, call?: string, args?: Record<string, any> }} parts
   */
  setConnection(index, parts) {
    const c = this.doc.connections[index];
    if (!c) throw new Error(`no connection ${index}`);
    let next = tidyConnection({ ...c, ...parts });
    if (next.args && (parts.call !== undefined || parts.to !== undefined)) { // arguments the new action doesn't take go
      const defs = this.reg.surface(this.endNode(next.to) ?? { type: '' }).actions?.[next.call]?.args ?? {};
      next = tidyConnection({ ...next, args: Object.fromEntries(Object.entries(next.args).filter(([k]) => Object.hasOwn(defs, k))) });
    }
    if (sameJSON(next, c)) return;
    if (parts.to !== undefined && parts.call === undefined && next.to !== c.to) {
      const t = this.endNode(next.to);
      if (t && this.reg.get(t.type) && !this.reg.surface(t).actions[next.call]) throw new Error(`Connection ${index + 1}: ${next.to} has no action ${next.call}: pick its action with the new target (the panel holds the target until you do)`);
    }
    const why = this.connectionProblem(next);
    if (why) throw new Error(`Connection ${index + 1}: ${why}`);
    const what = parts.args !== undefined && Object.keys(parts).length === 1 ? 'arguments' : Object.keys(parts).join(', ');
    this.run(`Set ${c.from}.${c.signal} connection's ${what}`, [{ op: 'setConnection', index, connection: next }]);
  }

  /** Set (or with undefined, clear) one argument of connection `index`: one undo step. */
  setConnectionArg(index, key, value) {
    const c = this.doc.connections[index];
    if (!c) throw new Error(`no connection ${index}`);
    const args = { ...(c.args ?? {}) };
    if (value === undefined) delete args[key]; else args[key] = clone(value);
    this.setConnection(index, { args });
  }

  /** Remove connection `index`: one undo step. */
  disconnect(index) {
    const c = this.doc.connections[index];
    if (!c) throw new Error(`no connection ${index}`);
    this.run(`Disconnect ${c.from}.${c.signal} from ${c.to}.${c.call}`, [{ op: 'disconnect', index }]);
  }

  /** A prefab node an instance's override addresses ("hinge", "frame/hinge"), as its prefab has it, or null. */
  innerBase(inst, local) {
    const prefab = this.prefabOf(inst);
    if (!prefab) return null;
    try { return prefabNodes(prefab, this.prefabs).get(local) ?? null; } catch { return null; }
  }

  // ---------------------------------------------------------------- several nodes at once (M5 W4, AB-T-0601)

  /**
   * Set (or with undefined, clear) one prop on several nodes as one undo step: "Set intensity on 2 nodes". One id is
   * `setProp`'s step ("Set lamp.intensity"). Nodes already holding the value get no op; nothing to change, no step.
   * @param {string[]} ids @param {string} key @param {any} value
   */
  setPropOn(ids, key, value) {
    const list = [...new Set(ids)];
    for (const id of list) if (!this.node(id)) throw new Error(`no node ${id}`);
    if (list.length === 1) return this.setProp(list[0], key, value);
    this.run(`Set ${key} on ${list.length} nodes`, list.flatMap((id) => propOps(this.node(id), key, value)));
  }

  /**
   * Set one prop to a value of each node's own as one undo step: one axis of a vector prop on a selection, each node
   * keeping its other axes. One entry is `setProp`'s step.
   * @param {string} key @param {{ id: string, value: any }[]} entries
   */
  setPropEach(key, entries) {
    for (const { id } of entries) if (!this.node(id)) throw new Error(`no node ${id}`);
    if (entries.length === 1) return this.setProp(entries[0].id, key, entries[0].value);
    this.run(`Set ${key} on ${entries.length} nodes`, entries.flatMap(({ id, value }) => propOps(this.node(id), key, value)));
  }

  /**
   * Set several nodes' transforms (any of p, q, s each; unchanged parts kept) as one undo step: the inspector's
   * Position X on a selection, each node keeping its own Y and Z. One entry is `setTransform`'s step.
   * @param {{ id: string, t: { p?: number[], q?: number[], s?: number[] } }[]} entries @param {string} [labelText]
   */
  setTransforms(entries, labelText) {
    for (const { id } of entries) if (!this.node(id)) throw new Error(`no node ${id}`);
    if (entries.length === 1) return this.setTransform(entries[0].id, entries[0].t, labelText);
    const kinds = new Set(entries.map((e) => transformKind(e.t)));
    const kind = kinds.size === 1 ? [...kinds][0] : 'Transform';
    this.run(labelText ?? `${kind} ${entries.length} nodes`, entries.map(({ id, t }) => transformOp(this.node(id), t)));
  }

  // ---------------------------------------------------------------- gestures (M5 W4, AB-T-0600)
  // A number field's drag edits live (the view follows), and the whole drag is one undo step: beginGesture on the
  // first move, its edits made through withGesture, endGesture on release, which folds them into one step labelled as
  // the last. Only edits made through withGesture belong to it: another edit that lands meanwhile (an MCP agent's) stays
  // its own step, put back after the drag's undone steps and before the folded one. When it touched a node the drag
  // touched, nothing is folded: the steps are left as they were.

  /** Start a gesture: the edits made through `withGesture` until `endGesture` become one undo step. */
  beginGesture() {
    this.mustEdit('Edit');
    this.gesture = { depth: this.editor.peek().undoDepth, ops: [], recording: false };
  }

  /** Is a gesture open? */
  get gesturing() { return !!this.gesture; }

  /** Run `fn` (one of the gesture's live edits): the steps it makes belong to the open gesture, if there is one. */
  withGesture(fn) {
    const g = this.gesture;
    if (!g) return fn();
    const was = g.recording; g.recording = true;
    try { return fn(); } finally { g.recording = was; }
  }

  /**
   * End the gesture: its steps become one (labelled as its last), or none when its values came back to where they
   * started. → the step's label, or null when it changed nothing
   */
  endGesture() {
    const g = this.gesture; this.gesture = null;
    if (!g) return null;
    let u;
    try { u = this.unwindGesture(g); } catch { return g.ops.length ? this.history().undo : null; } // never expected: the steps stay as they were
    if (!u) return g.ops.length ? this.history().undo : null; // left as its steps, or it had none
    const { mine, before } = u;
    const label = labelOf(mine.at(-1));
    const flat = mine.flatMap((op) => (op.op === 'batch' ? op.ops : [op])).map(({ label: _l, ...o }) => o);
    // a drag sets the same paths over and over: keep each path's last set (in the order they were last set)
    const keyOf = (o, i) => (o.op === 'set' ? `${o.id}\u0000${o.path}` : i);
    const lastAt = new Map(flat.map((o, i) => [keyOf(o, i), i]));
    const ops = flat.filter((o, i) => lastAt.get(keyOf(o, i)) === i);
    const start = this.text();
    this.editor.apply({ op: 'batch', label, ops });
    if (this.text() === start) { this.editor.undo(); this.editor.dropRedo(); this.tidySelection(); this.emit({ kind: 'undo', label }); return null; } // back where it began
    if (this.text() !== before) throw new Error(`${label}: folding the drag changed the scene (never expected)`);
    this.tidySelection();
    this.emit({ kind: 'edit', label });
    return label;
  }

  /** Abandon the gesture: its edits are undone (Escape during a drag); others' edits meanwhile stay. */
  cancelGesture() {
    const g = this.gesture; this.gesture = null;
    const u = g && this.unwindGesture(g);
    if (!u) return;
    this.editor.dropRedo(); // an abandoned drag isn't redone
    this.tidySelection();
    this.emit({ kind: 'undo', label: labelOf(u.mine[0]) });
  }

  /**
   * Undo everything since the gesture began and put back the steps that weren't its own, each as it was. → its own
   * steps and the scene's text before unwinding, or null (nothing done) when it had no steps, an undo went below its
   * start, or another step touched a node it touched.
   */
  unwindGesture(g) {
    const all = this.editor.history();
    if (all.length < g.depth) return null;
    const since = all.slice(g.depth);
    const mine = since.filter((op) => g.ops.includes(op));
    if (!mine.length) return null;
    const foreign = since.filter((op) => !g.ops.includes(op));
    // the nodes a step touched: each op's node (a rename both its ids), a removal's whole subtree; a connection edit or a
    // document value by its kind (anything unknown conflicts with everything)
    const touchedBy = (o) => {
      if (o.op === 'renameNode') return [o.id, o.to];
      if (o.op === 'setDoc') return [`\u0000doc:${o.path.split('.')[0]}`];
      if (o.op === 'setConnection' || o.op === 'disconnect' || o.op === 'reconnectAt') return ['\u0000other'];
      const id = o.id ?? o.node?.id ?? o.from;
      return [id ?? '\u0000other'];
    };
    const touched = (ops) => new Set(ops.flatMap((op) => [...(this.removed.get(op) ?? []), ...(op.op === 'batch' ? op.ops : [op]).flatMap(touchedBy)]));
    const theirs = touched(foreign);
    if ([...touched(mine)].some((id) => theirs.has(id)) || theirs.has('\u0000other')) return null;
    const before = this.text();
    for (let i = 0; i < since.length; i++) this.editor.undo();
    for (const op of foreign) this.editor.apply(op);
    return { mine, before };
  }

  // ---------------------------------------------------------------- copy, paste, duplicate, resize (M5 W5)

  /** Copy nodes (each with its subtree, their asset entries and connections) as a clip: plain JSON, no undo step. → clip or null */
  copy(ids = this.selection) { return copyNodes(this.doc, ids); }

  /**
   * Paste a clip: fresh ids, references inside it kept inside it and references to nodes this scene lacks dropped, one
   * undo step. Selects what was pasted. → the new roots' ids
   * @param {any} clip @param {{ parent?: string | null }} [opts] parent: where the roots go (by default each one's own
   *   parent where this document has it, else the scene's root)
   */
  paste(clip, { parent } = {}) {
    this.mustEdit('Paste');
    const { ops, roots } = pasteOps(this.doc, this.reg, clip, { parent, defaultParent: this.defaultParent(), prefabs: this.prefabs });
    this.run(roots.length === 1 ? `Paste ${roots[0]}` : `Paste ${roots.length} nodes`, ops);
    this.select(roots);
    return roots;
  }

  /**
   * Duplicate nodes in place, each copy (a prefab instance with its overrides) right after its original under the same
   * parent, with fresh ids: one undo step. Selects the copies. → their ids
   */
  duplicate(ids = this.selection) {
    this.mustEdit('Duplicate');
    const clip = copyNodes(this.doc, ids);
    if (!clip) return [];
    const { ops, roots } = pasteOps(this.doc, this.reg, clip, { defaultParent: this.defaultParent(), after: true, prefabs: this.prefabs });
    this.run(clip.roots.length === 1 ? `Duplicate ${clip.roots[0]}` : `Duplicate ${clip.roots.length} nodes`, ops);
    this.select(roots);
    return roots;
  }

  /**
   * A shape handle's drag (AB-T-0605): set the props it changed (a collider's size, radius or height, a light's range or
   * angle) and, when one side of a shape moved, the node's position, as one undo step. Values are rounded as transforms are.
   * @param {string} id @param {Record<string, any>} props @param {{ p?: number[] }} [t] the node's new local position
   */
  resizeShape(id, props, { p } = {}) {
    const n = this.node(id);
    if (!n) throw new Error(`no node ${id}`);
    const r = (v) => (Array.isArray(v) ? v.map(round) : typeof v === 'number' ? round(v) : v);
    const ops = Object.entries(props).map(([k, v]) => ({ op: 'set', id, path: `props.${k}`, value: r(v) }));
    if (p) {
      const next = { ...(n.transform ?? {}), p: p.map(round) };
      if (next.p.every((v) => v === 0)) delete next.p;
      ops.push({ op: 'set', id, path: 'transform', value: Object.keys(next).length ? next : undefined });
    }
    this.run(`Resize ${id}`, ops);
  }

  // ---------------------------------------------------------------- prefab overrides (M5 W6, AB-T-0603)
  // An instance's inner nodes ("door-1/hinge") can be selected and edited: an edit writes the instance's override of that
  // node (the least override that gives the value; the prefab's own value drops it). Revert drops overrides; Apply writes
  // the instance's values into the prefab's document and drops them, so every instance of the prefab follows. Each is one
  // undo step, Apply's across the scene and the prefab (the 'prefab' op); a changed prefab is unsaved until Save writes it.

  /** The prefab document an Instance node names, or null. */
  prefabOf(inst) {
    if (inst?.type !== 'Instance') return null;
    return this.prefabs.get(this.doc.assets.find((a) => a.id === inst.asset)?.ref) ?? null;
  }
  /** The ref of the prefab an Instance node names, or null. */
  prefabRef(inst) { return inst?.type === 'Instance' ? this.doc.assets.find((a) => a.id === inst.asset)?.ref ?? null : null; }

  /**
   * An inner node of a prefab instance by its address ("door-1/hinge", "entrance/left/hinge"), or null: the instance's id,
   * the address inside the prefab (`target`), the prefab's ref, the prefab's node (`base`, what the instance starts from)
   * and the node as the instance has it (`node`, overrides applied, with the full address as its id).
   */
  innerNode(id) {
    if (typeof id !== 'string' || !id.includes('/')) return null;
    const [head, ...rest] = id.split('/');
    const inst = this.node(head), prefab = this.prefabOf(inst);
    if (!prefab) return null;
    const target = rest.join('/');
    let base;
    try { base = prefabNodes(prefab, this.prefabs).get(target); } catch { return null; }
    if (!base) return null;
    return { id, instance: head, target, ref: this.prefabRef(inst), base, node: { ...mergeOverride(base, inst.overrides?.[target]), id }, overridden: !!inst.overrides?.[target] };
  }

  /**
   * An instance's overrides as a diff (@vrmxg/scene's overrideEntries) with what an Apply would reach: the prefab's ref,
   * the instances of it in this scene (nested ones included). null for a node that isn't an instance.
   */
  overridesOf(instanceId) {
    const inst = this.node(instanceId);
    if (inst?.type !== 'Instance') return null;
    const ref = this.prefabRef(inst), prefab = this.prefabOf(inst);
    let entries = [];
    try { entries = overrideEntries(inst, prefab, this.prefabs); } catch { entries = []; } // no prefab: listed as unresolved
    return { id: instanceId, ref, loaded: !!prefab, entries, users: ref ? this.prefabUses(ref) : [] };
  }

  /** The instances of prefab `ref` in this scene, nested ones included, by address. */
  prefabUses(ref) {
    try { return prefabUsers(this.doc, this.prefabs, ref); } catch { return []; }
  }

  /**
   * Edit an inner node of an instance: one field ('props.<key>', 'transform.p|q|s', 'behaviours.<use>', 'name', …) set to
   * `value`, as the instance's override. One undo step ("Override door-1/hinge.mass"); nothing when it changes nothing.
   * The node with its new value must pass its type's schema.
   */
  setOverride(id, field, value, labelText) { this.setOverrides(id, { [field]: value }, labelText ?? `Override ${id}.${field.replace(/^props\./, '')}`); }

  /**
   * Several fields of one inner node as one undo step (a gizmo drag that moved and turned it): `{ field: value }`.
   * @param {string} id @param {Record<string, any>} fields @param {string} [labelText]
   */
  setOverrides(id, fields, labelText) {
    const i = this.innerNode(id);
    if (!i) throw new Error(`no inner node ${id}`);
    const inst = this.node(i.instance);
    let next = inst.overrides;
    for (const [field, value] of Object.entries(fields)) next = withOverride(next, i.target, field, value, i.base);
    const merged = mergeOverride(i.base, next?.[i.target]);
    // an override merges into the prefab's value (objects deeply, behaviours by name): it can set and replace, not take a
    // key or a value away that the prefab has. Such an edit is refused, saying so, rather than kept without the change.
    for (const [field, value] of Object.entries(fields)) {
      if (!sameDeep(fieldValue(merged, field), value)) throw new Error(`${id}.${field.replace(/^props\./, '')}: an override can't take away what the prefab sets (${value === undefined ? 'clearing it' : 'a key or value it has'}); revert the override, or change the prefab itself`);
    }
    if (sameJSON(next, inst.overrides)) return;
    const errs = this.editor.checkNode({ ...merged, id: i.target.replace(/\//g, '-') });
    if (errs.length) throw new Error(`${id}: ${errs.join('; ')}`);
    this.run(labelText ?? `Override ${id}`, [{ op: 'set', id: i.instance, path: 'overrides', value: next }]);
  }

  /**
   * Revert overrides of an instance: one field of one inner node, every field of one inner node (no field), or all of
   * them (no target). The instance takes the prefab's values again; one undo step.
   * @param {string} instanceId @param {string} [target] @param {string} [field]
   */
  revertOverride(instanceId, target, field) {
    const inst = this.node(instanceId);
    if (inst?.type !== 'Instance') throw new Error(`${instanceId} isn't a prefab instance`);
    const next = target === undefined ? undefined : withoutOverride(inst.overrides, target, field);
    if (sameJSON(next, inst.overrides)) return;
    const what = target === undefined ? `all of ${instanceId}` : field === undefined ? `${instanceId}/${target}` : `${instanceId}/${target}.${field.replace(/^props\./, '')}`;
    this.run(`Revert ${what}`, [{ op: 'set', id: instanceId, path: 'overrides', value: next }]);
  }

  /**
   * Apply overrides of an instance to its prefab: the instance's values are written into the prefab's document (every
   * instance of it, in every scene, follows once it's saved) and the overrides are dropped. One field, one inner node's,
   * or all (as revertOverride picks them); stale ones (no such node in the prefab) are left. One undo step that puts the
   * prefab back too. Refused when the prefab would come out invalid. This scene's other instances of the prefab that
   * override an applied field with the value the prefab now has lose that override in the same step (they follow the
   * prefab again). → what was written: { ref, fields, followed } (followed: those instances' ids)
   * @param {string} instanceId @param {string} [target] @param {string} [field]
   */
  applyOverride(instanceId, target, field) {
    this.mustEdit('Apply');
    const o = this.overridesOf(instanceId);
    if (!o) throw new Error(`${instanceId} isn't a prefab instance`);
    if (!o.loaded) throw new Error(`prefab ${o.ref} isn't loaded`);
    const picked = o.entries.filter((e) => !e.missing && (target === undefined || e.target === target) && (field === undefined || e.field === field));
    if (!picked.length) return { ref: o.ref, fields: 0 };
    const inst = this.node(instanceId);
    const before = this.prefabs.get(o.ref);
    let doc = before, overrides = inst.overrides;
    for (const e of picked) { doc = applyToPrefab(doc, e.target, e.field, e.value, this.prefabs); overrides = withoutOverride(overrides, e.target, e.field); }
    const trial = new Map(this.prefabs); trial.set(o.ref, doc);
    const had = new Set(this.validator.check(before, { prefabs: this.prefabs }).errors);
    const errs = this.validator.check(doc, { prefabs: trial }).errors.filter((e) => !had.has(e));
    if (errs.length) throw new Error(`Apply to ${o.ref} refused: the prefab would be invalid (${errs.slice(0, 3).join('; ')})`);
    // this scene's other instances of the prefab that override an applied field with the value the prefab now has: those
    // overrides go in the same step, so they follow the prefab again (an override that equals the prefab only pins it)
    const nodes = prefabNodes(doc, trial), others = [];
    const ops = [{ op: 'prefab', ref: o.ref, doc }, { op: 'set', id: instanceId, path: 'overrides', value: overrides }];
    for (const n of this.doc.nodes) {
      if (n.id === instanceId || n.type !== 'Instance' || !n.overrides || this.prefabRef(n) !== o.ref) continue;
      let next = n.overrides;
      for (const e of picked) {
        const base = nodes.get(e.target);
        if (!base || rawField(next?.[e.target], e.field) === undefined) continue;
        if (sameDeep(fieldValue(mergeOverride(base, next[e.target]), e.field), fieldValue(base, e.field))) next = withoutOverride(next, e.target, e.field);
      }
      if (!sameJSON(next, n.overrides)) { ops.push({ op: 'set', id: n.id, path: 'overrides', value: next }); others.push(n.id); }
    }
    const what = target === undefined ? `${instanceId}'s overrides` : field === undefined ? `${instanceId}/${target}` : `${instanceId}/${target}.${field.replace(/^props\./, '')}`;
    this.run(`Apply ${what} to ${o.ref}`, ops);
    return { ref: o.ref, fields: picked.length, followed: others };
  }

  /** Prefabs an Apply has changed since they were read or saved: what Save writes beside the scene. */
  dirtyPrefabs() { return [...this.prefabSaved].filter(([ref, text]) => this.prefabs.has(ref) && serialize(this.prefabs.get(ref)) !== text).map(([ref]) => ref); }
  /** A prefab document's canonical text now (what Save writes for it). */
  prefabText(ref) { const d = this.prefabs.get(ref); if (!d) throw new Error(`prefab ${ref} not loaded`); return serialize(d); }
  /** `text` has been written as prefab `ref`. */
  markPrefabSaved(ref, text) { this.prefabSaved.set(ref, text); this.emit({ kind: 'save' }); }

  // ---------------------------------------------------------------- files

  /**
   * Save: the canonical text (what to write). Marks the session saved, so only for a caller whose write can't fail.
   * One that writes to a disk takes `text()`, writes it, and calls `markSaved` once the write has succeeded: a failed
   * save must leave the document unsaved, or the next close loses it without asking (AB-T-0593).
   */
  save(path = this.path) {
    const text = this.text();
    this.markSaved(text, path);
    return text;
  }

  /**
   * `text` has been written (to `path`): the session is saved as of that text. An edit made while it was being written
   * stays unsaved.
   */
  markSaved(text, path = this.path) {
    this.savedText = text; this.path = path;
    this.emit({ kind: 'save' });
  }

  // ---------------------------------------------------------------- play in place

  /**
   * Play: snapshot the document and build a world from a copy of it. The edited document isn't touched while playing.
   * @param {(doc: any) => Promise<any> | any} build the app's world builder (gets a copy) → whatever it plays
   */
  async startPlay(build) {
    this.mustEdit('Play');
    const before = { text: this.text(), hash: this.hash(), selection: [...this.selection] };
    this.mode = 'playing';
    try {
      this.play = { before, world: await build(parse(before.text)) };
    } catch (e) { this.mode = 'editing'; this.play = null; throw e; }
    this.emit({ kind: 'play' });
    return this.play.world;
  }

  /**
   * Stop: dispose the play world and come back to the document as it was before Play. → { restored, hash }
   * @param {(world: any) => void} [dispose]
   */
  stopPlay(dispose) {
    if (this.mode !== 'playing') return { restored: true, hash: this.hash() };
    const { before, world } = this.play;
    dispose?.(world);
    this.play = null; this.mode = 'editing';
    const text = this.text();
    if (text !== before.text) { // never expected: put the document back exactly as it was
      const doc = parse(before.text);
      this.doc.nodes = doc.nodes; this.doc.assets = doc.assets; this.doc.connections = doc.connections;
    }
    this.selection = before.selection.filter((id) => this.node(id));
    this.emit({ kind: 'stop' });
    return { restored: text === before.text, hash: this.hash(), before: before.hash };
  }

  // ---------------------------------------------------------------- helpers

  mustEdit(what) { if (this.mode !== 'editing') throw new Error(`${what}: stop playing first`); }
  tidySelection() { this.selection = this.selection.filter((id) => this.node(id) || this.innerNode(id)); }
  /** New nodes go under the scene's single root when there is one, else at the top level. */
  defaultParent() { const roots = this.doc.nodes.filter((n) => n.parent === undefined); return roots.length === 1 ? roots[0].id : undefined; }
  subtreeIds(id) { const out = [id]; for (let i = 0; i < out.length; i++) for (const n of this.doc.nodes) if (n.parent === out[i]) out.push(n.id); return out; }
  isAncestor(a, b) { for (let n = this.node(b); n?.parent !== undefined; n = this.node(n.parent)) if (n.parent === a) return true; return false; }
}

const sameJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** A schema's checker, compiled once per schema (a registry's argument schemas live as long as it does). */
const checkers = new WeakMap();
function checkerOf(schema) {
  if (!schema || typeof schema !== 'object') return () => [];
  if (!checkers.has(schema)) checkers.set(schema, schemaChecker(schema));
  return checkers.get(schema);
}
/** The game nodes whose key defaults to their id, and the part of the game state a condition names them by. */
const KEYED = { GameCounter: 'counters', GameTimer: 'timers', GameGoal: 'goals' };
/** A connection as a file keeps it: its four parts, then its arguments when it has any (an empty set is left out). */
/** @param {any} c */
function tidyConnection(c) {
  const { from, signal, to, call, args, ...rest } = c;
  const a = args && Object.keys(args).length ? clone(args) : undefined;
  return { ...clone(rest), from, signal, to, call, ...(a ? { args: a } : {}) };
}
/** A sequence block with the node ids its tracks target and its shots and clips film from rewritten by `fn`. */
function renameInSequence(seq, fn) {
  const out = clone(seq);
  const at = (o, k) => { if (o && typeof o[k] === 'string') o[k] = fn(o[k]); };
  for (const s of out.shots ?? []) at(s, 'camera');
  for (const t of out.tracks ?? []) { at(t, 'target'); for (const c of t.clips ?? []) at(c, 'camera'); }
  return out;
}
const sortDeep = (v) => (Array.isArray(v) ? v.map(sortDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])])) : v);
/** Equal as data, whatever the key order. */
const sameDeep = (a, b) => JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));
const round = (v) => Math.round(v * 1e6) / 1e6; // a micrometre / a millionth: keeps files short and diffs stable
/** The set op that gives node `n` the transform parts in `t`, the rest kept; identity parts dropped from the file. */
function transformOp(n, t) {
  const next = { ...(n.transform ?? {}) };
  for (const k of TRANSFORM_KEYS) if (t[k] !== undefined) next[k] = t[k].map(round);
  if (next.p && next.p.every((v) => v === 0)) delete next.p;
  if (next.q && next.q[0] === 0 && next.q[1] === 0 && next.q[2] === 0 && next.q[3] === 1) delete next.q;
  if (next.s && next.s.every((v) => v === 1)) delete next.s;
  return { op: 'set', id: n.id, path: 'transform', value: Object.keys(next).length ? next : undefined };
}
/**
 * The set ops that give node `n` prop `key` (undefined clears it): none when it holds that already. A node with no props
 * gets an empty props object first, and clearing its last prop removes the object after, so undo gives back the node
 * byte for byte. The value itself always goes through `props.<key>`, where the scene editor checks node references.
 */
function propOps(n, key, value) {
  const props = n.props;
  if (JSON.stringify(props?.[key]) === JSON.stringify(value)) return [];
  const set = { op: 'set', id: n.id, path: `props.${key}`, value };
  if (props === undefined) return [{ op: 'set', id: n.id, path: 'props', value: {} }, set];
  if (value === undefined && Object.keys(props).length === 1 && Object.hasOwn(props, key)) return [set, { op: 'set', id: n.id, path: 'props', value: undefined }];
  return [set];
}
const transformKind = (t) => (t.p && !t.q && !t.s ? 'Move' : t.q && !t.p && !t.s ? 'Rotate' : t.s && !t.p && !t.q ? 'Scale' : 'Transform');
const labelOf = (op) => label(op);
function transform(at, q) {
  const t = {};
  if (at && at.some((v) => v !== 0)) t.p = at.map(round);
  if (q && !(q[0] === 0 && q[1] === 0 && q[2] === 0 && q[3] === 1)) t.q = q.map(round);
  return Object.keys(t).length ? t : null;
}
function label(op) {
  if (op.label) return op.label;
  return op.op === 'set' ? `Set ${op.id}.${op.path}` : op.op === 'add' ? `Add ${op.node.id}` : op.op === 'remove' ? `Delete ${op.id}` : op.op;
}
