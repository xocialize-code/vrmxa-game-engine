// Where a scene names its nodes (M5 W5, generalised in M6 W1), found from the registry, so copy and paste (clipboard.js)
// and changing a node's id (session.js setNodeId) rewrite the same places:
//   - a prop marked `nodeRef`, and the fields an object prop lists in `meta.nodeRefs` ("target", "targets[]" for each item
//     of a list, "[].speaker" for a field of each item of a list prop: a Dialogue's lines);
//   - a behaviour param marked `nodeRef` (a behaviour entry is flat: { use, customer: "aoi", ... });
//   - the same inside a prefab instance's override values, by the inner node's own type in the prefab;
//   - a connection's ends and its node arguments (by the target's action).
// A reference may be "id", "id/inner" (a node inside an instance) or "id#head" (a bone): `fn` gets it whole and returns
// the new reference, or undefined to drop it.

const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? undefined : structuredClone(v));

/** "door-1/hinge#head" → "door-1": the node of the scene a reference starts from. */
export function baseOf(ref) { return String(ref).split('/')[0].split('#')[0]; }

/**
 * The places a node is named in a props object of `type`: [{ path: string[], each: boolean }], where a path step '[]'
 * means every item of a list (each: the last step is a list whose items are references; kept for callers of M5 W5).
 */
export function refPaths(reg, type) {
  const out = [];
  for (const [k, p] of Object.entries(reg.get(type)?.props ?? {})) {
    if (p.nodeRef) out.push({ path: [k], each: false });
    for (const r of p.meta?.nodeRefs ?? []) {
      const steps = [k];
      for (const part of String(r).split('.')) {
        if (part === '[]') { steps.push('[]'); continue; }
        if (part.endsWith('[]')) steps.push(part.slice(0, -2), '[]'); else steps.push(part);
      }
      const each = steps.at(-1) === '[]';
      out.push({ path: each ? steps.slice(0, -1) : steps, each });
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
  for (const { path, each } of paths) walk(props, path, each, fn);
}
function walk(o, path, each, fn) {
  if (o == null || typeof o !== 'object') return;
  const [k, ...rest] = path;
  if (k === '[]') { if (Array.isArray(o)) for (const item of o) walk(item, rest, each, fn); return; }
  if (!plain(o) || o[k] === undefined) return;
  if (rest.length) { walk(o[k], rest, each, fn); return; }
  if (each) {
    if (Array.isArray(o[k])) o[k] = o[k].map((v) => (typeof v === 'string' ? fn(v) : v)).filter((v) => v !== undefined);
  } else if (typeof o[k] === 'string') {
    const v = fn(o[k]);
    if (v === undefined) delete o[k]; else o[k] = v;
  }
}

/** The params of behaviour `use` that name a node. */
export function behaviourRefKeys(reg, use) {
  const d = reg.behaviours?.get(use);
  return d ? Object.entries(d.params).filter(([, p]) => p.nodeRef).map(([k]) => k) : [];
}

/**
 * A node's references rewritten (a copy; the node itself isn't changed): its props, its behaviours' params, and an
 * instance's override values (by each inner node's type, which `innerOf(local)` gives).
 * @param {any} reg @param {any} node @param {(ref: string) => string | undefined} fn
 * @param {{ innerOf?: (local: string) => any }} [o]
 */
export function mapNodeRefs(reg, node, fn, { innerOf = () => null } = {}) {
  const n = clone(node);
  mapRefs(n.props, refPaths(reg, n.type), fn);
  for (const b of n.behaviours ?? []) {
    if (!plain(b)) continue;
    for (const k of behaviourRefKeys(reg, b.use)) if (typeof b[k] === 'string') { const v = fn(b[k]); if (v === undefined) delete b[k]; else b[k] = v; }
  }
  for (const [local, ov] of Object.entries(n.overrides ?? {})) {
    const inner = innerOf(local);
    if (!inner || !plain(ov)) continue;
    mapRefs(ov.props, refPaths(reg, inner.type), fn);
    for (const b of Array.isArray(ov.behaviours) ? ov.behaviours : []) {
      if (!plain(b)) continue;
      for (const k of behaviourRefKeys(reg, b.use)) if (typeof b[k] === 'string') { const v = fn(b[k]); if (v === undefined) delete b[k]; else b[k] = v; }
    }
  }
  return n;
}

/**
 * A connection's node arguments rewritten (a copy): those the target's action marks `nodeRef`. `target` is the node the
 * connection calls (for its surface), or null when it can't be resolved (arguments then kept as they are).
 */
export function mapArgRefs(reg, c, target, fn) {
  if (!c.args) return undefined;
  const defs = target ? reg.surface(target).actions?.[c.call]?.args ?? {} : {};
  const args = {};
  for (const [k, v] of Object.entries(c.args)) {
    if (!defs[k]?.nodeRef || typeof v !== 'string') { args[k] = clone(v); continue; }
    const r = fn(v);
    if (r !== undefined) args[k] = r;
  }
  return args;
}
