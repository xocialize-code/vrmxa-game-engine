// Dressing the cast at play (CLOSET.md §5.5 through the "closet" service, @vrmxg/closet): a role cast with one of
// her outfits wears it from the first step. The closet service swaps the body on a fixed later step, so a run that
// dresses the same cast lands the same swap on the same step.

/**
 * Put on each role's outfit, where it isn't what her bundle already has on. Call after `closet.prepare(doc)` and
 * instantiate, before the first step.
 * @param {any} tree a SceneTree with the "closet" service @param {any} doc the composed sequence document
 * @returns {{ role: string, outfit: string, at: number }[]} what was put on, and on which step it takes effect
 */
export function dressCast(tree, doc) {
  const closet = tree.services.get('closet');
  const out = [];
  for (const [id, r] of Object.entries(doc.sequence?.roles ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const outfit = /** @type {any} */ (r).wardrobe?.outfit;
    if (!outfit) continue;
    if (!closet) throw new Error(`${id} is cast in an outfit: install the closet service (@vrmxg/closet) to dress her`);
    if (closet.closetOf(id)?.worn?.outfit === outfit) continue;
    const actor = tree.find(id);
    if (!actor) throw new Error(`the cast names ${id}, which isn't in the tree`);
    out.push({ role: id, outfit, at: closet.applyOutfit(actor, outfit).at });
  }
  return out;
}
