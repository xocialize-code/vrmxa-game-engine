// Copy, paste and duplicate of scene nodes (M5 W5, AB-T-0604), as plain functions the session's commands use. A clip
// is plain JSON: the copied nodes with their subtrees (parents before children), the asset entries they name, and the
// connections they send. Pasting gives every node a fresh id, reuses the target document's asset entry for the same
// file, and is one batch of edit ops: one undo step. A prefab instance is copied whole, its overrides with it.
//
// References. Every place a node is named, at any depth, is found from the registry: a prop or behaviour param marked
// `nodeRef`, the fields an object prop lists in `meta.nodeRefs` (a VirtualCamera's body.target, aim.targets[], …), the
// same inside a prefab instance's override values (by the inner node's type), and a connection's ends and node args.
// Each is remapped when it names a node of the clip ("door-1", "door-1/hinge", "mira#head" alike), kept when the target
// document has the node it names, and otherwise dropped (the prop goes back to its default, a list loses the entry, a
// connection isn't made), so a paste into another scene leaves it valid.
//
// A clip read back from the system clipboard is data: isClip checks it whole (shape, unique ids, parents inside it
// with no cycle, a size limit) before anything walks it.

const clone = (v) => structuredClone(v);
export const CLIP_FORMAT = 'vrmxg-nodes';
/** The most nodes, asset entries and connections a clip may hold (a whole level is a few hundred nodes). */
export const CLIP_LIMIT = 5000;

