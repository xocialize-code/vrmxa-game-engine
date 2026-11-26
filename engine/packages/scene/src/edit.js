// Edits on a .vrmxs document: add, remove (with its subtree), set a value at a path, reparent,
// connect / disconnect / replace a connection, rename a node's id, add / remove / replace an asset entry, and a batch of these as one step. Each edit is checked against the registry before it applies, returns its
// inverse, and goes on an undo stack, so an MCP agent's change is as undoable as a user's.
import { Ajv2020 } from 'ajv/dist/2020.js';
import { nodeSchema } from './schema.js';
import { flatten } from './instance.js';

const clone = (v) => (v === undefined ? undefined : structuredClone(v));
/** The path of a number in `v` that isn't finite (Infinity, NaN: a file can't hold one), or null. */
export function nonFinite(v, at = '') {
  if (typeof v === 'number') return Number.isFinite(v) ? null : at || '/';
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { const p = nonFinite(x, `${at}/${k}`); if (p) return p; }
  return null;
}
const mustBeFinite = (what, v) => { const p = nonFinite(v); if (p) throw new Error(`${what}: ${p === '/' ? 'the value' : p} is not a finite number`); };

/**
 * @param {import('@vrmxg/registry').Registry} reg
 * @param {any} doc the document to edit in place
 * @param {{ prefabs?: () => Map<string, object>, ops?: Record<string, (op: any) => any> }} [options] prefab documents, for
 *   connections into instances; ops: edits of the caller's own beside the document's (M5 W6: a prefab document written
 *   by Apply), each returning its inverse like the built-in ones, so one undo step can span the scene and another file
 */
