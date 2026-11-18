// Edits on a .vrmxs document: add, remove (with its subtree), set a value at a path, reparent,
// connect / disconnect, add / remove an asset entry, and a batch of these as one step. Each edit is checked against the registry before it applies, returns its
// inverse, and goes on an undo stack, so an MCP agent's change is as undoable as a user's.
import { Ajv2020 } from 'ajv/dist/2020.js';
import { nodeSchema } from './schema.js';
import { flatten } from './instance.js';

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

/**
 * @param {import('@vrmxg/registry').Registry} reg
 * @param {any} doc the document to edit in place
 * @param {{ prefabs?: () => Map<string, object> }} [options] prefab documents, for connections into instances
 */
export function createEditor(reg, doc, { prefabs } = {}) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const nodeValidators = new Map([...reg.types.keys()].map((t) => [t, ajv.compile(nodeSchema(reg, t))]));
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
    const v = nodeValidators.get(node.type);
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
      // "door-1/hinge" addresses a node inside a prefab instance: resolve it in the flattened view.
      const resolve = (id) => {
        if (!id.includes('/')) return doc.nodes[need(id)];
        const n = prefabs ? flatten(doc, prefabs()).nodes.find((x) => x.id === id) : null;
        if (!n) throw new Error(`no node "${id}" (inner nodes need the instance's prefab loaded)`);
        return n;
      };
      const f = resolve(from), t = resolve(to);
      const sig = reg.surface(f).signals, act = reg.surface(t).actions;
      if (reg.get(f.type) && !sig[signal]) throw new Error(`${f.type} "${from}" has no signal "${signal}" (has: ${Object.keys(sig).join(', ')})`);
      if (reg.get(t.type) && !act[call]) throw new Error(`${t.type} "${to}" has no action "${call}" (has: ${Object.keys(act).join(', ')})`);
      doc.connections ??= [];
      const c = { from, signal, to, call, ...(args ? { args } : {}) };
      doc.connections.push(c);
      return { op: 'disconnect', index: doc.connections.length - 1 };
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
    batch({ ops, label }) { // several edits as one undo step; all or nothing
      const done = [];
      try { for (const o of ops) done.push(run(o)); }
      catch (e) { for (const inv of done.reverse()) run(inv); throw e; }
      return { op: 'batch', ops: done.reverse(), ...(label ? { label } : {}) };
    },
  };
  function run(op) {
    const fn = OPS[op.op];
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
  const peek = () => ({ undo: undoStack.at(-1)?.op ?? null, redo: redoStack.at(-1)?.op ?? null, undoDepth: undoStack.length, redoDepth: redoStack.length });
  return { apply, undo, redo, peek, doc, checkNode, history: () => undoStack.map((e) => e.op) };
}
