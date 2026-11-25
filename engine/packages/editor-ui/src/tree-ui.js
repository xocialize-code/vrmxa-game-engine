// The scene tree's search and folding (M5 W6, AB-T-0607 item 1), as plain functions over the tree the panel draws:
// items { id, type, label, children, inner?, overridden? }.
//
// The search keeps every row that matches and the rows above it, so a match is seen where it lives. Words match a row's
// name, id or label (case-insensitive, every word); `type:Collider` matches the node type (a prefix: `type:light` finds
// the lights), and `is:overridden` the rows a prefab instance overrides.

/** A search's terms: { words, types, overridden }. */
export function parseTreeQuery(query) {
  const words = [], types = [];
  let overridden = false;
  for (const t of String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean)) {
    if (t.startsWith('type:') && t.length > 5) types.push(t.slice(5));
    else if (t === 'is:overridden') overridden = true;
    else words.push(t);
  }
  return { words, types, overridden };
}

/** Does one row match a parsed search? */
export function rowMatches(item, q) {
  const hay = `${item.label ?? ''} ${item.id ?? ''}`.toLowerCase();
  const type = String(item.type ?? '').toLowerCase();
  return q.words.every((w) => hay.includes(w)) && q.types.every((t) => type.startsWith(t)) && (!q.overridden || !!item.overridden);
}

/**
 * The tree a search leaves: rows that match (marked `match: true`) and their ancestors, each with only the children
 * that lead to a match; an empty search gives the tree back as it is. → { items, matches }
 * @param {any[]} items @param {string} query
 */
export function filterTree(items, query) {
  const q = parseTreeQuery(query);
  if (!q.words.length && !q.types.length && !q.overridden) return { items, matches: null };
  let matches = 0;
  const walk = (list) => list.flatMap((it) => {
    const kids = walk(it.children ?? []);
    const match = rowMatches(it, q);
    if (match) matches++;
    return match || kids.length ? [{ ...it, children: kids, match }] : [];
  });
  return { items: walk(items), matches };
}

/**
 * Fold the tree: a folded row keeps its children out of the drawn tree (and says how many it holds, `folded: n`). A
 * prefab instance's inner nodes start folded (`open` lists the instances opened); other rows start open (`closed`
 * lists the rows folded). While searching nothing is folded: every match shows.
 * @param {any[]} items @param {{ open?: Set<string>, closed?: Set<string>, searching?: boolean }} o
 */
export function foldTree(items, { open = new Set(), closed = new Set(), searching = false } = {}) {
  const count = (list) => list.reduce((n, it) => n + 1 + count(it.children ?? []), 0);
  return items.map((it) => {
    const kids = it.children ?? [];
    const instance = kids.length > 0 && kids.every((c) => c.inner) && !it.inner;
    const isFolded = !searching && kids.length > 0 && (instance ? !open.has(it.id) : closed.has(it.id));
    return { ...it, children: isFolded ? [] : foldTree(kids, { open, closed, searching }), folded: isFolded ? count(kids) : 0, canFold: kids.length > 0, instance };
  });
}
