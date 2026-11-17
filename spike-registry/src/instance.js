// Flattening: expand every Instance into the nodes of its prefab, applying overrides by inner node
// id. Inner ids become "<instance>/<inner>", nested instances "<a>/<b>/<inner>", so every node in a
// running scene has a stable, unique address for MCP, undo and snapshots. Prefab roots are parented
// to the Instance node, which keeps its own transform.

// Behaviours merge by their `use` name, never by position: overriding { use: 'hinge', locked: true }
// changes only `locked` on the prefab's hinge and keeps its other params. A behaviour the prefab
// doesn't have is appended; `{ use: 'x', remove: true }` drops one. Other arrays (vectors, tags)
// replace whole.
function mergeBehaviours(base = [], over = []) {
  const out = base.map((b) => ({ ...b }));
  for (const o of over) {
    const i = out.findIndex((b) => b.use === o.use);
    if (o.remove) { if (i >= 0) out.splice(i, 1); continue; }
    if (i >= 0) out[i] = { ...out[i], ...o }; else out.push({ ...o });
  }
  return out;
}

function deepMerge(base, over, key) {
  if (key === 'behaviours' && Array.isArray(over)) return mergeBehaviours(base, over);
  if (Array.isArray(over) || over === null || typeof over !== 'object') return over;
  const out = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
  for (const [k, v] of Object.entries(over)) out[k] = deepMerge(out[k], v, k);
  return out;
}

/**
 * @param doc      the scene
 * @param prefabs  Map ref -> parsed .vrmxs document
 * @returns { nodes, connections } with instance contents inlined
 */
export function flatten(doc, prefabs, prefix = '', depth = 0, stack = []) {
  if (depth > 16) throw new Error(`instances nested more than 16 deep at ${prefix}`);
  const assets = new Map((doc.assets ?? []).map((a) => [a.id, a]));
  const nodes = [], connections = [];
  const pid = (id) => (id === undefined ? undefined : prefix + id);
  for (const n of doc.nodes) {
    const copy = { ...n, id: pid(n.id), ...(n.parent !== undefined ? { parent: pid(n.parent) } : {}) };
    nodes.push(copy);
    if (n.type !== 'Instance') continue;
    const ref = assets.get(n.asset)?.ref;
    if (stack.includes(ref)) throw new Error(`instance cycle: ${[...stack, ref].join(' -> ')}`);
    const prefab = prefabs.get(ref);
    if (!prefab) throw new Error(`prefab ${ref} not loaded`);
    const inner = flatten(prefab, prefabs, `${copy.id}/`, depth + 1, [...stack, ref]);
    for (const m of inner.nodes) {
      if (m.parent === undefined) m.parent = copy.id; // prefab roots hang under the Instance
      const local = m.id.slice(copy.id.length + 1);   // "hinge" or "frame/hinge"
      if (n.overrides?.[local]) Object.assign(m, deepMerge(m, n.overrides[local]), { id: m.id, type: m.type, parent: m.parent });
      nodes.push(m);
    }
    connections.push(...inner.connections);
  }
  for (const c of doc.connections ?? []) connections.push({ ...c, from: pid(c.from), to: pid(c.to) });
  return { nodes, connections };
}