/** `id` with its trailing number taken off, then the first of base-2, base-3… nobody has: chair-1 → chair-2. */
export function freshId(id, taken) {
  const base = String(id).replace(/-\d+$/, '') || 'node';
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** The ids of `ids` whose ancestors aren't also in `ids` (a node copied with its parent goes with it). */
export function topmost(doc, ids) {
  const by = new Map(doc.nodes.map((n) => [n.id, n]));
  const set = new Set(ids.filter((id) => by.has(id)));
  const under = (id) => { const seen = new Set(); for (let n = by.get(id); n?.parent !== undefined && !seen.has(n.id); n = by.get(n.parent)) { seen.add(n.id); if (set.has(n.parent)) return true; } return false; };
  return [...set].filter((id) => !under(id));
}

/** A node's subtree, the node first, each parent before its children (each node once, whatever the parents say). */
export function subtree(doc, id) {
  const out = [id], seen = new Set(out);
  for (let i = 0; i < out.length; i++) for (const n of doc.nodes) if (n.parent === out[i] && !seen.has(n.id)) { seen.add(n.id); out.push(n.id); }
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
  // what the copied nodes send (to each other or to the rest of the scene); a signal from outside into them stays the
  // original's, as a duplicate in Godot doesn't take the connections coming in
  const connections = (doc.connections ?? []).filter((c) => inClip.has(baseOf(c.from))).map(clone);
  return { format: CLIP_FORMAT, version: 1, roots, nodes, assets, connections };
}

const str = (v) => typeof v === 'string' && v.length > 0 && v.length <= 512;
const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Is `v` a clip copyNodes could have made? Checked whole, as anything read from the system clipboard is untrusted: the
 * format and version, at most CLIP_LIMIT entries of each kind, nodes with unique string ids and types, roots that are
 * nodes of the clip whose own parents are outside it, every other node's parent inside the clip and reaching a root
 * (no cycle), asset entries and connections of the right shape.
 */
export function isClip(v) {
  if (!plain(v) || v.format !== CLIP_FORMAT || v.version !== 1) return false;
  const { nodes, roots, assets = [], connections = [] } = v;
  if (!Array.isArray(nodes) || !Array.isArray(roots) || !Array.isArray(assets) || !Array.isArray(connections)) return false;
  if (!nodes.length || nodes.length > CLIP_LIMIT || roots.length > nodes.length || assets.length > CLIP_LIMIT || connections.length > CLIP_LIMIT) return false;
  const by = new Map();
  for (const n of nodes) {
    if (!plain(n) || !str(n.id) || n.id.includes('/') || !str(n.type) || by.has(n.id)) return false;
    if (n.parent !== undefined && !str(n.parent)) return false;
    if (n.props !== undefined && !plain(n.props)) return false;
    if (n.behaviours !== undefined && !(Array.isArray(n.behaviours) && n.behaviours.every((b) => plain(b) && str(b.use) && (b.params === undefined || plain(b.params))))) return false;
    if (n.overrides !== undefined && !plain(n.overrides)) return false;
    by.set(n.id, n);
  }
  const rootSet = new Set(roots);
  if (!roots.length || rootSet.size !== roots.length || roots.some((r) => !by.has(r) || by.has(by.get(r).parent))) return false;
  for (const n of nodes) { // every node reaches a root through parents inside the clip, in at most nodes.length steps
    let x = n;
    for (let steps = 0; !rootSet.has(x.id); steps++) { if (steps > nodes.length || !by.has(x.parent)) return false; x = by.get(x.parent); }
  }
  if (!assets.every((a) => plain(a) && str(a.id) && str(a.type) && str(a.ref))) return false;
  return connections.every((c) => plain(c) && str(c.from) && str(c.to) && str(c.signal) && str(c.call) && (c.args === undefined || plain(c.args)));
}

/** "door-1/hinge#head" → "door-1": the node of the scene a reference starts from. */
function baseOf(ref) { return String(ref).split('/')[0].split('#')[0]; }

/**
 * The places a node is named in a props object of `type`: [{ path: string[], each: boolean }] (each: the last step is a
 * list whose items are references), from `nodeRef` props and object props' `meta.nodeRefs`.
 */
export function refPaths(reg, type) {
  const out = [];
  for (const [k, p] of Object.entries(reg.get(type)?.props ?? {})) {
    if (p.nodeRef) out.push({ path: [k], each: false });
    for (const r of p.meta?.nodeRefs ?? []) {
      const each = r.endsWith('[]');
      out.push({ path: [k, ...r.replace(/\[\]$/, '').split('.')], each });
    }
  }
  return out;
}

/**
 * Rewrite every reference in a props object: fn(ref) → the new reference, or undefined to drop it. Mutates `props`.
 * @param {any} props @param {{ path: string[], each: boolean }[]} paths @param {(ref: string) => string | undefined} fn
 */
export function mapRefs(props, paths, fn) {
  if (!plain(props)) return;
  for (const { path, each } of paths) {
    let o = props;
    for (const k of path.slice(0, -1)) { o = o?.[k]; if (!plain(o)) break; }
    const last = path.at(-1);
    if (!plain(o) || o[last] === undefined) continue;
    if (each) {
      if (!Array.isArray(o[last])) continue;
      o[last] = o[last].map((v) => (typeof v === 'string' ? fn(v) : v)).filter((v) => v !== undefined);
    } else if (typeof o[last] === 'string') {
      const v = fn(o[last]);
      if (v === undefined) delete o[last]; else o[last] = v;
    }
  }
}

/**
 * The edit ops that paste a clip into a document. → { ops, roots, ids } (roots: the pasted roots' new ids; ids: old → new)
 * @param {any} doc the target document
 * @param {any} reg the registry (which props and params name nodes)
 * @param {any} clip
 * @param {{ parent?: string | null, defaultParent?: string, after?: boolean, prefabs?: Map<string, any> }} [opts]
 *   parent: where the roots go (null: the top level); by default each root's own parent where the document has it,
 *   else `defaultParent`. after: insert each root's copy right after the original's subtree (duplicate), else at the end.
 *   prefabs: prefab documents by ref (references inside an instance's overrides and to its inner nodes)
 */
export function pasteOps(doc, reg, clip, { parent, defaultParent, after = false, prefabs = new Map() } = {}) {
  if (!isClip(clip)) throw new Error('nothing to paste: the clipboard holds no nodes');
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const has = (id) => byId.has(id);
  const taken = new Set(byId.keys());
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
    ops.push({ op: 'addAsset', asset: { id, type: a.type, ref: a.ref } });
  }
  // a reference: into the clip it follows the copy; to a node this document has it stays; anything else is dropped
  const ref = (r) => { const b = baseOf(r); return ids.has(b) ? ids.get(b) + String(r).slice(b.length) : has(b) ? r : undefined; };
  const assetRef = (n) => (clip.assets ?? []).find((a) => a.id === n.asset)?.ref ?? (doc.assets ?? []).find((a) => a.id === n.asset)?.ref;
  const innerOf = (instance, local) => prefabs.get(assetRef(instance))?.nodes?.find((x) => x.id === local) ?? null;
  const rootParent = (n) => (parent !== undefined ? parent ?? undefined : n.parent !== undefined && has(n.parent) ? n.parent : defaultParent);
  const made = clip.nodes.map((src) => {
    const n = clone(src);
    n.id = ids.get(src.id);
    const p = ids.has(src.parent) ? ids.get(src.parent) : rootParent(src);
    if (p === undefined) delete n.parent; else n.parent = p;
    if (n.asset !== undefined) n.asset = assetIds.get(n.asset) ?? n.asset;
    mapRefs(n.props, refPaths(reg, n.type), ref);
    for (const b of n.behaviours ?? []) {
      const d = reg.behaviours?.get(b.use);
      for (const k of Object.keys(b.params ?? {})) if (d?.params[k]?.nodeRef && typeof b.params[k] === 'string') { const v = ref(b.params[k]); if (v === undefined) delete b.params[k]; else b.params[k] = v; }
    }
    // an instance's overrides: each inner node's values, by that node's own type in the prefab
    for (const [local, ov] of Object.entries(n.overrides ?? {})) {
      const inner = innerOf(src, local);
      if (inner && plain(ov)) mapRefs(ov.props, refPaths(reg, inner.type), ref);
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
  // the connections the clip sends: both ends must resolve (into the copies, or to nodes this document has)
  const nodeOf = (r) => {
    const [b, local] = String(r).split('/');
    const top = made.find((n) => n.id === b) ?? byId.get(b);
    return local === undefined ? top : top ? innerOf(top, local) : null;
  };
  for (const c of clip.connections ?? []) {
    const from = ref(c.from), to = ref(c.to);
    if (from === undefined || to === undefined) continue;
    const target = nodeOf(to);
    const argDefs = target ? reg.surface(target).actions?.[c.call]?.args ?? {} : {};
    let args;
    if (c.args) {
      args = {};
      for (const [k, v] of Object.entries(c.args)) {
        if (!argDefs[k]?.nodeRef || typeof v !== 'string') { args[k] = clone(v); continue; }
        const r = ref(v);
        if (r !== undefined) args[k] = r;
      }
    }
    ops.push({ op: 'connect', from, signal: c.signal, to, call: c.call, ...(args ? { args } : {}) });
  }
  return { ops, roots: clip.roots.map((r) => ids.get(r)), ids };
}

function indexOf(doc, id) { return doc.nodes.findIndex((n) => n.id === id); }
