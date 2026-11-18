// The inventory service ("inventory"): items a character took that don't go into a closet (VRMXI §9 "taking without
// the closet": a key, a coin, a note). Game data keyed by the item's id; part of the world snapshot.
export class InventoryService {
  constructor() { /** @type {Map<string, Array<{ id: string, name: string, type: string, ref: string | null, tags: string[] }>>} */ this.held = new Map(); }

  /** Put an Item node's item into a character's inventory. */
  add(actorId, item) {
    const list = this.held.get(actorId) ?? [];
    list.push({ id: item.manifest.id, name: item.manifest.name, type: item.manifest.type, ref: item.file?.ref ?? null, tags: [...(item.manifest.tags ?? [])] });
    this.held.set(actorId, list);
    return list.at(-1);
  }
  list(actorId) { return [...(this.held.get(actorId) ?? [])]; }
  has(actorId, itemId) { return (this.held.get(actorId) ?? []).some((e) => e.id === itemId); }

  getState() { return Object.fromEntries([...this.held].map(([k, v]) => [k, structuredClone(v)])); }
  setState(s) { this.held = new Map(Object.entries(structuredClone(s))); }
}
