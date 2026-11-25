// An editing session on one .vrmxs scene (M1 W7): the document, its edit history, the selection, and play in place.
// No UI and no three.js: the editor app draws it, MCP can drive the same session, and Node tests exercise it.
//
// Every command is one undo step (a batch of @vrmxg/scene's edit ops with a label: "Add cafe", "Move mira"), so the
// app's Undo menu, MCP's undo and the history read the same. Commands refuse while playing.
//
// Play in place: Play takes a snapshot of the document (its canonical text and hash) and hands a copy to the app's
// world builder; the edited document is never touched while playing. Stop disposes the play world and checks the
// document is exactly as it was before Play (text and hash), which is the promise the editor makes.
import { createEditor, createValidator, parse, serialize } from '@vrmxg/scene';
import { hashValue } from '@vrmxg/snapshot';
import { assetType, nodeTypeFor, slug, uniqueId } from './assets.js';
import { SequenceCommands } from './sequence.js';
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
    this.editor = createEditor(registry, this.doc, { prefabs: () => this.prefabs });
    this.validator = createValidator(registry);
    this.savedText = text ?? serialize(this.doc);
    /** @type {string[]} selected node ids; the last is the primary (the inspector's) */ this.selection = [];
    /** 'editing' | 'playing' */ this.mode = 'editing';
    /** An open gesture (a number field's drag): its edits fold into one undo step. @type {{ depth: number, ops: any[] } | null} */ this.gesture = null;
    this.play = null;
    this.listeners = new Set();
    /** Ids a sequence's tracks may target beyond the document's own (the set's nodes): the app sets it. @type {(() => Set<string>) | null} */
    this.targetIds = null;
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
  tree() {
    const by = new Map(this.doc.nodes.map((n) => [n.id, { node: n, children: [] }]));
    const roots = [];
    for (const n of this.doc.nodes) (n.parent !== undefined && by.has(n.parent) ? by.get(n.parent).children : roots).push(by.get(n.id));
    return roots;
  }
  /** The canonical text of the document now (what Save writes). */
  text() { return serialize(this.doc); }
  /** A hash of the document's canonical text: equal hashes, equal files. */
  hash() { return hashValue(this.text()); }
  get dirty() { return this.text() !== this.savedText; }
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
    const want = (Array.isArray(ids) ? ids : ids == null ? [] : [ids]).filter((id) => this.node(id));
    this.selection = add ? [...this.selection.filter((x) => !want.includes(x)), ...want] : want;
    this.emit({ kind: 'select' });
  }

  // ---------------------------------------------------------------- commands (each one undo step)

  /** Apply edit ops as one undo step. */
  run(label, ops) {
    if (this.mode !== 'editing') throw new Error(`${label}: stop playing first`);
    if (!ops.length) return;
    this.editor.apply(ops.length === 1 && !ops[0].label ? { ...ops[0], label } : { op: 'batch', label, ops });
    this.gesture?.ops.push(this.editor.peek().undo);
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
  // first move, the edits, endGesture on release, which folds the drag's steps into one with the last edit's label.
  // An edit from elsewhere in between (MCP) isn't folded: the drag's steps then stay as they were.

  /** Start a gesture: the edits until endGesture become one undo step. */
  beginGesture() {
    this.mustEdit('Edit');
    this.gesture = { depth: this.editor.peek().undoDepth, ops: [] };
  }

  /** Is a gesture open? */
  get gesturing() { return !!this.gesture; }

  /**
   * End the gesture: its steps become one (labelled as its last), or none when the values came back to where they
   * started. → the step's label, or null when nothing changed
   */
  endGesture() {
    const g = this.gesture; this.gesture = null;
    if (!g) return null;
    const mine = this.gestureSteps(g);
    if (!mine) return this.history().undo;
    if (!mine.length) return null;
    const label = labelOf(mine.at(-1));
    const before = this.text();
    for (let i = 0; i < mine.length; i++) this.editor.undo();
    if (this.text() === before) { this.editor.dropRedo(); this.tidySelection(); this.emit({ kind: 'undo', label }); return null; } // back where it began: nothing to redo either
    const all = mine.flatMap((op) => (op.op === 'batch' ? op.ops : [op])).map(({ label: _l, ...o }) => o);
    // a drag sets the same paths over and over: keep each path's last set (in the order they were last set)
    const lastAt = new Map(all.map((o, i) => [o.op === 'set' ? `${o.id}\u0000${o.path}` : i, i]));
    const ops = all.filter((o, i) => lastAt.get(o.op === 'set' ? `${o.id}\u0000${o.path}` : i) === i);
    this.editor.apply({ op: 'batch', label, ops });
    this.tidySelection();
    this.emit({ kind: 'edit', label });
    return label;
  }

  /** Abandon the gesture: its edits are undone (Escape during a drag). */
  cancelGesture() {
    const g = this.gesture; this.gesture = null;
    if (!g) return;
    const mine = this.gestureSteps(g);
    if (!mine?.length) return;
    for (let i = 0; i < mine.length; i++) this.editor.undo();
    this.editor.dropRedo(); // an abandoned drag isn't redone (its first edit had cleared any redo there was)
    this.tidySelection();
    this.emit({ kind: 'undo', label: labelOf(mine[0]) });
  }

  /** The gesture's own steps, oldest first; null when another edit came in between (or an undo went below its start). */
  gestureSteps(g) {
    const all = this.editor.history();
    if (all.length < g.depth) return null;
    const mine = all.slice(g.depth);
    return mine.every((op) => g.ops.includes(op)) ? mine : null;
  }

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
  tidySelection() { this.selection = this.selection.filter((id) => this.node(id)); }
  /** New nodes go under the scene's single root when there is one, else at the top level. */
  defaultParent() { const roots = this.doc.nodes.filter((n) => n.parent === undefined); return roots.length === 1 ? roots[0].id : undefined; }
  subtreeIds(id) { const out = [id]; for (let i = 0; i < out.length; i++) for (const n of this.doc.nodes) if (n.parent === out[i]) out.push(n.id); return out; }
  isAncestor(a, b) { for (let n = this.node(b); n?.parent !== undefined; n = this.node(n.parent)) if (n.parent === a) return true; return false; }
}

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
