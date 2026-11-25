// Copy, paste and duplicate of scene nodes (M5 W5, AB-T-0604), as plain functions the session's commands use. A clip
// is plain JSON: the copied nodes with their subtrees (parents before children), the asset entries they name, and the
// connections they send. Pasting gives every node a fresh id, keeps references inside the clip pointing inside
// it (parents, node-reference props and behaviour params, connections), reuses the target document's asset entry for
// the same file, and is one batch of edit ops: one undo step. A prefab instance is copied whole, its overrides with it.

const clone = (v) => structuredClone(v);
export const CLIP_FORMAT = 'vrmxg-nodes';

/** `id` with its trailing number taken off, then the first of base-2, base-3… nobody has: chair-1 → chair-2. */
export function freshId(id, taken) {
  const base = String(id).replace(/-\d+$/, '') || 'node';
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** The ids of `ids` whose ancestors aren't also in `ids` (a node copied with its parent goes with it). */
export function topmost(doc, ids) {
  const by = new Map(doc.nodes.map((n) => [n.id, n]));
  const set = new Set(ids.filter((id) => by.has(id)));
  const under = (id) => { for (let n = by.get(id); n?.parent !== undefined; n = by.get(n.parent)) if (set.has(n.parent)) return true; return false; };
  return [...set].filter((id) => !under(id));
}

/** A node's subtree, the node first, each parent before its children. */
export function subtree(doc, id) {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const n of doc.nodes) if (n.parent === out[i]) out.push(n.id);
  return out;
}

/**
 * Copy nodes (each with its subtree) out of a document. → a clip, or null when none of `ids` is in it.
 * @param {any} doc @param {string[]} ids
 */
export function copyNodes(doc, ids) {
  const roots = topmost(doc, ids).sort((a, b) => indexOf(doc, a) - indexOf(doc, b));
  if (!roots.length) return null;
  const order = roots.flatMap((id) => subtree(doc, id));
  const inClip = new Set(order);
  const nodes = order.map((id) => clone(doc.nodes.find((n) => n.id === id)));
  const used = new Set(nodes.map((n) => n.asset).filter(Boolean));
  const assets = (doc.assets ?? []).filter((a) => used.has(a.id)).map(clone);
  const base = (ref) => String(ref).split('/')[0];
  // what the copied nodes send (to each other or to the rest of the scene); a signal from outside into them stays the
  // original's, as a duplicate in Godot doesn't take the connections coming in
  const connections = (doc.connections ?? []).filter((c) => inClip.has(base(c.from))).map(clone);
  return { format: CLIP_FORMAT, version: 1, roots, nodes, assets, connections };
}

/** Is `v` a clip (copyNodes' shape, e.g. read back from the system clipboard)? */
export function isClip(v) {
  return !!v && v.format === CLIP_FORMAT && v.version === 1 && Array.isArray(v.nodes) && Array.isArray(v.roots) && v.nodes.every((n) => n && typeof n.id === 'string' && typeof n.type === 'string');
}

/**
 * The edit ops that paste a clip into a document. → { ops, roots, ids } (roots: the pasted roots' new ids; ids: old → new)
 * @param {any} doc the target document
 * @param {any} reg the registry (which props and params name nodes)
 * @param {any} clip
 * @param {{ parent?: string | null, defaultParent?: string, after?: boolean }} [opts]
 *   parent: where the roots go (null: the top level); by default each root's own parent where the document has it,
 *   else `defaultParent`. after: insert each root's copy right after the original's subtree (duplicate), else at the end.
 */
