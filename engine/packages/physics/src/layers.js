// Named collision layers (vrmxg.json "physics.layers"), up to 16, mapped to Rapier's interaction
// groups: 16 bits of membership, 16 bits of filter. Two colliders touch when each one's membership
// is in the other's filter.
//
//   "physics": { "layers": ["default", "player", "npc", "prop", "trigger"],
//                "collides": { "trigger": ["player", "npc"], "player": ["default", "prop", "trigger"] } }
//
// A layer missing from "collides" collides with every layer. Layer names are what scenes and
// queries use; the bits never leave this file.

export const DEFAULT_LAYERS = ['default'];

export class Layers {
  /** @param {{ layers?: string[], collides?: Record<string, string[]> }} [config] */
  constructor(config = {}) {
    this.names = config.layers?.length ? [...config.layers] : [...DEFAULT_LAYERS];
    if (this.names.length > 16) throw new Error(`at most 16 collision layers (got ${this.names.length})`);
    this.collides = config.collides ?? {};
    for (const [k, v] of Object.entries(this.collides)) for (const n of [k, ...v]) this.bit(n);
  }

  /** The bit for a layer name. */
  bit(name) {
    const i = this.names.indexOf(name);
    if (i < 0) throw new Error(`unknown collision layer "${name}" (layers: ${this.names.join(', ')})`);
    return 1 << i;
  }

  /** Bits of several layers. */
  mask(names) { return names.reduce((m, n) => m | this.bit(n), 0); }

  /** Rapier interaction groups for a collider on `layer`: membership << 16 | filter. */
  groups(layer = this.names[0]) {
    const filter = this.collides[layer] ? this.mask(this.collides[layer]) : 0xffff;
    return ((this.bit(layer) << 16) | filter) >>> 0;
  }

  /** Groups for a query that should hit `layers` (all by default). */
  queryGroups(layers) {
    const m = layers ? this.mask(layers) : 0xffff;
    return ((0xffff << 16) | m) >>> 0;
  }
}