export function createEditor(reg, doc, { prefabs, ops: extra = {} } = {}) {
  // compiled from the registry as it is now, and again when it changes (a project's behaviours declared or reloaded, M6)
  let nodeValidators = null, compiledAt = -1;
  const validators = () => {
    if (!nodeValidators || compiledAt !== reg.version) {
      const ajv = new Ajv2020({ allErrors: true, strict: false });
      nodeValidators = new Map([...reg.types.keys()].map((t) => [t, ajv.compile(nodeSchema(reg, t))]));
      compiledAt = reg.version;
    }
    return nodeValidators;
  };
  const undoStack = [], redoStack = [];

  const index = (id) => doc.nodes.findIndex((n) => n.id === id);
  const need = (id) => { const i = index(id); if (i < 0) throw new Error(`no node "${id}"`); return i; };
  const subtree = (id) => { // the node and all its descendants, in document order
    const ids = new Set([id]);
    let grew = true;
    while (grew) { grew = false; for (const n of doc.nodes) if (n.parent !== undefined && ids.has(n.parent) && !ids.has(n.id)) { ids.add(n.id); grew = true; } }
    return doc.nodes.map((n, i) => [n, i]).filter(([n]) => ids.has(n.id));
  };

  // A node must pass its type's schema; unknown types only need the base shape.
  function checkNode(node) {
    const v = validators().get(node.type);
    if (!v) return [`unknown node type "${node.type}" (known: ${[...reg.types.keys()].join(', ')})`];
    if (v(node)) return [];
    return v.errors.map((e) => `${node.id}${e.instancePath} ${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : ''}`);
  }

  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
  function setPath(obj, path, value) {
    const ks = path.split('.'); let o = obj;
    for (const k of ks.slice(0, -1)) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
    const last = ks[ks.length - 1];
    if (value === undefined) delete o[last]; else o[last] = value;
  }

  // ---------------------------------------------------------------- the primitive ops
  // Each returns its inverse op.
  const OPS = {
    add({ node, index: at }) {
      if (!node?.id || !node?.type) throw new Error('add needs node.id and node.type');
      mustBeFinite(`add ${node.id}`, node);
      if (index(node.id) >= 0) throw new Error(`node "${node.id}" already exists`);
      if (node.parent !== undefined && index(node.parent) < 0) throw new Error(`parent "${node.parent}" does not exist`);
      const errs = checkNode(node); if (errs.length) throw new Error(errs.join('; '));
      const i = at ?? doc.nodes.length;
      doc.nodes.splice(i, 0, clone(node));
      return { op: 'remove', id: node.id };
    },
    remove({ id }) {
      need(id);
      const removed = subtree(id);
      const conns = (doc.connections ?? []).map((c, i) => [c, i]).filter(([c]) => removed.some(([n]) => n.id === c.from || n.id === c.to));
      for (const [, i] of [...removed].reverse()) doc.nodes.splice(i, 1);
      for (const [, i] of [...conns].reverse()) doc.connections.splice(i, 1);
      return { op: 'restore', nodes: removed.map(([n, i]) => [clone(n), i]), connections: conns.map(([c, i]) => [clone(c), i]) };
    },
    restore({ nodes, connections }) { // inverse of remove: put nodes and connections back where they were
      for (const [n, i] of nodes) doc.nodes.splice(i, 0, clone(n));
      doc.connections ??= [];
      for (const [c, i] of connections) doc.connections.splice(i, 0, clone(c));
      return { op: 'remove', id: nodes[0][0].id };
    },
    set({ id, path, value }) {
      if (!path || /^(id|type)$/.test(path)) throw new Error('set cannot change id or type; remove and add instead');
      if (path === 'parent') throw new Error('use reparent to change parent');
      mustBeFinite(`${id}.${path}`, value);
      const i = need(id);
      const before = clone(getPath(doc.nodes[i], path));
      const next = clone(doc.nodes[i]); setPath(next, path, clone(value));
      const errs = checkNode(next); if (errs.length) throw new Error(errs.join('; '));
      const t = reg.get(next.type), k = path.startsWith('props.') ? path.slice(6).split('.')[0] : null;
      if (k && t?.props[k]?.nodeRef && value !== undefined && index(value) < 0) throw new Error(`${id}.${path} must name an existing node; "${value}" does not exist`);
      doc.nodes[i] = next;
      return { op: 'set', id, path, value: before };
    },
    /** A value in the document itself, outside its nodes: the sequence block (M2 W5) or settings. */
    setDoc({ path, value }) {
      if (!/^(sequence|settings)(\.|$)/.test(path ?? '')) throw new Error(`setDoc edits the sequence or settings, not "${path}"`);
      mustBeFinite(path, value);
      const before = clone(getPath(doc, path));
      if (value !== undefined && JSON.stringify(value) === undefined) throw new Error(`setDoc ${path}: not JSON`);
      setPath(doc, path, clone(value));
      return { op: 'setDoc', path, value: before };
    },
    reparent({ id, parent, index: at }) {
      const i = need(id);
      if (parent !== undefined) {
        need(parent);
        if (subtree(id).some(([n]) => n.id === parent)) throw new Error(`cannot move "${id}" under its own descendant "${parent}"`);
      }
      const node = doc.nodes[i];
      const inverse = { op: 'reparent', id, parent: node.parent, index: i };
      doc.nodes.splice(i, 1);
      const moved = { ...node }; if (parent === undefined) delete moved.parent; else moved.parent = parent;
      doc.nodes.splice(at ?? doc.nodes.length, 0, moved);
      return inverse;
    },
    connect({ from, signal, to, call, args }) {
      checkConnection({ from, signal, to, call });
      doc.connections ??= [];
      const c = { from, signal, to, call, ...(args ? { args: clone(args) } : {}) };
      doc.connections.push(c);
      return { op: 'disconnect', index: doc.connections.length - 1 };
    },
    /** Replace connection `index` in place (M6 W1: the connections panel edits one part of it), checked as connect checks. */
    setConnection({ index: i, connection, restore = false }) {
      const before = doc.connections?.[i];
      if (!before) throw new Error(`no connection ${i}`);
      const { from, signal, to, call, args } = connection ?? {};
      // its inverse puts back what was there, unchecked: inside a batch's undo the nodes it names may come back after it
      if (!restore) checkConnection({ from, signal, to, call });
      mustBeFinite(`connection ${i}`, args);
      const next = clone(connection);
      if (next.args === undefined || next.args === null) delete next.args;
      doc.connections[i] = next;
      return { op: 'setConnection', index: i, connection: before, restore: true };
    },
    /**
     * Give a node another id (M6 W1): the node and its children's parent. Nothing else: the references to it (props,
     * behaviour params, connections, other instances' overrides) are the caller's own ops in the same batch.
     */
    renameNode({ id, to }) {
      if (typeof to !== 'string' || !/^[A-Za-z0-9_-]+$/.test(to)) throw new Error(`"${to}" can't be an id: letters, digits, "-" and "_" only`);
      const i = need(id);
      if (to === id) throw new Error(`${id} already has that id`);
      if (index(to) >= 0) throw new Error(`node "${to}" already exists`);
      doc.nodes[i] = { ...doc.nodes[i], id: to };
      for (const [j, n] of doc.nodes.entries()) if (n.parent === id) doc.nodes[j] = { ...n, parent: to };
      return { op: 'renameNode', id: to, to: id };
    },
    disconnect({ index: i }) {
      const [c] = doc.connections.splice(i, 1);
      if (!c) throw new Error(`no connection ${i}`);
      return { op: 'reconnectAt', index: i, connection: c };
    },
    reconnectAt({ index: i, connection }) { doc.connections.splice(i, 0, connection); return { op: 'disconnect', index: i }; },
    addAsset({ asset, index: at }) { // a document asset entry ({ id, type, ref }); nodes name it by id
      if (!asset?.id || !asset?.type || !asset?.ref) throw new Error('addAsset needs asset.id, asset.type and asset.ref');
      doc.assets ??= [];
      if (doc.assets.some((a) => a.id === asset.id)) throw new Error(`asset "${asset.id}" already exists`);
      const i = at ?? doc.assets.length;
      doc.assets.splice(i, 0, clone(asset));
      return { op: 'removeAsset', id: asset.id };
    },
    removeAsset({ id }) {
      const i = (doc.assets ?? []).findIndex((a) => a.id === id);
      if (i < 0) throw new Error(`no asset "${id}"`);
      const users = doc.nodes.filter((n) => n.asset === id).map((n) => n.id);
      if (users.length) throw new Error(`asset "${id}" is used by ${users.join(', ')}`);
      const [a] = doc.assets.splice(i, 1);
      return { op: 'addAsset', asset: a, index: i };
    },
    setAsset({ id, asset }) { // replace an asset entry in place (same id, same index), e.g. a file's new sha256; nodes keep naming it
      if (!asset?.type || !asset?.ref) throw new Error('setAsset needs asset.type and asset.ref');
      if (asset.id !== undefined && asset.id !== id) throw new Error(`setAsset keeps the asset's id ("${id}", not "${asset.id}")`);
      const i = (doc.assets ?? []).findIndex((a) => a.id === id);
      if (i < 0) throw new Error(`no asset "${id}"`);
      const before = doc.assets[i];
      doc.assets[i] = { ...clone(asset), id };
      return { op: 'setAsset', id, asset: before };
    },
    batch({ ops, label }) { // several edits as one undo step; all or nothing
      const done = [];
      try { for (const o of ops) done.push(run(o)); }
      catch (e) { for (const inv of done.reverse()) run(inv); throw e; }
      return { op: 'batch', ops: done.reverse(), ...(label ? { label } : {}) };
    },
  };
  // A connection's ends and parts: "door-1/hinge" addresses a node inside a prefab instance, resolved in the flattened view
  function resolveEnd(id) {
    if (typeof id !== 'string' || !id) throw new Error('a connection needs from and to');
    if (!id.includes('/')) return doc.nodes[need(id)];
    const n = prefabs ? flatten(doc, prefabs()).nodes.find((x) => x.id === id) : null;
    if (!n) throw new Error(`no node "${id}" (inner nodes need the instance's prefab loaded)`);
    return n;
  }
  function checkConnection({ from, signal, to, call }) {
    const f = resolveEnd(from), t = resolveEnd(to);
    const sig = reg.surface(f).signals, act = reg.surface(t).actions;
    if (reg.get(f.type) && !sig[signal]) throw new Error(`${f.type} "${from}" has no signal "${signal}" (has: ${Object.keys(sig).join(', ')})`);
    if (reg.get(t.type) && !act[call]) throw new Error(`${t.type} "${to}" has no action "${call}" (has: ${Object.keys(act).join(', ')})`);
  }

  function run(op) {
    const fn = Object.hasOwn(OPS, op.op) ? OPS[op.op] : Object.hasOwn(extra, op.op) ? extra[op.op] : null;
    if (!fn) throw new Error(`unknown op "${op.op}"`);
    return fn(op);
  }

  function apply(op) {
    const inverse = run(op);
    undoStack.push({ op, inverse });
    redoStack.length = 0;
    return inverse;
  }
  function undo() {
    const e = undoStack.pop(); if (!e) return false;
    run(e.inverse); redoStack.push(e); return true;
  }
  function redo() {
    const e = redoStack.pop(); if (!e) return false;
    e.inverse = run(e.op); undoStack.push(e); return true;
  }
  /** The edits undo and redo would act on next (their ops, with any `label`), and how many of each there are. */
  /** Forget what redo would do: a session that undid steps only to fold or abandon them (a drag) leaves nothing to redo. */
  const dropRedo = () => { redoStack.length = 0; };
  const peek = () => ({ undo: undoStack.at(-1)?.op ?? null, redo: redoStack.at(-1)?.op ?? null, undoDepth: undoStack.length, redoDepth: redoStack.length });
  return { apply, undo, redo, dropRedo, peek, doc, checkNode, history: () => undoStack.map((e) => e.op) };
}