export function pasteOps(doc, reg, clip, { parent, defaultParent, after = false } = {}) {
  if (!isClip(clip)) throw new Error('nothing to paste: the clipboard holds no nodes');
  const has = (id) => doc.nodes.some((n) => n.id === id);
  const taken = new Set(doc.nodes.map((n) => n.id));
  const ids = new Map();
  for (const n of clip.nodes) { const id = freshId(n.id, taken); taken.add(id); ids.set(n.id, id); }
  const ops = [];
  // asset entries: the document's own for the same file, else the clip's (under an id nobody has)
  const assetIds = new Map(), takenAssets = new Set((doc.assets ?? []).map((a) => a.id));
  for (const a of clip.assets ?? []) {
    const same = (doc.assets ?? []).find((x) => x.ref === a.ref && x.type === a.type);
    if (same) { assetIds.set(a.id, same.id); continue; }
    let id = a.id; for (let i = 2; takenAssets.has(id); i++) id = `${a.id}-${i}`;
    takenAssets.add(id); assetIds.set(a.id, id);
    ops.push({ op: 'addAsset', asset: { ...clone(a), id } });
  }
  // a reference into the clip, a whole node ("door-1") or a node inside a prefab instance ("door-1/hinge"), follows the copy
  const remapRef = (ref) => { const [b, ...rest] = String(ref).split('/'); return ids.has(b) ? [ids.get(b), ...rest].join('/') : ref; };
  const remap = (v) => (typeof v === 'string' ? remapRef(v) : v);
  const rootParent = (n) => (parent !== undefined ? parent ?? undefined : n.parent !== undefined && has(n.parent) ? n.parent : defaultParent);
  const made = clip.nodes.map((src) => {
    const n = clone(src);
    n.id = ids.get(src.id);
    const p = ids.has(src.parent) ? ids.get(src.parent) : rootParent(src);
    if (p === undefined) delete n.parent; else n.parent = p;
    if (n.asset !== undefined) n.asset = assetIds.get(n.asset) ?? n.asset;
    const t = reg.get(n.type);
    for (const k of Object.keys(n.props ?? {})) if (t?.props[k]?.nodeRef) n.props[k] = remap(n.props[k]);
    for (const b of n.behaviours ?? []) {
      const d = reg.behaviours?.get(b.use);
      for (const k of Object.keys(b.params ?? {})) if (d?.params[k]?.nodeRef) b.params[k] = remap(b.params[k]);
    }
    return n;
  });
  // the nodes, each root with its subtree; a duplicate lands right after its original
  const groups = clip.roots.map((r) => { const own = new Set(subtree({ nodes: clip.nodes }, r)); return { root: r, nodes: made.filter((n, i) => own.has(clip.nodes[i].id)) }; });
  if (after) {
    const end = (r) => Math.max(...subtree(doc, r).map((id) => indexOf(doc, id)));
    // last original first, so an insert never moves the place a later one is aimed at
    for (const g of [...groups].sort((a, b) => (has(b.root) ? end(b.root) : -1) - (has(a.root) ? end(a.root) : -1))) {
      const at = has(g.root) ? end(g.root) + 1 : undefined;
      g.nodes.forEach((n, i) => ops.push({ op: 'add', node: n, ...(at !== undefined ? { index: at + i } : {}) }));
    }
  } else for (const g of groups) for (const n of g.nodes) ops.push({ op: 'add', node: n });
  // the connections the clip sends: ends inside it move to the copies; an end outside it must be in this document
  const inside = (ref) => ids.has(String(ref).split('/')[0]);
  const exists = (ref) => inside(ref) || has(String(ref).split('/')[0]);
  for (const c of clip.connections ?? []) {
    if (!exists(c.from) || !exists(c.to)) continue;
    const to = remapRef(c.to), toNode = made.find((n) => n.id === to.split('/')[0]) ?? doc.nodes.find((n) => n.id === to.split('/')[0]);
    const argDefs = toNode ? reg.surface(toNode).actions?.[c.call]?.args ?? {} : {};
    const args = c.args ? Object.fromEntries(Object.entries(c.args).map(([k, v]) => [k, argDefs[k]?.nodeRef ? remap(v) : v])) : undefined;
    ops.push({ op: 'connect', from: remapRef(c.from), signal: c.signal, to, call: c.call, ...(args ? { args } : {}) });
  }
  return { ops, roots: clip.roots.map((r) => ids.get(r)), ids };
}

function indexOf(doc, id) { return doc.nodes.findIndex((n) => n.id === id); }
